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

import { GoogleGenAI, Modality } from "@google/genai";

export type GeminiMessage =
  | { type: "audio"; data: Buffer }
  | { type: "input_transcript"; text: string }
  | { type: "output_transcript"; text: string };

/**
 * Creates a new Gemini Live API session with native audio capabilities.
 *
 * The session uses the native audio model which handles both speech
 * understanding (STT) and response generation (TTS) in a single session.
 * Transcription is enabled for both input and output so the server can
 * build a conversation transcript.
 */
export async function createLiveSession(apiKey: string, systemPrompt: string): Promise<any> {
  const ai = new GoogleGenAI({ apiKey });

  const session = await ai.live.connect({
    model: "gemini-2.5-flash-native-audio-preview-12-2025",
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
    callbacks: {
      onopen: () => console.log("Gemini Live session opened"),
      onclose: () => console.log("Gemini Live session closed"),
      onerror: (error: any) => console.error("Gemini Live error:", error),
      onmessage: (msg: any) => {
        // Messages are handled via the async iterator in receiveMessages
      },
    },
  });

  return session;
}

/**
 * Sends a chunk of PCM 16kHz audio to the Gemini Live session.
 */
export async function sendAudioChunk(session: any, pcm16kBuffer: Buffer): Promise<void> {
  await session.sendRealtimeInput({
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
export async function* receiveMessages(session: any): AsyncGenerator<GeminiMessage> {
  // Use the session's async iterator if available
  if (session[Symbol.asyncIterator]) {
    for await (const msg of session) {
      // Audio response from Gemini (PCM 24kHz)
      if (msg.serverContent?.modelTurn?.parts) {
        for (const part of msg.serverContent.modelTurn.parts) {
          if (part.inlineData?.data) {
            yield {
              type: "audio",
              data: Buffer.from(part.inlineData.data, "base64"),
            };
          }
        }
      }

      // Input transcription (what the user said)
      if (msg.serverContent?.inputTranscription?.text) {
        yield {
          type: "input_transcript",
          text: msg.serverContent.inputTranscription.text,
        };
      }

      // Output transcription (what the agent said)
      if (msg.serverContent?.outputTranscription?.text) {
        yield {
          type: "output_transcript",
          text: msg.serverContent.outputTranscription.text,
        };
      }
    }
  }
}
