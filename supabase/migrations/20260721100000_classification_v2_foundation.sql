create table if not exists public.discovery_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  marketplace text not null,
  scenario text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.discovery_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  discovery_run_id uuid not null references public.discovery_runs(id) on delete cascade,
  marketplace text not null,
  external_id text,
  source_url text not null,
  raw_payload jsonb not null,
  title_raw text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.offer_classifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  discovery_item_id uuid not null unique references public.discovery_items(id) on delete cascade,
  classifier_version text not null,
  classification_status text not null check (classification_status in ('classified', 'review_required', 'excluded')),
  product_type text,
  product_role text not null check (product_role in ('main_product', 'accessory', 'bundle', 'coupon')),
  attributes jsonb not null default '{}'::jsonb,
  rule_trace jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.product_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  group_kind text not null check (group_kind in ('exact', 'family')),
  group_key text not null,
  product_type text not null,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, group_kind, group_key)
);

create table if not exists public.product_group_members (
  product_group_id uuid not null references public.product_groups(id) on delete cascade,
  discovery_item_id uuid not null references public.discovery_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_group_id, discovery_item_id)
);

alter table public.discovery_runs enable row level security;
alter table public.discovery_items enable row level security;
alter table public.offer_classifications enable row level security;
alter table public.product_groups enable row level security;
alter table public.product_group_members enable row level security;

create policy discovery_runs_owner_select on public.discovery_runs for select using (auth.uid() = user_id);
create policy discovery_runs_owner_insert on public.discovery_runs for insert with check (auth.uid() = user_id);
create policy discovery_runs_owner_update on public.discovery_runs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy discovery_runs_owner_delete on public.discovery_runs for delete using (auth.uid() = user_id);

create policy discovery_items_owner_select on public.discovery_items for select using (auth.uid() = user_id);
create policy discovery_items_owner_insert on public.discovery_items for insert with check (auth.uid() = user_id);
create policy discovery_items_owner_update on public.discovery_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy discovery_items_owner_delete on public.discovery_items for delete using (auth.uid() = user_id);

create policy offer_classifications_owner_select on public.offer_classifications for select using (auth.uid() = user_id);
create policy offer_classifications_owner_insert on public.offer_classifications for insert with check (auth.uid() = user_id);
create policy offer_classifications_owner_update on public.offer_classifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy offer_classifications_owner_delete on public.offer_classifications for delete using (auth.uid() = user_id);

create policy product_groups_owner_select on public.product_groups for select using (auth.uid() = user_id);
create policy product_groups_owner_insert on public.product_groups for insert with check (auth.uid() = user_id);
create policy product_groups_owner_update on public.product_groups for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy product_groups_owner_delete on public.product_groups for delete using (auth.uid() = user_id);

create policy product_group_members_owner_select on public.product_group_members for select using (exists (select 1 from public.product_groups g where g.id = product_group_id and g.user_id = auth.uid()));
create policy product_group_members_owner_insert on public.product_group_members for insert with check (exists (select 1 from public.product_groups g where g.id = product_group_id and g.user_id = auth.uid()));
create policy product_group_members_owner_update on public.product_group_members for update using (exists (select 1 from public.product_groups g where g.id = product_group_id and g.user_id = auth.uid())) with check (exists (select 1 from public.product_groups g where g.id = product_group_id and g.user_id = auth.uid()));
create policy product_group_members_owner_delete on public.product_group_members for delete using (exists (select 1 from public.product_groups g where g.id = product_group_id and g.user_id = auth.uid()));
