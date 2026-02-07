import { z } from "zod/v4";
import { createServerClient } from "@/lib/supabase/server";
import { simulateAgentResponse } from "../../../../lib/gemini/sandbox";
import { evaluateBenchmark } from "@/lib/gemini/judge";
import { handleApiError, validateWithZod, ValidationError } from "@/lib/utils/errors";
import { SANDBOX_MAX_AGENTS } from "@/lib/utils/constants";
import type { BenchmarkScores } from "@/types/benchmark";

const runRequestSchema = z.object({
  agent_slugs: z.array(z.string().min(1)).min(1).max(SANDBOX_MAX_AGENTS),
  prompt: z.string().min(1),
  evaluate: z.boolean().optional().default(true),
});

function extractTextFromPayload(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim().length > 0) return payload.trim();
  if (!payload || typeof payload !== "object") return undefined;
  const data = payload as Record<string, unknown>;
  for (const key of ["response", "answer", "output", "text", "content", "message"]) {
    const v = data[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  const choices = data.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown>;
    if (typeof first.text === "string" && first.text.trim().length > 0) return first.text.trim();
    const msg = first.message as Record<string, unknown> | undefined;
    if (msg && typeof msg.content === "string" && msg.content.trim().length > 0)
      return msg.content.trim();
  }
  return undefined;
}

async function fetchFromEndpoint(apiEndpoint: string, prompt: string): Promise<string> {
  const url = new URL(apiEndpoint);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ValidationError("Agent API endpoint must use http:// or https://");
  }
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/plain; */*" },
    body: JSON.stringify({
      benchmark_type: "text_qa",
      task_description: prompt,
      input: { prompt },
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new Error(`Endpoint ${res.status}: ${text}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = await res.json();
    const text = extractTextFromPayload(payload);
    if (!text) throw new Error("Could not extract text from endpoint response");
    return text;
  }
  const raw = (await res.text()).trim();
  if (!raw) throw new Error("Endpoint returned empty body");
  return raw;
}

export type SandboxFeedback = {
  scores: BenchmarkScores;
  justifications: Record<keyof BenchmarkScores, string>;
  composite_score: number;
};

export type SandboxResult = {
  slug: string;
  name: string;
  response: string;
  error?: string;
  source: "api" | "simulated";
  feedback?: SandboxFeedback;
};

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const { agent_slugs, prompt, evaluate } = validateWithZod(runRequestSchema, body);

    const supabase = createServerClient();
    const { data: agents, error } = await supabase
      .from("agents")
      .select("slug, name, description, capabilities, vendor, api_endpoint")
      .in("slug", agent_slugs);

    if (error) throw error;
    if (!agents?.length) {
      throw new ValidationError("No agents found for the given slugs");
    }

    const ordered = agent_slugs
      .map((slug) => agents.find((a) => a.slug === slug))
      .filter(Boolean) as (typeof agents)[0][];

    let results: SandboxResult[] = await Promise.all(
      ordered.map(async (agent) => {
        const capabilities = (agent.capabilities ?? []) as string[];
        const profile = {
          name: agent.name,
          description: agent.description ?? null,
          capabilities: Array.isArray(capabilities) ? capabilities : [],
          vendor: agent.vendor,
        };

        if (agent.api_endpoint?.trim()) {
          try {
            const response = await fetchFromEndpoint(agent.api_endpoint.trim(), prompt);
            return {
              slug: agent.slug,
              name: agent.name,
              response,
              source: "api" as const,
            };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
              slug: agent.slug,
              name: agent.name,
              response: "",
              error: message,
              source: "api" as const,
            };
          }
        }

        try {
          const response = await simulateAgentResponse(profile, prompt);
          return {
            slug: agent.slug,
            name: agent.name,
            response,
            source: "simulated" as const,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            slug: agent.slug,
            name: agent.name,
            response: "",
            error: message,
            source: "simulated" as const,
          };
        }
      })
    );

    if (evaluate) {
      results = await Promise.all(
        results.map(async (r) => {
          if (r.error || !r.response.trim()) return r;
          try {
            const evaluation = await evaluateBenchmark(
              prompt,
              r.response,
              "text_qa"
            );
            return {
              ...r,
              feedback: {
                scores: evaluation.scores,
                justifications: evaluation.justifications,
                composite_score: evaluation.composite_score,
              },
            };
          } catch {
            return r;
          }
        })
      );
    }

    return Response.json({ results, use_case: prompt });
  } catch (e) {
    return handleApiError(e);
  }
}
