-- Add Facebook as a persisted content channel without changing existing rows.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select table_name, constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name in ('affiliate_links', 'posts')
      and constraint_type = 'CHECK'
      and constraint_name in ('affiliate_links_channel_check', 'posts_channel_check')
  loop
    execute format('alter table public.%I drop constraint if exists %I', constraint_row.table_name, constraint_row.constraint_name);
  end loop;
end;
$$;

alter table public.affiliate_links
  add constraint affiliate_links_channel_check
  check (channel in ('telegram', 'instagram', 'whatsapp', 'facebook'));

alter table public.posts
  add constraint posts_channel_check
  check (channel in ('telegram', 'instagram', 'whatsapp', 'facebook'));
