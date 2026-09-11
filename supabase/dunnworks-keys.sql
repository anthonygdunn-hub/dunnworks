-- Dunnworks — reissuable preview passphrases
-- Run once in the SQL editor of project acdpgarasgfhvupzsbxf, after
-- dunnworks-schema.sql.
--
-- A locked preview is encrypted with a key that never changes. Until now the
-- passphrase WAS that key, so it could not be changed without rebuilding a 1MB
-- file. This table holds that key a second time, wrapped in a key derived from
-- the passphrase. Reissuing a passphrase just rewraps it.
--
-- Anyone may read this table. A wrapped key is 32 bytes of AES-GCM ciphertext
-- and is worth nothing without the passphrase, and the gate has to be able to
-- read it before anyone has signed in.

create table if not exists public.dw_project_keys (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null,                 -- preview/<slug>/
  doc        text not null default 'site'
             check (doc in ('site','report')),

  file_salt  text not null,                 -- salt the original passphrase used
  file_iter  int  not null default 600000,

  wrap_salt  text,                          -- null until the first reissue
  wrap_iv    text,
  wrapped    text,                          -- file key, encrypted with the passphrase

  updated_at timestamptz not null default now(),
  unique (slug, doc)
);

alter table public.dw_project_keys enable row level security;

drop policy if exists "anyone can read wrapped keys" on public.dw_project_keys;
create policy "anyone can read wrapped keys"
  on public.dw_project_keys for select to anon using (true);

drop policy if exists "signed in can read wrapped keys" on public.dw_project_keys;
create policy "signed in can read wrapped keys"
  on public.dw_project_keys for select to authenticated using (true);

drop policy if exists "owner writes wrapped keys" on public.dw_project_keys;
create policy "owner writes wrapped keys"
  on public.dw_project_keys for all to authenticated
  using (public.dw_is_owner()) with check (public.dw_is_owner());

drop trigger if exists dw_keys_touch on public.dw_project_keys;
create trigger dw_keys_touch before update on public.dw_project_keys
  for each row execute function public.dw_touch();

-- The salts the four locked pages were originally built with. No wrap yet, so
-- the passphrases already issued keep working until the first reissue.
insert into public.dw_project_keys (slug, doc, file_salt) values
  ('take2',   'site',   'lsC/ailz/FvxElY36T9H0Q=='),
  ('take2',   'report', '22/g7OINdwo4r9Gdmm5Jfw=='),
  ('ashland', 'site',   '/lZdRs/j6WZYfIBKhP1eUA=='),
  ('ashland', 'report', 'jzkDrBKqNzbn+lGphdzjzQ==')
on conflict (slug, doc) do nothing;
