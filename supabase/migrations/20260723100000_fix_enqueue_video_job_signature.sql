-- Align the RPC signature used by the Vercel API with the database function.
-- The previous deployment exposed the arguments in a different order, which
-- made PostgREST reject named arguments before the function could run.

alter table public.video_jobs
  add column if not exists stage text not null default 'queued',
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0),
  add column if not exists worker_id text,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists template_id text not null default 'motion-v1';

drop policy if exists "video jobs are insertable by owner" on public.video_jobs;

drop function if exists public.enqueue_video_job(integer, uuid, integer, text, text, uuid);

create or replace function public.enqueue_video_job(
  _user_id uuid,
  _offer_id uuid,
  _script text,
  _template_id text default 'motion-v1',
  _daily_limit integer default 3,
  _queue_limit integer default 3
)
returns public.video_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  _today_count integer;
  _active_count integer;
  _daily_cap integer := least(greatest(coalesce(_daily_limit, 3), 1), 3);
  _queue_cap integer := least(greatest(coalesce(_queue_limit, 3), 1), 3);
  _job public.video_jobs;
begin
  if (select auth.uid()) is distinct from _user_id then
    raise exception 'VIDEO_USER_MISMATCH';
  end if;

  perform pg_advisory_xact_lock(hashtext('video-job:' || _user_id::text));

  select count(*) into _today_count
  from public.video_jobs
  where user_id = _user_id
    and created_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC');

  if _today_count >= _daily_cap then
    raise exception 'VIDEO_DAILY_LIMIT';
  end if;

  select count(*) into _active_count
  from public.video_jobs
  where user_id = _user_id
    and status in ('queued', 'processing');

  if _active_count >= _queue_cap then
    raise exception 'VIDEO_QUEUE_LIMIT';
  end if;

  insert into public.video_jobs (user_id, offer_id, script, status, stage, template_id, metadata)
  values (_user_id, _offer_id, _script, 'queued', 'queued', _template_id, jsonb_build_object('templateId', _template_id))
  returning * into _job;

  return _job;
end;
$$;

revoke all on function public.enqueue_video_job(uuid, uuid, text, text, integer, integer) from public;
grant execute on function public.enqueue_video_job(uuid, uuid, text, text, integer, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
