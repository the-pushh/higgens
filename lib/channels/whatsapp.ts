import { env } from "@/lib/env";
import { hmacSha256Hex, safeEqual } from "@/lib/webhookAuth";
import type { Channel, InboundMessage, ParseResult } from "@/lib/channels/types";

interface MetaTextMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

interface MetaWebhookBody {
  entry?: Array<{
    changes?: Array<{ value?: { messages?: MetaTextMessage[] } }>;
  }>;
}

async function parseInbound(req: Request): Promise<ParseResult> {
  const { verifyToken, appSecret } = env.whatsapp();

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && safeEqual(token, verifyToken) && challenge) {
      return { verifyChallenge: challenge };
    }
    return null;
  }

  const raw = await req.text();
  const expected = "sha256=" + hmacSha256Hex(appSecret, raw);
  if (!safeEqual(req.headers.get("x-hub-signature-256"), expected)) return null;

  const body = JSON.parse(raw) as MetaWebhookBody;
  const out: InboundMessage[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        if (m.type !== "text" || !m.text?.body) continue; // statuses, media, etc. are ignored
        out.push({ channel: "whatsapp", from: "+" + m.from.replace(/^\+/, ""), text: m.text.body, id: m.id, raw: m });
      }
    }
  }
  return out;
}

async function send(to: string, text: string): Promise<void> {
  const { phoneNumberId, accessToken, apiVersion } = env.whatsapp();
  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to.replace(/^\+/, ""),
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp send failed ${res.status}: ${await res.text()}`);
}

export const whatsapp: Channel = { name: "whatsapp", parseInbound, send };
