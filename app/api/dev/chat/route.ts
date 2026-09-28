import { env } from "@/lib/env";
import { respond } from "@/lib/concierge";
import { getHistory, recordInbound, recordOutbound } from "@/lib/memory";
import type { InboundMessage } from "@/lib/channels/types";

export const maxDuration = 60;

/**
 * Talk to the concierge without a messaging provider.
 * Dev only, unless DEV_CHAT_TOKEN is set and sent as `x-dev-token`.
 *   curl localhost:3000/api/dev/chat -H 'content-type: application/json' -d '{"text":"hello"}'
 */
export async function POST(req: Request) {
  const token = env.dev().chatToken;
  const allowed = process.env.NODE_ENV !== "production" || (token && req.headers.get("x-dev-token") === token);
  if (!allowed) return new Response("not found", { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { text?: string; from?: string; memory?: boolean };
  if (!body.text) return Response.json({ error: "text is required" }, { status: 400 });

  const msg: InboundMessage = {
    channel: "imessage",
    from: body.from ?? "+10000000000",
    text: body.text,
    id: crypto.randomUUID(),
    raw: null,
  };

  const useMemory = body.memory !== false;
  let history = [] as Awaited<ReturnType<typeof getHistory>>;
  if (useMemory) {
    await recordInbound(msg);
    history = (await getHistory(msg.channel, msg.from)).slice(0, -1);
  }
  const reply = await respond(msg, history);
  if (useMemory) await recordOutbound(msg.channel, msg.from, reply);
  return Response.json({ reply });
}
