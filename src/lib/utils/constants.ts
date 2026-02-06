import type { AgentCategory } from "@/types/agent";
import type { BenchmarkType } from "@/types/benchmark";

export const AGENT_CATEGORIES: AgentCategory[] = [
  "support",
  "copilot",
  "research",
  "voice",
  "design",
  "general",
];

export const BENCHMARK_TYPES: BenchmarkType[] = [
  "text_qa",
  "support_sim",
  "tool_use",
  "code_gen",
  "voice",
];

export const SCORE_WEIGHTS = {
  accuracy: 0.3,
  coherence: 0.15,
  helpfulness: 0.25,
  hallucination: 0.2,
  completeness: 0.1,
} as const;

export const VOICE_SCORE_WEIGHTS = {
  naturalness: 0.2,
  helpfulness: 0.25,
  latency: 0.2,
  accuracy: 0.2,
  tone: 0.15,
} as const;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_COMPARE_AGENTS = 4;
export const INTELLIGENCE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export const GEMINI_MODELS = {
  FLASH: "gemini-2.5-flash",
  PRO: "gemini-2.5-pro",
  NATIVE_AUDIO: "gemini-2.5-flash-native-audio-preview-12-2025",
  TTS: "gemini-2.5-flash-preview-tts",
} as const;

export const CATEGORY_LABELS: Record<AgentCategory, string> = {
  support: "Customer Support",
  copilot: "Coding Copilot",
  research: "Research",
  voice: "Voice Agent",
  design: "Design",
  general: "General",
};

export const BENCHMARK_TYPE_LABELS: Record<BenchmarkType, string> = {
  text_qa: "Text Q&A",
  support_sim: "Support Simulation",
  tool_use: "Tool Use",
  code_gen: "Code Generation",
  voice: "Voice",
};

export const BENCHMARK_TASK_DESCRIPTIONS: Record<Exclude<BenchmarkType, "voice">, string> = {
  text_qa:
    "Answer 10 factual questions spanning geography, science, history, and current events.",
  support_sim:
    "Resolve a simulated customer support ticket about a billing discrepancy. Customer reports being charged twice for a monthly subscription of $29.99. They have a receipt showing the duplicate charge from 3 days ago.",
  tool_use:
    "Execute a tool call to create a GitHub issue in repo 'acme/app' titled 'Login page returns 500' with label 'bug' and assign it to 'alice'.",
  code_gen:
    "Generate a TypeScript function `isValidEmail(email: string): boolean` with proper JSDoc. Handle edge cases.",
};

export const SAMPLE_RESPONSES: Record<Exclude<BenchmarkType, "voice">, string> = {
  text_qa: `1. The capital of Australia is Canberra.
2. Albert Einstein developed the theory of general relativity.
3. CRISPR-Cas9 is a genome editing technology that allows scientists to precisely modify DNA sequences. It uses a guide RNA to direct the Cas9 enzyme to specific locations in the genome, where it makes targeted cuts.
4. The first iPhone was released on June 29, 2007.
5. Tides on Earth are primarily caused by the gravitational pull of the Moon, with a smaller contribution from the Sun. The Moon's gravity creates a bulge of water on the side of Earth facing it, and a corresponding bulge on the opposite side due to inertial forces.`,
  support_sim: `I'm sorry to hear about the duplicate charge on your account. I can see your subscription at $29.99/month and I've confirmed there was indeed a duplicate charge processed 3 days ago.

Here's what I'll do to resolve this:
1. I'm issuing an immediate refund of $29.99 for the duplicate charge. You should see it back on your card within 3-5 business days.
2. I've flagged your account to prevent this from happening again.
3. I'll send you a confirmation email with the refund reference number.

Is there anything else I can help you with regarding your account?`,
  tool_use: `I'll create that GitHub issue for you now.

Action: github.create_issue
Parameters:
- repo: acme/app
- title: Login page returns 500
- labels: ["bug"]
- assignee: alice
- body: "The login page is returning a 500 Internal Server Error. This needs investigation and a fix."

Result: Issue #247 created successfully in acme/app.`,
  code_gen: `/**
 * Validates whether a given string is a properly formatted email address.
 * Checks for standard email format: local-part@domain with valid characters.
 *
 * @param email - The email string to validate
 * @returns true if the email is valid, false otherwise
 *
 * @example
 * isValidEmail("user@example.com") // true
 * isValidEmail("invalid-email") // false
 * isValidEmail("") // false
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;

  // Trim whitespace
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;

  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_\`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailRegex.test(trimmed)) return false;

  // Ensure at least one dot in the domain part
  const [, domain] = trimmed.split("@");
  return domain.includes(".");
}`,
};
