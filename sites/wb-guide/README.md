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

Every colour is a token (`--f` dark sections and buttons, `--cr` page, `--hi` highlight, `--ac` accent
and so on), defined once in `WB_PALETTES` at the bottom of each design file. They match the Gary Evans
Pro site:

| Token | Colour | Used for |
|---|---|---|
| `--cr` / `--cd` | #F8F7FC / #FFFFFF | page and cards |
| `--f` | #1A1640 | hero, dark panels, buttons |
| `--fd` | #0A080C | footer |
| `--ink` / `--mu` | #0A080C / #5E5A72 | text |
| `--hi` | #F0A8DC | highlights on dark, Search and Call to order buttons |
| `--ac` | #8A4FD0 | logo mark, small accents |
| `--at` | #B63DB6 | accent text on white |

The business call-to-action uses Gary's pink, purple and indigo gradient (#D24BA9, #9A5FD8, #7674F1).
Headings stay Inter Tight rather than Gary's Bebas Neue.

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
