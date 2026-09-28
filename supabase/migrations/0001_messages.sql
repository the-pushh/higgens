-- Conversation memory + webhook dedupe. Service role only (RLS on, no policies).
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  channel text not null check (channel in ('imessage', 'whatsapp')),
  user_id text not null,                 -- E.164 phone, e.g. +15555550100
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  provider_message_id text,              -- Meta wamid / Sendblue message_handle; null for assistant rows
  created_at timestamptz not null default now()
);

create unique index if not exists messages_provider_msg_uidx
  on public.messages (channel, provider_message_id)
  where provider_message_id is not null;

create index if not exists messages_user_idx
  on public.messages (channel, user_id, created_at);

alter table public.messages enable row level security;
