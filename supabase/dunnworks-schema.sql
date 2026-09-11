-- Dunnworks admin — projects behind dunnworks.io/preview/ and dunnworks.io/admin/
-- Run once in the SQL editor of project acdpgarasgfhvupzsbxf.
--
-- Two tables on purpose. dw_projects holds what the public previews page is
-- allowed to show. dw_project_secrets holds the passphrases and is readable
-- only by the signed in owner. Row level security is row-level, not
-- column-level, so keeping the secrets in their own table is the only way to be
-- certain the anon key can never reach them.

create extension if not exists "pgcrypto";

-- Everything is gated on this one address. Change it here and nowhere else.
create or replace function public.dw_is_owner() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'info@dunnworks.io'
$$;

-- ------------------------------------------------------------------ projects
create table if not exists public.dw_projects (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  slug        text not null unique,          -- preview/<slug>/
  name        text not null,
  sector      text,
  blurb       text,

  kind        text not null default 'preview'
              check (kind in ('preview','case-study')),
  status      text not null default 'build'
              check (status in ('build','ready','live','archived')),

  is_live     boolean not null default false, -- the tick
  live_url    text,                           -- where it went live
  live_on     date,

  has_preview boolean not null default true,  -- is there a locked preview to open
  has_report  boolean not null default false,
  pages       int,
  report_on   date,
  sort_order  int not null default 100,
  published   boolean not null default true   -- show on the public previews page
);

create index if not exists dw_projects_order_idx on public.dw_projects (published, sort_order, name);

alter table public.dw_projects enable row level security;

-- the previews page reads this with the anon key, so only published rows
drop policy if exists "anyone can read published projects" on public.dw_projects;
create policy "anyone can read published projects"
  on public.dw_projects for select to anon using (published = true);

drop policy if exists "owner reads every project" on public.dw_projects;
create policy "owner reads every project"
  on public.dw_projects for select to authenticated using (public.dw_is_owner());

drop policy if exists "owner writes projects" on public.dw_projects;
create policy "owner writes projects"
  on public.dw_projects for all to authenticated
  using (public.dw_is_owner()) with check (public.dw_is_owner());

create or replace function public.dw_touch() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists dw_projects_touch on public.dw_projects;
create trigger dw_projects_touch before update on public.dw_projects
  for each row execute function public.dw_touch();

-- ------------------------------------------------------------------- secrets
-- Never readable with the anon key. No policy grants anon anything here, and
-- row level security denies by default.
create table if not exists public.dw_project_secrets (
  project_id  uuid primary key references public.dw_projects(id) on delete cascade,
  passphrase  text not null,
  issued_on   date not null default current_date,
  issued_to   text,                    -- who it was sent to, so you know who has it
  notes       text,
  updated_at  timestamptz not null default now()
);

alter table public.dw_project_secrets enable row level security;

drop policy if exists "owner reads secrets" on public.dw_project_secrets;
create policy "owner reads secrets"
  on public.dw_project_secrets for select to authenticated using (public.dw_is_owner());

drop policy if exists "owner writes secrets" on public.dw_project_secrets;
create policy "owner writes secrets"
  on public.dw_project_secrets for all to authenticated
  using (public.dw_is_owner()) with check (public.dw_is_owner());

drop trigger if exists dw_secrets_touch on public.dw_project_secrets;
create trigger dw_secrets_touch before update on public.dw_project_secrets
  for each row execute function public.dw_touch();

-- --------------------------------------------------------------------- seed
insert into public.dw_projects
  (slug, name, sector, blurb, kind, status, is_live, live_url, live_on, has_preview, has_report, pages, report_on, sort_order)
values
  ('ashland', 'Ashland Carpentry Services', 'Carpentry and joinery',
   'A carpenter and joiner in Fleet, trading since 2016, with a nine page platform site that showed almost none of the work. Rebuilt as 46 pages with location pages, guides and two working tools.',
   'preview', 'ready', false, null, null, true, true, 46, '2026-09-07', 10),

  ('take2', 'Take2Cleaning', 'Cleaning',
   'A domestic and commercial cleaning company in Bordon, with a three page platform build that put all eight services on one address and named no town it covers. Rebuilt as 38 pages with a page per service and a page per town.',
   'preview', 'ready', false, null, null, true, true, 38, '2026-09-11', 20),

  ('combustion-consulting', 'Combustion Consulting', 'Industrial consultancy',
   'A specialist consultancy explaining a service most buyers have never bought before. Rebuilt to lead on the problem rather than the credentials.',
   'case-study', 'live', true, 'https://combustionconsulting.co.uk', null, false, false, null, null, 110),

  ('aeroinspectors', 'AeroInspectors', 'Drone roof inspections',
   'Drone roof surveys across Hampshire and Surrey, with a published price list instead of price on request.',
   'case-study', 'live', true, 'https://aeroinspectors.io', null, false, false, null, null, 120),

  ('tcooper-interiors', 'T Cooper Interiors', 'Kitchens and bathrooms',
   'Kitchen and bathroom fitters in Farnborough, moved off a platform site and onto a build backed by a database, keeping the job photographs.',
   'case-study', 'live', true, 'https://www.tcooperinteriors.co.uk', null, false, false, null, null, 130),

  ('falkners-golf-society', 'The Falkners Arms Golf Society', 'Members club',
   'A golf society taken off paper, with a public site and a committee screen behind it handling 21 players and six side competitions.',
   'case-study', 'live', true, 'https://thefalknersarmsgolfsociety.co.uk', null, false, false, null, null, 140),

  ('farnborough-contracting', 'Farnborough Contracting Services', 'Drainage and groundworks',
   'A family run drainage, groundworks and surfacing contractor, rebuilt as 36 pages generated from one content file.',
   'case-study', 'live', true, 'https://www.farnboroughcontracting.com', null, false, false, 36, null, 150)
on conflict (slug) do nothing;

-- Passphrases for the two locked previews. Change them here or from the admin.
insert into public.dw_project_secrets (project_id, passphrase, issued_on, issued_to)
select id, 'tulipwood-bevel-stringer-stringer-6647', '2026-09-07', 'Scott Hansford'
from public.dw_projects where slug = 'ashland'
on conflict (project_id) do nothing;

insert into public.dw_project_secrets (project_id, passphrase, issued_on, issued_to)
select id, 'sparkle-round-GU35-2026', '2026-09-11', 'Take2Cleaning'
from public.dw_projects where slug = 'take2'
on conflict (project_id) do nothing;
