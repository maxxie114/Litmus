import { getGeminiClient, MODELS } from "./client";

export type SandboxAgentProfile = {
  name: string;
  description: string | null;
  capabilities: string[];
  vendor: string;
};

const SIMULATE_SYSTEM = `You are simulating an AI agent in a sandbox. You will be given:
1. The agent's name, vendor, description, and capabilities (from its public profile).
2. A user prompt or question.

Respond exactly as this agent would respond: in character, using its stated capabilities and style. Keep the response concise but helpful. Do not mention that you are simulating or that this is a test.`;

export async function simulateAgentResponse(
  agent: SandboxAgentProfile,
  userPrompt: string
): Promise<string> {
  const ai = getGeminiClient();

  const profileText = [
    `Agent: ${agent.name} (${agent.vendor})`,
    agent.description ? `Description: ${agent.description}` : "",
    agent.capabilities.length > 0
      ? `Capabilities: ${agent.capabilities.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await ai.models.generateContent({
    model: MODELS.FLASH,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${SIMULATE_SYSTEM}\n\n---\n${profileText}\n---\n\nUser prompt:\n${userPrompt}`,
          },
        ],
      },
    ],
  });

  const text = response.text?.trim() ?? "";
  return text || "(No response generated)";
}
