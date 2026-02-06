/**
 * Core Plivo WebSocket stream handler.
 *
 * Handles the bidirectional audio stream between Plivo and Gemini Live API:
 *
 * 1. Plivo sends 'start' event  -> create Gemini session, start receive loop
 * 2. Plivo sends 'media' events -> convert mulaw->PCM, forward to Gemini
 * 3. Gemini sends audio back    -> convert PCM->mulaw, send 'playAudio' to Plivo
 * 4. Plivo sends 'stop' event   -> close session, POST transcript for evaluation
 */

import type { FastifyRequest } from "fastify";
import type { WebSocket } from "ws";
import { mulawToPcm16k, pcm24kToMulaw } from "./audio-converter.js";
import { sendAudioChunk, receiveMessages } from "./gemini-live.js";
import { sessionManager } from "./session-manager.js";

/**
 * Handles a Plivo bidirectional audio WebSocket connection.
 *
 * Called by the Fastify WebSocket route when Plivo connects.
 * Parses incoming JSON messages as Plivo events and delegates accordingly.
 */
export function handlePlivoStream(socket: WebSocket, req: FastifyRequest): void {
  let currentStreamId: string | undefined;

  console.log("[StreamHandler] Plivo WebSocket connected");

  socket.on("message", async (data: Buffer | string) => {
    try {
      const message = JSON.parse(typeof data === "string" ? data : data.toString("utf-8"));

      switch (message.event) {
        case "start":
          await handleStart(socket, req, message);
          break;
        case "media":
          await handleMedia(message);
          break;
        case "stop":
          await handleStop(message);
          break;
        default:
          console.log(`[StreamHandler] Unknown event: ${message.event as string}`);
      }

      // Track the current streamId for cleanup on disconnect
      if (message.event === "start") {
        currentStreamId = message.start.streamId;
      } else if (message.streamId) {
        currentStreamId = message.streamId;
      }
    } catch (err) {
      console.error("[StreamHandler] Error processing message:", err);
    }
  });

  socket.on("close", async () => {
    console.log("[StreamHandler] Plivo WebSocket closed");
    if (currentStreamId) {
      await sessionManager.destroySession(currentStreamId);
    }
  });

  socket.on("error", (err) => {
    console.error("[StreamHandler] WebSocket error:", err);
  });
}

/**
 * Handles the Plivo 'start' event.
 *
 * Creates a Gemini Live session and starts a concurrent receive loop
 * that forwards Gemini audio responses back to the Plivo caller.
 */
async function handleStart(
  socket: WebSocket,
  req: FastifyRequest,
  message: {
    event: "start";
    start: {
      streamId: string;
      callId: string;
      accountId: string;
      from: string;
      to: string;
      codec: string;
    };
  }
): Promise<void> {
  const { streamId, callId } = message.start;

  const requestProtocol = (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
  const requestHost = req.headers.host ?? "localhost";
  const requestUrl = req.raw.url ?? "/ws";

  const parsedUrl = new URL(requestUrl, `${requestProtocol}://${requestHost}`);
  const agentId = parsedUrl.searchParams.get("agent_id") ?? "unknown";
  const agentName = parsedUrl.searchParams.get("agent_name") ?? undefined;

  console.log(`[StreamHandler] Stream started: streamId=${streamId}, callId=${callId}`);

  try {
    const sessionData = await sessionManager.createSession(streamId, callId, agentId, agentName);

    // Start the concurrent receive loop in the background.
    // This async function runs for the lifetime of the Gemini session,
    // forwarding audio responses back to the Plivo caller.
    startReceiveLoop(socket, streamId, sessionData.geminiSession);
  } catch (err) {
    console.error("[StreamHandler] Failed to create Gemini session:", err);
  }
}

/**
 * Handles the Plivo 'media' event.
 *
 * Converts the mu-law 8kHz audio payload to PCM 16kHz and
 * sends it to the Gemini Live session for processing.
 */
async function handleMedia(message: {
  event: "media";
  media: {
    contentType: string;
    sampleRate: number;
    payload: string;
    timestamp: string;
  };
  streamId: string;
}): Promise<void> {
  const { streamId } = message;
  const { payload } = message.media;

  const sessionData = sessionManager.getSession(streamId);
  if (!sessionData) {
    console.warn(`[StreamHandler] No session found for streamId=${streamId}, ignoring media`);
    return;
  }

  try {
    // Convert Plivo mu-law 8kHz -> PCM 16kHz for Gemini
    const pcm16kBuffer = mulawToPcm16k(payload);

    // Forward audio to Gemini Live session
    await sendAudioChunk(sessionData.geminiSession, pcm16kBuffer);
  } catch (err) {
    console.error("[StreamHandler] Error processing media chunk:", err);
  }
}

/**
 * Handles the Plivo 'stop' event.
 *
 * Destroys the Gemini session and posts the collected transcript
 * to the Litmus API for evaluation.
 */
async function handleStop(message: { event: "stop"; streamId: string }): Promise<void> {
  const { streamId } = message;

  console.log(`[StreamHandler] Stream stopped: streamId=${streamId}`);

  const sessionData = sessionManager.getSession(streamId);
  if (!sessionData) {
    return;
  }

  const transcript = sessionManager.getTranscript(streamId);

  // Destroy the Gemini session
  await sessionManager.destroySession(streamId);

  // POST transcript to the Litmus Next.js app for Gemini evaluation
  const litmusApiUrl = process.env.LITMUS_API_URL;
  if (litmusApiUrl && transcript.length > 0) {
    try {
      const durationSeconds = Math.round((Date.now() - sessionData.startTime.getTime()) / 1000);
      const normalizedTranscript = transcript.map((entry) => ({
        role: entry.role,
        text: entry.text,
        timestamp: Number.isFinite(Date.parse(entry.timestamp))
          ? Date.parse(entry.timestamp)
          : Date.now(),
      }));

      const response = await fetch(`${litmusApiUrl}/api/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "voice",
          task_description: `Voice evaluation conversation for ${sessionData.agentName ?? `agent ${sessionData.agentId}`}`,
          call_uuid: sessionData.callId,
          duration_seconds: durationSeconds,
          transcript: normalizedTranscript,
        }),
      });

      if (!response.ok) {
        console.error(
          `[StreamHandler] Evaluate API returned ${response.status}: ${await response.text()}`
        );
      } else {
        console.log(
          `[StreamHandler] Transcript posted for evaluation, callId=${sessionData.callId}`
        );
      }
    } catch (err) {
      console.error("[StreamHandler] Failed to POST transcript:", err);
    }
  } else if (!litmusApiUrl) {
    console.warn("[StreamHandler] LITMUS_API_URL not set, skipping evaluation POST");
  }
}

/**
 * Starts an async receive loop that listens for Gemini Live responses
 * and forwards them back to the Plivo caller.
 *
 * This runs concurrently for the lifetime of the Gemini session.
 * Audio responses are converted from PCM 24kHz to mu-law 8kHz
 * and sent as Plivo 'playAudio' events. Transcriptions are stored
 * in the session transcript log.
 */
function startReceiveLoop(
  socket: WebSocket,
  streamId: string,
  geminiSession: import("./gemini-live.js").LiveSession
): void {
  (async () => {
    try {
      for await (const msg of receiveMessages(geminiSession)) {
        // Check that the socket is still open before sending
        if (socket.readyState !== socket.OPEN) {
          console.log("[StreamHandler] Socket closed, stopping receive loop");
          break;
        }

        switch (msg.type) {
          case "audio": {
            // Convert Gemini PCM 24kHz -> mu-law 8kHz for Plivo
            const mulawBase64 = pcm24kToMulaw(msg.data);

            // Send playAudio event to Plivo
            const playAudioEvent = JSON.stringify({
              event: "playAudio",
              media: {
                contentType: "audio/x-mulaw",
                sampleRate: 8000,
                payload: mulawBase64,
              },
            });

            socket.send(playAudioEvent);
            break;
          }

          case "input_transcript": {
            console.log(`[StreamHandler] User said: ${msg.text}`);
            sessionManager.addTranscript(streamId, "user", msg.text);
            break;
          }

          case "output_transcript": {
            console.log(`[StreamHandler] Agent said: ${msg.text}`);
            sessionManager.addTranscript(streamId, "agent", msg.text);
            break;
          }
        }
      }
    } catch (err) {
      console.error("[StreamHandler] Receive loop error:", err);
    }

    console.log(`[StreamHandler] Receive loop ended for streamId=${streamId}`);
  })();
}
