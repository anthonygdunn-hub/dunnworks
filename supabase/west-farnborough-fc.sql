-- West Farnborough FC preview + club hub (22 Nov 2026). Kept here as the record.
-- Project acdpgarasgfhvupzsbxf. Migrations ALREADY APPLIED: wfc_club_hub, wfc_audit_fix, wfc_match_fees_and_seed,
--   wfc_revoke_anon_helpers, wfc_guard_allow_maintenance, wfc_match_fees_fix.
-- Tables: wfc_members (logins + roles admin/committee/treasurer/manager/coach/player, status pending/approved/left),
--   wfc_events (match/training/event/meeting, score, fee), wfc_rsvps (yes/no/maybe + attended), wfc_match_stats
--   (goal/assist/yellow/red/pen_scored/pen_missed/pen_saved/own_goal/motm/clean_sheet), wfc_charges, wfc_payments
--   (confirmed/claimed/rejected), wfc_ledger (club money in/out), wfc_news, wfc_settings (table, fees, pay_link,
--   fa_link, sponsor, ground), wfc_log (audit trail via triggers).
-- Functions: wfc_role(), wfc_me(), wfc_has(), wfc_whoami(), wfc_register(), wfc_update_profile(), wfc_roster(),
--   wfc_balances(), wfc_charge_match_fees(event), wfc_public() (anon website feed, no money/RSVPs/contact details).
-- Who can do what (enforced by RLS + wfc_members_guard trigger):
--   player: own profile, own RSVPs, own charges/payments, claim "I've paid"; sees events, results, roster names
--   coach: + events, attendance, match stats, edit squad details
--   manager: + approve players, news, table, settings, raise match fees, record cash payments
--   committee: + approve players, read the full treasury and edit history
--   treasurer: full treasury (charges, payments, confirm claims, ledger), no fixtures editing
--   admin: everything incl. roles. info@dunnworks.io is always admin.
-- FA Full-Time blocks automated fetches (Cloudflare challenge), so fixtures/results/table come in by paste-import in Manage > FA Full-Time. Links stored in wfc_settings fa_link and fa_fixtures.
-- Club hub: /preview/west-farnborough-fc/club/ (uses /triplog/vendor/supabase.js and /assets/js/dw-config.js)
insert into public.dw_project_keys (slug, doc, file_salt, file_iter) values
  ('west-farnborough-fc','site','iaEBdQwc9PTh04j1eTfyLw==',600000);
insert into public.dw_projects (slug, name, sector, blurb, kind, status, is_live, has_preview, has_report, pages, sort_order, published)
values ('west-farnborough-fc','West Farnborough FC','Football club','Farnborough. ACSFL Division 1 Sunday club, "The Westie". Mobile-first site in the crest''s red, black and gold with live fixtures, results, scorers and table, plus a club hub: player logins with yes/maybe/no for games, training and events, profiles with stats and money owed, match centre, attendance, and a full treasury.','preview','build',false,true,false,1,253,false);
-- Passphrase goes in dw_project_secrets (not in this file).
-- Instagram sync (22 Nov 2026, migration wfc_instagram): wfc_instagram (posts, copied images in the public
-- "gallery" bucket under westfarnborough/, shown flag), wfc_private (ig_token, cron_secret; service role only),
-- wfc_set_ig_token() admin-only, wfc_ig_status(), wfc_public() now includes 'instagram'.
-- Edge function wfc-instagram-sync (supabase/functions/wfc-instagram-sync). pg_cron job 'wfc-instagram-sync'
-- runs at :17 every 2 hours once a token is saved. Token: Instagram API with Instagram Login, from the
-- Dunnworks Meta app, pasted by a club admin in Manage > Instagram; refreshed automatically weekly.
