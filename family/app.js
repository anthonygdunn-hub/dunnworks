/* Dunn Hub — dunnworks.io/family
 * The Dunn family's calendar (two-way with the joint Google calendar), school runs and lifts,
 * school notices, Tesco list, meal planner, kids' chores / stars / pocket money, bins,
 * reminders, birthdays, countdowns, noticeboard and contacts. Plain JS, no build step.
 */
(function () {
  'use strict';

  const sb = window.supabase.createClient(FAM.url, FAM.key, {
    auth: { storageKey: 'fam-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const $app = document.getElementById('app');
  const $sheet = document.getElementById('sheet');
  const $sheetCard = $sheet.querySelector('.sheet-card');
  const $toast = document.getElementById('toast');

  const TABLES = ['people', 'members', 'events', 'school', 'shopping', 'recipes', 'meals', 'chores', 'chore_done', 'pocket',
    'stars', 'rewards', 'reminders', 'birthdays', 'countdowns', 'bins', 'notices', 'contacts', 'settings', 'shift_types'];
  const S = {
    session: null, user: null, member: null, loaded: false, authView: 'signin', authMsg: '', authErr: '',
    d: Object.fromEntries(TABLES.map((t) => [t, []])),
    tab: lsGet('fam-tab') || 'today', sub: null, foodSeg: 'shop', kid: 'stanley', kidsWeek: 0, mealWeek: 0,
    shiftWho: null, shiftMonth: new Date(), shiftType: null, shiftSel: [], shiftSaving: false,
    filter: [], calDays: 42, calView: lsGet('fam-calview') || 'list', calAnchor: new Date(), gcal: null, syncing: false,
    me: lsGet('fam-me')
  };

  // ------------------------------------------------------------------ utils
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const todayD = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const todayS = () => iso(new Date());
  const daysBetween = (a, b) => Math.round((parse(iso(b)) - parse(iso(a))) / 864e5);
  const weekStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fmtD = (d) => DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()];
  const fmtLong = (d) => DAYS_LONG[d.getDay()] + ' ' + d.getDate() + ' ' + MON_LONG[d.getMonth()];
  const fmtT = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());
  const money = (n) => '£' + Number(n).toFixed(Number(n) % 1 ? 2 : 0);
  function dayLabel(d) {
    const n = daysBetween(todayD(), d);
    if (n === 0) return 'Today'; if (n === 1) return 'Tomorrow'; if (n === -1) return 'Yesterday';
    return fmtD(d);
  }
  function inDays(n) { return n === 0 ? 'today' : n === 1 ? 'tomorrow' : 'in ' + n + ' days'; }
  function toast(msg, ms) { $toast.textContent = msg; $toast.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { $toast.hidden = true; }, ms || 2600); }
  const person = (id) => S.d.people.find((p) => p.id === id) || { id, name: id ? id[0].toUpperCase() + id.slice(1) : '?', colour: '#9a9fab' };
  const personName = (id) => person(id).name;
  const drivers = () => S.d.people.filter((p) => p.drives && p.active);
  const kids = () => S.d.people.filter((p) => p.kind === 'child' && p.active);
  const setting = (k, dflt) => { const r = S.d.settings.find((s) => s.key === k); return r ? r.value : dflt; };
  const meName = () => (S.me ? personName(S.me) : (S.user && S.user.email) || '');
  const dot = (id, sm) => { const p = person(id); return `<span class="dot${sm ? ' sm' : ''}" style="background:${esc(p.colour)}">${sm ? '' : p.kind === 'pet' ? '🐾' : esc(p.name[0])}</span>`; };

  const I = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const ICON = {
    today: I('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
    cal: I('<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>'),
    food: I('<path d="M6 2v8a3 3 0 0 0 6 0V2M9 2v20M18 22V2c-2.5 1.5-4 4.5-4 8h4"/>'),
    kids: I('<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>'),
    home: I('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'),
    check: I('<path d="M20 6 9 17l-5-5"/>'),
    left: I('<path d="m15 18-6-6 6-6"/>'), right: I('<path d="m9 18 6-6-6-6"/>'),
    trash: I('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
    x: I('<path d="M18 6 6 18M6 6l12 12"/>'), sync: I('<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>')
  };

  // ------------------------------------------------------------------ data
  async function load(tables) {
    const order = { shift_types: 'sort', events: 'starts_at', school: 'starts_on', shopping: 'created_at', meals: 'day', chores: 'sort', reminders: 'due_on', countdowns: 'on_date', bins: 'sort', notices: 'created_at', contacts: 'sort', people: 'sort', recipes: 'title', stars: 'created_at' };
    await Promise.all((tables || TABLES).map(async (t) => {
      let q = sb.from('fam_' + t).select('*').limit(5000);
      if (order[t]) q = q.order(order[t], { ascending: !['notices', 'stars'].includes(t), nullsFirst: true });
      if (t === 'shopping') q = q.eq('cleared', false);
      const { data, error } = await q;
      if (!error) S.d[t] = data || [];
      else console.warn(t, error.message);
    }));
  }
  async function ins(t, row) { const { error } = await sb.from('fam_' + t).insert(row); if (error) { toast('Could not save: ' + error.message); throw error; } await load([t]); render(); }
  async function upd(t, match, row) { let q = sb.from('fam_' + t).update(row); Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); }); const { error } = await q; if (error) { toast('Could not save: ' + error.message); throw error; } await load([t]); render(); }
  async function del(t, match) { let q = sb.from('fam_' + t).delete(); Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); }); const { error } = await q; if (error) { toast('Could not delete: ' + error.message); throw error; } await load([t]); render(); }
  async function upsert(t, row) { const { error } = await sb.from('fam_' + t).upsert(row); if (error) { toast('Could not save: ' + error.message); throw error; } await load([t]); render(); }

  async function cal(body) {
    const { data, error } = await sb.functions.invoke(FAM.calFn, { body: Object.assign({ by: meName() }, body) });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* keep */ }
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }
  async function syncCal(quiet) {
    if (S.syncing) return; S.syncing = true;
    try { const r = await cal({ action: 'sync' }); await load(['events', 'settings']); render(); if (!quiet) toast(r.connected ? 'Calendar up to date' : 'Saved in the app. Google link not set up yet'); }
    catch (e) { if (!quiet) toast(e.message); }
    finally { S.syncing = false; }
  }

  let channel = null;
  function listen() {
    if (channel) return;
    channel = sb.channel('fam-live');
    ['events', 'shopping', 'chore_done', 'notices', 'meals', 'school'].forEach((t) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'fam_' + t }, () => { clearTimeout(listen['t' + t]); listen['t' + t] = setTimeout(async () => { await load([t]); if (!$sheet.hidden && t !== 'shopping') return; render(); }, 300); });
    });
    channel.subscribe();
  }

  // ------------------------------------------------------------------ calendar maths
  const STEP = { weekly: [7, 'd'], fortnightly: [14, 'd'], monthly: [1, 'm'], yearly: [12, 'm'] };
  function occurrences(from, to) {
    const out = [];
    for (const e of S.d.events) {
      if (e.all_day) {
        const s = parse(e.start_date), endEx = e.end_date ? parse(e.end_date) : addDays(s, 1);
        const push = (s0, e0) => { for (let d = new Date(Math.max(s0, from)); d < e0 && d <= to; d = addDays(d, 1)) out.push({ e, day: iso(d), allDay: true, start: d, end: d, span: daysBetween(s0, e0) }); };
        if (e.recurrence && STEP[e.recurrence]) { stepRecur(e, s, to, (d) => push(d, addDays(d, daysBetween(s, endEx)))); } else push(s, endEx);
      } else {
        if (!e.starts_at) continue;
        const s = new Date(e.starts_at), en = e.ends_at ? new Date(e.ends_at) : s;
        const len = en - s;
        const push = (d) => { if (d >= from && d <= addDays(to, 1)) out.push({ e, day: iso(d), allDay: false, start: d, end: new Date(d.getTime() + len) }); };
        if (e.recurrence && STEP[e.recurrence]) stepRecur(e, s, addDays(to, 1), push); else push(s);
      }
    }
    return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : (b.allDay - a.allDay) || (a.start - b.start)));
  }
  function stepRecur(e, s, to, fn) {
    const [n, unit] = STEP[e.recurrence]; const until = e.until_date ? addDays(parse(e.until_date), 1) : null;
    for (let i = 0; i < 600; i++) {
      const d = new Date(s);
      if (unit === 'd') d.setDate(d.getDate() + n * i); else d.setMonth(d.getMonth() + n * i);
      if (d > to || (until && d >= until)) break;
      fn(d);
    }
  }
  function matchesFilter(e) { return !S.filter.length || (e.people || []).some((p) => S.filter.includes(p)); }
  function schoolOn(dayS) { return S.d.school.filter((s) => s.starts_on <= dayS && (s.ends_on || s.starts_on) >= dayS); }
  function nextBirthday(b) {
    const t = todayD(); let d = new Date(t.getFullYear(), b.month - 1, b.day);
    if (d < t) d = new Date(t.getFullYear() + 1, b.month - 1, b.day);
    return { date: d, days: daysBetween(t, d), age: b.year ? d.getFullYear() - b.year : null };
  }
  function birthdaysOn(dayS) { const d = parse(dayS); return S.d.birthdays.filter((b) => b.month === d.getMonth() + 1 && b.day === d.getDate()); }
  function nextBin(b) { let d = parse(b.next_on); const t = todayD(); while (d < t) d = addDays(d, 7 * b.every_weeks); return d; }
  function clashes(occs) {
    // a clash is one person down for two different runs (drop-off at the start, pick-up at the end) within 20 minutes
    const bad = new Set(), legs = [];
    occs.filter((o) => !o.allDay && o.e.needs_lift).forEach((o) => {
      if (o.e.driver) legs.push({ o, who: o.e.driver, at: o.start });
      if (o.e.pickup) legs.push({ o, who: o.e.pickup, at: o.end });
    });
    for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) {
      const x = legs[i], y = legs[j];
      if (x.o !== y.o && x.who === y.who && Math.abs(x.at - y.at) < 20 * 60e3) { bad.add(x.o); bad.add(y.o); x.o.clashWho = x.who; y.o.clashWho = y.who; }
    }
    return bad;
  }


  // ------------------------------------------------------------------ render shell
  function render() {
    if (!S.session) return renderAuth();
    if (!S.loaded) { $app.innerHTML = '<div class="boot"><img src="icons/icon-192-v2.png" alt="" width="72" height="72"><p>Loading Dunn Hub</p></div>'; return; }
    if (!S.member) return renderNotMember();
    if (!S.me) return renderWho();
    const views = { today: vToday, cal: vCal, food: vFood, kids: vKids, home: vHome };
    const y = window.scrollY, same = render.last === S.tab + (S.sub || '');
    $app.innerHTML = (views[S.tab] || vToday)() + tabBar();
    if (same) window.scrollTo(0, y); render.last = S.tab + (S.sub || '');
  }
  function tabBar() {
    const t = [['today', 'Today', ICON.today], ['cal', 'Calendar', ICON.cal], ['food', 'Food', ICON.food], ['kids', 'Kids', ICON.kids], ['home', 'Home', ICON.home]];
    return `<div class="tabs"><nav>${t.map(([id, l, ic]) => `<button data-tab="${id}" ${S.tab === id ? 'aria-current="page"' : ''}>${ic}${l}</button>`).join('')}</nav></div>`;
  }
  function header(title, sub) {
    return `<div class="top"><div><h1>${title}</h1>${sub ? `<div class="date">${sub}</div>` : ''}</div>
      <button class="me" data-act="who">${dot(S.me)}${esc(meName())}</button></div>`;
  }

  // ------------------------------------------------------------------ auth screens
  function renderAuth() {
    const up = S.authView === 'signup', reset = S.authView === 'reset';
    $app.innerHTML = `<div class="auth"><img class="logo" src="icons/icon-192-v2.png" alt="">
      <h1>Dunn Hub</h1><p class="lead">${reset ? 'Set a new password' : up ? 'Create the family login' : 'The family calendar, lists and home bits'}</p>
      <form id="authForm" class="card">
        ${reset ? '' : `<label class="f"><span>Email</span><input type="email" name="email" autocomplete="email" required value="${esc(lsGet('fam-last-email') || '')}"></label>`}
        <label class="f"><span>${reset ? 'New password' : 'Password'}</span><input type="password" name="password" autocomplete="${up || reset ? 'new-password' : 'current-password'}" minlength="8" required></label>
        ${S.authErr ? `<p class="err">${esc(S.authErr)}</p>` : ''}${S.authMsg ? `<p class="ok">${esc(S.authMsg)}</p>` : ''}
        <button class="btn block" type="submit">${reset ? 'Save password' : up ? 'Create login' : 'Sign in'}</button>
      </form>
      ${reset ? '' : `<p style="text-align:center"><button class="link" data-auth="${up ? 'signin' : 'signup'}">${up ? 'Already set up? Sign in' : 'First time? Create the login'}</button></p>
      ${up ? '' : '<p style="text-align:center"><button class="link" data-auth="forgot">Forgot password</button></p>'}`}
    </div>`;
  }
  function renderNotMember() {
    $app.innerHTML = `<div class="auth"><img class="logo" src="icons/icon-192-v2.png" alt=""><h1>Not on the list</h1>
      <p class="lead">${esc(S.user.email)} isn't on the Dunn family list. Ask Anthony or Zoe to add it in Home, then Settings.</p>
      <button class="btn block ghost" data-act="signout">Sign out</button></div>`;
  }
  function renderWho() {
    const ppl = S.d.people.filter((p) => p.kind === 'adult' && p.active);
    $app.innerHTML = `<div class="auth"><img class="logo" src="icons/icon-192-v2.png" alt=""><h1>Who's this?</h1>
      <p class="lead">So the app knows whose phone this is. You can change it any time.</p>
      <div class="who-grid">${ppl.map((p) => `<button data-me="${p.id}">${dot(p.id)}${esc(p.name)}</button>`).join('')}</div></div>`;
  }

  // ------------------------------------------------------------------ TODAY
  function hello() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Afternoon' : 'Evening'; }
  function vToday() {
    const t = todayD(), tm = addDays(t, 1), ts = iso(t), tms = iso(tm);
    const occs = occurrences(t, addDays(t, 13));
    const alerts = [];
    // school notices today / tomorrow
    for (const [ds, lbl] of [[ts, 'Today'], [tms, 'Tomorrow']]) {
      for (const s of schoolOn(ds)) {
        if (s.kind === 'holiday' && s.starts_on !== ds) continue;
        const who = (s.people || []).map(personName).join(' & ');
        const em = { non_uniform: '👕', inset: '🏫', holiday: '🎉', trip: '🚌', event: '⭐', note: '📌' }[s.kind] || '📌';
        alerts.push(`<button class="alert ${s.kind === 'non_uniform' ? 'warn' : 'info'}" data-school="${s.id}"><span class="ic">${em}</span><span><b>${lbl}: ${esc(s.title)}</b>${who ? esc(who) : ''}${s.notes ? ' · ' + esc(s.notes) : ''}</span></button>`);
      }
    }
    // bins
    const binsT = S.d.bins.filter((b) => iso(nextBin(b)) === tms), binsD = S.d.bins.filter((b) => iso(nextBin(b)) === ts);
    if (binsT.length && new Date().getHours() >= 12) alerts.push(`<div class="alert warn"><span class="ic">🗑️</span><span><b>Bins out tonight</b>${binsT.map((b) => esc(b.label)).join(', ')}</span></div>`);
    else if (binsT.length) alerts.push(`<div class="alert info"><span class="ic">🗑️</span><span><b>Bins out tonight</b>${binsT.map((b) => esc(b.label)).join(', ')}</span></div>`);
    if (binsD.length) alerts.push(`<div class="alert info"><span class="ic">🗑️</span><span><b>Bin day today</b>${binsD.map((b) => esc(b.label)).join(', ')}</span></div>`);
    // lifts with nobody, next 7 days
    const noLift = occs.filter((o) => o.e.needs_lift && (!o.e.driver || !o.e.pickup) && o.start < addDays(t, 7));
    if (noLift.length) alerts.push(`<button class="alert bad" data-tab="cal"><span class="ic">🚗</span><span><b>${noLift.length} lift${noLift.length > 1 ? 's' : ''} not sorted this week</b>${noLift.slice(0, 3).map((o) => esc(o.e.title) + ' ' + dayLabel(o.start).toLowerCase()).join(' · ')}</span></button>`);
    const cl = clashes(occs.filter((o) => o.start < addDays(t, 7)));
    if (cl.size) { const f = [...cl][0]; alerts.push(`<button class="alert warn" data-tab="cal"><span class="ic">⚠️</span><span><b>Lift clash</b>${esc(personName(f.clashWho || f.e.driver))} is down for two runs at once, ${dayLabel(f.start).toLowerCase()}</span></button>`); }
    // reminders due
    for (const r of S.d.reminders) {
      const n = daysBetween(t, parse(r.due_on));
      if (n <= r.remind_days) alerts.push(`<button class="alert ${n < 0 ? 'bad' : n <= 7 ? 'warn' : 'info'}" data-rem="${r.id}"><span class="ic">${remIcon(r.kind)}</span><span><b>${esc(r.title)}</b>${n < 0 ? 'Overdue by ' + -n + ' day' + (n === -1 ? '' : 's') : 'Due ' + inDays(n) + ' · ' + fmtD(parse(r.due_on))}</span></button>`);
    }
    // birthdays within 14 days
    for (const b of S.d.birthdays) { const nb = nextBirthday(b); if (nb.days <= 14) alerts.push(`<div class="alert ${nb.days === 0 ? 'good' : 'info'}"><span class="ic">🎂</span><span><b>${esc(b.name)}${nb.age ? ' turns ' + nb.age : "'s birthday"} ${inDays(nb.days)}</b>${fmtD(nb.date)}</span></div>`); }

    const dayBlock = (d, label) => {
      const ds = iso(d), list = occs.filter((o) => o.day === ds);
      return `<div class="section-title">${label}</div>${list.length ? list.map((o) => evRow(o, cl)).join('') : `<div class="empty">Nothing in the calendar.</div>`}`;
    };
    const pinned = S.d.notices.filter((n) => n.pinned).slice(0, 3);
    const cds = S.d.countdowns.map((c) => ({ c, n: daysBetween(t, parse(c.on_date)) })).filter((x) => x.n >= 0).sort((a, b) => a.n - b.n).slice(0, 3);
    const kidCards = kids().map((k) => { const w = weekStatus(k.id, weekStart(t)); const due = choresToday(k.id); return `<button class="stat" data-kid="${k.id}" style="text-align:left">${dot(k.id)}<b style="margin-top:6px">${starBalance(k.id)} ⭐</b><span>${esc(k.name)} · ${due.done}/${due.total} jobs today${w.total ? '' : ''}</span></button>`; }).join('');
    const shopN = S.d.shopping.filter((s) => !s.done).length;

    return header(hello() + (S.me ? ', ' + esc(meName().split(' ')[0]) : ''), fmtLong(t)) +
      alerts.join('') +
      dayBlock(t, 'Today') + dayBlock(tm, 'Tomorrow') +
      `<div class="section-title">Food today</div>
       <div class="card meal-card">${slotRows(ts, true)}</div>
       <div class="grid2">${kidCards}</div>
       <div class="grid2" style="margin-top:10px">
         <button class="stat" data-tab="food" style="text-align:left"><b>${shopN}</b><span>on the Tesco list</span></button>
         ${cds[0] ? `<div class="stat"><b>${cds[0].n}</b><span>${cds[0].n === 1 ? 'day' : 'days'} to ${esc(cds[0].c.emoji || '')} ${esc(cds[0].c.title)}</span></div>` : `<button class="stat" data-home="countdowns" style="text-align:left"><b>＋</b><span>Add a countdown</span></button>`}
       </div>` +
      (pinned.length ? `<div class="section-title">Noticeboard</div>${pinned.map((n) => `<div class="card" style="padding:12px 14px">📌 ${esc(n.body)}<div class="faint small" style="margin-top:4px">${esc(n.author || '')}</div></div>`).join('')}` : '') +
      `<button class="fab" data-act="newEvent" aria-label="Add to calendar">+</button>`;
  }
  function evRow(o, cl) {
    const e = o.e, ppl = e.people && e.people.length ? e.people : ['family'];
    const bars = ppl.map((p) => `<i style="background:${esc(person(p).colour)}"></i>`).join('');
    let time;
    if (o.allDay) time = `All day${o.span > 1 ? '<small>' + o.span + ' days</small>' : ''}`;
    else time = fmtT(o.start) + `<small>${fmtT(o.end)}</small>`;
    let lift = '';
    if (e.needs_lift) {
      if (e.driver && e.pickup && e.driver === e.pickup) lift = `<span class="chip lift">🚗 ${esc(personName(e.driver))} both ways</span>`;
      else lift = (e.driver ? `<span class="chip lift">⬆️ Drop ${esc(personName(e.driver))}</span>` : `<span class="chip nolift">⬆️ Drop-off?</span>`) +
        (e.pickup ? `<span class="chip lift">⬇️ Pick up ${esc(personName(e.pickup))}</span>` : `<span class="chip nolift">⬇️ Pick-up?</span>`);
    }
    const clash = cl && cl.has(o) ? '<span class="chip clash">⚠️ clash</span>' : '';
    return `<button class="ev${e.sync_status !== 'synced' ? ' local' : ''}" data-ev="${esc(e.id)}" data-day="${o.day}">
      <span class="bar">${bars}</span><span class="time">${time}</span>
      <span class="body"><span class="title">${esc(e.title)}</span>
      <span class="meta">${ppl.map((p) => dot(p, true) + esc(personName(p))).join(' ')}${e.location ? ' · ' + esc(e.location) : ''} ${lift}${clash}</span></span></button>`;
  }

  // ------------------------------------------------------------------ CALENDAR
  // views: list (agenda), day, week, month. S.calAnchor is the date the view is centred on.
  function dayItems(d, occs, cl, compact) {
    const ds = iso(d), t = todayD();
    const showSchool = !S.filter.length || S.filter.some((f) => ['stanley', 'shyla', 'family'].includes(f));
    const list = occs.filter((o) => o.day === ds);
    const sch = showSchool ? schoolOn(ds).filter((s) => s.kind !== 'holiday' || s.starts_on === ds || ds === iso(t) || compact === 'day') : [];
    const bd = birthdaysOn(ds);
    return {
      n: list.length + sch.length + bd.length,
      html: sch.map((s) => `<button class="ev school" data-school="${s.id}"><span class="time">School</span><span class="body"><span class="title">${esc(s.title)}</span><span class="meta">${(s.people || []).map((p) => dot(p, true) + esc(personName(p))).join(' ')}${s.notes ? ' · ' + esc(s.notes) : ''}</span></span></button>`).join('') +
        bd.map((b) => `<div class="ev bday"><span class="time">🎂</span><span class="body"><span class="title">${esc(b.name)}'s birthday${b.year ? ' (' + (d.getFullYear() - b.year) + ')' : ''}</span></span></div>`).join('') +
        list.map((o) => evRow(o, cl)).join('')
    };
  }
  function calRange() {
    const a = new Date(S.calAnchor); a.setHours(0, 0, 0, 0);
    if (S.calView === 'day') return [a, a];
    if (S.calView === 'week') { const s = weekStart(a); return [s, addDays(s, 6)]; }
    if (S.calView === 'month') { const f = new Date(a.getFullYear(), a.getMonth(), 1), l = new Date(a.getFullYear(), a.getMonth() + 1, 0); return [weekStart(f), addDays(weekStart(l), 6)]; }
    return [todayD(), addDays(todayD(), S.calDays)];
  }
  function calLabel() {
    const a = new Date(S.calAnchor);
    if (S.calView === 'day') return dayLabel(a) === fmtD(a) ? fmtLong(a) : dayLabel(a) + ' · ' + fmtD(a);
    if (S.calView === 'week') { const s = weekStart(a), e = addDays(s, 6); return s.getMonth() === e.getMonth() ? s.getDate() + '–' + e.getDate() + ' ' + MON[s.getMonth()] : s.getDate() + ' ' + MON[s.getMonth()] + ' – ' + e.getDate() + ' ' + MON[e.getMonth()]; }
    return MON_LONG[a.getMonth()] + ' ' + a.getFullYear();
  }
  function calMove(n) {
    const a = new Date(S.calAnchor);
    if (S.calView === 'day') a.setDate(a.getDate() + n);
    else if (S.calView === 'week') a.setDate(a.getDate() + 7 * n);
    else { a.setDate(1); a.setMonth(a.getMonth() + n); }
    S.calAnchor = a; render();
  }
  function vCal() {
    const [from, to] = calRange();
    const occs = occurrences(from, to).filter((o) => matchesFilter(o.e));
    const cl = clashes(occs);
    const view = S.calView;
    const seg = `<div class="seg">${[['list', 'List'], ['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([k, l]) => `<button data-calview="${k}" aria-pressed="${view === k}">${l}</button>`).join('')}</div>`;
    const nav = view === 'list' ? '' : `<div class="weeknav calnav"><button class="icon-btn" data-calmove="-1" aria-label="Previous">${ICON.left}</button>
      <strong>${calLabel()}</strong><span style="display:flex;gap:4px;align-items:center"><button class="btn sm ghost" data-act="calToday">Today</button><button class="icon-btn" data-calmove="1" aria-label="Next">${ICON.right}</button></span></div>`;
    const st = setting('gcal_last_sync', null);
    const gnote = !st || !st.ok ? `<div class="alert info" style="margin-top:4px"><span class="ic">🔗</span><span><b>Google Calendar not linked yet</b>Everything you add is kept here and goes up to the joint calendar as soon as the link is switched on.</span></div>` : '';
    const chip = (id, label, col) => `<button class="pick" data-filter="${id}" aria-pressed="${id === '' ? !S.filter.length : S.filter.includes(id)}">${col ? `<span class="dot sm" style="background:${col}"></span>` : ''}${esc(label)}</button>`;
    let body = '';
    if (view === 'list') {
      for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
        const it = dayItems(d, occs, cl); if (!it.n) continue;
        body += `<div class="day"><div class="day-h${iso(d) === todayS() ? ' today' : ''}"><strong>${dayLabel(d)}</strong><span class="faint small">${daysBetween(todayD(), d) > 1 ? '' : fmtD(d)}</span></div>${it.html}</div>`;
      }
      body = (body || '<div class="empty">Nothing coming up for this filter.</div>') + `<button class="btn ghost block" data-act="moreCal">Show more</button>`;
    } else if (view === 'day') {
      const it = dayItems(from, occs, cl, 'day');
      body = `<div class="day">${it.n ? it.html : '<div class="empty">Nothing on. Tap + to add something.</div>'}</div>`;
    } else if (view === 'week') {
      for (let i = 0; i < 7; i++) {
        const d = addDays(from, i), it = dayItems(d, occs, cl);
        body += `<div class="day"><button class="day-h link-h${iso(d) === todayS() ? ' today' : ''}" data-calday="${iso(d)}"><strong>${DAYS_LONG[d.getDay()]}</strong><span class="faint small">${d.getDate()} ${MON[d.getMonth()]}</span></button>${it.n ? it.html : '<div class="empty small" style="padding:2px 4px 6px">Nothing on</div>'}</div>`;
      }
    } else {
      const a = new Date(S.calAnchor), month = a.getMonth(), sel = iso(a);
      let cells = '';
      for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
        const ds = iso(d), evs = occs.filter((o) => o.day === ds), sch = schoolOn(ds).length && (!S.filter.length || S.filter.some((f) => ['stanley', 'shyla', 'family'].includes(f))), bd = birthdaysOn(ds).length;
        const lines = evs.slice(0, 3).map((o) => `<i style="background:${esc(person((o.e.people || ['family'])[0]).colour)}">${esc(o.e.title)}</i>`).join('');
        cells += `<button class="mcell${d.getMonth() !== month ? ' out' : ''}${ds === todayS() ? ' today' : ''}${ds === sel ? ' sel' : ''}" data-mday="${ds}">
          <span class="mnum">${d.getDate()}</span>${sch ? '<span class="mflag">🏫</span>' : ''}${bd ? '<span class="mflag">🎂</span>' : ''}${lines}${evs.length > 3 ? `<em>+${evs.length - 3}</em>` : ''}</button>`;
      }
      const it = dayItems(a, occs, cl, 'day');
      body = `<div class="month"><div class="mhead">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((x) => `<span>${x}</span>`).join('')}</div><div class="mgrid">${cells}</div></div>
        <div class="day"><div class="day-h${sel === todayS() ? ' today' : ''}"><strong>${dayLabel(a)}</strong><span class="faint small">${fmtD(a)}</span></div>${it.n ? it.html : '<div class="empty">Nothing on this day.</div>'}</div>`;
    }
    return `<div class="top"><div><h1>Calendar</h1>${view === 'list' ? `<div class="date">Next ${Math.round(S.calDays / 7)} weeks</div>` : ''}</div><button class="icon-btn" data-act="sync" aria-label="Sync with Google">${ICON.sync}</button></div>
      ${seg}<div class="chips">${chip('', 'Everyone')}${S.d.people.filter((p) => p.active).map((p) => chip(p.id, p.name, p.colour)).join('')}</div>${gnote}${nav}
      <div id="calBody">${body}</div>
      <button class="fab" data-act="newEvent" aria-label="Add to calendar">+</button>`;
  }

  function eventSheet(e, dayS) {
    const isNew = !e; e = e || { people: S.filter.length ? S.filter.slice() : [], needs_lift: false, all_day: false };
    let start = new Date(), end;
    if (e.all_day) { start = parse(dayS || e.start_date); end = e.end_date ? addDays(parse(e.end_date), -1) : start; }
    else if (e.starts_at) {
      start = new Date(e.starts_at); end = e.ends_at ? new Date(e.ends_at) : start;
      if (dayS && e.recurrence) { const d = parse(dayS); const shift = daysBetween(start, d); start = addDays(start, shift); end = addDays(end, shift); }
    } else { const d = dayS ? parse(dayS) : new Date(); start = new Date(d); start.setHours(Math.min(new Date().getHours() + 1, 20), 0, 0, 0); end = new Date(start.getTime() + 3600e3); }
    const series = !!(e.series_id || e.recurrence);
    const pPick = S.d.people.filter((p) => p.active).map((p) => `<button type="button" class="pick" data-multi="people" data-v="${p.id}" aria-pressed="${(e.people || []).includes(p.id)}"><span class="dot sm" style="background:${esc(p.colour)}"></span>${esc(p.name)}</button>`).join('');
    const legPick = (field) => [{ id: '', name: 'Not sorted' }].concat(drivers()).map((p) => `<button type="button" class="pick" data-single="${field}" data-v="${p.id}" aria-pressed="${(e[field] || '') === p.id}">${esc(p.name)}</button>`).join('');
    openSheet(`<form id="evForm" data-id="${esc(e.id || '')}" data-series="${series ? 1 : ''}">
      <div class="sheet-head"><h2>${isNew ? 'Add to calendar' : 'Edit'}</h2><button type="button" class="icon-btn" data-close>${ICON.x}</button></div>
      <label class="f"><span>What</span><input type="text" name="title" required maxlength="200" value="${esc(e.title || '')}" placeholder="e.g. Shyla dance show"></label>
      <div class="f-l">Who's it for</div><div class="picks" style="margin-bottom:14px">${pPick}</div><input type="hidden" name="people" value="${esc((e.people || []).join(','))}">
      <label class="switch">All day<input type="checkbox" name="all_day" ${e.all_day ? 'checked' : ''}></label>
      <div class="f-row"><label class="f"><span>Date</span><input type="date" name="date" required value="${iso(start)}"></label>
        <label class="f allday-only" ${e.all_day ? '' : 'hidden'}><span>Until</span><input type="date" name="date_end" value="${iso(end || start)}"></label></div>
      <div class="f-row timed-only" ${e.all_day ? 'hidden' : ''}><label class="f"><span>Starts</span><input type="time" name="start" value="${fmtT(start)}"></label><label class="f"><span>Ends</span><input type="time" name="end" value="${fmtT(end || start)}"></label></div>
      ${isNew || e.id.startsWith('l:') ? `<label class="f"><span>Repeats</span><select name="recurrence">${[['', 'Does not repeat'], ['weekly', 'Every week'], ['fortnightly', 'Every 2 weeks'], ['monthly', 'Every month'], ['yearly', 'Every year']].map(([v, l]) => `<option value="${v}" ${(e.recurrence || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : (series ? '<p class="muted small">This one repeats. When you save you can change just this date or every one.</p>' : '')}
      <label class="switch">Needs a lift<input type="checkbox" name="needs_lift" ${e.needs_lift ? 'checked' : ''}></label>
      <div class="lift-only" ${e.needs_lift ? '' : 'hidden'}><div class="f-l">⬆️ Who's dropping off</div><div class="picks" style="margin-bottom:14px">${legPick('driver')}</div><input type="hidden" name="driver" value="${esc(e.driver || '')}">
        <div class="f-l">⬇️ Who's picking up</div><div class="picks" style="margin-bottom:14px">${legPick('pickup')}</div><input type="hidden" name="pickup" value="${esc(e.pickup || '')}"></div>
      <label class="f"><span>Where</span><input type="text" name="location" value="${esc(e.location || '')}" placeholder="optional"></label>
      <label class="f"><span>Notes</span><textarea name="notes" placeholder="Kit, money, what to bring">${esc(e.notes || '')}</textarea></label>
      <p class="err" id="evErr" hidden></p>
      <div class="sheet-actions">${isNew ? '' : '<button type="button" class="btn danger" data-act="delEvent">Delete</button>'}<button class="btn" type="submit">Save</button></div>
    </form>`);
    const f = $sheetCard.querySelector('#evForm');
    f.dataset.day = dayS || '';
    f.all_day.addEventListener('change', () => { f.querySelector('.timed-only').hidden = f.all_day.checked; f.querySelector('.allday-only').hidden = !f.all_day.checked; });
    f.needs_lift.addEventListener('change', () => { f.querySelector('.lift-only').hidden = !f.needs_lift.checked; });
    f.date.addEventListener('change', () => { if (f.date_end.value < f.date.value) f.date_end.value = f.date.value; });
    f.start.addEventListener('change', () => { if (f.end.value <= f.start.value) { const [h, m] = f.start.value.split(':').map(Number); f.end.value = pad(Math.min(h + 1, 23)) + ':' + pad(m); } });
  }
  function readEvent(f) {
    const ev = { id: f.dataset.id || undefined, title: f.elements.title.value.trim(), all_day: f.all_day.checked, location: f.location.value.trim(), notes: f.notes.value.trim(),
      people: f.people.value ? f.people.value.split(',') : ['family'], needs_lift: f.needs_lift.checked, driver: f.needs_lift.checked ? (f.driver.value || null) : null, pickup: f.needs_lift.checked ? (f.pickup.value || null) : null,
      recurrence: f.recurrence ? (f.recurrence.value || null) : undefined };
    if (ev.all_day) { ev.start_date = f.date.value; ev.end_date = iso(addDays(parse(f.date_end.value || f.date.value), 1)); }
    else {
      const s = new Date(f.date.value + 'T' + (f.start.value || '09:00')); let en = new Date(f.date.value + 'T' + (f.end.value || f.start.value || '10:00'));
      if (en <= s) en = new Date(s.getTime() + 3600e3);
      ev.starts_at = s.toISOString(); ev.ends_at = en.toISOString();
    }
    if (ev.recurrence === undefined) delete ev.recurrence;
    return ev;
  }
  async function saveEvent(f, scope) {
    const ev = readEvent(f);
    if (!ev.title) return;
    const btns = f.querySelectorAll('button'); btns.forEach((b) => { b.disabled = true; });
    try {
      const r = await cal({ action: 'save', ev, scope: scope || 'one' });
      await load(['events']); closeSheet(); render();
      toast(r && r.local ? 'Saved. It goes to Google once the link is on' : 'Saved to the calendar');
    } catch (e) { const er = f.querySelector('#evErr'); er.textContent = e.message; er.hidden = false; btns.forEach((b) => { b.disabled = false; }); }
  }
  function askScope(title, fn) {
    const html = $sheetCard.innerHTML;
    const box = document.createElement('div');
    box.innerHTML = `<div class="card" style="margin-top:14px"><h3 style="margin-bottom:10px">${title}</h3><div class="sheet-actions" style="margin-top:0"><button type="button" class="btn ghost" data-scope="one">Just this one</button><button type="button" class="btn" data-scope="all">All of them</button></div></div>`;
    const form = $sheetCard.querySelector('form'); form.appendChild(box);
    box.addEventListener('click', (ev) => { const b = ev.target.closest('[data-scope]'); if (b) { box.remove(); fn(b.dataset.scope); } });
    box.scrollIntoView({ behavior: 'smooth', block: 'end' }); void html;
  }
  function liftSheet(e) {
    const leg = (field) => [{ id: '', name: 'Not sorted' }].concat(drivers()).map((p) => `<button type="button" class="pick" data-single="${field}" data-v="${p.id}" aria-pressed="${(e[field] || '') === p.id}">${p.id ? dot(p.id, true) : ''}${esc(p.name)}</button>`).join('');
    openSheet(`<form id="liftForm" data-ev="${esc(e.id)}"><div class="sheet-head"><h2>Lifts</h2><button type="button" class="icon-btn" data-close>${ICON.x}</button></div>
      <p class="muted">${esc(e.title)}</p>
      <div class="f-l">⬆️ Who's dropping off</div><div class="picks" style="margin-bottom:16px">${leg('driver')}</div><input type="hidden" name="driver" value="${esc(e.driver || '')}">
      <div class="f-l">⬇️ Who's picking up</div><div class="picks" style="margin-bottom:8px">${leg('pickup')}</div><input type="hidden" name="pickup" value="${esc(e.pickup || '')}">
      <p class="err" id="liftErr" hidden></p><div class="sheet-actions"><button class="btn" type="submit">Save</button></div></form>`);
  }

  // ------------------------------------------------------------------ FOOD
  const AISLES = [
    ['Fruit & veg', /\b(apple|banana|grape|orange|satsuma|clementine|pear|berr|strawberr|raspberr|blueberr|melon|lemon|lime|avocado|tomato|potato|onion|garlic|carrot|broccoli|cauliflower|pepper|cucumber|lettuce|salad|spinach|mushroom|courgette|leek|celery|sweetcorn|parsnip|swede|cabbage|sprout|herb|coriander|basil|parsley|ginger|chilli|pineapple|mango|kiwi|plum|peach|nectarine|veg|fruit)/],
    ['Bakery', /\b(bread|loaf|roll|bap|wrap|tortilla|bagel|croissant|crumpet|muffin|pitta|naan|cake|baguette|brioche|teacake|scone)/],
    ['Meat & fish', /\b(chicken|beef|mince|pork|lamb|sausage|bacon|ham|turkey|steak|fish|salmon|cod|tuna|prawn|haddock|gammon|chorizo|meatball|burger|kebab)/],
    ['Dairy & eggs', /\b(milk|cheese|cheddar|mozzarella|butter|yog|yoghurt|yogurt|cream|egg|creme|fromage|lurpak|flora|custard)/],
    ['Chilled', /\b(dip|houmous|hummus|coleslaw|pizza|quiche|pasta sauce fresh|fresh pasta|ready meal|juice|smoothie|lunchable|dairylea)/],
    ['Frozen', /\b(frozen|ice cream|ice lolly|lolly|chips|waffle|fish finger|nugget|peas|ice)\b/],
    ['Cupboard', /\b(pasta|spaghetti|rice|noodle|cereal|weetabix|cornflake|porridge|oats|flour|sugar|oil|vinegar|sauce|ketchup|mayo|mustard|stock|gravy|beans|soup|tin|tinned|jam|honey|peanut|nutella|spread|spice|salt|pepper corns|herbs dried|tea\b|coffee|squash|cordial|baking|stock cube|chopped tomatoes|passata|lentil|chickpea|crackers|oxo|bisto)/],
    ['Snacks & treats', /\b(crisp|biscuit|chocolate|sweet|popcorn|snack|bar|haribo|cookie|treat|nuts)/],
    ['Drinks', /\b(water|cola|coke|lemonade|fanta|pepsi|beer|lager|wine|cider|gin|vodka|prosecco|fizzy|drink)/],
    ['Household', /\b(toilet roll|loo roll|kitchen roll|bin bag|washing|detergent|fairy|bleach|spray|cleaner|sponge|foil|cling|batter(y|ies)|bulb|tablet|dishwasher|fabric|softener|zoflora|cif|tissue)/],
    ['Toiletries & health', /\b(shampoo|conditioner|soap|shower|toothpaste|toothbrush|deodorant|razor|plaster|calpol|paracetamol|ibuprofen|nappy|wipes|sun cream|suncream|vitamin|moistur|lotion|sanitary|tampon|cotton)/],
    ['Pets', /\b(dog|cat|pet|litter)/]
  ];
  const AISLE_ORDER = AISLES.map((a) => a[0]).concat('Other');
  function aisleFor(item) { const s = ' ' + item.toLowerCase(); const hit = AISLES.find(([, re]) => re.test(s)); return hit ? hit[0] : 'Other'; }

  function vFood() {
    const seg = `<div class="seg">${[['shop', 'Tesco list'], ['meals', 'Meal plan'], ['recipes', 'Saved meals']].map(([k, l]) => `<button data-food="${k}" aria-pressed="${S.foodSeg === k}">${l}</button>`).join('')}</div>`;
    return header('Food') + seg + (S.foodSeg === 'meals' ? vMeals() : S.foodSeg === 'recipes' ? vRecipes() : vShop());
  }
  function vShop() {
    const items = S.d.shopping;
    const left = items.filter((i) => !i.done), got = items.filter((i) => i.done);
    const groups = AISLE_ORDER.map((a) => [a, left.filter((i) => (i.aisle || 'Other') === a)]).filter(([, l]) => l.length);
    const onList = new Set(items.map((i) => i.item.toLowerCase()));
    const freq = {}; (S.shopHistory || []).forEach((r) => { const k = r.item.trim(); if (!onList.has(k.toLowerCase())) freq[k] = (freq[k] || 0) + 1; });
    const quick = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => k);
    const row = (i) => `<div class="row${i.done ? ' done-item' : ''}"><button class="tick${i.done ? ' on' : ''}" data-shop="${i.id}" aria-label="Got it">${ICON.check}</button>
      <div class="grow"><div class="title">${esc(i.item)}${i.qty ? ` <span class="faint">× ${esc(i.qty)}</span>` : ''}</div>${i.meal_day ? `<div class="faint small">for ${dayLabel(parse(i.meal_day)).toLowerCase()}'s tea</div>` : ''}</div>
      <button class="icon-btn" data-shopdel="${i.id}" aria-label="Remove">${ICON.x}</button></div>`;
    return `<form class="add-row" id="shopAdd"><input type="text" name="item" placeholder="Add to the list, e.g. milk ×2" autocomplete="off" enterkeyhint="done"><button class="btn" type="submit">Add</button></form>
      ${quick.length ? `<div class="chips">${quick.map((q) => `<button class="pick" data-quick="${esc(q)}">＋ ${esc(q)}</button>`).join('')}</div>` : ''}
      <div class="card">${groups.length ? groups.map(([a, l]) => `<div class="aisle">${esc(a)}</div>${l.map(row).join('')}`).join('') : '<div class="empty">The list is empty. Add things above and they get sorted into Tesco aisles.</div>'}</div>
      ${got.length ? `<div class="card-h"><h2>In the trolley (${got.length})</h2><button class="btn sm ghost" data-act="clearShop">Clear</button></div><div class="card">${got.map(row).join('')}</div>` : ''}`;
  }
  const SLOTS = [['breakfast', 'Breakfast', '🥣'], ['lunch', 'Lunch', '🥪'], ['tea', 'Tea', '🍽️']];
  const mealPeople = () => { const ids = setting('meal_people', ['anthony', 'zoe', 'stanley', 'shyla']); return ids.map(person).filter((p) => p && p.name); };
  const mealsFor = (ds, slot) => S.d.meals.filter((m) => m.day === ds && m.slot === slot).sort((a, b) => (a.people || []).length - (b.people || []).length);
  function whoText(m) { return !m.people || !m.people.length ? 'Everyone' : m.people.map(personName).join(', '); }
  function slotRows(ds, compact) {
    return SLOTS.map(([slot, label, em]) => {
      const list = mealsFor(ds, slot);
      if (compact && !list.length && slot !== 'tea') return '';
      const covered = new Set(list.some((m) => !m.people || !m.people.length) ? mealPeople().map((p) => p.id) : list.flatMap((m) => m.people || []));
      const missing = list.length ? mealPeople().filter((p) => !covered.has(p.id)) : [];
      return `<div class="slot"><div class="slot-h"><span>${em} ${label}</span><button class="link" data-mealadd="${ds}|${slot}">＋ Add</button></div>
        ${list.length ? list.map((m) => `<button class="dish" data-mealedit="${m.id}"><span class="grow"><b>${esc(m.title)}</b><span class="faint small">${esc(whoText(m))}${m.cook ? ' · Cook: ' + esc(personName(m.cook)) : ''}</span></span></button>`).join('') : `<button class="dish empty-dish" data-mealadd="${ds}|${slot}"><span class="faint">Nothing planned</span></button>`}
        ${missing.length ? `<button class="dish empty-dish" data-mealadd="${ds}|${slot}|${missing.map((p) => p.id).join(',')}"><span class="faint small">Nothing yet for ${esc(missing.map((p) => p.name).join(', '))}</span></button>` : ''}</div>`;
    }).join('');
  }
  function vMeals() {
    const ws = addDays(weekStart(new Date()), 7 * S.mealWeek);
    let days = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i), ds = iso(d);
      days += `<div class="card meal-card${ds === todayS() ? ' today' : ''}"><div class="meal-date"><b>${DAYS_LONG[d.getDay()]}</b> <span class="faint">${d.getDate()} ${MON[d.getMonth()]}</span></div>${slotRows(ds)}</div>`;
    }
    const planned = S.d.meals.filter((m) => m.day >= iso(ws) && m.day <= iso(addDays(ws, 6)));
    return `<div class="weeknav"><button class="icon-btn" data-mweek="-1">${ICON.left}</button><strong>${S.mealWeek === 0 ? 'This week' : S.mealWeek === 1 ? 'Next week' : 'w/c ' + fmtD(ws)}</strong><button class="icon-btn" data-mweek="1">${ICON.right}</button></div>
      ${planned.some((m) => m.ingredients && m.ingredients.length) ? `<button class="btn block" style="margin-bottom:14px" data-act="weekToShop" data-ws="${iso(ws)}">Add this week's ingredients to the Tesco list</button>` : ''}
      ${days}`;
  }
  function mealSheet(ds, slot, id, forWho) {
    const m = (id && S.d.meals.find((x) => x.id === id)) || { day: ds, slot: slot || 'tea', people: forWho || [] };
    const rec = S.d.recipes, ppl = mealPeople(), who = m.people || [];
    openSheet(`<form id="mealForm" data-id="${esc(m.id || '')}">
      <div class="sheet-head"><h2>${m.id ? 'Edit meal' : 'Add a meal'}</h2><button type="button" class="icon-btn" data-close>${ICON.x}</button></div>
      <div class="f-row"><label class="f"><span>Day</span><input type="date" name="day" required value="${esc(m.day)}"></label>
        <label class="f"><span>Meal</span><select name="slot">${SLOTS.map(([k, l]) => `<option value="${k}" ${m.slot === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="f-l">Who's it for</div><div class="picks" style="margin-bottom:14px"><button type="button" class="pick" data-everyone="people" aria-pressed="${!who.length}">Everyone</button>${ppl.map((p) => `<button type="button" class="pick" data-multi="people" data-v="${p.id}" aria-pressed="${who.includes(p.id)}"><span class="dot sm" style="background:${esc(p.colour)}"></span>${esc(p.name)}</button>`).join('')}</div>
      <input type="hidden" name="people" value="${esc(who.join(','))}">
      ${rec.length ? `<div class="f-l">Pick a saved meal</div><div class="chips">${rec.map((r) => `<button type="button" class="pick" data-recipe="${r.id}">${esc(r.title)}</button>`).join('')}</div>` : ''}
      <label class="f"><span>What are they having</span><input type="text" name="title" required value="${esc(m.title || '')}" placeholder="e.g. Spag bol, fish fingers"></label>
      <label class="f"><span>Ingredients, one per line</span><textarea name="ingredients" placeholder="Mince&#10;Spaghetti&#10;Chopped tomatoes">${esc((m.ingredients || []).join('\n'))}</textarea></label>
      <div class="f-l">Who's making it</div><div class="picks" style="margin-bottom:14px">${[{ id: '', name: 'Not decided' }].concat(S.d.people.filter((p) => p.kind === 'adult')).map((p) => `<button type="button" class="pick" data-single="cook" data-v="${p.id}" aria-pressed="${(m.cook || '') === p.id}">${esc(p.name)}</button>`).join('')}</div>
      <input type="hidden" name="cook" value="${esc(m.cook || '')}">
      <label class="switch">Save to my meals for next time<input type="checkbox" name="save" ${m.id ? '' : 'checked'}></label>
      <label class="switch">Add ingredients to the Tesco list<input type="checkbox" name="toShop"></label>
      <div class="sheet-actions">${m.id ? `<button type="button" class="btn danger" data-act="delMeal" data-id="${m.id}">Remove</button>` : ''}<button class="btn" type="submit">Save</button></div></form>`);
  }
  function vRecipes() {
    return `<div class="card">${S.d.recipes.length ? S.d.recipes.map((r) => `<button class="row btnrow" data-editrecipe="${r.id}"><div class="grow"><div class="title">${esc(r.title)}</div><div class="faint small">${(r.ingredients || []).length} ingredients</div></div>${ICON.right.replace('<svg', '<svg width="20" height="20"')}</button>`).join('') : '<div class="empty">Meals you plan get saved here, so next time it\'s one tap.</div>'}</div>
      <button class="btn block ghost" data-editrecipe="">Add a meal</button>`;
  }
  function recipeSheet(id) {
    const r = S.d.recipes.find((x) => x.id === id) || {};
    openSheet(`<form id="recipeForm" data-id="${esc(id || '')}"><div class="sheet-head"><h2>${r.id ? 'Edit meal' : 'New meal'}</h2><button type="button" class="icon-btn" data-close>${ICON.x}</button></div>
      <label class="f"><span>Name</span><input type="text" name="title" required value="${esc(r.title || '')}"></label>
      <label class="f"><span>Ingredients, one per line</span><textarea name="ingredients">${esc((r.ingredients || []).join('\n'))}</textarea></label>
      <label class="f"><span>Recipe link</span><input type="url" name="url" value="${esc(r.url || '')}" placeholder="optional"></label>
      ${r.url ? `<p><a href="${esc(r.url)}" target="_blank" rel="noopener">Open recipe</a></p>` : ''}
      <div class="sheet-actions">${r.id ? `<button type="button" class="btn danger" data-act="delRecipe" data-id="${r.id}">Delete</button>` : ''}<button class="btn" type="submit">Save</button></div></form>`);
  }
  async function addShop(text, extra) {
    const m = String(text).trim().match(/^(.*?)(?:\s*[x×]\s*(\d+))?$/i);
    const item = (m[1] || '').trim(); if (!item) return;
    if (S.d.shopping.some((s) => !s.done && s.item.toLowerCase() === item.toLowerCase())) return;
    const { error } = await sb.from('fam_shopping').insert(Object.assign({ item: item[0].toUpperCase() + item.slice(1), qty: m[2] || null, aisle: aisleFor(item), added_by: meName() }, extra || {}));
    if (error) toast('Could not add: ' + error.message);
  }
  async function loadShopHistory() { const { data } = await sb.from('fam_shopping').select('item').eq('cleared', true).order('created_at', { ascending: false }).limit(400); S.shopHistory = data || []; }

  // ------------------------------------------------------------------ KIDS
  function choreDays(c, ws) {
    if (c.freq === 'weekly') return [iso(ws)];
    const out = []; for (let i = 0; i < 7; i++) if (!c.days || !c.days.length || c.days.includes(i)) out.push(iso(addDays(ws, i)));
    return out;
  }
  const doneSet = () => new Set(S.d.chore_done.map((d) => d.chore_id + '|' + d.done_on));
  function weekStatus(kid, ws) {
    const ch = S.d.chores.filter((c) => c.kid === kid && c.active && iso(weekStart(new Date(c.created_at))) <= iso(ws));
    const ds = doneSet(); let total = 0, done = 0;
    ch.forEach((c) => choreDays(c, ws).forEach((d) => { total++; if (ds.has(c.id + '|' + d)) done++; }));
    return { total, done, all: total > 0 && done === total };
  }
  function choresToday(kid) {
    const ws = weekStart(new Date()), t = todayS(), ds = doneSet(); let total = 0, done = 0;
    S.d.chores.filter((c) => c.kid === kid && c.active).forEach((c) => { if (c.freq === 'daily' && choreDays(c, ws).includes(t)) { total++; if (ds.has(c.id + '|' + t)) done++; } });
    return { total, done };
  }
  function starBalance(kid) {
    const byId = Object.fromEntries(S.d.chores.map((c) => [c.id, c.stars]));
    return S.d.chore_done.filter((d) => d.kid === kid).reduce((a, d) => a + (byId[d.chore_id] || 0), 0) + S.d.stars.filter((s) => s.kid === kid).reduce((a, s) => a + s.delta, 0);
  }
  function vKids() {
    const ks = kids(); if (!ks.find((k) => k.id === S.kid) && ks[0]) S.kid = ks[0].id;
    const k = person(S.kid), ws = addDays(weekStart(new Date()), 7 * S.kidsWeek), wsS = iso(ws);
    const amount = Number(setting('pocket_money', 5));
    const st = weekStatus(k.id, ws), ds = doneSet();
    const chores = S.d.chores.filter((c) => c.kid === k.id && c.active);
    const todayIdx = (new Date().getDay() + 6) % 7;
    const grid = chores.length ? `<div class="week-grid"><span></span>${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => `<span class="hd${S.kidsWeek === 0 && i === todayIdx ? ' today' : ''}">${l}</span>`).join('')}
      ${chores.map((c) => `<button class="name link" style="text-align:left;color:inherit;padding:0" data-chore="${c.id}">${esc(c.title)}${c.stars ? ` <span class="faint small">${c.stars}⭐</span>` : ''}</button>` +
        (c.freq === 'weekly' ? `<span style="grid-column:span 7;display:flex;align-items:center;gap:8px"><button class="tick${ds.has(c.id + '|' + wsS) ? ' on' : ''}" data-tick="${c.id}" data-d="${wsS}">${ICON.check}</button><span class="faint small">once this week</span></span>`
          : [0, 1, 2, 3, 4, 5, 6].map((i) => { const d = iso(addDays(ws, i)); return choreDays(c, ws).includes(d) ? `<button class="tick${ds.has(c.id + '|' + d) ? ' on' : ''}" data-tick="${c.id}" data-d="${d}" aria-label="${esc(c.title)} ${DAYS[addDays(ws, i).getDay()]}">${ICON.check}</button>` : '<span class="off"></span>'; }).join(''))).join('')}</div>`
      : `<div class="empty">No jobs yet. Add ${esc(k.name)}'s chores and they show up here as a weekly tick chart.</div>`;
    const pct = st.total ? Math.round(st.done / st.total * 100) : 0;
    const paid = S.d.pocket.find((p) => p.kid === k.id && p.week_start === wsS);
    const weekOver = addDays(ws, 7) <= todayD();
    let pocket;
    if (paid) pocket = paid.status === 'paid' ? `<div class="alert good"><span class="ic">💷</span><span><b>${money(paid.amount)} paid</b>by ${esc(paid.paid_by || '')}</span></div>` : `<div class="alert bad"><span class="ic">💷</span><span><b>No pocket money this week</b>Not all jobs were done</span></div>`;
    else if (st.all) pocket = `<div class="alert good"><span class="ic">💷</span><span><b>${money(amount)} earned!</b>Every job done this week.</span></div><button class="btn block" data-pay="${k.id}" data-ws="${wsS}">Mark ${money(amount)} as paid</button>`;
    else if (weekOver && st.total) pocket = `<div class="alert bad"><span class="ic">💷</span><span><b>${st.total - st.done} job${st.total - st.done === 1 ? '' : 's'} missed</b>So no ${money(amount)} this week.</span></div><button class="btn block ghost" data-miss="${k.id}" data-ws="${wsS}">Close the week</button>`;
    else pocket = `<p class="muted small">${money(amount)} pocket money when every job is ticked this week.</p>`;
    const rewards = S.d.rewards.filter((r) => r.active && (!r.kid || r.kid === k.id)).sort((a, b) => a.cost - b.cost);
    const bal = starBalance(k.id);
    const log = S.d.stars.filter((s) => s.kid === k.id).slice(0, 6);

    return header('Kids') + `<div class="seg">${kids().map((x) => `<button data-kidsel="${x.id}" aria-pressed="${x.id === k.id}">${esc(x.name)}</button>`).join('')}</div>
      <div class="card"><div class="kid-head"><div class="big-dot" style="background:${esc(k.colour)}">${esc(k.name[0])}</div><div class="grow"><h2>${esc(k.name)}</h2><div class="muted">${bal} star${bal === 1 ? '' : 's'} to spend</div></div>
        <button class="btn sm pink" data-bonus="${k.id}">＋ Stars</button></div></div>
      <div class="card"><div class="weeknav"><button class="icon-btn" data-kweek="-1">${ICON.left}</button><strong>${S.kidsWeek === 0 ? 'This week' : S.kidsWeek === -1 ? 'Last week' : 'w/c ' + fmtD(ws)}</strong><button class="icon-btn" data-kweek="1" ${S.kidsWeek >= 0 ? 'disabled' : ''}>${ICON.right}</button></div>
        ${grid}${st.total ? `<div class="progress"><i style="width:${pct}%"></i></div><div class="muted small">${st.done} of ${st.total} done</div>` : ''}
        <div style="margin-top:12px">${pocket}</div>
        <button class="btn block ghost" style="margin-top:10px" data-chore="">Add a job</button></div>
      <div class="card"><div class="card-h"><h2>Rewards</h2><button class="link" data-reward="">Add</button></div>
        ${rewards.length ? rewards.map((r) => `<div class="row"><div class="grow"><div class="title">${esc(r.title)}</div><div class="faint small">${r.cost} stars${r.kid ? '' : ' · either kid'}</div></div>
          <button class="btn sm ${bal >= r.cost ? '' : 'ghost'}" data-spend="${r.id}" ${bal >= r.cost ? '' : 'disabled'}>Spend</button><button class="icon-btn" data-reward="${r.id}" aria-label="Edit">${ICON.right}</button></div>`).join('') : '<div class="empty">Add treats they can save up for, like a film night or 30 minutes extra screen time.</div>'}</div>
      ${log.length ? `<div class="card"><h2>Star log</h2>${log.map((s) => `<div class="row"><div class="grow"><div class="title">${s.delta > 0 ? '+' : ''}${s.delta} ⭐ ${esc(s.reason || '')}</div><div class="faint small">${fmtD(new Date(s.created_at))}${s.by ? ' · ' + esc(s.by) : ''}</div></div><button class="icon-btn" data-delstar="${s.id}" aria-label="Undo">${ICON.trash}</button></div>`).join('')}</div>` : ''}`;
  }
  function choreSheet(id) {
    const c = S.d.chores.find((x) => x.id === id) || { kid: S.kid, freq: 'daily', stars: 1, days: null };
    const dayBtns = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((l, i) => `<button type="button" class="pick" data-multi="days" data-v="${i}" aria-pressed="${!c.days || !c.days.length || c.days.includes(i)}">${l}</button>`).join('');
    openSheet(`<form id="choreForm" data-id="${esc(id || '')}"><div class="sheet-head"><h2>${c.id ? 'Edit job' : 'New job'}</h2><button type="button" class="icon-btn" data-close>${ICON.x}</button></div>
      <label class="f"><span>Job</span><input type="text" name="title" required value="${esc(c.title || '')}" placeholder="e.g. Make bed"></label>
      <div class="f-l">For</div><div class="picks" style="margin-bottom:14px">${kids().map((k) => `<button type="button" class="pick" data-single="kid" data-v="${k.id}" aria-pressed="${c.kid === k.id}">${esc(k.name)}</button>`).join('')}</div><input type="hidden" name="kid" value="${esc(c.kid)}">
      <label class="f"><span>How often</span><select name="freq"><option value="daily" ${c.freq === 'daily' ? 'selected' : ''}>On certain days</option><option value="weekly" ${c.freq === 'weekly' ? 'selected' : ''}>Once a week</option></select></label>
      <div class="days-only" ${c.freq === 'weekly' ? 'hidden' : ''}><div class="f-l">Which days</div><div class="picks" style="margin-bottom:14px">${dayBtns}</div></div>
      <input type="hidden" name="days" value="${esc((c.days && c.days.length ? c.days : [0, 1, 2, 3, 4, 5, 6]).join(','))}">
      <label class="f"><span>Stars for each tick</span><input type="number" name="stars" min="0" max="20" value="${c.stars}"></label>
      <div class="sheet-actions">${c.id ? `<button type="button" class="btn danger" data-act="delChore" data-id="${c.id}">Remove</button>` : ''}<button class="btn" type="submit">Save</button></div></form>`);
    const f = $sheetCard.querySelector('#choreForm'); f.freq.addEventListener('change', () => { f.querySelector('.days-only').hidden = f.freq.value === 'weekly'; });
  }
  function rewardSheet(id) {
    const r = S.d.rewards.find((x) => x.id === id) || { cost: 10, kid: null };
    openSheet(`<form id="rewardForm" data-id="${esc(id || '')}"><div class="sheet-head"><h2>${r.id ? 'Edit reward' : 'New reward'}</h2><button type="button" class="icon-btn" data-close>${ICON.x}</button></div>
      <label class="f"><span>Reward</span><input type="text" name="title" required value="${esc(r.title || '')}" placeholder="e.g. Pick the film on Friday"></label>
      <label class="f"><span>Costs (stars)</span><input type="number" name="cost" min="1" max="999" value="${r.cost}"></label>
      <div class="f-l">For</div><div class="picks" style="margin-bottom:14px">${[{ id: '', name: 'Either' }].concat(kids()).map((k) => `<button type="button" class="pick" data-single="kid" data-v="${k.id}" aria-pressed="${(r.kid || '') === k.id}">${esc(k.name)}</button>`).join('')}</div><input type="hidden" name="kid" value="${esc(r.kid || '')}">
      <div class="sheet-actions">${r.id ? `<button type="button" class="btn danger" data-act="delReward" data-id="${r.id}">Remove</button>` : ''}<button class="btn" type="submit">Save</button></div></form>`);
  }
  function bonusSheet(kid) {
    openSheet(`<form id="bonusForm" data-kid="${kid}"><div class="sheet-head"><h2>Stars for ${esc(personName(kid))}</h2><button type="button" class="icon-btn" data-close>${ICON.x}</button></div>
      <div class="picks" style="margin-bottom:14px">${[1, 2, 3, 5].map((n) => `<button type="button" class="pick" data-single="delta" data-v="${n}" aria-pressed="${n === 1}">+${n} ⭐</button>`).join('')}<button type="button" class="pick" data-single="delta" data-v="-1" aria-pressed="false">−1</button></div>
      <input type="hidden" name="delta" value="1">
      <label class="f"><span>What for</span><input type="text" name="reason" placeholder="e.g. Kind to sister" maxlength="120"></label>
      <div class="sheet-actions"><button class="btn" type="submit">Give stars</button></div></form>`);
  }

  // ------------------------------------------------------------------ HOME
  // ------------------------------------------------------------------ WORK SHIFTS
  // A shift is an ordinary calendar event for one person titled "<Name> working" (plus the shift name),
  // so it lands in the joint Google calendar and existing "Zoe working" entries show up here too.
  const shiftPeople = () => S.d.people.filter((p) => p.kind === 'adult' && p.active);
  const hm = (t) => String(t || '').slice(0, 5);
  function isShift(e, pid) { return !e.all_day && (e.people || []).includes(pid) && String(e.title || '').toLowerCase().startsWith(personName(pid).toLowerCase() + ' working'); }
  function shiftWho() { if (!S.shiftWho) S.shiftWho = shiftPeople().some((p) => p.id === S.me) ? S.me : 'zoe'; return S.shiftWho; }
  function shiftEv(pid, ds, start, end, label, notes) {
    const s0 = new Date(ds + 'T' + start); let e0 = new Date(ds + 'T' + end);
    if (e0 <= s0) e0 = addDays(e0, 1); // overnight shift
    return { title: personName(pid) + ' working' + (label ? ' · ' + label : ''), people: [pid], starts_at: s0.toISOString(), ends_at: e0.toISOString(), all_day: false, notes: notes || '' };
  }
  function vShifts() {
    const who = shiftWho(), p = person(who);
    const types = S.d.shift_types.filter((t) => t.person === who);
    const sel = types.find((t) => t.id === S.shiftType);
    const a = new Date(S.shiftMonth), month = a.getMonth();
    const from = weekStart(new Date(a.getFullYear(), month, 1)), to = addDays(weekStart(new Date(a.getFullYear(), month + 1, 0)), 6);
    const occs = occurrences(from, to).filter((o) => isShift(o.e, who));
    let cells = '';
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
      const ds = iso(d), on = occs.filter((o) => o.day === ds), picked = S.shiftSel.includes(ds);
      cells += `<button class="mcell${d.getMonth() !== month ? ' out' : ''}${ds === todayS() ? ' today' : ''}${picked ? ' picked' : ''}" data-shiftday="${ds}">
        <span class="mnum">${d.getDate()}</span>${on.map((o) => `<i style="background:${esc(p.colour)}">${fmtT(o.start)}</i>`).join('')}${picked && sel ? `<i class="pend">${esc(hm(sel.starts))}</i>` : ''}</button>`;
    }
    const upcoming = occurrences(todayD(), addDays(todayD(), 60)).filter((o) => isShift(o.e, who)).slice(0, 8);
    const hint = sel ? `Tap each day ${esc(p.name)} is on <b>${esc(sel.name)}</b> (${hm(sel.starts)}–${hm(sel.ends)}), then tap Add.` : types.length ? 'Pick a shift type, then tap the days. Or tap an empty day for a one-off.' : `Add ${esc(p.name)}'s shift types first, like "Late 17:00–23:55".`;
    return `<h1 style="margin-bottom:14px">Work shifts</h1>
      <div class="seg">${shiftPeople().map((x) => `<button data-shiftwho="${x.id}" aria-pressed="${x.id === who}">${esc(x.name)}</button>`).join('')}</div>
      <div class="card"><div class="card-h"><h2>Shift types</h2><button class="link" data-stypeedit="">＋ New</button></div>
        ${types.length ? `<div class="picks">${types.map((t) => `<button class="pick" data-stype="${t.id}" aria-pressed="${t.id === S.shiftType}">${esc(t.name)} <span class="faint small">${hm(t.starts)}–${hm(t.ends)}</span></button>`).join('')}</div>
        <p class="muted small" style="margin:10px 0 0">${hint}</p>${types.length ? `<p style="margin:6px 0 0"><button class="link" data-act="editTypes">Edit shift types</button></p>` : ''}` : `<p class="muted small" style="margin:0">${hint}</p>`}</div>
      <div class="weeknav calnav"><button class="icon-btn" data-shiftmove="-1" aria-label="Previous month">${ICON.left}</button><strong>${MON_LONG[month]} ${a.getFullYear()}</strong><button class="icon-btn" data-shiftmove="1" aria-label="Next month">${ICON.right}</button></div>
      <div class="month"><div class="mhead">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((x) => `<span>${x}</span>`).join('')}</div><div class="mgrid">${cells}</div></div>
      ${S.shiftSel.length && sel ? `<div class="shift-bar"><button class="btn ghost" data-act="clearShiftSel">Clear</button><button class="btn pink" data-act="saveShifts" ${S.shiftSaving ? 'disabled' : ''}>${S.shiftSaving ? 'Adding…' : `Add ${S.shiftSel.length} ${esc(sel.name)} shift${S.shiftSel.length > 1 ? 's' : ''}`}</button></div>` : ''}
      <button class="btn block ghost" data-act="oneShift">＋ One-off shift</button>
      <div class="section-title">Coming up for ${esc(p.name)}</div>
      <div class="card">${upcoming.length ? upcoming.map((o) => `<button class="row btnrow" data-ev="${esc(o.e.id)}" data-day="${o.day}"><div class="grow"><div class="title">${dayLabel(o.start)} · ${fmtT(o.start)}–${fmtT(o.end)}</div><div class="faint small">${esc(o.e.title)}</div></div></button>`).join('') : '<div class="empty">No shifts in the next two months.</div>'}</div>`;
  }
  function shiftTypeSheet(id) {
    const t = S.d.shift_types.find((x) => x.id === id) || { person: shiftWho(), starts: '09:00', ends: '17:00' };
    openSheet(`<form id="stypeForm" data-id="${esc(id || '')}"><div class="sheet-head"><h2>${t.id ? 'Edit shift type' : 'New shift type'}</h2><button type="button" class="icon-btn" data-close>${ICON.x}</button></div>
      <p class="muted">For ${esc(personName(t.person))}</p>
      <label class="f"><span>Name</span><input type="text" name="name" required maxlength="30" value="${esc(t.name || '')}" placeholder="e.g. Late, Early, Long day, Night"></label>
      <div class="f-row"><label class="f"><span>Starts</span><input type="time" name="starts" required value="${hm(t.starts)}"></label><label class="f"><span>Ends</span><input type="time" name="ends" required value="${hm(t.ends)}"></label></div>
      <p class="muted small">If it ends after midnight, just put the finish time. The app knows it runs into the next day.</p>
      <div class="sheet-actions">${t.id ? `<button type="button" class="btn danger" data-act="delSType" data-id="${t.id}">Delete</button>` : ''}<button class="btn" type="submit">Save</button></div></form>`);
  }
  function editTypesSheet() {
    const types = S.d.shift_types.filter((t) => t.person === shiftWho());
    openSheet(`<div class="sheet-head"><h2>${esc(personName(shiftWho()))}'s shift types</h2><button type="button" class="icon-btn" data-close>${ICON.x}</button></div>
      <div class="card">${types.map((t) => `<button class="row btnrow" data-stypeedit="${t.id}"><div class="grow"><div class="title">${esc(t.name)}</div><div class="faint small">${hm(t.starts)}–${hm(t.ends)}</div></div></button>`).join('')}</div>
      <button class="btn block ghost" data-stypeedit="">＋ New shift type</button>`);
  }
  function oneShiftSheet(ds) {
    const who = shiftWho(), types = S.d.shift_types.filter((t) => t.person === who);
    openSheet(`<form id="oneShiftForm"><div class="sheet-head"><h2>One-off shift</h2><button type="button" class="icon-btn" data-close>${ICON.x}</button></div>
      <div class="f-l">Whose shift</div><div class="picks" style="margin-bottom:14px">${shiftPeople().map((x) => `<button type="button" class="pick" data-single="who" data-v="${x.id}" aria-pressed="${x.id === who}">${esc(x.name)}</button>`).join('')}</div><input type="hidden" name="who" value="${esc(who)}">
      <label class="f"><span>Date</span><input type="date" name="date" required value="${esc(ds || todayS())}"></label>
      ${types.length ? `<div class="f-l">Fill in from a shift type</div><div class="picks" style="margin-bottom:14px">${types.map((t) => `<button type="button" class="pick" data-filltype="${t.id}">${esc(t.name)}</button>`).join('')}</div>` : ''}
      <input type="hidden" name="label" value="">
      <div class="f-row"><label class="f"><span>Starts</span><input type="time" name="start" required value="09:00"></label><label class="f"><span>Ends</span><input type="time" name="end" required value="17:00"></label></div>
      <label class="f"><span>Notes</span><input type="text" name="notes" placeholder="optional, e.g. covering for someone"></label>
      <p class="err" id="shiftErr" hidden></p>
      <div class="sheet-actions"><button class="btn" type="submit">Add shift</button></div></form>`);
  }

  const HOME = [
    ['shifts', '💼', 'Work shifts', () => { const o = occurrences(todayD(), addDays(todayD(), 30)).find((x) => shiftPeople().some((p) => isShift(x.e, p.id))); return o ? o.e.title.split(' working')[0] + ' ' + dayLabel(o.start).toLowerCase() + ' ' + fmtT(o.start) : 'Add the rota'; }],
    ['notices', '📌', 'Noticeboard', () => { const n = S.d.notices.length; return n ? n + ' note' + (n > 1 ? 's' : '') : 'Leave a note'; }],
    ['school', '🏫', 'School', () => { const n = S.d.school.filter((s) => (s.ends_on || s.starts_on) >= todayS()).length; return n + ' coming up'; }],
    ['bins', '🗑️', 'Bins', () => { const b = S.d.bins.map((x) => ({ x, d: nextBin(x) })).sort((a, c) => a.d - c.d)[0]; return b ? b.x.label + ' ' + dayLabel(b.d).toLowerCase() : 'Set up bin days'; }],
    ['reminders', '🔔', 'Car & renewals', () => { const r = S.d.reminders[0]; return r ? r.title + ' ' + fmtD(parse(r.due_on)) : 'MOT, insurance, tax'; }],
    ['birthdays', '🎂', 'Birthdays', () => { const b = S.d.birthdays.map((x) => ({ x, n: nextBirthday(x) })).sort((a, c) => a.n.days - c.n.days)[0]; return b ? b.x.name + ' ' + inDays(b.n.days) : 'Add the family'; }],
    ['countdowns', '⏳', 'Countdowns', () => { const c = S.d.countdowns.filter((x) => x.on_date >= todayS())[0]; return c ? daysBetween(todayD(), parse(c.on_date)) + ' days to ' + c.title : 'Holidays, trips'; }],
    ['contacts', '📞', 'Contacts', () => S.d.contacts.length + ' saved'],
    ['settings', '⚙️', 'Settings', () => 'People, logins, Google']
  ];
  function vHome() {
    if (S.sub) return `<button class="back" data-home="">${ICON.left.replace('<svg', '<svg width="20" height="20"')}Home</button>` + ({ shifts: vShifts, notices: vNotices, school: vSchool, bins: vBins, reminders: vReminders, birthdays: vBirthdays, countdowns: vCountdowns, contacts: vContacts, settings: vSettings }[S.sub] || (() => ''))();
    return header('Home') + `<div class="tiles">${HOME.map(([k, em, l, sub]) => `<button class="tile" data-home="${k}"><span class="em">${em}</span><span><b>${l}</b><small>${esc(sub())}</small></span></button>`).join('')}</div>`;
  }
  function listCard(title, addAttr, items, emptyMsg) {
    return `<div class="card-h"><h1>${title}</h1><button class="btn sm" ${addAttr}>＋ Add</button></div><div class="card">${items.length ? items.join('') : `<div class="empty">${emptyMsg}</div>`}</div>`;
  }
  function vNotices() {
    return `<h1 style="margin-bottom:14px">Noticeboard</h1><form id="noticeAdd" class="card"><textarea name="body" placeholder="Leave a note for everyone…" required maxlength="500" style="min-height:70px"></textarea><div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn sm" type="submit">Post</button></div></form>
      ${S.d.notices.map((n) => `<div class="card" style="padding:12px 14px"><div style="display:flex;gap:10px"><div class="grow" style="flex:1;white-space:pre-wrap">${n.pinned ? '📌 ' : ''}${esc(n.body)}</div>
        <button class="icon-btn" data-pin="${n.id}" aria-label="Pin">${n.pinned ? '📌' : '📍'}</button><button class="icon-btn" data-delnotice="${n.id}" aria-label="Delete">${ICON.trash}</button></div>
        <div class="faint small">${esc(n.author || '')} · ${fmtD(new Date(n.created_at))}</div></div>`).join('')}`;
  }
  const SCHOOL_KINDS = [['non_uniform', '👕 Non-uniform'], ['inset', '🏫 Inset day'], ['holiday', '🎉 Holiday'], ['trip', '🚌 Trip'], ['event', '⭐ Event'], ['note', '📌 Note']];
  function vSchool() {
    const up = S.d.school.filter((s) => (s.ends_on || s.starts_on) >= todayS());
    return listCard('School', 'data-school=""', up.map((s) => { const k = SCHOOL_KINDS.find((x) => x[0] === s.kind); return `<button class="row btnrow" data-school="${s.id}"><div class="grow"><div class="title">${esc(s.title)}</div><div class="faint small">${k ? k[1] : ''} · ${fmtD(parse(s.starts_on))}${s.ends_on && s.ends_on !== s.starts_on ? ' – ' + fmtD(parse(s.ends_on)) : ''} · ${(s.people || []).map(personName).join(' & ')}</div></div></button>`; }), 'Add non-uniform days, inset days, trips and anything from the school newsletter.') +
      '<p class="muted small">Greatham follows the Hampshire term dates. Inset days are set by the school, so add those from the newsletter.</p>';
  }
  function schoolSheet(id) {
    const s = S.d.school.find((x) => x.id === id) || { kind: 'non_uniform', people: kids().map((k) => k.id), starts_on: iso(addDays(todayD(), 1)) };
    openSheet(`<form id="schoolForm" data-id="${esc(id || '')}"><div class="sheet-head"><h2>${s.id ? 'School notice' : 'New school notice'}</h2><button type="button" class="icon-btn" data-close>${ICON.x}</button></div>
      <div class="picks" style="margin-bottom:14px">${SCHOOL_KINDS.map(([k, l]) => `<button type="button" class="pick" data-single="kind" data-v="${k}" aria-pressed="${s.kind === k}">${l}</button>`).join('')}</div><input type="hidden" name="kind" value="${esc(s.kind)}">
      <label class="f"><span>Title</span><input type="text" name="title" required value="${esc(s.title || '')}" placeholder="e.g. Non-uniform day, bring £1"></label>
      <div class="f-l">For</div><div class="picks" style="margin-bottom:14px">${kids().map((k) => `<button type="button" class="pick" data-multi="people" data-v="${k.id}" aria-pressed="${(s.people || []).includes(k.id)}">${esc(k.name)}</button>`).join('')}</div><input type="hidden" name="people" value="${esc((s.people || []).join(','))}">
      <div class="f-row"><label class="f"><span>Date</span><input type="date" name="starts_on" required value="${esc(s.starts_on)}"></label><label class="f"><span>Until (optional)</span><input type="date" name="ends_on" value="${esc(s.ends_on || '')}"></label></div>
      <label class="f"><span>Notes</span><textarea name="notes" placeholder="What to bring, money, times">${esc(s.notes || '')}</textarea></label>
      <div class="sheet-actions">${s.id ? `<button type="button" class="btn danger" data-act="delSchool" data-id="${s.id}">Delete</button>` : ''}<button class="btn" type="submit">Save</button></div></form>`);
  }
  function vBins() {
    const items = S.d.bins.map((b) => ({ b, d: nextBin(b) })).sort((a, c) => a.d - c.d).map(({ b, d }) => `<button class="row btnrow" data-bin="${b.id}"><span class="dot" style="background:${esc(b.colour)}"></span><div class="grow"><div class="title">${esc(b.label)}</div><div class="faint small">Next ${dayLabel(d).toLowerCase()} · every ${b.every_weeks === 1 ? 'week' : b.every_weeks + ' weeks'}</div></div></button>`);
    return listCard('Bins', 'data-bin=""', items, 'Add each bin with its next collection date and how often it goes. The app works out every date after that and reminds you the night before.') +
      '<p class="muted small">Not sure of your days? <a href="https://www.easthants.gov.uk/bin-collections/find-your-bin-calendar" target="_blank" rel="noopener">Find your East Hampshire bin calendar</a>. Food waste goes every week.</p>';
  }
  function binSheet(id) {
    const b = S.d.bins.find((x) => x.id === id) || { colour: '#3a3f4b', every_weeks: 2, next_on: iso(addDays(todayD(), 1)) };
    const cols = [['#3a3f4b', 'Black'], ['#2f9e5b', 'Green'], ['#3b6fe0', 'Blue'], ['#8a5a2b', 'Brown'], ['#9a9fab', 'Grey'], ['#e08a1e', 'Caddy']];
    openSheet(`<form id="binForm" data-id="${esc(id || '')}"><div class="sheet-head"><h2>${b.id ? 'Edit bin' : 'Add a bin'}</h2><button type="button" class="icon-btn" data-close>${ICON.x}</button></div>
      <label class="f"><span>Which bin</span><input type="text" name="label" required value="${esc(b.label || '')}" placeholder="e.g. Recycling, Rubbish, Food caddy, Glass"></label>
      <div class="f-l">Colour</div><div class="picks" style="margin-bottom:14px">${cols.map(([c, l]) => `<button type="button" class="pick" data-single="colour" data-v="${c}" aria-pressed="${b.colour === c}"><span class="dot sm" style="background:${c}"></span>${l}</button>`).join('')}</div><input type="hidden" name="colour" value="${esc(b.colour)}">
      <div class="f-row"><label class="f"><span>Next collection</span><input type="date" name="next_on" required value="${esc(b.next_on)}"></label>
      <label class="f"><span>How often</span><select name="every_weeks">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${b.every_weeks === n ? 'selected' : ''}>Every ${n === 1 ? 'week' : n + ' weeks'}</option>`).join('')}</select></label></div>
      <div class="sheet-actions">${b.id ? `<button type="button" class="btn danger" data-act="delBin" data-id="${b.id}">Remove</button>` : ''}<button class="btn" type="submit">Save</button></div></form>`);
  }
  const REM_KINDS = [['mot', '🔧', 'MOT'], ['insurance', '🛡️', 'Car insurance'], ['tax', '🚗', 'Car tax'], ['service', '🛠️', 'Car service'], ['breakdown', '🚨', 'Breakdown cover'], ['home', '🏠', 'Home insurance'], ['boiler', '🔥', 'Boiler service'], ['tv', '📺', 'TV licence'], ['passport', '🛂', 'Passport'], ['other', '🔔', 'Other']];
  const remIcon = (k) => (REM_KINDS.find((x) => x[0] === k) || REM_KINDS[REM_KINDS.length - 1])[1];
  function vReminders() {
    const items = S.d.reminders.map((r) => { const n = daysBetween(todayD(), parse(r.due_on)); return `<button class="row btnrow" data-rem="${r.id}"><span style="font-size:22px">${remIcon(r.kind)}</span><div class="grow"><div class="title">${esc(r.title)}</div><div class="faint small" style="${n < 0 ? 'color:var(--red)' : ''}">${n < 0 ? 'Overdue' : 'Due ' + inDays(n)} · ${fmtD(parse(r.due_on))}${r.repeat !== 'none' ? ' · every ' + (r.repeat === 'yearly' ? 'year' : 'month') : ''}</div></div></button>`; });
    return listCard('Car & renewals', 'data-rem=""', items, 'Add MOTs, insurance and other renewals. They show up on Today when they\'re getting close.');
  }
  function remSheet(id) {
    const r = S.d.reminders.find((x) => x.id === id) || { kind: 'mot', repeat: 'yearly', remind_days: 30, due_on: iso(addDays(todayD(), 30)) };
    openSheet(`<form id="remForm" data-id="${esc(id || '')}"><div class="sheet-head"><h2>${r.id ? 'Reminder' : 'New reminder'}</h2><button type="button" class="icon-btn" data-close>${ICON.x}</button></div>
      <div class="picks" style="margin-bottom:14px">${REM_KINDS.map(([k, em, l]) => `<button type="button" class="pick" data-single="kind" data-v="${k}" aria-pressed="${r.kind === k}">${em} ${l}</button>`).join('')}</div><input type="hidden" name="kind" value="${esc(r.kind)}">
      <label class="f"><span>Title</span><input type="text" name="title" required value="${esc(r.title || '')}" placeholder="e.g. MOT for the Focus"></label>
      <div class="f-row"><label class="f"><span>Due</span><input type="date" name="due_on" required value="${esc(r.due_on)}"></label>
      <label class="f"><span>Remind me</span><select name="remind_days">${[[7, 'A week before'], [14, '2 weeks before'], [30, 'A month before'], [60, '2 months before']].map(([v, l]) => `<option value="${v}" ${r.remind_days === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <label class="f"><span>Repeats</span><select name="repeat">${[['yearly', 'Every year'], ['monthly', 'Every month'], ['none', 'Just once']].map(([v, l]) => `<option value="${v}" ${r.repeat === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="f"><span>Notes</span><textarea name="notes" placeholder="Policy number, garage, who it's with">${esc(r.notes || '')}</textarea></label>
      <div class="sheet-actions">${r.id ? `<button type="button" class="btn danger" data-act="delRem" data-id="${r.id}">Delete</button><button type="button" class="btn ghost" data-act="doneRem" data-id="${r.id}">Done ✓</button>` : ''}<button class="btn" type="submit">Save</button></div></form>`);
  }
  function vBirthdays() {
    const items = S.d.birthdays.map((b) => ({ b, n: nextBirthday(b) })).sort((a, c) => a.n.days - c.n.days).map(({ b, n }) => `<button class="row btnrow" data-bday="${b.id}"><span style="font-size:22px">🎂</span><div class="grow"><div class="title">${esc(b.name)}${n.age ? ` <span class="faint">turns ${n.age}</span>` : ''}</div><div class="faint small">${fmtD(n.date)} · ${inDays(n.days)}${b.relation ? ' · ' + esc(b.relation) : ''}</div></div></button>`);
    return listCard('Birthdays', 'data-bday=""', items, 'Add everyone\'s birthdays and they pop up on Today two weeks before.');
  }
  function bdaySheet(id) {
    const b = S.d.birthdays.find((x) => x.id === id) || {};
    openSheet(`<form id="bdayForm" data-id="${esc(id || '')}"><div class="sheet-head"><h2>${b.id ? 'Birthday' : 'Add a birthday'}</h2><button type="button" class="icon-btn" data-close>${ICON.x}</button></div>
      <label class="f"><span>Name</span><input type="text" name="name" required value="${esc(b.name || '')}"></label>
      <div class="f-row"><label class="f"><span>Day</span><input type="number" name="day" min="1" max="31" required value="${b.day || ''}"></label>
      <label class="f"><span>Month</span><select name="month">${MON_LONG.map((m, i) => `<option value="${i + 1}" ${b.month === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></label></div>
      <label class="f"><span>Year born (optional, shows their age)</span><input type="number" name="year" min="1900" max="2100" value="${b.year || ''}"></label>
      <label class="f"><span>Who are they</span><input type="text" name="relation" value="${esc(b.relation || '')}" placeholder="e.g. Cousin, Zoe's sister"></label>
      <label class="f"><span>Gift ideas</span><textarea name="notes">${esc(b.notes || '')}</textarea></label>
      <div class="sheet-actions">${b.id ? `<button type="button" class="btn danger" data-act="delBday" data-id="${b.id}">Delete</button>` : ''}<button class="btn" type="submit">Save</button></div></form>`);
  }
  function vCountdowns() {
    const t = todayD();
    const items = S.d.countdowns.map((c) => ({ c, n: daysBetween(t, parse(c.on_date)) })).sort((a, b) => a.n - b.n).map(({ c, n }) => `<button class="row btnrow count" data-cd="${c.id}"><span class="n">${n < 0 ? '✓' : n}<small>${n < 0 ? 'done' : n === 1 ? 'day' : 'days'}</small></span><div class="grow"><div class="title">${esc(c.emoji || '')} ${esc(c.title)}</div><div class="faint small">${fmtLong(parse(c.on_date))}</div></div></button>`);
    return listCard('Countdowns', 'data-cd=""', items, 'Count down to holidays, trips and big days. The kids love this one.');
  }
  function cdSheet(id) {
    const c = S.d.countdowns.find((x) => x.id === id) || { emoji: '✈️' };
    openSheet(`<form id="cdForm" data-id="${esc(id || '')}"><div class="sheet-head"><h2>${c.id ? 'Countdown' : 'New countdown'}</h2><button type="button" class="icon-btn" data-close>${ICON.x}</button></div>
      <div class="picks" style="margin-bottom:14px">${['✈️', '🏖️', '🎄', '🎂', '🎉', '⚽', '💃', '🎢', '🏕️', '⭐'].map((em) => `<button type="button" class="pick" data-single="emoji" data-v="${em}" aria-pressed="${c.emoji === em}">${em}</button>`).join('')}</div><input type="hidden" name="emoji" value="${esc(c.emoji || '')}">
      <label class="f"><span>What</span><input type="text" name="title" required value="${esc(c.title || '')}" placeholder="e.g. Cyprus!"></label>
      <label class="f"><span>Date</span><input type="date" name="on_date" required value="${esc(c.on_date || '')}"></label>
      <div class="sheet-actions">${c.id ? `<button type="button" class="btn danger" data-act="delCd" data-id="${c.id}">Delete</button>` : ''}<button class="btn" type="submit">Save</button></div></form>`);
  }
  function vContacts() {
    const items = S.d.contacts.map((c) => `<div class="row"><div class="grow"><div class="title">${esc(c.name)}</div><div class="faint small">${esc(c.role || '')}${c.notes ? ' · ' + esc(c.notes) : ''}</div></div>
      ${c.phone ? `<a class="btn sm" href="tel:${esc(c.phone.replace(/\s+/g, ''))}">Call</a>` : ''}<button class="icon-btn" data-contact="${c.id}" aria-label="Edit">${ICON.right}</button></div>`);
    return listCard('Contacts', 'data-contact=""', items, 'School office, dance school, football coach, doctors, dentist: the numbers you always have to look up.');
  }
  function contactSheet(id) {
    const c = S.d.contacts.find((x) => x.id === id) || {};
    openSheet(`<form id="contactForm" data-id="${esc(id || '')}"><div class="sheet-head"><h2>${c.id ? 'Contact' : 'New contact'}</h2><button type="button" class="icon-btn" data-close>${ICON.x}</button></div>
      <label class="f"><span>Name</span><input type="text" name="name" required value="${esc(c.name || '')}" placeholder="e.g. Greatham School office"></label>
      <label class="f"><span>What for</span><input type="text" name="role" value="${esc(c.role || '')}" placeholder="e.g. School, Dancing, GP"></label>
      <label class="f"><span>Phone</span><input type="tel" name="phone" value="${esc(c.phone || '')}"></label>
      <label class="f"><span>Email</span><input type="email" name="email" value="${esc(c.email || '')}"></label>
      <label class="f"><span>Notes</span><textarea name="notes">${esc(c.notes || '')}</textarea></label>
      <div class="sheet-actions">${c.id ? `<button type="button" class="btn danger" data-act="delContact" data-id="${c.id}">Delete</button>` : ''}<button class="btn" type="submit">Save</button></div></form>`);
  }
  function vSettings() {
    const admin = S.member && S.member.role === 'admin';
    const g = S.gcal;
    const gText = !g ? '<p class="muted">Checking…</p>' : g.connected ? `<div class="alert good"><span class="ic">✅</span><span><b>Linked to ${esc(g.calendar_id)}</b>${g.last && g.last.at ? 'Last synced ' + fmtT(new Date(g.last.at)) + ' ' + dayLabel(new Date(g.last.at)).toLowerCase() : ''}</span></div>`
      : `<div class="alert warn"><span class="ic">🔗</span><span><b>Not linked yet</b>${!g.configured ? 'The Google key still needs adding.' : 'Share ' + esc(g.calendar_id) + ' with ' + esc(g.sa_email || '') + ' in Google Calendar settings, with "Make changes to events".'}</span></div>`;
    return `<h1 style="margin-bottom:14px">Settings</h1>
      <div class="card"><h2>This phone</h2><div class="row"><div class="grow"><div class="title">${esc(meName())}</div><div class="faint small">${esc(S.user.email)}</div></div><button class="btn sm ghost" data-act="who">Change</button></div>
        <div class="row"><div class="grow"><div class="title">Theme</div></div><select id="themeSel" style="width:auto">${[['', 'Match phone'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${(lsGet('fam-theme') || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="card"><h2>Google Calendar</h2>${gText}<button class="btn block ghost" data-act="sync">Sync now</button></div>
      <div class="card"><h2>Pocket money</h2><div class="row"><div class="grow"><div class="title">Each week, if every job is done</div></div><span>£</span><input id="pmAmt" type="number" min="0" step="0.5" value="${Number(setting('pocket_money', 5))}" style="width:90px"></div></div>
      <div class="card"><div class="card-h"><h2>People</h2></div>${S.d.people.map((p) => `<button class="row btnrow" data-person="${p.id}">${dot(p.id)}<div class="grow"><div class="title">${esc(p.name)}</div><div class="faint small">${p.kind === 'child' ? 'Child' : p.kind === 'group' ? 'Whole family' : p.kind === 'pet' ? 'Pet' : 'Adult'}${p.drives ? ' · does lifts' : ''}</div></div></button>`).join('')}<button class="btn block ghost" style="margin-top:8px" data-person="">Add a person</button></div>
      <div class="card"><h2>Who can log in</h2>${S.d.members.map((m) => `<div class="row"><div class="grow"><div class="title">${esc(m.name)}</div><div class="faint small">${esc(m.email)}${m.role === 'admin' ? ' · can manage logins' : ''}</div></div>${admin && m.email !== S.user.email ? `<button class="icon-btn" data-delmember="${esc(m.email)}" aria-label="Remove">${ICON.trash}</button>` : ''}</div>`).join('')}
        ${admin ? `<form id="memberAdd" style="margin-top:12px"><label class="f"><span>Add a login (e.g. Nana)</span><input type="text" name="name" placeholder="Name" required></label><label class="f"><input type="email" name="email" placeholder="Their email" required></label><button class="btn block" type="submit">Add login</button></form><p class="muted small">They then open dunnworks.io/family, tap "Create the login" and use that email.</p>` : ''}</div>
      <button class="btn block ghost" data-act="signout">Sign out</button>`;
  }
  function personSheet(id) {
    const p = S.d.people.find((x) => x.id === id) || { kind: 'adult', colour: '#16938f', drives: false, active: true };
    const cols = ['#3b6fe0', '#d6457a', '#2f9e5b', '#8a5bd6', '#e08a1e', '#16938f', '#c0392b', '#7f8c8d'];
    openSheet(`<form id="personForm" data-id="${esc(id || '')}"><div class="sheet-head"><h2>${p.id ? esc(p.name) : 'New person'}</h2><button type="button" class="icon-btn" data-close>${ICON.x}</button></div>
      <label class="f"><span>Name</span><input type="text" name="name" required value="${esc(p.name || '')}"></label>
      <div class="f-l">Colour</div><div class="picks" style="margin-bottom:14px">${cols.map((c) => `<button type="button" class="pick" data-single="colour" data-v="${c}" aria-pressed="${p.colour === c}"><span class="dot sm" style="background:${c}"></span></button>`).join('')}</div><input type="hidden" name="colour" value="${esc(p.colour)}">
      ${p.id === 'family' ? '' : `<label class="f"><span>Type</span><select name="kind"><option value="adult" ${p.kind === 'adult' ? 'selected' : ''}>Adult</option><option value="child" ${p.kind === 'child' ? 'selected' : ''}>Child (gets chores and stars)</option><option value="pet" ${p.kind === 'pet' ? 'selected' : ''}>Pet</option></select></label>
      <label class="switch">Can do lifts<input type="checkbox" name="drives" ${p.drives ? 'checked' : ''}></label>`}
      <div class="sheet-actions"><button class="btn" type="submit">Save</button></div></form>`);
  }

  // ------------------------------------------------------------------ sheet
  function openSheet(html) { $sheetCard.innerHTML = html; $sheet.hidden = false; document.body.style.overflow = 'hidden'; const f = $sheetCard.querySelector('input[type=text]:not([value]), input[type=text][value=""]'); if (f && !('ontouchstart' in window)) f.focus(); }
  function closeSheet() { $sheet.hidden = true; $sheetCard.innerHTML = ''; delete $sheetCard.dataset.ev; document.body.style.overflow = ''; render(); }

  // ------------------------------------------------------------------ events: clicks
  document.addEventListener('click', async (ev) => {
    const t = ev.target.closest('button, a, [data-close]'); if (!t) return;
    const d = t.dataset;
    if (d.close !== undefined && t.closest('#sheet')) { closeSheet(); return; }
    // pickers inside forms
    if (d.multi) { t.setAttribute('aria-pressed', t.getAttribute('aria-pressed') !== 'true'); const form = t.closest('form'); form.elements[d.multi].value = [...form.querySelectorAll(`[data-multi="${d.multi}"][aria-pressed="true"]`)].map((b) => b.dataset.v).join(','); const all = form.querySelector(`[data-everyone="${d.multi}"]`); if (all) all.setAttribute('aria-pressed', String(!form.elements[d.multi].value)); return; }
    if (d.single) { const form = t.closest('form'); form.querySelectorAll(`[data-single="${d.single}"]`).forEach((b) => b.setAttribute('aria-pressed', b === t)); form.elements[d.single].value = d.v; return; }
    if (d.tab) { S.tab = d.tab; S.sub = null; lsSet('fam-tab', d.tab); render(); window.scrollTo(0, 0); return; }
    if (d.auth) { if (d.auth === 'forgot') return forgot(); S.authView = d.auth; S.authErr = S.authMsg = ''; renderAuth(); return; }
    if (d.me) { S.me = d.me; lsSet('fam-me', d.me); closeSheetIfOpen(); render(); return; }
    if (d.home !== undefined) { S.tab = 'home'; S.sub = d.home || null; lsSet('fam-tab', 'home'); render(); window.scrollTo(0, 0); if (S.sub === 'settings') refreshGcal(); return; }
    if (d.filter !== undefined) { if (!d.filter) S.filter = []; else S.filter = S.filter.includes(d.filter) ? S.filter.filter((x) => x !== d.filter) : S.filter.concat(d.filter); render(); return; }
    if (d.food) { S.foodSeg = d.food; if (d.food === 'shop') await loadShopHistory(); render(); return; }
    if (d.kidsel) { S.kid = d.kidsel; render(); return; }
    if (d.kid && !d.single) { S.tab = 'kids'; S.kid = d.kid; render(); window.scrollTo(0, 0); return; }
    if (d.calview) { S.calView = d.calview; lsSet('fam-calview', d.calview); S.calAnchor = new Date(); render(); return; }
    if (d.calmove) { calMove(Number(d.calmove)); return; }
    if (d.calday) { S.calView = 'day'; lsSet('fam-calview', 'day'); S.calAnchor = parse(d.calday); render(); window.scrollTo(0, 0); return; }
    if (d.mday) { const nd = parse(d.mday); if (nd.getMonth() !== new Date(S.calAnchor).getMonth()) { S.calAnchor = nd; render(); return; } if (iso(nd) === iso(new Date(S.calAnchor))) { S.calView = 'day'; lsSet('fam-calview', 'day'); } S.calAnchor = nd; render(); return; }
    if (d.kweek) { S.kidsWeek = Math.min(0, S.kidsWeek + Number(d.kweek)); render(); return; }
    if (d.mweek) { S.mealWeek += Number(d.mweek); render(); return; }

    // calendar
    if (d.ev) {
      const e = S.d.events.find((x) => x.id === d.ev); if (!e) return;
      if (ev.target.closest('.chip.nolift, .chip.lift')) return liftSheet(e);
      return eventSheet(e, d.day);
    }
    if (d.school !== undefined) return schoolSheet(d.school);
    if (d.meal) return mealSheet(d.meal, 'tea');
    if (d.mealadd) { const [ds, slot, who] = d.mealadd.split('|'); return mealSheet(ds, slot, null, who ? who.split(',') : []); }
    if (d.mealedit) return mealSheet(null, null, d.mealedit);
    if (d.everyone) { const form = t.closest('form'); form.querySelectorAll(`[data-multi="${d.everyone}"]`).forEach((b) => b.setAttribute('aria-pressed', 'false')); t.setAttribute('aria-pressed', 'true'); form.elements[d.everyone].value = ''; return; }
    if (d.recipe) { const r = S.d.recipes.find((x) => x.id === d.recipe); const f = t.closest('form'); f.elements.title.value = r.title; f.ingredients.value = (r.ingredients || []).join('\n'); f.save.checked = false; return; }
    if (d.editrecipe !== undefined) return recipeSheet(d.editrecipe);
    if (d.rem !== undefined) return remSheet(d.rem);
    if (d.bin !== undefined) return binSheet(d.bin);
    if (d.bday !== undefined) return bdaySheet(d.bday);
    if (d.cd !== undefined) return cdSheet(d.cd);
    if (d.contact !== undefined) return contactSheet(d.contact);
    if (d.person !== undefined) return personSheet(d.person);
    if (d.chore !== undefined) return choreSheet(d.chore);
    if (d.reward !== undefined) return rewardSheet(d.reward);
    if (d.bonus) return bonusSheet(d.bonus);

    // shopping
    if (d.shop) { const i = S.d.shopping.find((x) => x.id === d.shop); i.done = !i.done; render(); await sb.from('fam_shopping').update({ done: i.done, done_at: i.done ? new Date().toISOString() : null }).eq('id', i.id); return; }
    if (d.shopdel) { S.d.shopping = S.d.shopping.filter((x) => x.id !== d.shopdel); render(); await sb.from('fam_shopping').delete().eq('id', d.shopdel); return; }
    if (d.quick) { await addShop(d.quick); await load(['shopping']); render(); return; }

    // kids
    if (d.tick) {
      const key = { chore_id: d.tick, done_on: d.d }; const on = t.classList.contains('on');
      const c = S.d.chores.find((x) => x.id === d.tick);
      if (on) { S.d.chore_done = S.d.chore_done.filter((x) => !(x.chore_id === d.tick && x.done_on === d.d)); render(); await sb.from('fam_chore_done').delete().match(key); }
      else { S.d.chore_done.push(Object.assign({ kid: c.kid }, key)); render(); await sb.from('fam_chore_done').insert(Object.assign({ kid: c.kid, ticked_by: meName() }, key)); if (weekStatus(c.kid, parse(iso(weekStart(parse(d.d))))).all) toast('🎉 Every job done this week!'); }
      return;
    }
    if (d.pay) { await upsert('pocket', { kid: d.pay, week_start: d.ws, amount: Number(setting('pocket_money', 5)), status: 'paid', paid_by: meName() }); toast('Pocket money marked as paid'); return; }
    if (d.miss) { await upsert('pocket', { kid: d.miss, week_start: d.ws, amount: 0, status: 'missed', paid_by: meName() }); return; }
    if (d.spend) { const r = S.d.rewards.find((x) => x.id === d.spend); if (!confirmInline(t, 'Spend ' + r.cost + '⭐?')) return; await ins('stars', { kid: S.kid, delta: -r.cost, reason: r.title, by: meName() }); toast('🎁 ' + r.title + '!'); return; }
    if (d.delstar) { if (!confirmInline(t, 'Undo?')) return; await del('stars', { id: d.delstar }); return; }

    // home
    if (d.pin) { const n = S.d.notices.find((x) => x.id === d.pin); await upd('notices', { id: n.id }, { pinned: !n.pinned }); return; }
    if (d.delnotice) { if (!confirmInline(t, 'Delete?')) return; await del('notices', { id: d.delnotice }); return; }
    if (d.shiftwho) { S.shiftWho = d.shiftwho; S.shiftType = null; S.shiftSel = []; render(); return; }
    if (d.stype) { S.shiftType = S.shiftType === d.stype ? null : d.stype; if (!S.shiftType) S.shiftSel = []; render(); return; }
    if (d.shiftmove) { const m = new Date(S.shiftMonth); m.setDate(1); m.setMonth(m.getMonth() + Number(d.shiftmove)); S.shiftMonth = m; render(); return; }
    if (d.stypeedit !== undefined) return shiftTypeSheet(d.stypeedit);
    if (d.filltype) { const ty = S.d.shift_types.find((x) => x.id === d.filltype); const f = t.closest('form'); f.elements.start.value = hm(ty.starts); f.elements.end.value = hm(ty.ends); f.elements.label.value = ty.name; f.querySelectorAll('[data-filltype]').forEach((b) => b.setAttribute('aria-pressed', b === t)); return; }
    if (d.shiftday) {
      const who = shiftWho(), ds = d.shiftday;
      const existing = occurrences(parse(ds), parse(ds)).find((o) => o.day === ds && isShift(o.e, who));
      if (S.shiftType && S.shiftSel.includes(ds)) { S.shiftSel = S.shiftSel.filter((x) => x !== ds); render(); return; }
      if (existing) return eventSheet(existing.e, ds);
      if (S.shiftType) { S.shiftSel = S.shiftSel.concat(ds).sort(); render(); return; }
      return oneShiftSheet(ds);
    }
    if (d.delmember) { if (!confirmInline(t, 'Remove?')) return; await del('members', { email: d.delmember }); return; }

    // actions
    switch (d.act) {
      case 'who': return renderWhoSheet();
      case 'signout': await sb.auth.signOut(); location.reload(); return;
      case 'newEvent': return eventSheet(null, S.tab === 'cal' && S.calView !== 'list' ? iso(new Date(S.calAnchor)) : undefined);
      case 'calToday': S.calAnchor = new Date(); render(); return;
      case 'oneShift': return oneShiftSheet(todayS());
      case 'editTypes': return editTypesSheet();
      case 'clearShiftSel': S.shiftSel = []; render(); return;
      case 'delSType': if (!confirmInline(t, 'Sure?')) return; await del('shift_types', { id: d.id }); if (S.shiftType === d.id) { S.shiftType = null; S.shiftSel = []; } closeSheet(); return;
      case 'saveShifts': {
        const ty = S.d.shift_types.find((x) => x.id === S.shiftType); if (!ty || !S.shiftSel.length) return;
        const who = shiftWho(), evs = S.shiftSel.map((ds) => shiftEv(who, ds, hm(ty.starts), hm(ty.ends), ty.name));
        S.shiftSaving = true; render();
        try {
          const r = await cal({ action: 'save_many', evs });
          await load(['events']); S.shiftSel = [];
          toast(r.failed && r.failed.length ? r.saved + ' added, ' + r.failed.length + " didn't save. Try those again" : (r.saved + ' shift' + (r.saved === 1 ? '' : 's') + ' added' + (r.local ? '' : ' to the calendar')));
        } catch (e) { toast(e.message); }
        S.shiftSaving = false; render(); return;
      }
      case 'moreCal': S.calDays += 42; render(); return;
      case 'sync': t.disabled = true; await syncCal(false); await refreshGcal(); return;
      case 'delEvent': {
        const f = t.closest('form'); const id = f.dataset.id;
        const go = async (scope) => { try { await cal({ action: 'delete', id, scope }); await load(['events']); closeSheet(); toast('Deleted'); } catch (e) { toast(e.message); } };
        if (f.dataset.series && id.startsWith('g:')) return askScope('Delete just this one, or every one?', go);
        if (!confirmInline(t, 'Sure? Tap again')) return; return go('one');
      }
      case 'clearShop': { const ids = S.d.shopping.filter((i) => i.done).map((i) => i.id); await sb.from('fam_shopping').update({ cleared: true }).in('id', ids); await load(['shopping']); await loadShopHistory(); render(); return; }
      case 'weekToShop': {
        const ws = parse(d.ws); const meals = S.d.meals.filter((m) => m.day >= iso(ws) && m.day <= iso(addDays(ws, 6)));
        let n = 0; for (const m of meals) for (const ing of m.ingredients || []) { const before = S.d.shopping.length; await addShop(ing, { meal_day: m.day }); await load(['shopping']); if (S.d.shopping.length > before) n++; }
        render(); toast(n ? n + ' thing' + (n > 1 ? 's' : '') + ' added to the Tesco list' : 'Already on the list'); return;
      }
      case 'delMeal': await del('meals', { id: d.id }); closeSheet(); return;
      case 'delRecipe': if (!confirmInline(t, 'Sure?')) return; await del('recipes', { id: d.id }); closeSheet(); return;
      case 'delChore': if (!confirmInline(t, 'Sure?')) return; await upd('chores', { id: d.id }, { active: false }); closeSheet(); return;
      case 'delReward': await upd('rewards', { id: d.id }, { active: false }); closeSheet(); return;
      case 'delSchool': if (!confirmInline(t, 'Sure?')) return; await del('school', { id: d.id }); closeSheet(); return;
      case 'delBin': await del('bins', { id: d.id }); closeSheet(); return;
      case 'delRem': if (!confirmInline(t, 'Sure?')) return; await del('reminders', { id: d.id }); closeSheet(); return;
      case 'doneRem': {
        const r = S.d.reminders.find((x) => x.id === d.id);
        if (r.repeat === 'none') await del('reminders', { id: r.id });
        else { const nd = parse(r.due_on); if (r.repeat === 'yearly') nd.setFullYear(nd.getFullYear() + 1); else nd.setMonth(nd.getMonth() + 1); await upd('reminders', { id: r.id }, { due_on: iso(nd), updated_at: new Date().toISOString() }); }
        closeSheet(); toast('Done. Next one ' + (r.repeat === 'none' ? 'cleared' : 'set')); return;
      }
      case 'delBday': if (!confirmInline(t, 'Sure?')) return; await del('birthdays', { id: d.id }); closeSheet(); return;
      case 'delCd': await del('countdowns', { id: d.id }); closeSheet(); return;
      case 'delContact': if (!confirmInline(t, 'Sure?')) return; await del('contacts', { id: d.id }); closeSheet(); return;
    }
  });
  function closeSheetIfOpen() { if (!$sheet.hidden) { $sheet.hidden = true; $sheetCard.innerHTML = ''; document.body.style.overflow = ''; } }
  function confirmInline(btn, label) {
    if (btn.dataset.armed) return true;
    btn.dataset.armed = '1'; const old = btn.innerHTML; btn.textContent = label;
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.innerHTML = old; } }, 3000);
    return false;
  }
  function renderWhoSheet() {
    openSheet(`<div class="sheet-head"><h2>Who's using this phone?</h2><button type="button" class="icon-btn" data-close>${ICON.x}</button></div>
      <div class="who-grid">${S.d.people.filter((p) => p.kind === 'adult' && p.active).map((p) => `<button data-me="${p.id}">${dot(p.id)}${esc(p.name)}</button>`).join('')}</div>`);
  }
  async function refreshGcal() { try { S.gcal = await cal({ action: 'status' }); } catch (e) { S.gcal = { connected: false, configured: false, error: e.message }; } if (S.tab === 'home' && S.sub === 'settings') render(); }

  // keep the app still: no pinch zoom (iOS ignores the viewport setting on its own); CSS touch-action stops double-tap zoom
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

  // ------------------------------------------------------------------ events: forms
  document.addEventListener('submit', async (ev) => {
    const f = ev.target; ev.preventDefault();
    const v = (n) => (f.elements[n] ? f.elements[n].value.trim() : '');
    const sub = f.querySelector('[type=submit]'); if (sub) sub.disabled = true;
    try {
      switch (f.id) {
        case 'authForm': return await doAuth(f);
        case 'evForm': {
          const sid = f.dataset.id;
          if (f.dataset.series && sid && sid.startsWith('g:')) { if (sub) sub.disabled = false; return askScope('Change just this one, or every one?', (scope) => saveEvent(f, scope)); }
          return await saveEvent(f, 'one');
        }
        case 'stypeForm': {
          const row = { name: v('name'), starts: v('starts'), ends: v('ends') };
          if (f.dataset.id) await upd('shift_types', { id: f.dataset.id }, row);
          else { await ins('shift_types', Object.assign({ person: shiftWho(), sort: S.d.shift_types.length }, row)); const nt = S.d.shift_types[S.d.shift_types.length - 1]; if (nt) S.shiftType = nt.id; }
          closeSheet(); return;
        }
        case 'oneShiftForm': {
          const who = v('who') || shiftWho();
          try {
            await cal({ action: 'save', scope: 'one', ev: shiftEv(who, v('date'), v('start'), v('end'), v('label'), v('notes')) });
            await load(['events']); S.shiftWho = who; closeSheet(); toast('Shift added');
          } catch (er) { const x = f.querySelector('#shiftErr'); x.textContent = er.message; x.hidden = false; if (sub) sub.disabled = false; }
          return;
        }
        case 'liftForm': {
          const e = S.d.events.find((x) => x.id === f.dataset.ev); if (!e) return;
          const driver = v('driver') || null, pickup = v('pickup') || null;
          try {
            await cal({ action: 'save', scope: 'one', ev: Object.assign({}, e, { driver, pickup, needs_lift: true }) });
            await load(['events']); closeSheet();
            toast(driver && pickup ? (driver === pickup ? personName(driver) + ' both ways' : personName(driver) + ' drops, ' + personName(pickup) + ' collects') : 'Lifts saved');
          } catch (er) { const x = f.querySelector('#liftErr'); x.textContent = er.message; x.hidden = false; if (sub) sub.disabled = false; }
          return;
        }
        case 'shopAdd': { const val = v('item'); if (val) { for (const part of val.split(/,|\n/)) await addShop(part); f.item.value = ''; await load(['shopping']); render(); setTimeout(() => { const i = document.querySelector('#shopAdd input'); if (i) i.focus(); }, 0); } return; }
        case 'mealForm': {
          const ings = v('ingredients').split('\n').map((s) => s.trim()).filter(Boolean);
          let who = v('people') ? v('people').split(',') : [];
          if (who.length && mealPeople().every((p) => who.includes(p.id))) who = [];
          const row = { day: v('day'), slot: v('slot'), title: v('title'), people: who, ingredients: ings, cook: v('cook') || null, updated_at: new Date().toISOString() };
          const { error } = f.dataset.id ? await sb.from('fam_meals').update(row).eq('id', f.dataset.id) : await sb.from('fam_meals').insert(row);
          if (error) { toast('Could not save: ' + error.message); throw error; }
          if (f.save.checked) await sb.from('fam_recipes').upsert({ title: v('title'), ingredients: ings, updated_at: new Date().toISOString() }, { onConflict: 'title' });
          if (f.toShop.checked) for (const i of ings) await addShop(i, { meal_day: v('day') });
          await load(['meals', 'recipes', 'shopping']); closeSheet(); toast(SLOTS.find((x) => x[0] === v('slot'))[1] + ' sorted'); return;
        }
        case 'recipeForm': {
          const row = { title: v('title'), ingredients: v('ingredients').split('\n').map((s) => s.trim()).filter(Boolean), url: v('url') || null, updated_at: new Date().toISOString() };
          if (f.dataset.id) await upd('recipes', { id: f.dataset.id }, row); else await ins('recipes', row);
          closeSheet(); return;
        }
        case 'choreForm': {
          const days = v('days').split(',').filter((x) => x !== '').map(Number);
          const row = { title: v('title'), kid: v('kid'), freq: v('freq'), days: v('freq') === 'weekly' || days.length === 7 ? null : days, stars: Number(v('stars') || 0) };
          if (f.dataset.id) await upd('chores', { id: f.dataset.id }, row); else await ins('chores', row);
          closeSheet(); return;
        }
        case 'rewardForm': { const row = { title: v('title'), cost: Number(v('cost')), kid: v('kid') || null }; if (f.dataset.id) await upd('rewards', { id: f.dataset.id }, row); else await ins('rewards', row); closeSheet(); return; }
        case 'bonusForm': await ins('stars', { kid: f.dataset.kid, delta: Number(v('delta')), reason: v('reason') || (Number(v('delta')) > 0 ? 'Bonus' : 'Taken off'), by: meName() }); closeSheet(); toast('⭐ Stars updated'); return;
        case 'noticeAdd': await ins('notices', { body: v('body'), author: meName() }); return;
        case 'schoolForm': {
          const row = { kind: v('kind'), title: v('title'), people: v('people') ? v('people').split(',') : kids().map((k) => k.id), starts_on: v('starts_on'), ends_on: v('ends_on') || null, notes: v('notes') || null, created_by: meName(), updated_at: new Date().toISOString() };
          if (f.dataset.id) await upd('school', { id: f.dataset.id }, row); else await ins('school', row); closeSheet(); return;
        }
        case 'binForm': { const row = { label: v('label'), colour: v('colour'), next_on: v('next_on'), every_weeks: Number(v('every_weeks')) }; if (f.dataset.id) await upd('bins', { id: f.dataset.id }, row); else await ins('bins', row); closeSheet(); return; }
        case 'remForm': { const row = { kind: v('kind'), title: v('title'), due_on: v('due_on'), remind_days: Number(v('remind_days')), repeat: v('repeat'), notes: v('notes') || null, updated_at: new Date().toISOString() }; if (f.dataset.id) await upd('reminders', { id: f.dataset.id }, row); else await ins('reminders', row); closeSheet(); return; }
        case 'bdayForm': { const row = { name: v('name'), day: Number(v('day')), month: Number(v('month')), year: v('year') ? Number(v('year')) : null, relation: v('relation') || null, notes: v('notes') || null }; if (f.dataset.id) await upd('birthdays', { id: f.dataset.id }, row); else await ins('birthdays', row); closeSheet(); return; }
        case 'cdForm': { const row = { title: v('title'), on_date: v('on_date'), emoji: v('emoji') || null }; if (f.dataset.id) await upd('countdowns', { id: f.dataset.id }, row); else await ins('countdowns', row); closeSheet(); return; }
        case 'contactForm': { const row = { name: v('name'), role: v('role') || null, phone: v('phone') || null, email: v('email') || null, notes: v('notes') || null }; if (f.dataset.id) await upd('contacts', { id: f.dataset.id }, row); else await ins('contacts', row); closeSheet(); return; }
        case 'personForm': {
          const row = { name: v('name'), colour: v('colour') };
          if (f.elements.kind) { row.kind = v('kind'); row.drives = f.elements.drives.checked; }
          if (f.dataset.id) await upd('people', { id: f.dataset.id }, row);
          else { const id = v('name').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'person'; await ins('people', Object.assign({ id: S.d.people.some((p) => p.id === id) ? id + '-' + Date.now().toString(36).slice(-3) : id, sort: 100 + S.d.people.length }, row)); }
          closeSheet(); return;
        }
        case 'memberAdd': await ins('members', { email: v('email').toLowerCase(), name: v('name'), role: 'adult' }); toast('Added. They can now create their login'); return;
      }
    } catch (e) { if (sub) sub.disabled = false; console.warn(e); }
  });
  document.addEventListener('change', async (ev) => {
    if (ev.target.id === 'themeSel') { lsSet('fam-theme', ev.target.value); applyTheme(); }
    if (ev.target.id === 'pmAmt') { await upsert('settings', { key: 'pocket_money', value: Number(ev.target.value || 0), updated_at: new Date().toISOString() }); toast('Pocket money set to ' + money(ev.target.value || 0)); }
  });
  function applyTheme() { const t = lsGet('fam-theme'); if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }
  applyTheme();

  // ------------------------------------------------------------------ auth
  async function doAuth(f) {
    S.authErr = S.authMsg = '';
    const email = f.email ? f.email.value.trim().toLowerCase() : '', password = f.password.value;
    if (email) lsSet('fam-last-email', email);
    if (S.authView === 'reset') {
      const { error } = await sb.auth.updateUser({ password });
      if (error) S.authErr = error.message; else { S.authView = 'signin'; history.replaceState(null, '', location.pathname); await boot(); return; }
    } else if (S.authView === 'signup') {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { app: 'family' }, emailRedirectTo: location.origin + '/family/' } });
      if (error) S.authErr = /registered/i.test(error.message) ? 'That email already has a login. Sign in instead.' : error.message;
      else if (!data.session) S.authMsg = 'Check your email to confirm, then come back and sign in.';
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) S.authErr = /invalid/i.test(error.message) ? 'Email or password not right.' : error.message;
    }
    renderAuth();
  }
  async function forgot() {
    const input = document.querySelector('#authForm input[name=email]');
    const email = input && input.value.trim();
    if (!email) { S.authErr = 'Type your email first, then tap Forgot password.'; renderAuth(); return; }
    await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/family/' });
    S.authErr = ''; S.authMsg = 'If that email has a login, a reset link is on its way.'; renderAuth();
  }

  // ------------------------------------------------------------------ boot
  async function boot() {
    S.loaded = false; render();
    const { data: m } = await sb.from('fam_members').select('*').eq('email', S.user.email.toLowerCase()).maybeSingle();
    S.member = m || (S.user.email === 'info@dunnworks.io' ? { email: S.user.email, name: 'Dunnworks', role: 'admin' } : null);
    if (S.member) { await load(); await loadShopHistory(); listen(); }
    S.loaded = true; render();
    if (S.member) { syncCal(true); }
  }
  sb.auth.onAuthStateChange((evt, session) => {
    if (evt === 'PASSWORD_RECOVERY') { S.session = session; S.authView = 'reset'; renderAuth(); return; }
    const was = S.user && S.user.id;
    S.session = session; S.user = session ? session.user : null;
    if (!session) { S.loaded = false; render(); return; }
    if (was !== S.user.id && S.authView !== 'reset') setTimeout(boot, 0);
  });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && S.member) {
      const last = render.visAt || 0; if (Date.now() - last < 60e3) return; render.visAt = Date.now();
      await load(); if ($sheet.hidden) render(); syncCal(true);
    }
  });
  setInterval(() => { if (document.visibilityState === 'visible' && S.member && $sheet.hidden) syncCal(true); }, 10 * 60e3);
  (async () => { const { data } = await sb.auth.getSession(); if (!data.session) { S.session = null; render(); } })();
  if ('serviceWorker' in navigator) {
    // when a new version takes over, reload once so the phone shows it straight away
    let reloaded = false;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded && $sheet.hidden) { reloaded = true; location.reload(); } });
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => {
      r.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') r.update().catch(() => {}); });
    }).catch(() => {}));
  }
})();
