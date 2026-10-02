-- Coastal Golf Co stats: the tables, the dashboard function and the uptime job behind
-- /console/#/cgc. Run once in project acdpgarasgfhvupzsbxf (already applied 2 Oct 2026).
-- Edge functions: cgc-track (visit counter, verify_jwt off), cgc-ping (uptime, verify_jwt off),
-- cgc-insights (Google: GA4, Search Console, PageSpeed; owner only).

create table if not exists public.cgc_pageviews (
  id bigserial primary key,
  at timestamptz not null default now(),
  vid text,                 -- random id for one page view, so the leave beacon can add time on page
  visitor text not null,    -- hash of IP + browser + day + secret: one visitor per day, can't follow anyone across days
  path text not null,
  ref text,                 -- where they came from (Google, Facebook, a host name), never a full URL
  utm text, device text, browser text, os text, country text,
  ms integer                -- time on page
);
create index if not exists cgc_pageviews_at on public.cgc_pageviews (at);
create index if not exists cgc_pageviews_vid on public.cgc_pageviews (vid);
alter table public.cgc_pageviews enable row level security;
create policy cgc_pageviews_owner on public.cgc_pageviews for select to authenticated using (public.dw_is_owner());

create table if not exists public.cgc_uptime (
  id bigserial primary key, at timestamptz not null default now(), ok boolean not null, status integer, ms integer, note text);
create index if not exists cgc_uptime_at on public.cgc_uptime (at);
alter table public.cgc_uptime enable row level security;
create policy cgc_uptime_owner on public.cgc_uptime for select to authenticated using (public.dw_is_owner());

-- Google settings, edited in the console (Google settings drawer). Owner only.
create table if not exists public.cgc_google (
  id integer primary key default 1 check (id = 1),
  sa_json text, ga4_property text, gsc_site text, psi_key text, updated_at timestamptz default now());
alter table public.cgc_google enable row level security;
create policy cgc_google_owner on public.cgc_google for all to authenticated using (public.dw_is_owner()) with check (public.dw_is_owner());
insert into public.cgc_google (id, gsc_site) values (1, 'sc-domain:coastalgolfco.co.uk') on conflict do nothing;

-- Google and PageSpeed answers, cached by cgc-insights
create table if not exists public.cgc_cache (key text primary key, data jsonb, fetched_at timestamptz default now());
alter table public.cgc_cache enable row level security;
create policy cgc_cache_owner on public.cgc_cache for select to authenticated using (public.dw_is_owner());

-- uptime check every 10 minutes
select cron.schedule('cgc-uptime', '*/10 * * * *',
  $$select net.http_post(url := 'https://acdpgarasgfhvupzsbxf.supabase.co/functions/v1/cgc-ping', body := '{}'::jsonb, timeout_milliseconds := 30000)$$);

-- Everything the Coastal Golf Co dashboard needs from our own data, in one call. Owner only.
create or replace function public.cgc_traffic(days integer default 28)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  t1 timestamptz := now();
  t0 timestamptz := now() - make_interval(days => days);
  tp timestamptz := now() - make_interval(days => days * 2);
  out jsonb;
begin
  if not public.dw_is_owner() then raise exception 'not allowed'; end if;
  with v as (select *, (at at time zone 'Europe/London')::date d from public.cgc_pageviews where at >= t0 and at <= t1),
       vp as (select *, (at at time zone 'Europe/London')::date d from public.cgc_pageviews where at >= tp and at < t0),
       visits as (select visitor, d, count(*) n, (array_agg(ref order by at))[1] ref from v group by 1, 2),
       visitsp as (select visitor, d, count(*) n from vp group by 1, 2),
       b as (select * from public.cgc_bookings where created_at >= t0 and created_at <= t1),
       bp as (select * from public.cgc_bookings where created_at >= tp and created_at < t0)
  select jsonb_build_object(
    'days', days,
    'now', jsonb_build_object(
      'live', (select count(distinct visitor) from public.cgc_pageviews where at > now() - interval '5 minutes'),
      'today_views', (select count(*) from public.cgc_pageviews where (at at time zone 'Europe/London')::date = (now() at time zone 'Europe/London')::date),
      'today_visits', (select count(distinct visitor) from public.cgc_pageviews where (at at time zone 'Europe/London')::date = (now() at time zone 'Europe/London')::date),
      'first', (select min(at) from public.cgc_pageviews)),
    'cur', jsonb_build_object(
      'views', (select count(*) from v),
      'visits', (select count(*) from visits),
      'bounce', (select round(100.0 * count(*) filter (where n = 1) / nullif(count(*), 0)) from visits),
      'secs', (select round(avg(ms) / 1000.0) from v where ms between 1000 and 1800000),
      'bookings', (select count(*) from b)),
    'prev', jsonb_build_object(
      'views', (select count(*) from vp),
      'visits', (select count(*) from visitsp),
      'bounce', (select round(100.0 * count(*) filter (where n = 1) / nullif(count(*), 0)) from visitsp),
      'secs', (select round(avg(ms) / 1000.0) from vp where ms between 1000 and 1800000),
      'bookings', (select count(*) from bp)),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('d', g.d::date, 'views', coalesce(x.views, 0), 'visits', coalesce(x.visits, 0), 'bookings', coalesce(y.n, 0)) order by g.d), '[]')
              from generate_series((t0 at time zone 'Europe/London')::date + 1, (t1 at time zone 'Europe/London')::date, interval '1 day') g(d)
              left join (select d, count(*) views, count(distinct visitor) visits from v group by 1) x on x.d = g.d::date
              left join (select (created_at at time zone 'Europe/London')::date d, count(*) n from b group by 1) y on y.d = g.d::date),
    'pages', (select coalesce(jsonb_agg(jsonb_build_object('k', path, 'n', n, 'u', u, 's', s) order by n desc), '[]') from
              (select path, count(*) n, count(distinct visitor || d) u, round(avg(ms) filter (where ms between 1000 and 1800000) / 1000.0) s from v group by 1 order by 2 desc limit 15) q),
    'refs', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]') from
              (select coalesce(ref, 'Direct or unknown') k, count(*) n from visits group by 1 order by 2 desc limit 12) q),
    'utm', (select coalesce(jsonb_agg(jsonb_build_object('k', utm, 'n', n) order by n desc), '[]') from
              (select utm, count(distinct visitor || d) n from v where utm is not null group by 1 order by 2 desc limit 10) q),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]') from
              (select coalesce(device, 'Unknown') k, count(distinct visitor || d) n from v group by 1) q),
    'browsers', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]') from
              (select coalesce(browser, 'Other') k, count(distinct visitor || d) n from v group by 1 order by 2 desc limit 6) q),
    'countries', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]') from
              (select country k, count(distinct visitor || d) n from v where country is not null group by 1 order by 2 desc limit 8) q),
    'hours', (select coalesce(jsonb_agg(jsonb_build_object('h', h, 'n', coalesce(n, 0)) order by h), '[]') from
              generate_series(0, 23) h left join (select extract(hour from at at time zone 'Europe/London')::int hh, count(*) n from v group by 1) q on q.hh = h),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]') from
              (select coalesce(service, 'Not given') k, count(*) n from b group by 1) q),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'name', name, 'service', service, 'postcode', postcode, 'status', status, 'clubs', clubs, 'page', page) order by created_at desc), '[]') from
              (select * from public.cgc_bookings order by created_at desc limit 6) q),
    'uptime', jsonb_build_object(
      'last', (select jsonb_build_object('at', at, 'ok', ok, 'status', status, 'ms', ms) from public.cgc_uptime order by at desc limit 1),
      'pct', (select round(100.0 * count(*) filter (where ok) / nullif(count(*), 0), 2) from public.cgc_uptime where at >= t0),
      'avg_ms', (select round(avg(ms)) from public.cgc_uptime where at >= t0 and ok),
      'checks', (select count(*) from public.cgc_uptime where at >= t0),
      'down', (select coalesce(jsonb_agg(jsonb_build_object('at', at, 'status', status, 'note', note) order by at desc), '[]') from
               (select * from public.cgc_uptime where at >= t0 and not ok order by at desc limit 5) q))
  ) into out;
  return out;
end $$;
revoke all on function public.cgc_traffic(integer) from public, anon;
grant execute on function public.cgc_traffic(integer) to authenticated;
