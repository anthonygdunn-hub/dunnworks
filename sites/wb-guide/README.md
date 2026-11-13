# woolmer — the Whitehill & Bordon guide

Anthony's own project (working name W&B Guide): one independent guide to every shop, takeaway,
pub, supermarket, club and sports facility in Whitehill & Bordon, with menus, local reviews,
"Ask the town" questions and What's on. Named after the Royal Forest of Woolmer, which the town
sits in. The homepage carries a "Why woolmer?" section explaining that.

Everything in the mockup (business names, menus, prices, ratings, reviews, questions, events) is a
made-up sample to show the layout.

## Files

```
design/*.dc.html   the screens, exported from the Claude design canvas (source of truth)
design/canvas.json canvas layout
build.mjs          renders the design into one plain HTML preview
preview.html       the built preview (unlocked, not served)
```

Design canvas: https://claude.ai/artifact/JZ2MeExHz6Dy2fvC7ZMnhG

## Colours

Zodiac and fountain blue, with the tree logo and headings in orange. Every colour is a token,
defined once in `WB_PALETTES` at the bottom of each design file:

| Token | Colour | Used for |
|---|---|---|
| `--f` / `--rg` | #0C243C / #12304F Blue Zodiac | hero, dark panels, buttons, call-to-action band |
| `--fd` | #07172A | footer |
| `--mint` | #C9D1D5 Tiara | category band |
| `--cr` / `--cd` | #F5F7F8 / #FFFFFF | page and cards |
| `--hi` | #55C2C3 Fountain Blue | "one place.", Search, Call to order, date badges |
| `--ac` | #FF862F orange | tree logo and small pops (Search arrow, New badge, map pin) |
| `--hd` | #FF862F | headings on dark backgrounds |
| `--hl` | #C4550F | headings on light backgrounds (deeper so they stay readable) |
| `--ink` / `--mu` | #0C243C / #4F5E6E | text |

Headings pick their colour from CSS: `h1,h2` use `--hl`, and anything inside an element with
class `dk` (the dark sections) uses `--hd`. Earlier colour options are in the git history.

## Preview on dunnworks.io

`dunnworks.io/preview/wb-guide/`, locked with the passphrase in the console (project
"woolmer (W&B Guide)"). To refresh it, from the dunnworks repo:

```
node sites/wb-guide/build.mjs
cp sites/wb-guide/preview.html /tmp/wb.html
node tools/previewbar.mjs --in=/tmp/wb.html --out=/tmp/wb.html --client="woolmer, the W&B guide" \
  --note="click anything"
node tools/lock.mjs --in=/tmp/wb.html --out=preview/wb-guide/index.html \
  --client="woolmer, the W&B guide" --pass="<passphrase from the console>"
node tools/rekey.mjs --in=preview/wb-guide/index.html --slug=wb-guide --doc=site
```

Then put the printed `file_salt` into the `dw_project_keys` row for `wb-guide` (wrap columns
cleared) and commit the preview.
