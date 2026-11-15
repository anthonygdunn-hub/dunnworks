-- Whitehill & Bordon FC preview (15 Nov 2026). Kept here as the record. Not yet applied.
insert into public.dw_project_keys (slug, doc, file_salt, file_iter) values
  ('whitehill-bordon-fc','site','h5osKIi01MBApjfq2Ih2gQ==',600000);
insert into public.dw_projects (slug, name, sector, blurb, kind, status, is_live, has_preview, has_report, pages, sort_order, published)
values ('whitehill-bordon-fc','Whitehill & Bordon FC','Football club','Bordon. Hampshire Premier League club. Mobile-first rebuild in the crest's gold and black: next-match countdown, fixtures, table, news, squad, youth, sponsors, app-style bottom bar.','preview','build',false,true,false,1,252,false);
-- Passphrase stored in dw_project_secrets (not in this file).
-- Club admin (15 Nov 2026), applied via migrations wbfc_site_admin, wbfc_secrets, wbfc_save_look, wbfc_save_badges:
--   wbfc_content (one row 'site' = all website content, public read), wbfc_members (club logins + role admin/editor/coach),
--   wbfc_log (edit history), wbfc_secrets (import key, service role only), wbfc_role(), wbfc_save(section, value, summary),
--   wbfc_set_member(); storage bucket wbfc-media (public, 50MB). Edge functions: wbfc-logins (admin manages logins),
--   wbfc-import (pulls every gallery photo + finds opponents' badges; admin or x-wbfc-key).
-- Admin console: /preview/whitehill-bordon-fc/admin/ . Dunnworks owner login (info@dunnworks.io) is always admin.
