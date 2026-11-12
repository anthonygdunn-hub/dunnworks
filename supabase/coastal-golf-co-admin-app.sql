-- Coastal Golf Co admin app: bookings inbox, jobs, customers, phone alerts, simple stats.
-- Applied as migration cgc_admin_app (12 Nov 2026). Push-alert keys are stored in cgc_private, never in this repo.
alter table public.cgc_bookings add column if not exists notes text;
alter table public.cgc_bookings add column if not exists handled_at timestamptz;

create policy "editors read bookings" on public.cgc_bookings for select using (public.cgc_is_editor());
create policy "editors update bookings" on public.cgc_bookings for update using (public.cgc_is_editor()) with check (public.cgc_is_editor());

create table if not exists public.cgc_customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (length(name) between 1 and 120),
  phone text, email text, postcode text, notes text
);
create table if not exists public.cgc_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  customer_id uuid references public.cgc_customers(id) on delete set null,
  booking_id uuid references public.cgc_bookings(id) on delete set null,
  service text, clubs integer check (clubs is null or clubs between 0 and 30), grip text,
  price numeric(8,2) check (price is null or price >= 0), paid boolean not null default false,
  status text not null default 'booked' check (status in ('booked','collected','in the workshop','ready','returned')),
  collect_on date, return_on date, notes text
);
create index if not exists cgc_jobs_status on public.cgc_jobs(status);
create index if not exists cgc_jobs_customer on public.cgc_jobs(customer_id);

create table if not exists public.cgc_push_subs (
  id bigint generated always as identity primary key,
  email text not null, endpoint text not null unique, p256dh text not null, auth text not null,
  created_at timestamptz not null default now()
);
-- VAPID keys and the internal key live here; no policies, so only the service role can read it
create table if not exists public.cgc_private (k text primary key, v text not null);

alter table public.cgc_customers enable row level security;
alter table public.cgc_jobs enable row level security;
alter table public.cgc_push_subs enable row level security;
alter table public.cgc_private enable row level security;

create policy "editors manage customers" on public.cgc_customers for all using (public.cgc_is_editor()) with check (public.cgc_is_editor());
create policy "editors manage jobs" on public.cgc_jobs for all using (public.cgc_is_editor()) with check (public.cgc_is_editor());
create policy "editors manage own phone alerts" on public.cgc_push_subs for all
  using (public.cgc_is_editor() and email = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (public.cgc_is_editor() and email = lower(coalesce(auth.jwt() ->> 'email', '')));

create or replace function public.cgc_jobs_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists cgc_jobs_touch on public.cgc_jobs;
create trigger cgc_jobs_touch before update on public.cgc_jobs for each row execute function public.cgc_jobs_touch();

-- the app's home screen numbers; editors only (page views themselves stay owner-only)
create or replace function public.cgc_app_stats() returns json
language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not public.cgc_is_editor() then raise exception 'not allowed'; end if;
  select json_build_object(
    'visitors_7d', (select count(distinct coalesce(visitor, vid)) from cgc_pageviews where at > now() - interval '7 days'),
    'visitors_prev', (select count(distinct coalesce(visitor, vid)) from cgc_pageviews where at > now() - interval '14 days' and at <= now() - interval '7 days'),
    'views_7d', (select count(*) from cgc_pageviews where at > now() - interval '7 days'),
    'top_pages', (select coalesce(json_agg(t), '[]'::json) from (select path, count(*) n from cgc_pageviews where at > now() - interval '7 days' group by path order by n desc limit 5) t),
    'daily', (select coalesce(json_agg(d order by d.day), '[]'::json) from (
        select g::date as day, (select count(distinct coalesce(visitor, vid)) from cgc_pageviews p where (p.at at time zone 'Europe/London')::date = g::date) n
        from generate_series((now() at time zone 'Europe/London')::date - 6, (now() at time zone 'Europe/London')::date, interval '1 day') g) d),
    'bookings_7d', (select count(*) from cgc_bookings where created_at > now() - interval '7 days'),
    'bookings_new', (select count(*) from cgc_bookings where coalesce(status, 'new') = 'new'),
    'jobs_open', (select count(*) from cgc_jobs where status <> 'returned'),
    'jobs_ready', (select count(*) from cgc_jobs where status = 'ready'),
    'unpaid', (select coalesce(sum(price), 0) from cgc_jobs where not paid and status = 'returned')
  ) into r;
  return r;
end $$;
revoke all on function public.cgc_app_stats() from public, anon;
grant execute on function public.cgc_app_stats() to authenticated;
