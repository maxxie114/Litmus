"use client";

import { useState, useEffect } from "react";
import { ComparisonTable } from "@/components/comparison-table";

export default function ComparePage() {
  const [agents, setAgents] = useState<{ slug: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/agents?per_page=100")
      .then((r) => r.json())
      .then((data) => {
        setAgents(
          (data.agents ?? []).map((a: { slug: string; name: string }) => ({
            slug: a.slug,
            name: a.name,
          }))
        );
      })
      .catch(console.error);
  }, []);

  return (
    <div className="container mx-auto px-4 md:px-6 py-8 space-y-6">
      <h1 className="text-3xl font-bold">Compare Agents</h1>
      <p className="text-muted-foreground">
        Select up to 4 agents to compare their scores, metrics, and get AI-powered recommendations.
      </p>
      <ComparisonTable availableAgents={agents} />
    </div>
  );
}
