import { z } from "zod/v4";
import { createServerClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  handleApiError,
  validateWithZod,
  NotFoundError,
  ValidationError,
} from "@/lib/utils/errors";
import { AGENT_CATEGORIES } from "@/lib/utils/constants";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const updateAgentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  vendor: z.string().min(1).max(200).optional(),
  category: z.enum(AGENT_CATEGORIES as [string, ...string[]]).optional(),
  website_url: z.url().optional(),
  api_endpoint: z.string().optional(),
  description: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  integrations: z.array(z.string()).optional(),
  submitted_by: z.string().uuid(), // Required — must match the original submitter
});

// ---------------------------------------------------------------------------
// GET /api/agents/[slug]  -  Full agent profile with related data
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  try {
    const { slug } = await params;
    const supabase = createServerClient();

    // Fetch agent record
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (agentError) throw agentError;
    if (!agent) throw new NotFoundError("Agent");

    // Fetch related data in parallel
    const [benchmarks, voiceEvals, reviews, intelligence, verifications] = await Promise.all([
      supabase
        .from("benchmarks")
        .select("id, benchmark_type, composite_score, scores, task_description, created_at")
        .eq("agent_id", agent.id)
        .order("created_at", { ascending: false })
        .limit(20),

      supabase
        .from("voice_evaluations")
        .select("id, composite_score, scores, created_at")
        .eq("agent_id", agent.id)
        .order("created_at", { ascending: false })
        .limit(10),

      supabase
        .from("user_reviews")
        .select("id, rating, review_text, use_case, verified_usage, created_at")
        .eq("agent_id", agent.id)
        .order("created_at", { ascending: false })
        .limit(20),

      supabase
        .from("web_intelligence")
        .select("id, source_type, source_url, title, summary, sentiment, relevance_score, fetched_at")
        .eq("agent_id", agent.id)
        .order("fetched_at", { ascending: false })
        .limit(20),

      supabase.from("tool_verifications").select("id, tool_name, claimed, verified, verified_at").eq("agent_id", agent.id),
    ]);

    return Response.json({
      agent,
      benchmarks: benchmarks.data ?? [],
      voice_evaluations: voiceEvals.data ?? [],
      user_reviews: reviews.data ?? [],
      web_intelligence: intelligence.data ?? [],
      tool_verifications: verifications.data ?? [],
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/agents/[slug]  -  Update an agent (requires submitted_by match)
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  try {
    const { slug } = await params;
    const body = await request.json();
    const data = validateWithZod(updateAgentSchema, body);

    const supabase = createServiceRoleClient();

    // Verify the agent exists and the requester is the original submitter
    const { data: existing, error: fetchError } = await supabase
      .from("agents")
      .select("id, submitted_by")
      .eq("slug", slug)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existing) throw new NotFoundError("Agent");

    if (existing.submitted_by && existing.submitted_by !== data.submitted_by) {
      throw new ValidationError("Only the original submitter can update this agent");
    }

    // Build update payload (exclude submitted_by from the update)
    const { submitted_by: _submittedBy, ...updateFields } = data;
    const updatePayload: Record<string, unknown> = {
      ...updateFields,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error: updateError } = await supabase
      .from("agents")
      .update(updatePayload)
      .eq("id", existing.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return Response.json({ agent: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
