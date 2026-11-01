-- The Falkners Arms: staff accounts and shared table plans (applied as migration falkners_staff_and_floor_plans)
-- fa_staff links a Supabase Auth user to a pub role and rights. fa_can(p) is true for the landlord or anyone
-- whose perms include p. Floor layouts are readable by any active staff member and writable by anyone with
-- the 'tableplan' right. Preview demo accounts use fa.<name>@preview.dunnworks.io and are created directly,
-- so no email is ever sent. Dunnworks console tables stay owner-only (dw_is_owner) and are untouched.
create table if not exists public.fa_staff (user_id uuid primary key references auth.users(id) on delete cascade, email text not null unique, name text not null, role text not null check (role in ('Landlord','Manager','Staff')), perms text[] not null default '{}', active boolean not null default true, created_at timestamptz not null default now());
create table if not exists public.fa_floor_layouts (id uuid primary key default gen_random_uuid(), name text not null, rooms jsonb not null default '[]', is_default boolean not null default false, sort_order int not null default 0, updated_at timestamptz not null default now(), updated_by text);
create table if not exists public.fa_floor_dates (day date primary key, layout_id uuid not null references public.fa_floor_layouts(id) on delete cascade, updated_at timestamptz not null default now(), updated_by text);
-- RLS and helper functions: see the migration in Supabase.
