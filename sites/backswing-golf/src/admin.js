/* Backswing Golf admin, at #/admin. Signs in with Supabase Auth; the database
   only lets people listed in bsg_editors (or the Dunnworks owner) change anything. */
(function () {
'use strict';
const C = window.BSG_CONFIG;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gbp = n => n == null || n === '' ? '' : '£' + Number(n).toFixed(2);
const ago = d => { if (!d) return ''; const s = (Date.now() - new Date(d)) / 1000; if (s < 90) return 'just now'; if (s < 5400) return Math.round(s / 60) + ' min ago'; if (s < 129600) return Math.round(s / 3600) + ' hours ago'; return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
const CATS = ['Iron sets', 'Irons', 'Drivers', 'Fairway woods', 'Hybrids', 'Wedges', 'Putters', 'Heads', 'Shafts', 'Headcovers', 'Bags', 'Grips', 'Job lots', 'Other'];
const GRADES = ['Ex-demo', 'Excellent', 'Very good', 'Good', 'Fair'];
const FLEXES = ['Ladies', 'Senior', 'Regular', 'Stiff/Regular', 'Stiff', 'Extra stiff'];
const WORDING = [
  ['announce', 'Strip across the top of every page'],
  ['hero_title', 'Home page headline'], ['hero_intro', 'Home page intro'],
  ['trust1_t', 'Reassurance 1 heading'], ['trust1', 'Reassurance 1 line'],
  ['trust2_t', 'Reassurance 2 heading'], ['trust2', 'Reassurance 2 line'],
  ['trust3_t', 'Reassurance 3 heading'], ['trust3', 'Reassurance 3 line'],
  ['trust4_t', 'Reassurance 4 heading'], ['trust4', 'Reassurance 4 line'],
  ['sell_intro', 'Sell your clubs intro'],
  ['pdp_delivery', 'Delivery line on every item'], ['pdp_returns', 'Returns line on every item'],
  ['del_free', 'Delivery: main line'], ['del_collect', 'Delivery: collection'], ['del_dispatch', 'Delivery: dispatch times'], ['del_abroad', 'Delivery: outside the UK'],
  ['ret_days', 'Returns: time limit'], ['ret_cost', 'Returns: who pays'],
  ['about_body', 'About page: opening'], ['about_story', 'About page: your story']
];

let sb, me = null, isOwner = false, root;

const css = `
.adm{max-width:1300px;margin:0 auto;padding:24px var(--gut) 80px}
.adm h1{font-size:48px;margin:0}
.adm .tabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1.5px solid var(--line);margin:18px 0 22px}
.adm .tabs button{border:0;background:none;padding:12px 14px;font-weight:600;font-size:16px;border-bottom:3px solid transparent;margin-bottom:-1.5px;cursor:pointer;color:var(--ink2)}
.adm .tabs button[aria-selected="true"]{border-color:var(--ink);color:var(--ink)}
.adm .tabs .n{display:inline-block;min-width:22px;padding:1px 7px;border-radius:999px;background:var(--flag);font-size:13px;margin-left:6px}
.adm .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.adm .row input,.adm .row select{height:42px;border:1.5px solid var(--line2);border-radius:var(--r);padding:0 10px;background:#fff}
.adm .row input[type=search]{flex:1;min-width:220px}
.adm table.list{width:100%;border-collapse:collapse;background:#fff;border:1.5px solid var(--line);border-radius:var(--r2);overflow:hidden;font-size:15px}
.adm .list th{text-align:left;font-weight:600;color:var(--muted);padding:10px;border-bottom:1.5px solid var(--line);background:var(--mist)}
.adm .list td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
.adm .list tr:hover td{background:#FBFCFB;cursor:pointer}
.adm .list img{width:52px;height:52px;object-fit:cover;border-radius:6px}
.adm .pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:13px;font-weight:600;background:var(--mist)}
.adm .pill.live{background:var(--turf-soft);color:var(--turf2)} .adm .pill.sold{background:var(--ink);color:#fff} .adm .pill.hidden{background:#EEE;color:#666}
.adm .pill.pend{background:var(--flag-soft);color:#7A5B00}
.adm .ed{display:grid;grid-template-columns:1.1fr .9fr;gap:28px}
.adm .ed .formgrid{align-content:start}
.adm .imgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
.adm .imgs figure{margin:0;position:relative;border:1.5px solid var(--line);border-radius:8px;overflow:hidden;background:#fff}
.adm .imgs img{width:100%;aspect-ratio:1;object-fit:cover}
.adm .imgs figcaption{display:flex;justify-content:space-between;padding:4px}
.adm .imgs button{border:0;background:var(--mist);border-radius:4px;width:28px;height:28px;cursor:pointer}
.adm .imgs figure:first-child::after{content:"Main photo";position:absolute;left:6px;top:6px;background:var(--flag);font-size:12px;font-weight:700;padding:2px 6px;border-radius:4px}
.adm .card2{background:#fff;border:1.5px solid var(--line);border-radius:var(--r2);padding:18px;margin-bottom:16px}
.adm .card2 h3{margin-bottom:8px}
.adm .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:18px}
.adm .stats div{background:#fff;border:1.5px solid var(--line);border-radius:var(--r2);padding:14px}
.adm .stats b{display:block;font:800 36px/1 var(--display)}
.adm .login{max-width:420px;margin:40px auto}
.adm .ti{display:grid;grid-template-columns:1fr 1.1fr;gap:20px}
.adm .ti .thumbs-up img{width:96px;height:96px}
.adm .check{display:flex;gap:10px;align-items:center;font-weight:600}
.adm .check input{width:20px;height:20px;accent-color:var(--turf)}
.adm .danger{color:var(--sold);border-color:var(--sold);background:transparent}
.adm .log{font-size:14px} .adm .log li{padding:6px 0;border-bottom:1px solid var(--line)}
.adm .help{font-size:14.5px;color:var(--muted);margin:4px 0 0}
@media (max-width:900px){.adm .ed,.adm .ti{grid-template-columns:1fr}.adm .list .hide-s{display:none}}
body.is-admin .announce,body.is-admin .logopick{display:none}
`;

function client() {
  if (!sb) sb = window.supabase.createClient(C.supabaseUrl, C.anonKey, { auth: { persistSession: true, storageKey: 'bsg-admin' } });
  return sb;
}
function toast(m, bad) { const t = document.createElement('div'); t.className = 'toast'; if (bad) t.style.background = 'var(--sold)'; t.role = 'status'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 3500); }

async function mount(el) {
  root = el;
  if (!$('#adm-css')) { const s = document.createElement('style'); s.id = 'adm-css'; s.textContent = css; document.head.appendChild(s); }
  await new Promise(r => { const i = setInterval(() => { if (window.supabase) { clearInterval(i); r(); } }, 50); });
  const { data } = await client().auth.getSession();
  me = data.session?.user || null;
  if (!me) return login();
  const { data: ok } = await sb.rpc('bsg_is_editor');
  if (!ok) { root.innerHTML = `<div class="adm"><div class="login card2"><h2>No access yet</h2><p>You are signed in as ${esc(me.email)}, but that address is not on the list of people who can edit this site. Ask Dunnworks to add you.</p><button class="btn ghost" id="out">Sign out</button></div></div>`; $('#out').onclick = signOut; return; }
  isOwner = (me.email || '').toLowerCase() === 'info@dunnworks.io';
  shell();
}
async function signOut() { await sb.auth.signOut(); me = null; login(); }

function login() {
  root.innerHTML = `<div class="adm"><form class="login card2" id="lf">
    <h1 style="font-size:40px">Admin sign in</h1>
    <p class="muted">For Backswing Golf staff.</p>
    <label class="field">Email<input name="email" type="email" required autocomplete="username"></label>
    <label class="field" style="margin-top:10px">Password<input name="password" type="password" required autocomplete="current-password"></label>
    <button class="btn flag" style="width:100%;margin-top:16px">Sign in</button>
    <p style="margin-top:12px"><button type="button" class="link" id="forgot" style="border:0;background:none;padding:0;cursor:pointer">Set or reset my password</button></p>
    <div id="lmsg" aria-live="polite"></div></form></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target);
    const { error } = await client().auth.signInWithPassword({ email: f.get('email').trim(), password: f.get('password') });
    if (error) { $('#lmsg').innerHTML = `<p class="note err" style="margin-top:12px">${esc(error.message === 'Invalid login credentials' ? 'That email and password do not match. Check them, or use Set or reset my password.' : error.message)}</p>`; return; }
    mount(root);
  };
  $('#forgot').onclick = async () => {
    const em = $('#lf [name=email]').value.trim();
    if (!em) { $('#lmsg').innerHTML = '<p class="note err" style="margin-top:12px">Type your email address first, then press this again.</p>'; return; }
    const { error } = await client().auth.resetPasswordForEmail(em, { redirectTo: C.adminUrl });
    $('#lmsg').innerHTML = error ? `<p class="note err" style="margin-top:12px">${esc(error.message)}</p>` : '<p class="note" style="margin-top:12px">If that address can edit this site, a link to set your password is on its way.</p>';
  };
}

/* ---------------------------------------------------------------- shell */
let TAB = 'stock';
async function shell() {
  root.innerHTML = `<div class="adm">
    <div class="row" style="justify-content:space-between"><h1>Shop admin</h1><span class="muted">${esc(me.email)} <button class="btn ghost small" id="out">Sign out</button></span></div>
    <div class="tabs" role="tablist">
      <button role="tab" data-t="stock">Stock</button>
      <button role="tab" data-t="add">Add an item</button>
      <button role="tab" data-t="tradeins">Trade-ins <span class="n" id="tin" hidden></span></button>
      <button role="tab" data-t="wording">Page wording</button>
      <button role="tab" data-t="ebay">eBay link</button>
      ${isOwner ? '<button role="tab" data-t="people">People</button>' : ''}
    </div>
    <div id="pane"></div></div>`;
  $('#out').onclick = signOut;
  $$('.tabs button', root).forEach(b => b.onclick = () => open(b.dataset.t));
  sb.from('bsg_tradeins').select('id', { count: 'exact', head: true }).eq('status', 'new').then(({ count }) => { if (count) { $('#tin').hidden = false; $('#tin').textContent = count; } });
  open(TAB);
}
function open(t, arg) {
  TAB = t;
  $$('.tabs button', root).forEach(b => b.setAttribute('aria-selected', b.dataset.t === t));
  ({ stock, add: () => editor(null), tradeins, wording, ebay, people, edit: editor })[t](arg);
}

/* ---------------------------------------------------------------- stock */
let STF = { q: '', status: 'live', cat: '', extra: '' };
async function stock() {
  const p = $('#pane');
  p.innerHTML = `<div class="row">
      <input type="search" id="sq" placeholder="Search titles or eBay item number" value="${esc(STF.q)}">
      <select id="sst"><option value="live">On sale</option><option value="sold">Sold</option><option value="hidden">Hidden</option><option value="">Everything</option></select>
      <select id="scat"><option value="">All types</option>${CATS.map(c => `<option>${c}</option>`).join('')}</select>
      <select id="sx"><option value="">No extra filter</option><option value="ungraded">Grade not confirmed yet</option><option value="pending">Waiting to go to eBay</option><option value="site">Added here, not on eBay</option><option value="featured">Featured on the home page</option></select>
    </div><div id="slist"><p class="muted">Loading…</p></div>`;
  $('#sst').value = STF.status; $('#scat').value = STF.cat; $('#sx').value = STF.extra;
  const go = async () => {
    let q = sb.from('bsg_products').select('id,title,price,status,category,grade,grade_confirmed,source,sync_state,ebay_item_id,featured,updated_at,images', { count: 'exact' }).order('updated_at', { ascending: false }).limit(200);
    if (STF.status) q = q.eq('status', STF.status);
    if (STF.cat) q = q.eq('category', STF.cat);
    if (STF.extra === 'ungraded') q = q.eq('grade_confirmed', false);
    if (STF.extra === 'pending') q = q.eq('sync_state', 'pending_push');
    if (STF.extra === 'site') q = q.is('ebay_item_id', null);
    if (STF.extra === 'featured') q = q.eq('featured', true);
    if (STF.q) q = /^\d{9,}$/.test(STF.q) ? q.eq('ebay_item_id', STF.q) : q.ilike('title', `%${STF.q.replace(/[%_]/g, '')}%`);
    const { data, count, error } = await q;
    if (error) { $('#slist').innerHTML = `<p class="note err">${esc(error.message)}</p>`; return; }
    $('#slist').innerHTML = `<p class="muted">${count} ${count === 1 ? 'item' : 'items'}${count > 200 ? ', showing the 200 most recently changed. Search to narrow it down.' : ''}</p>
      <table class="list"><thead><tr><th></th><th>Item</th><th>Price</th><th class="hide-s">Type</th><th class="hide-s">Grade</th><th>Status</th></tr></thead><tbody>
      ${data.map(r => `<tr data-id="${r.id}" tabindex="0"><td><img loading="lazy" src="${esc(String(r.images?.[0] || '').replace(/s-l\d+\./, 's-l140.'))}" alt=""></td>
        <td>${esc(r.title)}<br><span class="help">${r.ebay_item_id ? 'eBay ' + esc(r.ebay_item_id) : 'Added here'}${r.featured ? ' · Featured' : ''}</span></td>
        <td class="price">${gbp(r.price)}</td><td class="hide-s">${esc(r.category || '')}</td>
        <td class="hide-s">${esc(r.grade || '')}${r.grade && !r.grade_confirmed ? ' <span class="pill pend" title="Suggested from the eBay listing">to check</span>' : ''}</td>
        <td><span class="pill ${r.status}">${{ live: 'On sale', sold: 'Sold', hidden: 'Hidden' }[r.status]}</span>${r.sync_state === 'pending_push' ? ' <span class="pill pend">to eBay</span>' : ''}</td></tr>`).join('')}
      </tbody></table>`;
    $$('#slist tr[data-id]').forEach(tr => { tr.onclick = () => open('edit', tr.dataset.id); tr.onkeydown = e => { if (e.key === 'Enter') open('edit', tr.dataset.id); }; });
  };
  let t; $('#sq').oninput = e => { clearTimeout(t); t = setTimeout(() => { STF.q = e.target.value.trim(); go(); }, 300); };
  $('#sst').onchange = e => { STF.status = e.target.value; go(); };
  $('#scat').onchange = e => { STF.cat = e.target.value; go(); };
  $('#sx').onchange = e => { STF.extra = e.target.value; go(); };
  go();
}

/* ---------------------------------------------------------------- editor */
async function editor(id) {
  const p = $('#pane');
  let r = { title: '', price: '', category: 'Irons', status: 'live', images: [], specs: {}, source: 'site', qty: 1, grade: 'Very good', grade_confirmed: true };
  if (id) { const { data, error } = await sb.from('bsg_products').select('*').eq('id', id).single(); if (error) { p.innerHTML = `<p class="note err">${esc(error.message)}</p>`; return; } r = data; }
  const opt = (list, v) => list.map(x => `<option${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('');
  let imgs = [...(r.images || [])];
  p.innerHTML = `<p><button class="link" id="back" style="border:0;background:none;padding:0;cursor:pointer">Back to stock</button></p>
  <form class="ed" id="ef">
    <div class="formgrid">
      <h2 class="full" style="font-size:34px;margin:0">${id ? 'Edit item' : 'Add an item'}</h2>
      ${r.ebay_item_id ? `<p class="full note">This item is on eBay (<a href="${esc(r.ebay_url)}" target="_blank" rel="noopener">${esc(r.ebay_item_id)}</a>). Changes to the title, price, quantity or status are sent to eBay once the eBay link is switched on.</p>` : id ? '<p class="full help">Added here. It is not on eBay.</p>' : ''}
      <label class="field full">Title<input name="title" required maxlength="80" value="${esc(r.title)}"><span class="help">eBay allows 80 characters. Brand, model, club, shaft, hand.</span></label>
      <label class="field">Price (£)<input name="price" required inputmode="decimal" value="${esc(r.price)}"></label>
      <label class="field">Was price (£, optional)<input name="was_price" inputmode="decimal" value="${esc(r.was_price ?? '')}"></label>
      <label class="field">Type<select name="category">${opt(CATS, r.category)}</select></label>
      <label class="field">Brand<input name="brand" value="${esc(r.brand || '')}" list="brands"></label>
      <label class="field">Model<input name="model" value="${esc(r.model || '')}"></label>
      <label class="field">Club (e.g. 7-Iron, 3-Wood)<input name="club" value="${esc(r.club || '')}"></label>
      <label class="field">Hand<select name="hand"><option value="">Not applicable</option>${opt(['Right', 'Left'], r.hand)}</select></label>
      <label class="field">Shaft flex<select name="flex"><option value="">Not applicable</option>${opt(FLEXES, r.flex)}</select></label>
      <label class="field">Shaft material<select name="shaft"><option value="">Not applicable</option>${opt(['Steel', 'Graphite'], r.shaft)}</select></label>
      <label class="field">Loft<input name="loft" value="${esc(r.loft || '')}" placeholder="e.g. 10.5"></label>
      <label class="field">Our grade<select name="grade">${opt(GRADES, r.grade)}</select></label>
      <label class="field">eBay condition<select name="ebay_condition"><option value="">None</option>${opt(['New with tags', 'New with box', 'New other (see details)', 'Pre-owned - Excellent', 'Pre-owned - Good', 'Used'], r.ebay_condition)}</select></label>
      <label class="check full"><input type="checkbox" name="grade_confirmed"${r.grade_confirmed ? ' checked' : ''}> I have checked the grade${!r.grade_confirmed && r.grade ? ' <span class="pill pend">suggested from the eBay notes</span>' : ''}</label>
      <label class="field full">Our notes (shown next to the grade)<input name="seller_notes" maxlength="160" value="${esc(r.seller_notes || '')}" placeholder="e.g. Ex demo, light face marks"></label>
      <label class="field full">Description (optional)<textarea name="description">${esc(r.description || '')}</textarea></label>
      <label class="field">Quantity<input name="qty" type="number" min="0" value="${esc(r.qty ?? 1)}"></label>
      <label class="field">Status<select name="status">${[['live', 'On sale'], ['hidden', 'Hidden'], ['sold', 'Sold']].map(([v, l]) => `<option value="${v}"${r.status === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="check full"><input type="checkbox" name="featured"${r.featured ? ' checked' : ''}> Feature on the home page</label>
      <div class="full row" style="margin-top:6px">
        <button class="btn flag" id="save">${id ? 'Save changes' : 'Add to the shop'}</button>
        ${id && r.status !== 'sold' ? '<button type="button" class="btn ghost" id="sold">Mark as sold</button>' : ''}
        ${id && !r.ebay_item_id ? '<button type="button" class="btn ghost danger" id="del">Delete</button>' : ''}
      </div>
      <div class="full" id="emsg" aria-live="polite"></div>
    </div>
    <div>
      <h3>Photos</h3>
      <p class="help" style="margin-bottom:10px">The first photo is the one shown in the shop. Use the arrows to reorder.</p>
      <div class="imgs" id="imgs"></div>
      <div class="drop" id="adrop" role="button" tabindex="0" style="margin-top:12px">Add photos<br><span class="muted">Drop them here or tap to choose. They are resized for you.</span></div>
      <input type="file" id="afiles" accept="image/*" multiple hidden>
      <p class="help" id="upmsg"></p>
    </div>
  </form><datalist id="brands">${['Callaway', 'Cobra', 'Mizuno', 'Ping', 'Srixon', 'TaylorMade', 'Titleist', 'Cleveland', 'Wilson', 'Odyssey', 'Scotty Cameron', 'Project X', 'Fujikura', 'Aldila', 'Mitsubishi', 'UST', 'Accra', 'Yonex', 'Nike'].map(b => `<option>${b}</option>`).join('')}</datalist>`;
  const drawImgs = () => {
    $('#imgs').innerHTML = imgs.map((u, i) => `<figure><img src="${esc(String(u).replace(/s-l\d+\./, 's-l300.'))}" alt="Photo ${i + 1}"><figcaption>
      <button type="button" data-a="l" data-i="${i}" aria-label="Move earlier"${i ? '' : ' disabled'}>‹</button><button type="button" data-a="x" data-i="${i}" aria-label="Remove photo">×</button><button type="button" data-a="r" data-i="${i}" aria-label="Move later"${i < imgs.length - 1 ? '' : ' disabled'}>›</button></figcaption></figure>`).join('') || '<p class="muted">No photos yet.</p>';
  };
  drawImgs();
  $('#imgs').onclick = e => {
    const b = e.target.closest('button[data-a]'); if (!b) return; const i = +b.dataset.i;
    if (b.dataset.a === 'x') imgs.splice(i, 1);
    if (b.dataset.a === 'l' && i) [imgs[i - 1], imgs[i]] = [imgs[i], imgs[i - 1]];
    if (b.dataset.a === 'r' && i < imgs.length - 1) [imgs[i + 1], imgs[i]] = [imgs[i], imgs[i + 1]];
    drawImgs();
  };
  const upload = async files => {
    const list = [...files].filter(f => /^image\//.test(f.type));
    for (const [n, f] of list.entries()) {
      $('#upmsg').textContent = `Uploading ${n + 1} of ${list.length}…`;
      const blob = await shrinkImg(f, 1600);
      const path = `items/${(id || 'new')}/${Date.now()}-${n}.jpg`;
      const { error } = await sb.storage.from('bsg-images').upload(path, blob, { contentType: 'image/jpeg' });
      if (error) { $('#upmsg').textContent = 'Upload failed: ' + error.message; return; }
      imgs.push(sb.storage.from('bsg-images').getPublicUrl(path).data.publicUrl); drawImgs();
    }
    $('#upmsg').textContent = list.length ? 'Photos added. Remember to save.' : '';
  };
  $('#adrop').onclick = () => $('#afiles').click();
  $('#adrop').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#afiles').click(); } };
  $('#afiles').onchange = e => upload(e.target.files);
  ['dragover', 'dragenter'].forEach(ev => $('#adrop').addEventListener(ev, e => { e.preventDefault(); $('#adrop').classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => $('#adrop').addEventListener(ev, e => { e.preventDefault(); $('#adrop').classList.remove('over'); }));
  $('#adrop').addEventListener('drop', e => upload(e.dataTransfer.files));
  $('#back').onclick = () => open('stock');

  $('#ef').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const num = v => v === '' || v == null ? null : Number(String(v).replace(/[£,\s]/g, ''));
    const row = {
      title: f.get('title').trim(), price: num(f.get('price')), was_price: num(f.get('was_price')), category: f.get('category'),
      brand: f.get('brand').trim() || null, model: f.get('model').trim() || null, club: f.get('club').trim() || null,
      hand: f.get('hand') || null, flex: f.get('flex') || null, shaft: f.get('shaft') || null, loft: f.get('loft').trim() || null,
      grade: f.get('grade'), grade_confirmed: !!f.get('grade_confirmed'), ebay_condition: f.get('ebay_condition') || null,
      seller_notes: f.get('seller_notes').trim() || null, description: f.get('description').trim() || null,
      qty: +f.get('qty'), status: f.get('status'), featured: !!f.get('featured'), images: imgs
    };
    if (!row.title || !row.price || isNaN(row.price)) { $('#emsg').innerHTML = '<p class="note err">Add a title and a price before saving.</p>'; return; }
    if (!id) row.slug = row.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 8);
    $('#save').disabled = true;
    const { data, error } = id ? await sb.from('bsg_products').update(row).eq('id', id).select('id').single() : await sb.from('bsg_products').insert({ ...row, source: 'site' }).select('id').single();
    $('#save').disabled = false;
    if (error) { $('#emsg').innerHTML = `<p class="note err">Not saved: ${esc(error.message)}</p>`; return; }
    toast(id ? 'Changes saved' : 'Added to the shop');
    if (!id) open('edit', data.id); else $('#emsg').innerHTML = `<p class="note">Saved. <a href="#/club/${esc(r.slug)}" target="_blank">See it in the shop</a></p>`;
  };
  $('#sold')?.addEventListener('click', async () => {
    const { error } = await sb.from('bsg_products').update({ status: 'sold', qty: 0 }).eq('id', id);
    if (error) return toast(error.message, true);
    toast('Marked as sold'); open('edit', id);
  });
  $('#del')?.addEventListener('click', async e => {
    const b = e.currentTarget;
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Press again to delete for good'; setTimeout(() => { delete b.dataset.sure; b.textContent = 'Delete'; }, 4000); return; }
    const { error } = await sb.from('bsg_products').delete().eq('id', id);
    if (error) return toast(error.message, true);
    toast('Deleted'); open('stock');
  });
}
function shrinkImg(file, max) {
  return new Promise(res => { const im = new Image(); im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); c.toBlob(b => res(b || file), 'image/jpeg', .86); }; im.onerror = () => res(file); im.src = URL.createObjectURL(file); });
}

/* ---------------------------------------------------------------- trade-ins */
async function tradeins() {
  const p = $('#pane'); p.innerHTML = '<p class="muted">Loading…</p>';
  const { data, error } = await sb.from('bsg_tradeins').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) { p.innerHTML = `<p class="note err">${esc(error.message)}</p>`; return; }
  if (!data.length) { p.innerHTML = '<div class="empty"><h3>No trade-in enquiries yet</h3><p class="muted" style="margin:0 auto">When someone fills in Sell your clubs, it lands here with their photos.</p></div>'; return; }
  const label = { new: 'New', offered: 'Offer sent', accepted: 'Accepted', declined: 'Declined', done: 'Done' };
  p.innerHTML = data.map(t => `<div class="card2 ti" data-id="${t.id}">
    <div><h3>${esc(t.name)} <span class="pill ${t.status === 'new' ? 'pend' : ''}">${label[t.status]}</span></h3>
      <p class="help">${ago(t.created_at)} · <a href="mailto:${esc(t.email)}">${esc(t.email)}</a>${t.phone ? ' · ' + esc(t.phone) : ''}${t.postcode ? ' · ' + esc(t.postcode) : ''}</p>
      <p style="white-space:pre-wrap;margin-top:10px">${esc(t.clubs)}</p>${t.condition ? `<p class="help">Condition: ${esc(t.condition)}</p>` : ''}
      <div class="thumbs-up" data-photos='${esc(JSON.stringify(t.photos || []))}'></div></div>
    <div class="formgrid">
      <label class="field">Status<select data-f="status">${Object.entries(label).map(([v, l]) => `<option value="${v}"${t.status === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field">Offer (£)<input data-f="offer" inputmode="decimal" value="${esc(t.offer ?? '')}"></label>
      <label class="field full">Private notes<textarea data-f="notes" style="min-height:80px">${esc(t.notes || '')}</textarea></label>
      <div class="full row"><button class="btn small" data-a="save">Save</button><a class="btn ghost small" data-a="mail" href="#">Email an offer</a></div>
    </div></div>`).join('');
  $$('.ti', p).forEach(async card => {
    const t = data.find(x => x.id === card.dataset.id);
    const box = $('.thumbs-up', card); const paths = JSON.parse(box.dataset.photos);
    if (paths.length) {
      const { data: urls } = await sb.storage.from('bsg-tradeins').createSignedUrls(paths, 3600);
      box.innerHTML = (urls || []).map(u => `<a href="${esc(u.signedUrl)}" target="_blank" rel="noopener"><img src="${esc(u.signedUrl)}" alt="Photo sent with the enquiry"></a>`).join('');
    }
    $('[data-a=save]', card).onclick = async () => {
      const row = { status: $('[data-f=status]', card).value, offer: $('[data-f=offer]', card).value ? Number($('[data-f=offer]', card).value.replace(/[£,]/g, '')) : null, notes: $('[data-f=notes]', card).value || null };
      const { error } = await sb.from('bsg_tradeins').update(row).eq('id', t.id);
      toast(error ? error.message : 'Saved', !!error);
    };
    $('[data-a=mail]', card).onclick = e => {
      const offer = $('[data-f=offer]', card).value;
      e.currentTarget.href = `mailto:${encodeURIComponent(t.email)}?subject=${encodeURIComponent('Your clubs: our offer')}&body=${encodeURIComponent(`Hi ${t.name.split(' ')[0]},\n\nThanks for sending the details of your clubs.\n\n${offer ? `We can offer £${offer} for them.` : 'We can offer £__ for them.'}\n\nIf you are happy with that, reply to this email and we will send you a prepaid label.\n\nThanks,\nBackswing Golf`)}`;
    };
  });
}

/* ---------------------------------------------------------------- wording */
async function wording() {
  const p = $('#pane'); p.innerHTML = '<p class="muted">Loading…</p>';
  const { data } = await sb.from('bsg_content').select('*');
  const cur = Object.fromEntries((data || []).map(r => [r.key, r.value]));
  const def = k => { const el = document.querySelector('template') && [...document.querySelectorAll('template')].map(t => t.content.querySelector(`[data-k="${k}"]`)).find(Boolean) || document.querySelector(`[data-k="${k}"]`); return el ? el.textContent.trim() : ''; };
  p.innerHTML = `<p class="lede">Change the wording on the site. Saved changes show straight away. Clear a box to go back to the original wording.</p>
    <form id="wf" class="formgrid" style="max-width:860px">${WORDING.map(([k, l]) => `<label class="field full">${esc(l)}<textarea data-k2="${k}" style="min-height:${k.includes('body') || k.includes('story') || k.includes('intro') ? 110 : 60}px" placeholder="${esc(def(k))}">${esc(cur[k] || '')}</textarea></label>`).join('')}
    <div class="full"><button class="btn flag">Save wording</button></div></form>`;
  $('#wf').onsubmit = async e => {
    e.preventDefault();
    const rows = $$('textarea[data-k2]').map(t => ({ key: t.dataset.k2, value: t.value.trim() || null, updated_at: new Date().toISOString() }));
    const { error } = await sb.from('bsg_content').upsert(rows);
    toast(error ? error.message : 'Wording saved', !!error);
  };
}

/* ---------------------------------------------------------------- eBay */
async function ebay() {
  const p = $('#pane'); p.innerHTML = '<p class="muted">Loading…</p>';
  const [{ count: onEbay }, { count: here }, { count: pend }, { data: log }, st] = await Promise.all([
    sb.from('bsg_products').select('id', { count: 'exact', head: true }).not('ebay_item_id', 'is', null).eq('status', 'live'),
    sb.from('bsg_products').select('id', { count: 'exact', head: true }).is('ebay_item_id', null).eq('status', 'live'),
    sb.from('bsg_products').select('id', { count: 'exact', head: true }).eq('sync_state', 'pending_push'),
    sb.from('bsg_sync_log').select('*').order('at', { ascending: false }).limit(30),
    sb.functions.invoke('bsg-ebay-sync', { body: { action: 'status' } }).then(r => r.data).catch(() => null)
  ]);
  const connected = st && st.connected;
  p.innerHTML = `<div class="stats">
      <div><b>${onEbay ?? 0}</b>On sale, from eBay</div><div><b>${here ?? 0}</b>On sale, added here</div>
      <div><b>${pend ?? 0}</b>Changes waiting to go to eBay</div><div><b>${connected ? 'On' : 'Off'}</b>Automatic link</div></div>
    <div class="card2"><h3>${connected ? 'eBay is linked' : 'eBay is not linked yet'}</h3>
      ${connected ? `<p>Linked to <b>${esc(st.seller || 'your eBay account')}</b>. Last checked ${ago(st.last_pull)}.</p>`
        : `<p>The shop currently holds a copy of your eBay listings taken on ${log?.find(l => l.action === 'import') ? new Date(log.find(l => l.action === 'import').at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'the first import'}. Once linked, it keeps itself up to date:</p>
           <ul><li>New eBay listings appear here within 15 minutes</li><li>Anything that sells on eBay is marked sold here</li><li>Price, title and quantity changes you make here are sent to eBay</li><li>Items you add here can be listed on eBay with one click</li></ul>
           <p class="help">Linking needs you to sign in to eBay once and approve Backswing Golf's website. Dunnworks will send you the link.</p>`}
      <div class="row" style="margin-top:12px">
        <button class="btn${connected ? ' ghost' : ' flag'}" id="econnect"${st && st.can_connect ? '' : ' disabled'}>${connected ? 'Re-link eBay' : 'Link eBay'}</button>
        <button class="btn ghost" id="epull"${connected ? '' : ' disabled'}>Check eBay now</button>
        <button class="btn ghost" id="epush"${connected && pend ? '' : ' disabled'}>Send ${pend || ''} waiting changes to eBay</button>
      </div>
      ${st && !st.can_connect ? '<p class="help">The Link eBay button switches on once Dunnworks has set up the eBay developer keys.</p>' : !st ? '<p class="help">The eBay link service is not running yet.</p>' : ''}
    </div>
    <div class="card2"><h3>Recent activity</h3><ul class="log" style="list-style:none;padding:0;margin:0">${(log || []).map(l => `<li><b>${esc(l.action)}</b> ${esc(l.detail || '')} <span class="help">${ago(l.at)}</span></li>`).join('') || '<li class="muted">Nothing yet.</li>'}</ul></div>`;
  const call = async (action, btn) => { btn.disabled = true; const { data, error } = await sb.functions.invoke('bsg-ebay-sync', { body: { action, return_to: C.adminUrl } }); btn.disabled = false; if (error || data?.error) return toast((data && data.error) || error.message, true); if (data?.url) { location.href = data.url; return; } toast(data?.message || 'Done'); ebay(); };
  $('#econnect').onclick = e => call('connect', e.currentTarget);
  $('#epull').onclick = e => call('pull', e.currentTarget);
  $('#epush').onclick = e => call('push', e.currentTarget);
}

/* ---------------------------------------------------------------- people (owner) */
async function people() {
  const p = $('#pane');
  const { data } = await sb.from('bsg_editors').select('*').order('created_at');
  p.innerHTML = `<div class="card2" style="max-width:720px"><h3>Who can edit this site</h3>
    <p class="help">Add the person's email here. They then use Set or reset my password on the sign-in page. Dunnworks (info@dunnworks.io) always has access.</p>
    <table class="list" style="margin:12px 0"><tbody>${(data || []).map(e => `<tr><td>${esc(e.name || '')}</td><td>${esc(e.email)}</td><td style="text-align:right"><button class="btn ghost small danger" data-rm="${esc(e.email)}">Remove</button></td></tr>`).join('') || '<tr><td class="muted">Nobody yet.</td></tr>'}</tbody></table>
    <form id="pf" class="row"><input name="name" placeholder="Name"><input name="email" type="email" required placeholder="Email"><button class="btn small">Add</button></form></div>`;
  $('#pf').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target); const { error } = await sb.from('bsg_editors').insert({ email: f.get('email').trim().toLowerCase(), name: f.get('name').trim() || null }); toast(error ? error.message : 'Added', !!error); people(); };
  $$('[data-rm]', p).forEach(b => b.onclick = async () => { const { error } = await sb.from('bsg_editors').delete().eq('email', b.dataset.rm); toast(error ? error.message : 'Removed', !!error); people(); });
}

window.BSGAdmin = { mount };
})();
