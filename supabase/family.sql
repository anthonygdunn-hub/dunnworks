-- Dunn Family Hub — dunnworks.io/family
-- Family calendar (two-way with the joint Google calendar), school notices, Tesco list,
-- meal planner, kids' chores / stars / pocket money, bins, reminders, birthdays,
-- countdowns, noticeboard and contacts.
-- Project acdpgarasgfhvupzsbxf. Applied 22 Nov 2026.
--
-- How access works
--   Only email addresses listed in fam_members can use the app (Nana included, she sees
--   everything). Admins add or remove logins from Home > Settings. info@dunnworks.io is
--   always an admin. Every fam_ table is readable and writable by members only.
--   fam_events is written only by the fam-cal edge function, which keeps it in step with
--   Google Calendar. fam_private (cron key) is service role only.

-- ------------------------------------------------------------------ members
create table if not exists public.fam_members (
  email     text primary key check (email = lower(email)),
  name      text not null,
  role      text not null default 'adult' check (role in ('admin','adult')),
  added_at  timestamptz not null default now()
);
alter table public.fam_members enable row level security;

create or replace function public.fam_is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.dw_is_owner() or exists (
    select 1 from public.fam_members where email = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;

create or replace function public.fam_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.dw_is_owner() or exists (
    select 1 from public.fam_members where email = lower(coalesce(auth.jwt() ->> 'email', '')) and role = 'admin')
$$;

drop policy if exists "fam members read" on public.fam_members;
create policy "fam members read" on public.fam_members for select to authenticated using (public.fam_is_member());
drop policy if exists "fam admins manage" on public.fam_members;
create policy "fam admins manage" on public.fam_members for all to authenticated
  using (public.fam_is_admin()) with check (public.fam_is_admin());

-- ------------------------------------------------------------------ private (service role only)
create table if not exists public.fam_private (k text primary key, v text not null);
alter table public.fam_private enable row level security;
comment on table public.fam_private is 'Family Hub secrets (Google service account, cron key). Deny-all by design: service role only. Do not add a policy.';

-- ------------------------------------------------------------------ people (whose calendar)
create table if not exists public.fam_people (
  id      text primary key,
  name    text not null,
  kind    text not null default 'adult' check (kind in ('adult','child','group')),
  colour  text not null default '#1a9aa0',
  gcal_colour text,                      -- Google event colorId 1-11
  drives  boolean not null default false, -- can do lifts
  sort    int not null default 100,
  active  boolean not null default true
);

-- ------------------------------------------------------------------ events (mirror of Google)
create table if not exists public.fam_events (
  id          text primary key,           -- 'g:<google instance id>' or 'l:<uuid>' while local only
  series_id   text,                       -- google recurring event id
  title       text not null,
  all_day     boolean not null default false,
  starts_at   timestamptz,
  ends_at     timestamptz,
  start_date  date,
  end_date    date,                       -- exclusive, like Google
  location    text,
  notes       text,
  people      text[] not null default '{family}',
  driver      text,
  needs_lift  boolean not null default false,
  recurrence  text,                       -- local series only: weekly | fortnightly | monthly | yearly
  until_date  date,
  source      text not null default 'app' check (source in ('app','google')),
  sync_status text not null default 'synced' check (sync_status in ('synced','local','error')),
  sync_error  text,
  created_by  text,
  updated_at  timestamptz not null default now()
);
create index if not exists fam_events_start_idx on public.fam_events (coalesce(starts_at, start_date::timestamptz));

-- ------------------------------------------------------------------ everything else
create table if not exists public.fam_school (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null, ends_on date,
  title text not null,
  kind text not null default 'note' check (kind in ('non_uniform','inset','holiday','trip','event','note')),
  people text[] not null default '{stanley,shyla}',
  notes text, created_by text, updated_at timestamptz not null default now()
);
create table if not exists public.fam_shopping (
  id uuid primary key default gen_random_uuid(),
  item text not null, qty text, aisle text not null default 'Other',
  done boolean not null default false, done_at timestamptz,
  cleared boolean not null default false,
  added_by text, meal_day date, created_at timestamptz not null default now()
);
create table if not exists public.fam_recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null unique, ingredients text[] not null default '{}', url text, notes text,
  updated_at timestamptz not null default now()
);
create table if not exists public.fam_meals (
  id uuid primary key default gen_random_uuid(),
  day date not null, slot text not null default 'tea',
  title text not null, ingredients text[] not null default '{}', cook text, notes text,
  updated_at timestamptz not null default now(),
  unique (day, slot)
);
create table if not exists public.fam_chores (
  id uuid primary key default gen_random_uuid(),
  kid text not null references public.fam_people(id) on delete cascade,
  title text not null,
  freq text not null default 'daily' check (freq in ('daily','weekly')),
  days int[],                              -- daily chores: 0=Mon..6=Sun; null = every day
  stars int not null default 1 check (stars between 0 and 20),
  active boolean not null default true, sort int not null default 100,
  created_at timestamptz not null default now()
);
create table if not exists public.fam_chore_done (
  chore_id uuid not null references public.fam_chores(id) on delete cascade,
  done_on date not null,                   -- weekly chores: the Monday of that week
  kid text not null, ticked_by text, created_at timestamptz not null default now(),
  primary key (chore_id, done_on)
);
create table if not exists public.fam_pocket (
  kid text not null, week_start date not null,
  amount numeric(6,2) not null, status text not null check (status in ('paid','missed')),
  paid_by text, paid_at timestamptz not null default now(),
  primary key (kid, week_start)
);
create table if not exists public.fam_stars (
  id uuid primary key default gen_random_uuid(),
  kid text not null, delta int not null, reason text, by text,
  created_at timestamptz not null default now()
);
create table if not exists public.fam_rewards (
  id uuid primary key default gen_random_uuid(),
  kid text, title text not null, cost int not null check (cost > 0), active boolean not null default true
);
create table if not exists public.fam_reminders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'other',
  due_on date not null, remind_days int not null default 30,
  repeat text not null default 'yearly' check (repeat in ('none','monthly','yearly')),
  notes text, updated_at timestamptz not null default now()
);
create table if not exists public.fam_birthdays (
  id uuid primary key default gen_random_uuid(),
  name text not null, month int not null check (month between 1 and 12), day int not null check (day between 1 and 31),
  year int, relation text, notes text
);
create table if not exists public.fam_countdowns (
  id uuid primary key default gen_random_uuid(),
  title text not null, on_date date not null, emoji text, notes text
);
create table if not exists public.fam_bins (
  id uuid primary key default gen_random_uuid(),
  label text not null, colour text not null default '#3a3f4b',
  every_weeks int not null default 2 check (every_weeks between 1 and 4),
  next_on date not null, notes text, sort int not null default 100
);
create table if not exists public.fam_notices (
  id uuid primary key default gen_random_uuid(),
  body text not null, author text, pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.fam_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null, role text, phone text, email text, notes text, sort int not null default 100
);
create table if not exists public.fam_settings (
  key text primary key, value jsonb not null, updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ row level security
do $$
declare t text;
begin
  foreach t in array array['fam_people','fam_school','fam_shopping','fam_recipes','fam_meals','fam_chores',
    'fam_chore_done','fam_pocket','fam_stars','fam_rewards','fam_reminders','fam_birthdays','fam_countdowns',
    'fam_bins','fam_notices','fam_contacts','fam_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "fam family only" on public.%I', t);
    execute format('create policy "fam family only" on public.%I for all to authenticated using (public.fam_is_member()) with check (public.fam_is_member())', t);
  end loop;
end $$;

alter table public.fam_events enable row level security;
drop policy if exists "fam events read" on public.fam_events;
create policy "fam events read" on public.fam_events for select to authenticated using (public.fam_is_member());
-- writes only through the fam-cal edge function (service role)

-- live updates on the phones
do $$
declare t text;
begin
  foreach t in array array['fam_events','fam_shopping','fam_chore_done','fam_notices','fam_meals','fam_school'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------------ seed
insert into public.fam_members (email, name, role) values
  ('zoeants2017@gmail.com', 'Anthony & Zoe', 'admin')
on conflict (email) do nothing;

insert into public.fam_people (id, name, kind, colour, gcal_colour, drives, sort) values
  ('family',  'Family',  'group', '#16938f', '7',  false, 10),
  ('anthony', 'Anthony', 'adult', '#3b6fe0', '9',  true,  20),
  ('zoe',     'Zoe',     'adult', '#d6457a', '4',  true,  30),
  ('stanley', 'Stanley', 'child', '#2f9e5b', '10', false, 40),
  ('shyla',   'Shyla',   'child', '#8a5bd6', '3',  false, 50),
  ('nana',    'Nana',    'adult', '#e08a1e', '6',  true,  60)
on conflict (id) do nothing;

insert into public.fam_settings (key, value) values
  ('pocket_money', '5'::jsonb),
  ('gcal_id', '"zoeants2017@gmail.com"'::jsonb)
on conflict (key) do nothing;

-- Greatham Primary follows the Hampshire County Council calendar (2026/27).
-- Inset days are set by the school, so add those from the newsletter.
insert into public.fam_school (starts_on, ends_on, title, kind, notes)
select * from (values
  ('2026-12-19'::date, '2027-01-03'::date, 'Christmas holidays', 'holiday', 'Autumn term ends Fri 18 Dec. Back Mon 4 Jan.'),
  ('2027-02-15'::date, '2027-02-19'::date, 'February half term', 'holiday', null),
  ('2027-03-26'::date, '2027-04-09'::date, 'Easter holidays', 'holiday', null),
  ('2027-07-22'::date, '2027-08-31'::date, 'Summer holidays', 'holiday', 'Last day of term Wed 21 Jul.')
) v(a,b,c,d,e)
where not exists (select 1 from public.fam_school);

insert into public.fam_countdowns (title, on_date, emoji)
select 'Christmas Day', '2026-12-25', '🎄' where not exists (select 1 from public.fam_countdowns);

-- the regular clubs, waiting to go up to Google
insert into public.fam_events (id, title, starts_at, ends_at, people, driver, needs_lift, recurrence, sync_status, created_by)
select * from (values
  ('l:seed-shyla-tue', 'Shyla dancing', '2026-11-24 16:45:00 Europe/London'::timestamptz, '2026-11-24 17:30:00 Europe/London'::timestamptz, '{shyla}'::text[], null::text, true, 'weekly', 'local', 'setup'),
  ('l:seed-shyla-sat', 'Shyla dancing', '2026-11-28 10:00:00 Europe/London'::timestamptz, '2026-11-28 12:30:00 Europe/London'::timestamptz, '{shyla}'::text[], null::text, true, 'weekly', 'local', 'setup'),
  ('l:seed-stan-sat',  'Stanley football', '2026-11-28 09:30:00 Europe/London'::timestamptz, '2026-11-28 10:30:00 Europe/London'::timestamptz, '{stanley}'::text[], 'anthony', true, 'weekly', 'local', 'setup')
) v
on conflict (id) do nothing;

-- cron key (the Google service account key lives in the FAM_GOOGLE_SA edge function secret)
insert into public.fam_private (k, v) values ('cron', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (k) do nothing;
