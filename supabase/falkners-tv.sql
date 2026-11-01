-- The Falkners Arms: live sport on TV listings
--
-- A scheduled task researches the next seven days of sport on Sky, TNT, BBC,
-- ITV and Prime Video each morning and upserts rows into fa_tv (keyed on
-- ext_key so re-runs update rather than duplicate). Team badges are filled in
-- separately by the fa-tv-badges edge function, which pg_cron calls every 5
-- minutes; it looks up any team without a badge on TheSportsDB's free API and
-- caches the result in fa_tv_badges.
--
-- The public site reads fa_tv with the anon key. Rows marked hidden never
-- leave the database.

create table if not exists public.fa_tv (
  id          uuid primary key default gen_random_uuid(),
  ext_key     text not null unique,            -- yyyy-mm-dd|sport|home|away or |title, lower case
  starts_at   timestamptz not null,
  sport       text not null check (sport in ('Football','Golf','Formula 1','Rugby','Cricket','Darts','Boxing','Tennis','Other')),
  competition text,
  home        text,                            -- head to head events
  away        text,
  title       text,                            -- everything else: 'Mexico City Grand Prix – Race'
  channel     text not null,
  home_badge  text,
  away_badge  text,
  big         boolean not null default false,  -- a headline game
  source      text not null default 'auto' check (source in ('auto','staff')),
  hidden      boolean not null default false,
  sound_on    boolean not null default false,
  checked_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists fa_tv_starts_idx on public.fa_tv (starts_at);

create table if not exists public.fa_tv_badges (
  team         text primary key,               -- as written in fa_tv
  sport        text,
  badge        text,                            -- null = looked up, nothing found
  looked_up_at timestamptz not null default now()
);

alter table public.fa_tv enable row level security;
alter table public.fa_tv_badges enable row level security;

drop policy if exists fa_tv_public_read on public.fa_tv;
create policy fa_tv_public_read on public.fa_tv for select to anon, authenticated
  using (not hidden and starts_at > now() - interval '6 hours');

drop policy if exists fa_tv_owner_all on public.fa_tv;
create policy fa_tv_owner_all on public.fa_tv for all to authenticated
  using (public.dw_is_owner()) with check (public.dw_is_owner());

drop policy if exists fa_tv_badges_read on public.fa_tv_badges;
create policy fa_tv_badges_read on public.fa_tv_badges for select to anon, authenticated using (true);

-- Copy cached badges onto listings. Called by the edge function after lookups.
create or replace function public.fa_tv_apply_badges() returns void
language sql security definer set search_path = public as $$
  update fa_tv t set home_badge = b.badge, updated_at = now()
    from fa_tv_badges b where b.team = t.home and b.badge is not null and t.home_badge is distinct from b.badge;
  update fa_tv t set away_badge = b.badge, updated_at = now()
    from fa_tv_badges b where b.team = t.away and b.badge is not null and t.away_badge is distinct from b.badge;
$$;
revoke all on function public.fa_tv_apply_badges() from public, anon, authenticated;

-- Every 5 minutes, ask the edge function to fill in missing badges.
select cron.unschedule('fa-tv-badges') where exists (select 1 from cron.job where jobname = 'fa-tv-badges');
select cron.schedule('fa-tv-badges', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://acdpgarasgfhvupzsbxf.supabase.co/functions/v1/fa-tv-badges',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb);
$$);
