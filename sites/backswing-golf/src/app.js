/* Backswing Golf storefront. Plain JS, no build step at runtime.
   Stock is read live from Supabase (bsg_products), so anything added in the
   admin or brought in from eBay shows here without a rebuild. */
(function () {
'use strict';
const C = window.BSG_CONFIG;
const API = C.supabaseUrl + '/rest/v1/';
const H = { apikey: C.anonKey, Authorization: 'Bearer ' + C.anonKey };
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gbp = n => '£' + Number(n).toFixed(2).replace(/\.00$/, '');
const main = $('#main');
const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!RM) document.documentElement.classList.add('anim');

const CATS = ['Iron sets', 'Irons', 'Drivers', 'Fairway woods', 'Hybrids', 'Wedges', 'Putters', 'Heads', 'Shafts', 'Headcovers', 'Bags', 'Grips', 'Job lots', 'Other'];
const CAT_BLURB = {
  'Iron sets': 'Matched sets, ready to play', Irons: 'Singles to fill a gap or test a model',
  Drivers: 'Complete drivers', 'Fairway woods': '3, 5 and 7 woods', Hybrids: 'Rescues and utility clubs',
  Wedges: 'Gap, sand and lob', Putters: 'Blades and mallets', Heads: 'For builders and tinkerers',
  Shafts: 'With and without adapters', Headcovers: 'Tour and retail covers', Bags: 'Stand, cart and staff bags',
  Grips: 'Fresh grips', 'Job lots': 'Bundles at a bundle price', Other: 'Everything else'
};
/* line icons for the category tiles, drawn on a 32 grid */
const ic = d => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d.replace(/<(path|rect|circle) /g, '<$1 pathLength="1" ')}</svg>`;
const CAT_ICON = {
  'Iron sets': ic('<path d="M9 4v17M16 3v18M23 4v17"/><path d="M9 21l-4 5h6zM16 21l-4 5h6zM23 21l-4 5h6z"/>'),
  Irons: ic('<path d="M21 3 13 21"/><path d="M13 21 7 25.5a1.5 1.5 0 0 0 .9 2.7l7.6-.2 1.3-4.5z"/><path d="M11 26h3"/>'),
  Drivers: ic('<path d="M24 3 17 19"/><path d="M17 19c-5-1-11 1-12 5s3 5.5 8 5 8-3 7.5-6.5c-.3-2-1.6-3.2-3.5-3.5z"/><path d="M9 25.5h5"/>'),
  'Fairway woods': ic('<path d="M23 3 17 20"/><path d="M17 20c-4-1-9 .5-10 4s2.5 4.5 6.5 4 6.5-2.5 6.2-5.5c-.2-1.6-1.2-2.3-2.7-2.5z"/><path d="M25 22h3M26.5 20.5v3"/>'),
  Hybrids: ic('<path d="M22 3 16 20"/><path d="M16 20c-3-.6-7 .5-8 3.5s1.5 4 5 3.6 5.6-2 5.4-4.6c-.1-1.3-1-2.2-2.4-2.5z"/><path d="M10 24.5l7-1"/>'),
  Wedges: ic('<path d="M21 3 14 20"/><path d="M14 20 7 26.5h10.5L17 20.5z"/><path d="M9.5 24h6M11 22h4.5"/>'),
  Putters: ic('<path d="M19 3v20"/><path d="M8 23h16a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2z"/><path d="M14 25.5h4"/>'),
  Heads: ic('<path d="M20 6l2 7"/><path d="M22 13 9 22a2 2 0 0 0 1 3.6l11.5-.6 2.5-11z"/><path d="M13 21.5l7-1M14.5 19l6-1"/><circle cx="19.5" cy="4.5" r="1.5"/>'),
  Shafts: ic('<path d="M25 4 9 24"/><path d="M9 24l-3.5 4.5"/><rect x="5" y="22" width="5" height="8" rx="1" transform="rotate(38 7.5 26)"/><path d="M22 8l2 1.6M19 12l2 1.6"/>'),
  Headcovers: ic('<path d="M11 28V18c0-7 3-12 9-12s7 4 6 8c-.6 2.6-3 4-6 4h-3v10"/><path d="M11 28h6"/><path d="M14 22h3M14 25h3"/><path d="M20 10c1.5 0 2.5 1 2.5 2"/>'),
  Bags: ic('<rect x="10" y="10" width="12" height="19" rx="3"/><path d="M12 10V5M16 10V3M20 10V5"/><path d="M10 15h12M13 20h6"/><path d="M22 13c3 0 4 2 4 5v4"/>'),
  Grips: ic('<rect x="12" y="3" width="8" height="26" rx="4"/><path d="M12 9h8M12 13h8M12 17h8M12 21h8"/>'),
  'Job lots': ic('<path d="M4 11l12-6 12 6-12 6z"/><path d="M4 11v11l12 6 12-6V11"/><path d="M16 17v11"/><path d="M10 8l12 6"/>'),
  Other: ic('<circle cx="16" cy="16" r="11"/><circle cx="12.5" cy="12.5" r="1"/><circle cx="18" cy="11" r="1"/><circle cx="20.5" cy="16.5" r="1"/><circle cx="15.5" cy="19.5" r="1"/><circle cx="11" cy="18" r="1"/>'),
  Everything: ic('<rect x="5" y="5" width="9" height="9" rx="2"/><rect x="18" y="5" width="9" height="9" rx="2"/><rect x="5" y="18" width="9" height="9" rx="2"/><rect x="18" y="18" width="9" height="9" rx="2"/>')
};
const GRADES = ['Ex-demo', 'Excellent', 'Very good', 'Good', 'Fair'];
const FLEXES = ['Ladies', 'Senior', 'Regular', 'Stiff/Regular', 'Stiff', 'Extra stiff'];
const LIST_COLS = 'id,slug,title,price,was_price,category,brand,hand,flex,grade,ebay_condition,featured,status,created_at,sold_at,img:images->>0';

let STOCK = null;          // live list, loaded once per visit
let SOLD = [];
let CONTENT = {};
let LEFT = 0;

/* ------------------------------------------------------------------ data */
async function get(path) {
  const r = await fetch(API + path, { headers: H });
  if (!r.ok) throw new Error('Could not reach the stock list (' + r.status + ')');
  return r.json();
}
async function loadStock() {
  if (STOCK) return STOCK;
  // PostgREST caps a single response, so page through in 1000s
  let all = [], from = 0;
  for (;;) {
    const r = await fetch(API + `bsg_products?select=${LIST_COLS}&status=eq.live&order=created_at.desc,id`, { headers: { ...H, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error('Could not reach the stock list (' + r.status + ')');
    const rows = await r.json(); all = all.concat(rows);
    if (rows.length < 1000) break; from += 1000;
  }
  STOCK = all;
  get(`bsg_products?select=${LIST_COLS}&status=eq.sold&order=sold_at.desc&limit=12`).then(r => SOLD = r).catch(() => {});
  return STOCK;
}
async function loadContent() {
  try { (await get('bsg_content?select=key,value')).forEach(r => CONTENT[r.key] = r.value); } catch (e) {}
  applyContent();
}
function applyContent(root = document) {
  $$('[data-k]', root).forEach(el => { const v = CONTENT[el.dataset.k]; if (v) el.textContent = v; if (el.hasAttribute('data-split')) splitWords(el); });
}
function splitWords(el) {
  const words = el.textContent.trim().split(/\s+/);
  el.innerHTML = words.map((w, i) => `<span class="w" style="--i:${i}"><span>${esc(w)}</span></span>`).join(' ');
  el.setAttribute('aria-label', words.join(' '));
}
function countUp(el, to) {
  if (!el) return;
  if (RM) { el.textContent = to.toLocaleString('en-GB'); return; }
  const t0 = performance.now(), dur = 1400;
  const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e).toLocaleString('en-GB'); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* ------------------------------------------------------------------ bits */
const ICON = {
  van: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.7"/><circle cx="17" cy="17.5" r="1.7"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4l-5.5 2.9 1-6.2L3 9.7l6.2-.9z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  ebay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6h15l-2 9H8z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>'
};
const img = (src, w = 500) => src ? String(src).replace(/s-l\d+\.(jpg|webp|png)/, `s-l${w}.$1`) : '';

function card(p) {
  const sold = p.status === 'sold';
  return `<a class="card${sold ? ' is-sold' : ''}" href="#/club/${esc(p.slug)}">
    <div class="pic">${p.img ? `<img loading="lazy" src="${esc(img(p.img, 500))}" alt="">` : ''}
      ${p.hand ? `<span class="hand${p.hand === 'Left' ? ' left' : ''}">${p.hand === 'Left' ? 'Left-handed' : 'Right-handed'}</span>` : ''}
      <span class="tag${sold ? ' sold' : ''}">${sold ? 'Sold' : gbp(p.price)}</span></div>
    <h3>${esc(p.title)}</h3>
    <div class="meta">${p.grade ? `<span class="grade" data-g="${esc(p.grade)}"><i></i>${esc(p.grade)}</span>` : ''}${p.flex ? `<span>${esc(p.flex)}</span>` : ''}</div>
  </a>`;
}
const skeletons = n => Array.from({ length: n }, () => '<div><div class="skel" style="aspect-ratio:1"></div><div class="skel" style="height:16px;margin-top:12px;width:80%"></div></div>').join('');

function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.role = 'status'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}
function setTitle(t) { document.title = t ? `${t} | Backswing Golf` : 'Backswing Golf | Ex-demo and pre-loved golf clubs'; }
function setNav(route) { $$('.nav a').forEach(a => a.toggleAttribute('aria-current', a.getAttribute('href').split('?')[0] === '#/' + route)); $$('.nav a[aria-current]').forEach(a => a.setAttribute('aria-current', 'page')); }

/* ------------------------------------------------------------------ pages */
const PAGES = {};

PAGES[''] = async () => {
  setTitle('');
  main.innerHTML = $('#tpl-home').innerHTML;
  applyContent(main);
  const rail = $('#justin'), feat = $('#featured');
  rail.innerHTML = skeletons(6); feat.innerHTML = skeletons(4);
  // finder
  const f = { hand: 'Right' };
  $$('#finder .seg button').forEach((b, i) => b.onclick = () => { $$('#finder .seg button').forEach(x => x.setAttribute('aria-pressed', x === b)); $('#finder .seg').style.setProperty('--i', i); f.hand = b.dataset.v; });
  $('#finder').onsubmit = e => {
    e.preventDefault();
    const q = new URLSearchParams();
    const cat = $('#f-cat').value, brand = $('#f-brand').value, flex = $('#f-flex').value;
    if (cat) q.set('cat', cat); if (brand) q.set('brand', brand); if (flex) q.set('flex', flex);
    if (f.hand !== 'Any') q.set('hand', f.hand);
    location.hash = '#/shop' + (q.toString() ? '?' + q : '');
  };
  try {
    const s = await loadStock();
    countUp($('#stockcount'), s.length);
    countUp($('#leftcount'), s.filter(p => p.hand === 'Left').length);
    LEFT = s.filter(p => p.hand === 'Left').length;
    rail.innerHTML = s.slice(0, 12).map(card).join('');
    const fe = s.filter(p => p.featured);
    feat.innerHTML = (fe.length ? fe : s).slice(0, 8).map(card).join('');
    const counts = {}; s.forEach(p => counts[p.category] = (counts[p.category] || 0) + 1);
    const top = CATS.filter(c => counts[c]).sort((a, b) => counts[b] - counts[a]);
    const order = (counts['Iron sets'] ? ['Iron sets', ...top.filter(c => c !== 'Iron sets')] : top).slice(0, 12);
    const tile = (c, href, blurb, n, cls, pic) => `<a class="cat${cls}" href="${href}">
        <span class="cat-ic" aria-hidden="true">${CAT_ICON[c] || CAT_ICON.Other}</span>
        <span class="cat-t"><b>${esc(c)}</b><span class="cat-b">${esc(blurb)}</span></span>
        <span class="cat-n">${n} in stock</span>
        ${pic ? `<img loading="lazy" alt="" src="${esc(img(pic.img, 500))}">` : ''}</a>`;
    $('#cats').innerHTML = order.map((c, i) => tile(c, `#/shop?cat=${encodeURIComponent(c)}`, CAT_BLURB[c] || '', counts[c], i === 0 ? ' big' : '', s.find(p => p.category === c && p.img && (i || p.featured)) || s.find(p => p.category === c && p.img))).join('')
      + tile('Everything', '#/shop', 'Browse the lot', s.length, ' all', null);
    const brands = [...new Set(s.map(p => p.brand).filter(Boolean))].sort();
    $('#f-brand').innerHTML = '<option value="">Any brand</option>' + brands.map(b => `<option>${esc(b)}</option>`).join('');
    $('#f-cat').innerHTML = '<option value="">Anything</option>' + CATS.filter(c => counts[c]).map(c => `<option>${esc(c)}</option>`).join('');
    const hp = s.find(p => p.featured && p.img) || s[0];
    if (hp) { $('#heropic').innerHTML = `<img src="${esc(img(hp.img, 1600))}" alt=""><a class="tag swing-in" href="#/club/${esc(hp.slug)}">${gbp(hp.price)} <small>${esc(hp.title.split('/')[0].trim().slice(0, 40))}</small></a>`; }
  } catch (e) {
    rail.innerHTML = feat.innerHTML = `<p class="note err">${esc(e.message)}. Refresh the page to try again.</p>`;
  }
};

/* shop with filters */
PAGES.shop = async (q) => {
  setTitle('Shop');
  main.innerHTML = $('#tpl-shop').innerHTML;
  const st = {
    cat: q.getAll('cat'), brand: q.getAll('brand'), hand: q.getAll('hand'), flex: q.getAll('flex'), grade: q.getAll('grade'),
    min: q.get('min') || '', max: q.get('max') || '', q: q.get('q') || '', sort: q.get('sort') || 'new', shown: 48
  };
  $('#results').innerHTML = skeletons(12);
  let s;
  try { s = await loadStock(); } catch (e) { $('#results').innerHTML = `<p class="note err">${esc(e.message)}</p>`; return; }

  const match = (p, skip) => {
    if (skip !== 'cat' && st.cat.length && !st.cat.includes(p.category)) return false;
    if (skip !== 'brand' && st.brand.length && !st.brand.includes(p.brand)) return false;
    if (skip !== 'hand' && st.hand.length && !st.hand.includes(p.hand)) return false;
    if (skip !== 'flex' && st.flex.length && !st.flex.includes(p.flex)) return false;
    if (skip !== 'grade' && st.grade.length && !st.grade.includes(p.grade)) return false;
    if (st.min && p.price < +st.min) return false;
    if (st.max && p.price > +st.max) return false;
    if (st.q) { const hay = (p.title + ' ' + (p.brand || '') + ' ' + p.category).toLowerCase(); if (!st.q.toLowerCase().split(/\s+/).every(w => hay.includes(w))) return false; }
    return true;
  };
  const facet = (key, label, values, limit = 8) => {
    const counts = {}; s.filter(p => match(p, key)).forEach(p => { const v = p[key === 'cat' ? 'category' : key]; if (v) counts[v] = (counts[v] || 0) + 1; });
    const vals = (values || Object.keys(counts).sort((a, b) => counts[b] - counts[a])).filter(v => counts[v] || st[key].includes(v));
    if (!vals.length) return '';
    return `<fieldset data-f="${key}"><legend>${label}</legend>${vals.map((v, i) => `<label class="chk${i >= limit && !st[key].includes(v) ? ' more' : ''}"><input type="checkbox" value="${esc(v)}"${st[key].includes(v) ? ' checked' : ''}> ${esc(v === 'Left' ? 'Left-handed' : v === 'Right' ? 'Right-handed' : v)}<span class="n">${counts[v] || 0}</span></label>`).join('')}${vals.length > limit ? '<button type="button" class="showmore">Show all</button>' : ''}</fieldset>`;
  };
  const sync = () => {
    const p = new URLSearchParams();
    ['cat', 'brand', 'hand', 'flex', 'grade'].forEach(k => st[k].forEach(v => p.append(k, v)));
    ['min', 'max', 'q'].forEach(k => st[k] && p.set(k, st[k]));
    if (st.sort !== 'new') p.set('sort', st.sort);
    history.replaceState(null, '', '#/shop' + (p.toString() ? '?' + p : ''));
  };
  const render = () => {
    const list = s.filter(p => match(p));
    const by = { new: (a, b) => b.created_at.localeCompare(a.created_at), low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price, az: (a, b) => a.title.localeCompare(b.title) }[st.sort];
    list.sort(by);
    const title = st.cat.length === 1 ? st.cat[0] : st.q ? `Results for “${st.q}”` : 'All stock';
    $('#shop-title').textContent = title; setTitle(title);
    $('#shop-n').textContent = `${list.length} ${list.length === 1 ? 'item' : 'items'}`;
    $('#sort').value = st.sort;
    $('#filters-body').innerHTML =
      facet('cat', 'Type', CATS, 14) + facet('hand', 'Hand', ['Right', 'Left']) + facet('brand', 'Brand') +
      facet('flex', 'Shaft flex', FLEXES) + facet('grade', 'Condition', GRADES) +
      `<fieldset><legend>Price</legend><div class="pricebox"><input id="pmin" inputmode="numeric" placeholder="£ min" value="${esc(st.min)}" aria-label="Minimum price"><span>to</span><input id="pmax" inputmode="numeric" placeholder="£ max" value="${esc(st.max)}" aria-label="Maximum price"></div></fieldset>`;
    const chips = [];
    ['cat', 'brand', 'hand', 'flex', 'grade'].forEach(k => st[k].forEach(v => chips.push(`<button class="chip" data-k="${k}" data-v="${esc(v)}">${esc(v === 'Left' ? 'Left-handed' : v === 'Right' ? 'Right-handed' : v)} <span aria-hidden="true">×</span><span class="sr">remove</span></button>`)));
    if (st.min || st.max) chips.push(`<button class="chip" data-k="price">${st.min ? '£' + esc(st.min) : 'Any'} to ${st.max ? '£' + esc(st.max) : 'any'} <span aria-hidden="true">×</span></button>`);
    if (st.q) chips.push(`<button class="chip" data-k="q">“${esc(st.q)}” <span aria-hidden="true">×</span></button>`);
    if (chips.length > 1) chips.push('<button class="chip clear" data-k="all">Clear all</button>');
    $('#chips').innerHTML = chips.join('');
    $('#results').innerHTML = list.length ? list.slice(0, st.shown).map(card).join('')
      : `<div class="empty" style="grid-column:1/-1"><h3>Nothing matches that just now</h3><p class="muted" style="margin:0 auto 16px">New stock goes up most days. Try removing a filter, or tell us what you are after and we will keep an eye out.</p><a class="btn" href="#/contact">Ask us to look out for it</a></div>`;
    $('#more').innerHTML = list.length > st.shown ? `<button class="btn ghost" id="loadmore">Show more (${list.length - st.shown} left)</button>` : '';
    sync();
  };
  render();
  $('#filters').addEventListener('change', e => {
    const fs = e.target.closest('fieldset[data-f]');
    if (fs) { st[fs.dataset.f] = $$('input:checked', fs).map(i => i.value); st.shown = 48; render(); }
  });
  $('#filters').addEventListener('input', e => {
    if (e.target.id === 'pmin' || e.target.id === 'pmax') { clearTimeout(render.t); render.t = setTimeout(() => { st.min = $('#pmin').value.replace(/\D/g, ''); st.max = $('#pmax').value.replace(/\D/g, ''); const a = document.activeElement.id; render(); $('#' + a)?.focus(); }, 500); }
  });
  $('#filters').addEventListener('click', e => { if (e.target.classList.contains('showmore')) { e.target.parentElement.classList.add('all'); e.target.remove(); } });
  $('#chips').onclick = e => {
    const b = e.target.closest('.chip'); if (!b) return;
    const k = b.dataset.k;
    if (k === 'all') ['cat', 'brand', 'hand', 'flex', 'grade'].forEach(x => st[x] = []), st.min = st.max = st.q = '';
    else if (k === 'price') st.min = st.max = '';
    else if (k === 'q') st.q = '';
    else st[k] = st[k].filter(v => v !== b.dataset.v);
    render();
  };
  $('#sort').onchange = e => { st.sort = e.target.value; render(); };
  $('#more').onclick = e => { if (e.target.id === 'loadmore') { st.shown += 48; render(); } };
  const fl = $('#filters');
  $('#openf').onclick = () => { fl.classList.add('open'); $('#closef').focus(); };
  $('#closef').onclick = () => fl.classList.remove('open');
  $('#applyf').onclick = () => fl.classList.remove('open');
};

/* product page */
PAGES.club = async (q, slug) => {
  main.innerHTML = '<div class="wrap"><div class="pdp"><div class="skel" style="aspect-ratio:1"></div><div><div class="skel" style="height:120px"></div></div></div></div>';
  let p;
  try { [p] = await get(`bsg_products?slug=eq.${encodeURIComponent(slug)}&select=*`); } catch (e) {}
  if (!p) { main.innerHTML = `<div class="wrap page-head"><h1>That one has gone</h1><p class="lede">It may have sold, or the link is out of date.</p><p><a class="btn" href="#/shop">Browse what is in stock</a></p></div>`; setTitle('Not found'); return; }
  setTitle(p.title);
  const sold = p.status === 'sold';
  const pics = (p.images || []).filter(Boolean);
  const SKIP = /^(Brand|Model|Handedness|Golf Club Type|Club Number|Flex|Shaft Material|Loft|Country of Origin|Grade|Number of Clubs|MPN|UPC|Unit Type|Unit Quantity|Condition|Seller notes)$/;
  const specRows = [
    ['Brand', p.brand], ['Model', p.model], ['Type', p.category], ['Club', p.club], ['Hand', p.hand ? p.hand + '-handed' : ''],
    ['Shaft flex', p.flex], ['Shaft', p.shaft], ['Loft', p.loft ? String(p.loft).replace(/°?$/, '°') : ''],
    ...Object.entries(p.specs || {}).filter(([k]) => !SKIP.test(k.replace(/:$/, '')))
  ].filter(([, v]) => v);
  const subject = encodeURIComponent('Question about: ' + p.title);
  main.innerHTML = `<div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a> / <a href="#/shop?cat=${encodeURIComponent(p.category)}">${esc(p.category)}</a> / <span>${esc(p.brand || '')}</span></nav>
    <div class="pdp">
      <div class="gallery">
        <div class="main" id="gmain">${pics[0] ? `<img src="${esc(img(pics[0], 1600))}" alt="${esc(p.title)}, photo 1 of ${pics.length}">` : ''}
          ${pics.length > 1 ? '<button class="nav-arrow prev" aria-label="Previous photo">‹</button><button class="nav-arrow next" aria-label="Next photo">›</button>' : ''}</div>
        ${pics.length > 1 ? `<div class="thumbs">${pics.map((u, i) => `<button aria-label="Photo ${i + 1}" aria-current="${i === 0}" data-i="${i}"><img loading="lazy" src="${esc(img(u, 225))}" alt=""></button>`).join('')}</div>` : ''}
      </div>
      <div class="buy">
        <h1>${esc(p.title)}</h1>
        <div class="pricerow"><span class="tag${sold ? ' sold' : ''}">${sold ? 'Sold' : gbp(p.price)}</span>${p.was_price && !sold ? `<s class="muted">${gbp(p.was_price)}</s>` : ''}${p.qty > 1 && !sold ? `<span class="muted">${p.qty} available</span>` : ''}</div>
        <dl class="cond">
          ${p.grade ? `<div><dt>Our grade</dt><dd><span class="grade" data-g="${esc(p.grade)}"><i></i>${esc(p.grade)}</span> · <a class="link" href="#/grading">What this means</a></dd></div>` : ''}
          ${p.ebay_condition ? `<div><dt>eBay condition</dt><dd>${esc(p.ebay_condition)}</dd></div>` : ''}
          ${p.seller_notes ? `<div><dt>Our notes</dt><dd>${esc(p.seller_notes)}</dd></div>` : ''}
        </dl>
        <div class="actions">
          ${sold ? `<a class="btn" href="#/shop?cat=${encodeURIComponent(p.category)}">See similar ${esc(p.category.toLowerCase())}</a>`
            : p.ebay_url ? `<a class="btn flag" href="${esc(p.ebay_url)}" target="_blank" rel="noopener">${ICON.ebay.replace('<svg', '<svg width="22" height="22"')} Buy securely on eBay</a>`
            : `<a class="btn flag" href="mailto:${C.email}?subject=${encodeURIComponent('I would like to buy: ' + p.title)}">${ICON.mail.replace('<svg', '<svg width="22" height="22"')} Reserve this item</a>`}
          <a class="btn ghost" href="mailto:${C.email}?subject=${subject}">Ask a question about this item</a>
        </div>
        <ul class="reassure">
          <li>${ICON.van}<span data-k="pdp_delivery">Free UK delivery, usually 2 to 3 days</span></li>
          <li>${ICON.back}<span data-k="pdp_returns">14-day returns</span></li>
          <li>${ICON.eye}<span>Every photo is of the actual item you will receive</span></li>
          ${p.ebay_url ? `<li>${ICON.star}<span>Paid through eBay, so you are covered by the eBay Money Back Guarantee</span></li>` : ''}
        </ul>
        ${specRows.length ? `<h2 style="font-size:30px;margin-top:28px">Specification</h2><table class="specs">${specRows.map(([k, v]) => `<tr><th scope="row">${esc(k.replace(/:$/, ''))}</th><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}
        ${p.description ? `<h2 style="font-size:30px;margin-top:28px">Description</h2><div>${esc(p.description).replace(/\n/g, '<br>')}</div>` : ''}
      </div>
    </div>
    <section style="padding-bottom:70px"><div class="head"><h2>More ${esc(p.category.toLowerCase())}</h2><a class="link" href="#/shop?cat=${encodeURIComponent(p.category)}">See all</a></div><div class="rail" id="related">${skeletons(5)}</div></section>
  </div>`;
  applyContent(main);
  // gallery
  let gi = 0;
  const show = i => { gi = (i + pics.length) % pics.length; const m = $('#gmain img'); m.classList.remove('fade'); void m.offsetWidth; m.classList.add('fade'); m.src = img(pics[gi], 1600); m.alt = `${p.title}, photo ${gi + 1} of ${pics.length}`; $$('.thumbs button').forEach(b => b.setAttribute('aria-current', +b.dataset.i === gi)); };
  $$('.thumbs button').forEach(b => b.onclick = () => show(+b.dataset.i));
  $('.prev')?.addEventListener('click', () => show(gi - 1));
  $('.next')?.addEventListener('click', () => show(gi + 1));
  // swipe
  let x0 = null; $('#gmain').addEventListener('touchstart', e => x0 = e.touches[0].clientX, { passive: true });
  $('#gmain').addEventListener('touchend', e => { if (x0 === null || pics.length < 2) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(gi + (dx < 0 ? 1 : -1)); x0 = null; });
  // structured data for Google Shopping-style results
  const ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.id = 'ld-product';
  ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: p.title, image: pics.slice(0, 5), brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined, itemCondition: p.ebay_condition && /^new/i.test(p.ebay_condition) ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition', offers: { '@type': 'Offer', priceCurrency: 'GBP', price: p.price, availability: sold ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock', url: location.href } });
  $('#ld-product')?.remove(); document.head.appendChild(ld);
  try {
    const s = await loadStock();
    const rel = s.filter(x => x.category === p.category && x.id !== p.id).sort((a, b) => (b.brand === p.brand) - (a.brand === p.brand) || (b.hand === p.hand) - (a.hand === p.hand)).slice(0, 10);
    $('#related').innerHTML = rel.map(card).join('');
  } catch (e) { $('#related').innerHTML = ''; }
};

/* sell us your clubs */
PAGES.sell = async () => {
  setTitle('Sell your clubs');
  main.innerHTML = $('#tpl-sell').innerHTML; applyContent(main);
  const files = [];
  const drop = $('#drop'), input = $('#photos'), th = $('#thumbs');
  const add = list => { [...list].filter(f => /^image\//.test(f.type)).slice(0, 6 - files.length).forEach(f => { files.push(f); const u = URL.createObjectURL(f); th.insertAdjacentHTML('beforeend', `<img src="${u}" alt="">`); }); $('#photocount').textContent = files.length ? `${files.length} of 6 photos added` : ''; };
  drop.onclick = () => input.click();
  drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  input.onchange = () => add(input.files);
  ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => add(e.dataTransfer.files));
  $('#sellform').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target), btn = $('#sellgo'), out = $('#sellmsg');
    if ((fd.get('website') || '').trim()) return; // honeypot
    btn.disabled = true; btn.textContent = 'Sending…'; out.innerHTML = '';
    try {
      const id = crypto.randomUUID(), photos = [];
      for (const [i, f] of files.entries()) {
        const small = await shrink(f);
        const path = `in/${id}/${i + 1}.jpg`;
        const r = await fetch(`${C.supabaseUrl}/storage/v1/object/bsg-tradeins/${path}`, { method: 'POST', headers: { ...H, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: small });
        if (r.ok) photos.push(path);
      }
      const row = { id, name: fd.get('name'), email: fd.get('email'), phone: fd.get('phone') || null, postcode: fd.get('postcode') || null, clubs: fd.get('clubs'), condition: fd.get('condition') || null, photos };
      const r = await fetch(API + 'bsg_tradeins', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) });
      if (!r.ok) throw new Error('save');
      e.target.reset(); files.length = 0; th.innerHTML = ''; $('#photocount').textContent = '';
      out.innerHTML = `<p class="note">Thanks, ${esc(row.name.split(' ')[0])}. We have your details and photos and will email you an offer, usually within two working days.</p>`;
      out.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      const body = encodeURIComponent(`Name: ${fd.get('name')}\nPhone: ${fd.get('phone')}\nPostcode: ${fd.get('postcode')}\n\nClubs:\n${fd.get('clubs')}\n\nCondition: ${fd.get('condition')}`);
      out.innerHTML = `<p class="note err">That did not send. Please <a href="mailto:${C.email}?subject=${encodeURIComponent('Clubs to sell')}&body=${body}">email it to us instead</a>, with your photos attached.</p>`;
    }
    btn.disabled = false; btn.textContent = 'Send for an offer';
  };
};
function shrink(file, max = 1600) {
  return new Promise(res => {
    const im = new Image(); im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      c.toBlob(b => res(b || file), 'image/jpeg', .85); URL.revokeObjectURL(im.src);
    }; im.onerror = () => res(file); im.src = URL.createObjectURL(file);
  });
}

/* simple template pages */
['grading', 'delivery', 'about', 'contact', 'privacy', 'terms'].forEach(n => {
  PAGES[n] = async () => {
    const t = $('#tpl-' + n); main.innerHTML = t.innerHTML; setTitle(t.dataset.title); applyContent(main);
    if (n === 'about') loadStock().then(s => { const el = $('#about-count'); if (el) el.textContent = s.length.toLocaleString('en-GB'); }).catch(() => {});
  };
});

PAGES.admin = async () => {
  setTitle('Admin');
  if (!window.BSGAdmin) { main.innerHTML = '<div class="wrap page-head"><p>Loading admin…</p></div>'; await new Promise(r => { const i = setInterval(() => { if (window.BSGAdmin) { clearInterval(i); r(); } }, 50); }); }
  window.BSGAdmin.mount(main);
};

/* ------------------------------------------------------------------ router */
async function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const [name, ...rest] = path.split('/');
  const fn = PAGES[name] || PAGES[''];
  const q = new URLSearchParams(qs || '');
  document.body.classList.toggle('is-admin', name === 'admin');
  setNav(name);
  $('#drawer').classList.remove('open');
  if (!route.skipScroll) window.scrollTo(0, 0);
  main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter');
  await fn(q, decodeURIComponent(rest.join('/')));
  main.focus({ preventScroll: true });
  decorate();
}
window.addEventListener('hashchange', route);

/* ------------------------------------------------------------------ motion */
// Reveal on scroll: anything matching REVEAL fades up as it enters the screen,
// siblings staggered. New content (stock arriving, page changes) is picked up automatically.
const REVEAL = '.head, .card, .cat, .scale > div, .steps li, .trust li, .faq details, .prose > *, .finder, .cond, .actions, .reassure li, .specs tr, .empty, .formgrid > *, .page-head > *';
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: .08 }) : null;
function decorate() {
  if (RM || !io) return;
  $$(REVEAL, main).forEach(el => {
    if (el.dataset.r !== undefined) return;
    el.dataset.r = '';
    const sib = [...el.parentElement.children].filter(x => x.dataset.r !== undefined);
    el.style.setProperty('--d', Math.min(sib.indexOf(el), 8) * 70 + 'ms');
    io.observe(el);
  });
  $$('.band, .trust, .scale, .cats', main).forEach(el => { if (!el.dataset.w) { el.dataset.w = 1; io.observe(el); } });
}
let decoQ = 0;
new MutationObserver(() => { cancelAnimationFrame(decoQ); decoQ = requestAnimationFrame(decorate); }).observe(main, { childList: true, subtree: true });

// header shrinks and a thin progress line fills as you scroll
const top_ = $('.top'), prog = $('#progress');
let ticking = false;
addEventListener('scroll', () => {
  if (ticking) return; ticking = true;
  requestAnimationFrame(() => {
    const y = scrollY, h = document.documentElement.scrollHeight - innerHeight;
    top_.classList.toggle('sc', y > 30);
    if (prog) prog.style.transform = `scaleX(${h > 0 ? Math.min(1, y / h) : 0})`;
    ticking = false;
  });
}, { passive: true });

// announcement strip cycles through a few messages
(function ticker() {
  const box = $('#ticker'); if (!box || RM) return;
  let i = 0;
  setInterval(() => {
    const msgs = [CONTENT.announce || 'Free UK delivery on every order. 14-day returns.', '100% positive feedback on eBay, over 1,200 clubs sold', 'New stock goes up most days', LEFT ? `Left-handed? ${LEFT} clubs in stock right now` : 'Plenty of left-handed clubs in stock', 'Got clubs to sell? We will make you an offer'];
    i = (i + 1) % msgs.length;
    box.classList.add('out');
    setTimeout(() => { box.textContent = msgs[i]; box.classList.remove('out'); box.classList.add('inn'); setTimeout(() => box.classList.remove('inn'), 500); }, 380);
  }, 4200);
})();
if (RM) $$('svg').forEach(s => s.pauseAnimations && s.pauseAnimations());

/* header search */
$('#topsearch').addEventListener('submit', e => { e.preventDefault(); const v = $('#q').value.trim(); location.hash = '#/shop' + (v ? '?q=' + encodeURIComponent(v) : ''); });
$('#burger').onclick = () => $('#drawer').classList.add('open');
$$('#drawer .scrim, #drawer .x').forEach(el => el.onclick = () => $('#drawer').classList.remove('open'));
document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('#drawer').classList.remove('open'); $('#filters')?.classList.remove('open'); } });

/* ------------------------------------------------------------------ looks
   Logo and colour scheme. The preview shows a chooser; the live build fixes both. */
const SCHEMES = {
  fairway: { name: 'Fairway', note: 'Green and flag yellow', ink: '#1E2328', turf: '#1F5C45', flag: '#FFC629', paper: '#FAFAF7', soft: '#9FC9B4' },
  links:   { name: 'Links', note: 'Navy and sand', ink: '#16243A', turf: '#1F3A60', flag: '#E4B866', paper: '#F8F7F2', soft: '#AFC3DE' },
  claret:  { name: 'Clubhouse', note: 'Claret and gold', ink: '#2A1A1D', turf: '#6E1F2F', flag: '#D9A93F', paper: '#F8F4EC', soft: '#E3B9B9' },
  tour:    { name: 'Tour', note: 'Black and orange', ink: '#141618', turf: '#2A2E33', flag: '#FF6A2B', paper: '#F6F6F4', soft: '#B9BEC4' },
  sky:     { name: 'Sky', note: 'Teal and amber', ink: '#122630', turf: '#0F6E8C', flag: '#FFB23E', paper: '#F7FAFB', soft: '#A9D3E1' }
};
let LOOK = { logo: C.logo || 'a', scheme: C.scheme || 'fairway' };
const BASE = SCHEMES.fairway;
function recolour(uri, sc) {
  if (sc === BASE) return uri;
  try {
    let svg = atob(uri.split(',')[1]);
    const map = { [BASE.ink]: sc.ink, [BASE.turf]: sc.turf, [BASE.flag]: sc.flag, [BASE.paper]: sc.paper, [BASE.soft]: sc.soft };
    svg = svg.replace(/#[0-9A-Fa-f]{6}/g, h => map[h.toUpperCase()] || h);
    return 'data:image/svg+xml;base64,' + btoa(svg);
  } catch (e) { return uri; }
}
function applyLook() {
  const sc = SCHEMES[LOOK.scheme] || BASE;
  document.documentElement.dataset.scheme = LOOK.scheme;
  $('meta[name="theme-color"]')?.setAttribute('content', sc.turf);
  $$('[data-logo-slot]').forEach(el => { el.dataset.logo = LOOK.logo; const im = $('img', el); im.src = recolour(C.logos[LOOK.logo + (el.dataset.logoSlot === 'dark' ? '-dark' : '-light')], sc); });
  const lp = $('.lookpick');
  if (lp) {
    $$('[data-l]', lp).forEach(b => b.setAttribute('aria-pressed', b.dataset.l === LOOK.logo));
    $$('[data-s]', lp).forEach(b => b.setAttribute('aria-pressed', b.dataset.s === LOOK.scheme));
    $('.lp-dots', lp).innerHTML = [sc.ink, sc.turf, sc.flag].map(c => `<i style="background:${c}"></i>`).join('');
  }
  try { localStorage.setItem('bsg-look', JSON.stringify(LOOK)); } catch (e) {}
}
if (C.preview) {
  try { const saved = JSON.parse(localStorage.getItem('bsg-look') || 'null'); if (saved && SCHEMES[saved.scheme] && C.logos[saved.logo + '-light']) LOOK = saved; } catch (e) {}
  const lp = document.createElement('div'); lp.className = 'lookpick';
  lp.innerHTML = `<button type="button" class="lp-open" aria-expanded="false"><span class="lp-dots"></span>Try a look</button>
    <div class="lp-panel" role="dialog" aria-label="Try a logo and colour scheme">
      <p>Try a logo <button type="button" class="lp-x" aria-label="Close">×</button></p>
      <div><button type="button" data-l="a">Modern</button><button type="button" data-l="b">Heritage</button><button type="button" data-l="c">Sporty</button></div>
      <p>Try a colour scheme</p>
      <div>${Object.entries(SCHEMES).map(([k, v]) => `<button type="button" data-s="${k}" title="${v.note}"><span>${[v.ink, v.turf, v.flag].map(c => `<i style="background:${c}"></i>`).join('')}</span>${v.name}</button>`).join('')}</div>
      <small>Your choice is remembered on this device. Tell Dunnworks which you like.</small>
    </div>`;
  document.body.appendChild(lp);
  lp.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('lp-open')) { lp.classList.add('open'); return; }
    if (b.classList.contains('lp-x')) { lp.classList.remove('open'); return; }
    if (b.dataset.l) LOOK.logo = b.dataset.l;
    if (b.dataset.s) LOOK.scheme = b.dataset.s;
    applyLook();
  });
  // open it once on the first visit so the client knows it is there
  try { if (!localStorage.getItem('bsg-look-seen')) { setTimeout(() => lp.classList.add('open'), 2500); localStorage.setItem('bsg-look-seen', '1'); } } catch (e) {}
}
applyLook();

loadContent();
route();
})();
