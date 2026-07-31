-- Video rendering is no longer restricted by the former Lightning provider quota.
-- Keep the function parameter for backwards-compatible RPC calls, but ignore it.

create or replace function public.enqueue_video_job(
  _user_id uuid,
  _offer_id uuid,
  _script text,
  _template_id text default 'motion-v1',
  _daily_limit integer default null,
  _queue_limit integer default 3
)
returns public.video_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  _active_count integer;
  _queue_cap integer := greatest(coalesce(_queue_limit, 3), 1);
  _job public.video_jobs;
begin
  if (select auth.uid()) is distinct from _user_id then
    raise exception 'VIDEO_USER_MISMATCH';
  end if;

  perform pg_advisory_xact_lock(hashtext('video-job:' || _user_id::text));

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
