/**
 * Gemini Live API session management.
 *
 * Provides functions to create a live audio session with Gemini,
 * send audio chunks, and receive responses (audio + transcriptions).
 *
 * The Live API maintains a persistent bidirectional WebSocket connection
 * that processes audio input and generates audio output in real-time.
 *
 * Audio input format:  PCM 16-bit, 16kHz, mono
 * Audio output format: PCM 16-bit, 24kHz, mono
 */

import { GoogleGenAI, Modality, type Session } from "@google/genai";

export type GeminiMessage =
  | { type: "audio"; data: Buffer }
  | { type: "input_transcript"; text: string }
  | { type: "output_transcript"; text: string };

/**
 * Wraps a Gemini Live Session with an async message queue.
 *
 * The @google/genai SDK delivers messages via an onmessage callback.
 * This class bridges those callbacks into an async generator so the
 * rest of the codebase can consume messages with `for await...of`.
 */
export class LiveSession {
  readonly session: Session;
  private queue: GeminiMessage[] = [];
  private resolve: ((value: void) => void) | null = null;
  private ended = false;

  constructor(session: Session) {
    this.session = session;
  }

  /** Called by the onmessage callback to enqueue a parsed message. */
  enqueue(msg: GeminiMessage): void {
    this.queue.push(msg);
    if (this.resolve) {
      this.resolve();
      this.resolve = null;
    }
  }

  /** Signals that no more messages will arrive. */
  end(): void {
    this.ended = true;
    if (this.resolve) {
      this.resolve();
      this.resolve = null;
    }
  }

  /** Async generator yielding queued messages. */
  async *receive(): AsyncGenerator<GeminiMessage> {
    while (true) {
      while (this.queue.length > 0) {
        yield this.queue.shift()!;
      }
      if (this.ended) return;
      await new Promise<void>((r) => {
        this.resolve = r;
      });
    }
  }

  async close(): Promise<void> {
    this.end();
    await this.session.close();
  }
}

/**
 * Creates a new Gemini Live API session with native audio capabilities.
 *
 * The session uses the native audio model which handles both speech
 * understanding (STT) and response generation (TTS) in a single session.
 * Transcription is enabled for both input and output so the server can
 * build a conversation transcript.
 */
export async function createLiveSession(apiKey: string, systemPrompt: string): Promise<LiveSession> {
  const ai = new GoogleGenAI({ apiKey });

  const liveSession = new LiveSession(null as unknown as Session);

  const session = await ai.live.connect({
    model: "gemini-2.5-flash-native-audio-preview-12-2025",
    callbacks: {
      onmessage(msg) {
        // Audio response from Gemini (PCM 24kHz)
        if (msg.serverContent?.modelTurn?.parts) {
          for (const part of msg.serverContent.modelTurn.parts) {
            if (part.inlineData?.data) {
              liveSession.enqueue({
                type: "audio",
                data: Buffer.from(part.inlineData.data, "base64"),
              });
            }
          }
        }

        // Input transcription (what the user said)
        if (msg.serverContent?.inputTranscription?.text) {
          liveSession.enqueue({
            type: "input_transcript",
            text: msg.serverContent.inputTranscription.text,
          });
        }

        // Output transcription (what the agent said)
        if (msg.serverContent?.outputTranscription?.text) {
          liveSession.enqueue({
            type: "output_transcript",
            text: msg.serverContent.outputTranscription.text,
          });
        }
      },
      onclose() {
        liveSession.end();
      },
      onerror(e) {
        console.error("[GeminiLive] WebSocket error:", e);
        liveSession.end();
      },
    },
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: systemPrompt,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: "Kore",
          },
        },
      },
    },
  });

  // Patch the actual session in after connect resolves
  (liveSession as { session: Session }).session = session;

  return liveSession;
}

/**
 * Sends a chunk of PCM 16kHz audio to the Gemini Live session.
 */
export async function sendAudioChunk(liveSession: LiveSession, pcm16kBuffer: Buffer): Promise<void> {
  await liveSession.session.sendRealtimeInput({
    audio: {
      data: pcm16kBuffer.toString("base64"),
      mimeType: "audio/pcm;rate=16000",
    },
  });
}

/**
 * Async generator that yields messages from the Gemini Live session.
 *
 * Message types:
 * - "audio": PCM 24kHz audio data from Gemini's response
 * - "input_transcript": Transcription of what the user said
 * - "output_transcript": Transcription of what Gemini said
 */
export async function* receiveMessages(liveSession: LiveSession): AsyncGenerator<GeminiMessage> {
  yield* liveSession.receive();
}
