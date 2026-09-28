# Higgens

An agent concierge you reach by texting. Two distribution channels: **iMessage** (via Sendblue) and **WhatsApp** (Meta Cloud API). The brain runs on OpenRouter (`z-ai/glm-5.3-flash` by default). Conversation memory lives in Supabase.

This repo is milestone 1: the distribution layer. Concierge capabilities (tools) come next and plug into `lib/concierge.ts`.

## Layout

```
app/page.tsx                      landing page: two links, "Add Higgens on iMessage / WhatsApp"
app/api/webhooks/whatsapp/route   Meta webhook (GET verify + POST events)
app/api/webhooks/imessage/route   Sendblue webhook (POST events)
app/api/dev/chat/route            talk to the concierge without a provider (dev only)
lib/channels/*                    one adapter per channel: parseInbound(req) + send(to, text)
lib/handleInbound.ts              ack 200 fast, then store -> think -> reply in the background
lib/concierge.ts                  respond(inbound, history) via Vercel AI SDK + OpenRouter
lib/memory.ts                     Supabase: recordInbound (dedupes retries), getHistory, recordOutbound
lib/env.ts                        lazy env getters (nothing read at build time)
supabase/migrations/              schema (already applied to the `higgens` project)
scripts/                          sample webhook payloads + a signer for Meta's X-Hub-Signature-256
```

## Setup

```bash
pnpm install
cp .env.example .env.local   # then fill in the keys below
pnpm dev
```

### Keys you need

| Env var | Where it comes from |
|---|---|
| `OPENROUTER_API_KEY` | openrouter.ai > Keys |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase project `higgens` > Settings > API (service role, server only) |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` | Meta App > WhatsApp > API Setup. Use a permanent System User token for prod |
| `WHATSAPP_APP_SECRET` | Meta App > Settings > Basic |
| `WHATSAPP_VERIFY_TOKEN` | any random string you make up |
| `SENDBLUE_API_KEY_ID`, `SENDBLUE_API_SECRET_KEY`, `SENDBLUE_FROM_NUMBER` | Sendblue dashboard |
| `IMESSAGE_WEBHOOK_SECRET` | any random string you make up |
| `NEXT_PUBLIC_IMESSAGE_NUMBER`, `NEXT_PUBLIC_WHATSAPP_NUMBER` | the numbers users will text |

### WhatsApp (Meta) wiring

1. Create a Meta app (type Business), add the **WhatsApp** product.
2. Copy the Phone Number ID and a token into `.env.local`. For production, create a System User with `whatsapp_business_messaging` and generate a permanent token.
3. Deploy, then in the app dashboard go to WhatsApp > Configuration > Webhooks:
   - Callback URL: `https://<your-host>/api/webhooks/whatsapp`
   - Verify token: the value of `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the `messages` field.
4. While the number is a test number, add your own phone under "To" recipients.

Meta only lets you reply for free inside a 24-hour window after the user's last message. Fine for a concierge.

### iMessage (Sendblue) wiring

1. Sign up at sendblue.com, grab API key id + secret, note the number they give you.
2. In the Sendblue dashboard set the inbound webhook URL to
   `https://<your-host>/api/webhooks/imessage?secret=<IMESSAGE_WEBHOOK_SECRET>`.
   Sendblue posts inbound messages and outbound status updates to the same URL; the adapter ignores anything with `is_outbound: true`.
3. If Sendblue's send endpoint differs for your account (`/send-message` vs `/api/send-message`), override `SENDBLUE_API_URL`.

### Supabase

The `messages` table is already created in the `higgens` project (ap-south-1). To recreate elsewhere, run `supabase/migrations/0001_messages.sql`. RLS is on with no policies, so only the service-role key can read or write.

## Testing locally

```bash
pnpm typecheck && pnpm build
pnpm dev

# Landing page links
curl -s localhost:3000 | grep -o 'href="[^"]*"'

# Concierge without a provider (needs OPENROUTER_API_KEY; add "memory": false to skip Supabase)
curl -s localhost:3000/api/dev/chat -H 'content-type: application/json' -d '{"text":"hello"}'

# Meta verification handshake -> prints 12345
curl -s "localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=12345"

# Meta signed event -> "ok"; the reply attempt shows up in the dev server log
SIG=$(node --env-file=.env.local scripts/sign-whatsapp.mjs scripts/samples/whatsapp-text.json)
curl -s localhost:3000/api/webhooks/whatsapp -H 'content-type: application/json' \
  -H "X-Hub-Signature-256: $SIG" --data-binary @scripts/samples/whatsapp-text.json

# Sendblue inbound -> "ok"; missing secret -> 401
curl -s "localhost:3000/api/webhooks/imessage?secret=$IMESSAGE_WEBHOOK_SECRET" \
  -H 'content-type: application/json' --data-binary @scripts/samples/sendblue-inbound.json
```

To receive real provider callbacks on your laptop, expose the dev server with `ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000` and use that URL in the Meta / Sendblue dashboards.

## Deploy

Vercel. Set every env var from `.env.example` in the project settings. Webhook routes declare `maxDuration = 60`; they return 200 immediately and finish the LLM call and reply via `after()`, which maps to `waitUntil` on Vercel.

## Known gaps

- Sendblue's webhook signing header is undocumented, so the URL secret is the only guard on that route.
- Apple doesn't document `sms:...&body=` but it is the de facto format and what Sendblue recommends.
- Only text messages are handled. Media, reactions and status callbacks are ignored.
