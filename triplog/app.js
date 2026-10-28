/* Trip Log — dunnworks.io/triplog
 * Odometer-based private and business mileage log, offline first, synced to Supabase,
 * with a signed PDF report for payroll.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- setup
  const sb = window.supabase.createClient(TL.url, TL.key, {
    auth: { storageKey: 'tl-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const $app = document.getElementById('app');
  const $toast = document.getElementById('toast');

  const state = {
    session: null, user: null, profile: null,
    authView: 'signin', authMsg: '', authErr: '',
    legs: {}, places: {}, outbox: [],
    view: 'log', draft: null,
    month: monthKey(new Date()),
    report: { mode: 'this', from: '', to: '', sig: '', signLater: false },
    syncing: false, lastSync: null, syncErr: '',
    recovery: false
  };

  // ---------------------------------------------------------------- utils
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
  function pad(n) { return String(n).padStart(2, '0'); }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return isoDate(new Date()); }
  function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function fmtDate(s, withDay) { const d = parseISO(s); return (withDay ? DAYS[d.getDay()] + ' ' : '') + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function fmtDay(s) { const d = parseISO(s); return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function fmtMonth(k) { const [y, m] = k.split('-').map(Number); return MONTHS_LONG[m - 1] + ' ' + y; }
  const fmtN = (n) => (n == null || isNaN(n) ? '' : Number(n).toLocaleString('en-GB'));
  function toInt(v) { if (v == null) return null; const s = String(v).replace(/[^\d]/g, ''); return s === '' ? null : parseInt(s, 10); }
  function tidyPlace(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.replace(/\b([A-Za-z]{1,2}\d[A-Za-z\d]?)\s*(\d[A-Za-z]{2})$/, (m, a, b) => a.toUpperCase() + ' ' + b.toUpperCase());
  }
  const miles = (l) => (l.odo_end == null ? 0 : l.odo_end - l.odo_start);
  function toast(msg, ms) {
    $toast.textContent = msg; $toast.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { $toast.hidden = true; }, ms || 2600);
  }
  const ICON = {
    log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    trips: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>',
    report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 14h6M9 18h4"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4M12 2v14"/></svg>'
  };

  // ---------------------------------------------------------------- theme
  function applyTheme() {
    let t = 'dark'; try { t = localStorage.getItem('tl-theme') || 'dark'; } catch (e) {}
    if (t === 'dark') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }
  applyTheme();

  // ---------------------------------------------------------------- local store (per user)
  const key = (k) => 'tl:' + (state.user ? state.user.id : 'anon') + ':' + k;
  function loadLocal() {
    try {
      state.legs = JSON.parse(localStorage.getItem(key('legs')) || '{}');
      state.places = JSON.parse(localStorage.getItem(key('places')) || '{}');
      state.outbox = JSON.parse(localStorage.getItem(key('outbox')) || '[]');
      state.lastSync = localStorage.getItem(key('lastSync'));
    } catch (e) { state.legs = {}; state.places = {}; state.outbox = []; }
  }
  function saveLocal() {
    try {
      localStorage.setItem(key('legs'), JSON.stringify(state.legs));
      localStorage.setItem(key('places'), JSON.stringify(state.places));
      localStorage.setItem(key('outbox'), JSON.stringify(state.outbox));
      if (state.lastSync) localStorage.setItem(key('lastSync'), state.lastSync);
    } catch (e) { toast('Phone storage is full, could not save offline copy'); }
  }
  function cacheProfile() { try { localStorage.setItem(key('profile'), JSON.stringify(state.profile)); } catch (e) {} }
  function cachedProfile() { try { return JSON.parse(localStorage.getItem(key('profile')) || 'null'); } catch (e) { return null; } }

  function queue(table, row) {
    state.outbox = state.outbox.filter((o) => !(o.table === table && o.row.id === row.id));
    state.outbox.push({ table, row });
    saveLocal();
    sync();
  }
  function putLeg(l) { l.updated_at = new Date().toISOString(); state.legs[l.id] = l; queue('tl_legs', l); }
  function putPlace(p) { p.updated_at = new Date().toISOString(); state.places[p.id] = p; queue('tl_places', p); }

  // ---------------------------------------------------------------- sync
  const LEG_COLS = ['id', 'user_id', 'journey_id', 'seq', 'trip_date', 'from_place', 'to_place', 'odo_start', 'odo_end', 'kind', 'purpose', 'deleted', 'updated_at'];
  const PLACE_COLS = ['id', 'user_id', 'label', 'address', 'sort_order', 'deleted', 'updated_at'];
  const pick = (o, cols) => cols.reduce((a, c) => { if (o[c] !== undefined) a[c] = o[c]; return a; }, {});

  async function sync() {
    if (!state.user || !state.profile || state.profile.status !== 'approved') return;
    if (!navigator.onLine) { updateSyncBadge(); return; }
    if (state.syncing) { state.syncAgain = true; return; }
    state.syncing = true; updateSyncBadge();
    try {
      // push
      const batch = state.outbox.slice();
      for (const table of ['tl_places', 'tl_legs']) {
        const rows = batch.filter((o) => o.table === table)
          .map((o) => pick(Object.assign({}, o.row, { user_id: state.user.id }), table === 'tl_legs' ? LEG_COLS : PLACE_COLS));
        if (!rows.length) continue;
        const { error } = await sb.from(table).upsert(rows, { onConflict: 'id' });
        if (error) throw error;
      }
      const sent = new Set(batch.map((o) => o.table + ':' + o.row.id + ':' + o.row.updated_at));
      state.outbox = state.outbox.filter((o) => !sent.has(o.table + ':' + o.row.id + ':' + o.row.updated_at));
      // pull
      const pending = new Set(state.outbox.map((o) => o.row.id));
      const [legsR, placesR] = await Promise.all([
        sb.from('tl_legs').select(LEG_COLS.join(',')).order('trip_date', { ascending: true }).limit(10000),
        sb.from('tl_places').select(PLACE_COLS.join(',')).limit(1000)
      ]);
      if (legsR.error) throw legsR.error;
      if (placesR.error) throw placesR.error;
      const legs = {}; legsR.data.forEach((l) => { legs[l.id] = l; });
      Object.values(state.legs).forEach((l) => { if (pending.has(l.id)) legs[l.id] = l; });
      const places = {}; placesR.data.forEach((p) => { places[p.id] = p; });
      Object.values(state.places).forEach((p) => { if (pending.has(p.id)) places[p.id] = p; });
      state.legs = legs; state.places = places;
      state.lastSync = new Date().toISOString(); state.syncErr = '';
      saveLocal();
    } catch (e) {
      state.syncErr = e.message || String(e);
      console.warn('Sync failed', e);
    } finally {
      state.syncing = false;
      updateSyncBadge();
      if (state.syncAgain) { state.syncAgain = false; setTimeout(sync, 200); }
      else if (!document.querySelector('.sheet-back') && !isTyping()) render();
    }
  }
  function isTyping() { const a = document.activeElement; return a && /INPUT|TEXTAREA|SELECT/.test(a.tagName); }
  function syncLabel() {
    if (!navigator.onLine) return { cls: 'offline', text: state.outbox.length ? state.outbox.length + ' to sync' : 'Offline' };
    if (state.syncing) return { cls: 'pending', text: 'Syncing' };
    if (state.syncErr) return { cls: 'pending', text: 'Sync issue' };
    if (state.outbox.length) return { cls: 'pending', text: state.outbox.length + ' to sync' };
    return { cls: '', text: 'Synced' };
  }
  function updateSyncBadge() {
    const el = document.querySelector('.sync'); if (!el) return;
    const s = syncLabel(); el.className = 'sync ' + s.cls; el.querySelector('span:last-child').textContent = s.text;
  }
  window.addEventListener('online', () => { updateSyncBadge(); sync(); });
  window.addEventListener('offline', updateSyncBadge);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });

  // ---------------------------------------------------------------- derived data
  const liveLegs = () => Object.values(state.legs).filter((l) => !l.deleted);
  const byOdo = (a, b) => a.odo_start - b.odo_start || (a.trip_date < b.trip_date ? -1 : a.trip_date > b.trip_date ? 1 : a.seq - b.seq);
  function openLeg() { return liveLegs().filter((l) => l.odo_end == null).sort(byOdo).pop() || null; }
  function lastLeg() { return liveLegs().sort(byOdo).pop() || null; }
  function lastReading() {
    let max = null;
    liveLegs().forEach((l) => { const r = l.odo_end != null ? l.odo_end : l.odo_start; if (max == null || r > max) max = r; });
    return max;
  }
  function placesList() { return Object.values(state.places).filter((p) => !p.deleted).sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)); }
  // gap (unlogged miles) before each completed leg, by odometer order
  function gapsMap() {
    const out = {}; let prev = null;
    liveLegs().filter((l) => l.odo_end != null).sort(byOdo).forEach((l) => {
      if (prev && l.odo_start > prev.odo_end) out[l.id] = { miles: l.odo_start - prev.odo_end, from: prev.odo_end, to: l.odo_start, prevDate: prev.trip_date };
      prev = l;
    });
    return out;
  }
  function recentPlaceNames() {
    const seen = new Set(); const out = [];
    liveLegs().sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).forEach((l) => {
      [l.to_place, l.from_place].forEach((p) => { if (p && !seen.has(p.toLowerCase())) { seen.add(p.toLowerCase()); out.push(p); } });
    });
    const fav = new Set(placesList().map((p) => p.address.toLowerCase()));
    return out.filter((p) => !fav.has(p.toLowerCase())).slice(0, 6);
  }

  // ---------------------------------------------------------------- auth + boot
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { state.recovery = true; state.session = session; state.user = session && session.user; render(); }
    if (event === 'SIGNED_OUT') { state.session = null; state.user = null; state.profile = null; render(); }
    if (event === 'TOKEN_REFRESHED' && session) state.session = session;
  });

  async function boot() {
    const { data } = await sb.auth.getSession();
    state.session = data.session; state.user = data.session ? data.session.user : null;
    if (!state.user) { render(); return; }
    await afterSignIn();
  }

  async function afterSignIn() {
    loadLocal();
    await loadProfile();
    if (state.profile && state.profile.status === 'approved') { sync(); }
    render();
  }

  async function loadProfile() {
    if (!navigator.onLine) { state.profile = cachedProfile(); return; }
    const { data, error } = await sb.from('tl_profiles').select('*').eq('user_id', state.user.id).maybeSingle();
    if (error) { state.profile = cachedProfile(); state.profileErr = error.message; return; }
    state.profileErr = '';
    state.profile = data; cacheProfile();
  }

  async function notify(body) {
    try {
      await fetch(TL.url + '/functions/v1/' + TL.notifyFn, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: TL.key, Authorization: 'Bearer ' + ((state.session && state.session.access_token) || TL.key) },
        body: JSON.stringify(body)
      });
    } catch (e) { /* the request still sits in the admin list */ }
  }

  // ---------------------------------------------------------------- render
  function render() {
    if (state.recovery) { $app.innerHTML = authShell(viewRecovery()); return; }
    if (!state.user) { $app.innerHTML = authShell(authView()); return; }
    if (!state.profile) { $app.innerHTML = authShell(viewNoProfile()); return; }
    if (state.profile.status === 'pending') { $app.innerHTML = authShell(viewPending()); return; }
    if (state.profile.status === 'rejected') { $app.innerHTML = authShell(viewRejected()); return; }
    const s = syncLabel();
    const views = { log: viewLog, trips: viewTrips, report: viewReport, settings: viewSettings };
    const titles = { log: 'Trip Log', trips: 'Trips', report: 'Report', settings: 'You' };
    $app.innerHTML =
      '<header class="topbar"><div class="title"><img src="icons/icon-192.png" alt=""><h1>' + titles[state.view] + '</h1></div>' +
      '<button class="sync ' + s.cls + '" data-act="syncNow" aria-label="Sync now"><span class="dot"></span><span>' + s.text + '</span></button></header>' +
      '<main>' + views[state.view]() + '</main>' +
      '<nav class="tabs" aria-label="Sections">' + ['log', 'trips', 'report', 'settings'].map((v) =>
        '<button data-act="tab" data-v="' + v + '"' + (state.view === v ? ' aria-current="page"' : '') + '>' + ICON[v] + '<span>' + { log: 'Log', trips: 'Trips', report: 'Report', settings: 'You' }[v] + '</span></button>').join('') + '</nav>';
    if (state.view === 'report') initSignature();
  }

  function authShell(inner) {
    return '<main class="auth"><div class="brand-head"><img src="icons/icon-192.png" alt=""><h1>Trip Log</h1><p class="muted">Private and work mileage, logged by odometer and sent to payroll as a signed PDF.</p></div>' + inner + '</main>';
  }
  function msgs() {
    return (state.authErr ? '<div class="notice bad">' + esc(state.authErr) + '</div>' : '') +
      (state.authMsg ? '<div class="notice info">' + esc(state.authMsg) + '</div>' : '');
  }

  function authView() {
    if (state.authView === 'register') {
      return '<form class="card" data-form="register" autocomplete="on"><h2>Register</h2>' + msgs() +
        '<p class="small muted">Your request goes to the administrator to approve. You can sign in as soon as it is approved.</p>' +
        fieldI('Full name', 'full_name', 'text', '', 'name', true) +
        fieldI('Email', 'email', 'email', '', 'email', true) +
        fieldI('Password', 'password', 'password', '', 'new-password', true, 'At least 8 characters') +
        fieldI('Confirm password', 'password2', 'password', '', 'new-password', true) +
        '<details><summary>Report details (optional, add later if you like)</summary><div class="actions">' +
        fieldI('Employee number', 'employee_no', 'text', '', 'off') +
        fieldI('Vehicle registration', 'vehicle_reg', 'text', '', 'off') +
        fieldI('Manager name', 'manager_name', 'text', '', 'off') +
        fieldI('Employer', 'employer', 'text', '', 'organization') + '</div></details>' +
        '<button class="btn primary block" type="submit">Send registration</button>' +
        '<button class="linkish" type="button" data-act="authView" data-v="signin">Already approved? Sign in</button></form>';
    }
    if (state.authView === 'forgot') {
      return '<form class="card" data-form="forgot"><h2>Reset password</h2>' + msgs() +
        fieldI('Email', 'email', 'email', '', 'email', true) +
        '<button class="btn primary block" type="submit">Email me a reset link</button>' +
        '<button class="linkish" type="button" data-act="authView" data-v="signin">Back to sign in</button></form>';
    }
    return '<form class="card" data-form="signin" autocomplete="on"><h2>Sign in</h2>' + msgs() +
      fieldI('Email', 'email', 'email', '', 'username', true) +
      fieldI('Password', 'password', 'password', '', 'current-password', true) +
      '<button class="btn primary block" type="submit">Sign in</button>' +
      '<div class="row2"><button class="linkish" type="button" data-act="authView" data-v="register">Register</button>' +
      '<button class="linkish" type="button" data-act="authView" data-v="forgot" style="text-align:right">Forgot password</button></div></form>';
  }
  function viewRecovery() {
    return '<form class="card" data-form="newpass"><h2>Choose a new password</h2>' + msgs() +
      fieldI('New password', 'password', 'password', '', 'new-password', true, 'At least 8 characters') +
      '<button class="btn primary block" type="submit">Save password</button></form>';
  }
  function viewPending() {
    return '<div class="card"><h2>Waiting for approval</h2>' + msgs() +
      '<p>Thanks' + (state.profile.full_name ? ', ' + esc(state.profile.full_name.split(' ')[0]) : '') + '. Your registration for <b>' + esc(state.profile.email) + '</b> is with the administrator.</p>' +
      '<p class="muted small">Once approved you can start logging straight away. Nobody else, including the administrator, can see your trips.</p>' +
      '<button class="btn primary block" data-act="recheck">Check again</button>' +
      '<button class="btn block" data-act="signout">Sign out</button></div>';
  }
  function viewRejected() {
    return '<div class="card"><h2>Access not approved</h2><p>Your registration for ' + esc(state.profile.email) + ' was not approved. Speak to whoever pointed you to Trip Log if you think that is a mistake.</p>' +
      '<button class="btn block" data-act="signout">Sign out</button></div>';
  }
  function viewNoProfile() {
    if (state.profileErr) {
      return '<div class="card"><h2>Can\'t reach Trip Log</h2><div class="notice bad">' + esc(state.profileErr) + '</div>' +
        '<button class="btn primary block" data-act="recheck">Try again</button><button class="btn block" data-act="signout">Sign out</button></div>';
    }
    return '<form class="card" data-form="request"><h2>Request access</h2>' + msgs() +
      '<p>You are signed in as <b>' + esc(state.user.email) + '</b> but have not registered for Trip Log yet.</p>' +
      fieldI('Full name', 'full_name', 'text', (state.user.user_metadata || {}).full_name || '', 'name', true) +
      '<button class="btn primary block" type="submit">Send request</button>' +
      '<button class="btn block" type="button" data-act="signout">Sign out</button></form>';
  }

  function fieldI(label, name, type, val, ac, req, hint, extra) {
    return '<label class="field"><span>' + esc(label) + (hint ? ' <span class="hint">' + esc(hint) + '</span>' : '') + '</span>' +
      '<input type="' + type + '" name="' + name + '" value="' + esc(val) + '"' + (ac ? ' autocomplete="' + ac + '"' : '') + (req ? ' required' : '') + (extra || '') + '></label>';
  }

  // ---------------------------------------------------------------- Log view
  function newDraft(base) {
    const last = lastLeg();
    return Object.assign({
      journey_id: uuid(), seq: 1, trip_date: today(),
      kind: last ? last.kind : 'business',
      from_place: last && last.to_place ? last.to_place : (placesList()[0] ? placesList()[0].address : ''),
      to_place: '', odo_start: lastReading(), odo_end: null, purpose: ''
    }, base || {});
  }

  function placeChips(target) {
    const favs = placesList();
    const recent = recentPlaceNames();
    if (!favs.length && !recent.length) return '';
    return '<div class="chips" role="group" aria-label="Quick places">' +
      favs.map((p) => '<button type="button" class="chip fav" data-act="fill" data-t="' + target + '" data-val="' + esc(p.address) + '">★ ' + esc(p.label) + '</button>').join('') +
      recent.map((p) => '<button type="button" class="chip" data-act="fill" data-t="' + target + '" data-val="' + esc(p) + '">' + esc(p) + '</button>').join('') + '</div>';
  }

  function installBanner() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    let dismissed = false; try { dismissed = localStorage.getItem('tl-install-dismissed') === '1'; } catch (e) {}
    if (standalone || dismissed) return '';
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return '<div class="notice info"><b>Put Trip Log on your home screen</b><span class="small">' +
      (ios ? 'Tap the Share button in Safari, then Add to Home Screen.' : 'Open your browser menu and choose Add to Home screen or Install app.') +
      ' It then opens like an app and works with no signal.</span><button class="btn" data-act="dismissInstall">Got it</button></div>';
  }

  function viewLog() {
    const open = openLeg();
    let html = installBanner();
    if (open) {
      html += '<section class="card live"><div class="card-head"><span class="pill open">On the road</span><span class="pill ' + open.kind + '">' + (open.kind === 'private' ? 'Private' : 'Work') + '</span></div>' +
        '<p class="route">' + esc(open.from_place) + (open.to_place ? ' to ' + esc(open.to_place) : '') + '</p>' +
        '<p class="muted small">Started ' + fmtDay(open.trip_date) + ' at <span class="num">' + fmtN(open.odo_start) + '</span> miles</p>' +
        '<form data-form="arrive" class="actions">' +
        (open.to_place ? '' : '<label class="field"><span>Where did you go?</span><input type="text" name="to_place" autocomplete="off" required placeholder="Road name or postcode"></label>' + placeChips('arrive_to')) +
        '<label class="field"><span>Odometer now</span><input name="odo_end" inputmode="numeric" pattern="[0-9,]*" autocomplete="off" required placeholder="e.g. ' + fmtN(open.odo_start + 12) + '"></label>' +
        '<button class="btn primary block big" type="submit">' + ICON.done + 'Arrived</button>' +
        '<button class="btn ghost" type="button" data-act="cancelOpen">Cancel this journey</button></form></section>';
      return html;
    }
    if (!state.draft) state.draft = newDraft();
    const d = state.draft;
    const lr = lastReading();
    let warn = '';
    if (lr != null && d.odo_start != null && d.odo_start > lr) {
      warn = '<div class="notice warn"><span><b>' + fmtN(d.odo_start - lr) + ' miles</b> not logged since your last reading of <span class="num">' + fmtN(lr) + '</span>. Unlogged miles usually get treated as private.</span>' +
        '<button type="button" class="btn" data-act="logGap">Log the missing trip</button></div>';
    } else if (lr != null && d.odo_start != null && d.odo_start < lr) {
      warn = '<div class="notice bad">That start reading is lower than your last reading of <span class="num">' + fmtN(lr) + '</span>. Check the odometer.</div>';
    }
    html += heroCard();
    html += '<form class="card" data-form="leg" autocomplete="off">' +
      '<div class="card-head"><h2>' + (d.seq > 1 ? 'Next stop' : 'New journey') + '</h2>' + (d.seq > 1 ? '<span class="muted small">Leg ' + d.seq + '</span>' : '') + '</div>' +
      '<div class="seg" role="group" aria-label="Trip type">' +
      '<button type="button" class="private" data-act="kind" data-v="private" aria-pressed="' + (d.kind === 'private') + '">Private</button>' +
      '<button type="button" class="business" data-act="kind" data-v="business" aria-pressed="' + (d.kind === 'business') + '">Work</button></div>' +
      '<label class="field"><span>Date</span><input type="date" data-bind="trip_date" value="' + esc(d.trip_date) + '" max="' + today() + '" required></label>' +
      '<label class="field"><span>From <span class="hint">road name or postcode</span></span><input type="text" id="f_from" data-bind="from_place" value="' + esc(d.from_place) + '" required placeholder="e.g. Station Road, GU35 0AA"></label>' +
      placeChips('from_place') +
      '<label class="field"><span>To</span><input type="text" id="f_to" data-bind="to_place" value="' + esc(d.to_place) + '" placeholder="e.g. Tesco, GU34 2QR"></label>' +
      placeChips('to_place') +
      '<div class="row2"><label class="field"><span>Odometer start</span><input id="f_os" data-bind="odo_start" inputmode="numeric" pattern="[0-9,]*" value="' + (d.odo_start == null ? '' : d.odo_start) + '" required placeholder="Miles"></label>' +
      '<label class="field"><span>Odometer end</span><input id="f_oe" data-bind="odo_end" inputmode="numeric" pattern="[0-9,]*" value="' + (d.odo_end == null ? '' : d.odo_end) + '" placeholder="Add on arrival"></label></div>' +
      warn +
      '<label class="field"><span>' + (d.kind === 'business' ? 'Reason for journey' : 'Note') + ' <span class="hint">optional</span></span><input type="text" data-bind="purpose" value="' + esc(d.purpose) + '" placeholder="' + (d.kind === 'business' ? 'e.g. Site visit, ref 1234' : 'e.g. School run') + '"></label>' +
      '<p class="small muted" id="legHint">' + legHint(d) + '</p>' +
      '<button class="btn primary block big" type="submit" id="legBtn">' + (d.odo_end == null ? 'Start journey' : 'Save leg') + '</button>' +
      (d.seq > 1 ? '<button class="btn ghost" type="button" data-act="finishJourney">Finish journey here</button>' : '') +
      '</form>';
    return html;
  }
  function odoDigits(n) {
    if (n == null) return '<span>-</span><span>-</span><span>-</span><span>-</span><span>-</span>';
    return fmtN(n).split('').map((c) => c === ',' ? '<span class="sep">,</span>' : '<span>' + c + '</span>').join('');
  }
  function heroCard() {
    const mk = monthKey(new Date());
    const legs = liveLegs().filter((l) => l.trip_date.slice(0, 7) === mk && l.odo_end != null);
    const p = legs.filter((l) => l.kind === 'private').reduce((a, l) => a + miles(l), 0);
    const b = legs.filter((l) => l.kind === 'business').reduce((a, l) => a + miles(l), 0);
    const lr = lastReading();
    return '<section class="hero"><div class="k">' + (lr == null ? 'First trip? Read the odometer' : 'Last odometer reading') + '</div>' +
      '<div class="odo" aria-label="' + (lr == null ? 'No reading yet' : fmtN(lr) + ' miles') + '">' + odoDigits(lr) + '<small>miles</small></div>' +
      '<div class="stat-row"><div class="stat private"><span class="v">' + fmtN(p) + '</span><span class="k">private in ' + MONTHS[new Date().getMonth()] + '</span></div>' +
      '<div class="stat business"><span class="v">' + fmtN(b) + '</span><span class="k">work in ' + MONTHS[new Date().getMonth()] + '</span></div></div></section>';
  }
  function legHint(d) {
    if (d.odo_end != null && d.odo_start != null) {
      const m = d.odo_end - d.odo_start;
      return m >= 0 ? 'That leg is <b>' + fmtN(m) + ' miles</b>.' : 'End reading is lower than start.';
    }
    return 'Leave the end reading blank to start now, then tap Arrived when you get there. Never fill this in while driving.';
  }
  function saveDraftLeg() {
    const d = state.draft;
    const from = tidyPlace(d.from_place), to = tidyPlace(d.to_place);
    const os = toInt(d.odo_start), oe = toInt(d.odo_end);
    if (!from) return toast('Add where you set off from');
    if (os == null) return toast('Add the odometer start reading');
    if (oe != null) {
      if (!to) return toast('Add where you went to');
      if (oe < os) return toast('End reading is lower than start');
      if (oe - os > 600 && !confirm(fmtN(oe - os) + ' miles in one leg. Is that right?')) return;
    }
    if (d.trip_date > today()) return toast('Date cannot be in the future');
    const leg = {
      id: uuid(), journey_id: d.journey_id, seq: d.seq, trip_date: d.trip_date,
      from_place: from, to_place: to, odo_start: os, odo_end: oe, kind: d.kind,
      purpose: (d.purpose || '').trim() || null, deleted: false
    };
    putLeg(leg);
    if (oe == null) { state.draft = null; render(); toast('Journey started. Drive safe'); window.scrollTo(0, 0); return; }
    afterLeg(leg);
  }

  function afterLeg(leg) {
    state.draft = null;
    render();
    openSheet('<div class="grab"></div><h2>' + fmtN(miles(leg)) + ' miles saved</h2>' +
      '<p class="muted">' + esc(leg.from_place) + ' to ' + esc(leg.to_place) + ', ' + (leg.kind === 'private' ? 'private' : 'work') + '</p>' +
      '<div class="actions three">' +
      '<button class="btn" data-act="nextStop" data-id="' + leg.id + '">' + ICON.next + 'Next stop</button>' +
      '<button class="btn" data-act="returnTrip" data-id="' + leg.id + '">' + ICON.back + 'Return trip</button>' +
      '<button class="btn primary" data-act="closeSheet">' + ICON.done + 'Done</button></div>');
  }

  // ---------------------------------------------------------------- Trips view
  function viewTrips() {
    const mk = state.month;
    const legs = liveLegs().filter((l) => l.trip_date.slice(0, 7) === mk);
    const done = legs.filter((l) => l.odo_end != null);
    const p = done.filter((l) => l.kind === 'private').reduce((a, l) => a + miles(l), 0);
    const b = done.filter((l) => l.kind === 'business').reduce((a, l) => a + miles(l), 0);
    const gaps = gapsMap();
    const gapTotal = done.reduce((a, l) => a + (gaps[l.id] ? gaps[l.id].miles : 0), 0);
    let html = '<section class="card"><div class="card-head" style="align-items:center">' +
      '<button class="icon-btn" data-act="month" data-d="-1" aria-label="Previous month">' + ICON.left + '</button><h2>' + fmtMonth(mk) + '</h2>' +
      '<button class="icon-btn" data-act="month" data-d="1" aria-label="Next month"' + (mk >= monthKey(new Date()) ? ' disabled' : '') + '>' + ICON.right + '</button></div>' +
      '<div class="stat-row"><div class="stat private"><span class="v">' + fmtN(p) + '</span><span class="k">private miles</span></div>' +
      '<div class="stat business"><span class="v">' + fmtN(b) + '</span><span class="k">work miles</span></div></div>' +
      (gapTotal ? '<div class="notice warn">' + fmtN(gapTotal) + ' miles this month fall between readings and are not logged. They are flagged in yellow below.</div>' : '') +
      '<button class="btn block" data-act="addPast">Add a trip you forgot</button></section>';
    if (!legs.length) return html + '<div class="empty"><p>No trips in ' + fmtMonth(mk) + '.</p></div>';
    // group by date desc, then journey
    const byDate = {};
    legs.forEach((l) => { (byDate[l.trip_date] = byDate[l.trip_date] || []).push(l); });
    Object.keys(byDate).sort().reverse().forEach((date) => {
      const dl = byDate[date];
      const dayMiles = dl.reduce((a, l) => a + miles(l), 0);
      const journeys = {};
      dl.forEach((l) => { (journeys[l.journey_id] = journeys[l.journey_id] || []).push(l); });
      html += '<section class="day"><div class="day-head"><span>' + fmtDay(date) + '</span><span>' + fmtN(dayMiles) + ' mi</span></div>';
      Object.values(journeys).sort((a, b) => Math.min(...a.map((x) => x.odo_start)) - Math.min(...b.map((x) => x.odo_start))).forEach((j) => {
        html += '<div class="journey">';
        j.sort((a, b) => a.seq - b.seq || a.odo_start - b.odo_start).forEach((l) => {
          if (gaps[l.id]) html += '<div class="gapline">' + fmtN(gaps[l.id].miles) + ' miles unlogged (' + fmtN(gaps[l.id].from) + ' to ' + fmtN(gaps[l.id].to) + ')</div>';
          html += '<button class="leg ' + l.kind + '" data-act="editLeg" data-id="' + l.id + '"><span class="bar"></span><span><span class="where">' + esc(l.from_place) + ' to ' + esc(l.to_place || '…') + '</span>' +
            '<span class="meta" style="display:block">' + (l.kind === 'private' ? 'Private' : 'Work') + ' · <span class="num">' + fmtN(l.odo_start) + '–' + (l.odo_end == null ? 'on the road' : fmtN(l.odo_end)) + '</span>' + (l.purpose ? ' · ' + esc(l.purpose) : '') + '</span></span>' +
            '<span class="mi">' + (l.odo_end == null ? '<span class="pill open">Open</span>' : fmtN(miles(l)) + '<small>miles</small>') + '</span></button>';
        });
        html += '</div>';
      });
      html += '</section>';
    });
    return html;
  }

  function legSheet(l, isNew) {
    return '<div class="grab"></div><h2>' + (isNew ? 'Add a trip' : 'Edit trip') + '</h2>' +
      '<form data-form="editLeg" data-id="' + (isNew ? '' : l.id) + '" class="actions" autocomplete="off">' +
      '<div class="seg" role="group" aria-label="Trip type"><button type="button" class="private" data-act="kindSheet" data-v="private" aria-pressed="' + (l.kind === 'private') + '">Private</button>' +
      '<button type="button" class="business" data-act="kindSheet" data-v="business" aria-pressed="' + (l.kind === 'business') + '">Work</button></div>' +
      '<input type="hidden" name="kind" value="' + l.kind + '">' +
      '<label class="field"><span>Date</span><input type="date" name="trip_date" value="' + esc(l.trip_date) + '" max="' + today() + '" required></label>' +
      '<label class="field"><span>From</span><input type="text" name="from_place" value="' + esc(l.from_place) + '" required></label>' +
      '<label class="field"><span>To</span><input type="text" name="to_place" value="' + esc(l.to_place) + '" required></label>' +
      '<div class="row2"><label class="field"><span>Odometer start</span><input name="odo_start" inputmode="numeric" value="' + (l.odo_start == null ? '' : l.odo_start) + '" required></label>' +
      '<label class="field"><span>Odometer end</span><input name="odo_end" inputmode="numeric" value="' + (l.odo_end == null ? '' : l.odo_end) + '" required></label></div>' +
      '<label class="field"><span>Reason or note <span class="hint">optional</span></span><input type="text" name="purpose" value="' + esc(l.purpose || '') + '"></label>' +
      '<button class="btn primary block" type="submit">Save</button>' +
      (isNew ? '' : '<button class="btn danger block" type="button" data-act="deleteLeg" data-id="' + l.id + '">' + ICON.del + 'Delete trip</button>') +
      '<button class="btn ghost" type="button" data-act="closeSheet">Cancel</button></form>';
  }

  // ---------------------------------------------------------------- Report view
  function reportRange() {
    const r = state.report; const now = new Date();
    if (r.mode === 'this') return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
    if (r.mode === 'last') return { from: isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: isoDate(new Date(now.getFullYear(), now.getMonth(), 0)) };
    if (r.mode === 'week') { const d = new Date(now); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day - 7); const e = new Date(d); e.setDate(d.getDate() + 6); return { from: isoDate(d), to: isoDate(e) }; }
    return { from: r.from || today(), to: r.to || today() };
  }
  function reportData() {
    const { from, to } = reportRange();
    const inRange = liveLegs().filter((l) => l.trip_date >= from && l.trip_date <= to);
    const done = inRange.filter((l) => l.odo_end != null).sort((a, b) => (a.trip_date < b.trip_date ? -1 : a.trip_date > b.trip_date ? 1 : a.odo_start - b.odo_start));
    const open = inRange.filter((l) => l.odo_end == null);
    const gm = gapsMap();
    const gaps = done.filter((l) => gm[l.id]).map((l) => Object.assign({ date: l.trip_date }, gm[l.id]));
    const priv = done.filter((l) => l.kind === 'private');
    const bus = done.filter((l) => l.kind === 'business');
    const sum = (a) => a.reduce((t, l) => t + miles(l), 0);
    const odoFirst = done.length ? Math.min(...done.map((l) => l.odo_start)) : null;
    const odoLast = done.length ? Math.max(...done.map((l) => l.odo_end)) : null;
    return { from, to, done, open, priv, bus, gaps, pMiles: sum(priv), bMiles: sum(bus), gapMiles: gaps.reduce((t, g) => t + g.miles, 0), odoFirst, odoLast };
  }
  function viewReport() {
    const r = state.report; const d = reportData(); const p = state.profile;
    const missing = ['full_name', 'employee_no', 'vehicle_reg', 'manager_name'].filter((k) => !p[k]);
    const labels = { full_name: 'name', employee_no: 'employee number', vehicle_reg: 'vehicle registration', manager_name: 'manager' };
    let html = '<section class="card"><h2>Period</h2><div class="seg wide" role="group" aria-label="Report period">' +
      [['this', 'This month'], ['last', 'Last month'], ['week', 'Last week'], ['custom', 'Custom']].map(([v, t]) =>
        '<button type="button" data-act="rmode" data-v="' + v + '" aria-pressed="' + (r.mode === v) + '">' + t + '</button>').join('') + '</div>' +
      (r.mode === 'custom' ? '<div class="row2"><label class="field"><span>From</span><input type="date" data-rbind="from" value="' + esc(d.from) + '"></label><label class="field"><span>To</span><input type="date" data-rbind="to" value="' + esc(d.to) + '"></label></div>' : '') +
      '<p class="muted small">' + fmtDate(d.from) + ' to ' + fmtDate(d.to) + '</p>' +
      '<div class="stat-row"><div class="stat private"><span class="v">' + fmtN(d.pMiles) + '</span><span class="k">private miles · ' + d.priv.length + ' legs</span></div>' +
      '<div class="stat business"><span class="v">' + fmtN(d.bMiles) + '</span><span class="k">work miles · ' + d.bus.length + ' legs</span></div></div>' +
      (d.gapMiles ? '<div class="notice warn">' + fmtN(d.gapMiles) + ' miles between readings are not logged. They will be listed on the report as unrecorded, so log them first if you can.</div>' : '') +
      (d.open.length ? '<div class="notice warn">' + d.open.length + ' journey still open in this period. Finish it on the Log tab or it will be left off.</div>' : '') +
      '</section>';
    html += '<section class="card"><div class="card-head"><h2>Your details</h2><button class="linkish" data-act="tab" data-v="settings">Edit</button></div>' +
      '<div class="small" style="display:grid;gap:4px">' +
      detailRow('Name', p.full_name) + detailRow('Employee number', p.employee_no) + detailRow('Vehicle', p.vehicle_reg) + detailRow('Manager', p.manager_name) + (p.employer ? detailRow('Employer', p.employer) : '') + '</div>' +
      (missing.length ? '<div class="notice warn">Add your ' + missing.map((k) => labels[k]).join(', ') + ' so the report is complete.</div>' : '') + '</section>';
    html += '<section class="card"><h2>Declaration</h2><p class="small">' + esc(declarationText(p)) + '</p>' +
      '<label class="field" style="grid-template-columns:auto 1fr;align-items:center;gap:10px"><input type="checkbox" data-act="signLater"' + (r.signLater ? ' checked' : '') + ' style="width:22px;height:22px"><span style="font-weight:400">Leave a blank line to sign on paper instead</span></label>' +
      (r.signLater ? '' : '<div class="label">Sign below with your finger</div><div class="sig-wrap"><canvas id="sig" aria-label="Signature pad"></canvas><div class="sig-line"></div><div class="sig-hint" id="sigHint"' + (r.sig ? ' hidden' : '') + '>Sign here</div></div>' +
        '<button class="btn ghost" data-act="clearSig" style="justify-self:start">Clear signature</button>') +
      '<button class="btn primary block big" data-act="makePdf"' + (d.done.length ? '' : ' disabled') + '>' + ICON.share + 'Create PDF</button>' +
      (d.done.length ? '' : '<p class="small muted">No completed trips in this period yet.</p>') + '</section>';
    return html;
  }
  function detailRow(k, v) { return '<div style="display:flex;justify-content:space-between;gap:12px"><span class="muted">' + k + '</span><span style="text-align:right">' + (v ? esc(v) : '<span class="muted">Not set</span>') + '</span></div>'; }
  function declarationText(p) {
    return 'I declare that this is a true and complete record of the private and business mileage driven in vehicle ' +
      (p.vehicle_reg || '[registration]') + ' during the period shown, and that private mileage is recorded so the cost of private fuel can be recovered from my pay.';
  }

  // signature pad
  function initSignature() {
    const c = document.getElementById('sig'); if (!c) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = c.getBoundingClientRect();
    c.width = rect.width * ratio; c.height = rect.height * ratio;
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#10213f';
    if (state.report.sig) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height); img.src = state.report.sig; }
    let drawing = false, last = null;
    const pos = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    c.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); c.setPointerCapture(e.pointerId); const h = document.getElementById('sigHint'); if (h) h.hidden = true; e.preventDefault(); });
    c.addEventListener('pointermove', (e) => {
      if (!drawing) return; const p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; e.preventDefault();
    });
    const end = () => { if (!drawing) return; drawing = false; state.report.sig = c.toDataURL('image/png'); };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end); c.addEventListener('pointerleave', end);
  }

  // PDF
  const ascii = (s) => String(s == null ? '' : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7E£]/g, '');
  function buildPdf() {
    const { jsPDF } = window.jspdf;
    const d = reportData(); const p = state.profile;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), M = 14;
    const teal = [112, 0, 255], amber = [211, 36, 111], grey = [96, 94, 112];
    // header band: Funworks near-black with a magenta-to-violet stripe
    doc.setFillColor(8, 8, 12); doc.rect(0, 0, W, 26, 'F');
    for (let i = 0; i < 60; i++) { const t = i / 59; doc.setFillColor(Math.round(211 + (112 - 211) * t), Math.round(36 * (1 - t)), Math.round(111 + (255 - 111) * t)); doc.rect(W * t, 26, W / 59 + 0.3, 1.6, 'F'); }
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
    doc.text('Vehicle mileage log', M, 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text('Private and business journeys, recorded by odometer', M, 20);
    doc.text(fmtDate(d.from) + ' to ' + fmtDate(d.to), W - M, 13, { align: 'right' });
    doc.setTextColor(21, 19, 29);

    doc.autoTable({
      startY: 34, theme: 'plain', margin: { left: M, right: M },
      styles: { fontSize: 10, cellPadding: { top: 1.2, bottom: 1.2, left: 0, right: 2 } },
      columnStyles: { 0: { textColor: grey, cellWidth: 38 }, 1: { fontStyle: 'bold', cellWidth: 55 }, 2: { textColor: grey, cellWidth: 38 }, 3: { fontStyle: 'bold' } },
      body: [
        ['Name', ascii(p.full_name || ''), 'Employee number', ascii(p.employee_no || '')],
        ['Vehicle registration', ascii(p.vehicle_reg || ''), 'Manager', ascii(p.manager_name || '')],
        ['Employer', ascii(p.employer || ''), 'Report period', fmtDate(d.from) + ' - ' + fmtDate(d.to)]
      ]
    });

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 5, margin: { left: M, right: M }, theme: 'grid',
      headStyles: { fillColor: [240, 238, 246], textColor: [21, 19, 29], fontStyle: 'bold' },
      styles: { fontSize: 10, lineColor: [227, 224, 236], lineWidth: 0.2 },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      head: [['Summary', 'Miles']],
      body: [
        [{ content: 'Private miles (to be deducted)', styles: { textColor: amber, fontStyle: 'bold' } }, { content: fmtN(d.pMiles), styles: { textColor: amber } }],
        ['Business miles', fmtN(d.bMiles)],
        ['Total miles logged', fmtN(d.pMiles + d.bMiles)],
        ['Unrecorded miles between readings', fmtN(d.gapMiles)],
        ['Odometer at first journey / last journey', fmtN(d.odoFirst) + ' / ' + fmtN(d.odoLast)]
      ]
    });

    const legTable = (title, rows, colour, noteHead) => {
      let y = doc.lastAutoTable.finalY + 9;
      if (y > 260) { doc.addPage(); y = 18; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...colour);
      doc.text(title, M, y); doc.setTextColor(21, 19, 29);
      const total = rows.reduce((t, l) => t + miles(l), 0);
      doc.autoTable({
        startY: y + 2.5, margin: { left: M, right: M }, theme: 'striped',
        headStyles: { fillColor: colour, textColor: 255, fontSize: 9 },
        footStyles: { fillColor: [240, 238, 246], textColor: [21, 19, 29], fontStyle: 'bold' },
        styles: { fontSize: 8.5, cellPadding: 1.8, overflow: 'linebreak', valign: 'top' },
        columnStyles: { 0: { cellWidth: 19 }, 3: { halign: 'right', cellWidth: 17 }, 4: { halign: 'right', cellWidth: 17 }, 5: { halign: 'right', cellWidth: 13, fontStyle: 'bold' } },
        head: [['Date', 'From', 'To', 'Odo start', 'Odo end', 'Miles', noteHead]],
        didParseCell: (c) => { if ([3, 4, 5].includes(c.column.index)) c.cell.styles.halign = 'right'; },
        body: rows.length ? rows.map((l) => [l.trip_date.split('-').reverse().join('/'), ascii(l.from_place), ascii(l.to_place), fmtN(l.odo_start), fmtN(l.odo_end), fmtN(miles(l)), ascii(l.purpose || '')])
          : [[{ content: 'None in this period', colSpan: 7, styles: { textColor: grey, halign: 'center' } }]],
        foot: [[{ content: 'Total', colSpan: 5 }, { content: fmtN(total), styles: { halign: 'right' } }, '']]
      });
    };
    legTable('1. Private journeys', d.priv, amber, 'Note');
    legTable('2. Business journeys', d.bus, teal, 'Purpose');

    if (d.gaps.length) {
      let y = doc.lastAutoTable.finalY + 9; if (y > 260) { doc.addPage(); y = 18; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('3. Unrecorded miles', M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...grey);
      doc.text('Miles on the odometer between one logged journey and the next that were not recorded as a journey.', M, y + 5);
      doc.setTextColor(21, 19, 29);
      doc.autoTable({
        startY: y + 7.5, margin: { left: M, right: M }, theme: 'striped',
        headStyles: { fillColor: grey, textColor: 255, fontSize: 9 }, styles: { fontSize: 8.5, cellPadding: 1.8 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } },
        didParseCell: (c) => { if (c.column.index > 0) c.cell.styles.halign = 'right'; },
        head: [['Before journey on', 'Previous reading', 'Next reading', 'Miles']],
        body: d.gaps.map((g) => [fmtDate(g.date), fmtN(g.from), fmtN(g.to), fmtN(g.miles)])
      });
    }

    // declaration
    let y = doc.lastAutoTable.finalY + 12;
    if (y > 235) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Declaration', M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const lines = doc.splitTextToSize(ascii(declarationText(p)), W - 2 * M);
    doc.text(lines, M, y + 6);
    y += 6 + lines.length * 4.6 + 4;
    doc.setDrawColor(150); doc.setLineWidth(0.3);
    if (!state.report.signLater && state.report.sig) {
      try { doc.addImage(state.report.sig, 'PNG', M, y, 62, 62 * 160 / 340); } catch (e) {}
    }
    const sy = y + 26;
    doc.line(M, sy, M + 80, sy); doc.line(M + 100, sy, W - M, sy);
    doc.setFontSize(9); doc.setTextColor(...grey);
    doc.text('Signed: ' + ascii(p.full_name || ''), M, sy + 4.5);
    doc.text('Date', M + 100, sy + 4.5);
    doc.setTextColor(21, 19, 29); doc.setFontSize(10);
    if (!state.report.signLater && state.report.sig) doc.text(fmtDate(today()), M + 100, sy - 2);

    // footer
    const n = doc.getNumberOfPages(); const stamp = new Date();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(...grey);
      doc.text('Generated with Trip Log on ' + fmtDate(today()) + ' at ' + pad(stamp.getHours()) + ':' + pad(stamp.getMinutes()), M, 289);
      doc.text('Page ' + i + ' of ' + n, W - M, 289, { align: 'right' });
    }
    const fname = ('Mileage log - ' + ascii(p.full_name || 'Trip Log') + ' - ' + d.from + ' to ' + d.to + '.pdf').replace(/[\\/:*?"<>|]/g, '');
    return { blob: doc.output('blob'), fname };
  }

  async function sharePdf(blob, fname) {
    const file = new File([blob], fname, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: fname }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    downloadPdf(blob, fname);
  }
  function downloadPdf(blob, fname) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  // ---------------------------------------------------------------- Settings view
  function viewSettings() {
    const p = state.profile;
    let theme = 'dark'; try { theme = localStorage.getItem('tl-theme') || 'dark'; } catch (e) {}
    const places = placesList();
    return '<form class="card" data-form="profile" autocomplete="on"><h2>Your details</h2><p class="small muted">These go on the top of every report.</p>' +
      fieldI('Full name', 'full_name', 'text', p.full_name || '', 'name', true) +
      fieldI('Employee number', 'employee_no', 'text', p.employee_no || '', 'off') +
      fieldI('Vehicle registration', 'vehicle_reg', 'text', p.vehicle_reg || '', 'off', false, '', ' style="text-transform:uppercase"') +
      fieldI('Manager name', 'manager_name', 'text', p.manager_name || '', 'off') +
      fieldI('Employer', 'employer', 'text', p.employer || '', 'organization') +
      '<button class="btn primary block" type="submit">Save details</button></form>' +
      '<section class="card"><div class="card-head"><h2>Saved places</h2></div><p class="small muted">Tap these on the Log tab instead of typing. Home, regular offices, school, supermarket.</p>' +
      (places.length ? '<div class="list">' + places.map((pl) => '<div class="list-item"><div class="grow"><p><b>' + esc(pl.label) + '</b></p><p class="small muted">' + esc(pl.address) + '</p></div>' +
        '<button class="icon-btn" data-act="editPlace" data-id="' + pl.id + '" aria-label="Edit ' + esc(pl.label) + '">' + ICON.edit + '</button></div>').join('') + '</div>' : '') +
      '<button class="btn block" data-act="addPlace">Add a place</button></section>' +
      '<section class="card"><h2>App</h2>' +
      '<div class="field"><span>Appearance</span><div class="seg wide" role="group">' +
      [['dark', 'Dark'], ['light', 'Light'], ['auto', 'Match phone']].map(([v, t]) => '<button type="button" data-act="theme" data-v="' + v + '" aria-pressed="' + (theme === v) + '">' + t + '</button>').join('') + '</div></div>' +
      '<p class="small muted">Signed in as ' + esc(state.user.email) + (state.lastSync ? '. Last synced ' + new Date(state.lastSync).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '') + '.</p>' +
      (state.syncErr ? '<div class="notice bad small">Sync problem: ' + esc(state.syncErr) + '. Your trips are safe on this phone and will send when it clears.</div>' : '') +
      '<div class="actions two"><button class="btn" data-act="syncNow">Sync now</button><button class="btn" data-act="changePass">Change password</button></div>' +
      '<button class="btn danger block" data-act="signout">Sign out</button></section>' +
      '<section class="card flat"><details><summary>Tips for a log payroll won\'t query</summary><ul class="tip-list">' +
      '<li>Take the odometer reading before you set off and as soon as you park, never while driving</li>' +
      '<li>Every mile on the clock should belong to a journey. Gaps get flagged and are usually charged as private</li>' +
      '<li>A detour for personal reasons in the middle of a work day is its own private leg. Use Next stop and switch to Private</li>' +
      '<li>Check with your employer whether home to your first visit counts as business or commuting</li>' +
      '<li>Send the report on the same day each month so deductions line up with payroll</li>' +
      '<li>Your trips are only visible to you. The administrator can approve accounts but cannot see anyone\'s journeys</li></ul></details></section>';
  }

  function placeSheet(pl) {
    const isNew = !pl;
    pl = pl || { label: '', address: '' };
    return '<div class="grab"></div><h2>' + (isNew ? 'Add a place' : 'Edit place') + '</h2>' +
      '<form data-form="place" data-id="' + (isNew ? '' : pl.id) + '" class="actions" autocomplete="off">' +
      fieldI('Name', 'label', 'text', pl.label, 'off', true, 'e.g. Home, Office, School') +
      fieldI('Road name or postcode', 'address', 'text', pl.address, 'off', true, 'what appears on the report') +
      '<button class="btn primary block" type="submit">Save place</button>' +
      (isNew ? '' : '<button class="btn danger block" type="button" data-act="deletePlace" data-id="' + pl.id + '">' + ICON.del + 'Delete place</button>') +
      '<button class="btn ghost" type="button" data-act="closeSheet">Cancel</button></form>';
  }

  // ---------------------------------------------------------------- sheets
  function openSheet(html) {
    closeSheet(); $toast.hidden = true;
    const back = document.createElement('div'); back.className = 'sheet-back';
    back.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + '</div>';
    back.addEventListener('click', (e) => { if (e.target === back) closeSheet(); });
    document.body.appendChild(back);
    const first = back.querySelector('input:not([type=hidden])'); if (first && !/date/.test(first.type)) setTimeout(() => first.focus(), 50);
  }
  function closeSheet() { const s = document.querySelector('.sheet-back'); if (s) s.remove(); }

  // ---------------------------------------------------------------- events
  const actions = {
    tab(el) { state.view = el.dataset.v; closeSheet(); render(); window.scrollTo(0, 0); },
    authView(el) { state.authView = el.dataset.v; state.authErr = ''; state.authMsg = ''; render(); },
    async signout() { if (state.outbox.length && !confirm(state.outbox.length + ' changes have not synced yet and will stay on this phone. Sign out anyway?')) return; await sb.auth.signOut(); state.authView = 'signin'; state.authMsg = ''; state.authErr = ''; render(); },
    async recheck() { await loadProfile(); if (state.profile && state.profile.status === 'approved') { sync(); toast('You\'re approved. Welcome to Trip Log'); } else toast('Still waiting'); render(); },
    syncNow() { if (!navigator.onLine) return toast('No signal. Trips will sync when you are back online'); sync(); toast('Syncing'); },
    dismissInstall() { try { localStorage.setItem('tl-install-dismissed', '1'); } catch (e) {} render(); },
    kind(el) { state.draft.kind = el.dataset.v; render(); },
    kindSheet(el) {
      const f = el.closest('form'); f.querySelector('[name=kind]').value = el.dataset.v;
      f.querySelectorAll('[data-act=kindSheet]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
    },
    fill(el) {
      const t = el.dataset.t;
      if (t === 'arrive_to') { const i = document.querySelector('[data-form=arrive] [name=to_place]'); if (i) i.value = el.dataset.val; return; }
      state.draft[t] = el.dataset.val;
      const i = document.querySelector('[data-bind=' + t + ']'); if (i) i.value = el.dataset.val;
    },
    logGap() {
      const lr = lastReading(); const last = lastLeg(); const d = state.draft;
      openSheet(legSheet({ kind: 'private', trip_date: d.trip_date, from_place: last ? last.to_place : '', to_place: d.from_place, odo_start: lr, odo_end: toInt(d.odo_start), purpose: '' }, true));
    },
    nextStop(el) {
      const l = state.legs[el.dataset.id]; closeSheet();
      state.draft = newDraft({ journey_id: l.journey_id, seq: l.seq + 1, trip_date: l.trip_date, kind: l.kind, from_place: l.to_place, to_place: '', odo_start: l.odo_end, purpose: '' });
      render(); window.scrollTo(0, 0); const t = document.getElementById('f_to'); if (t) t.focus();
    },
    returnTrip(el) {
      const l = state.legs[el.dataset.id]; closeSheet();
      state.draft = newDraft({ journey_id: l.journey_id, seq: l.seq + 1, trip_date: l.trip_date, kind: l.kind, from_place: l.to_place, to_place: l.from_place, odo_start: l.odo_end, purpose: l.purpose || '' });
      render(); window.scrollTo(0, 0); toast('Return trip ready. Add the end reading when you get back');
    },
    finishJourney() { state.draft = null; render(); },
    closeSheet() { closeSheet(); },
    cancelOpen() {
      const l = openLeg(); if (!l || !confirm('Cancel this journey? It will be deleted.')) return;
      putLeg(Object.assign({}, l, { deleted: true })); render();
    },
    month(el) {
      const [y, m] = state.month.split('-').map(Number); const d = new Date(y, m - 1 + Number(el.dataset.d), 1);
      if (monthKey(d) > monthKey(new Date())) return; state.month = monthKey(d); render();
    },
    editLeg(el) { const l = state.legs[el.dataset.id]; if (l) openSheet(legSheet(l, false)); },
    addPast() { const last = lastLeg(); openSheet(legSheet({ kind: 'business', trip_date: today(), from_place: '', to_place: '', odo_start: null, odo_end: null, purpose: last ? '' : '' }, true)); },
    deleteLeg(el) { const l = state.legs[el.dataset.id]; if (!l || !confirm('Delete this trip?')) return; putLeg(Object.assign({}, l, { deleted: true })); closeSheet(); render(); toast('Trip deleted'); },
    rmode(el) { state.report.mode = el.dataset.v; if (el.dataset.v === 'custom' && !state.report.from) { const r = reportRange(); } render(); },
    signLater(el) { state.report.signLater = el.checked; render(); },
    clearSig() { state.report.sig = ''; render(); },
    async makePdf(el) {
      if (!state.report.signLater && !state.report.sig) return toast('Sign the declaration, or tick to sign on paper');
      el.disabled = true;
      try {
        const { blob, fname } = buildPdf();
        state.lastPdf = { blob, fname };
        openSheet('<div class="grab"></div><h2>Report ready</h2><p class="muted small">' + esc(fname) + '</p>' +
          '<div class="actions"><button class="btn primary block" data-act="sharePdf">' + ICON.share + 'Share or email</button>' +
          '<button class="btn block" data-act="downloadPdf">Save to phone</button><button class="btn ghost" data-act="closeSheet">Close</button></div>');
      } catch (e) { console.error(e); toast('Could not build the PDF: ' + e.message, 5000); }
      el.disabled = false;
    },
    sharePdf() { if (state.lastPdf) sharePdf(state.lastPdf.blob, state.lastPdf.fname); },
    downloadPdf() { if (state.lastPdf) downloadPdf(state.lastPdf.blob, state.lastPdf.fname); },
    addPlace() { openSheet(placeSheet(null)); },
    editPlace(el) { openSheet(placeSheet(state.places[el.dataset.id])); },
    deletePlace(el) { const p = state.places[el.dataset.id]; if (!p || !confirm('Delete ' + p.label + '?')) return; putPlace(Object.assign({}, p, { deleted: true })); closeSheet(); render(); },
    theme(el) { try { localStorage.setItem('tl-theme', el.dataset.v); } catch (e) {} applyTheme(); render(); },
    changePass() {
      openSheet('<div class="grab"></div><h2>Change password</h2><form data-form="changePass" class="actions">' +
        fieldI('New password', 'password', 'password', '', 'new-password', true, 'At least 8 characters') +
        '<button class="btn primary block" type="submit">Save password</button><button class="btn ghost" type="button" data-act="closeSheet">Cancel</button></form>');
    }
  };

  const forms = {
    async signin(f) {
      const email = f.email.value.trim(), password = f.password.value;
      state.authErr = ''; state.authMsg = '';
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { state.authErr = /confirm/i.test(error.message) ? 'Confirm your email first, using the link we sent when you registered.' : (/invalid/i.test(error.message) ? 'Email or password is not right.' : error.message); render(); return; }
      state.session = data.session; state.user = data.user;
      await afterSignIn();
    },
    async register(f) {
      state.authErr = ''; state.authMsg = '';
      if (f.password.value.length < 8) { state.authErr = 'Password needs at least 8 characters.'; render(); return; }
      if (f.password.value !== f.password2.value) { state.authErr = 'The two passwords do not match.'; render(); return; }
      const email = f.email.value.trim().toLowerCase();
      const meta = { app: 'triplog', full_name: f.full_name.value.trim(), employee_no: f.employee_no.value.trim(), vehicle_reg: f.vehicle_reg.value.trim().toUpperCase(), manager_name: f.manager_name.value.trim(), employer: f.employer.value.trim() };
      const { data, error } = await sb.auth.signUp({ email, password: f.password.value, options: { data: meta, emailRedirectTo: location.origin + location.pathname } });
      if (error) {
        state.authErr = /registered|exists/i.test(error.message) ? 'That email already has an account. Sign in instead, and you can request access from there.' : error.message;
        render(); return;
      }
      notify({ action: 'registered', email });
      if (data.session) { state.session = data.session; state.user = data.user; await afterSignIn(); return; }
      state.authView = 'signin';
      state.authMsg = 'Registration sent. Check your inbox for an email to confirm your address, then wait for approval. You will be able to sign in once both are done.';
      render();
    },
    async forgot(f) {
      state.authErr = ''; state.authMsg = '';
      const { error } = await sb.auth.resetPasswordForEmail(f.email.value.trim(), { redirectTo: location.origin + location.pathname });
      if (error) state.authErr = error.message; else state.authMsg = 'If that email has an account, a reset link is on its way.';
      render();
    },
    async newpass(f) {
      if (f.password.value.length < 8) { state.authErr = 'Password needs at least 8 characters.'; render(); return; }
      const { error } = await sb.auth.updateUser({ password: f.password.value });
      if (error) { state.authErr = error.message; render(); return; }
      state.recovery = false; state.authErr = ''; history.replaceState(null, '', location.pathname);
      toast('Password saved'); await boot();
    },
    async changePass(f) {
      if (f.password.value.length < 8) return toast('At least 8 characters please');
      const { error } = await sb.auth.updateUser({ password: f.password.value });
      if (error) return toast(error.message, 4000);
      closeSheet(); toast('Password changed');
    },
    async request(f) {
      const { error } = await sb.from('tl_profiles').insert({ user_id: state.user.id, email: state.user.email.toLowerCase(), full_name: f.full_name.value.trim(), status: 'pending' });
      if (error) { state.authErr = error.message; render(); return; }
      notify({ action: 'registered', email: state.user.email.toLowerCase() });
      await loadProfile(); render();
    },
    leg() { saveDraftLeg(); },
    arrive(f) {
      const l = openLeg(); if (!l) return;
      const oe = toInt(f.odo_end.value); const to = f.to_place ? tidyPlace(f.to_place.value) : l.to_place;
      if (!to) return toast('Add where you went to');
      if (oe == null) return toast('Add the odometer reading');
      if (oe < l.odo_start) return toast('That is lower than the start reading of ' + fmtN(l.odo_start));
      if (oe - l.odo_start > 600 && !confirm(fmtN(oe - l.odo_start) + ' miles in one leg. Is that right?')) return;
      const upd = Object.assign({}, l, { odo_end: oe, to_place: to });
      putLeg(upd); afterLeg(upd);
    },
    editLeg(f) {
      const id = f.dataset.id;
      const os = toInt(f.odo_start.value), oe = toInt(f.odo_end.value);
      if (os == null || oe == null) return toast('Add both odometer readings');
      if (oe < os) return toast('End reading is lower than start');
      if (f.trip_date.value > today()) return toast('Date cannot be in the future');
      const base = id ? state.legs[id] : { id: uuid(), journey_id: uuid(), seq: 1, deleted: false };
      const leg = Object.assign({}, base, {
        kind: f.kind.value, trip_date: f.trip_date.value, from_place: tidyPlace(f.from_place.value), to_place: tidyPlace(f.to_place.value),
        odo_start: os, odo_end: oe, purpose: f.purpose.value.trim() || null
      });
      putLeg(leg); closeSheet();
      if (state.view === 'log') { state.draft = null; }
      render(); toast(id ? 'Trip updated' : 'Trip added');
    },
    async profile(f) {
      if (!navigator.onLine) return toast('You need signal to save your details');
      const upd = { full_name: f.full_name.value.trim(), employee_no: f.employee_no.value.trim() || null, vehicle_reg: f.vehicle_reg.value.trim().toUpperCase() || null, manager_name: f.manager_name.value.trim() || null, employer: f.employer.value.trim() || null };
      const { data, error } = await sb.from('tl_profiles').update(upd).eq('user_id', state.user.id).select().single();
      if (error) return toast(error.message, 4000);
      state.profile = data; cacheProfile(); render(); toast('Details saved');
    },
    place(f) {
      const id = f.dataset.id;
      const base = id ? state.places[id] : { id: uuid(), sort_order: 100 + placesList().length, deleted: false };
      putPlace(Object.assign({}, base, { label: f.label.value.trim(), address: tidyPlace(f.address.value) }));
      closeSheet(); render(); toast('Place saved');
    }
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const fn = actions[el.dataset.act]; if (!fn) return;
    if (el.type !== 'checkbox') e.preventDefault();
    fn(el, e);
  });
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-form]'); if (!f) return;
    e.preventDefault();
    const btn = f.querySelector('[type=submit]'); if (btn) btn.disabled = true;
    try { await forms[f.dataset.form](f); } catch (err) { console.error(err); toast(err.message || 'Something went wrong', 4000); }
    finally { if (btn && document.body.contains(btn)) btn.disabled = false; }
  });
  document.addEventListener('input', (e) => {
    const b = e.target.dataset && e.target.dataset.bind;
    if (b && state.draft) {
      state.draft[b] = (b === 'odo_start' || b === 'odo_end') ? toInt(e.target.value) : e.target.value;
      if (b === 'odo_end' || b === 'odo_start') {
        const h = document.getElementById('legHint'); if (h) h.innerHTML = legHint(state.draft);
        const btn = document.getElementById('legBtn'); if (btn) btn.textContent = state.draft.odo_end == null ? 'Start journey' : 'Save leg';
      }
    }
    const rb = e.target.dataset && e.target.dataset.rbind;
    if (rb) { state.report[rb] = e.target.value; }
  });
  document.addEventListener('change', (e) => {
    if (e.target.dataset && e.target.dataset.rbind) render();
    if (e.target.dataset && e.target.dataset.bind === 'odo_start' && state.view === 'log') render(); // refresh gap warning
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  boot();
})();
