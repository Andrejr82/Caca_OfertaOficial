-- Storage for generated videos. The worker receives a signed upload token;
-- the service role remains server-side in Vercel.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'videos',
  'videos',
  true,
  104857600,
  array['video/mp4', 'audio/mpeg', 'audio/wav', 'image/jpeg']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
