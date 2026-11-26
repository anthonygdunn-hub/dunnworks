-- OneStream User Group preview (26 Nov 2026). ALREADY APPLIED to project acdpgarasgfhvupzsbxf. Kept as the record.
insert into public.dw_project_keys (slug, doc, file_salt, file_iter) values
  ('osug','site','jmNTLieCSuoLouAbVI8x3A==',600000);
insert into public.dw_projects (slug,name,sector,blurb,kind,status,is_live,has_preview,has_report,pages,sort_order,published)
values ('osug','OneStream User Group','Professional community / user group','Independent, member-run global user group for OneStream customers.','preview','build',false,true,false,14,257,false);
-- Passphrase is in dw_project_secrets (not in this file).
-- v2 (26 Nov 2026 evening): four new community logo options (Huddle, Conversation, Network, Crest); Huddle in header. Re-locked, salt above updated.
