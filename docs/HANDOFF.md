# Higgens: engineering handoff

As of 2026-10-06. Repo: github.com/the-pushh/higgens, branch `main`. Live: https://higgens-concierge.vercel.app

## What Higgens is

An agent concierge reached by texting. Users add it on iMessage or WhatsApp from the landing page, then text it. Milestone 1, the distribution layer, is done and working on both channels. Milestone 2, the concierge itself (jobs, search, ranking, memory), is audited and planned but not started. See `docs/architecture-audit.md` for the audit and the migration path.

## What is built and verified

- **Landing page** at `/`. Plain serif page, two links: `sms:` to the Sendblue number and `wa.me` to the WhatsApp number, both with "Hi Higgens" prefilled. Numbers are sanitised against hidden characters pasted from provider dashboards.
- **WhatsApp channel.** Meta Cloud API, direct. Webhook at `/api/webhooks/whatsapp` handles Meta's GET verification and HMAC-signed POST events. Replies, read receipts and typing bubble go through the Graph API.
- **iMessage channel.** Sendblue. Webhook at `/api/webhooks/imessage?secret=…`. Replies, mark-read and typing indicator through Sendblue's API.
- **Pipeline** (`lib/handleInbound.ts`). Returns 200 immediately, then in `after()`: store inbound (dedupe on provider message id), load last 20 turns, call the model, send reply, store reply. Failures after the ack are logged only.
- **Brain** (`lib/concierge.ts`). One `generateText` call via the Vercel AI SDK on OpenRouter, model `z-ai/glm-5.3-flash`. SMS-style system prompt in `lib/prompts/system.ts`.
- **Memory.** Supabase Postgres, one table `messages`. Service-role key only, RLS on with no policies.
- **Dev route** `/api/dev/chat` to talk to the brain without a provider. Disabled in production unless `DEV_CHAT_TOKEN` is set and sent as `x-dev-token`.
- **Scripts.** Sample webhook payloads and a Meta signature signer under `scripts/`.

Verified end to end on 2026-09-29: real texts on both channels got replies, with typing and read receipts, and rows landed in `messages`.

## Accounts and identifiers (no secrets here)

| Thing | Value / where |
|---|---|
| Vercel project | `higgens-concierge`, on an account the author's CLI (`pushkar-2805`, teams OMEGA Labs) cannot see. Logs must be read in the dashboard. |
| Supabase project | `higgens`, ref `ouiixclnnxsgqgjtzxjq`, region ap-south-1, org "personal". URL `https://ouiixclnnxsgqgjtzxjq.supabase.co` |
| Meta app | id `1393178979121051` |
| WhatsApp Business Account | id `977895108674417` |
| WhatsApp test number | +1 555-180-4468, phone number id `1248076091733431`. Five allowed recipients max. |
| Sendblue line | +1 347-276-0577 |
| OpenRouter | key under the author's account; model `z-ai/glm-5.3-flash` |

All env vars are listed with comments in `.env.example`. Real values live in `.env.local` (gitignored) and in Vercel project settings. The `NEXT_PUBLIC_*` values are baked at build time, so changing them in Vercel needs a redeploy.

## Non-obvious things that bit us

1. **The WhatsApp Business Account must be subscribed to the app.** Meta's dashboard configures the webhook at the app level but does not subscribe the account to it; inbound messages showed up in Meta's "Check test webhooks" viewer and never reached us. Fixed with `POST /{WABA_ID}/subscribed_apps` using the app's token. Not exposed anywhere in the UI.
2. **Partial unique indexes cannot be `ON CONFLICT` targets through PostgREST.** The dedupe index must be a full unique index (`0002` migration). The first version silently 400'd every insert.
3. **Supabase free tier pauses the database after 7 idle days.** It paused on about 2026-10-05 and was restored on 2026-10-06. No messages were sent in that window, so nothing was lost, but any message would have failed silently. Either move to a paid tier or add a keep-alive.
4. **Meta's temporary token expires every 24 hours.** WhatsApp replies fail with a 401 after that. The permanent fix is a System User token from Business Settings. Not yet done.
5. **Provider dashboards paste invisible characters** (U+200E) into copied phone numbers. The page strips them; env values may still carry them.
6. **Sendblue does not sign webhooks** in any documented way; the URL secret is the only guard on that route.

## How to run and test locally

```bash
pnpm install
cp .env.example .env.local        # fill in keys
pnpm typecheck && pnpm build
pnpm dev

curl -s localhost:3000 | grep -o 'href="[^"]*"'
curl -s localhost:3000/api/dev/chat -H 'content-type: application/json' -d '{"text":"hello"}'
curl -s "localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=12345"
SIG=$(node --env-file=.env.local scripts/sign-whatsapp.mjs scripts/samples/whatsapp-text.json)
curl -s localhost:3000/api/webhooks/whatsapp -H 'content-type: application/json' -H "X-Hub-Signature-256: $SIG" --data-binary @scripts/samples/whatsapp-text.json
curl -s "localhost:3000/api/webhooks/imessage?secret=$IMESSAGE_WEBHOOK_SECRET" -H 'content-type: application/json' --data-binary @scripts/samples/sendblue-inbound.json
```

The README has the full provider wiring steps. For real provider callbacks on a laptop, expose the dev server with ngrok or cloudflared and point the Meta and Sendblue dashboards at it.

## Decisions already made

- Sendblue for iMessage (no official Apple API). Meta Cloud API direct for WhatsApp (no Twilio). OpenRouter with GLM 5.3 Flash. Supabase for memory. Vercel AI SDK as the only LLM client.
- No Tailwind, no ESLint, no test runner yet. Lazy env getters so builds don't need secrets.
- Jobs will be DB-backed with resumable steps; Vercel Workflow is the upgrade path, not the starting point.
- First concierge vertical will be product purchase / deal search, not restaurants (see audit, section 3).

## Open items for the owner

1. Permanent Meta System User token in Vercel, replacing the daily temporary one.
2. Supabase paid tier or a keep-alive ping.
3. A search API key (Serper.dev or similar) before the search vertical.
4. Eventually a real WhatsApp number that has never been on WhatsApp, and a production Sendblue line.
5. Give the engineering CLI account access to the Vercel project if logs should be readable from the terminal.

## Next step

Stage B of the concierge brief: a milestone-by-milestone implementation plan built on the audit's migration path. Nothing in `lib/channels` should change for it.
