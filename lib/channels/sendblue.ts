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

async function send(to: string, text: string): Promise<void> {
  const { apiUrl, keyId, secretKey, fromNumber } = env.sendblue();
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "sb-api-key-id": keyId,
      "sb-api-secret-key": secretKey,
    },
    body: JSON.stringify({ number: to, content: text, ...(fromNumber ? { from_number: fromNumber } : {}) }),
  });
  if (!res.ok) throw new Error(`Sendblue send failed ${res.status}: ${await res.text()}`);
}

export const sendblue: Channel = { name: "imessage", parseInbound, send };
