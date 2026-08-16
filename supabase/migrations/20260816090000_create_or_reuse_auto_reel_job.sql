create or replace function public.create_or_reuse_auto_reel_job(
  _user_id uuid,
  _offer_id uuid,
  _script text,
  _metadata jsonb
)
returns public.video_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  _job public.video_jobs;
begin
  perform pg_advisory_xact_lock(hashtext('auto-reel:' || _user_id::text || ':' || _offer_id::text));

  select * into _job
    from public.video_jobs
   where user_id = _user_id
     and offer_id = _offer_id
     and template_id = 'auto-reel-v1'
     and stage in ('queued', 'planning', 'generating_visual', 'scenes_ready', 'analyzing', 'dubbing', 'rendering', 'ready_for_review')
   order by created_at desc
   limit 1;

  if found then return _job; end if;

  insert into public.video_jobs (
    user_id,
    offer_id,
    status,
    stage,
    script,
    video_url,
    template_id,
    metadata
  ) values (
    _user_id,
    _offer_id,
    'processing',
    'planning',
    _script,
    null,
    'auto-reel-v1',
    coalesce(_metadata, '{}'::jsonb)
  )
  returning * into _job;

  return _job;
end;
$$;

revoke all on function public.create_or_reuse_auto_reel_job(uuid, uuid, text, jsonb) from public;
grant execute on function public.create_or_reuse_auto_reel_job(uuid, uuid, text, jsonb) to service_role;
