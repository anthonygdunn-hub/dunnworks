-- Dunnworks site dashboards (console Workspace → Dashboards).
-- One cookie-free counter for every site Dunnworks has built: dunnworks.io/t.js posts page views and
-- contact clicks here. Dashboards read them owner-only, alongside Search Console and PageSpeed.

create table if not exists public.dw_sites (
  slug        text primary key,
  name        text not null,
  url         text not null,                 -- https://example.co.uk/
  host        text not null,                 -- example.co.uk (www. stripped), for internal referrers
  project_id  uuid references public.dw_projects(id) on delete set null,
  repo        text,
  gsc         text,                          -- Search Console property, e.g. sc-domain:example.co.uk
  legacy      text,                          -- an older dashboard in the console (#/woolmer, #/cgc, #/traffic)
  tracker_on  date,                          -- when t.js went in
  active      boolean not null default true,
  sort        int not null default 100,
  created_at  timestamptz not null default now()
);
alter table public.dw_sites enable row level security;
drop policy if exists "owner all sites" on public.dw_sites;
create policy "owner all sites" on public.dw_sites for all to authenticated using (public.dw_is_owner()) with check (public.dw_is_owner());

create table if not exists public.dw_site_views (
  site text not null references public.dw_sites(slug) on delete cascade,
  day  date not null, path text not null, ref text not null default '', n int not null default 0,
  primary key (site, day, path, ref)
);
alter table public.dw_site_views enable row level security;

create table if not exists public.dw_site_events (
  site text not null references public.dw_sites(slug) on delete cascade,
  day  date not null, kind text not null, label text not null default '', path text not null default '', n int not null default 0,
  primary key (site, day, kind, label, path)
);
alter table public.dw_site_events enable row level security;

create table if not exists public.dw_site_keywords (
  id bigint generated always as identity primary key,
  site text not null references public.dw_sites(slug) on delete cascade,
  keyword text not null, page text, volume int, sort int not null default 100
);
alter table public.dw_site_keywords enable row level security;
drop policy if exists "owner all site keywords" on public.dw_site_keywords;
create policy "owner all site keywords" on public.dw_site_keywords for all to authenticated using (public.dw_is_owner()) with check (public.dw_is_owner());

create table if not exists public.dw_site_cache (key text primary key, data jsonb not null, fetched_at timestamptz not null default now());
alter table public.dw_site_cache enable row level security;

-- ------------------------------------------------------------- public writes
create or replace function public.dw_site_hit(p_site text, p_path text, p_ref text default '')
returns void language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Europe/London')::date;
        h text; pth text := lower(left(coalesce(p_path, ''), 160)); rf text := lower(left(coalesce(p_ref, ''), 80));
begin
  select host into h from dw_sites where slug = p_site and active;
  if h is null then return; end if;
  if pth !~ '^/[a-z0-9/_.\-]*$' then pth := '/other'; end if;
  rf := regexp_replace(rf, '^www\.', '');
  if rf !~ '^[a-z0-9.\-]*$' then rf := 'other'; end if;
  if rf = h then rf := '(internal)'; end if;
  if not exists (select 1 from dw_site_views where site = p_site and day = d and path = pth and ref = rf)
     and (select count(*) from dw_site_views where site = p_site and day = d) >= 3000 then return; end if;
  insert into dw_site_views (site, day, path, ref, n) values (p_site, d, pth, rf, 1)
  on conflict (site, day, path, ref) do update set n = dw_site_views.n + 1;
end $$;

create or replace function public.dw_site_event(p_site text, p_kind text, p_label text default '', p_path text default '')
returns void language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Europe/London')::date;
        k text := lower(coalesce(p_kind, '')); lb text := left(coalesce(p_label, ''), 80); pth text := lower(left(coalesce(p_path, ''), 160));
begin
  if not exists (select 1 from dw_sites where slug = p_site and active) then return; end if;
  if k not in ('call', 'email', 'whatsapp', 'form', 'booking', 'directions', 'social') then return; end if;
  if pth !~ '^/[a-z0-9/_.\-]*$' then pth := '/other'; end if;
  if (select coalesce(sum(n), 0) from dw_site_events where site = p_site and day = d) >= 2000 then return; end if;
  insert into dw_site_events (site, day, kind, label, path, n) values (p_site, d, k, lb, pth, 1)
  on conflict (site, day, kind, label, path) do update set n = dw_site_events.n + 1;
end $$;
grant execute on function public.dw_site_hit(text, text, text) to anon, authenticated;
grant execute on function public.dw_site_event(text, text, text, text) to anon, authenticated;

-- --------------------------------------------------------------- owner reads
create or replace function public.dw_site_traffic(p_site text, p_days int default 30, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare today date := (now() at time zone 'Europe/London')::date;
        upto date := least(coalesce(p_to, today), today);
        since date := coalesce(p_from, upto - (p_days - 1));
        len int; psince date; pupto date; out jsonb;
begin
  if not public.dw_is_owner() then raise exception 'not allowed'; end if;
  if since > upto then since := upto; end if;
  len := upto - since + 1; pupto := since - 1; psince := since - len;
  with v as (select day, path, ref, n, public.wb_channel(ref) ch from dw_site_views_all where site = p_site and day between psince and upto),
       c as (select * from v where day between since and upto),
       p as (select * from v where day between psince and pupto)
  select jsonb_build_object(
    'from', since, 'to', upto, 'days', len,
    'first', (select min(day) from dw_site_views_all where site = p_site),
    'visits', (select coalesce(sum(n),0) from c where ch is not null),
    'visits_prev', (select coalesce(sum(n),0) from p where ch is not null),
    'views', (select coalesce(sum(n),0) from c),
    'views_prev', (select coalesce(sum(n),0) from p),
    'search', (select coalesce(sum(n),0) from c where ch = 'Organic Search'),
    'ai', (select coalesce(sum(n),0) from c where ch = 'AI engines'),
    'social', (select coalesce(sum(n),0) from c where ch = 'Organic Social'),
    'channels', (select coalesce(jsonb_agg(t order by t.n desc), '[]') from (select ch k, sum(n) n from c where ch is not null group by ch) t),
    'daily', (select coalesce(jsonb_agg(t order by t.day), '[]') from (
        select d::date as day, coalesce((select jsonb_object_agg(ch, s) from (select ch, sum(n) s from c where c.day = d::date and ch is not null group by ch) z), '{}') ch,
               coalesce((select sum(n) from c where c.day = d::date), 0) views
        from generate_series(since, upto, '1 day') d) t),
    'landing', (select coalesce(jsonb_agg(t), '[]') from (select path k, sum(n) n from c where ch is not null group by path order by sum(n) desc limit 15) t),
    'pages', (select coalesce(jsonb_agg(t), '[]') from (select path k, sum(n) n from c group by path order by sum(n) desc limit 15) t),
    'refs', (select coalesce(jsonb_agg(t), '[]') from (select ref k, ch, sum(n) n from c where ch not in ('Direct') and ch is not null group by ref, ch order by sum(n) desc limit 15) t)
  ) into out;
  return out;
end $$;

-- enquiries & bookings: tracked clicks from t.js, plus the site's own form tables where it has them
create or replace function public.dw_site_leads(p_site text, p_days int default 30, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare today date := (now() at time zone 'Europe/London')::date;
        upto date := least(coalesce(p_to, today), today);
        since date := coalesce(p_from, upto - (p_days - 1));
        len int; psince date; pupto date; out jsonb; forms jsonb := '[]'::jsonb;
begin
  if not public.dw_is_owner() then raise exception 'not allowed'; end if;
  if since > upto then since := upto; end if;
  len := upto - since + 1; pupto := since - 1; psince := since - len;
  if p_site = 'coastal-golf-co' then
    select coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'name', name, 'what', coalesce(service, 'Booking'), 'status', status, 'page', page) order by created_at desc), '[]') into forms
    from cgc_bookings where (created_at at time zone 'Europe/London')::date between since and upto;
  elsif p_site = 'tcooper-interiors' then
    select coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'name', name, 'what', coalesce(service, 'Enquiry'), 'status', status) order by created_at desc), '[]') into forms
    from tcooper_enquiries where (created_at at time zone 'Europe/London')::date between since and upto;
  elsif p_site = 'honest-handicap' then
    select coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'name', name, 'what', 'Tester application', 'status', status) order by created_at desc), '[]') into forms
    from hh_testers where (created_at at time zone 'Europe/London')::date between since and upto;
  end if;
  with e as (select * from dw_site_events where site = p_site and day between psince and upto),
       c as (select * from e where day between since and upto),
       p as (select * from e where day between psince and pupto)
  select jsonb_build_object(
    'from', since, 'to', upto, 'days', len,
    'clicks', (select coalesce(sum(n),0) from c),
    'clicks_prev', (select coalesce(sum(n),0) from p),
    'by_kind', (select coalesce(jsonb_object_agg(kind, s), '{}') from (select kind, sum(n) s from c group by kind) t),
    'by_kind_prev', (select coalesce(jsonb_object_agg(kind, s), '{}') from (select kind, sum(n) s from p group by kind) t),
    'daily', (select coalesce(jsonb_agg(t order by t.day), '[]') from (
        select d::date as day, coalesce((select jsonb_object_agg(kind, s) from (select kind, sum(n) s from c where c.day = d::date group by kind) z), '{}') k
        from generate_series(since, upto, '1 day') d) t),
    'labels', (select coalesce(jsonb_agg(t), '[]') from (select kind, label, sum(n) n from c group by kind, label order by sum(n) desc limit 15) t),
    'pages', (select coalesce(jsonb_agg(t), '[]') from (select path k, sum(n) n from c group by path order by sum(n) desc limit 10) t),
    'forms', forms
  ) into out;
  return out;
end $$;

create or replace function public.dw_sites_summary(p_days int default 7)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare today date := (now() at time zone 'Europe/London')::date;
begin
  if not public.dw_is_owner() then raise exception 'not allowed'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'slug', s.slug,
      'visits', (select coalesce(sum(n),0) from dw_site_views_all v where v.site = s.slug and v.day > today - p_days and public.wb_channel(v.ref) is not null),
      'visits_prev', (select coalesce(sum(n),0) from dw_site_views_all v where v.site = s.slug and v.day <= today - p_days and v.day > today - 2 * p_days and public.wb_channel(v.ref) is not null),
      'clicks', (select coalesce(sum(n),0) from dw_site_events e where e.site = s.slug and e.day > today - p_days),
      'last', (select max(day) from dw_site_views_all v where v.site = s.slug),
      'spark', (select coalesce(jsonb_agg(x.n order by x.d), '[]') from (select g::date d, coalesce((select sum(n) from dw_site_views_all v where v.site = s.slug and v.day = g::date and public.wb_channel(v.ref) is not null), 0) n
                 from generate_series(today - 13, today, '1 day') g) x)
    )), '[]') from dw_sites s where s.active);
end $$;

revoke execute on function public.dw_site_traffic(text, int, date, date) from public, anon;
revoke execute on function public.dw_site_leads(text, int, date, date) from public, anon;
revoke execute on function public.dw_sites_summary(int) from public, anon;
grant execute on function public.dw_site_traffic(text, int, date, date) to authenticated;
grant execute on function public.dw_site_leads(text, int, date, date) to authenticated;
grant execute on function public.dw_sites_summary(int) to authenticated;

-- ------------------------------------------------------------------ the sites
insert into public.dw_sites (slug, name, url, host, project_id, repo, legacy, sort)
select x.slug, x.name, x.url, x.host, (select id from dw_projects p where p.slug = x.pslug), x.repo, x.legacy, x.sort
from (values
  ('dunnworks', 'dunnworks.io', 'https://dunnworks.io/', 'dunnworks.io', null, 'anthonygdunn-hub/dunnworks', 'traffic', 10),
  ('woolmer', 'woolmer.info', 'https://woolmer.info/', 'woolmer.info', 'wb-guide', 'anthonygdunn-hub/woolmer', 'woolmer', 20),
  ('coastal-golf-co', 'Coastal Golf Co', 'https://www.coastalgolfco.co.uk/', 'coastalgolfco.co.uk', 'coastal-golf-co', 'anthonygdunn-hub/coastal-golf-co', 'cgc', 30),
  ('honest-handicap', 'Honest Handicap', 'https://honesthandicap.golf/', 'honesthandicap.golf', 'honest-handicap', 'anthonygdunn-hub/honest-handicap', 'hh', 40),
  ('funworks', 'Funworks', 'https://funworks.io/', 'funworks.io', 'funworks', 'anthonygdunn-hub/funworks', null, 50),
  ('awayday', 'Awayday', 'https://awayday.golf/', 'awayday.golf', 'awayday', 'anthonygdunn-hub/awayday', null, 60),
  ('farnborough-contracting', 'Farnborough Contracting', 'https://www.farnboroughcontracting.com/', 'farnboroughcontracting.com', 'farnborough-contracting', 'anthonygdunn-hub/farnborough-contracting', null, 70),
  ('tcooper-interiors', 'T Cooper Interiors', 'https://www.tcooperinteriors.co.uk/', 'tcooperinteriors.co.uk', 'tcooper-interiors', 'anthonygdunn-hub/tcooper-interiors', null, 80),
  ('falkners-golf-society', 'Falkners Arms Golf Society', 'https://thefalknersarmsgolfsociety.co.uk/', 'thefalknersarmsgolfsociety.co.uk', 'falkners-golf-society', 'anthonygdunn-hub/falkners-golf-society', null, 90),
  ('combustion-consulting', 'Combustion Consulting', 'https://combustionconsulting.co.uk/', 'combustionconsulting.co.uk', 'combustion-consulting', 'anthonygdunn-hub/combustion-consulting', null, 100),
  ('aeroinspectors', 'AeroInspectors', 'https://aeroinspectors.io/', 'aeroinspectors.io', 'aeroinspectors', null, null, 110)
) as x(slug, name, url, host, pslug, repo, legacy, sort)
on conflict (slug) do nothing;
-- One source for every site's traffic: the shared t.js counter plus the three older counters
-- (woolmer's wb_views, Coastal Golf Co's cgc_pageviews, dunnworks.io's dw_pageviews), mapped into the same shape.
create or replace function public.dw_refhost(r text) returns text language sql immutable as $$
  select case
    when r is null or r = '' then ''
    when lower(r) = 'google' then 'google.com' when lower(r) = 'facebook' then 'facebook.com'
    when lower(r) = 'instagram' then 'instagram.com' when lower(r) = 'linkedin' then 'linkedin.com'
    when lower(r) = 'bing' then 'bing.com' when lower(r) = 'whatsapp' then 'whatsapp.com'
    when r ~ '^https?://' then regexp_replace(lower(substring(r from '^https?://([^/:?#]+)')), '^www\.', '')
    else lower(left(r, 80)) end
$$;

create or replace view public.dw_site_views_all as
  select site, day, path, ref, n from public.dw_site_views
   where not (site = 'dunnworks' and day < date '2026-11-16')
  union all
  select 'woolmer', day, path, ref, n from public.wb_views
  union all
  select 'coastal-golf-co', d, left(path, 160), r, count(*)::int from (
    select (at at time zone 'Europe/London')::date d, path,
           case when row_number() over (partition by visitor, (at at time zone 'Europe/London')::date order by at) = 1
                then public.dw_refhost(ref) else '(internal)' end r
    from public.cgc_pageviews) x group by 1, 2, 3, 4
  union all
  select 'dunnworks', d, left(path, 160), r, count(*)::int from (
    select (at at time zone 'Europe/London')::date d, path,
           case when row_number() over (partition by visitor, (at at time zone 'Europe/London')::date order by at) = 1
                then public.dw_refhost(ref) else '(internal)' end r
    from public.dw_pageviews where at < timestamp with time zone '2026-11-16 00:00:00+00') y group by 1, 2, 3, 4;
revoke all on public.dw_site_views_all from anon, authenticated;
