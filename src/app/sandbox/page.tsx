"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { formatScore } from "@/lib/utils/scoring";
import { SANDBOX_MAX_AGENTS } from "@/lib/utils/constants";

const PRESET_PROMPTS = [
  { label: "Factual Q&A", value: "What is the capital of Australia? Who developed the theory of general relativity?" },
  { label: "Support", value: "I was charged twice for my $29.99 subscription. I have a receipt from 3 days ago. Can you help?" },
  { label: "Code", value: "Write a short TypeScript function that checks if a string is a valid email. Include JSDoc." },
  { label: "Open-ended", value: "In 2–3 sentences, how would you help a small business choose between different AI tools?" },
];

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

export default function SandboxPage() {
  const [agents, setAgents] = useState<{ slug: string; name: string }[]>([]);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [evaluate, setEvaluate] = useState(true);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SandboxResult[] | null>(null);
  const [useCase, setUseCase] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/agents?per_page=100")
      .then((r) => r.json())
      .then((data) => {
        setAgents((data.agents ?? []).map((a: { slug: string; name: string }) => ({ slug: a.slug, name: a.name })));
      })
      .catch(console.error);
  }, []);

  function addAgent(slug: string) {
    if (selectedSlugs.includes(slug) || selectedSlugs.length >= SANDBOX_MAX_AGENTS) return;
    setSelectedSlugs((prev) => [...prev, slug]);
    setResults(null);
  }

  function addAllAgents() {
    const toAdd = agents
      .filter((a) => !selectedSlugs.includes(a.slug))
      .slice(0, SANDBOX_MAX_AGENTS - selectedSlugs.length)
      .map((a) => a.slug);
    if (toAdd.length > 0) {
      setSelectedSlugs((prev) => [...prev, ...toAdd]);
      setResults(null);
    }
  }

  function removeAgent(slug: string) {
    setSelectedSlugs((prev) => prev.filter((s) => s !== slug));
    setResults(null);
  }

  async function runSandbox() {
    if (selectedSlugs.length === 0 || !prompt.trim()) return;
    setLoading(true);
    setResults(null);
    setUseCase(null);
    try {
      const res = await fetch("/api/sandbox/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_slugs: selectedSlugs, prompt: prompt.trim(), evaluate }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.results)) {
        setResults(data.results);
        setUseCase(data.use_case ?? prompt.trim());
      } else {
        setResults([{ slug: "", name: "Error", response: "", error: data.error ?? data.message ?? "Request failed", source: "simulated" }]);
      }
    } catch (e) {
      setResults([{ slug: "", name: "Error", response: "", error: String(e), source: "simulated" }]);
    } finally {
      setLoading(false);
    }
  }

  const availableAgents = agents.filter((a) => !selectedSlugs.includes(a.slug));

  return (
    <div className="container mx-auto px-4 md:px-6 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sandbox</h1>
        <p className="text-muted-foreground mt-1">
          Test agents with the same use case and get AI feedback (scores and justifications). Responses come from live APIs or simulated from agent profiles.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Select agents (max {SANDBOX_MAX_AGENTS})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {selectedSlugs.map((slug) => {
              const name = agents.find((a) => a.slug === slug)?.name ?? slug;
              return (
                <Badge key={slug} variant="default" className="gap-1 py-1.5">
                  {name}
                  <button type="button" onClick={() => removeAgent(slug)} className="ml-1 hover:text-red-400" aria-label={`Remove ${name}`}>
                    ×
                  </button>
                </Badge>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {availableAgents.slice(0, 12).map((a) => (
              <Button
                key={a.slug}
                variant="outline"
                size="sm"
                onClick={() => addAgent(a.slug)}
                disabled={loading || selectedSlugs.length >= SANDBOX_MAX_AGENTS}
              >
                + {a.name}
              </Button>
            ))}
            {availableAgents.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={addAllAgents}
                disabled={loading || selectedSlugs.length >= SANDBOX_MAX_AGENTS || availableAgents.length === 0}
              >
                Add all ({Math.min(availableAgents.length, SANDBOX_MAX_AGENTS - selectedSlugs.length)})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Use case / prompt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Describe the use case or ask something that each agent will answer..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className="resize-y"
          />
          <div className="flex flex-wrap gap-2">
            {PRESET_PROMPTS.map((preset) => (
              <Button key={preset.label} variant="secondary" size="sm" onClick={() => setPrompt(preset.value)}>
                {preset.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Run</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={evaluate}
              onChange={(e) => setEvaluate(e.target.checked)}
              className="rounded border-input"
            />
            <span className="text-sm">Get AI feedback (scores and justifications for each response)</span>
          </label>
          <Button
            onClick={runSandbox}
            disabled={loading || selectedSlugs.length === 0 || !prompt.trim()}
          >
            {loading ? "Running…" : "Run sandbox"}
          </Button>
        </CardContent>
      </Card>

      {results && results.length > 0 && (
        <div className="space-y-6">
          {useCase && (
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-base">Use case</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{useCase}</p>
              </CardContent>
            </Card>
          )}

          <h2 className="text-xl font-semibold">Responses & feedback</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {results.map((r) => (
              <Card key={r.slug || r.name} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base">
                      {r.slug ? (
                        <Link href={`/agents/${r.slug}`} className="hover:underline">
                          {r.name}
                        </Link>
                      ) : (
                        r.name
                      )}
                    </CardTitle>
                    <Badge variant={r.source === "api" ? "default" : "secondary"} className="shrink-0 text-xs">
                      {r.source === "api" ? "Live API" : "Simulated"}
                    </Badge>
                  </div>
                  {r.feedback && (
                    <p className="text-lg font-semibold text-primary mt-1">
                      Score: {formatScore(r.feedback.composite_score)}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-3 flex-1 flex flex-col">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Response</p>
                    {r.error ? (
                      <p className="text-sm text-destructive">{r.error}</p>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap break-words">{r.response}</p>
                    )}
                  </div>
                  {r.feedback && r.feedback.scores && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Scores</p>
                      <ul className="text-xs space-y-0.5">
                        {Object.entries(r.feedback.scores).map(([dim, val]) => (
                          <li key={dim} className="flex justify-between gap-2">
                            <span className="capitalize">{dim}</span>
                            <span className="font-medium">{formatScore(val)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {r.feedback && r.feedback.justifications && Object.keys(r.feedback.justifications).length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">Justifications</summary>
                      <ul className="mt-2 space-y-2 list-none pl-0">
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
    </div>
  );
}
