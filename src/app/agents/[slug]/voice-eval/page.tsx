import Link from "next/link";
import { notFound } from "next/navigation";
import { VoiceEvalPanel } from "@/components/voice-eval-panel";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function VoiceEvalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServerClient();

  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, slug")
    .eq("slug", slug)
    .single();

  if (!agent) notFound();

  return (
    <div className="container mx-auto px-4 md:px-6 py-8 space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/agents" className="hover:underline">
          Agents
        </Link>
        <span>/</span>
        <Link href={`/agents/${slug}`} className="hover:underline">
          {agent.name}
        </Link>
        <span>/</span>
        <span>Voice Evaluation</span>
      </div>
      <h1 className="text-3xl font-bold">Voice Evaluation — {agent.name}</h1>
      <VoiceEvalPanel agentId={agent.id} agentName={agent.name} />
    </div>
  );
}
