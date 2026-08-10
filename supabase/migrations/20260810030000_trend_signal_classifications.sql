-- Tendências IA Fase 1C: triagem comercial versionada, sem matching ou publicação.

create table if not exists public.trend_signal_classifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trend_signal_id uuid not null references public.trend_signals(id) on delete cascade,
  commercial_relevance numeric(5,2) not null check (commercial_relevance >= 0 and commercial_relevance <= 100),
  is_product_intent boolean not null,
  normalized_product_term text,
  category_hint text,
  decision text not null check (decision in ('eligible', 'rejected')),
  reason text not null,
  ai_model text not null,
  strategy_version text not null,
  classified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, trend_signal_id, strategy_version)
);

create index if not exists trend_signal_classifications_user_decision_idx
  on public.trend_signal_classifications(user_id, decision, classified_at desc);

alter table public.trend_signal_classifications enable row level security;
drop policy if exists "trend signal classifications own" on public.trend_signal_classifications;
create policy "trend signal classifications own" on public.trend_signal_classifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
