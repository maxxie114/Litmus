import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ReviewList } from "@/components/review-list";
import { ReviewForm } from "@/components/review-form";
import { IntelligenceFeed } from "@/components/intelligence-feed";
import { ToolVerificationBadge } from "@/components/tool-verification-badge";
import { ScoreRadarLazy } from "@/components/score-radar-lazy";
import { CATEGORY_LABELS } from "@/lib/utils/constants";
import { formatScore } from "@/lib/utils/scoring";
import type { AgentCategory } from "@/types/agent";

export default async function AgentProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServerClient();

  // Fetch the agent by slug
  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id, slug, name, vendor, category, website_url, description, capabilities, integrations, overall_score")
    .eq("slug", slug)
    .single();

  if (agentError || !agent) {
    notFound();
  }

  // Fetch all related data in parallel
  const [
    { data: benchmarks },
    { data: voice_evaluations },
    { data: reviews },
    { data: intelligence },
    { data: verifications },
  ] = await Promise.all([
    supabase
      .from("benchmarks")
      .select("id, benchmark_type, composite_score, scores, created_at")
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

  // Compute average scores from benchmarks
  const avgScores: Record<string, number> = {};
  if (benchmarks && benchmarks.length > 0) {
    const scoreKeys = new Set<string>();
    benchmarks.forEach((benchmark) => {
      const scores = benchmark.scores as Record<string, number> | null;
      if (scores && typeof scores === "object") {
        Object.keys(scores).forEach((key) => scoreKeys.add(key));
      }
    });

    scoreKeys.forEach((key) => {
      const values = benchmarks
        .map((b) => {
          const scores = b.scores as Record<string, number> | null;
          return scores?.[key];
        })
        .filter((v): v is number => typeof v === "number");
      if (values.length > 0) {
        avgScores[key] = values.reduce((a, b) => a + b, 0) / values.length;
      }
    });
  }

  const totalEvaluations = (benchmarks?.length || 0) + (voice_evaluations?.length || 0);

  return (
    <div className="container mx-auto px-4 md:px-6 py-8">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-4xl font-bold mb-2">{agent.name}</h1>
            <p className="text-xl text-muted-foreground mb-2">{agent.vendor}</p>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {CATEGORY_LABELS[agent.category as AgentCategory] || agent.category}
              </Badge>
              {agent.website_url && (
                <Link
                  href={agent.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  Visit Website
                </Link>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-5xl font-bold text-primary">
              {formatScore(agent.overall_score ?? undefined)}
            </div>
            <p className="text-sm text-muted-foreground">Overall Score</p>
            <p className="text-xs text-muted-foreground mt-1">{totalEvaluations} evaluations</p>
          </div>
        </div>

        {agent.description && (
          <p className="text-lg text-muted-foreground mb-4">{agent.description}</p>
        )}

        {/* Capabilities */}
        {agent.capabilities && Array.isArray(agent.capabilities) && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold mb-2">Capabilities</h3>
            <div className="flex flex-wrap gap-2">
              {agent.capabilities.map((capability: string, idx: number) => (
                <Badge key={idx} variant="outline">
                  {capability}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Integrations */}
        {agent.integrations && Array.isArray(agent.integrations) && (
          <div>
            <h3 className="text-sm font-semibold mb-2">Integrations</h3>
            <div className="flex flex-wrap gap-2">
              {agent.integrations.map((integration: string, idx: number) => (
                <Badge key={idx} variant="outline">
                  {integration}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tabs Section */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="benchmarks">Benchmarks</TabsTrigger>
          <TabsTrigger value="voice">Voice</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="intel">Intel</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {Object.keys(avgScores).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Performance Radar</CardTitle>
              </CardHeader>
              <CardContent>
                <ScoreRadarLazy scores={avgScores} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Recent Benchmarks</CardTitle>
            </CardHeader>
            <CardContent>
              {benchmarks && benchmarks.length > 0 ? (
                <div className="space-y-3">
                  {benchmarks.slice(0, 5).map((benchmark) => (
                    <div
                      key={benchmark.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{benchmark.benchmark_type}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(benchmark.created_at!), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">
                          {formatScore(benchmark.composite_score)}
                        </p>
                        <p className="text-xs text-muted-foreground">Score</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No benchmarks yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Benchmarks Tab */}
        <TabsContent value="benchmarks" className="space-y-6">
          <div className="flex justify-end mb-4">
            <Link href={`/agents/${slug}/benchmark`}>
              <Button>Run New Benchmark</Button>
            </Link>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>All Benchmarks</CardTitle>
            </CardHeader>
            <CardContent>
              {benchmarks && benchmarks.length > 0 ? (
                <div className="space-y-4">
                  {benchmarks.map((benchmark) => (
                    <div key={benchmark.id} className="p-4 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-lg">{benchmark.benchmark_type}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(benchmark.created_at!), {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-3xl font-bold text-primary">
                            {formatScore(benchmark.composite_score)}
                          </p>
                          <p className="text-xs text-muted-foreground">Composite Score</p>
                        </div>
                      </div>
                      {benchmark.scores && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {Object.entries(benchmark.scores).map(([key, value]) => (
                            <Badge key={key} variant="secondary">
                              {key}: {formatScore(value as number)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No benchmarks available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Voice Tab */}
        <TabsContent value="voice" className="space-y-6">
          <div className="flex justify-end mb-4">
            <Link href={`/agents/${slug}/voice-eval`}>
              <Button>Start Voice Evaluation</Button>
            </Link>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Voice Evaluations</CardTitle>
            </CardHeader>
            <CardContent>
              {voice_evaluations && voice_evaluations.length > 0 ? (
                <div className="space-y-4">
                  {voice_evaluations.map((evaluation) => (
                    <div key={evaluation.id} className="p-4 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">Voice Evaluation</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(evaluation.created_at!), {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-3xl font-bold text-primary">
                            {formatScore(evaluation.composite_score ?? undefined)}
                          </p>
                          <p className="text-xs text-muted-foreground">Overall Score</p>
                        </div>
                      </div>
                      {evaluation.scores && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {Object.entries(evaluation.scores).map(([key, value]) => (
                            <Badge key={key} variant="secondary">
                              {key}: {formatScore(value as number)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No voice evaluations available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reviews Tab */}
        <TabsContent value="reviews" className="space-y-6">
          <ReviewForm agentId={agent.id} />
          <ReviewList
            reviews={
              reviews?.map((review) => ({
                id: review.id,
                rating: review.rating,
                review_text: review.review_text,
                use_case: review.use_case,
                verified_usage: review.verified_usage,
                created_at: review.created_at,
              })) || []
            }
          />
        </TabsContent>

        {/* Intel Tab */}
        <TabsContent value="intel" className="space-y-6">
          <IntelligenceFeed
            entries={
              intelligence?.map((entry) => ({
                id: entry.id,
                source_type: entry.source_type,
                source_url: entry.source_url,
                title: entry.title,
                summary: entry.summary,
                sentiment: entry.sentiment,
                relevance_score: entry.relevance_score,
                fetched_at: entry.fetched_at,
              })) || []
            }
          />
        </TabsContent>

        {/* Tools Tab */}
        <TabsContent value="tools" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Tool Verifications</CardTitle>
            </CardHeader>
            <CardContent>
              {verifications && verifications.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {verifications.map((verification) => (
                    <ToolVerificationBadge
                      key={verification.id}
                      toolName={verification.tool_name}
                      claimed={verification.claimed}
                      verified={verification.verified}
                      verifiedAt={verification.verified_at}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No tool verifications yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
