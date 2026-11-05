# Backswing Golf — build source

Website for www.backswinggolf.co.uk, built and managed by Dunnworks. Client: Backswing Golf (eBay shop `backswinggolf`).
Everything here generates files; never hand-edit `site.html` or `live/`.

## What it is

- A single-page shop (hash routes: `#/`, `#/shop`, `#/club/<slug>`, `#/sell`, `#/grading`, `#/delivery`, `#/about`, `#/contact`, `#/privacy`, `#/terms`, `#/admin`)
- Stock is read live from Supabase `bsg_products` (project `acdpgarasgfhvupzsbxf`), so new items, edits and sales show without a rebuild
- Checkout is on eBay: every item's main button is **Buy securely on eBay**. Items added in the admin without an eBay listing show **Reserve this item** (email) instead
- Wording marked `data-k` can be changed in the admin (`bsg_content`)
- Sell your clubs writes to `bsg_tradeins`, photos to the private `bsg-tradeins` bucket

## Layout

- `src/index.html` page shell and templates, `src/style.css`, `src/app.js` storefront, `src/admin.js` staff admin
- `build.py` inlines fonts, logos and config into one file
- `brand/make_logos.py` the three logo directions (Modern, Heritage, Sporty) as outlined SVGs in `brand/logos/`; `brand/logo-board.html` shows them side by side
- `fonts/` Barlow, Barlow Condensed, DM Serif Display (SIL OFL)

## Build

```
python3 brand/make_logos.py     # only when the logos change
python3 build.py                # site.html = review preview (gold placeholders, Try a logo box)
python3 build.py live           # live/ = test copy, noindex
python3 build.py live golive    # launch build: indexable, CNAME
```

Set `LOGO` in build.py to `a`, `b` or `c` once Backswing chooses.

## Publish the preview

```
node tools/previewbar.mjs --in=sites/backswing-golf/site.html --out=/tmp/pv.html --client="Backswing Golf"
node tools/lock.mjs --in=/tmp/pv.html --out=preview/backswing-golf/index.html --client="Backswing Golf" --pass="<from dw_project_secrets>"
node tools/rekey.mjs --in=preview/backswing-golf/index.html --slug=backswing-golf --doc=site
```
Then put the printed `file_salt` in `dw_project_keys` (slug backswing-golf, wrap columns null).

## Database and the eBay link

Schema: `supabase/backswing-golf.sql`. Edge function: `supabase/functions/bsg-ebay-sync` (deployed, `verify_jwt` off, does its own auth).

The eBay link is off until the secrets listed at the top of the function are set. Then:
1. Backswing presses **Link eBay** in the admin and approves on eBay
2. Schedule `select net.http_post(url := '<function url>', headers := '{"x-cron-secret":"…","Content-Type":"application/json"}', body := '{"action":"sync"}')` every 15 minutes with pg_cron
3. Editing title, price, quantity or status of an eBay item in the admin marks it `pending_push`; the sync sends it to eBay. Sold or ended on eBay marks it sold or hidden here

The first stock load (5 Nov 2026) was read from the public eBay shop: 727 listings with photos, item specifics and condition notes. Grades were suggested from the notes and are marked "to check" until Backswing confirms them.

## House rules

UK English. Every form and enquiry goes to info@backswinggolf.co.uk. Real figures only (eBay feedback and sales counts as shown on eBay). Photos are always of the actual item. No brand logos without permission.
