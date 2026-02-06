/**
 * Audio format conversion utilities for the Plivo <-> Gemini Live API pipeline.
 *
 * Plivo streams audio as mu-law 8kHz mono.
 * Gemini Live API expects PCM 16-bit 16kHz mono input
 * and outputs PCM 16-bit 24kHz mono.
 *
 * This module handles both directions of conversion using the wavefile library.
 */

import wavefile from "wavefile";
const { WaveFile } = wavefile;

/**
 * Converts base64-encoded mu-law 8kHz audio (from Plivo) to PCM 16-bit 16kHz (for Gemini).
 *
 * Steps:
 * 1. Decode the base64 payload into raw mu-law bytes.
 * 2. Create a WaveFile with the mu-law data at 8kHz.
 * 3. Decode mu-law to linear PCM (16-bit).
 * 4. Resample from 8kHz to 16kHz.
 * 5. Return the raw PCM sample buffer.
 */
export function mulawToPcm16k(mulawBase64: string): Buffer {
  const mulawBytes = Buffer.from(mulawBase64, "base64");

  const wav = new WaveFile();

  // Create a wav from raw mu-law samples: 8kHz, 8-bit mu-law, mono
  wav.fromScratch(1, 8000, "8m", mulawBytes);

  // Decode mu-law to linear PCM 16-bit
  wav.fromMuLaw();

  // Resample from 8kHz to 16kHz
  wav.toSampleRate(16000);

  // Extract raw PCM sample data (skip WAV header)
  const samples = (wav.data as { samples: Uint8Array }).samples;
  return Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
}

/**
 * Converts PCM 16-bit 24kHz audio (from Gemini) to base64-encoded mu-law 8kHz (for Plivo).
 *
 * Steps:
 * 1. Create a WaveFile from the raw PCM buffer at 24kHz.
 * 2. Resample from 24kHz to 8kHz.
 * 3. Encode to mu-law.
 * 4. Extract the raw mu-law sample bytes.
 * 5. Return as base64 string.
 */
export function pcm24kToMulaw(pcmBuffer: Buffer): string {
  const wav = new WaveFile();

  // Create wav from raw PCM 16-bit samples at 24kHz, mono
  wav.fromScratch(1, 24000, "16", pcmBuffer);

  // Resample from 24kHz to 8kHz
  wav.toSampleRate(8000);

  // Encode to mu-law
  wav.toMuLaw();

  // Extract raw mu-law sample data
  const samples = (wav.data as { samples: Uint8Array }).samples;
  const mulawBytes = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);

  return mulawBytes.toString("base64");
}
