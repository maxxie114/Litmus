import { z } from "zod/v4";
import { createServerClient, createServiceRoleClient } from "@/lib/supabase/server";
import { gatherIntelligence } from "@/lib/youcom/intelligence";
import { generateAgentProfile } from "@/lib/gemini/profiler";
import { after } from "next/server";
import { handleApiError, validateWithZod, ValidationError, UnauthorizedError } from "@/lib/utils/errors";
import { AGENT_CATEGORIES, DEFAULT_PAGE_SIZE } from "@/lib/utils/constants";
import type { AgentCategory } from "@/types/agent";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const searchParamsSchema = z.object({
  query: z.string().optional(),
  category: z.enum(AGENT_CATEGORIES as [string, ...string[]]).optional(),
  sort_by: z
    .enum(["overall_score", "total_evaluations", "created_at", "name"])
    .optional()
    .default("created_at"),
  sort_order: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().min(1).optional().default(1),
  per_page: z.coerce.number().int().min(1).max(100).optional().default(DEFAULT_PAGE_SIZE),
});

const createAgentSchema = z.object({
  name: z.string().min(1).max(200),
  vendor: z.string().min(1).max(200),
  category: z.enum(AGENT_CATEGORIES as [string, ...string[]]),
  website_url: z.url(),
  api_endpoint: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function ensureUniqueSlug(
  supabase: ReturnType<typeof createServiceRoleClient>,
  baseSlug: string
): Promise<string> {
  let slug = baseSlug;
  let suffix = 0;

  while (true) {
    const { data } = await supabase.from("agents").select("id").eq("slug", slug).maybeSingle();

    if (!data) return slug;

    suffix++;
    slug = `${baseSlug}-${suffix}`;
  }
}

// ---------------------------------------------------------------------------
// GET /api/agents  -  List & search agents with pagination
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const rawParams = Object.fromEntries(url.searchParams.entries());
    const params = validateWithZod(searchParamsSchema, rawParams);

    const supabase = createServerClient();
    const { page, per_page, sort_by, sort_order, query, category } = params;
    const offset = (page - 1) * per_page;

    // If a text search query is provided, use the Postgres full-text search function.
    if (query) {
      const { data, error } = await supabase.rpc("search_agents", {
        search_query: query,
      });

      if (error) throw error;

      let results = data ?? [];

      // Apply category filter on search results
      if (category) {
        results = results.filter((a) => a.category === category);
      }

      // Apply sorting
      results.sort((a, b) => {
        const aVal = a[sort_by as keyof typeof a];
        const bVal = b[sort_by as keyof typeof b];
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        if (aVal < bVal) return sort_order === "asc" ? -1 : 1;
        if (aVal > bVal) return sort_order === "asc" ? 1 : -1;
        return 0;
      });

      const total = results.length;
      const paged = results.slice(offset, offset + per_page);

      return Response.json({
        agents: paged,
        pagination: { page, per_page, total, total_pages: Math.ceil(total / per_page) },
      });
    }

    // Standard filtered query
    let queryBuilder = supabase.from("agents").select("id, slug, name, vendor, category, overall_score, total_evaluations, capabilities, created_at", { count: "exact" });

    if (category) {
      queryBuilder = queryBuilder.eq("category", category);
    }

    queryBuilder = queryBuilder.order(sort_by, { ascending: sort_order === "asc" });
    queryBuilder = queryBuilder.range(offset, offset + per_page - 1);

    const { data, error, count } = await queryBuilder;
    if (error) throw error;

    const total = count ?? 0;

    return Response.json({
      agents: data,
      pagination: { page, per_page, total, total_pages: Math.ceil(total / per_page) },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ---------------------------------------------------------------------------
// POST /api/agents  -  Submit a new agent
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const data = validateWithZod(createAgentSchema, body);

    // Authenticate the user
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    const supabase = createServerClient();

    if (token) {
      const { data: userData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !userData.user) {
        throw new UnauthorizedError("Invalid authentication token");
      }
    }

    // Use service role for slug check + insert (needs to bypass RLS for uniqueness check)
    const serviceClient = createServiceRoleClient();

    // Generate a unique slug from the agent name
    const baseSlug = generateSlug(data.name);
    const slug = await ensureUniqueSlug(serviceClient, baseSlug);

    const { data: agent, error } = await serviceClient
      .from("agents")
      .insert({
        slug,
        name: data.name,
        vendor: data.vendor,
        category: data.category as AgentCategory,
        website_url: data.website_url,
        api_endpoint: data.api_endpoint ?? null,
      })
      .select()
      .single();

    if (error) {
      throw new ValidationError("Failed to create agent", error);
    }

    // Schedule background tasks outside the request lifecycle
    after(async () => {
      try {
        await gatherIntelligence(data.name, data.vendor, agent.id);
      } catch (e) {
        console.error("[agents/POST] Intelligence gathering failed:", e);
      }
    });

    after(async () => {
      try {
        const profile = await generateAgentProfile(
          `Agent: ${data.name} by ${data.vendor}. Website: ${data.website_url}`,
          data.name,
          data.vendor
        );

        await serviceClient
          .from("agents")
          .update({
            description: profile.description,
            capabilities: profile.capabilities,
            integrations: profile.integrations,
            pricing_model: profile.pricing_model as unknown as import("@/lib/supabase/types").Json,
            updated_at: new Date().toISOString(),
          })
          .eq("id", agent.id);
      } catch (e) {
        console.error("[agents/POST] Profile generation failed:", e);
      }
    });

    return Response.json({ agent }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
