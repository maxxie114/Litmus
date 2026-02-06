import { z } from "zod/v4";
import { evaluateBenchmark, evaluateVoiceTranscript, generateComparison } from "@/lib/gemini/judge";
import { handleApiError, validateWithZod, ValidationError } from "@/lib/utils/errors";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { BenchmarkType } from "@/types/benchmark";
import type { TranscriptEntry } from "@/types/evaluation";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const evaluationRequestSchema = z.object({
  type: z.enum(["benchmark", "voice", "transcript", "comparison"]),
  task_description: z.string().min(1).optional(),
  agent_response: z.string().optional(),
  reference_answer: z.string().optional(),
  transcript: z
    .array(
      z.object({
        role: z.enum(["user", "agent"]),
        text: z.string(),
        timestamp: z.number(),
      })
    )
    .optional(),
  benchmark_type: z.string().optional(),
  call_uuid: z.string().optional(),
  duration_seconds: z.number().int().nonnegative().optional(),
  // Comparison-specific fields
  agents: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        scores: z.record(z.string(), z.number()),
      })
    )
    .optional(),
  use_case: z.string().optional(),
});

// ---------------------------------------------------------------------------
// POST /api/evaluate  -  Generic Gemini evaluation endpoint
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const data = validateWithZod(evaluationRequestSchema, body);

    if (data.type === "benchmark") {
      if (!data.task_description) {
        throw new ValidationError("task_description is required for benchmark evaluations");
      }
      if (!data.agent_response) {
        throw new ValidationError("agent_response is required for benchmark evaluations");
      }

      const benchmarkType = (data.benchmark_type ?? "text_qa") as BenchmarkType;

      const evaluation = await evaluateBenchmark(
        data.task_description,
        data.agent_response,
        benchmarkType,
        data.reference_answer
      );

      return Response.json({
        type: "benchmark",
        scores: evaluation.scores,
        justifications: evaluation.justifications,
        composite_score: evaluation.composite_score,
      });
    }

    if (data.type === "voice" || data.type === "transcript") {
      if (!data.task_description) {
        throw new ValidationError("task_description is required for voice/transcript evaluations");
      }
      if (!data.transcript || data.transcript.length === 0) {
        throw new ValidationError("transcript is required for voice/transcript evaluations");
      }

      const evaluation = await evaluateVoiceTranscript(
        data.transcript as TranscriptEntry[],
        data.task_description
      );

      if (data.call_uuid) {
        const serviceClient = createServiceRoleClient();
        const { data: updatedEvaluation, error: updateError } = await serviceClient
          .from("voice_evaluations")
          .update({
            transcript: data.transcript as unknown as import("@/lib/supabase/types").Json,
            scores: evaluation.scores as unknown as import("@/lib/supabase/types").Json,
            gemini_evaluation: evaluation as unknown as import("@/lib/supabase/types").Json,
            composite_score: evaluation.composite_score,
            ...(data.duration_seconds ? { duration_seconds: data.duration_seconds } : {}),
          })
          .eq("call_uuid", data.call_uuid)
          .select("id")
          .maybeSingle();

        if (updateError) {
          throw updateError;
        }

        if (!updatedEvaluation) {
          console.warn(`[evaluate] No voice_evaluations row found for call_uuid=${data.call_uuid}`);
        }
      }

      return Response.json({
        type: data.type,
        call_uuid: data.call_uuid,
        scores: evaluation.scores,
        justifications: evaluation.justifications,
        composite_score: evaluation.composite_score,
      });
    }

    if (data.type === "comparison") {
      if (!data.agents || data.agents.length < 2) {
        throw new ValidationError("At least 2 agents are required for comparison");
      }
      if (!data.use_case) {
        throw new ValidationError("use_case is required for comparison evaluations");
      }

      const recommendation = await generateComparison(data.agents, data.use_case);

      return Response.json({
        type: "comparison",
        recommendation,
      });
    }

    throw new ValidationError(`Unknown evaluation type: ${data.type}`);
  } catch (error) {
    return handleApiError(error);
  }
}
