import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgentCard } from "@/components/agent-card";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = createServerClient();

  const { data: topAgents } = await supabase
    .from("agents")
    .select("id, slug, name, vendor, category, overall_score, total_evaluations, capabilities")
    .order("overall_score", { ascending: false, nullsFirst: false })
    .limit(6);

  const { count: agentCount } = await supabase
    .from("agents")
    .select("id", { count: "exact", head: true });

  const { count: benchmarkCount } = await supabase
    .from("benchmarks")
    .select("id", { count: "exact", head: true });

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="container mx-auto px-4 md:px-6 py-24 md:py-32 flex flex-col items-center text-center space-y-6">
        <Badge variant="secondary" className="text-sm">
          The transparent AI agent evaluation platform
        </Badge>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-3xl">
          Glassdoor for <span className="text-blue-600">AI Agents</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl">
          Live benchmarks powered by Gemini, voice evaluations via Plivo, real-time web
          intelligence, tool verification, and community reviews. Make informed decisions about AI
          agents.
        </p>
        <div className="flex gap-3">
          <Link href="/agents">
            <Button size="lg">Browse Agents</Button>
          </Link>
          <Link href="/submit">
            <Button variant="outline" size="lg">
              Submit an Agent
            </Button>
          </Link>
        </div>
        <div className="flex gap-8 pt-4 text-sm text-muted-foreground">
          <span>{agentCount ?? 0} agents tracked</span>
          <span>{benchmarkCount ?? 0} benchmarks run</span>
        </div>
      </section>

      {/* Feature highlights */}
      <section className="container mx-auto px-4 md:px-6 py-16 border-t">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              title: "Gemini-Powered Benchmarks",
              description:
                "LLM-as-judge evaluation across accuracy, coherence, helpfulness, hallucination, and completeness.",
            },
            {
              title: "Voice Evaluation",
              description:
                "Real-time voice agent testing via Plivo with live audio streaming and Gemini Live transcription.",
            },
            {
              title: "Web Intelligence",
              description:
                "Automated monitoring of changelogs, reviews, outages, and pricing changes via You.com.",
            },
          ].map((feature) => (
            <Card key={feature.title}>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Top agents */}
      {topAgents && topAgents.length > 0 && (
        <section className="container mx-auto px-4 md:px-6 py-16 border-t">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold">Top Rated Agents</h2>
            <Link href="/agents">
              <Button variant="ghost">View all</Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {topAgents.map((agent) => (
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
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="container mx-auto px-4 md:px-6 py-16 border-t">
        <div className="flex flex-col items-center text-center space-y-4">
          <h2 className="text-2xl font-bold">Compare Agents Side by Side</h2>
          <p className="text-muted-foreground max-w-lg">
            Select up to 4 agents, compare radar charts, detailed metrics, and get AI-powered
            recommendations for your use case.
          </p>
          <Link href="/compare">
            <Button size="lg">Start Comparing</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
