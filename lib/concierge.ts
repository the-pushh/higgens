import { generateText, type ModelMessage } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { env } from "@/lib/env";
import { SYSTEM_PROMPT } from "@/lib/prompts/system";
import type { InboundMessage } from "@/lib/channels/types";

const FALLBACK = "Sorry, I didn't catch that. Could you say it again?";

/**
 * The concierge brain. `history` is prior turns (oldest first) and must NOT
 * include `inbound` itself. Tools plug in here in the next milestone.
 */
export async function respond(inbound: InboundMessage, history: ModelMessage[] = []): Promise<string> {
  const { apiKey, model, siteUrl, appName } = env.openrouter();
  const openrouter = createOpenRouter({
    apiKey,
    headers: { "HTTP-Referer": siteUrl, "X-Title": appName },
  });

  const { text } = await generateText({
    model: openrouter(model),
    system: SYSTEM_PROMPT,
    messages: [...history, { role: "user", content: inbound.text }],
    // tools: {}, stopWhen: stepCountIs(5)  <- milestone 2
  });

  return text.trim() || FALLBACK;
}
