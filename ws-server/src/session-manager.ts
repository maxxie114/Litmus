/**
 * Active session tracking for concurrent Plivo <-> Gemini Live connections.
 *
 * Each Plivo audio stream gets a unique streamId. This module maps
 * streamIds to their corresponding Gemini Live sessions, transcripts,
 * and metadata so the stream handler can look up state by streamId.
 *
 * Exports a singleton instance used across the application.
 */

import { type LiveSession, createLiveSession } from "./gemini-live.js";
import { getAgentSystemPrompt } from "./prompts.js";

export interface TranscriptEntry {
  role: "user" | "agent";
  text: string;
  timestamp: string;
}

export interface SessionData {
  geminiSession: LiveSession;
  transcript: TranscriptEntry[];
  callId: string;
  agentId: string;
  agentName?: string;
  startTime: Date;
}

class SessionManager {
  private sessions: Map<string, SessionData> = new Map();

  /**
   * Creates a new Gemini Live session and stores it keyed by streamId.
   * The Gemini API key is read from the GEMINI_API_KEY environment variable.
   */
  async createSession(
    streamId: string,
    callId: string,
    agentId: string,
    agentName?: string
  ): Promise<SessionData> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }

    const systemPrompt = getAgentSystemPrompt(agentId, agentName);
    const geminiSession = await createLiveSession(apiKey, systemPrompt);

    const sessionData: SessionData = {
      geminiSession,
      transcript: [],
      callId,
      agentId,
      agentName,
      startTime: new Date(),
    };

    this.sessions.set(streamId, sessionData);
    console.log(
      `[SessionManager] Created session for streamId=${streamId}, callId=${callId}, agentId=${agentId}, agentName=${agentName ?? "unknown"}`
    );

    return sessionData;
  }

  /**
   * Retrieves session data by streamId.
   * Returns undefined if no session exists for that streamId.
   */
  getSession(streamId: string): SessionData | undefined {
    return this.sessions.get(streamId);
  }

  /**
   * Closes the Gemini Live session and removes it from the map.
   */
  async destroySession(streamId: string): Promise<void> {
    const sessionData = this.sessions.get(streamId);
    if (sessionData) {
      try {
        await sessionData.geminiSession.close();
        console.log(`[SessionManager] Closed Gemini session for streamId=${streamId}`);
      } catch (err) {
        console.error(
          `[SessionManager] Error closing Gemini session for streamId=${streamId}:`,
          err
        );
      }
      this.sessions.delete(streamId);
    }
  }

  /**
   * Appends a transcript entry to the session's conversation log.
   */
  addTranscript(streamId: string, role: "user" | "agent", text: string): void {
    const sessionData = this.sessions.get(streamId);
    if (sessionData) {
      sessionData.transcript.push({
        role,
        text,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Returns the full transcript array for a given session.
   * Returns an empty array if the session does not exist.
   */
  getTranscript(streamId: string): TranscriptEntry[] {
    const sessionData = this.sessions.get(streamId);
    return sessionData ? sessionData.transcript : [];
  }
}

/** Singleton session manager instance. */
export const sessionManager = new SessionManager();
