/* Dunnworks console: traffic for dunnworks.io itself (#/traffic).
 *
 * One source: our own cookieless counter.
 *   beacon  assets/js/main.js  ->  edge function dw-track  ->  table dw_pageviews
 *   read    rpc dw_traffic(days)   owner only
 *
 * No cookies and no IP stored, so every visitor is counted, not just the ones who
 * accept a banner. A "visit" is one person on one day.
 *
 * Two things here that the Coastal Golf dashboard has no need of:
 *   Client sites   which of the back links on client sites actually send anyone
 *   Town pages     how the local landing pages are doing, which is the SEO bet
 */
(function (w) {
  'use strict';

  var S = { days: 28, t: null };
  var root = null, say = function () {};

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function num(x) { return x == null || isNaN(x) ? '-' : Number(x).toLocaleString('en-GB'); }
  function secs(s) {
    if (s == null || isNaN(s)) return '-';
    s = Math.round(s); if (s < 60) return s + 's';
    return Math.floor(s / 60) + 'm ' + ('0' + (s % 60)).slice(-2) + 's';
  }
  function ago(iso) {
    if (!iso) return 'never';
    var m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60); if (h < 24) return h + ' hr ago';
    return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short' });
  }
  function dshort(d) { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short' }); }
  function q(sel) { return root && root.querySelector(sel); }
  function fill(id, html) { var el = q('[data-sec="' + id + '"]'); if (el) el.innerHTML = html; }

  function delta(cur, prev, lowerIsBetter, unit) {
    if (cur == null || prev == null) return '';
    if (!prev && !cur) return '<span class="dwt-d">no change</span>';
    if (!prev) return '<span class="dwt-d">new</span>';
    var diff = unit === 'pts' ? Math.round(10 * (cur - prev)) / 10 : Math.round(100 * (cur - prev) / prev);
    if (!diff) return '<span class="dwt-d">no change</span>';
    var good = lowerIsBetter ? diff < 0 : diff > 0;
    return '<span class="dwt-d ' + (good ? 'up' : 'down') + '">' + (diff > 0 ? '▲ ' : '▼ ') +
      Math.abs(diff) + (unit === 'pts' ? ' pts' : '%') + '</span>';
  }

  function stat(label, value, note) {
    return '<div class="dwt-stat"><b>' + value + '</b><span>' + esc(label) + '</span>' +
      (note ? '<em>' + note + '</em>' : '') + '</div>';
  }

  /* a horizontal bar list: [{k, n, extra}] */
  function bars(rows, empty, fmt) {
    if (!rows || !rows.length) return '<p class="dwt-none">' + esc(empty) + '</p>';
    var max = rows.reduce(function (m, r) { return Math.max(m, r.n || 0); }, 0) || 1;
    return '<div class="dwt-bars">' + rows.map(function (r) {
      return '<div class="dwt-bar">' +
        '<span class="dwt-bk" title="' + esc(r.k) + '">' + esc(fmt ? fmt(r.k) : r.k) + '</span>' +
        '<span class="dwt-bt"><i style="width:' + Math.max(2, Math.round(100 * (r.n || 0) / max)) + '%"></i></span>' +
        '<span class="dwt-bn">' + num(r.n) + (r.extra ? ' <em>' + r.extra + '</em>' : '') + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  function css() {
    if (document.getElementById('dwt-css')) return;
    var s = document.createElement('style'); s.id = 'dwt-css';
    s.textContent = [
      '.dwt-bar-top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:20px}',
      '.dwt-bar-top .sp{flex:1 1 10px}',
      '.dwt-sec{margin-bottom:30px}',
      '.dwt-sec h2{font-size:19px;margin-bottom:4px}',
      '.dwt-sec h2 small{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted-2);margin-left:10px;font-weight:400}',
      '.dwt-lede{color:var(--muted);font-size:14px;margin-bottom:14px;max-width:70ch}',
      '.dwt-loading,.dwt-none{color:var(--muted-2);font-size:14px}',
      '.dwt-err{color:var(--bad);font-size:14px}',
      '.dwt-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:9px;margin-bottom:18px}',
      '.dwt-stat{border:1px solid var(--line);border-radius:var(--radius);background:var(--ink-2);padding:14px 16px}',
      '.dwt-stat b{display:block;font-family:var(--font-display);font-size:26px;line-height:1.1}',
      '.dwt-stat span{display:block;font-family:var(--font-mono);font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted-2);margin-top:4px}',
      '.dwt-stat em{display:block;font-style:normal;font-size:12px;color:var(--muted);margin-top:6px}',
      '.dwt-d{font-family:var(--font-mono);font-size:11px;letter-spacing:.04em}',
      '.dwt-d.up{color:#4fd08a}.dwt-d.down{color:#ff6b8a}',
      '.dwt-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:26px}',
      '.dwt-bars{display:grid;gap:7px}',
      '.dwt-bar{display:grid;grid-template-columns:minmax(90px,30%) 1fr auto;gap:11px;align-items:center;font-size:13.5px}',
      '.dwt-bk{color:var(--paper);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dwt-bt{background:var(--ink-3);border-radius:2px;height:9px;overflow:hidden}',
      '.dwt-bt i{display:block;height:100%;background:var(--accent);border-radius:2px}',
      '.dwt-bn{font-family:var(--font-mono);font-size:12px;color:var(--muted);white-space:nowrap}',
      '.dwt-bn em{font-style:normal;color:var(--muted-2);font-size:11px}',
      '.dwt-days{display:flex;align-items:flex-end;gap:3px;height:120px;margin:6px 0 10px}',
      '.dwt-day{flex:1 1 0;min-width:2px;background:var(--ink-3);border-radius:2px 2px 0 0;position:relative}',
      '.dwt-day i{position:absolute;left:0;right:0;bottom:0;background:var(--accent);border-radius:2px 2px 0 0}',
      '.dwt-axis{display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:10px;color:var(--muted-2)}',
      '.dwt-tbl{width:100%;border-collapse:collapse;font-size:13.5px}',
      '.dwt-tbl th{text-align:left;font-family:var(--font-mono);font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted-2);font-weight:400;padding:0 10px 8px 0;border-bottom:1px solid var(--line)}',
      '.dwt-tbl td{padding:8px 10px 8px 0;border-bottom:1px solid var(--line);color:var(--muted)}',
      '.dwt-tbl td:first-child{color:var(--paper)}',
      '.dwt-tbl .n{font-family:var(--font-mono);font-size:12px;text-align:right;white-space:nowrap}',
      '.dwt-flag{border:1px solid var(--accent);border-radius:var(--radius);background:var(--accent-dim);padding:14px 16px;font-size:14px;color:var(--paper);margin-bottom:16px}',
      '.dwt-flag b{font-weight:600}',
      '@media (max-width:620px){.dwt-bar{grid-template-columns:minmax(76px,40%) 1fr auto}}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ---------------------------------------------------------------- view */
  function view(viewEl, sayFn) {
    css();
    root = viewEl; say = sayFn || say;
    viewEl.innerHTML =
      '<div class="dwt-bar-top">' +
        [7, 28, 90].map(function (d) {
          return '<button type="button" class="chip' + (S.days === d ? ' is-on' : '') + '" data-dwt-days="' + d + '">' + d + ' days</button>';
        }).join('') +
        '<span class="sp"></span>' +
        '<a class="mini" href="https://dunnworks.io/" target="_blank" rel="noopener">Open the site</a>' +
        '<a class="mini" href="https://search.google.com/search-console?resource_id=sc-domain%3Adunnworks.io" target="_blank" rel="noopener">Search Console</a>' +
        '<button type="button" class="mini" data-dwt="refresh">Refresh</button>' +
      '</div>' +
      '<div class="dwt-sec" data-sec="now"><p class="dwt-loading">Loading...</p></div>' +
      '<section class="dwt-sec"><h2>Visitors <small>Our own counter</small></h2>' +
        '<p class="dwt-lede">No cookies, so nobody is missed by the banner. A visit is one person on one day. ' +
        'Your own private areas are not counted.</p>' +
        '<div data-sec="traffic"><p class="dwt-loading">Loading...</p></div></section>' +
      '<section class="dwt-sec"><h2>Where they came from <small>Referrers</small></h2>' +
        '<div data-sec="refs"><p class="dwt-loading">Loading...</p></div></section>' +
      '<section class="dwt-sec"><h2>Pages <small>What they read</small></h2>' +
        '<div data-sec="pages"><p class="dwt-loading">Loading...</p></div></section>' +
      '<section class="dwt-sec"><h2>Town pages <small>The local landing pages</small></h2>' +
        '<p class="dwt-lede">These rank for small numbers of searches with very high intent. Low traffic is normal; zero across the board means they are not being found.</p>' +
        '<div data-sec="towns"><p class="dwt-loading">Loading...</p></div></section>' +
      '<section class="dwt-sec"><h2>Who they are <small>Device, browser, country, hour</small></h2>' +
        '<div data-sec="who"><p class="dwt-loading">Loading...</p></div></section>' +
      '<details class="dwt-sec"><summary style="cursor:pointer;color:var(--muted);font-size:14px">The last dozen page views</summary>' +
        '<div data-sec="recent" style="margin-top:14px"></div></details>';
    load();
  }

  function load() {
    return DWData.rest('rpc/dw_traffic', { method:'POST', body:{ days: S.days } }).then(function (t) {
      S.t = t;
      drawNow(); drawTraffic(); drawRefs(); drawPages(); drawTowns(); drawWho(); drawRecent();
      say('');
    }).catch(function (e) {
      fill('now', '<p class="dwt-err">Couldn\'t load the counter: ' + esc(e.message) + '</p>');
      ['traffic','refs','pages','towns','who','recent'].forEach(function (k) { fill(k, ''); });
    });
  }

  function drawNow() {
    var t = S.t, n = t.now || {};
    var since = n.first ? new Date(n.first).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }) : null;
    var young = n.first && (Date.now() - Date.parse(n.first)) < 14 * 86400000;
    fill('now',
      (young ? '<div class="dwt-flag"><b>Counting began on ' + esc(since) + '.</b> ' +
        'There is not enough history yet for the comparisons below to mean anything. Judge the trend after a fortnight, not the numbers today.</div>' : '') +
      '<div class="dwt-stats">' +
        stat('On the site now', num(n.live), 'last five minutes') +
        stat('Views today', num(n.today_views)) +
        stat('Visitors today', num(n.today_visits)) +
        stat('Counted in all', num(n.total), since ? 'since ' + esc(since) : '') +
      '</div>');
  }

  function drawTraffic() {
    var t = S.t, c = t.cur || {}, p = t.prev || {};
    var daily = t.daily || [];
    var max = daily.reduce(function (m, d) { return Math.max(m, d.views || 0); }, 0) || 1;
    fill('traffic',
      '<div class="dwt-stats">' +
        stat('Page views', num(c.views), delta(c.views, p.views)) +
        stat('Visits', num(c.visits), delta(c.visits, p.visits)) +
        stat('One page only', c.bounce == null ? '-' : c.bounce + '%', delta(c.bounce, p.bounce, true, 'pts')) +
        stat('Average on a page', secs(c.secs), delta(c.secs, p.secs)) +
        stat('Reached Contact', num(c.contact), delta(c.contact, p.contact)) +
      '</div>' +
      (daily.length ?
        '<div class="dwt-days">' + daily.map(function (d) {
          return '<div class="dwt-day" title="' + esc(dshort(d.d)) + ': ' + num(d.views) + ' views, ' + num(d.visits) + ' visits">' +
            '<i style="height:' + Math.max(2, Math.round(100 * (d.views || 0) / max)) + '%"></i></div>';
        }).join('') + '</div>' +
        '<div class="dwt-axis"><span>' + esc(dshort(daily[0].d)) + '</span><span>' +
          esc(dshort(daily[daily.length - 1].d)) + '</span></div>' : ''));
  }

  function drawRefs() {
    var t = S.t;
    var clients = t.clients || [];
    var named = ['Combustion Consulting','T Cooper Interiors','Falkners Golf Society','Coastal Golf Co','AeroInspectors'];
    var seen = clients.map(function (r) { return String(r.k).replace(/^Client:\s*/, ''); });
    var silent = named.filter(function (n) { return seen.indexOf(n) === -1; });
    fill('refs',
      '<div class="dwt-cols">' +
        '<div><h3 style="font-size:15px;margin-bottom:10px">Everything</h3>' +
          bars(t.refs, 'Nothing yet.') + '</div>' +
        '<div><h3 style="font-size:15px;margin-bottom:10px">Your client sites</h3>' +
          '<p class="dwt-lede" style="margin-bottom:10px">Whether the credit links you placed actually send anyone.</p>' +
          bars(clients, 'No visits from a client site yet.', function (k) { return String(k).replace(/^Client:\s*/, ''); }) +
          (silent.length ? '<p class="dwt-none" style="margin-top:10px">Nothing from: ' + esc(silent.join(', ')) + '</p>' : '') +
        '</div>' +
      '</div>' +
      ((t.utm || []).length ? '<div style="margin-top:22px"><h3 style="font-size:15px;margin-bottom:10px">Tagged links</h3>' +
        bars(t.utm, '') + '</div>' : ''));
  }

  function drawPages() {
    var rows = S.t.pages || [];
    if (!rows.length) return fill('pages', '<p class="dwt-none">Nothing yet.</p>');
    fill('pages',
      '<table class="dwt-tbl"><thead><tr><th>Page</th><th class="n">Views</th><th class="n">Visitors</th><th class="n">Average</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td><a href="https://dunnworks.io' + esc(r.k) + '" target="_blank" rel="noopener" style="color:inherit">' +
          esc(r.k) + '</a></td><td class="n">' + num(r.n) + '</td><td class="n">' + num(r.u) +
          '</td><td class="n">' + secs(r.s) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      ((S.t.landing || []).length ? '<div style="margin-top:22px"><h3 style="font-size:15px;margin-bottom:10px">Where visits started</h3>' +
        bars(S.t.landing, '') + '</div>' : ''));
  }

  function drawTowns() {
    var rows = (S.t.towns || []).map(function (r) {
      return { k: String(r.k).replace(/(^|\s)\w/g, function (m) { return m.toUpperCase(); }), n: r.n, extra: r.u + ' people' };
    });
    fill('towns', bars(rows, 'No visits to a town page in this period.'));
  }

  function drawWho() {
    var t = S.t;
    var hours = t.hours || [];
    var hmax = hours.reduce(function (m, h) { return Math.max(m, h.n || 0); }, 0) || 1;
    fill('who',
      '<div class="dwt-cols">' +
        '<div><h3 style="font-size:15px;margin-bottom:10px">Device</h3>' + bars(t.devices, 'Nothing yet.') + '</div>' +
        '<div><h3 style="font-size:15px;margin-bottom:10px">Browser</h3>' + bars(t.browsers, 'Nothing yet.') + '</div>' +
      '</div>' +
      ((t.countries || []).length ? '<div style="margin-top:22px"><h3 style="font-size:15px;margin-bottom:10px">Country</h3>' +
        bars(t.countries, '') + '</div>' : '') +
      (hours.length ? '<div style="margin-top:22px"><h3 style="font-size:15px;margin-bottom:10px">Hour of the day</h3>' +
        '<div class="dwt-days" style="height:76px">' + hours.map(function (h) {
          return '<div class="dwt-day" title="' + h.h + ':00 - ' + num(h.n) + ' views">' +
            '<i style="height:' + Math.max(2, Math.round(100 * (h.n || 0) / hmax)) + '%"></i></div>';
        }).join('') + '</div><div class="dwt-axis"><span>midnight</span><span>noon</span><span>23:00</span></div></div>' : ''));
  }

  function drawRecent() {
    var rows = S.t.recent || [];
    if (!rows.length) return fill('recent', '<p class="dwt-none">Nothing yet.</p>');
    fill('recent',
      '<table class="dwt-tbl"><thead><tr><th>When</th><th>Page</th><th>From</th><th>Device</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + esc(ago(r.at)) + '</td><td>' + esc(r.path) + '</td><td>' +
          esc(r.ref || 'Direct') + '</td><td>' + esc([r.device, r.country].filter(Boolean).join(' · ')) + '</td></tr>';
      }).join('') + '</tbody></table>');
  }

  /* ---------------------------------------------------------------- events */
  document.addEventListener('click', function (e) {
    if (!root || !root.contains(e.target)) return;
    var d = e.target.closest('[data-dwt-days]');
    if (d) {
      S.days = Number(d.getAttribute('data-dwt-days'));
      root.querySelectorAll('[data-dwt-days]').forEach(function (b) { b.classList.toggle('is-on', b === d); });
      load();
      return;
    }
    var a = e.target.closest('[data-dwt]');
    if (a && a.getAttribute('data-dwt') === 'refresh') { say('Refreshing...'); load(); }
  });

  w.DWTraffic = {
    view: view,
    summary: function () {
      return DWData.rest('rpc/dw_traffic', { method:'POST', body:{ days: 7 } }).catch(function () { return null; });
    }
  };
})(window);
