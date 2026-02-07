"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { formatScore } from "@/lib/utils/scoring";
import { MAX_COMPARE_AGENTS } from "@/lib/utils/constants";
import type { AgentProfile } from "@/types/agent";

type SandboxFeedback = {
  scores: Record<string, number>;
  justifications: Record<string, string>;
  composite_score: number;
};

type SandboxResult = {
  slug: string;
  name: string;
  response: string;
  error?: string;
  source: "api" | "simulated";
  feedback?: SandboxFeedback;
};

const ScoreRadar = dynamic(
  () => import("@/components/score-radar").then((m) => ({ default: m.ScoreRadar })),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[350px]" />,
  }
);

type ComparisonTableProps = {
  availableAgents: { slug: string; name: string }[];
};

type AgentData = AgentProfile & {
  avgScores: Record<string, number>;
};

export function ComparisonTable({ availableAgents }: ComparisonTableProps) {
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<string>("");
  const [useCase, setUseCase] = useState("");
  const [sandboxPrompt, setSandboxPrompt] = useState("");
  const [sandboxEvaluate, setSandboxEvaluate] = useState(true);
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [sandboxResults, setSandboxResults] = useState<SandboxResult[] | null>(null);
  const [sandboxUseCase, setSandboxUseCase] = useState<string | null>(null);

  async function addAgent(slug: string) {
    if (selectedSlugs.includes(slug) || selectedSlugs.length >= MAX_COMPARE_AGENTS) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${slug}`);
      if (!res.ok) return;
      const data = await res.json();

      const avgScores: Record<string, number> = {};
      if (data.benchmarks?.length > 0) {
        const allScores = data.benchmarks.map((b: { scores: Record<string, number> }) => b.scores);
        const keys = Object.keys(allScores[0] ?? {});
        for (const key of keys) {
          avgScores[key] =
            allScores.reduce((sum: number, s: Record<string, number>) => sum + (s[key] ?? 0), 0) /
            allScores.length;
        }
      }

      setSelectedSlugs((prev) => [...prev, slug]);
      setAgents((prev) => [...prev, { ...data.agent, avgScores }]);
    } finally {
      setLoading(false);
    }
  }

  function removeAgent(slug: string) {
    setSelectedSlugs((prev) => prev.filter((s) => s !== slug));
    setAgents((prev) => prev.filter((a) => a.slug !== slug));
  }

  async function getRecommendation() {
    if (agents.length < 2 || !useCase) return;

    const res = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "comparison",
        agents: agents.map((a) => ({
          name: a.name,
          description: a.description ?? "",
          scores: a.avgScores,
        })),
        use_case: useCase,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setRecommendation(data.recommendation ?? "");
    }
  }

  async function runSandboxTest() {
    if (selectedSlugs.length === 0 || !sandboxPrompt.trim()) return;
    setSandboxLoading(true);
    setSandboxResults(null);
    setSandboxUseCase(null);
    try {
      const res = await fetch("/api/sandbox/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_slugs: selectedSlugs,
          prompt: sandboxPrompt.trim(),
          evaluate: sandboxEvaluate,
        }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.results)) {
        setSandboxResults(data.results);
        setSandboxUseCase(data.use_case ?? sandboxPrompt.trim());
      }
    } catch {
      setSandboxResults([]);
    } finally {
      setSandboxLoading(false);
    }
  }

  const dimensions = agents.length > 0 ? Object.keys(agents[0].avgScores) : [];

  return (
    <div className="space-y-6">
      {/* Agent Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Agents to Compare (max {MAX_COMPARE_AGENTS})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {agents.map((a) => (
              <Badge key={a.slug} variant="default" className="gap-1">
                {a.name}
                <button onClick={() => removeAgent(a.slug)} className="ml-1 hover:text-red-400">
                  x
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {availableAgents
              .filter((a) => !selectedSlugs.includes(a.slug))
              .map((a) => (
                <Button
                  key={a.slug}
                  variant="outline"
                  size="sm"
                  onClick={() => addAgent(a.slug)}
                  disabled={loading || selectedSlugs.length >= MAX_COMPARE_AGENTS}
                >
                  + {a.name}
                </Button>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Radar Chart */}
      {agents.length >= 2 && dimensions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Score Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreRadar
              scores={agents[0].avgScores}
              comparisonScores={agents.slice(1).map((a) => a.avgScores)}
              labels={agents.map((a) => a.name)}
            />
          </CardContent>
        </Card>
      )}

      {/* Metric Table */}
      {agents.length >= 2 && dimensions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Detailed Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4">Metric</th>
                    {agents.map((a) => (
                      <th key={a.slug} className="text-right py-2 px-2">
                        {a.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b font-medium">
                    <td className="py-2 pr-4">Overall Score</td>
                    {agents.map((a) => (
                      <td key={a.slug} className="text-right py-2 px-2">
                        {formatScore(a.overall_score ?? undefined)}
                      </td>
                    ))}
                  </tr>
                  {dimensions.map((dim) => {
                    const maxVal = Math.max(...agents.map((a) => a.avgScores[dim] ?? 0));
                    return (
                      <tr key={dim} className="border-b">
                        <td className="py-2 pr-4 capitalize">{dim}</td>
                        {agents.map((a) => {
                          const val = a.avgScores[dim] ?? 0;
                          return (
                            <td
                              key={a.slug}
                              className={`text-right py-2 px-2 ${val === maxVal ? "font-semibold text-green-600" : ""}`}
                            >
                              {formatScore(val)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <tr className="border-b">
                    <td className="py-2 pr-4">Total Evaluations</td>
                    {agents.map((a) => (
                      <td key={a.slug} className="text-right py-2 px-2">
                        {a.total_evaluations ?? 0}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test with prompt (sandbox) */}
      {agents.length >= 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Test with a prompt</CardTitle>
            <p className="text-sm text-muted-foreground font-normal">
              Run the same prompt against the selected agents and get responses plus optional AI feedback (scores and justifications).
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder="Enter a use case or question to test all selected agents..."
              value={sandboxPrompt}
              onChange={(e) => setSandboxPrompt(e.target.value)}
              rows={3}
              className="resize-y"
            />
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={sandboxEvaluate}
                onChange={(e) => setSandboxEvaluate(e.target.checked)}
                className="rounded border-input"
              />
              Get AI feedback (scores and justifications)
            </label>
            <Button
              onClick={runSandboxTest}
              disabled={sandboxLoading || !sandboxPrompt.trim()}
            >
              {sandboxLoading ? "Running…" : "Run test"}
            </Button>

            {sandboxResults && sandboxResults.length > 0 && (
              <div className="mt-6 space-y-4 border-t pt-4">
                {sandboxUseCase && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Use case</p>
                    <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-md">{sandboxUseCase}</p>
                  </div>
                )}
                <p className="text-sm font-medium">Responses & feedback</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {sandboxResults.map((r) => (
                    <Card key={r.slug || r.name} className="flex flex-col">
                      <CardHeader className="pb-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <CardTitle className="text-sm">
                            {r.slug ? (
                              <Link href={`/agents/${r.slug}`} className="hover:underline">
                                {r.name}
                              </Link>
                            ) : (
                              r.name
                            )}
                          </CardTitle>
                          <Badge variant={r.source === "api" ? "default" : "secondary"} className="text-xs">
                            {r.source === "api" ? "Live" : "Simulated"}
                          </Badge>
                        </div>
                        {r.feedback && (
                          <p className="text-base font-semibold text-primary">
                            Score: {formatScore(r.feedback.composite_score)}
                          </p>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-2 flex-1 text-sm">
                        {r.error ? (
                          <p className="text-destructive">{r.error}</p>
                        ) : (
                          <p className="whitespace-pre-wrap break-words">{r.response}</p>
                        )}
                        {r.feedback?.scores && (
                          <ul className="text-xs space-y-0.5 pt-1 border-t">
                            {Object.entries(r.feedback.scores).map(([dim, val]) => (
                              <li key={dim} className="flex justify-between gap-2">
                                <span className="capitalize">{dim}</span>
                                <span className="font-medium">{formatScore(val)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {r.feedback?.justifications && Object.keys(r.feedback.justifications).length > 0 && (
                          <details className="text-xs">
                            <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                              Justifications
                            </summary>
                            <ul className="mt-1 space-y-1 list-none pl-0">
                              {Object.entries(r.feedback.justifications).map(([dim, text]) => (
                                <li key={dim}>
                                  <span className="capitalize font-medium">{dim}:</span> {text}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI Recommendation */}
      {agents.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>AI Recommendation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Describe your use case..."
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
              />
              <Button onClick={getRecommendation} disabled={!useCase}>
                Get Recommendation
              </Button>
            </div>
            {recommendation && (
              <p className="text-sm leading-relaxed bg-muted p-4 rounded-lg">{recommendation}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
