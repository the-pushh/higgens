# Higgens: architecture audit (Stage A)

Date: 2026-10-06. Scope: the repository at commit `72e0c93` plus the live deployment at higgens-concierge.vercel.app, the Supabase project `higgens`, and the Meta / Sendblue accounts wired to it.

## 1. What exists today

A 731-line Next.js 16 App Router app, TypeScript, pnpm, deployed on Vercel. It is a **messaging transport plus a single-turn chatbot**. There is no agent, no job system, no search, no tools.

```
app/page.tsx                          static landing page, two deep links (sms:, wa.me)
app/api/webhooks/whatsapp/route.ts    Meta Cloud API webhook (GET verify + POST events)
app/api/webhooks/imessage/route.ts    Sendblue webhook (POST events)
app/api/dev/chat/route.ts             dev-only HTTP entry to the same brain, no transport
lib/channels/types.ts                 Channel interface: parseInbound / send / acknowledge
lib/channels/whatsapp.ts              Meta adapter (HMAC verify, send, read+typing)
lib/channels/sendblue.ts              Sendblue adapter (URL secret, send, mark-read, typing)
lib/channels/index.ts                 getChannel(name)
lib/handleInbound.ts                  the only pipeline: ack 200 -> after(): store, history, LLM, send, store
lib/concierge.ts                      respond(inbound, history): one generateText() call via OpenRouter
lib/prompts/system.ts                 SMS-style system prompt
lib/memory.ts                         recordInbound (dedupe), getHistory (last 20), recordOutbound
lib/supabase.ts                       service-role client, server only
lib/env.ts                            lazy env getters
lib/webhookAuth.ts                    hmacSha256Hex, safeEqual
supabase/migrations/000{1,2}_*.sql    one table: messages
scripts/                              sample webhook payloads + Meta signature signer
```

Dependencies: `next@16.3.6`, `ai@7.0.118` (Vercel AI SDK), `@openrouter/ai-sdk-provider@3.1.0`, `@supabase/supabase-js@2.117.2`. No test runner, no linter, no validation library.

### Message ingress and egress

Both channels implement the same `Channel` interface and both are production-usable for **text only**.

| | WhatsApp | iMessage |
|---|---|---|
| Provider | Meta Cloud API, direct, Graph v25.0 | Sendblue |
| Inbound auth | `X-Hub-Signature-256` HMAC with app secret, timing-safe | shared secret in webhook URL query (Sendblue has no documented signature) |
| Inbound parse | `entry[].changes[].value.messages[]`, `type === "text"` only | `content` + `from_number`, skips `is_outbound` |
| Identity | `from` E.164 digits, normalised to `+E164` | `from_number` already `+E164` |
| Dedupe | unique index on `(channel, provider_message_id)` | same |
| Outbound | `POST /{phone_number_id}/messages` text | `POST /api/send-message` |
| Ack | `status: read` + `typing_indicator` in one call | `/api/mark-read` + `/api/send-typing-indicator` |
| Known limits | Meta **test number**: five allowed recipients, temporary token expires every 24 h | Sendblue sandbox line; production is ~$100/line/month |

The pipeline in `lib/handleInbound.ts` returns 200 immediately and does all work inside Next's `after()`, bounded by `maxDuration = 60` on each route. Failures after the ack are logged, never retried, and the user gets nothing.

### Model invocation

One function: `respond(inbound, history) -> string`. It calls `generateText` with the system prompt, the last 20 stored turns and the new message. Model is `z-ai/glm-5.3-flash` via OpenRouter, verified to support tool calling. No tools, no structured output, no streaming, no step loop. The AI SDK is the right primitive for the brain and is already installed; nothing else here should be kept.

### Storage

One Postgres table on Supabase (region ap-south-1), RLS on with no policies, accessed only with the service-role key from the server.

```
messages(id, channel, user_id, role, content, provider_message_id, created_at)
```

That is the entire data model. There is no users table, no sessions, no people, no preferences, no jobs.

### Users, sessions, identity

Identity is the phone number, scoped per channel. The same human on WhatsApp and iMessage is two unrelated `user_id`s. There is no authentication beyond "the provider says this number sent it", which is correct for messaging but means there is no account to attach preferences, people or approvals to. Conversation state is the flat transcript, nothing more.

### Agents, jobs, background processing

None. The closest thing to a job is the `after()` callback, which dies with the function. There is no queue, no cron, no retry, no idempotency key beyond the inbound dedupe. Vercel's limits for this project: default and maximum 300 s per invocation on Hobby, 800 s on Pro. The routes currently cap themselves at 60 s, which is enough for a chat reply and not enough for a multi-source search with verification.

### External integrations

Only OpenRouter, Meta, Sendblue and Supabase. No search API, no browser, no payments, no maps, no commerce or reservation providers, no voice. The Vercel plugin in this environment exposes Sandbox (headless browser later) and Workflow (durable execution later), neither in use.

### Production quality vs prototype

| Production-usable as is | Prototype or missing |
|---|---|
| Channel adapters and their auth | Memory is a flat transcript with no schema for anything else |
| Ack-first webhook pipeline | No retry; failures after ack are silent to the user |
| Inbound dedupe | `maxDuration = 60` too low for concierge work |
| Lazy env, service-role isolation | No tests, no CI, no lint |
| Dev chat route as a transport-free entry | Meta on a test number with a 24 h token (operational hazard, not code) |
| | Supabase free tier **auto-pauses after 7 days idle**; it was paused from about 2026-10-05 until restored during this audit. No traffic in that window, but any message would have failed silently |

### What is cleanly reusable

- `Channel` interface and both adapters, unchanged.
- `handleInbound.ts` as the transport edge. It will hand off to a job runner instead of calling `respond()` directly.
- `env.ts`, `webhookAuth.ts`, `supabase.ts` as is.
- The AI SDK + OpenRouter provider for every LLM call, including structured output and tool loops.
- `messages` table as the conversation transcript; it becomes one table among several.
- The dev chat route pattern, extended into the inspection harness.

## 2. Gaps against the target architecture

1. **No durable job.** Everything happens inside one request-scoped callback.
2. **No structured intent.** The model goes straight from text to text.
3. **No memory primitives.** No users, people, preferences, search or transaction history.
4. **No capability layer.** No search providers, no normalised candidates, no ranking, no verification.
5. **No authority boundary.** Nothing distinguishes "reply" from "act".
6. **No inspection surface.** The only observability is `console.error` in Vercel logs this machine cannot read.
7. **No cross-channel identity.** Needed before preferences mean anything.
8. **Time budget.** 60 s routes and no resumption.

## 3. Recommended first vertical: product purchase / deal search

Restaurant reservation in India cannot be verified or executed deterministically: Zomato, Swiggy Dineout and EazyDiner have no public APIs, and table availability is only observable through a browser or a phone call. Google Places gives discovery but nothing transaction-critical. The slice would stop at "here are two places" with unverifiable availability, which fails the brief's verification requirement.

Product search can satisfy every step of the slice today:

- Discovery from two genuinely different paths: a web/shopping search API, and direct merchant page fetches with structured-data extraction (JSON-LD `Product`/`Offer` on Apple, Croma, Reliance Digital, Vijay Sales; Amazon and Flipkart need HTML parsing or a browser).
- Normalisation into a candidate record with price, total price, seller, stock, delivery estimate, return policy, source and `checked_at`.
- Deterministic hard constraints (budget, "legitimate" meaning first-party or authorised seller).
- Late verification by refetching the winning offer's page just before recommending.
- Execution as far as a prepared checkout: a product URL, chosen seller, verified price, then `awaiting_approval`. No money moves.
- Benchmark fixture "AirPods Pro 3 under ₹20,000" is realistic for this path.

The restaurant and guitar-technician scenarios get fixtures and an intent schema now, and the people/preference model is designed for them, so nothing here blocks them later.

## 4. Smallest technically sound migration path

Keep the transports. Insert a job runner between `handleInbound.ts` and the model. Grow the schema. Build the harness first so every later step is visible.

### Schema (new Supabase migrations)

```
users          id, created_at, display_name
identities     user_id, channel, address (E.164), unique(channel, address)   -- merges WhatsApp + iMessage
people         id, user_id, name, relationship, notes, attributes jsonb
preferences    id, user_id, subject_person_id (null = the user), scope, statement, polarity,
               confidence, source ('explicit'|'inferred'), evidence jsonb[], first_seen, last_seen,
               superseded_by
jobs           id, user_id, channel, status, intent jsonb, constraints jsonb, plan jsonb,
               result jsonb, approval jsonb, error, created_at, updated_at, version
job_events     id, job_id, seq, type, payload jsonb, at            -- append-only trace
candidates     id, job_id, source, external_id, normalized jsonb, raw jsonb, eliminated_reason,
               score jsonb, verification jsonb, checked_at
search_plans   id, job_id, source, requested, attempted, succeeded, candidate_count, failure
transactions   id, user_id, job_id, person_id, merchant, amount, currency, status, outcome
messages       unchanged, gains nullable job_id
```

`messages.user_id` stays the raw address for backwards compatibility; `identities` maps it to a `users.id`.

### Code layout (additive)

```
lib/jobs/        types.ts (Job, JobStatus, JobEvent), store.ts (Supabase CRUD + optimistic version),
                 runner.ts (step loop: interpret -> plan -> search -> normalize -> filter -> rank ->
                 verify -> propose -> await approval), steps are idempotent and resumable
lib/intent/      schema.ts (zod/JSON schema per intent), interpret.ts (one structured-output call)
lib/memory/      users.ts, people.ts, preferences.ts, context.ts (scoped retrieval for a job)
lib/capabilities/types.ts (Capability: search(plan) -> RawResult[], verify(candidate), execute(action))
lib/capabilities/search/*.ts   web-search provider, merchant-page provider
lib/candidates/  normalize.ts, constraints.ts (hard filters), rank.ts (intent-weighted scoring)
lib/authority/   policy.ts (action -> auto | scoped | approval), never consulted by the model alone
lib/concierge.ts becomes the brain: interpret, decide, narrate from job evidence
app/api/dev/jobs/*  harness routes; scripts/concierge.mjs CLI that prints the full trace
```

### Runtime

Jobs run inside `after()` for now, with `maxDuration` raised to 300 and every step persisting its output before moving on, so a timeout or crash resumes from the last completed step on the next tick (a cron route, or the user's next message). Vercel Workflow is the upgrade when phone calls or browser sessions push a single job past the function limit; the step shape is designed so that swap is mechanical.

### Credentials and provider access required

| Need | Options | Why |
|---|---|---|
| Web / shopping search API key | Serper.dev, SerpAPI, Brave Search, Tavily | Second acquisition path; none are free at volume |
| None for merchant page fetch | plain `fetch` + JSON-LD parsing | First path, works today |
| Supabase on a paid tier, or a keep-alive ping | | Free tier pauses the database after 7 idle days |
| Permanent Meta System User token | Business Settings | Temporary token expires daily |
| Later: Vercel Sandbox or Browserbase | | Browser fallback for Amazon/Flipkart and checkout |
| Later: Google Places key | | Restaurant and local-service discovery |

### Order of work (Stage B will break these into testable milestones)

1. Schema migration, users + identities, backfill from `messages`.
2. Job store, event trace, runner skeleton with a no-op pipeline; harness CLI prints the trace.
3. Intent interpretation with structured output; fixtures for the three benchmark scenarios.
4. Memory primitives: people, preferences with provenance, scoped context retrieval.
5. Capability interface, candidate model, deterministic constraints and ranking.
6. Merchant-page search provider, then the search-API provider.
7. Verification step and the authority policy; `awaiting_approval` on checkout.
8. Wire `handleInbound.ts` to create or resume a job; the brain narrates from evidence.
9. Evaluation run on the AirPods scenario with the full trace.

## 5. Risks

- **Search source legitimacy in India.** Amazon.in and Flipkart block naive fetches; the first slice may rely on first-party and large-chain retailers until the browser capability exists. The trace must show that honestly.
- **Model choice.** GLM 5.3 Flash spends tokens on reasoning before answering; structured-output reliability for intent extraction must be measured, with a fallback model via the same provider.
- **Free-tier infrastructure.** Supabase pausing and Meta's 24 h token are the two things most likely to take the product down again.
- **Scope creep in memory.** The preference model is easy to over-design; the first slice needs only user-level, category-scoped preferences with evidence pointers.
