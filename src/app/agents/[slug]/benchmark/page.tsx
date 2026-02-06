import Link from "next/link";
import { notFound } from "next/navigation";
import { BenchmarkRunner } from "@/components/benchmark-runner";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BenchmarkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServerClient();

  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, slug, api_endpoint")
    .eq("slug", slug)
    .single();

  if (!agent) notFound();

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/agents" className="hover:underline">
          Agents
        </Link>
        <span>/</span>
        <Link href={`/agents/${slug}`} className="hover:underline">
          {agent.name}
        </Link>
        <span>/</span>
        <span>Benchmark</span>
      </div>
      <h1 className="text-3xl font-bold">Benchmark — {agent.name}</h1>
      <BenchmarkRunner agentSlug={slug} hasApiEndpoint={!!agent.api_endpoint} />
    </div>
  );
}
