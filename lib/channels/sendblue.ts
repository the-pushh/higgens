import { env } from "@/lib/env";
import { safeEqual } from "@/lib/webhookAuth";
import type { Channel, InboundMessage, ParseResult } from "@/lib/channels/types";

interface SendblueWebhook {
  from_number?: string;
  content?: string;
  is_outbound?: boolean;
  message_handle?: string;
  message_type?: string;
  status?: string;
}

/**
 * Sendblue posts every event (inbound, outbound status updates) to one URL.
 * The URL carries a shared secret: /api/webhooks/imessage?secret=<IMESSAGE_WEBHOOK_SECRET>
 */
async function parseInbound(req: Request): Promise<ParseResult> {
  const { webhookSecret } = env.imessage();
  const secret = new URL(req.url).searchParams.get("secret");
  if (!safeEqual(secret, webhookSecret)) return null;

  const body = (await req.json()) as SendblueWebhook;
  if (body.is_outbound === true) return []; // delivery/status callback for our own message
  if (!body.from_number || !body.content) return [];

  const msg: InboundMessage = {
    channel: "imessage",
    from: body.from_number,
    text: body.content,
    id: body.message_handle ?? crypto.randomUUID(),
    raw: body,
  };
  return [msg];
}

function headers() {
  const { keyId, secretKey } = env.sendblue();
  return { "content-type": "application/json", "sb-api-key-id": keyId, "sb-api-secret-key": secretKey };
}

async function post(url: string, body: Record<string, unknown>, what: string): Promise<void> {
  const res = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Sendblue ${what} failed ${res.status}: ${await res.text()}`);
}

async function send(to: string, text: string): Promise<void> {
  const { apiUrl, fromNumber } = env.sendblue();
  await post(apiUrl, { number: to, content: text, ...(fromNumber ? { from_number: fromNumber } : {}) }, "send");
}

/**
 * Read receipt + typing bubble. Both need an existing iMessage conversation,
 * which is always true here since we're reacting to an inbound message.
 * The bubble auto-clears after max_duration_ms or when our reply lands.
 */
async function acknowledge(msg: InboundMessage): Promise<void> {
  const { fromNumber } = env.sendblue();
  const base = env.sendblue().apiUrl.replace(/\/api\/send-message\/?$/, "");
  const from = fromNumber ? { from_number: fromNumber } : {};
  await Promise.all([
    fromNumber ? post(`${base}/api/mark-read`, { number: msg.from, ...from }, "mark-read") : Promise.resolve(),
    post(`${base}/api/send-typing-indicator`, { number: msg.from, ...from, state: "start", max_duration_ms: 60000 }, "typing"),
  ]);
}

export const sendblue: Channel = { name: "imessage", parseInbound, send, acknowledge };
