#!/usr/bin/env node
/*
 * build.mjs — turn the woolmer design canvas (design/*.dc.html) into one plain
 * HTML preview with working links between pages and a colour switcher.
 *
 *   node sites/wb-guide/build.mjs            -> sites/wb-guide/preview.html
 *
 * The .dc.html files are the source of truth, exported from the Claude design
 * canvas. This script renders their <sc-for> loops and {{holes}} with the data
 * in each file's renderVals(), so nothing is written twice.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESIGN = path.join(HERE, 'design');
const OUT = path.join(HERE, 'preview.html');

// page id -> design file. Phone layouts come from the same fluid pages.
const PAGES = { home: 'Main.dc.html', listing: 'Listing.dc.html', takeaways: 'Category.dc.html' };
const ROUTE = { 'Main.dc.html': 'home', 'Listing.dc.html': 'listing', 'Category.dc.html': 'takeaways',
  'MobileHome.dc.html': 'home', 'MobileListing.dc.html': 'listing' };

const lookup = (scope, p) => p.trim().split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
const fill = (html, scope) => html.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, p) => {
  const v = lookup(scope, p);
  return v == null ? '' : String(v);
});

function renderFile(file) {
  const src = fs.readFileSync(path.join(DESIGN, file), 'utf8');
  const script = src.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1];
  const vals = new Function('DCLogic', `${script}\n;return new Component({}).renderVals();`)(
    class { constructor(p) { this.props = p; this.state = {}; } setState() {} });
  let pal = null;
  pal = new Function('DCLogic', `${script}\n;return typeof WB_PALETTES !== 'undefined' ? WB_PALETTES : null;`)(class {});
  vals.vars = '';
  let body = src.slice(src.indexOf('</helmet>') + 9, src.indexOf('</x-dc>'));
  body = body.replace(/<sc-for list="\{\{\s*(\w+)\s*\}\}" as="(\w+)"[^>]*>([\s\S]*?)<\/sc-for>/g, (_, list, as, inner) =>
    (vals[list] || []).map((item, i) => fill(inner, { ...vals, [as]: item, $index: i })).join(''));
  body = fill(body, vals);
  body = body.replace(/href="([A-Za-z-]+\.dc\.html)"/g, (_, f) => `href="#${ROUTE[f] || 'home'}"`);
  body = body.replace(/<!--[\s\S]*?-->/g, '');
  return { body, pal };
}

const pages = Object.entries(PAGES).map(([id, f]) => ({ id, ...renderFile(f) }));
const PAL = pages.find(p => p.pal).pal;
const NAMES = { forest: 'Forest mix', honey: 'Pine and honey', moss: 'Moss and clay', persian: 'Persian blue', juniper: 'Juniper and mist', zodiac: 'Zodiac and fountain' };
const palCss = Object.entries(PAL).map(([k, v]) =>
  `${k === Object.keys(PAL)[0] ? 'body,' : ''}body[data-pal="${k}"]{${Object.entries(v).map(([t, c]) => `--${t}:${c}`).join(';')}}`).join('\n');

const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>woolmer — the Whitehill &amp; Bordon guide (preview)</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
${palCss}
body{margin:0;background:var(--cr)}
a{color:inherit}a:hover{opacity:.85}
h1,h2{color:var(--hl)}
.dk h1,.dk h2{color:var(--hd)}
input::placeholder{color:#8A86A0}
.pg{display:none}.pg.on{display:block}
html{scroll-behavior:smooth}
@media (max-width:640px){header nav{display:none!important}.palsw{left:12px;right:12px;bottom:12px;max-width:none;justify-content:center}.palsw b,.palsw .lbl{display:none}.palsw button{padding:9px 12px}.palsw i{width:30px;height:16px;border-radius:8px}h1{font-size:44px!important;letter-spacing:-1px!important}section>div{padding-left:18px!important;padding-right:18px!important}}
.palsw{position:fixed;right:16px;bottom:16px;z-index:50;display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:calc(100% - 32px);
  background:#FFFFFF;border:1px solid #E2DFEE;border-radius:18px;padding:8px;box-shadow:0 12px 30px rgba(0,0,0,.18);font:500 13px Inter,system-ui,sans-serif;color:#1C1B19}
.palsw b{padding:0 6px;font-weight:600}
.palsw button{display:flex;align-items:center;gap:7px;border:1px solid #E2DFEE;background:#FFFFFF;border-radius:999px;padding:7px 11px;font:inherit;cursor:pointer;color:#1C1B19}
.palsw button[aria-pressed="true"]{background:#17302A;color:#FFFFFF;border-color:#17302A}
.palsw i{display:inline-flex;width:22px;height:12px;border-radius:6px;overflow:hidden}
.palsw i span{flex:1}
</style>
</head>
<body data-pal="${Object.keys(PAL)[0]}">
${pages.map(p => `<div class="pg" id="pg-${p.id}">${p.body}</div>`).join('\n')}
${Object.keys(PAL).length > 1 ? `<div class="palsw" role="group" aria-label="Colour version">
<b>Colours</b>
${Object.keys(PAL).map(k => `<button type="button" data-pal="${k}" aria-label="${NAMES[k] || k}" aria-pressed="${k === Object.keys(PAL)[0]}"><i aria-hidden="true"><span style="background:${PAL[k].hi}"></span><span style="background:${PAL[k].ac}"></span></i><span class="lbl">${NAMES[k] || k}</span></button>`).join('\n')}
</div>` : ''}
<script>
(function(){
  var ids = ${JSON.stringify(Object.keys(PAGES))};
  function show(){
    var h = (location.hash || '#home').slice(1), page = ids.indexOf(h) > -1 ? h : null, target = null;
    if (!page) { target = document.getElementById(h); page = target ? (target.closest('.pg') || {}).id : null; page = page ? page.slice(3) : 'home'; }
    ids.forEach(function(id){ document.getElementById('pg-' + id).classList.toggle('on', id === page); });
    if (target) target.scrollIntoView(); else window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', show); show();
  document.addEventListener('submit', function(e){ e.preventDefault(); });
  document.querySelectorAll('a[href="#"]').forEach(function(a){ a.addEventListener('click', function(e){ e.preventDefault(); }); });
  var btns = document.querySelectorAll('.palsw button');
  function pal(k){ document.body.setAttribute('data-pal', k); btns.forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.pal === k)); });
    try { localStorage.setItem('wb-pal', k); } catch (e) {} }
  btns.forEach(function(b){ b.addEventListener('click', function(){ pal(b.dataset.pal); }); });
  try { var s = localStorage.getItem('wb-pal'); if (s && document.querySelector('.palsw button[data-pal="' + s + '"]')) pal(s); } catch (e) {}
})();
</script>
</body>
</html>
`;
fs.writeFileSync(OUT, html);
console.log(`Built ${path.relative(process.cwd(), OUT)} (${Math.round(html.length / 1024)} KB, ${pages.length} pages)`);
