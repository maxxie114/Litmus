import { searchWeb, fetchContent } from "./client";
import { summarizeIntelligence } from "@/lib/gemini/profiler";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function gatherIntelligence(
  agentName: string,
  agentVendor: string,
  agentId: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  const currentYear = new Date().getFullYear();

  const queries = [
    `${agentName} changelog updates ${currentYear}`,
    `${agentName} ${agentVendor} outage issues`,
    `${agentName} review comparison`,
    `${agentVendor} AI agent pricing changes`,
    `${agentName} community feedback reddit`,
  ];

  for (const query of queries) {
    try {
      const searchResults = await searchWeb(query, { count: 5, freshness: "month" });

      // Process results in parallel per query, keep outer loop sequential for rate limits
      const settled = await Promise.allSettled(
        searchResults.results.web.slice(0, 3).map(async (result) => {
          const contentResponse = await fetchContent(result.url);
          const summary = await summarizeIntelligence(
            contentResponse.content,
            result.url,
            agentName
          );

          if (summary.relevance_score >= 0.3) {
            return {
              agent_id: agentId,
              source_type: summary.source_type,
              source_url: result.url,
              title: summary.title,
              summary: summary.summary,
              sentiment: summary.sentiment,
              relevance_score: summary.relevance_score,
              raw_data: result as unknown as import("@/lib/supabase/types").Json,
            };
          }
          return null;
        })
      );

      const toInsert = settled
        .filter((r) => r.status === "fulfilled" && r.value != null)
        .map((r) => (r as PromiseFulfilledResult<NonNullable<unknown>>).value) as {
        agent_id: string;
        source_type: string;
        source_url: string;
        title: string;
        summary: string;
        sentiment: string;
        relevance_score: number;
        raw_data: import("@/lib/supabase/types").Json;
      }[];

      if (toInsert.length > 0) {
        await supabase.from("web_intelligence").insert(toInsert);
      }
    } catch {
      // Skip individual query failures
    }
  }
}

export async function getLatestIntelligence(agentId: string, limit = 20) {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("web_intelligence")
    .select("id, source_type, source_url, title, summary, sentiment, relevance_score, fetched_at")
    .eq("agent_id", agentId)
    .order("fetched_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}
