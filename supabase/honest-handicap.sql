-- Honest Handicap: testers, review cards, photos and what the public build may read.
--
-- Nothing here is readable or writable with the anon key. The site's forms go through
-- the hh-join and hh-card edge functions (service role), the console goes through
-- hh-admin and the owner policies below, and the static build reads only the two
-- security-definer functions at the bottom, which return published, consented fields.

create table if not exists public.hh_testers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  handicap numeric(4,1),
  course text,
  often text,
  kit text,
  bag text,
  consent boolean not null default false,
  status text not null default 'applied' check (status in ('applied','approved','declined','left')),
  code_hash text unique,
  code_issued_at timestamptz,
  approved_at timestamptz,
  note text,
  ip_hash text
);
create index if not exists hh_testers_ip on public.hh_testers (ip_hash, created_at);

create table if not exists public.hh_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tester_id uuid references public.hh_testers(id) on delete set null,
  first_name text not null,
  handicap numeric(4,1),
  course text,
  product text not null,
  category text not null,
  source text,
  paid text,
  rounds text,
  performance smallint check (performance between 1 and 10),
  feel smallint check (feel between 1 and 10),
  build smallint check (build between 1 and 10),
  value smallint check (value between 1 and 10),
  overall smallint check (overall between 1 and 10),
  again boolean,
  oneline text,
  writeup text,
  suits text,
  notsuits text,
  annoyed text,
  photos text[] not null default '{}',      -- paths in the private hh-uploads bucket
  public_photos text[] not null default '{}', -- paths in the public hh-public bucket, set on publish
  status text not null default 'submitted' check (status in ('submitted','published','rejected','unpublished')),
  slug text unique,
  title text,
  buy_links jsonb not null default '[]',      -- [{retailer, url, price, affiliate:true}]
  prices_checked date,
  published_at timestamptz,
  admin_note text,
  ip_hash text
);
create index if not exists hh_reviews_status on public.hh_reviews (status, published_at desc);
create index if not exists hh_reviews_tester on public.hh_reviews (tester_id);

create table if not exists public.hh_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.hh_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists hh_reviews_touch on public.hh_reviews;
create trigger hh_reviews_touch before update on public.hh_reviews for each row execute function public.hh_touch();

alter table public.hh_testers enable row level security;
alter table public.hh_reviews enable row level security;
alter table public.hh_settings enable row level security;

drop policy if exists hh_testers_owner on public.hh_testers;
create policy hh_testers_owner on public.hh_testers for all to authenticated
  using ((select public.dw_is_owner())) with check ((select public.dw_is_owner()));
drop policy if exists hh_reviews_owner on public.hh_reviews;
create policy hh_reviews_owner on public.hh_reviews for all to authenticated
  using ((select public.dw_is_owner())) with check ((select public.dw_is_owner()));
drop policy if exists hh_settings_owner on public.hh_settings;
create policy hh_settings_owner on public.hh_settings for all to authenticated
  using ((select public.dw_is_owner())) with check ((select public.dw_is_owner()));

-- photos: uploads stay private until a review is published, then get copied to hh-public
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hh-uploads', 'hh-uploads', false, 10485760, array['image/jpeg','image/png','image/webp']),
       ('hh-public', 'hh-public', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists hh_uploads_owner_read on storage.objects;
create policy hh_uploads_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'hh-uploads' and (select public.dw_is_owner()));

-- what the static build reads (publishable key is enough)
create or replace function public.hh_published_reviews()
returns table (
  id uuid, slug text, title text, product text, category text, first_name text, handicap numeric, course text,
  source text, paid text, rounds text, performance smallint, feel smallint, build smallint, value smallint, overall smallint,
  again boolean, oneline text, writeup text, suits text, notsuits text, annoyed text, public_photos text[],
  buy_links jsonb, prices_checked date, published_at timestamptz, updated_at timestamptz, tester_id uuid
) language sql stable security definer set search_path = '' as $$
  select r.id, r.slug, r.title, r.product, r.category, r.first_name, r.handicap, r.course,
         r.source, r.paid, r.rounds, r.performance, r.feel, r.build, r.value, r.overall,
         r.again, r.oneline, r.writeup, r.suits, r.notsuits, r.annoyed, r.public_photos,
         coalesce((select jsonb_agg(l) from jsonb_array_elements(r.buy_links) l where (l->>'affiliate')::boolean is true and coalesce(l->>'url','') like 'https://%'), '[]'::jsonb),
         r.prices_checked, r.published_at, r.updated_at, r.tester_id
  from public.hh_reviews r where r.status = 'published' and r.slug is not null
  order by r.published_at desc
$$;

create or replace function public.hh_public_testers()
returns table (id uuid, first_name text, handicap numeric, course text, reviews bigint)
language sql stable security definer set search_path = '' as $$
  select t.id, split_part(trim(t.name), ' ', 1), t.handicap, t.course,
         (select count(*) from public.hh_reviews r where r.tester_id = t.id and r.status = 'published')
  from public.hh_testers t where t.status = 'approved' and t.consent
  order by 5 desc, t.approved_at
$$;

revoke all on function public.hh_published_reviews() from public;
revoke all on function public.hh_public_testers() from public;
grant execute on function public.hh_published_reviews() to anon, authenticated;
grant execute on function public.hh_public_testers() to anon, authenticated;

-- the workflow's 15-minute check: has anything that changes the site happened since the last deploy?
create or replace function public.hh_last_change()
returns timestamptz language sql stable security definer set search_path = '' as $$
  select greatest(
    (select max(updated_at) from public.hh_reviews where status <> 'submitted'),
    (select max(approved_at) from public.hh_testers),
    (select max(updated_at) from public.hh_settings where key = 'last_build'),
    'epoch'::timestamptz)
$$;
revoke all on function public.hh_last_change() from public;
grant execute on function public.hh_last_change() to anon, authenticated;
