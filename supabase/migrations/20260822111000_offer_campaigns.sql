create table if not exists public.offer_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'ready', 'active', 'completed', 'cancelled')),
  started_at timestamptz,
  ends_at timestamptz,
  completed_at timestamptz,
  channel_checklist jsonb not null default '{"instagram_reel":"pending","instagram_story":"pending","facebook_feed":"pending","facebook_group":"pending","whatsapp":"pending"}'::jsonb,
  official_links jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offer_campaigns_window_check check (ends_at is null or started_at is null or ends_at > started_at)
);

create index if not exists offer_campaigns_user_created_idx
  on public.offer_campaigns(user_id, created_at desc);

create index if not exists offer_campaigns_offer_idx
  on public.offer_campaigns(offer_id, created_at desc);

create unique index if not exists offer_campaigns_one_open_per_offer_uq
  on public.offer_campaigns(user_id, offer_id)
  where status in ('draft', 'ready', 'active');

alter table public.offer_campaigns enable row level security;

drop policy if exists "offer campaigns are readable by owner" on public.offer_campaigns;
create policy "offer campaigns are readable by owner"
  on public.offer_campaigns for select
  using (auth.uid() = user_id);

drop policy if exists "offer campaigns are insertable by owner" on public.offer_campaigns;
create policy "offer campaigns are insertable by owner"
  on public.offer_campaigns for insert
  with check (auth.uid() = user_id);

drop policy if exists "offer campaigns are updatable by owner" on public.offer_campaigns;
create policy "offer campaigns are updatable by owner"
  on public.offer_campaigns for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "offer campaigns are deletable by owner" on public.offer_campaigns;
create policy "offer campaigns are deletable by owner"
  on public.offer_campaigns for delete
  using (auth.uid() = user_id);

create or replace function public.set_offer_campaigns_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists offer_campaigns_updated_at on public.offer_campaigns;
create trigger offer_campaigns_updated_at
before update on public.offer_campaigns
for each row execute function public.set_offer_campaigns_updated_at();
