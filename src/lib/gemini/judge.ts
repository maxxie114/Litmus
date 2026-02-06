import { getGeminiClient, MODELS } from "./client";
import type { BenchmarkScores, BenchmarkType, GeminiEvaluation } from "@/types/benchmark";
import type { TranscriptEntry } from "@/types/evaluation";
import type { VoiceEvalScores } from "@/types/voice";
import { computeBenchmarkComposite, computeVoiceComposite } from "@/lib/utils/scoring";

const BENCHMARK_EVAL_PROMPT = `You are an expert AI agent evaluator. You will receive:
1. A TASK DESCRIPTION that was given to the agent
2. The AGENT'S RESPONSE
3. A REFERENCE ANSWER (gold standard), if available

Evaluate the agent's response on each dimension below.
Return a JSON object with scores from 0-100 for each dimension.

Dimensions:
- accuracy: Does the response contain factually correct information?
- coherence: Is the response logically structured and easy to follow?
- helpfulness: Does the response actually solve the user's problem?
- hallucination: Does the response contain fabricated information? (0 = heavy hallucination, 100 = zero hallucination)
- completeness: Does the response address all aspects of the task?

Also provide a 2-sentence justification for each score.

Return ONLY valid JSON in this format:
{
  "scores": { "accuracy": N, "coherence": N, "helpfulness": N, "hallucination": N, "completeness": N },
  "justifications": { "accuracy": "...", "coherence": "...", "helpfulness": "...", "hallucination": "...", "completeness": "..." }
}`;

const VOICE_EVAL_PROMPT = `You are an expert voice agent evaluator. You will receive a transcript of a voice conversation between a user and an AI agent.

Evaluate the agent's performance on each dimension below.
Return a JSON object with scores from 0-100.

Dimensions:
- naturalness: Does the agent sound natural and conversational?
- helpfulness: Does the agent actually help the user?
- latency: Does the agent respond promptly without awkward pauses? (based on transcript timing)
- accuracy: Is the information the agent provides correct?
- tone: Is the agent's tone appropriate and professional?

Also provide a 2-sentence justification for each score.

Return ONLY valid JSON in this format:
{
  "scores": { "naturalness": N, "helpfulness": N, "latency": N, "accuracy": N, "tone": N },
  "justifications": { "naturalness": "...", "helpfulness": "...", "latency": "...", "accuracy": "...", "tone": "..." }
}`;

export async function evaluateBenchmark(
  taskDescription: string,
  agentResponse: string,
  benchmarkType: BenchmarkType,
  referenceAnswer?: string
): Promise<GeminiEvaluation> {
  const ai = getGeminiClient();

  const userContent = [
    `BENCHMARK TYPE: ${benchmarkType}`,
    `TASK DESCRIPTION: ${taskDescription}`,
    `AGENT'S RESPONSE: ${agentResponse}`,
    referenceAnswer ? `REFERENCE ANSWER: ${referenceAnswer}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await ai.models.generateContent({
    model: MODELS.FLASH,
    contents: [{ role: "user", parts: [{ text: `${BENCHMARK_EVAL_PROMPT}\n\n${userContent}` }] }],
    config: {
      responseMimeType: "application/json",
    },
  });

  const rawText = response.text ?? "{}";

  let parsed: {
    scores: BenchmarkScores;
    justifications: Record<keyof BenchmarkScores, string>;
  };

  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    console.error("[judge] Failed to parse Gemini benchmark response:", rawText.slice(0, 500), e);
    const fallbackScores: BenchmarkScores = {
      accuracy: 0,
      coherence: 0,
      helpfulness: 0,
      hallucination: 0,
      completeness: 0,
    };
    const fallbackJustification = "Evaluation failed: could not parse Gemini response.";
    return {
      scores: fallbackScores,
      justifications: {
        accuracy: fallbackJustification,
        coherence: fallbackJustification,
        helpfulness: fallbackJustification,
        hallucination: fallbackJustification,
        completeness: fallbackJustification,
      },
      composite_score: 0,
      raw_response: rawText,
    };
  }

  const scores: BenchmarkScores = {
    accuracy: parsed.scores?.accuracy ?? 0,
    coherence: parsed.scores?.coherence ?? 0,
    helpfulness: parsed.scores?.helpfulness ?? 0,
    hallucination: parsed.scores?.hallucination ?? 0,
    completeness: parsed.scores?.completeness ?? 0,
  };

  return {
    scores,
    justifications: parsed.justifications ?? {},
    composite_score: computeBenchmarkComposite(scores),
    raw_response: rawText,
  };
}

export async function evaluateVoiceTranscript(
  transcript: TranscriptEntry[],
  agentContext: string
): Promise<{
  scores: VoiceEvalScores;
  justifications: Record<keyof VoiceEvalScores, string>;
  composite_score: number;
}> {
  const ai = getGeminiClient();

  const transcriptText = transcript.map((entry) => `[${entry.role}] ${entry.text}`).join("\n");

  const response = await ai.models.generateContent({
    model: MODELS.FLASH,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${VOICE_EVAL_PROMPT}\n\nAGENT CONTEXT: ${agentContext}\n\nTRANSCRIPT:\n${transcriptText}`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  const rawText = response.text ?? "{}";

  let parsed: {
    scores: VoiceEvalScores;
    justifications: Record<keyof VoiceEvalScores, string>;
  };

  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    console.error("[judge] Failed to parse Gemini voice response:", rawText.slice(0, 500), e);
    const fallbackScores: VoiceEvalScores = {
      naturalness: 0,
      helpfulness: 0,
      latency: 0,
      accuracy: 0,
      tone: 0,
    };
    const fallbackJustification = "Evaluation failed: could not parse Gemini response.";
    return {
      scores: fallbackScores,
      justifications: {
        naturalness: fallbackJustification,
        helpfulness: fallbackJustification,
        latency: fallbackJustification,
        accuracy: fallbackJustification,
        tone: fallbackJustification,
      },
      composite_score: 0,
    };
  }

  const scores: VoiceEvalScores = {
    naturalness: parsed.scores?.naturalness ?? 0,
    helpfulness: parsed.scores?.helpfulness ?? 0,
    latency: parsed.scores?.latency ?? 0,
    accuracy: parsed.scores?.accuracy ?? 0,
    tone: parsed.scores?.tone ?? 0,
  };

  return {
    scores,
    justifications: parsed.justifications ?? {},
    composite_score: computeVoiceComposite(scores),
  };
}

export async function generateComparison(
  agentSummaries: { name: string; scores: Record<string, number>; description: string }[],
  useCase: string
): Promise<string> {
  const ai = getGeminiClient();

  const agentData = agentSummaries
    .map((a) => `- ${a.name}: ${a.description}\n  Scores: ${JSON.stringify(a.scores)}`)
    .join("\n");

  const response = await ai.models.generateContent({
    model: MODELS.FLASH,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are an AI agent advisor. Given the following agents and their benchmark scores, provide a 3-5 sentence recommendation for a user whose use case is: "${useCase}".\n\nAgents:\n${agentData}\n\nBe specific about which agent is best for this use case and why.`,
          },
        ],
      },
    ],
  });

  return response.text ?? "Unable to generate comparison.";
}
