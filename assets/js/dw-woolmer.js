/* Dunnworks console: woolmer.info dashboard (#/woolmer).
 * Source: woolmer's own cookie-free visit counter (wb_hits, read through rpc wb_stats, owner only).
 * No cookies or personal data, so these are page views and clicks, not unique people.
 */
(function (w) {
  'use strict';
  var SITE = 'https://woolmer.info';
  var S = { days: 30, d: null };
  var root = null, say = function () {};

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function num(x) { return x == null || isNaN(x) ? '–' : Number(x).toLocaleString('en-GB'); }
  function dshort(d) { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short' }); }
  function dlong(d) { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }); }
  function delta(cur, prev) {
    cur = cur || 0; prev = prev || 0;
    if (!prev && !cur) return '<span class="cg-d">no change</span>';
    if (!prev) return '<span class="cg-d up">new</span>';
    var diff = Math.round(100 * (cur - prev) / prev);
    if (!diff) return '<span class="cg-d">no change</span>';
    return '<span class="cg-d ' + (diff > 0 ? 'up' : 'down') + '">' + (diff > 0 ? '▲ ' : '▼ ') + Math.abs(diff) + '%</span>';
  }
  function tile(label, value, extra, hint) {
    return '<div class="cg-tile"' + (hint ? ' title="' + esc(hint) + '"' : '') + '><span>' + esc(label) + '</span><b>' + value + '</b>' + (extra || '') + '</div>';
  }
  function bars(rows, empty) {
    if (!rows || !rows.length) return '<p class="cg-empty">' + esc(empty || 'Nothing yet.') + '</p>';
    var max = Math.max.apply(null, rows.map(function (r) { return r.n || 0; })) || 1;
    return '<ul class="cg-bars">' + rows.map(function (r) {
      var label = r.href ? '<a href="' + esc(r.href) + '" target="_blank" rel="noopener">' + esc(r.k) + '</a>' : esc(r.k);
      return '<li><div class="cg-bl"><span>' + label + '</span><b>' + num(r.n) + (r.x ? ' <small>' + esc(r.x) + '</small>' : '') + '</b></div>' +
        '<i><em style="width:' + Math.max(2, Math.round(100 * (r.n || 0) / max)) + '%"></em></i></li>';
    }).join('') + '</ul>';
  }
  function niceMax(v) { if (!v || v <= 4) return 4; var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
  function columns(days) {
    var max = Math.max.apply(null, days.map(function (r) { return r.views || 0; })), top = niceMax(max);
    var every = Math.ceil(days.length / (w.innerWidth < 620 ? 4 : 8));
    var grid = [top, top / 2, 0].map(function (g) { return '<div class="cg-gl" style="bottom:' + (100 * g / top) + '%"><span>' + num(Math.round(g)) + '</span></div>'; }).join('');
    var cols = days.map(function (r, i) {
      var h = 100 * (r.views || 0) / top;
      return '<div class="cg-col" tabindex="0"><em style="height:' + (r.views ? Math.max(h, 1.5) : 0) + '%"></em>' +
        ((i % every === 0 || i === days.length - 1) ? '<span class="cg-xl">' + esc(dshort(r.day)) + '</span>' : '') +
        '<div class="cg-tip"><b>' + esc(dlong(r.day)) + '</b><br>' + num(r.views) + ' page views</div></div>';
    }).join('');
    return '<div class="cg-chart" role="img" aria-label="Page views per day"><div class="cg-plot">' + grid + '<div class="cg-cols">' + cols + '</div></div></div>';
  }
  function nicePath(p) {
    if (p === '/') return 'Home';
    return p.replace(/^\/|\/$/g, '').replace(/^p\//, '').replace(/^mockup\//, 'mock-up: ').replace(/-/g, ' ');
  }
  function css() {
    if (document.getElementById('wbx-css')) return;
    var s = document.createElement('style'); s.id = 'wbx-css';
    s.textContent = [
      '.cg-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:20px}.cg-bar .sp{flex:1}',
      '.cg-note{border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:var(--radius);background:var(--ink-2);padding:12px 15px;font-size:14px;color:var(--muted);margin-bottom:18px}.cg-note b{color:var(--paper)}',
      '.cg-sec{border:1px solid var(--line);border-radius:var(--radius);background:var(--ink-2);padding:18px 19px;margin-bottom:14px;min-width:0}',
      '.cg-sec > h2{font-size:18px;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:baseline;margin-bottom:4px}',
      '.cg-sec > h2 small{font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted-2);font-weight:400}',
      '.cg-sec > p.cg-lede{color:var(--muted);font-size:13.5px;margin-bottom:14px}',
      '.cg-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:9px;margin:12px 0 16px}',
      '.cg-tile{border:1px solid var(--line);border-radius:var(--radius);background:var(--ink);padding:12px 14px;min-width:0}',
      '.cg-tile span{display:block;font-family:var(--font-mono);font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted-2);margin-bottom:7px}',
      '.cg-tile b{display:block;font-family:var(--font-display);font-size:25px;line-height:1.05;color:var(--paper)}',
      '.cg-d{display:inline-block;margin-top:6px;font-family:var(--font-mono);font-size:10.5px;color:var(--muted-2)}.cg-d.up{color:var(--cg-good)}.cg-d.down{color:var(--bad)}',
      ':root{--cg-good:#4fd08a}:root[data-theme=light]{--cg-good:#16794a}',
      '.cg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px 22px;margin-top:6px}.cg-grid > div{min-width:0}',
      '.cg-h{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted-2);margin:6px 0 10px}',
      '.cg-bars{list-style:none;margin:0;padding:0;display:grid;gap:9px}',
      '.cg-bl{display:flex;gap:10px;justify-content:space-between;align-items:baseline;font-size:14px}',
      '.cg-bl span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--paper)}',
      '.cg-bl a{color:var(--paper);text-decoration:none}.cg-bl a:hover{color:var(--accent-2);text-decoration:underline}',
      '.cg-bl b{flex:none;font-weight:500;font-variant-numeric:tabular-nums}.cg-bl small{color:var(--muted-2);font-weight:400;font-size:12px}',
      '.cg-bars i{display:block;height:4px;margin-top:5px;background:var(--line);border-radius:2px;overflow:hidden}.cg-bars em{display:block;height:100%;background:var(--accent);border-radius:2px}',
      '.cg-empty{color:var(--muted-2);font-size:13.5px}',
      '.cg-chart{margin:8px 0 4px;padding:0 0 22px 34px}.cg-plot{position:relative;height:170px}',
      '.cg-gl{position:absolute;left:0;right:0;border-top:1px solid var(--line)}',
      '.cg-gl span{position:absolute;right:100%;margin-right:7px;transform:translateY(-50%);font-family:var(--font-mono);font-size:10px;color:var(--muted-2);white-space:nowrap}',
      '.cg-cols{position:absolute;inset:0;display:flex;align-items:flex-end;gap:2px}',
      '.cg-col{position:relative;flex:1;height:100%;display:flex;align-items:flex-end;outline:none;min-width:0}',
      '.cg-col em{display:block;width:100%;max-width:30px;margin:0 auto;background:var(--accent);border-radius:4px 4px 0 0}',
      '.cg-col:hover em,.cg-col:focus em{background:var(--accent-2)}',
      '.cg-xl{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:6px;font-family:var(--font-mono);font-size:9.5px;color:var(--muted-2);white-space:nowrap}',
      '.cg-tip{display:none;position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);z-index:5;background:var(--ink-3);border:1px solid var(--line-2);border-radius:var(--radius);padding:8px 10px;font-size:12.5px;white-space:nowrap;color:var(--paper);pointer-events:none}',
      '.cg-col:first-child .cg-tip,.cg-col:nth-child(2) .cg-tip{left:0;transform:none}.cg-col:last-child .cg-tip,.cg-col:nth-last-child(2) .cg-tip{left:auto;right:0;transform:none}',
      '.cg-col:hover .cg-tip,.cg-col:focus .cg-tip{display:block}',
      '.cg-table{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:8px}',
      '.cg-table th,.cg-table td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}',
      '.cg-table th{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted-2);font-weight:400}',
      '.cg-table td.n,.cg-table th.n{text-align:right;font-variant-numeric:tabular-nums}.cg-wrapx{overflow-x:auto}',
      '.wbx-live{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-mono);font-size:11px;color:var(--cg-good)}',
      '.wbx-live:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--cg-good)}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function load() {
    say('Loading woolmer stats…');
    return DWData.rest('rpc/wb_stats', { method:'POST', body:{ p_days: S.days } }).then(function (d) {
      S.d = d; say(''); render();
    }).catch(function (e) { say(e.message, 'bad'); });
  }

  function render() {
    if (!root || !S.d) return;
    var d = S.d, t = d.totals || {}, p = d.prev || {}, s = d.site || {};
    var clicks = (t.call || 0) + (t.website || 0) + (t.directions || 0) + (t.menu || 0);
    var pclicks = (p.call || 0) + (p.website || 0) + (p.directions || 0) + (p.menu || 0);
    var biz = (d.business || []).map(function (r) {
      return '<tr><td><a href="' + SITE + esc(r.path) + '" target="_blank" rel="noopener">' + esc(r.name || nicePath(r.path)) + '</a></td><td class="n">' + num(r.views) + '</td><td class="n">' + num(r.calls) + '</td><td class="n">' + num(r.website) + '</td><td class="n">' + num(r.directions) + '</td><td class="n">' + num(r.menu) + '</td></tr>';
    }).join('');
    var mock = (d.mockups || []).map(function (r) {
      return '<tr><td><a href="' + SITE + esc(r.path) + '" target="_blank" rel="noopener">' + esc(r.name || nicePath(r.path)) + '</a></td><td class="n">' + num(r.views) + '</td><td class="n">' + num(r.clicks) + '</td></tr>';
    }).join('');
    root.querySelector('[data-wbx]').innerHTML =
      '<section class="cg-sec"><h2>Visitors <small>last ' + S.days + ' days</small>' + (d.live ? ' <span class="wbx-live">' + d.live + ' page view' + (d.live === 1 ? '' : 's') + ' in the last 5 min</span>' : '') + '</h2>' +
      '<div class="cg-tiles">' +
        tile('Page views', num(t.view), delta(t.view, p.view)) +
        tile('Today', num(d.today)) +
        tile('Calls, websites, directions', num(clicks), delta(clicks, pclicks), 'Clicks to phone, website, directions or menu from listings') +
        tile('Mock-up views', num((d.mockups || []).reduce(function (a, r) { return a + (r.views || 0); }, 0))) +
        tile('Dunnworks clicks', num(t.dunnworks), delta(t.dunnworks, p.dunnworks)) +
        tile('On phones', d.mobile == null ? '–' : d.mobile + '%') +
      '</div>' + columns(d.days || []) + '</section>' +
      '<section class="cg-sec"><h2>What people read</h2><div class="cg-grid">' +
        '<div><p class="cg-h">Top pages</p>' + bars((d.pages || []).map(function (r) { return { k: nicePath(r.path), n: r.n, href: SITE + r.path }; })) + '</div>' +
        '<div><p class="cg-h">Where they came from</p>' + bars((d.refs || []).map(function (r) { return { k: r.ref, n: r.n }; }), 'No referrers yet. Direct visits and apps don\'t pass one.') + '</div>' +
        '<div><p class="cg-h">Actions</p>' + bars([['Calls', t.call], ['Website clicks', t.website], ['Directions', t.directions], ['Menu / order', t.menu], ['Tickets', t.tickets], ['Add to calendar', t.calendar]].filter(function (x) { return x[1]; }).map(function (x) { return { k: x[0], n: x[1] }; }), 'No clicks yet.') + '</div>' +
      '</div></section>' +
      '<section class="cg-sec"><h2>Businesses <small>your sales evidence</small></h2><p class="cg-lede">Views and clicks per listing. Use these numbers when you pitch a website: "40 people looked you up on woolmer this month and 12 tried to call."</p>' +
        (biz ? '<div class="cg-wrapx"><table class="cg-table"><thead><tr><th>Business</th><th class="n">Views</th><th class="n">Calls</th><th class="n">Website</th><th class="n">Directions</th><th class="n">Menu</th></tr></thead><tbody>' + biz + '</tbody></table></div>' : '<p class="cg-empty">No listing views yet.</p>') + '</section>' +
      '<section class="cg-sec"><h2>Mock-ups <small>Dunnworks leads</small></h2><p class="cg-lede">Who has looked at their concept site, and who clicked through to Dunnworks. A business that opens its own mock-up more than once is a warm lead.</p>' +
        (mock ? '<div class="cg-wrapx"><table class="cg-table"><thead><tr><th>Mock-up</th><th class="n">Views</th><th class="n">Dunnworks clicks</th></tr></thead><tbody>' + mock + '</tbody></table></div>' : '<p class="cg-empty">No mock-up views yet.</p>') +
        ((d.dunnworks || []).length ? '<p class="cg-h" style="margin-top:14px">Dunnworks clicks by page</p>' + bars(d.dunnworks.map(function (r) { return { k: nicePath(r.path), n: r.n, x: r.label }; })) : '') + '</section>' +
      '<section class="cg-sec"><h2>The guide</h2><div class="cg-tiles">' +
        tile('Listings', num(s.places)) + tile('Claimed by owners', num(s.claimed)) + tile('Upcoming events', num(s.events)) +
        tile('Weekly email subscribers', num(s.subscribers)) + tile('Waiting for you', num((s.waiting || 0) + (s.submissions || 0)), '<a class="cg-d" href="' + SITE + '/admin/" target="_blank" rel="noopener">open woolmer admin</a>') +
      '</div></section>';
  }

  function view(el, sayFn) {
    root = el; say = sayFn || say; css();
    el.innerHTML = '<div class="cg-bar">' +
      [7, 30, 90].map(function (n) { return '<button type="button" class="chip' + (n === S.days ? ' is-on' : '') + '" data-wbx-days="' + n + '">' + n + ' days</button>'; }).join('') +
      '<span class="sp"></span><a class="mini" href="' + SITE + '/" target="_blank" rel="noopener">Open the site</a><button type="button" class="mini" data-wbx-refresh>Refresh</button></div>' +
      '<p class="cg-note"><b>Cookie-free counter.</b> woolmer counts page views and clicks without cookies or personal data, so there\'s no consent banner. It shows views, not unique people. Counting started on 15 Nov 2026.</p>' +
      '<div data-wbx><p class="cg-empty">Loading…</p></div>';
    load();
  }
  document.addEventListener('click', function (e) {
    if (!root) return;
    var b = e.target.closest && e.target.closest('[data-wbx-days],[data-wbx-refresh]');
    if (!b || !root.contains(b)) return;
    if (b.hasAttribute('data-wbx-days')) { S.days = +b.getAttribute('data-wbx-days'); view(root, say); } else load();
  });

  w.DWWoolmer = {
    view: view,
    summary: function () { return DWData.rest('rpc/wb_stats', { method:'POST', body:{ p_days: 7 } }).catch(function () { return null; }); }
  };
})(window);
