-- Kjøres én gang i Supabase (SQL Editor) etter at migrasjonene er kjørt.
-- Privat bucket: ingen policies på storage.objects, så anon/authenticated har ingen tilgang.
-- Appen bruker service-nøkkelen på serversiden og deler bare ut signerte URL-er på 60 sekunder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kundeportal-media', 'kundeportal-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
