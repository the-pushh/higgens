-- The partial unique index from 0001 cannot be used as an ON CONFLICT target via PostgREST
-- (error 42P10). Replace it with a full unique index; NULLs (assistant rows) stay distinct.
drop index if exists public.messages_provider_msg_uidx;
create unique index messages_provider_msg_uidx
  on public.messages (channel, provider_message_id);
