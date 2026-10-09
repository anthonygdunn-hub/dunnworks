# Honest Handicap

Source for honesthandicap.golf: golf kit reviews written by real club golfers,
every verdict with the tester's handicap on the card. Built and managed by
Dunnworks from the dunnworks.io console (project `honest-handicap`).

## Layout

```
src/index.html   the whole site: pages, styles, golf animations, router, forms
build.py         fills in the logo, icons, review cards and kit grid -> site/index.html
brand/           logo-dark.svg, icon.svg and the full logo set zip
site/            the built site (what GitHub Pages serves once live)
```

## Build

```
python3 build.py
```

Placeholders such as `[Brand] [Model]` or `[Tester]` show with a dashed pink
underline, so nothing unfinished goes out by accident.

## Where this lives

This source sits in the dunnworks repo at `sites/honest-handicap/` until it gets its own repo. Note: everything in the dunnworks repo is publicly reachable through dunnworks.io.

## Preview on dunnworks.io

The private preview lives at `dunnworks.io/preview/honest-handicap/`, locked
with a passphrase (kept in the console, never in this repo). To refresh it after
a change, from the `dunnworks` repo:

```
cp sites/honest-handicap/site/index.html /tmp/hh.html
node tools/previewbar.mjs --in=/tmp/hh.html --out=/tmp/hh.html --client="Honest Handicap"
node tools/lock.mjs --in=/tmp/hh.html --out=preview/honest-handicap/index.html \
  --client="Honest Handicap" --pass="<passphrase from the console>"
node tools/rekey.mjs --in=preview/honest-handicap/index.html --slug=honest-handicap --doc=site
```

Then put the printed `file_salt` into the `dw_project_keys` row for
`honest-handicap` (wrap columns cleared) and commit the preview.

## Animations

All CSS and SVG, no libraries: the ball flight and drop on the hero, waving
flags, the putt-line scroll bar, pencil-circled verdicts that draw themselves,
score bars with a ball on the end, swinging club icons, the ball that chips off
the tee on review cards, the ball dropping into the cup on Buy now buttons, the
mowing stripes and the 404 lost ball. Anyone with "reduce motion" switched on
gets still pictures instead.

## Going live (GitHub Pages)

1. Copy `site/index.html` to the root of the repo (or set Pages to serve `/site`).
2. Remove the `noindex` robots meta tag.
3. Settings, Pages: branch `main`; custom domain `honesthandicap.golf`; enforce HTTPS.
4. DNS: the four GitHub Pages A records on the apex, CNAME `www` to `anthonygdunn-hub.github.io`.
5. Search Console: verify and submit the sitemap.
