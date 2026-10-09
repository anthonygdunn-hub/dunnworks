/* Dunnworks console: Honest Handicap (#/hh).
 *
 * Three lists:
 *   Testers   applications from honesthandicap.golf/join/. Approve issues a tester code (shown once, only its hash is kept)
 *   Cards     review cards handed in at /submit/. Check, tidy the title and address, then publish
 *   Live      published reviews. Add (Ad) buy links, take one down, or rebuild the site
 *
 * Reads and simple edits go straight to hh_testers / hh_reviews (owner-only RLS).
 * Anything that needs the service role (codes, photos, publishing, the GitHub rebuild) goes through hh-admin.
 */
(function (w) {
  'use strict';

  var SITE = 'https://honesthandicap.golf';
  var CATS = { drivers:'Drivers & woods', irons:'Irons & hybrids', wedges:'Wedges', putters:'Putters', balls:'Balls',
    grips:'Grips', shoes:'Shoes', bags:'Bags & trolleys', tech:'Rangefinders & tech', clothing:'Clothing' };
  var S = { tab: 'testers', testers: [], reviews: [], build: null, open: {}, codes: {}, photos: {} };
  var root = null, say = function () {};

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function ago(iso) {
    if (!iso) return '';
    var m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60); if (h < 24) return h + 'h ago';
    var d = Math.round(h / 24); return d === 1 ? 'yesterday' : d + ' days ago';
  }
  function hcp(v) { if (v == null || v === '') return '?'; var n = Number(v); return n < 0 ? '+' + (-n) : String(n); }
  function slugify(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, ''); }
  function admin(body) { return DWData.fn('hh-admin', body); }
  function patch(table, id, body) {
    return DWData.rest(table + '?id=eq.' + encodeURIComponent(id), { method:'PATCH', body: body, headers: { Prefer:'return=minimal' } });
  }

  function load() {
    return Promise.all([
      DWData.rest('hh_testers?select=*&order=created_at.desc'),
      DWData.rest('hh_reviews?select=*&order=created_at.desc'),
      DWData.rest('hh_settings?select=*&key=eq.last_build').catch(function () { return []; })
    ]).then(function (out) {
      S.testers = out[0] || []; S.reviews = out[1] || []; S.build = ((out[2] || [])[0] || {}).value || null;
    });
  }

  /* ---------------------------------------------------------------- style */
  function style() {
    if (document.getElementById('hh-css')) return;
    var st = document.createElement('style'); st.id = 'hh-css';
    st.textContent = [
      '.hh-code{font-family:var(--font-mono);font-size:22px;letter-spacing:.12em;color:var(--accent-2);margin:6px 0}',
      '.hh-msg{width:100%;min-height:96px;font:inherit;font-size:14px;padding:10px 12px;border:1px solid var(--line-2);border-radius:var(--radius);background:var(--ink);color:inherit}',
      '.hh-box{border:1px dashed var(--accent);border-radius:var(--radius);padding:13px 15px;margin:11px 0}',
      '.hh-scores{display:flex;flex-wrap:wrap;gap:6px 16px;font-family:var(--font-mono);font-size:12px;color:var(--muted);margin:8px 0}',
      '.hh-scores b{color:inherit;font-size:14px}',
      '.hh-txt{white-space:pre-wrap;font-size:14.5px;color:var(--muted);margin:6px 0 10px;max-height:none}',
      '.hh-pics{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}',
      '.hh-pics img{width:120px;height:90px;object-fit:cover;border-radius:4px;border:1px solid var(--line)}',
      '.hh-link{display:grid;grid-template-columns:1.1fr 2fr .7fr auto;gap:6px;margin-bottom:6px;align-items:center}',
      '@media (max-width:640px){.hh-link{grid-template-columns:1fr 1fr}}',
      '.hh-link input{padding:8px 10px;border:1px solid var(--line-2);border-radius:var(--radius);background:var(--ink);color:inherit;font:inherit;font-size:13.5px;min-width:0}',
      '.hh-build{font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;color:var(--muted-2);margin:-6px 0 16px}',
      '.hh-build.bad{color:var(--accent-2)}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ---------------------------------------------------------------- view */
  function counts() {
    return {
      applied: S.testers.filter(function (t) { return t.status === 'applied'; }).length,
      approved: S.testers.filter(function (t) { return t.status === 'approved'; }).length,
      cards: S.reviews.filter(function (r) { return r.status === 'submitted'; }).length,
      live: S.reviews.filter(function (r) { return r.status === 'published'; }).length
    };
  }

  function draw() {
    var c = counts();
    var b = S.build;
    var build = b ? '<p class="hh-build' + (b.ok ? '' : ' bad') + '">Last rebuild ' + esc(ago(b.at)) + ': ' + esc(b.reason || '') +
      (b.ok ? (b.queued ? ' (queued, goes out within 15 minutes)' : ' (started)') : ' (didn\'t start: ' + esc(b.why || 'unknown') + ')') + '</p>' : '';
    var tabs = [['testers', 'Testers', c.applied ? c.applied + ' to check' : c.approved],
                ['cards', 'Cards to check', c.cards], ['live', 'Live reviews', c.live]];
    root.innerHTML =
      '<div class="bar">' + tabs.map(function (t) {
        return '<button class="chip' + (S.tab === t[0] ? ' is-on' : '') + '" data-tab="' + t[0] + '" type="button">' + t[1] + ' · ' + t[2] + '</button>';
      }).join('') +
      '<span style="flex:1"></span><a class="mini" href="' + SITE + '/" target="_blank" rel="noopener">Open the site</a>' +
      '<button class="mini" data-act="rebuild" type="button">Rebuild site</button></div>' + build +
      '<div class="cards">' + (S.tab === 'testers' ? testers() : S.tab === 'cards' ? cardsList('submitted') : cardsList('published')) + '</div>';
  }

  function testers() {
    var order = { applied: 0, approved: 1, declined: 2, left: 3 };
    var list = S.testers.slice().sort(function (a, b) { return order[a.status] - order[b.status] || (a.created_at < b.created_at ? 1 : -1); });
    if (!list.length) return '<p class="det">No applications yet. Share ' + SITE + '/join/ with the society.</p>';
    return list.map(function (t) {
      var code = S.codes[t.id];
      var n = S.reviews.filter(function (r) { return r.tester_id === t.id && r.status === 'published'; }).length;
      var btns = t.status === 'applied'
        ? '<button class="mini" data-act="approve_tester" data-id="' + t.id + '" type="button">Approve and issue code</button> <button class="mini" data-act="decline_tester" data-id="' + t.id + '" type="button">Decline</button>'
        : t.status === 'approved'
          ? '<button class="mini" data-act="reissue_code" data-id="' + t.id + '" type="button">New code</button> <button class="mini" data-act="remove_tester" data-id="' + t.id + '" type="button">Remove</button>'
          : '<button class="mini" data-act="approve_tester" data-id="' + t.id + '" type="button">Approve after all</button>';
      return '<article class="c' + (t.status === 'applied' ? ' is-due' : t.status === 'approved' ? '' : ' is-cold') + '">' +
        '<div class="c-top"><h3>' + esc(t.name) + ' · ' + esc(hcp(t.handicap)) + '</h3><span class="tagline">' + esc(t.status) + ' · ' + esc(ago(t.created_at)) + '</span></div>' +
        '<p class="det">' + esc(t.course || '') + ' · plays ' + esc((t.often || '').toLowerCase()) + ' · wants to test ' + esc((t.kit || '').toLowerCase()) +
        ' · <a href="mailto:' + esc(t.email) + '">' + esc(t.email) + '</a>' + (n ? ' · ' + n + ' review' + (n === 1 ? '' : 's') + ' live' : '') +
        (t.consent ? '' : ' · <strong>no consent to show name</strong>') + '</p>' +
        (t.bag ? '<p class="hh-txt">In the bag: ' + esc(t.bag) + '</p>' : '') +
        (code ? '<div class="hh-box"><span class="tagline">Tester code (shown once, copy it now)</span><div class="hh-code">' + esc(code.code) + '</div>' +
          (code.emailed ? '<p class="det">Emailed to ' + esc(code.email) + '.</p>' : '<p class="det">Not emailed: send this by WhatsApp or email.</p>') +
          '<textarea class="hh-msg" readonly>' + esc(code.message) + '</textarea><div class="row" style="margin-top:8px">' +
          '<button class="mini" data-act="copy" data-id="' + t.id + '" type="button">Copy message</button>' +
          '<a class="mini" href="mailto:' + esc(t.email) + '?subject=' + encodeURIComponent("You're an Honest Handicap tester") + '&body=' + encodeURIComponent(code.message) + '">Email it</a>' +
          '<a class="mini" href="https://wa.me/?text=' + encodeURIComponent(code.message) + '" target="_blank" rel="noopener">WhatsApp it</a></div></div>' : '') +
        '<div class="row">' + btns + '</div></article>';
    }).join('');
  }

  function cardsList(status) {
    var list = S.reviews.filter(function (r) { return status === 'published' ? r.status === 'published' : (r.status === 'submitted'); });
    var other = status === 'submitted' ? S.reviews.filter(function (r) { return r.status === 'rejected' || r.status === 'unpublished'; }) : [];
    if (!list.length && !other.length) return '<p class="det">' + (status === 'published' ? 'Nothing published yet.' : 'No cards waiting. They arrive here from ' + SITE + '/submit/.') + '</p>';
    return list.map(card).join('') + (other.length ? '<p class="h-sub">Rejected or taken down</p>' + other.map(card).join('') : '');
  }

  function card(r) {
    var open = S.open[r.id], live = r.status === 'published';
    var url = live ? SITE + '/reviews/' + r.category + '/' + r.slug + '/' : '';
    var top = '<div class="c-top"><h3>' + esc(r.product) + ' · <span class="score">' + esc(r.overall) + '</span>/10</h3>' +
      '<span class="tagline">' + esc(CATS[r.category] || r.category) + ' · ' + esc(r.first_name) + ' (' + esc(hcp(r.handicap)) + ') · ' +
      esc(live ? 'live ' + ago(r.published_at) : r.status + ' ' + ago(r.created_at)) + '</span></div>';
    var summary = '<p class="det">"' + esc(r.oneline) + '"' + (url ? ' · <a href="' + url + '" target="_blank" rel="noopener">View live</a>' : '') +
      ' · ' + (r.photos || []).length + ' photo' + ((r.photos || []).length === 1 ? '' : 's') +
      (live ? ' · ' + (r.buy_links || []).filter(function (l) { return l.affiliate && l.url; }).length + ' buy links' : '') + '</p>';
    var head = '<article class="c' + (r.status === 'submitted' ? ' is-due' : r.status === 'published' ? '' : ' is-cold') + '" data-id="' + r.id + '">' + top + summary;
    if (!open) return head + '<div class="row"><button class="mini" data-act="toggle" data-id="' + r.id + '" type="button">' + (r.status === 'submitted' ? 'Check this card' : 'Open') + '</button></div></article>';

    var pics = S.photos[r.id];
    var links = (r.buy_links || []).concat([{}]);
    return head +
      '<div class="hh-scores"><span>Performance <b>' + r.performance + '</b></span><span>Feel <b>' + r.feel + '</b></span><span>Build <b>' + r.build +
      '</b></span><span>Value <b>' + r.value + '</b></span><span>Overall <b>' + r.overall + '</b></span><span>Buy again <b>' + (r.again ? 'Yes' : 'No') + '</b></span></div>' +
      '<p class="det">' + esc(r.source || '') + (r.paid ? ', paid ' + esc(r.paid) : '') + ' · ' + esc(r.rounds || 'rounds not given') + ' · ' + esc(r.course || '') + '</p>' +
      '<div class="hh-pics">' + (pics ? pics.map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt=""></a>'; }).join('') :
        ((r.photos || []).length ? '<span class="det">Loading photos...</span>' : '')) + '</div>' +
      '<div class="edit">' +
      field(r, 'title', 'Page title', r.title || (r.product + ' review'), 'wide') +
      field(r, 'product', 'Product (brand and model)', r.product, 'wide') +
      '<div><label>Category</label><select data-f="category">' + Object.keys(CATS).map(function (k) {
        return '<option value="' + k + '"' + (k === r.category ? ' selected' : '') + '>' + esc(CATS[k]) + '</option>'; }).join('') + '</select></div>' +
      field(r, 'slug', 'Web address', r.slug || slugify(r.product)) +
      area(r, 'oneline', 'One-line verdict (fix spelling, not opinions)') +
      area(r, 'writeup', 'How it played', 'min-height:180px') +
      field(r, 'suits', 'Suits', r.suits) + field(r, 'notsuits', "Doesn't suit", r.notsuits) + field(r, 'annoyed', 'Annoyed by', r.annoyed, 'wide') +
      area(r, 'admin_note', 'Your private note (never published)') +
      '</div>' +
      '<p class="h-sub">Buy now links (shown only when ticked as a tracked affiliate link)</p>' +
      links.map(function (l, i) {
        return '<div class="hh-link" data-link="' + i + '"><input placeholder="Retailer" data-l="retailer" value="' + esc(l.retailer || '') + '">' +
          '<input placeholder="https:// tracked affiliate link" data-l="url" value="' + esc(l.url || '') + '">' +
          '<input placeholder="£ price" data-l="price" value="' + esc(l.price || '') + '">' +
          '<label class="tagline" style="white-space:nowrap"><input type="checkbox" data-l="affiliate"' + (l.affiliate ? ' checked' : '') + '> Tracked (Ad)</label></div>';
      }).join('') +
      '<div class="edit" style="grid-template-columns:minmax(0,220px)"><div><label>Prices checked on</label><input type="date" data-f="prices_checked" value="' + esc(r.prices_checked || '') + '"></div></div>' +
      '<div class="row" style="margin-top:12px">' +
      '<button class="mini" data-act="save" data-id="' + r.id + '" type="button">Save changes</button>' +
      (live ? '<button class="mini" data-act="save_publish" data-id="' + r.id + '" type="button">Save and rebuild</button><button class="mini" data-act="unpublish" data-id="' + r.id + '" type="button">Take down</button>'
            : '<button class="mini" data-act="save_publish" data-id="' + r.id + '" type="button" style="border-color:var(--accent);color:var(--accent-2)">Save and publish</button>' +
              (r.status === 'submitted' ? '<button class="mini" data-act="reject" data-id="' + r.id + '" type="button">Reject</button>' : '')) +
      '<button class="mini" data-act="toggle" data-id="' + r.id + '" type="button">Close</button><span class="saved" data-saved="' + r.id + '"></span></div></article>';
  }
  function field(r, k, label, v, cls) {
    return '<div' + (cls ? ' class="' + cls + '"' : '') + '><label>' + label + '</label><input data-f="' + k + '" value="' + esc(v == null ? '' : v) + '"></div>';
  }
  function area(r, k, label, st) {
    return '<div class="wide"><label>' + label + '</label><textarea data-f="' + k + '"' + (st ? ' style="' + st + '"' : '') + '>' + esc(r[k] || '') + '</textarea></div>';
  }

  function collect(el) {
    var b = {};
    el.querySelectorAll('[data-f]').forEach(function (i) { b[i.dataset.f] = i.value.trim() || null; });
    if (b.slug) b.slug = slugify(b.slug);
    b.buy_links = [];
    el.querySelectorAll('.hh-link').forEach(function (row) {
      var l = {};
      row.querySelectorAll('[data-l]').forEach(function (i) { l[i.dataset.l] = i.type === 'checkbox' ? i.checked : i.value.trim(); });
      if (l.url || l.retailer) b.buy_links.push(l);
    });
    return b;
  }

  /* ---------------------------------------------------------------- actions */
  function act(e) {
    var tab = e.target.closest('[data-tab]');
    if (tab) { S.tab = tab.dataset.tab; draw(); return; }
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var a = btn.dataset.act, id = btn.dataset.id;
    var r = S.reviews.filter(function (x) { return x.id === id; })[0];
    var el = btn.closest('article');

    if (a === 'toggle') {
      S.open[id] = !S.open[id]; draw();
      if (S.open[id] && r && (r.photos || []).length && !S.photos[id]) {
        admin({ action:'photos', id:id }).then(function (j) { S.photos[id] = j.urls || []; draw(); }).catch(function (err) { say(err.message, 'bad'); });
      }
      return;
    }
    if (a === 'copy') {
      var ta = el.querySelector('.hh-msg');
      (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject()).then(function () { say('Copied. Paste it into WhatsApp or an email.', 'ok'); })
        .catch(function () { ta.select(); document.execCommand('copy'); say('Copied.', 'ok'); });
      return;
    }
    if (a === 'rebuild') {
      btn.disabled = true;
      admin({ action:'rebuild' }).then(function (j) { say(j.built && j.built.ok ? 'Rebuild on its way. ' + (j.built.note || '') : j.built.why, j.built && j.built.ok ? 'ok' : 'bad'); return refresh(); })
        .catch(function (err) { say(err.message, 'bad'); }).then(function () { btn.disabled = false; });
      return;
    }
    if (a === 'decline_tester' && !confirm('Decline this application?')) return;
    if (a === 'remove_tester' && !confirm('Remove this tester? Their code stops working. Published reviews stay up.')) return;
    if (a === 'reissue_code' && !confirm('Issue a new code? The old one stops working straight away.')) return;
    if (a === 'unpublish' && !confirm('Take this review off the site?')) return;
    if (a === 'reject' && !confirm('Reject this card? It won\'t be published.')) return;

    if (a === 'approve_tester' || a === 'reissue_code') {
      btn.disabled = true;
      admin({ action:a, id:id }).then(function (j) { S.codes[id] = j; say('Code issued. Copy it now: it won\'t be shown again.', 'ok'); return refresh(); })
        .catch(function (err) { btn.disabled = false; say(err.message, 'bad'); });
      return;
    }
    if (a === 'decline_tester' || a === 'remove_tester' || a === 'unpublish' || a === 'reject') {
      btn.disabled = true;
      admin({ action:a, id:id }).then(function (j) {
        say(j.built ? (j.built.ok ? 'Done. ' + (j.built.note || '') : 'Done. ' + j.built.why) : 'Done.', j.built && !j.built.ok ? 'bad' : 'ok'); return refresh();
      }).catch(function (err) { btn.disabled = false; say(err.message, 'bad'); });
      return;
    }
    if (a === 'save' || a === 'save_publish') {
      var body = collect(el);
      var bad = body.buy_links.filter(function (l) { return l.affiliate && !/^https:\/\//.test(l.url || ''); });
      if (bad.length) { say('A link ticked as tracked needs a full https:// address.', 'bad'); return; }
      if (!body.product || !body.oneline || !body.writeup) { say('Product, verdict and write-up can\'t be empty.', 'bad'); return; }
      btn.disabled = true;
      var slug = body.slug, live = r.status === 'published';
      patch('hh_reviews', id, body).then(function () {
        if (a === 'save') { var s = el.querySelector('[data-saved]'); if (s) s.textContent = 'Saved'; return refresh(); }
        if (live) return admin({ action:'rebuild', reason:'Updated ' + body.product }).then(function (j) {
          say(j.built.ok ? 'Saved. ' + (j.built.note || '') : 'Saved. ' + j.built.why, j.built.ok ? 'ok' : 'bad'); return refresh(); });
        return admin({ action:'publish', id:id, slug:slug }).then(function (j) {
          say(j.built && j.built.ok ? 'Published: ' + j.url + '. ' + (j.built.note || '') : 'Published at ' + j.url + '. ' + (j.built ? j.built.why : ''), j.built && j.built.ok ? 'ok' : 'bad');
          S.open[id] = false; return refresh();
        });
      }).catch(function (err) { btn.disabled = false; say(err.message, 'bad'); });
    }
  }

  function refresh() { return load().then(draw); }

  w.DWHh = {
    view: function (viewEl, sayFn) {
      root = viewEl; say = sayFn || say; style();
      root.innerHTML = '<p class="det">Loading Honest Handicap...</p>';
      root.onclick = act;
      refresh().catch(function (err) { say(err.message, 'bad'); });
    },
    /* for the menu tile: how many things need looking at */
    summary: function () {
      return Promise.all([
        DWData.rest('hh_testers?select=id&status=eq.applied'),
        DWData.rest('hh_reviews?select=id&status=eq.submitted'),
        DWData.rest('hh_reviews?select=id&status=eq.published')
      ]).then(function (o) { return { applied: o[0].length, cards: o[1].length, live: o[2].length }; }).catch(function () { return null; });
    }
  };
})(window);
