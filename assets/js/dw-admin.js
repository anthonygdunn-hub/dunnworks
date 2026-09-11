/* Dunnworks admin — behaviour for /admin/.
   Reads dw_projects and dw_project_secrets, writes them back. Everything here
   runs as the signed in owner; row level security in Supabase is what actually
   enforces that, this file only draws the screen. */
(function (w, d) {
  'use strict';
  if (!d.getElementById('gate')) return;

  var gate = d.getElementById('gate');
  var app = d.getElementById('app');
  var groups = d.getElementById('groups');
  var gatemsg = d.getElementById('gatemsg');
  var globalmsg = d.getElementById('globalmsg');
  var signout = d.getElementById('signout');

  var STATUS = [
    ['build', 'In build'],
    ['ready', 'Ready to review'],
    ['live', 'Launched'],
    ['archived', 'Archived']
  ];

  var rows = [];
  var secrets = {};
  var keys = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function say(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'ad-note' + (kind ? ' ' + kind : '');
  }
  function fail(e) {
    var m = (e && e.message) || String(e);
    if (/HTTP 40[13]/.test(m)) m = 'Supabase refused that. The signed in address is not the owner address in the database.';
    return m;
  }

  // ------------------------------------------------------------ sign in
  function showApp(user) {
    gate.classList.add('ad-hide');
    app.classList.remove('ad-hide');
    if (signout) signout.hidden = false;
    var who = d.getElementById('who');
    if (who && user) who.textContent = 'Signed in as ' + user.email;
    load();
  }

  d.getElementById('signin').addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!w.DWData || !w.DWData.ready) {
      say(gatemsg, 'The Supabase key is missing from assets/js/dw-config.js, so sign in cannot run yet.', 'err');
      return;
    }
    var btn = d.getElementById('sendbtn');
    var email = d.getElementById('email').value.trim();
    btn.disabled = true;
    say(gatemsg, 'Sending…');
    var back = w.location.origin + w.location.pathname;
    w.DWData.sendMagicLink(email, back).then(function () {
      say(gatemsg, 'Sent. Open the link in the email on this device and this page takes over from there.', 'ok');
    }).catch(function (e) {
      say(gatemsg, fail(e), 'err');
    }).then(function () { btn.disabled = false; });
  });

  if (signout) {
    signout.addEventListener('click', function (ev) {
      ev.preventDefault();
      w.DWData.signOut().then(function () { w.location.reload(); });
    });
  }

  // --------------------------------------------------------------- render
  function group(title, note, list) {
    var h = '<div class="ad-group-head"><h2>' + esc(title) + '</h2><span>' + esc(note) + '</span></div>';
    if (!list.length) return h + '<p class="ad-note" style="margin-bottom:8px">Nothing here yet.</p>';
    return h + list.map(row).join('');
  }

  function row(r) {
    var sec = secrets[r.id] || {};
    var pill = r.is_live ? 'live' : (r.status === 'ready' ? 'ready' : (r.status === 'archived' ? 'arch' : 'build'));
    var label = r.is_live ? 'Live' : (STATUS.filter(function (s) { return s[0] === r.status; })[0] || ['', r.status])[1];

    var opts = STATUS.map(function (s) {
      return '<option value="' + s[0] + '"' + (s[0] === r.status ? ' selected' : '') + '>' + esc(s[1]) + '</option>';
    }).join('');

    return '' +
    '<article class="ad-row" data-id="' + esc(r.id) + '">' +
      '<div class="ad-top">' +
        '<div class="ad-grow">' +
          '<h3>' + esc(r.name) + '</h3>' +
          '<p class="ad-sub">' + esc(r.slug) + (r.sector ? ' &middot; ' + esc(r.sector) : '') + '</p>' +
        '</div>' +
        '<span class="pill ' + pill + '">' + esc(label) + '</span>' +
      '</div>' +

      '<div class="ad-fields">' +
        '<div class="ad-wide">' +
          '<label class="ad-check"><input type="checkbox" data-f="is_live"' + (r.is_live ? ' checked' : '') + '>' +
          '<span>This one is live</span></label>' +
        '</div>' +

        '<div><label>Status</label><select data-f="status">' + opts + '</select></div>' +
        '<div><label>Live address</label><input type="url" data-f="live_url" value="' + esc(r.live_url) + '" placeholder="https://"></div>' +

        '<div><label>Kind</label><select data-f="kind">' +
          '<option value="preview"' + (r.kind === 'preview' ? ' selected' : '') + '>Preview</option>' +
          '<option value="case-study"' + (r.kind === 'case-study' ? ' selected' : '') + '>Case study</option>' +
        '</select></div>' +
        '<div><label>Went live on</label><input type="date" data-f="live_on" value="' + esc(r.live_on) + '"></div>' +

        '<div><label>Sector</label><input type="text" data-f="sector" value="' + esc(r.sector) + '"></div>' +
        '<div><label>Order</label><input type="number" data-f="sort_order" value="' + esc(r.sort_order) + '"></div>' +

        '<div class="ad-wide"><label>Blurb</label><textarea data-f="blurb" rows="3">' + esc(r.blurb) + '</textarea></div>' +

        '<div><label class="ad-check"><input type="checkbox" data-f="has_preview"' + (r.has_preview ? ' checked' : '') + '><span>Has a locked preview</span></label></div>' +
        '<div><label class="ad-check"><input type="checkbox" data-f="has_report"' + (r.has_report ? ' checked' : '') + '><span>Has a project sheet</span></label></div>' +

        '<div><label>Pages</label><input type="number" data-f="pages" value="' + esc(r.pages) + '"></div>' +
        '<div><label class="ad-check"><input type="checkbox" data-f="published"' + (r.published ? ' checked' : '') + '><span>Show on the previews page</span></label></div>' +

        '<div class="ad-wide"><label>Passphrase clients use</label>' +
          '<div class="ad-secret">' +
            '<input type="text" data-s="passphrase" value="' + esc(sec.passphrase) + '" placeholder="not set">' +
            '<button class="btn btn--ghost sm" type="button" data-act="copy">Copy</button>' +
          '</div>' +
          (r.has_preview && !r.is_live
            ? '<div class="ad-actions" style="margin-top:10px">' +
                '<button class="btn sm" type="button" data-act="newpass">New passphrase</button>' +
                '<button class="btn btn--ghost sm" type="button" data-act="applypass">Use what I typed</button>' +
                '<span class="ad-note" data-pmsg role="status" aria-live="polite"></span>' +
              '</div>'
            : '') +
        '</div>' +
        '<div><label>Issued to</label><input type="text" data-s="issued_to" value="' + esc(sec.issued_to) + '"></div>' +
        '<div><label>Issued on</label><input type="date" data-s="issued_on" value="' + esc(sec.issued_on) + '"></div>' +
      '</div>' +

      '<div class="ad-actions">' +
        '<button class="btn sm" type="button" data-act="save">Save</button>' +
        '<button class="btn btn--ghost sm" type="button" data-act="del">Delete</button>' +
        '<span class="ad-note" data-msg role="status" aria-live="polite"></span>' +
      '</div>' +
    '</article>';
  }

  function draw() {
    var launched = rows.filter(function (r) { return r.is_live; });
    var working = rows.filter(function (r) { return !r.is_live && r.status !== 'archived'; });
    var archived = rows.filter(function (r) { return !r.is_live && r.status === 'archived'; });

    var html = group('In progress', working.length + (working.length === 1 ? ' project' : ' projects'), working) +
               group('Launched', launched.length + (launched.length === 1 ? ' project' : ' projects'), launched);
    if (archived.length) html += group('Archived', archived.length + '', archived);
    groups.innerHTML = html;
  }

  function load() {
    say(globalmsg, 'Loading…');
    Promise.all([w.DWData.listAll(), w.DWData.secrets(), w.DWData.keys()]).then(function (res) {
      rows = res[0] || [];
      secrets = {};
      (res[1] || []).forEach(function (s) { secrets[s.project_id] = s; });
      keys = res[2] || [];
      draw();
      say(globalmsg, '');
    }).catch(function (e) { say(globalmsg, fail(e), 'err'); });
  }

  // ---------------------------------------------------------------- write
  function readRow(el) {
    var p = {}, s = {};
    el.querySelectorAll('[data-f]').forEach(function (i) {
      var k = i.getAttribute('data-f');
      if (i.type === 'checkbox') p[k] = i.checked;
      else if (i.type === 'number') p[k] = i.value === '' ? null : parseInt(i.value, 10);
      else p[k] = i.value.trim() === '' ? null : i.value.trim();
    });
    el.querySelectorAll('[data-s]').forEach(function (i) {
      s[i.getAttribute('data-s')] = i.value.trim() === '' ? null : i.value.trim();
    });
    // the tick is the thing Tony uses; keep status honest with it
    if (p.is_live && p.status !== 'live') p.status = 'live';
    if (!p.is_live && p.status === 'live') p.status = 'ready';
    return { patch: p, secret: s };
  }

  groups.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-act]');
    if (!btn) return;
    var el = btn.closest('.ad-row');
    var id = el.getAttribute('data-id');
    var msg = el.querySelector('[data-msg]');
    var act = btn.getAttribute('data-act');

    if (act === 'copy') {
      var f = el.querySelector('[data-s="passphrase"]');
      f.select();
      var done = function () { say(msg, 'Copied.', 'ok'); };
      if (navigator.clipboard) navigator.clipboard.writeText(f.value).then(done, function () { say(msg, 'Select it and copy by hand.', 'err'); });
      else done();
      return;
    }

    if (act === 'del') {
      if (!w.confirm('Delete this project from the admin? The locked preview files on the site are not touched.')) return;
      say(msg, 'Deleting…');
      w.DWData.remove(id).then(load).catch(function (e) { say(msg, fail(e), 'err'); });
      return;
    }

    if (act === 'newpass' || act === 'applypass') {
      var proj = rows.filter(function (x) { return x.id === id; })[0];
      var field = el.querySelector('[data-s="passphrase"]');
      var pmsg = el.querySelector('[data-pmsg]');
      var current = (secrets[id] || {}).passphrase;
      var next = act === 'newpass' ? w.DWKeys.make() : field.value.trim();

      if (!next || next.length < 12) {
        say(pmsg, 'Type something at least 12 characters long, or press New passphrase.', 'err');
        return;
      }
      if (!w.confirm('Reissue the passphrase for ' + proj.name + '?\n\n' +
          'The new one is ' + next + '\n\n' +
          'Anyone still holding the old one stops getting in.')) return;

      var mine = keys.filter(function (k) { return k.slug === proj.slug; });
      var btns = el.querySelectorAll('[data-act="newpass"],[data-act="applypass"]');
      btns.forEach(function (x) { x.disabled = true; });

      w.DWKeys.reissue(proj.slug, mine, current, next, function (t) { say(pmsg, t); })
        .then(function () {
          return w.DWData.setSecret(id, { passphrase: next, issued_on: new Date().toISOString().slice(0, 10) });
        })
        .then(function () {
          field.value = next;
          secrets[id] = Object.assign({}, secrets[id] || {}, { project_id: id, passphrase: next });
          return w.DWData.keys().then(function (k) { keys = k || []; });
        })
        .then(function () {
          say(pmsg, 'Done. Send them this one, the old one no longer works.', 'ok');
        })
        .catch(function (e) { say(pmsg, 'Not reissued, ' + fail(e), 'err'); })
        .then(function () { btns.forEach(function (x) { x.disabled = false; }); });
      return;
    }

    if (act === 'save') {
      var v = readRow(el);
      btn.disabled = true;
      say(msg, 'Saving…');
      // The passphrase is deliberately not taken from the field here. Changing
      // it has to go through the reissue buttons, which rewrap the file key at
      // the same time. Saving the two separately would leave a passphrase on
      // record that does not open the page. The stored value is sent back
      // unchanged so the upsert has the column it needs.
      var held = (secrets[id] || {}).passphrase;
      var work = w.DWData.update(id, v.patch);
      if (held) {
        v.secret.passphrase = held;
        work = work.then(function () { return w.DWData.setSecret(id, v.secret); });
      }
      work.then(function () {
        say(msg, 'Saved.', 'ok');
        return load();
      }).catch(function (e) { say(msg, fail(e), 'err'); })
        .then(function () { btn.disabled = false; });
    }
  });

  d.getElementById('addbtn').addEventListener('click', function () {
    var name = w.prompt('Project name');
    if (!name) return;
    var slug = w.prompt('Slug, used as preview/<slug>/', name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    if (!slug) return;
    say(globalmsg, 'Creating…');
    w.DWData.create({ slug: slug, name: name, kind: 'preview', status: 'build', published: false, sort_order: 90 })
      .then(load).catch(function (e) { say(globalmsg, fail(e), 'err'); });
  });

  // ----------------------------------------------------------------- boot
  if (!w.DWData || !w.DWData.ready) {
    say(gatemsg, 'The Supabase key is missing from assets/js/dw-config.js. Paste the anon key in and this page works.', 'err');
    return;
  }
  w.DWData.captureFromHash();
  w.DWData.whoami().then(function (u) {
    if (u && u.email) showApp(u);
  }).catch(function () {});
})(window, document);
