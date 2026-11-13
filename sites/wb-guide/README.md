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

Six colour options, switchable from the bar in the preview's bottom corner (the choice is remembered
per browser) and laid side by side on the design canvas. Every colour is a token (`--f` dark sections,
`--rg` buttons and dark panels, `--mint` light band, `--hi` highlight, `--ac` small pops, `--t1`..`--t6`
photo placeholder tints and so on), defined per option in `WB_PALETTES` at the bottom of each design file.

| Option | Dark | Light band | Highlight | Pop |
|---|---|---|---|---|
| forest: Forest mix (Campfire style) | #142D25 / #0A4733 | #DAECDE | #B3ED97 lime | #FF862F orange |
| honey: Pine and honey | #1E3328 / #2D5A3D | #EFE6CF | #EBC766 | #D9622B |
| moss: Moss and clay | #25301F / #3F5A2A | #E3EBD3 | #CFE68C | #C65A3E |
| persian: Persian blue (Anthony's swatches) | #2218A7 / #1A1380 | #E1E5F8 | #BBC4EB | #737CCF |
| juniper: Juniper and mist (Anthony's swatches) | #4E6F76 / #3E5C62 | #DFE9EB | #A9CCCF | #5E9BA3 |
| zodiac: Zodiac and fountain blue (Anthony's swatches) | #0C243C / #12304F | #C9D1D5 | #55C2C3 | #2FA9AB |

Once one is chosen, delete the others from `WB_PALETTES` (the switcher disappears by itself when only
one is left) and remove the `Home-*.dc.html` canvas boards.

## Preview on dunnworks.io

`dunnworks.io/preview/wb-guide/`, locked with the passphrase in the console (project
"woolmer (W&B Guide)"). To refresh it, from the dunnworks repo:

```
node sites/wb-guide/build.mjs
cp sites/wb-guide/preview.html /tmp/wb.html
node tools/previewbar.mjs --in=/tmp/wb.html --out=/tmp/wb.html --client="woolmer, the W&B guide" \
  --note="6 colour options in the bottom corner, click anything"
node tools/lock.mjs --in=/tmp/wb.html --out=preview/wb-guide/index.html \
  --client="woolmer, the W&B guide" --pass="<passphrase from the console>"
node tools/rekey.mjs --in=preview/wb-guide/index.html --slug=wb-guide --doc=site
```

Then put the printed `file_salt` into the `dw_project_keys` row for `wb-guide` (wrap columns
cleared) and commit the preview.
