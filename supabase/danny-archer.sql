-- Danny Archer actor site preview (24 Nov 2026). ALREADY APPLIED to project acdpgarasgfhvupzsbxf. Kept as the record.
insert into public.dw_project_keys (slug, doc, file_salt, file_iter) values
  ('danny-archer','site','TV1eZOtTwIXIK+AclKfwyg==',600000);
insert into public.dw_projects (slug,name,sector,blurb,kind,status,is_live,has_preview,has_report,pages,sort_order,published,hq_group)
values ('danny-archer','Danny Archer','Actor showcase','Actor CV and showcase site for Danny Archer (Daniel McNaughton), lead as Paul ''Eyeball'' Hales in Red Brick War. Family. Credits, stats, showreel and agent details still to add.','preview','build',false,true,false,1,255,false,'client');
-- Passphrase is in dw_project_secrets (not in this file).
-- Photos are inlined in the encrypted page, so nothing is readable without the passphrase.
