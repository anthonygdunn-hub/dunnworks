-- Dunnworks — client packs ("what I need from you"), one per project. Owner only.
create table if not exists public.dw_project_packs (
  project_id uuid primary key references public.dw_projects(id) on delete cascade,
  pack jsonb not null default '{}'::jsonb,
  sent_on date,
  sent_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.dw_project_packs enable row level security;
drop policy if exists "owner reads packs" on public.dw_project_packs;
create policy "owner reads packs" on public.dw_project_packs for select to authenticated using (public.dw_is_owner());
drop policy if exists "owner writes packs" on public.dw_project_packs;
create policy "owner writes packs" on public.dw_project_packs for all to authenticated using (public.dw_is_owner()) with check (public.dw_is_owner());
drop trigger if exists dw_packs_touch on public.dw_project_packs;
create trigger dw_packs_touch before update on public.dw_project_packs for each row execute function public.dw_touch();
alter table public.dw_project_tasks add column if not exists client_title text, add column if not exists client_note text;
