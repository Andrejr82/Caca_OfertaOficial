create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'ready', 'approved', 'failed', 'cancelled')),
  script text not null,
  video_url text,
  audio_url text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  approved_at timestamptz
);

create index if not exists video_jobs_user_created_idx on public.video_jobs(user_id, created_at desc);
create index if not exists video_jobs_status_idx on public.video_jobs(status);

alter table public.video_jobs enable row level security;

drop policy if exists "video jobs are readable by owner" on public.video_jobs;
create policy "video jobs are readable by owner"
  on public.video_jobs for select
  using (auth.uid() = user_id);

drop policy if exists "video jobs are insertable by owner" on public.video_jobs;
create policy "video jobs are insertable by owner"
  on public.video_jobs for insert
  with check (auth.uid() = user_id);

drop policy if exists "video jobs are updatable by owner" on public.video_jobs;
create policy "video jobs are updatable by owner"
  on public.video_jobs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_video_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists video_jobs_updated_at on public.video_jobs;
create trigger video_jobs_updated_at
before update on public.video_jobs
for each row execute function public.set_video_jobs_updated_at();
