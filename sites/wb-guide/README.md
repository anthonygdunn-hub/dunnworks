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

Forest colours, mixed section by section the way campfire.ai does it. Every colour is a token,
defined once in `WB_PALETTES` at the bottom of each design file:

| Token | Colour | Used for |
|---|---|---|
| `--f` | #142D25 deep forest | hero, listing header, footer tone |
| `--rg` | #0A4733 rich green | buttons, icon squares, What's on, Why woolmer panel |
| `--mint` | #DAECDE | category band, Good to know box, soft pills |
| `--cr` / `--cd` | #F9F9F8 / #FFFFFF | page and cards |
| `--hi` | #B3ED97 lime | highlights, Search and Call to order, business call-to-action band |
| `--ac` | #FF862F orange | small pops only: logo mark, Search arrow, New badge, map pin |
| `--ink` / `--mu` | #101012 / #52644D | text |

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
