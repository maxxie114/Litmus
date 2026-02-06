import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatScore } from "@/lib/utils/scoring";
import { formatDistanceToNow } from "date-fns";

export default async function DashboardPage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [agentsResult, reviewsResult] = await Promise.all([
    supabase
      .from("agents")
      .select("id, slug, name, overall_score, total_evaluations, created_at")
      .eq("submitted_by", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("user_reviews")
      .select("id, agent_id, rating, review_text, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const agents = agentsResult.data ?? [];
  const reviews = reviewsResult.data ?? [];

  return (
    <div className="container mx-auto px-4 md:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">{user.email}</p>
      </div>

      <div className="space-y-8">
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">My Agents</h2>
            <Button asChild>
              <Link href="/submit">Submit New Agent</Link>
            </Button>
          </div>

          {agents.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground mb-4">
                  You haven&apos;t submitted any agents yet
                </p>
                <Button asChild variant="outline">
                  <Link href="/submit">Submit your first agent</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent) => (
                <Link key={agent.id} href={`/agents/${agent.slug}`}>
                  <Card className="hover:border-primary transition-colors">
                    <CardHeader>
                      <CardTitle>{agent.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Score</span>
                          <Badge variant="secondary">{formatScore(agent.overall_score)}</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Evaluations</span>
                          <span className="text-sm font-medium">{agent.total_evaluations}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Created{" "}
                          {formatDistanceToNow(new Date(agent.created_at!), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">My Reviews</h2>

          {reviews.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground mb-4">
                  You haven&apos;t written any reviews yet
                </p>
                <Button asChild variant="outline">
                  <Link href="/agents">Browse agents to review</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {reviews.map((review) => (
                <Card key={review.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge>{review.rating}/5</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(review.created_at!), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm line-clamp-2">{review.review_text}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
