import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
import { AgentSearch } from "@/components/agent-search";
import { AgentCard } from "@/components/agent-card";
import { Button } from "@/components/ui/button";
import { DEFAULT_PAGE_SIZE } from "@/lib/utils/constants";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AgentsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  // Parse URL parameters
  const query = typeof params.query === "string" ? params.query : undefined;
  const category = typeof params.category === "string" ? params.category : undefined;
  const sort_by = typeof params.sort_by === "string" ? params.sort_by : "overall_score";
  const sort_order = typeof params.sort_order === "string" ? params.sort_order : "desc";
  const page = typeof params.page === "string" ? parseInt(params.page, 10) : 1;

  const supabase = createServerClient();

  // Build the base query
  let agentsQuery = supabase
    .from("agents")
    .select("id, slug, name, vendor, category, overall_score, total_evaluations, capabilities");

  // Apply text search if query is provided
  if (query) {
    agentsQuery = agentsQuery.textSearch("fts", query);
  }

  // Apply category filter if provided
  if (category) {
    agentsQuery = agentsQuery.eq("category", category);
  }

  // Apply sorting
  agentsQuery = agentsQuery.order(sort_by, { ascending: sort_order === "asc" });

  // Apply pagination
  const from = (page - 1) * DEFAULT_PAGE_SIZE;
  const to = from + DEFAULT_PAGE_SIZE - 1;
  agentsQuery = agentsQuery.range(from, to);

  // Build count query in parallel
  let countQuery = supabase.from("agents").select("id", { count: "exact", head: true });

  if (query) {
    countQuery = countQuery.textSearch("fts", query);
  }

  if (category) {
    countQuery = countQuery.eq("category", category);
  }

  // Execute both queries in parallel
  const [dataResult, countResult] = await Promise.all([agentsQuery, countQuery]);
  const { data: agents, error } = dataResult;
  const { count } = countResult;

  if (error) {
    console.error("Error fetching agents:", error);
  }

  const totalPages = count ? Math.ceil(count / DEFAULT_PAGE_SIZE) : 0;

  // Build pagination URLs
  const buildPaginationUrl = (newPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (category) params.set("category", category);
    if (sort_by !== "overall_score") params.set("sort_by", sort_by);
    if (sort_order !== "desc") params.set("sort_order", sort_order);
    if (newPage !== 1) params.set("page", newPage.toString());
    return `/agents${params.toString() ? `?${params.toString()}` : ""}`;
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-8">
      <h1 className="text-4xl font-bold mb-8">AI Agent Directory</h1>

      <AgentSearch />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
        {agents && agents.length > 0 ? (
          agents.map((agent) => (
            <AgentCard
              key={agent.id}
              slug={agent.slug}
              name={agent.name}
              vendor={agent.vendor}
              category={agent.category}
              overall_score={agent.overall_score}
              total_evaluations={agent.total_evaluations}
              capabilities={agent.capabilities}
            />
          ))
        ) : (
          <p className="col-span-full text-center text-muted-foreground">No agents found.</p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-8">
          <Button asChild variant="outline" disabled={page <= 1}>
            <Link href={buildPaginationUrl(page - 1)}>Previous</Link>
          </Button>

          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>

          <Button asChild variant="outline" disabled={page >= totalPages}>
            <Link href={buildPaginationUrl(page + 1)}>Next</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
