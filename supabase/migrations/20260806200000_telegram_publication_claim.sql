-- Oracle Telegram publisher: reserve a draft before calling Telegram.
-- Apply only through the normal reviewed Supabase migration process; this task does not apply it to production.
alter table public.posts
  drop constraint if exists posts_status_check;

alter table public.posts
  add constraint posts_status_check
  check (status in ('draft', 'publishing', 'published', 'failed', 'deleted'));

alter table public.posts
  add column if not exists publishing_started_at timestamptz,
  add column if not exists publishing_idempotency_key text,
  add column if not exists publishing_error text;

create index if not exists posts_telegram_publishing_key_idx
  on public.posts(channel, publishing_idempotency_key)
  where channel = 'telegram' and publishing_idempotency_key is not null;
