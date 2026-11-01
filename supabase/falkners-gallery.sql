-- The Falkners Arms: gallery fed from the pub's Facebook Page
--
-- fa-facebook-sync copies new Page photos and videos into the public
-- "gallery" storage bucket (under falkners/) and inserts rows here with
-- approved = false, so nothing reaches the website until a manager approves
-- it. It needs a Page access token from a Page admin, stored as the edge
-- function secret FA_FB_PAGE_TOKEN (and FA_FB_PAGE_ID, default thefalknersarms).
-- Once that exists, schedule it hourly (see the bottom of this file).
--
-- Until then the gallery opens with the pub's own photos from its current
-- website (source = 'website').

create table if not exists public.fa_gallery (
  id          uuid primary key default gen_random_uuid(),
  external_id text unique,                 -- Facebook object id; null for others
  kind        text not null default 'photo' check (kind in ('photo','video')),
  image_url   text not null,               -- photo, or the video's thumbnail
  video_url   text,
  caption     text,
  taken_at    timestamptz not null default now(),
  source      text not null default 'facebook' check (source in ('facebook','website','staff')),
  approved    boolean not null default false,
  sort_order  int not null default 100,
  created_at  timestamptz not null default now()
);
create index if not exists fa_gallery_taken_idx on public.fa_gallery (taken_at desc);

alter table public.fa_gallery enable row level security;

drop policy if exists fa_gallery_public_read on public.fa_gallery;
create policy fa_gallery_public_read on public.fa_gallery for select to anon, authenticated using (approved);

drop policy if exists fa_gallery_owner_all on public.fa_gallery;
create policy fa_gallery_owner_all on public.fa_gallery for all to authenticated
  using (public.dw_is_owner()) with check (public.dw_is_owner());

-- Starter photos from the pub's current website
insert into public.fa_gallery (image_url, caption, source, approved, sort_order, taken_at) values
  ('https://thefalknersarms.co.uk/wp-content/uploads/2014/12/Frontage-Banner.jpg', 'The Falkners Arms on a summer''s day', 'website', true, 10, '2026-07-01'),
  ('https://thefalknersarms.co.uk/wp-content/uploads/2014/12/Garden-through-to-public-park-4.jpg', 'The garden, opening onto the park', 'website', true, 20, '2026-07-01'),
  ('https://thefalknersarms.co.uk/wp-content/uploads/2016/10/IMG_1764.jpg', 'Real ales on the bar', 'website', true, 30, '2026-06-01'),
  ('https://thefalknersarms.co.uk/wp-content/uploads/2016/10/Dancefloor-1600.jpg', 'Saturday Night Live', 'website', true, 40, '2026-06-01'),
  ('https://thefalknersarms.co.uk/wp-content/uploads/2014/12/bar-3.jpg', 'The bar', 'website', true, 50, '2026-05-01'),
  ('https://thefalknersarms.co.uk/wp-content/uploads/2015/01/The-Falkners-Arms-Dancing-01.jpg', 'A packed dance floor', 'website', true, 60, '2026-05-01'),
  ('https://thefalknersarms.co.uk/wp-content/uploads/2016/10/IMG_1766.jpg', 'The pool table', 'website', true, 70, '2026-04-01'),
  ('https://thefalknersarms.co.uk/wp-content/uploads/2014/12/Garden-through-to-public-park-3.jpg', 'Summer in the garden', 'website', true, 80, '2026-04-01')
on conflict do nothing;

-- When the Page token is in place:
-- select cron.schedule('fa-facebook-sync', '17 * * * *', $$
--   select net.http_post(url := 'https://acdpgarasgfhvupzsbxf.supabase.co/functions/v1/fa-facebook-sync',
--     headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb);
-- $$);
