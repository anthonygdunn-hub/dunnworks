-- Awayday (awayday.golf): golf courses, society packages, course reviews and quote requests.
-- Sister site to Honest Handicap: it shares the hh_testers panel, so a tester code works on both.
--
-- Nothing here is readable or writable with the anon key. The site's forms go through the
-- aw-review and aw-quote edge functions (service role), the console goes through aw-admin and the
-- owner policies below, and the static build reads only the security-definer functions at the bottom.
--
-- Two ways to review a course:
--   tester    an Honest Handicap tester code. Name and home course come from their tester record
--   verified  anyone, with a photo of their scorecard or booking receipt as proof of the round.
--             The proof stays private (aw-uploads) and is only ever seen in the console

create table if not exists public.aw_courses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  slug text unique,
  name text not null,
  region text,                       -- "Surrey", "Algarve"
  country text not null default 'England',
  kind text check (kind in ('links','heathland','parkland','downland','moorland','clifftop','woodland','resort','other')),
  holes smallint default 18,
  par smallint,
  yards integer,
  summary text,                      -- a short honest description, written by Anthony
  society_note text,                 -- what the club offers groups, in plain words
  visitors text,                     -- "Weekdays, and weekends after 2pm"
  handicap_cert text,
  buggies text,
  dress text,
  airport text,
  website text,
  photos text[] not null default '{}',   -- paths in the public aw-public bucket
  status text not null default 'draft' check (status in ('draft','published','hidden')),
  featured boolean not null default false,
  published_at timestamptz,
  admin_note text
);
create index if not exists aw_courses_status on public.aw_courses (status, name);

create table if not exists public.aw_packages (
  id uuid primary key default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  course_id uuid not null references public.aw_courses(id) on delete cascade,
  name text not null,                -- "Society day", "Two-round summer package"
  price numeric(8,2),                -- per head
  currency text not null default 'GBP' check (currency in ('GBP','EUR')),
  min_players smallint,
  max_players smallint,
  includes text[] not null default '{}',
  days text,                         -- "Monday to Thursday"
  deposit text,
  active boolean not null default true,
  sort smallint not null default 0
);
create index if not exists aw_packages_course on public.aw_packages (course_id, sort);

create table if not exists public.aw_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  course_id uuid not null references public.aw_courses(id) on delete cascade,
  route text not null check (route in ('tester','verified')),
  tester_id uuid references public.hh_testers(id) on delete set null,
  name text not null,                -- first name only is ever published
  email text,
  handicap numeric(4,1),
  society text,
  group_size smallint,
  start_type text,                   -- tee times / shotgun / two-tee start
  played_on date,
  layout smallint check (layout between 1 and 10),
  greens smallint check (greens between 1 and 10),
  condition smallint check (condition between 1 and 10),
  welcome smallint check (welcome between 1 and 10),   -- society scores: only when they came as a group
  pace smallint check (pace between 1 and 10),
  food smallint check (food between 1 and 10),
  value smallint check (value between 1 and 10),
  overall smallint check (overall between 1 and 10),
  rebook boolean,
  oneline text,
  writeup text,
  tip text,
  proof text,                        -- private path in aw-uploads (scorecard or receipt photo)
  status text not null default 'submitted' check (status in ('submitted','published','rejected','unpublished')),
  published_at timestamptz,
  admin_note text,
  ip_hash text
);
create index if not exists aw_reviews_course on public.aw_reviews (course_id, status);
create index if not exists aw_reviews_status on public.aw_reviews (status, published_at desc);

create table if not exists public.aw_quotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text,
  society text,
  players smallint,
  dates text,
  budget text,
  course_ids uuid[] not null default '{}',
  notes text,
  status text not null default 'new' check (status in ('new','contacted','quoted','booked','closed')),
  admin_note text,
  ip_hash text
);
create index if not exists aw_quotes_status on public.aw_quotes (status, created_at desc);

create table if not exists public.aw_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.aw_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists aw_courses_touch on public.aw_courses;
create trigger aw_courses_touch before update on public.aw_courses for each row execute function public.aw_touch();
drop trigger if exists aw_packages_touch on public.aw_packages;
create trigger aw_packages_touch before update on public.aw_packages for each row execute function public.aw_touch();
drop trigger if exists aw_reviews_touch on public.aw_reviews;
create trigger aw_reviews_touch before update on public.aw_reviews for each row execute function public.aw_touch();
drop trigger if exists aw_quotes_touch on public.aw_quotes;
create trigger aw_quotes_touch before update on public.aw_quotes for each row execute function public.aw_touch();

alter table public.aw_courses enable row level security;
alter table public.aw_packages enable row level security;
alter table public.aw_reviews enable row level security;
alter table public.aw_quotes enable row level security;
alter table public.aw_settings enable row level security;

do $$ declare t text; begin
  foreach t in array array['aw_courses','aw_packages','aw_reviews','aw_quotes','aw_settings'] loop
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.dw_is_owner())) with check ((select public.dw_is_owner()))', t || '_owner', t);
  end loop;
end $$;

-- proofs stay private; course photos are public and uploaded from the console by the owner
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aw-uploads', 'aw-uploads', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']),
       ('aw-public', 'aw-public', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists aw_uploads_owner_read on storage.objects;
create policy aw_uploads_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'aw-uploads' and (select public.dw_is_owner()));
drop policy if exists aw_public_owner_write on storage.objects;
create policy aw_public_owner_write on storage.objects for all to authenticated
  using (bucket_id = 'aw-public' and (select public.dw_is_owner()))
  with check (bucket_id = 'aw-public' and (select public.dw_is_owner()));

-- what the static build reads (publishable key is enough): published courses with their active packages
create or replace function public.aw_published_courses()
returns table (
  id uuid, slug text, name text, region text, country text, kind text, holes smallint, par smallint, yards integer,
  summary text, society_note text, visitors text, handicap_cert text, buggies text, dress text, airport text, website text,
  photos text[], featured boolean, published_at timestamptz, updated_at timestamptz, packages jsonb
) language sql stable security definer set search_path = '' as $$
  select c.id, c.slug, c.name, c.region, c.country, c.kind, c.holes, c.par, c.yards,
         c.summary, c.society_note, c.visitors, c.handicap_cert, c.buggies, c.dress, c.airport, c.website,
         c.photos, c.featured, c.published_at, c.updated_at,
         coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'price', p.price, 'currency', p.currency,
                     'min', p.min_players, 'max', p.max_players, 'includes', p.includes, 'days', p.days, 'deposit', p.deposit) order by p.sort, p.price)
                   from public.aw_packages p where p.course_id = c.id and p.active), '[]'::jsonb)
  from public.aw_courses c where c.status = 'published' and c.slug is not null
  order by c.name
$$;

-- published reviews: first name only, never the email or the proof
create or replace function public.aw_published_reviews()
returns table (
  id uuid, course_id uuid, route text, first_name text, handicap numeric, home_course text, society text, group_size smallint,
  start_type text, played_on date, layout smallint, greens smallint, condition smallint, welcome smallint, pace smallint,
  food smallint, value smallint, overall smallint, rebook boolean, oneline text, writeup text, tip text, published_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select r.id, r.course_id, r.route, split_part(trim(r.name), ' ', 1), r.handicap,
         (select t.course from public.hh_testers t where t.id = r.tester_id and t.consent),
         r.society, r.group_size, r.start_type, r.played_on, r.layout, r.greens, r.condition, r.welcome, r.pace,
         r.food, r.value, r.overall, r.rebook, r.oneline, r.writeup, r.tip, r.published_at
  from public.aw_reviews r join public.aw_courses c on c.id = r.course_id and c.status = 'published'
  where r.status = 'published'
  order by r.published_at desc
$$;

revoke all on function public.aw_published_courses() from public;
revoke all on function public.aw_published_reviews() from public;
grant execute on function public.aw_published_courses() to anon, authenticated;
grant execute on function public.aw_published_reviews() to anon, authenticated;

-- the workflow's 15-minute check
create or replace function public.aw_last_change()
returns timestamptz language sql stable security definer set search_path = '' as $$
  select greatest(
    (select max(updated_at) from public.aw_courses where status <> 'draft'),
    (select max(updated_at) from public.aw_packages),
    (select max(updated_at) from public.aw_reviews where status <> 'submitted'),
    (select max(updated_at) from public.aw_settings where key = 'last_build'),
    'epoch'::timestamptz)
$$;
revoke all on function public.aw_last_change() from public;
grant execute on function public.aw_last_change() to anon, authenticated;
