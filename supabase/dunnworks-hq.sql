-- Dunnworks Workspace (console #/hq): the Macro-style layer over the console.
-- Run once in the SQL editor of project acdpgarasgfhvupzsbxf, after the other dunnworks-*.sql files.
--
-- Adds: collaborators (dw_members), docs, contacts, calendar events, an activity feed,
-- an inbox mirror for info@dunnworks.io and a GitHub cache. Collaborators only ever see
-- the projects listed against them; passphrases, packs and everything else stay owner only.

-- --------------------------------------------------------------- columns
alter table public.dw_projects
  add column if not exists hq_group   text check (hq_group in ('own','client','prospect')),
  add column if not exists repo       text,          -- owner/name on GitHub
  add column if not exists deal_value numeric,       -- £ for the pipeline
  add column if not exists colour     text;

alter table public.dw_project_tasks
  add column if not exists hq_state text check (hq_state in ('todo','doing','waiting'));

update public.dw_projects set hq_group = case
  when slug in ('honest-handicap','wb-guide','funworks','awayday','trip-log','nocatch-cv') then 'own'
  when kind = 'case-study' or is_live or stage in ('won','meeting','quoted','replied') then 'client'
  else 'prospect' end
where hq_group is null;

-- ---------------------------------------------------------------- members
create table if not exists public.dw_members (
  email       text primary key,
  name        text not null,
  role        text not null default 'collaborator' check (role in ('collaborator','client')),
  task_owner  text,                       -- matches dw_project_tasks.owner, e.g. 'stuart'
  project_ids uuid[] not null default '{}',
  active      boolean not null default true,
  invited_at  timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.dw_members enable row level security;
drop policy if exists "owner all members" on public.dw_members;
create policy "owner all members" on public.dw_members for all to authenticated
  using (public.dw_is_owner()) with check (public.dw_is_owner());
drop policy if exists "member reads self" on public.dw_members;
create policy "member reads self" on public.dw_members for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) and active);

create or replace function public.dw_can_see(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.dw_is_owner() or exists (
    select 1 from public.dw_members m
    where m.active and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email',''))
      and p = any(m.project_ids))
$$;

-- members: read their projects, read/add/update their projects' jobs and notes
drop policy if exists "member reads own projects" on public.dw_projects;
create policy "member reads own projects" on public.dw_projects for select to authenticated using (public.dw_can_see(id));
drop policy if exists "member reads tasks" on public.dw_project_tasks;
create policy "member reads tasks" on public.dw_project_tasks for select to authenticated using (public.dw_can_see(project_id));
drop policy if exists "member adds tasks" on public.dw_project_tasks;
create policy "member adds tasks" on public.dw_project_tasks for insert to authenticated with check (public.dw_can_see(project_id));
drop policy if exists "member updates tasks" on public.dw_project_tasks;
create policy "member updates tasks" on public.dw_project_tasks for update to authenticated
  using (public.dw_can_see(project_id)) with check (public.dw_can_see(project_id));
drop policy if exists "member notes" on public.dw_task_notes;
create policy "member notes" on public.dw_task_notes for select to authenticated using (public.dw_can_see(project_id));
drop policy if exists "member adds notes" on public.dw_task_notes;
create policy "member adds notes" on public.dw_task_notes for insert to authenticated with check (public.dw_can_see(project_id));

-- ------------------------------------------------------------------- docs
create table if not exists public.dw_docs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.dw_projects(id) on delete cascade,
  title       text not null,
  body        text not null default '',
  tags        text[] not null default '{}',
  pinned      boolean not null default false,
  shared      boolean not null default false,  -- collaborators on the project can see it
  created_by  text,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists dw_docs_project on public.dw_docs(project_id);
alter table public.dw_docs enable row level security;
drop policy if exists "owner all docs" on public.dw_docs;
create policy "owner all docs" on public.dw_docs for all to authenticated using (public.dw_is_owner()) with check (public.dw_is_owner());
drop policy if exists "member reads shared docs" on public.dw_docs;
create policy "member reads shared docs" on public.dw_docs for select to authenticated using (shared and public.dw_can_see(project_id));
drop policy if exists "member edits shared docs" on public.dw_docs;
create policy "member edits shared docs" on public.dw_docs for update to authenticated
  using (shared and public.dw_can_see(project_id)) with check (shared and public.dw_can_see(project_id));
drop trigger if exists dw_docs_touch on public.dw_docs;
create trigger dw_docs_touch before update on public.dw_docs for each row execute function public.dw_touch();

-- --------------------------------------------------------------- contacts
create table if not exists public.dw_contacts (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.dw_projects(id) on delete cascade,
  name        text not null,
  role        text,
  email       text,
  phone       text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists dw_contacts_project on public.dw_contacts(project_id);
alter table public.dw_contacts enable row level security;
drop policy if exists "owner all contacts" on public.dw_contacts;
create policy "owner all contacts" on public.dw_contacts for all to authenticated using (public.dw_is_owner()) with check (public.dw_is_owner());
drop trigger if exists dw_contacts_touch on public.dw_contacts;
create trigger dw_contacts_touch before update on public.dw_contacts for each row execute function public.dw_touch();

-- ----------------------------------------------------------------- events
create table if not exists public.dw_events (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.dw_projects(id) on delete cascade,
  title       text not null,
  starts_on   date not null,
  at_time     time,
  kind        text not null default 'event' check (kind in ('event','meeting','launch','deadline','call')),
  notes       text,
  created_at  timestamptz not null default now()
);
alter table public.dw_events enable row level security;
drop policy if exists "owner all events" on public.dw_events;
create policy "owner all events" on public.dw_events for all to authenticated using (public.dw_is_owner()) with check (public.dw_is_owner());
drop policy if exists "member reads events" on public.dw_events;
create policy "member reads events" on public.dw_events for select to authenticated using (public.dw_can_see(project_id));

-- ---------------------------------------------------------------- inbox
create table if not exists public.dw_inbox (
  id          text primary key,              -- Gmail message id
  thread_id   text,
  from_email  text,
  from_name   text,
  subject     text,
  snippet     text,
  received_at timestamptz,
  project_id  uuid references public.dw_projects(id) on delete set null,
  is_read     boolean not null default false,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists dw_inbox_when on public.dw_inbox(received_at desc);
alter table public.dw_inbox enable row level security;
drop policy if exists "owner all inbox" on public.dw_inbox;
create policy "owner all inbox" on public.dw_inbox for all to authenticated using (public.dw_is_owner()) with check (public.dw_is_owner());

-- ------------------------------------------------------------ repo cache
create table if not exists public.dw_repo_cache (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null default '[]'::jsonb,
  fetched_at  timestamptz not null default now()
);
alter table public.dw_repo_cache enable row level security;
drop policy if exists "owner reads repo cache" on public.dw_repo_cache;
create policy "owner reads repo cache" on public.dw_repo_cache for select to authenticated using (public.dw_is_owner());

-- -------------------------------------------------------------- activity
create table if not exists public.dw_activity (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       text,
  project_id  uuid references public.dw_projects(id) on delete cascade,
  kind        text not null,      -- task, task-done, doc, note, stage, project, email
  ref_id      text,
  summary     text not null
);
create index if not exists dw_activity_at on public.dw_activity(at desc);
alter table public.dw_activity enable row level security;
drop policy if exists "owner all activity" on public.dw_activity;
create policy "owner all activity" on public.dw_activity for all to authenticated using (public.dw_is_owner()) with check (public.dw_is_owner());
drop policy if exists "member reads activity" on public.dw_activity;
create policy "member reads activity" on public.dw_activity for select to authenticated using (public.dw_can_see(project_id));

create or replace function public.dw_actor() returns text language sql stable as $$
  select coalesce(nullif(auth.jwt() ->> 'email',''), 'system')
$$;

create or replace function public.dw_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text := public.dw_actor();
begin
  if TG_TABLE_NAME = 'dw_project_tasks' then
    if TG_OP = 'INSERT' then
      insert into dw_activity(actor,project_id,kind,ref_id,summary) values (who,new.project_id,'task',new.id::text,'added job: '||new.title);
    elsif new.done and not coalesce(old.done,false) then
      insert into dw_activity(actor,project_id,kind,ref_id,summary) values (who,new.project_id,'task-done',new.id::text,'ticked off: '||new.title);
    elsif coalesce(new.hq_state,'') <> coalesce(old.hq_state,'') then
      insert into dw_activity(actor,project_id,kind,ref_id,summary) values (who,new.project_id,'task',new.id::text,'moved "'||new.title||'" to '||coalesce(new.hq_state,'to do'));
    end if;
  elsif TG_TABLE_NAME = 'dw_docs' then
    if TG_OP = 'INSERT' then
      insert into dw_activity(actor,project_id,kind,ref_id,summary) values (who,new.project_id,'doc',new.id::text,'created doc: '||new.title);
    elsif new.body <> old.body or new.title <> old.title then
      -- one line per doc per half hour, not one per keystroke save
      if not exists (select 1 from dw_activity where kind='doc' and ref_id=new.id::text and at > now() - interval '30 minutes') then
        insert into dw_activity(actor,project_id,kind,ref_id,summary) values (who,new.project_id,'doc',new.id::text,'edited doc: '||new.title);
      end if;
    end if;
  elsif TG_TABLE_NAME = 'dw_task_notes' then
    insert into dw_activity(actor,project_id,kind,ref_id,summary) values (coalesce(new.author,who),new.project_id,'note',new.task_id::text,'commented: '||left(new.body,140));
  elsif TG_TABLE_NAME = 'dw_projects' then
    if TG_OP = 'INSERT' then
      insert into dw_activity(actor,project_id,kind,ref_id,summary) values (who,new.id,'project',new.id::text,'new project: '||new.name);
    elsif coalesce(new.stage,'') <> coalesce(old.stage,'') then
      insert into dw_activity(actor,project_id,kind,ref_id,summary) values (who,new.id,'stage',new.id::text,new.name||' moved to '||coalesce(new.stage,'–'));
    elsif new.is_live and not coalesce(old.is_live,false) then
      insert into dw_activity(actor,project_id,kind,ref_id,summary) values (who,new.id,'project',new.id::text,new.name||' went live');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists dw_log_tasks on public.dw_project_tasks;
create trigger dw_log_tasks after insert or update on public.dw_project_tasks for each row execute function public.dw_log();
drop trigger if exists dw_log_docs on public.dw_docs;
create trigger dw_log_docs after insert or update on public.dw_docs for each row execute function public.dw_log();
drop trigger if exists dw_log_notes on public.dw_task_notes;
create trigger dw_log_notes after insert on public.dw_task_notes for each row execute function public.dw_log();
drop trigger if exists dw_log_projects on public.dw_projects;
create trigger dw_log_projects after insert or update on public.dw_projects for each row execute function public.dw_log();

revoke execute on function public.dw_log() from public, anon, authenticated;

-- clients (role 'client') never see jobs marked client_hidden; collaborators do
drop policy if exists "member reads tasks" on public.dw_project_tasks;
create policy "member reads tasks" on public.dw_project_tasks for select to authenticated using (
  public.dw_can_see(project_id) and (public.dw_is_owner() or not coalesce(client_hidden,false) or exists (
    select 1 from public.dw_members m where m.active and m.role = 'collaborator' and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email','')))));

alter function public.dw_actor() set search_path = public;
revoke execute on function public.dw_can_see(uuid) from public, anon;
grant execute on function public.dw_can_see(uuid) to authenticated;
