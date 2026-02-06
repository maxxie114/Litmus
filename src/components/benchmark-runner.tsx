"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BENCHMARK_TYPES,
  BENCHMARK_TYPE_LABELS,
  BENCHMARK_TASK_DESCRIPTIONS,
  SAMPLE_RESPONSES,
} from "@/lib/utils/constants";
import { formatScore } from "@/lib/utils/scoring";
import type { BenchmarkType, BenchmarkScores } from "@/types/benchmark";

type BenchmarkRunnerProps = {
  agentSlug: string;
  hasApiEndpoint: boolean;
};

type RunState = {
  status: "idle" | "running" | "complete" | "error";
  benchmarkId: string | undefined;
  scores: BenchmarkScores | undefined;
  compositeScore: number | undefined;
  justifications: Record<string, string> | undefined;
  error: string | undefined;
};

export function BenchmarkRunner({ agentSlug, hasApiEndpoint }: BenchmarkRunnerProps) {
  const [benchmarkType, setBenchmarkType] = useState<BenchmarkType>("text_qa");
  const [agentResponse, setAgentResponse] = useState("");
  const [state, setState] = useState<RunState>({
    status: "idle",
    benchmarkId: undefined,
    scores: undefined,
    compositeScore: undefined,
    justifications: undefined,
    error: undefined,
  });

  const nonVoiceType = benchmarkType as Exclude<BenchmarkType, "voice">;
  const taskDescription = BENCHMARK_TASK_DESCRIPTIONS[nonVoiceType];
  const sampleResponse = SAMPLE_RESPONSES[nonVoiceType];

  async function runBenchmark() {
    setState({
      status: "running",
      benchmarkId: undefined,
      scores: undefined,
      compositeScore: undefined,
      justifications: undefined,
      error: undefined,
    });

    try {
      const response = await fetch(`/api/agents/${agentSlug}/benchmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          benchmark_type: benchmarkType,
          ...(agentResponse.trim() ? { agent_response: agentResponse.trim() } : {}),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error ?? "Benchmark failed");
      }

      const data = await response.json();
      setState({
        status: "complete",
        benchmarkId: data.id,
        scores: data.scores,
        compositeScore: data.composite_score,
        justifications: data.justifications,
        error: undefined,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    }
  }

  const scoreEntries = state.scores ? Object.entries(state.scores) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run Benchmark</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3">
          <Select
            value={benchmarkType}
            onValueChange={(val) => {
              setBenchmarkType(val as BenchmarkType);
              setAgentResponse("");
            }}
            disabled={state.status === "running"}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BENCHMARK_TYPES.filter((t) => t !== "voice").map((type) => (
                <SelectItem key={type} value={type}>
                  {BENCHMARK_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={runBenchmark}
            disabled={state.status === "running" || (!hasApiEndpoint && !agentResponse.trim())}
          >
            {state.status === "running" ? "Running..." : "Run Benchmark"}
          </Button>
        </div>

        {/* Task Description */}
        {taskDescription && (
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Benchmark Task</p>
            <p className="text-sm">{taskDescription}</p>
          </div>
        )}

        {/* Agent Response Input */}
        {!hasApiEndpoint && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Paste the agent&apos;s actual response to the task above, or use a sample to see the feature in action.
              </p>
              {sampleResponse && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setAgentResponse(sampleResponse)}
                  disabled={state.status === "running"}
                >
                  Use Sample Response
                </Button>
              )}
            </div>
            <Textarea
              placeholder="Paste the agent's response here..."
              value={agentResponse}
              onChange={(e) => setAgentResponse(e.target.value)}
              disabled={state.status === "running"}
              rows={8}
            />
          </div>
        )}

        {state.status === "running" && (
          <div className="space-y-2">
            <Progress value={undefined} className="animate-pulse" />
            <p className="text-sm text-muted-foreground text-center">
              Gemini is evaluating the response...
            </p>
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          </div>
        )}

        {state.status === "complete" && state.scores && (
          <div className="space-y-3">
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Composite Score</p>
              <p className="text-4xl font-bold">{formatScore(state.compositeScore)}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {scoreEntries.map(([key, value]) => (
                <div key={key} className="p-3 border rounded-lg">
                  <p className="text-xs text-muted-foreground capitalize">{key}</p>
                  <p className="text-lg font-semibold">{formatScore(value as number)}</p>
                  {state.justifications?.[key] && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {state.justifications[key]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {state.status === "error" && (
          <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={runBenchmark}>
              Retry
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
