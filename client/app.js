/* Dunnworks client page: dunnworks.io/client/<slug>/
   The client signs in with their project passphrase (the same one as their
   preview). Everything goes through the client-portal edge function, which
   checks the passphrase on every call; the tables themselves stay owner-only. */
(function () {
  'use strict';
  var C = window.DW || {};
  var SLUG = document.documentElement.getAttribute('data-slug');
  var FN = C.url + '/functions/v1/client-portal';
  var KEY = 'dwc-' + SLUG;
  var app = document.getElementById('app');
  var S = { pass: null, data: null, open: {}, showDone: false, busy: {} };

  try { S.pass = sessionStorage.getItem(KEY); } catch (e) {}

  /* ---- helpers ---- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function addDays(s, n) { var d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
  function dayName(s) { return s ? new Date(s.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : ''; }
  function stamp(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  function size(n) { n = Number(n) || 0; return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function call(action, extra) {
    return fetch(FN, {
      method: 'POST',
      headers: { apikey: C.anonKey, Authorization: 'Bearer ' + C.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ slug: SLUG, pass: S.pass, action: action }, extra || {}))
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || 'Something went wrong (' + r.status + ').'); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function toast(text, bad) {
    var t = document.getElementById('toast');
    t.textContent = text; t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.className = 'toast'; }, 3200);
  }

  /* ---- names ---- */
  var NAMES = { me: 'Tony', google: 'Google', bil: 'Brother-in-law', other: 'Someone else', client: 'You' };
  function whoName(o) {
    var owners = (S.data && S.data.owners) || {};
    if (o === 'me') return 'Tony';
    return owners[o] || NAMES[o] || o;
  }
  function isMine(t) { return !!t.yours; }

  /* ---- projected dates (same rules as Tony's console) ---- */
  function schedule() {
    var p = S.data.project, list = S.data.tasks.slice().sort(function (a, b) { return a.sort_order - b.sort_order; });
    var cap = Number(p.hours_per_day) || 4, now = new Date(), t0 = ymd(now);
    var day = now.getHours() >= 22 ? addDays(t0, 1) : t0, used = 0, gate = t0, launch = null, seen = false;
    list.forEach(function (t) {
      t._proj = null;
      if (t.done) { if (t.milestone && !seen) { launch = t.done_at ? t.done_at.slice(0, 10) : t0; seen = true; } return; }
      if (t.owner && t.owner !== 'me') { t._proj = t.due_on && t.due_on > t0 ? t.due_on : t0; if (t._proj > gate) gate = t._proj; return; }
      if (t.waits && gate > day) { day = gate; used = 0; }
      var h = Number(t.est_hours) || 0;
      while (h > 0) { if (used >= cap) { day = addDays(day, 1); used = 0; } var take = Math.min(cap - used, h); used += take; h -= take; }
      t._proj = day;
      if (t.milestone && !seen) { launch = day; seen = true; }
    });
    var ms = list.filter(function (t) { return t.milestone; })[0];
    return { list: list, launch: launch, launchSort: ms ? ms.sort_order : Infinity, t0: t0 };
  }

  /* ---- sign in ---- */
  function gate(msg) {
    app.innerHTML =
      '<section class="gate">' +
        '<p class="kicker">Dunnworks &middot; client page</p>' +
        '<h1>Your website plan</h1>' +
        '<p class="lede">Sign in with the passphrase Tony sent you for your preview. Here you can tick off your jobs, reply to Tony and send photos or files.</p>' +
        '<form id="gate-f" autocomplete="on">' +
          '<label for="pw">Passphrase</label>' +
          '<input id="pw" name="password" type="password" autocomplete="current-password" required>' +
          '<button class="btn" type="submit">Open my page</button>' +
          '<p class="msg' + (msg ? ' bad' : '') + '" id="gate-msg">' + esc(msg || '') + '</p>' +
        '</form>' +
      '</section>';
    var f = document.getElementById('gate-f');
    document.getElementById('pw').focus();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      S.pass = f.password.value.trim();
      var m = document.getElementById('gate-msg'); m.className = 'msg'; m.textContent = 'Checking...';
      load().then(function () { try { sessionStorage.setItem(KEY, S.pass); } catch (e) {} })
        .catch(function (err) { S.pass = null; m.className = 'msg bad'; m.textContent = err.message; });
    });
  }

  function load() {
    return call('load').then(function (d) { S.data = d; document.title = d.project.name + ' · Your website plan'; render(); });
  }

  /* ---- page ---- */
  function render() {
    var d = S.data, sc = schedule(), list = sc.list, p = d.project;
    var mine = list.filter(isMine), mineOpen = mine.filter(function (t) { return !t.done; });
    var doneAll = list.filter(function (t) { return t.done; }).length;
    var pct = list.length ? Math.round(doneAll / list.length * 100) : 0;
    var diff = p.go_live_on && sc.launch ? Math.round((new Date(sc.launch + 'T12:00:00') - new Date(p.go_live_on + 'T12:00:00')) / 86400000) : null;
    var cls = diff == null ? '' : diff > 0 ? 'behind' : 'ok';
    var launched = list.some(function (t) { return t.milestone && t.done; });

    var tiles =
      (p.go_live_on ? '<div><b>' + esc(dayName(p.go_live_on)) + '</b><span>Go-live target</span></div>' : '') +
      (sc.launch ? '<div class="' + cls + '"><b>' + (launched ? 'Live' : esc(dayName(sc.launch))) + '</b><span>' + (launched ? 'Went live ' + esc(dayName(sc.launch)) : diff > 0 ? 'Projected, running ' + diff + (diff === 1 ? ' day' : ' days') + ' late' : 'Projected go-live, on track') + '</span></div>' : '') +
      '<div class="' + (mineOpen.length ? 'you' : 'ok') + '"><b>' + mineOpen.length + '</b><span>' + (mineOpen.length === 1 ? 'Job waiting on you' : 'Jobs waiting on you') + '</span></div>' +
      '<div><b>' + pct + '%</b><span>' + doneAll + ' of ' + list.length + ' jobs done</span></div>';

    var yourHtml = mineOpen.length
      ? '<ul class="jobs">' + mineOpen.map(function (t) { return job(t, sc, true); }).join('') + '</ul>'
      : '<p class="empty">Nothing waiting on you right now. Thank you!</p>';
    var mineDone = mine.filter(function (t) { return t.done; });

    var others = list.filter(function (t) { return !isMine(t); });
    var phases = [], byPh = {};
    others.forEach(function (t) { var ph = t.phase || 'Other'; if (!byPh[ph]) { byPh[ph] = []; phases.push(ph); } byPh[ph].push(t); });

    app.innerHTML =
      '<header class="top">' +
        '<div><p class="kicker">Dunnworks &middot; client page</p><h1>' + esc(p.name) + '</h1>' +
        '<p class="lede">Your website plan. Tick your jobs as you finish them, reply to Tony on any job, and add photos or files where they are needed. Tony gets a heads-up each time.</p></div>' +
        '<div class="top-acts"><button class="mini" type="button" data-act="refresh">Refresh</button><button class="mini" type="button" data-act="out">Sign out</button></div>' +
      '</header>' +
      '<div class="tiles">' + tiles + '</div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<section class="sec"><h2>Your jobs</h2>' + yourHtml +
        (mineDone.length ? '<details class="donebox"' + (S.showDone ? ' open' : '') + '><summary>Done (' + mineDone.length + ')</summary><ul class="jobs">' +
          mineDone.map(function (t) { return job(t, sc, true); }).join('') + '</ul></details>' : '') +
      '</section>' +
      '<section class="sec"><h2>Tony&rsquo;s progress</h2>' +
        '<p class="note">What Tony is working on, phase by phase. Open any job to ask a question or send something for it.</p>' +
        phases.map(function (ph) {
          var ts = byPh[ph], dn = ts.filter(function (t) { return t.done; }).length;
          var full = dn === ts.length;
          return '<details class="phase"' + (full ? '' : ' open') + '><summary><span>' + esc(ph) + '</span><i class="pbar"><i style="width:' + Math.round(dn / ts.length * 100) + '%"></i></i><em>' + dn + '/' + ts.length + '</em></summary>' +
            '<ul class="jobs">' + ts.map(function (t) { return job(t, sc, false); }).join('') + '</ul></details>';
        }).join('') +
      '</section>' +
      '<p class="foot">Questions? Reply on any job above, or email <a href="mailto:info@dunnworks.io">info@dunnworks.io</a>. This page is private to you: please don&rsquo;t share the passphrase.</p>';
  }

  function job(t, sc, tickable) {
    var d = S.data, open = !!S.open[t.id];
    var notes = d.notes.filter(function (n) { return n.task_id === t.id; });
    var files = d.files.filter(function (f) { return f.task_id === t.id; });
    var late = !t.done && t.due_on && t.due_on < sc.t0;
    var after = t.sort_order > sc.launchSort;
    var meta = t.done ? 'Done' + (t.done_at ? ' ' + dayName(t.done_at) : '')
      : (tickable ? (t.due_on ? 'Needed by ' + dayName(t.due_on) : after ? 'After launch' : 'Before launch')
                  : (t._proj ? 'Expected ' + dayName(t._proj) : ''));
    var chips = (notes.length ? '<span class="chip">' + notes.length + (notes.length === 1 ? ' reply' : ' replies') + '</span>' : '') +
                (files.length ? '<span class="chip">' + files.length + (files.length === 1 ? ' file' : ' files') + '</span>' : '');
    var who = !tickable ? '' : (whoName(t.owner) !== 'You' ? '<span class="chip who">' + esc(whoName(t.owner)) + '</span>' : '');
    return '<li class="job' + (t.done ? ' done' : '') + (late ? ' late' : '') + (t.milestone ? ' ms' : '') + (open ? ' is-open' : '') + '" data-id="' + esc(t.id) + '">' +
      '<div class="row">' +
        (tickable
          ? '<label class="tick"><input type="checkbox" data-act="tick"' + (t.done ? ' checked' : '') + (S.busy[t.id] ? ' disabled' : '') + ' aria-label="Mark done: ' + esc(t.title) + '"><span></span></label>'
          : '<span class="dot' + (t.done ? ' on' : '') + '" aria-label="' + (t.done ? 'Done' : 'Not done yet') + '"></span>') +
        '<button class="open" type="button" data-act="open" aria-expanded="' + open + '">' +
          '<span class="tt">' + esc(t.title) + '</span>' + who + chips +
          '<span class="when' + (late ? ' bad' : '') + '">' + esc(meta) + (late ? ' &middot; overdue' : '') + '</span>' +
          '<span class="arr" aria-hidden="true">&#9662;</span>' +
        '</button>' +
      '</div>' +
      '<div class="body">' +
        (t.note ? '<p class="det">' + esc(t.note) + '</p>' : '') +
        (notes.length ? '<ol class="thread">' + notes.map(function (n) {
          var me = n.author === 'client';
          return '<li class="' + (me ? 'you' : 'tony') + '"><b>' + (me ? 'You' : 'Tony') + '</b><time>' + esc(stamp(n.created_at)) + '</time><p>' + esc(n.body) + '</p></li>';
        }).join('') + '</ol>' : '') +
        (files.length ? '<ul class="files">' + files.map(function (f) {
          return '<li><button type="button" class="flink" data-act="file" data-fid="' + esc(f.id) + '">' + esc(f.name) + '</button><span>' + size(f.size) + ' &middot; ' + (f.author === 'client' ? 'you' : 'Tony') + ', ' + esc(stamp(f.created_at)) + '</span></li>';
        }).join('') + '</ul>' : '') +
        '<form class="reply" data-reply>' +
          '<label class="sr" for="r-' + esc(t.id) + '">Reply to Tony</label>' +
          '<textarea id="r-' + esc(t.id) + '" name="body" placeholder="Reply to Tony about this job" rows="2"></textarea>' +
          '<div class="acts">' +
            '<button class="btn sm" type="submit">Send reply</button>' +
            '<label class="btn sm ghost up">Add photos or files<input type="file" data-act="upload" multiple hidden></label>' +
            '<span class="msg" data-msg></span>' +
          '</div>' +
        '</form>' +
      '</div></li>';
  }

  function taskById(id) { return S.data.tasks.filter(function (t) { return t.id === id; })[0]; }
  function rerender() { var y = window.scrollY; render(); window.scrollTo(0, y); }

  /* ---- actions ---- */
  app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var act = b.getAttribute('data-act'), li = b.closest('.job'), id = li && li.getAttribute('data-id');
    if (act === 'open') { S.open[id] = !S.open[id]; li.classList.toggle('is-open', S.open[id]); b.setAttribute('aria-expanded', S.open[id]); if (S.open[id]) { var ta = li.querySelector('textarea'); if (ta && window.innerWidth > 700) ta.focus({ preventScroll: true }); } return; }
    if (act === 'refresh') { load().then(function () { toast('Up to date'); }).catch(fail); return; }
    if (act === 'out') { try { sessionStorage.removeItem(KEY); } catch (x) {} S.pass = null; S.data = null; gate(); return; }
    if (act === 'file') {
      b.disabled = true;
      call('file-url', { file: b.getAttribute('data-fid') }).then(function (j) {
        var a = document.createElement('a'); a.href = j.url; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
      }).catch(fail).then(function () { b.disabled = false; });
    }
  });
  app.addEventListener('toggle', function (e) { if (e.target.classList && e.target.classList.contains('donebox')) S.showDone = e.target.open; }, true);

  app.addEventListener('change', function (e) {
    var el = e.target, li = el.closest('.job'); if (!li) return;
    var id = li.getAttribute('data-id'), t = taskById(id);
    if (el.getAttribute('data-act') === 'tick') {
      var done = el.checked; S.busy[id] = true; el.disabled = true;
      call('tick', { task: id, done: done }).then(function () {
        t.done = done; t.done_at = done ? new Date().toISOString() : null; delete S.busy[id];
        rerender(); toast(done ? 'Ticked. Tony has been told.' : 'Marked as not done');
      }).catch(function (err) { delete S.busy[id]; el.checked = !done; el.disabled = false; fail(err); });
    }
    if (el.getAttribute('data-act') === 'upload' && el.files && el.files.length) upload(li, id, [].slice.call(el.files));
  });

  app.addEventListener('submit', function (e) {
    var f = e.target.closest('[data-reply]'); if (!f) return;
    e.preventDefault();
    var li = f.closest('.job'), id = li.getAttribute('data-id'), body = f.body.value.trim(), m = f.querySelector('[data-msg]');
    if (!body) { f.body.focus(); return; }
    var btn = f.querySelector('button[type=submit]'); btn.disabled = true; m.textContent = 'Sending...';
    call('reply', { task: id, body: body }).then(function (j) {
      S.data.notes.push(j.note); S.open[id] = true; rerender(); toast('Sent. Tony has been told.');
    }).catch(function (err) { btn.disabled = false; m.textContent = ''; fail(err); });
  });

  function upload(li, id, files) {
    var m = li.querySelector('[data-msg]'), n = 0;
    function next() {
      if (n >= files.length) { S.open[id] = true; rerender(); toast(files.length === 1 ? 'File sent to Tony' : files.length + ' files sent to Tony'); return; }
      var file = files[n++];
      if (file.size > 50 * 1024 * 1024) { fail(new Error(file.name + ' is over 50 MB. Send it by WeTransfer instead.')); return next(); }
      m.textContent = 'Uploading ' + file.name + (files.length > 1 ? ' (' + n + ' of ' + files.length + ')' : '') + '...';
      call('upload-url', { task: id, name: file.name, size: file.size }).then(function (u) {
        var fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', file);
        return fetch(u.signedUrl, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: fd }).then(function (r) {
          if (!r.ok) return r.text().then(function (t) { throw new Error('Upload failed: ' + t.slice(0, 120)); });
          return call('upload-done', { task: id, path: u.path, name: file.name, size: file.size, mime: file.type });
        });
      }).then(function (j) { S.data.files.push(j.file); next(); })
        .catch(function (err) { m.textContent = ''; fail(err); });
    }
    next();
  }

  function fail(err) {
    if (err && err.status === 401) { try { sessionStorage.removeItem(KEY); } catch (x) {} S.pass = null; gate('Please sign in again.'); return; }
    toast((err && err.message) || 'Something went wrong.', true);
  }

  /* ---- start ---- */
  if (!C.url || !SLUG) { app.textContent = 'This page is not set up yet.'; return; }
  if (S.pass) { app.innerHTML = '<p class="loading">Loading your plan...</p>'; load().catch(function (err) { S.pass = null; gate(err.status === 401 ? '' : err.message); }); }
  else gate();
})();
