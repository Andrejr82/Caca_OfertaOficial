-- Align the worker claim RPC with the argument names used by the Lightning worker.
drop function if exists public.claim_next_video_job(integer, text);

create or replace function public.claim_next_video_job(
  _worker_id text,
  _stale_seconds integer default 1800
)
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
     set status = 'queued', stage = 'queued', worker_id = null, started_at = null,
         heartbeat_at = null,
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
         metadata = coalesce(metadata, '{}'::jsonb) ||
           jsonb_build_object('lastWorkerId', _worker_id, 'lastClaimedAt', now())
   where id = _job.id
   returning * into _job;

  return _job;
end;
$$;

revoke all on function public.claim_next_video_job(text, integer) from public;
grant execute on function public.claim_next_video_job(text, integer) to service_role;

notify pgrst, 'reload schema';
