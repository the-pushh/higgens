import { after } from "next/server";
import type { Channel, InboundMessage } from "@/lib/channels/types";
import { respond } from "@/lib/concierge";
import { getHistory, recordInbound, recordOutbound } from "@/lib/memory";

/**
 * Shared webhook pipeline: authenticate + parse, ack 200 immediately, then
 * (in the background) store the message, think, reply, store the reply.
 * Providers retry on slow/non-200 responses, so nothing slow happens before the ack.
 */
export async function handleInbound(req: Request, channel: Channel): Promise<Response> {
  let parsed;
  try {
    parsed = await channel.parseInbound(req);
  } catch (err) {
    console.error(`[${channel.name}] bad payload`, err);
    return new Response("bad request", { status: 400 });
  }

  if (parsed === null) return new Response("unauthorized", { status: 401 });
  if ("verifyChallenge" in parsed) {
    return new Response(parsed.verifyChallenge, { status: 200, headers: { "content-type": "text/plain" } });
  }

  for (const msg of parsed) {
    after(() => processMessage(channel, msg));
  }
  return new Response("ok", { status: 200 });
}

async function processMessage(channel: Channel, msg: InboundMessage): Promise<void> {
  try {
    const isNew = await recordInbound(msg);
    if (!isNew) {
      console.log(`[${channel.name}] duplicate ${msg.id} from ${msg.from}, skipping`);
      return;
    }
    const history = await getHistory(channel.name, msg.from);
    // history already contains the message we just stored; drop it so respond() adds it once
    const prior = history.length && history[history.length - 1].role === "user" ? history.slice(0, -1) : history;
    const reply = await respond(msg, prior);
    await channel.send(msg.from, reply);
    await recordOutbound(channel.name, msg.from, reply);
  } catch (err) {
    // The 200 has already gone out; log loudly so it shows in Vercel logs.
    console.error(`[${channel.name}] failed to reply to ${msg.from}`, err);
  }
}
