-- Dunnworks Workspace: starting data (projects not yet in the console, repos, plan docs, contacts).
-- Safe to run twice: everything is guarded.

insert into public.dw_projects (slug, name, sector, blurb, kind, status, stage, has_preview, published, hq_group, sort_order, website, repo)
values
  ('awayday', 'Awayday', 'Golf course and society-day reviews',
   'Sister site to Honest Handicap: course and society-day reviews with a Society Score, quote requests and package comparison.',
   'preview', 'build', 'won', false, false, 'own', 200, 'https://awayday.golf', 'anthonygdunn-hub/awayday'),
  ('trip-log', 'Trip Log', 'Mileage logging app',
   'Fuel-card mileage log at dunnworks.io/triplog for Zoe and approved colleagues, with a PDF to send to the employer.',
   'preview', 'live', 'won', false, false, 'own', 210, 'https://dunnworks.io/triplog/', 'anthonygdunn-hub/dunnworks'),
  ('nocatch-cv', 'NoCatch CV', 'CV builder (idea)',
   'Honest, no-subscription CV builder with a one-off payment: templates, PDF export, AI writing help, saved CVs, cover letters and scoring.',
   'preview', 'build', 'not-contacted', false, false, 'own', 220, null, null),
  ('whitehill-bordon-fc', 'Whitehill & Bordon FC', 'Football club',
   'Free rebuild for The Stags, easy to use on mobile, crest-matched colours, club admin with Admin/Editor/Coach roles. Dunnworks listed as sponsor.',
   'preview', 'build', 'meeting', true, false, 'client', 230, 'https://whitehillbordonfc.co.uk', 'anthonygdunn-hub/dunnworks')
on conflict (slug) do nothing;

update public.dw_projects set repo = 'anthonygdunn-hub/honest-handicap' where slug = 'honest-handicap' and repo is null;
update public.dw_projects set repo = 'anthonygdunn-hub/farnborough-contracting' where slug = 'farnborough-contracting' and repo is null;
update public.dw_projects set repo = 'anthonygdunn-hub/dunnworks'
  where repo is null and slug in ('gary-evans-pro','md-dance-academy','funworks','wb-guide','backswing-golf','the-falkners-arms',
                                  'best-bbq-kebabs','new-town','woolmer-taxis','tame-the-taxman','coastal-golf-co');

-- --------------------------------------------------------------- plan docs
insert into public.dw_docs (project_id, title, body, tags, pinned, created_by)
select p.id, d.title, d.body, d.tags, true, 'info@dunnworks.io'
from (values
  ('wb-guide', 'woolmer plan', $b$## What it is
Whitehill & Bordon local guide at woolmer.info: every shop, takeaway (with menus), supermarket, sports facility and kids' park in one place, with reviews, Q&A and What's on

## Why
- Side business, community project and Dunnworks lead generator in one
- Free for businesses. Money comes from Dunnworks websites: a promo on every page and a "See your mock-up site" for each local independent

## Decided
- Name stays Woolmer (after Woolmer Forest), explained on the homepage
- Zodiac and fountain blue, tree logo and headings in orange #FF862F
- Sections: directory, reviews and Q&A, takeaway menus, What's on, Trades & home services, Kids & family, Ask-the-town board, free add-your-business form
- What's on filled 6 months ahead, checked daily, 30-mile radius, filterable beyond Bordon
- Nightly research sweep feeds an admin review list; nothing goes live until approved
- Coverage includes Passfield
- No street walk: promote and let businesses come in
- Socials @woolmer.info, own Buffer under hello@woolmer.info, launch posts from 16 Nov 2026

## Open
- Solicitor check on reviews (reviews already switched on 14 Nov)$b$, array['plan']),

  ('honest-handicap', 'Honest Handicap plan', $b$## What it is
Golf kit review site at honesthandicap.golf, earning through affiliate Buy now buttons

## Decided
- Reviews written by golf society members as approved testers (tester code needed)
- Sister site to Awayday, shared tester base, cross-linked
- Re-skin to match Awayday's dark green and gold (Nov 2026), keeping the Scorecard logo
- Buy now hidden until a tracked affiliate link exists
- Alerts to info@dunnworks.io; run under Dunnworks as data controller; repo anthonygdunn-hub/honest-handicap
- Time budget: 3 to 5 hours a week

## Next
- Get 5 real reviews in, then apply to affiliate programmes
- Ask society members to join as testers$b$, array['plan']),

  ('awayday', 'Awayday plan', $b$## What it is
Golf course and society-day review site at awayday.golf, an alternative to leadingcourses.com

## Decided
- Society Score, society quote requests and package comparison
- Shares reviewers and accounts with Honest Handicap; course reviews from tester codes or anyone with a verified round
- Own repo anthonygdunn-hub/awayday, managed from the console$b$, array['plan']),

  ('nocatch-cv', 'NoCatch CV plan', $b$## What it is
An honest CV builder run as a real business: one-off payment, no subscription trap

## v1
- Templates and PDF export
- AI writing help
- Accounts and saved CVs
- Cover letters
- CV scoring

## Open
- Final name (NoCatch CV is the working name)$b$, array['plan','idea']),

  ('coastal-golf-co', 'Coastal Golf Co plan', $b$## Set-up
- Built for Stuart as a favour, with a Falkners-style self-edit admin
- Dunnworks keeps full control and manages the site going forward; fine to host on Stuart's VPS
- Stats dashboard in the console: own cookieless counter plus GA4, Search Console, speed and uptime

## Socials
- Instagram (on Tony's phone) and Facebook page, both managed together with Stuart
- Posts scheduled through Buffer
- Monthly newsletter planned
- Keep it low-key in the Falkners Arms WhatsApp group for now$b$, array['plan']),

  ('backswing-golf', 'Backswing Golf scope', $b$## Asked for
- New website for the second-hand golf club shop, replacing selling only on eBay
- New logo
- eBay shop included and synced both ways
- Full admin back end
- Hosted like Coastal Golf Co
- Social media set up plus 6 months of scheduled Buffer posts$b$, array['scope']),

  ('whitehill-bordon-fc', 'Whitehill & Bordon FC offer', $b$## The offer
- Free rebuild for The Stags because the current site is hard to use on mobile
- Offered to the manager, Daniel Zubiena
- Dunnworks manages it (not the previous designer); the only ask is Dunnworks listed as a sponsor

## Build
- Keep the crest, site colours matched to it
- Working club admin with Admin, Editor and Coach roles
- PDF pack for the committee$b$, array['scope']),

  ('the-falkners-arms', 'The Falkners Arms brief', $b$## Brief
- Keep their logo and wording, colours from the logo
- Table booking, events, food menu, WhatsApp button
- Manager admin for bookings, events and menus

## People
- Jon Chapman, landlord; Jo Winsall, Jon's wife and admin
- Ollie and Keri, managers; Liz, head chef
- Staff WhatsApp group "In the know"$b$, array['brief']),

  ('best-bbq-kebabs', 'Best BBQ Kebabs brief', $b$## Brief
- Rebuild of bestbbqkebabs.com as a preview with a passphrase
- Online ordering, orders sent to an email and a mobile
- New modern logo, 3 options$b$, array['brief']),

  ('new-town', 'New Town brief', $b$## Brief
- Chinese takeaway in Lindford, built from their paper menu leaflet
- Same style as Best BBQ Kebabs, keeping their Chinese-character logo$b$, array['brief']),

  ('tame-the-taxman', 'Tame The Taxman brief', $b$## Brief
- Rebuild of tamethetaxman.co.uk for Tara Hotston
- Original wording kept unchanged, their own logo and its colours$b$, array['brief']),

  ('funworks', 'Funworks concept', $b$## What it is
Sister brand to Dunnworks at funworks.io, cross-linked, with a properly cheeky tone

## Services
- Logos and brand identity
- AI imagery and design
- Social and print kits
- Motion and video$b$, array['plan']),

  ('trip-log', 'Trip Log notes', $b$## What it is
Mileage log at dunnworks.io/triplog for Zoe to log private and work fuel-card mileage and send a PDF to her employer

## Rules
- Colleagues can register with email and password; Tony approves each one first
- Everyone sees only their own trips
- Funworks colours$b$, array['notes'])
) as d(slug, title, body, tags)
join public.dw_projects p on p.slug = d.slug
where not exists (select 1 from public.dw_docs x where x.project_id = p.id and x.title = d.title);

insert into public.dw_docs (project_id, title, body, tags, pinned, created_by)
select null, 'Dunnworks: how I sell', $b$## Positioning
- Hand-coded sites for small businesses in Hampshire and Surrey
- Against page builders: no monthly licence, fast pages, the client owns the files
- From £750

## Prospect routine
1. Build a mock-up site plus a report of what can be improved
2. Add it to the console previews with a passphrase
3. Send the link and passphrase
4. Track stage, last contact and next action in the pipeline$b$, array['playbook'], true, 'info@dunnworks.io'
where not exists (select 1 from public.dw_docs where title = 'Dunnworks: how I sell');

-- ---------------------------------------------------------------- contacts
insert into public.dw_contacts (project_id, name, role, email)
select p.id, c.name, c.role, c.email from (values
  ('coastal-golf-co','Stuart','Owner','hello@coastalgolfco.co.uk'),
  ('gary-evans-pro','Gary Evans','Golf pro',null),
  ('tame-the-taxman','Tara Hotston','Owner','tara@tamethetaxman.co.uk'),
  ('the-falkners-arms','Jon Chapman','Landlord',null),
  ('the-falkners-arms','Jo Winsall','Staff and admin',null),
  ('the-falkners-arms','Ollie','Manager',null),
  ('the-falkners-arms','Keri','Manager',null),
  ('the-falkners-arms','Liz','Head chef',null),
  ('whitehill-bordon-fc','Daniel Zubiena','Club manager',null)
) as c(slug,name,role,email)
join public.dw_projects p on p.slug = c.slug
where not exists (select 1 from public.dw_contacts x where x.project_id = p.id and x.name = c.name);

insert into public.dw_events (project_id, title, starts_on, kind)
select p.id, 'woolmer launch posts start', date '2026-11-16', 'launch' from public.dw_projects p
where p.slug = 'wb-guide' and not exists (select 1 from public.dw_events where title = 'woolmer launch posts start');
