-- Dunnworks — jobs to do per project
-- Run once in the SQL editor of project acdpgarasgfhvupzsbxf, after
-- dunnworks-schema.sql. Owner only: nothing anonymous can read or write it.

create table if not exists public.dw_project_tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.dw_projects(id) on delete cascade,
  title       text not null,
  details     text,
  done        boolean not null default false,
  done_at     timestamptz,
  due_on      date,
  sort_order  int not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists dw_project_tasks_project on public.dw_project_tasks(project_id);

alter table public.dw_project_tasks enable row level security;

drop policy if exists "owner reads tasks" on public.dw_project_tasks;
create policy "owner reads tasks" on public.dw_project_tasks
  for select to authenticated using (public.dw_is_owner());

drop policy if exists "owner writes tasks" on public.dw_project_tasks;
create policy "owner writes tasks" on public.dw_project_tasks
  for all to authenticated using (public.dw_is_owner()) with check (public.dw_is_owner());

drop trigger if exists dw_tasks_touch on public.dw_project_tasks;
create trigger dw_tasks_touch before update on public.dw_project_tasks
  for each row execute function public.dw_touch();
