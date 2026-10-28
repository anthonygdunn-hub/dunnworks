-- Trip Log — dunnworks.io/triplog
-- Private and business mileage log for company car / fuel card drivers.
-- Project acdpgarasgfhvupzsbxf. Applied 28 Oct 2026.
--
-- How access works
--   1. Someone registers in the app with email + password. Supabase creates the
--      auth user, and the trigger below creates a tl_profiles row with status
--      'pending', but only when the sign-up came from Trip Log (metadata app=triplog).
--   2. The app calls the tl-notify edge function, which emails the owner.
--   3. The owner approves at dunnworks.io/triplog/admin/ (signed in as info@dunnworks.io).
--   4. Only approved users can read or write trips and places, and only their own.
--      The owner can see who is registered, never their trips.

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------ profiles
create table if not exists public.tl_profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  full_name    text,
  employee_no  text,
  vehicle_reg  text,
  manager_name text,
  employer     text,
  status       text not null default 'pending'
               check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now(),
  approved_at  timestamptz,
  notified_at  timestamptz,
  updated_at   timestamptz not null default now()
);

alter table public.tl_profiles enable row level security;

create or replace function public.tl_is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tl_profiles
                 where user_id = auth.uid() and status = 'approved')
$$;

drop policy if exists "tl read own profile" on public.tl_profiles;
create policy "tl read own profile" on public.tl_profiles
  for select to authenticated using (user_id = auth.uid() or public.dw_is_owner());

-- an existing account (no profile yet) can ask for access; always lands as pending
drop policy if exists "tl request access" on public.tl_profiles;
create policy "tl request access" on public.tl_profiles
  for insert to authenticated with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "tl update own profile" on public.tl_profiles;
create policy "tl update own profile" on public.tl_profiles
  for update to authenticated using (user_id = auth.uid() or public.dw_is_owner())
  with check (user_id = auth.uid() or public.dw_is_owner());

drop policy if exists "tl owner deletes profiles" on public.tl_profiles;
create policy "tl owner deletes profiles" on public.tl_profiles
  for delete to authenticated using (public.dw_is_owner());

-- users can edit their own details but never their own status or email
create or replace function public.tl_profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  -- signed-in app users (other than the owner) can edit their details but never their status;
  -- the SQL editor and service role are unaffected, so the dashboard can approve too
  if tg_op = 'UPDATE' and coalesce(auth.role(), '') in ('authenticated', 'anon') and not public.dw_is_owner() then
    new.status      := old.status;
    new.approved_at := old.approved_at;
    new.notified_at := old.notified_at;
    new.email       := old.email;
    new.user_id     := old.user_id;
  end if;
  if tg_op = 'UPDATE' and new.status = 'approved' and old.status <> 'approved' then
    new.approved_at := now();
  end if;
  return new;
end $$;

drop trigger if exists tl_profiles_guard on public.tl_profiles;
create trigger tl_profiles_guard before update on public.tl_profiles
  for each row execute function public.tl_profiles_guard();

-- profile is created at sign-up, only for Trip Log sign-ups
create or replace function public.tl_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'app', '') = 'triplog' then
    insert into public.tl_profiles (user_id, email, full_name, employee_no, vehicle_reg, manager_name, employer)
    values (new.id, lower(new.email),
            nullif(new.raw_user_meta_data ->> 'full_name', ''),
            nullif(new.raw_user_meta_data ->> 'employee_no', ''),
            upper(nullif(new.raw_user_meta_data ->> 'vehicle_reg', '')),
            nullif(new.raw_user_meta_data ->> 'manager_name', ''),
            nullif(new.raw_user_meta_data ->> 'employer', ''))
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists tl_on_auth_user_created on auth.users;
create trigger tl_on_auth_user_created after insert on auth.users
  for each row execute function public.tl_handle_new_user();

-- ------------------------------------------------------------------ places
create table if not exists public.tl_places (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label      text not null,
  address    text not null,          -- road name and/or postcode
  sort_order int not null default 100,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists tl_places_user_idx on public.tl_places (user_id);
alter table public.tl_places enable row level security;

drop policy if exists "tl own places" on public.tl_places;
create policy "tl own places" on public.tl_places
  for all to authenticated
  using (user_id = auth.uid() and public.tl_is_approved())
  with check (user_id = auth.uid() and public.tl_is_approved());

-- ------------------------------------------------------------------ legs
-- One row per leg. Legs sharing a journey_id are one multi-stop journey.
-- ids are made on the phone so trips logged offline sync without duplicates.
create table if not exists public.tl_legs (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  journey_id  uuid not null,
  seq         int  not null default 1,
  trip_date   date not null,
  from_place  text not null,
  to_place    text not null default '',
  odo_start   int  not null check (odo_start >= 0),
  odo_end     int  check (odo_end is null or odo_end >= odo_start),
  kind        text not null check (kind in ('private','business')),
  purpose     text,
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists tl_legs_user_date_idx on public.tl_legs (user_id, trip_date);
alter table public.tl_legs enable row level security;

drop policy if exists "tl own legs" on public.tl_legs;
create policy "tl own legs" on public.tl_legs
  for all to authenticated
  using (user_id = auth.uid() and public.tl_is_approved())
  with check (user_id = auth.uid() and public.tl_is_approved());

revoke all on public.tl_profiles, public.tl_places, public.tl_legs from anon;
grant select, insert, update, delete on public.tl_profiles, public.tl_places, public.tl_legs to authenticated;
revoke execute on function public.tl_is_approved() from public, anon;
grant execute on function public.tl_is_approved() to authenticated;
revoke execute on function public.tl_handle_new_user() from public, anon, authenticated;
revoke execute on function public.tl_profiles_guard() from public, anon, authenticated;

-- ------------------------------------------------------------------ admins (28 Oct 2026)
-- Trip Log admins can see registrations and approve, decline or revoke them.
-- They never see anyone's trips. Only the owner (info@dunnworks.io) or the
-- dashboard can make someone an admin. Separate from the Dunnworks console.
alter table public.tl_profiles add column if not exists is_admin boolean not null default false;

create or replace function public.tl_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.dw_is_owner() or exists (
    select 1 from public.tl_profiles
    where user_id = auth.uid() and status = 'approved' and is_admin)
$$;
revoke execute on function public.tl_is_admin() from public, anon;
grant execute on function public.tl_is_admin() to authenticated;

drop policy if exists "tl read own profile" on public.tl_profiles;
create policy "tl read own profile" on public.tl_profiles
  for select to authenticated using (user_id = auth.uid() or public.tl_is_admin());
drop policy if exists "tl update own profile" on public.tl_profiles;
create policy "tl update own profile" on public.tl_profiles
  for update to authenticated using (user_id = auth.uid() or public.tl_is_admin())
  with check (user_id = auth.uid() or public.tl_is_admin());
drop policy if exists "tl owner deletes profiles" on public.tl_profiles;
create policy "tl owner deletes profiles" on public.tl_profiles
  for delete to authenticated using (public.tl_is_admin());

create or replace function public.tl_profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if not public.dw_is_owner() then
      new.is_admin := old.is_admin; new.email := old.email;
      new.user_id := old.user_id; new.notified_at := old.notified_at;
    end if;
    if not public.tl_is_admin() then
      new.status := old.status; new.approved_at := old.approved_at;
    end if;
  end if;
  if tg_op = 'UPDATE' and new.status = 'approved' and old.status <> 'approved' then
    new.approved_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.tl_profiles_guard() from public, anon, authenticated;

-- To make someone an admin from the SQL editor:
--   update public.tl_profiles set is_admin = true where email = 'someone@example.com';
