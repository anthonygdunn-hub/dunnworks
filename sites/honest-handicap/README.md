# Honest Handicap

Source for honesthandicap.golf: golf kit reviews written by real club golfers,
every verdict with the tester's handicap on the card. Built and managed by
Dunnworks from the dunnworks.io console (area **Honest Handicap**, project `honest-handicap`).

This folder is laid out as the root of its own repo (`anthonygdunn-hub/honest-handicap`),
which is what GitHub Pages serves. Until that repo exists it lives in the dunnworks
repo at `sites/honest-handicap/`.

## How it works

```
Join form  ──► hh-join  ──► hh_testers (applied) ──► email to Anthony
                                   │
              console: Approve ────┘──► hh-admin issues a tester code (only its hash is kept)

Card form  ──► hh-card (checks the code, takes up to 3 photos) ──► hh_reviews (submitted) + hh-uploads bucket
                                   │
              console: Save and publish ──► hh-admin copies photos to hh-public, marks it published,
                                            then starts the GitHub Action
                                                    │
              build.py reads hh_published_reviews() and hh_public_testers() ──► site/ ──► GitHub Pages
```

* Tester names and courses on a card come from the tester's own record, so nobody can write as someone else
* Buy now buttons only show for links ticked "Tracked (Ad)" with an https:// address. No link, no button
* Publishing in the console goes out within about 15 minutes (the workflow's 15-minute check), or about two minutes if `HH_GITHUB_TOKEN` is set. The nightly build at 03:17 is a safety net

## Layout

```
src/layout.html    the shell: head, SEO tags, header, footer
src/pages/*.html   the fixed pages (home, how we test, testers, join, submit, about, disclosure, privacy, 404)
src/site.css       all the styles and golf animations
src/site.js        menu, animations, and the two forms (they post to the Supabase edge functions)
build.py           reviews, category pages, review pages, sitemap, robots, schema -> site/
site.json          base address, live switch, affiliate programmes list
brand/             logos, favicon, og.png share image, the full logo set zip
.github/workflows/build.yml   build and deploy to GitHub Pages
```

Database and functions live in the dunnworks repo: `supabase/honest-handicap.sql` and
`supabase/functions/hh-join`, `hh-card`, `hh-admin` (shared code in `_shared/hh.ts`).
The console screen is `assets/js/dw-hh.js`.

## Build

```
python3 build.py              real pages from Supabase -> site/
python3 build.py --sample     placeholder reviews and testers, to look at the design
python3 build.py --preview    one-file version for the locked preview (add --sample before launch)
```

Pages: `/`, `/reviews/`, `/reviews/<category>/`, `/reviews/<category>/<review>/`, `/how-we-test/`,
`/testers/`, `/join/`, `/submit/`, `/about/`, `/affiliate-disclosure/`, `/privacy/`, `404.html`.
Each review page carries Product + Review and Breadcrumb schema, its own title, description,
canonical and share image (the tester's first photo).

Placeholders such as `[Brand]` show with a dashed pink underline and only ever appear with `--sample`.
With no reviews yet, the real build shows honest "first cards are being filled in" panels instead.

## Preview on dunnworks.io

The private preview lives at `dunnworks.io/preview/honest-handicap/`, locked with the
passphrase kept in the console. To refresh it, from the dunnworks repo:

```
python3 sites/honest-handicap/build.py --sample --preview
cp sites/honest-handicap/preview.html /tmp/hh.html
node tools/previewbar.mjs --in=/tmp/hh.html --out=/tmp/hh.html --client="Honest Handicap"
node tools/lock.mjs --in=/tmp/hh.html --out=preview/honest-handicap/index.html \
  --client="Honest Handicap" --pass="<passphrase from the console>"
node tools/rekey.mjs --in=preview/honest-handicap/index.html --slug=honest-handicap --doc=site
```

Then put the printed `file_salt` into the `dw_project_keys` row for `honest-handicap`
(wrap columns cleared) and commit the preview.

## Animations

All CSS and SVG, no libraries: the ball flight and drop on the hero, waving flags, the
putt-line scroll bar, pencil-circled verdicts that draw themselves, score bars with a ball
on the end, swinging club icons, the ball that chips off the tee on review cards, the ball
dropping into the cup on Buy now buttons, the mowing stripes and the 404 lost ball.
Anyone with "reduce motion" switched on gets still pictures instead.

## One-off setup (not done yet)

1. **Repo**: create an empty `anthonygdunn-hub/honest-handicap`, push this folder's contents to `main`.
   Settings, Pages, Source: **GitHub Actions**
2. **Rebuild token (optional)**: without it, the workflow checks Supabase every 15 minutes and rebuilds
   when something has been published or taken down. For instant rebuilds: GitHub, Settings, Developer
   settings, Fine-grained tokens. Repository access: only `honest-handicap`. Permissions:
   **Actions: Read and write**. Add it in Supabase (project acdpgarasgfhvupzsbxf, Edge Functions,
   Secrets) as `HH_GITHUB_TOKEN`
3. **Emails**: alerts go to `HH_NOTIFY_TO` (default anthonygdunn@gmail.com). Once
   honesthandicap.golf is verified in Resend, set `HH_FROM` (e.g. `hello@honesthandicap.golf`) and
   testers get their code by email automatically. Until then the console gives you the message to send

## Going live

1. Buy honesthandicap.golf (auto-renew on)
2. Repo Settings, Pages: custom domain `honesthandicap.golf`, then **Enforce HTTPS** once the certificate is issued
3. DNS: the four GitHub Pages A records on the apex (185.199.108.153, .109.153, .110.153, .111.153),
   AAAA records if your registrar takes them, and CNAME `www` to `anthonygdunn-hub.github.io`
4. In `site.json` set `"live": true` and push. That switches every page to index, opens robots.txt
   and fills the sitemap
5. Search Console: add the domain property, verify by DNS, submit `https://honesthandicap.golf/sitemap.xml`,
   request indexing for the home page and first reviews
6. As affiliate programmes approve you, add their names to `affiliates` in `site.json` so the
   disclosure page lists them
