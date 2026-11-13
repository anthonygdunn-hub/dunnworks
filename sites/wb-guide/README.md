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

Every colour is a token (`--f` forest, `--cr` cream, `--hi` highlight, `--ac` accent and so on),
defined once per palette in `WB_PALETTES` at the bottom of each design file. All four versions keep
the forest green (#17302A) and cream (#F7F5F0) backgrounds; only the highlight and accent change:

| Version | Highlight | Accent |
|---|---|---|
| Original | lime #B5E38D | orange #F26B2A |
| Gold and coral | #E9C46A | #E8685A |
| Sage and amber | #BFD8B0 | #E39424 |
| Mint and terracotta | #9FE3C6 | #C65A3E |

The preview has a switcher in the bottom corner and remembers the choice per browser.

## Preview on dunnworks.io

`dunnworks.io/preview/wb-guide/`, locked with the passphrase in the console (project
"woolmer (W&B Guide)"). To refresh it, from the dunnworks repo:

```
node sites/wb-guide/build.mjs
cp sites/wb-guide/preview.html /tmp/wb.html
node tools/previewbar.mjs --in=/tmp/wb.html --out=/tmp/wb.html --client="woolmer, the W&B guide" \
  --note="colour versions in the bottom corner, click anything"
node tools/lock.mjs --in=/tmp/wb.html --out=preview/wb-guide/index.html \
  --client="woolmer, the W&B guide" --pass="<passphrase from the console>"
node tools/rekey.mjs --in=preview/wb-guide/index.html --slug=wb-guide --doc=site
```

Then put the printed `file_salt` into the `dw_project_keys` row for `wb-guide` (wrap columns
cleared) and commit the preview.
