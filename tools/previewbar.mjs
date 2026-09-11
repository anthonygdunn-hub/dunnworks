#!/usr/bin/env node
/*
 * previewbar.mjs — put the Dunnworks preview strip at the top of a single-file
 * client preview, so whoever is looking at it can always get back to
 * dunnworks.io and across to their report.
 *
 *   node tools/previewbar.mjs --in=/tmp/pv.html --out=/tmp/pv.html \
 *     --client="Ashland Carpentry Services" \
 *     --alt-href="https://dunnworks.io/preview/ashland/report/" --alt-label="Read the report"
 *
 * Run it on the PLAIN file, before tools/lock.mjs.
 *
 * Any strip already in the file is removed first, so this is safe to re-run.
 */
import fs from 'node:fs';

const args = {};
for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)=([\s\S]*)$/); if (m) args[m[1]] = m[2]; }
for (const k of ['in', 'out', 'client']) if (!args[k]) { console.error(`previewbar.mjs: --${k} is required`); process.exit(1); }

const HOME  = args.home || 'https://dunnworks.io/';
const NOTE  = args.note || 'every page works, click anything';
const ALT_H = args['alt-href'] || '';
const ALT_L = args['alt-label'] || '';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `
<style id="dwpb-css">
/* fixed rather than sticky: some of these sites set overflow-x on <html>, which
   quietly stops a sticky root-level element from sticking at all */
.dwpb{position:fixed;top:0;left:0;right:0;z-index:2147483000;display:flex;align-items:center;gap:10px 16px;
  flex-wrap:wrap;justify-content:center;padding:8px 14px;background:#7000ff;color:#fff;
  font:500 13px/1.35 'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.01em;box-shadow:0 1px 0 rgba(0,0,0,.18)}
.dwpb *{box-sizing:border-box}
.dwpb-t{opacity:.92;text-align:center}
.dwpb-t b{font-weight:600}
.dwpb a.dwpb-a{display:inline-flex;align-items:center;gap:7px;flex:none;
  padding:5px 12px;border-radius:999px;text-decoration:none;white-space:nowrap;
  background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.42);color:#fff;
  font:inherit;font-weight:600;transition:background .15s ease}
.dwpb a.dwpb-a:hover,.dwpb a.dwpb-a:focus-visible{background:rgba(255,255,255,.3);color:#fff;text-decoration:none}
.dwpb a.dwpb-a:focus-visible{outline:2px solid #fff;outline-offset:2px}
.dwpb svg{width:14px;height:14px;flex:none;display:block}
.dwpb-home{margin-right:auto}
.dwpb-alt{margin-left:auto}
@media (max-width:900px){.dwpb-note{display:none}}
@media (max-width:560px){
  .dwpb{gap:8px;padding:7px 10px;font-size:11.5px}
  .dwpb-t{display:none}
  .dwpb a.dwpb-a{padding:5px 10px}
}
@media print{.dwpb{display:none}}
</style>`;

const BAR = `
<div class="dwpb" role="region" aria-label="Dunnworks preview">
  <a class="dwpb-a dwpb-home" href="${esc(HOME)}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 19l-7-7 7-7"/></svg>
    Dunnworks
  </a>
  <span class="dwpb-t">Proposal preview &middot; <b>${esc(args.client)}</b><span class="dwpb-note"> &middot; ${esc(NOTE)}</span></span>
  ${ALT_H ? `<a class="dwpb-a dwpb-alt" href="${esc(ALT_H)}">${esc(ALT_L || 'Also see')}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
  </a>` : ''}
</div>
<script id="dwpb-js">
/* The strip is fixed, so the page has to start below it, and the site's own
   header pinned to top:0 has to come down by the same amount or it hides
   behind. Measured rather than guessed, because the strip wraps on a phone. */
(function(){
  var bar = document.querySelector('.dwpb');
  if (!bar) return;
  var base = null;
  var shift = function(){
    var h = bar.offsetHeight;
    var body = document.body;
    if (base === null) base = parseFloat(getComputedStyle(body).paddingTop) || 0;
    body.style.paddingTop = (base + h) + 'px';
    document.documentElement.style.scrollPaddingTop = h + 'px';
    var all = body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el === bar || bar.contains(el)) continue;
      var cs = getComputedStyle(el);
      if ((cs.position === 'sticky' || cs.position === 'fixed') && parseFloat(cs.top) === 0) {
        el.style.top = h + 'px';
      }
    }
  };
  var run = function(){ requestAnimationFrame(shift); };
  run();
  window.addEventListener('resize', run);
  // single file previews swap their content in, so re-apply after a route change
  if (window.MutationObserver) {
    var t; new MutationObserver(function(){ clearTimeout(t); t = setTimeout(run, 60); })
      .observe(document.body, { childList: true, subtree: true });
  }
})();
</script>`;

let html = fs.readFileSync(args.in, 'utf8');

// drop anything already there, including the older strip the bundler used to emit
html = html
  .replace(/<style id="dwpb-css">[\s\S]*?<\/style>\s*/g, '')
  .replace(/<div class="dwpb"[\s\S]*?<\/div>\s*/g, '')
  .replace(/<script id="dwpb-js">[\s\S]*?<\/script>\s*/g, '')
  .replace(/<div class="previewbar">[\s\S]*?<\/div>\s*/g, '');

if (!/<body[^>]*>/i.test(html)) { console.error('previewbar.mjs: no <body> in ' + args.in); process.exit(1); }
html = html.replace(/(<head[^>]*>)/i, `$1${CSS}`);
html = html.replace(/(<body[^>]*>)/i, `$1${BAR}`);

fs.writeFileSync(args.out, html);
console.log(`Preview strip added to ${args.out}  (${args.client}${ALT_H ? ' + ' + ALT_L : ''})`);
