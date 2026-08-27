-- 0006_storage.sql — the bucket technician uploads land in.
--
-- PRIVATE, deliberately. These are photos of customers' homes, receipts, and
-- occasionally their faces. A public bucket would make every one of them
-- readable by anyone who guesses or leaks a URL, forever.
--
-- No storage policies are defined, which means anon and authenticated can do
-- nothing here — the same deny-all stance as the tables in 0003. All access is
-- mediated by short-lived signed URLs minted server-side with the service_role
-- key:
--
--   upload   -> createSignedUploadUrl() issues a one-shot token, and the BROWSER
--               PUTs the file straight to storage. It cannot go through a server
--               action: Next caps action bodies at 1MB by default and Vercel
--               caps function request bodies at 4.5MB, which two phone photos
--               would exceed. Going direct sidesteps both, and the service_role
--               key still never leaves the server.
--   download -> createSignedUrl() issues a time-limited read URL when a page
--               actually needs to render a file.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-docs',
  'order-docs',
  false,
  -- 50 MB: the highest any per-type rule allows (video). Per-type limits are
  -- enforced in the application, because a bucket has ONE size limit and cannot
  -- express "10 MB for images, 50 MB for video". This is the hard ceiling that
  -- catches a client lying about a file's size when redeeming a signed URL.
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm',
    'application/pdf'
  ]
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = excluded.public;

-- Verify:
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets;
--   select count(*) from pg_policies where schemaname = 'storage';  -- expect 0 of ours
