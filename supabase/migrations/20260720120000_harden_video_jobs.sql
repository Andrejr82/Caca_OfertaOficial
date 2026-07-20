-- Video jobs are billable GPU work. Keep the limits and state transitions in
-- Postgres so parallel browser requests cannot bypass them.

alter table public.video_jobs
  add column if not exists stage text not null default 'queued',
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0),
  add column if not exists worker_id text,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists template_id text not null default 'motion-v1';

create index if not exists video_jobs_queue_claim_idx
  on public.video_jobs(status, created_at asc)
  where status = 'queued';

create index if not exists video_jobs_processing_heartbeat_idx
  on public.video_jobs(heartbeat_at asc)
  where status = 'processing';

-- Direct inserts would bypass quota protection. The authenticated application
-- must enqueue through this transactionally locked function instead.
drop policy if exists "video jobs are insertable by owner" on public.video_jobs;

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

create or replace function public.claim_next_video_job(_worker_id text, _stale_seconds integer default 1800)
returns public.video_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  _job public.video_jobs;
  _stale_interval interval := make_interval(secs => greatest(coalesce(_stale_seconds, 1800), 600));
begin
  update public.video_jobs
     set status = 'queued', stage = 'queued', worker_id = null, started_at = null, heartbeat_at = null,
         error_message = 'Job recolocado na fila após expirar o worker.'
   where status = 'processing'
     and coalesce(heartbeat_at, started_at) < now() - _stale_interval;

  select * into _job
    from public.video_jobs
   where status = 'queued'
   order by created_at asc
   for update skip locked
   limit 1;

  if not found then return null; end if;

  update public.video_jobs
     set status = 'processing', stage = 'claimed', worker_id = _worker_id,
         started_at = now(), heartbeat_at = now(), attempt_count = _job.attempt_count + 1,
         error_message = null,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('lastWorkerId', _worker_id, 'lastClaimedAt', now())
   where id = _job.id
   returning * into _job;

  return _job;
end;
$$;

revoke all on function public.enqueue_video_job(uuid, uuid, text, text, integer, integer) from public;
revoke all on function public.claim_next_video_job(text, integer) from public;
grant execute on function public.enqueue_video_job(uuid, uuid, text, text, integer, integer) to authenticated, service_role;
grant execute on function public.claim_next_video_job(text, integer) to service_role;
