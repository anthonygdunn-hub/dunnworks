/* Dunnworks console: the Coastal Golf Co dashboard (#/cgc).
 *
 * Four sources, each filling its own section as it arrives:
 *   our own visit counter   rpc cgc_traffic (cgc_pageviews, cgc_bookings, cgc_uptime)
 *   Google Analytics 4      edge function cgc-insights {what:'google'}  (only people who accept cookies)
 *   Search Console          the same call, runs 2-3 days behind
 *   PageSpeed Insights      edge function cgc-insights {what:'speed'}   (cached 12 hours)
 * Google access is a service account whose key is pasted into Google settings at the bottom
 * and stored in cgc_google (owner only).
 */
(function (w) {
  'use strict';

  var LAUNCH = Date.parse('2026-10-04T07:00:00Z');
  var SITE = 'https://www.coastalgolfco.co.uk';
  var S = { days: 28, t: null, g: null, speed: null, cfg: null, saEmail: '' };
  var root = null, say = function () {};

  /* ---------------------------------------------------------------- helpers */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function num(x) { return x == null || isNaN(x) ? '–' : Number(x).toLocaleString('en-GB'); }
  function secs(s) {
    if (s == null || isNaN(s)) return '–';
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
  function dlong(d) { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }); }
  function ratio(a, b) { return b ? a / b : null; }
  function q(sel) { return root && root.querySelector(sel); }
  function fill(id, html) { var el = q('[data-sec="' + id + '"]'); if (el) el.innerHTML = html; }

  /* change against the previous period of the same length; "down" can be good (bounce rate) */
  function delta(cur, prev, lowerIsBetter, unit) {
    if (cur == null || prev == null) return '';
    if (!prev && !cur) return '<span class="cg-d">no change</span>';
    if (!prev) return '<span class="cg-d">new</span>';
    var diff = unit === 'pts' ? Math.round(10 * (cur - prev)) / 10 : Math.round(100 * (cur - prev) / prev);
    if (!diff) return '<span class="cg-d">no change</span>';
    var good = lowerIsBetter ? diff < 0 : diff > 0;
    return '<span class="cg-d ' + (good ? 'up' : 'down') + '">' + (diff > 0 ? '▲ ' : '▼ ') +
      Math.abs(diff) + (unit === 'pts' ? ' pts' : '%') + '</span>';
  }
  function tile(label, value, extra, hint) {
    return '<div class="cg-tile"' + (hint ? ' title="' + esc(hint) + '"' : '') + '><span>' + esc(label) + '</span><b>' + value + '</b>' + (extra || '') + '</div>';
  }

  /* horizontal bar list: label, value, thin bar scaled to the biggest row */
  function bars(rows, opts) {
    opts = opts || {};
    if (!rows || !rows.length) return '<p class="cg-empty">' + esc(opts.empty || 'Nothing yet.') + '</p>';
    var max = Math.max.apply(null, rows.map(function (r) { return r.n || 0; })) || 1;
    var total = opts.share ? rows.reduce(function (s, r) { return s + (r.n || 0); }, 0) : 0;
    return '<ul class="cg-bars">' + rows.map(function (r) {
      var label = opts.link ? '<a href="' + esc(SITE + r.k) + '" target="_blank" rel="noopener">' + esc(r.k) + '</a>' : esc(r.k);
      var val = num(r.n) + (total ? ' <small>' + Math.round(100 * r.n / total) + '%</small>' : '');
      return '<li><div class="cg-bl"><span>' + label + '</span><b>' + val + (r.x ? ' <small>' + esc(r.x) + '</small>' : '') + '</b></div>' +
        '<i><em style="width:' + Math.max(2, Math.round(100 * (r.n || 0) / max)) + '%"></em></i></li>';
    }).join('') + '</ul>';
  }

  /* column chart in plain HTML: crisp at any width, hover or focus a column for its numbers */
  function columns(rows, opts) {
    opts = opts || {};
    if (!rows || !rows.length) return '<p class="cg-empty">Nothing yet.</p>';
    var max = Math.max.apply(null, rows.map(function (r) { return r.v || 0; }));
    var top = niceMax(max);
    var every = Math.ceil(rows.length / Math.min(opts.maxLabels || 8, w.innerWidth < 620 ? 4 : 99));
    var grid = [top, top / 2, 0].map(function (g) {
      return '<div class="cg-gl" style="bottom:' + (100 * g / (top || 1)) + '%"><span>' + num(Math.round(g)) + '</span></div>';
    }).join('');
    var cols = rows.map(function (r, i) {
      var h = top ? 100 * (r.v || 0) / top : 0;
      var lab = (i % every === 0 || i === rows.length - 1) ? '<span class="cg-xl">' + esc(r.label) + '</span>' : '';
      return '<div class="cg-col" tabindex="0" aria-label="' + esc(r.tip.replace(/<[^>]+>/g, ' ')) + '">' +
        '<em style="height:' + (r.v ? Math.max(h, 1.5) : 0) + '%"></em>' + lab +
        '<div class="cg-tip">' + r.tip + '</div></div>';
    }).join('');
    var table = '<details class="cg-tbl"><summary>Show as a table</summary><table><thead><tr>' +
      opts.cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.row.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></details>';
    return '<div class="cg-chart" role="img" aria-label="' + esc(opts.label || '') + '"><div class="cg-plot">' + grid +
      '<div class="cg-cols">' + cols + '</div></div></div>' + table;
  }
  function niceMax(v) {
    if (!v) return 4;
    var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }

  function status(ok, text) {
    return '<span class="cg-st ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '●' : '▲') + ' ' + esc(text) + '</span>';
  }
  function scoreBadge(label, s) {
    var cls = s == null ? '' : s >= 90 ? 'ok' : s >= 50 ? 'mid' : 'bad';
    var word = s == null ? '' : s >= 90 ? 'Good' : s >= 50 ? 'Needs work' : 'Poor';
    return '<div class="cg-score ' + cls + '"><b>' + (s == null ? '–' : s) + '</b><span>' + esc(label) + '</span><small>' + word + '</small></div>';
  }

  /* ---------------------------------------------------------------- styles */
  function css() {
    if (document.getElementById('cg-css')) return;
    var s = document.createElement('style'); s.id = 'cg-css';
    s.textContent = [
      '.cg-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:20px}',
      '.cg-bar .sp{flex:1}',
      '.cg-note{border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:var(--radius);background:var(--ink-2);padding:12px 15px;font-size:14px;color:var(--muted);margin-bottom:18px}',
      '.cg-note b{color:var(--paper)}',
      '.cg-sec{border:1px solid var(--line);border-radius:var(--radius);background:var(--ink-2);padding:18px 19px;margin-bottom:14px;min-width:0}',
      '.cg-sec > h2{font-size:18px;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:baseline;margin-bottom:4px}',
      '.cg-sec > h2 small{font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted-2);font-weight:400}',
      '.cg-sec > p.cg-lede{color:var(--muted);font-size:13.5px;margin-bottom:14px}',
      '.cg-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:9px;margin:12px 0 16px}',
      '.cg-tile{border:1px solid var(--line);border-radius:var(--radius);background:var(--ink);padding:12px 14px;min-width:0}',
      '.cg-tile span{display:block;font-family:var(--font-mono);font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted-2);margin-bottom:7px}',
      '.cg-tile b{display:block;font-family:var(--font-display);font-size:25px;line-height:1.05;color:var(--paper)}',
      '.cg-d{display:inline-block;margin-top:6px;font-family:var(--font-mono);font-size:10.5px;color:var(--muted-2)}',
      '.cg-d.up{color:var(--cg-good)}.cg-d.down{color:var(--bad)}',
      '.cg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px 22px;margin-top:6px}',
      '.cg-grid > div{min-width:0}',
      '.cg-grid.wide{grid-template-columns:repeat(auto-fit,minmax(420px,1fr))}@media (max-width:620px){.cg-grid.wide{grid-template-columns:1fr}}',
      ':root{--cg-good:#4fd08a;--cg-mid:#ffb347}:root[data-theme=light]{--cg-good:#16794a;--cg-mid:#a35b00}',
      '.cg-h{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted-2);margin:6px 0 10px}',
      '.cg-bars{list-style:none;margin:0;padding:0;display:grid;gap:9px}',
      '.cg-bl{display:flex;gap:10px;justify-content:space-between;align-items:baseline;font-size:14px}',
      '.cg-bl span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--paper)}',
      '.cg-bl a{color:var(--paper);text-decoration:none}.cg-bl a:hover{color:var(--accent-2);text-decoration:underline}',
      '.cg-bl b{flex:none;font-weight:500;font-variant-numeric:tabular-nums}.cg-bl small{color:var(--muted-2);font-weight:400;font-size:12px}',
      '.cg-bars i{display:block;height:4px;margin-top:5px;background:var(--line);border-radius:2px;overflow:hidden}',
      '.cg-bars em{display:block;height:100%;background:var(--accent);border-radius:2px}',
      '.cg-empty{color:var(--muted-2);font-size:13.5px}',
      '.cg-chart{margin:8px 0 4px;padding:0 0 22px 34px}',
      '.cg-plot{position:relative;height:170px}',
      '.cg-gl{position:absolute;left:0;right:0;border-top:1px solid var(--line)}',
      '.cg-gl span{position:absolute;right:100%;margin-right:7px;transform:translateY(-50%);font-family:var(--font-mono);font-size:10px;color:var(--muted-2);white-space:nowrap}',
      '.cg-cols{position:absolute;inset:0;display:flex;align-items:flex-end;gap:2px}',
      '.cg-col{position:relative;flex:1;height:100%;display:flex;align-items:flex-end;outline:none;cursor:default;min-width:0}',
      '.cg-col em{display:block;width:100%;max-width:30px;margin:0 auto;background:var(--accent);border-radius:4px 4px 0 0}',
      '.cg-col:hover em,.cg-col:focus em{background:var(--accent-2)}',
      '.cg-col:hover::before,.cg-col:focus::before{content:"";position:absolute;inset:0;background:var(--accent-dim);border-radius:3px}',
      '.cg-xl{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:6px;font-family:var(--font-mono);font-size:9.5px;color:var(--muted-2);white-space:nowrap}',
      '.cg-tip{display:none;position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);z-index:5;background:var(--ink-3);border:1px solid var(--line-2);border-radius:var(--radius);padding:8px 10px;font-size:12.5px;line-height:1.45;white-space:nowrap;color:var(--paper);box-shadow:0 8px 20px rgba(0,0,0,.25);pointer-events:none}',
      '.cg-col:first-child .cg-tip,.cg-col:nth-child(2) .cg-tip{left:0;transform:none}',
      '.cg-col:last-child .cg-tip,.cg-col:nth-last-child(2) .cg-tip{left:auto;right:0;transform:none}',
      '.cg-col:hover .cg-tip,.cg-col:focus .cg-tip{display:block}',
      '.cg-tip b{font-weight:600}',
      '.cg-tbl{margin-top:4px}.cg-tbl summary{cursor:pointer;font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted-2)}',
      '.cg-tbl summary:hover{color:var(--accent-2)}',
      '.cg-tbl table,.cg-table{width:100%;min-width:0;border-collapse:collapse;font-size:13.5px;margin-top:8px}',
      '.cg-tbl th,.cg-tbl td,.cg-table th,.cg-table td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}',
      '.cg-tbl th,.cg-table th{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted-2);font-weight:400}',
      '.cg-table td.n,.cg-table th.n{text-align:right;font-variant-numeric:tabular-nums}',
      '.cg-wrapx{overflow-x:auto}',
      '.cg-st{font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase}',
      '.cg-st.ok{color:var(--cg-good)}.cg-st.bad{color:var(--bad)}',
      '.cg-scores{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:8px 0 12px}',
      '.cg-score{border:1px solid var(--line);border-top:3px solid var(--line-2);border-radius:var(--radius);background:var(--ink);padding:10px 8px;text-align:center;min-width:0}',
      '.cg-score b{display:block;font-family:var(--font-display);font-size:26px;line-height:1}',
      '.cg-score span{display:block;font-size:12px;color:var(--muted);margin-top:5px}',
      '.cg-score small{display:block;font-family:var(--font-mono);font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted-2);margin-top:3px}',
      '.cg-score.ok{border-top-color:var(--cg-good)}.cg-score.ok b{color:var(--cg-good)}',
      '.cg-score.mid{border-top-color:var(--cg-mid)}.cg-score.mid b{color:var(--cg-mid)}',
      '.cg-score.bad{border-top-color:var(--bad)}.cg-score.bad b{color:var(--bad)}',
      '.cg-kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:13.5px}',
      '.cg-kv dt{color:var(--muted)}.cg-kv dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}',
      '.cg-hours{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:2px;align-items:end;height:70px;margin-top:8px}',
      '.cg-hours div{background:var(--accent);border-radius:3px 3px 0 0;min-height:1px;position:relative}',
      '.cg-hours div:hover{background:var(--accent-2)}',
      '.cg-hx{display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:9.5px;color:var(--muted-2);margin-top:5px}',
      '.cg-set ol{margin:6px 0 14px 18px;color:var(--muted);font-size:14px;line-height:1.6}',
      '.cg-set ol b{color:var(--paper)}',
      '.cg-set code{font-family:var(--font-mono);font-size:12.5px;background:var(--ink);border:1px solid var(--line);border-radius:4px;padding:1px 5px;word-break:break-all}',
      '.cg-set textarea{min-height:110px;font-family:var(--font-mono);font-size:12px}',
      '.cg-loading{color:var(--muted-2);font-size:13.5px}',
      '.cg-err{color:var(--bad);font-size:13.5px}',
      '@media (max-width:620px){.cg-scores{grid-template-columns:repeat(2,minmax(0,1fr))}.cg-sec{padding:15px 14px}.cg-chart{padding-left:28px}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------------------------------------------------------------- layout */
  function view(viewEl, sayFn) {
    css();
    root = viewEl; say = sayFn || say;
    var pre = Date.now() < LAUNCH;
    viewEl.innerHTML =
      '<div class="cg-bar">' +
        [7, 28, 90].map(function (d) { return '<button type="button" class="chip' + (S.days === d ? ' is-on' : '') + '" data-cg-days="' + d + '">' + d + ' days</button>'; }).join('') +
        '<span class="sp"></span>' +
        '<a class="mini" href="' + SITE + '/" target="_blank" rel="noopener">Open the site</a>' +
        '<button type="button" class="mini" data-cg="refresh">Refresh</button>' +
      '</div>' +
      (pre ? '<div class="cg-note"><b>Counting starts at launch.</b> The new site goes live on Sunday 4 October at 8am, and the visit counter is built into it. Until then the holding page isn\'t counted, so these numbers stay at zero.</div>' : '') +
      '<div class="cg-sec" data-sec="now"><p class="cg-loading">Loading...</p></div>' +
      '<section class="cg-sec"><h2>Visitors <small>Our own counter, everyone</small></h2>' +
        '<p class="cg-lede">Counts every visitor without cookies, so nobody is missed by the cookie banner. A visitor is one person on one day.</p>' +
        '<div data-sec="traffic"><p class="cg-loading">Loading...</p></div></section>' +
      '<section class="cg-sec"><h2>Bookings <small>From the booking form</small></h2>' +
        '<div data-sec="bookings"><p class="cg-loading">Loading...</p></div></section>' +
      '<section class="cg-sec"><h2>Google Analytics <small>GA4, only people who accept cookies</small></h2>' +
        '<div data-sec="ga4"><p class="cg-loading">Loading...</p></div></section>' +
      '<section class="cg-sec"><h2>Google search <small>Search Console, runs 2 to 3 days behind</small></h2>' +
        '<div data-sec="gsc"><p class="cg-loading">Loading...</p></div></section>' +
      '<section class="cg-sec"><h2>Speed and health <small>PageSpeed Insights and uptime</small></h2>' +
        '<div data-sec="speed"><p class="cg-loading">Loading...</p></div>' +
        '<div data-sec="uptime" style="margin-top:16px"></div></section>' +
      '<details class="cg-sec cg-set set" data-sec-wrap="settings"><summary>Google settings</summary><div data-sec="settings"></div></details>';
    loadAll(false);
  }

  function loadAll(force) {
    loadTraffic();
    loadCfg().then(function () { loadGoogle(force); });
    loadSpeed(force);
  }

  /* ---------------------------------------------------------------- our counter */
  function loadTraffic() {
    return DWData.rest('rpc/cgc_traffic', { method:'POST', body:{ days: S.days } }).then(function (t) {
      S.t = t; drawNow(); drawTraffic(); drawBookings(); drawUptime();
    }).catch(function (e) {
      fill('now', '<p class="cg-err">Couldn\'t load the visit counter: ' + esc(e.message) + '</p>');
      fill('traffic', ''); fill('bookings', '');
    });
  }

  function drawNow() {
    var t = S.t, n = t.now || {}, up = (t.uptime || {}).last, last = (t.recent || [])[0];
    fill('now', '<div class="cg-tiles" style="margin:0">' +
      tile('On the site now', num(n.live), '<span class="cg-d">last 5 minutes</span>') +
      tile('Visitors today', num(n.today_visits), '<span class="cg-d">' + num(n.today_views) + ' page views</span>') +
      tile('Site status', up ? (up.ok ? 'Up' : 'Down') : '–', up ? '<span class="cg-d">' + status(up.ok, (up.ms != null ? up.ms + ' ms, ' : '') + ago(up.at)) + '</span>' : '<span class="cg-d">first check due</span>') +
      tile('Last booking', last ? esc(ago(last.at)) : 'None yet', last ? '<span class="cg-d">' + esc(last.service || 'Service not given') + '</span>' : '') +
    '</div>');
  }

  function drawTraffic() {
    var t = S.t, c = t.cur, p = t.prev;
    var ppv = ratio(c.views, c.visits), pppv = ratio(p.views, p.visits);
    var conv = ratio(c.bookings, c.visits), pconv = ratio(p.bookings, p.visits);
    var daily = (t.daily || []).map(function (d) {
      return { v: d.visits, label: dshort(d.d),
        tip: '<b>' + esc(dlong(d.d)) + '</b><br>' + num(d.visits) + ' visitors<br>' + num(d.views) + ' page views' + (d.bookings ? '<br>' + num(d.bookings) + ' booking' + (d.bookings > 1 ? 's' : '') : ''),
        row: [dlong(d.d), num(d.visits), num(d.views), num(d.bookings)] };
    });
    var hours = t.hours || [], hmax = Math.max.apply(null, hours.map(function (h) { return h.n; })) || 1;
    var empty = !c.views && !p.views;
    fill('traffic',
      '<div class="cg-tiles">' +
        tile('Visitors', num(c.visits), delta(c.visits, p.visits)) +
        tile('Page views', num(c.views), delta(c.views, p.views)) +
        tile('Pages per visit', ppv == null ? '–' : ppv.toFixed(1), delta(ppv, pppv)) +
        tile('Time on a page', secs(c.secs), delta(c.secs, p.secs), 'Average time spent on each page') +
        tile('Bounce rate', c.bounce == null ? '–' : c.bounce + '%', delta(c.bounce, p.bounce, true, 'pts'), 'Visitors who saw one page and left') +
        tile('Booked', conv == null ? '–' : (100 * conv).toFixed(1) + '%', delta(conv && 100 * conv, pconv && 100 * pconv, false, 'pts'), 'Booking requests as a share of visitors') +
      '</div>' +
      '<p class="cg-h">Visitors a day, last ' + t.days + ' days</p>' +
      columns(daily, { cols:['Day', 'Visitors', 'Page views', 'Bookings'], label:'Visitors per day', maxLabels: t.days > 30 ? 9 : 7 }) +
      (empty ? '' :
      '<div class="cg-grid" style="margin-top:18px">' +
        '<div><p class="cg-h">Most viewed pages</p>' + bars((t.pages || []).map(function (r) { return { k: r.k, n: r.n, x: r.s ? secs(r.s) : '' }; }), { link: true }) + '</div>' +
        '<div><p class="cg-h">Where visitors came from</p>' + bars(t.refs, { share: true }) +
          ((t.utm || []).length ? '<p class="cg-h" style="margin-top:16px">Campaign links (utm_source)</p>' + bars(t.utm) : '') + '</div>' +
        '<div><p class="cg-h">Devices</p>' + bars(t.devices, { share: true }) +
          '<p class="cg-h" style="margin-top:16px">Browsers</p>' + bars(t.browsers, { share: true }) + '</div>' +
        '<div><p class="cg-h">Busiest times of day</p><div class="cg-hours">' + hours.map(function (h) {
            return '<div style="height:' + (h.n ? Math.max(3, 100 * h.n / hmax) : 0) + '%" title="' + ('0' + h.h).slice(-2) + ':00 – ' + num(h.n) + ' page views"></div>'; }).join('') +
          '</div><div class="cg-hx"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>' +
          ((t.countries || []).length ? '<p class="cg-h" style="margin-top:16px">Countries</p>' + bars(t.countries, { share: true }) : '') + '</div>' +
      '</div>'));
  }

  function drawBookings() {
    var t = S.t, c = t.cur, p = t.prev;
    var rows = (t.recent || []).map(function (b) {
      return '<tr><td>' + esc(new Date(b.at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })) + '</td><td>' + esc(b.name || '') + '</td><td>' +
        esc(b.service || '–') + (b.clubs ? ' <span class="note">(' + b.clubs + ' clubs)</span>' : '') + '</td><td>' + esc(b.postcode || '') + '</td><td>' + esc(b.status || '') + '</td></tr>';
    }).join('');
    fill('bookings',
      '<div class="cg-tiles">' +
        tile('Booking requests', num(c.bookings), delta(c.bookings, p.bookings)) +
        tile('Visitors per booking', c.bookings ? Math.round(c.visits / c.bookings) : '–', '', 'How many visitors it takes to get one booking request') +
      '</div>' +
      '<div class="cg-grid wide"><div><p class="cg-h">By service, last ' + t.days + ' days</p>' + bars(t.services, { empty: 'No booking requests in this period.' }) + '</div>' +
      '<div><p class="cg-h">Latest requests</p>' + (rows ? '<div class="cg-wrapx"><table class="cg-table"><thead><tr><th>When</th><th>Name</th><th>Service</th><th>Postcode</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<p class="cg-empty">None yet. Requests from the booking form land here and go to hello@coastalgolfco.co.uk.</p>') + '</div></div>');
  }

  function drawUptime() {
    var u = S.t.uptime || {};
    var down = (u.down || []).map(function (d) {
      return '<li>' + esc(new Date(d.at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })) + ' – ' + esc(d.status ? 'HTTP ' + d.status : '') + ' ' + esc(d.note || '') + '</li>';
    }).join('');
    fill('uptime', '<p class="cg-h">Uptime, checked every 10 minutes</p>' +
      (u.checks ? '<div class="cg-tiles" style="margin-top:0">' +
        tile('Up', u.pct == null ? '–' : u.pct + '%', '<span class="cg-d">' + num(u.checks) + ' checks</span>') +
        tile('Response time', u.avg_ms == null ? '–' : num(u.avg_ms) + ' ms', '<span class="cg-d">average</span>') +
        tile('Last check', u.last ? (u.last.ok ? 'Up' : 'Down') : '–', u.last ? '<span class="cg-d">' + esc(ago(u.last.at)) + '</span>' : '') +
      '</div>' + (down ? '<p class="cg-h">Recent problems</p><ul class="note" style="margin-left:18px">' + down + '</ul>' : '<p class="cg-empty">No downtime recorded in this period.</p>')
      : '<p class="cg-empty">The first check runs within 10 minutes.</p>'));
  }

  /* ---------------------------------------------------------------- Google */
  function loadCfg() {
    return DWData.rest('cgc_google?select=ga4_property,gsc_site,psi_key,sa_json&id=eq.1').then(function (rows) {
      var r = (rows || [])[0] || {};
      S.saEmail = '';
      try { S.saEmail = r.sa_json ? (JSON.parse(r.sa_json).client_email || '') : ''; } catch (e) { S.saEmail = 'saved, but not valid JSON'; }
      S.cfg = { ga4_property: r.ga4_property || '', gsc_site: r.gsc_site || 'sc-domain:coastalgolfco.co.uk', psi_key: r.psi_key || '', hasKey: !!r.sa_json };
      drawSettings();
    }).catch(function (e) { fill('settings', '<p class="cg-err">' + esc(e.message) + '</p>'); });
  }

  function loadGoogle(force) {
    fill('ga4', '<p class="cg-loading">Asking Google...</p>'); fill('gsc', '<p class="cg-loading">Asking Google...</p>');
    return DWData.fn('cgc-insights', { what:'google', days: S.days, force: !!force }).then(function (g) {
      S.g = g;
      if (g.setup) {
        var msg = '<p class="cg-empty">Not connected yet. Open <b>Google settings</b> at the bottom of this page to connect it, it takes about 10 minutes.</p>';
        fill('ga4', msg); fill('gsc', msg); return;
      }
      if (g.error) { fill('ga4', '<p class="cg-err">' + esc(g.error) + '</p>'); fill('gsc', ''); return; }
      drawGA4(g.ga4, g); drawGSC(g.gsc, g);
    }).catch(function (e) { fill('ga4', '<p class="cg-err">' + esc(e.message) + '</p>'); fill('gsc', ''); });
  }

  function stamp(g) { return '<p class="note" style="margin-top:10px">From Google ' + esc(ago(g.fetched_at)) + (g.cached ? ', refreshed hourly' : '') + '.</p>'; }

  function drawGA4(a, g) {
    if (!a || a.error) {
      fill('ga4', '<p class="cg-err">' + esc(a ? a.error : 'No data') + '</p>' +
        (S.saEmail ? '<p class="note">Check <code>' + esc(S.saEmail) + '</code> has Viewer access in GA4 (Admin, Property access management) and the property ID in Google settings is right.</p>' : ''));
      return;
    }
    var c = a.cur, p = a.prev;
    var daily = (a.daily || []).map(function (d) {
      return { v: d.users, label: dshort(d.d), tip: '<b>' + esc(dlong(d.d)) + '</b><br>' + num(d.users) + ' users<br>' + num(d.sessions) + ' sessions', row: [dlong(d.d), num(d.users), num(d.sessions)] };
    });
    fill('ga4',
      '<div class="cg-tiles">' +
        tile('Users', num(c.users), delta(c.users, p.users)) +
        tile('New users', num(c.new_users), delta(c.new_users, p.new_users)) +
        tile('Sessions', num(c.sessions), delta(c.sessions, p.sessions)) +
        tile('Page views', num(c.views), delta(c.views, p.views)) +
        tile('Engaged', c.engagement + '%', delta(c.engagement, p.engagement, false, 'pts'), 'Sessions over 10 seconds, with 2+ pages or a key event') +
        tile('Session length', secs(c.avg_secs), delta(c.avg_secs, p.avg_secs)) +
      '</div>' +
      (daily.length ? '<p class="cg-h">Users a day</p>' + columns(daily, { cols:['Day', 'Users', 'Sessions'], label:'GA4 users per day', maxLabels: 7 }) : '') +
      '<div class="cg-grid" style="margin-top:18px">' +
        '<div><p class="cg-h">How they found the site</p>' + bars(a.channels, { share: true }) + '</div>' +
        '<div><p class="cg-h">Top pages</p>' + bars(a.pages, { link: true }) + '</div>' +
        '<div><p class="cg-h">Towns and cities</p>' + bars(a.cities, { share: true }) + '</div>' +
        '<div><p class="cg-h">Events</p>' + bars(a.events) + '</div>' +
      '</div>' + stamp(g));
  }

  function drawGSC(s, g) {
    if (!s || s.error) {
      fill('gsc', '<p class="cg-err">' + esc(s ? s.error : 'No data') + '</p>' +
        (S.saEmail ? '<p class="note">Check <code>' + esc(S.saEmail) + '</code> is a user on the property in Search Console (Settings, Users and permissions) and the site in Google settings matches it exactly, e.g. <code>sc-domain:coastalgolfco.co.uk</code>.</p>' : ''));
      return;
    }
    var c = s.cur, p = s.prev;
    var daily = (s.daily || []).map(function (d) {
      return { v: d.clicks, label: dshort(d.d), tip: '<b>' + esc(dlong(d.d)) + '</b><br>' + num(d.clicks) + ' clicks<br>' + num(d.impressions) + ' times shown', row: [dlong(d.d), num(d.clicks), num(d.impressions)] };
    });
    var tbl = function (rows, first, link) {
      if (!rows || !rows.length) return '<p class="cg-empty">Nothing yet. New sites usually start showing searches within a couple of weeks.</p>';
      return '<div class="cg-wrapx"><table class="cg-table"><thead><tr><th>' + first + '</th><th class="n">Clicks</th><th class="n">Shown</th><th class="n">Position</th></tr></thead><tbody>' +
        rows.map(function (r) {
          var k = link ? '<a href="' + esc(r.k) + '" target="_blank" rel="noopener" style="color:inherit">' + esc(r.k.replace(/^https?:\/\/[^/]+/, '') || '/') + '</a>' : esc(r.k);
          return '<tr><td>' + k + '</td><td class="n">' + num(r.clicks) + '</td><td class="n">' + num(r.impressions) + '</td><td class="n">' + (r.position == null ? '–' : r.position) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    };
    fill('gsc',
      '<div class="cg-tiles">' +
        tile('Clicks from Google', num(c.clicks), delta(c.clicks, p.clicks)) +
        tile('Times shown', num(c.impressions), delta(c.impressions, p.impressions), 'Impressions: how often the site appeared in results') +
        tile('Click rate', c.ctr + '%', delta(c.ctr, p.ctr, false, 'pts')) +
        tile('Average position', c.position == null ? '–' : c.position, delta(c.position, p.position, true), 'Lower is better: 1 is the top result') +
      '</div>' +
      '<p class="note" style="margin:-6px 0 10px">' + esc(dshort(s.from)) + ' to ' + esc(dshort(s.to)) + '</p>' +
      (daily.length ? '<p class="cg-h">Clicks a day</p>' + columns(daily, { cols:['Day', 'Clicks', 'Times shown'], label:'Search clicks per day', maxLabels: 7 }) : '') +
      '<div class="cg-grid wide" style="margin-top:18px">' +
        '<div><p class="cg-h">What people searched</p>' + tbl(s.queries, 'Search') + '</div>' +
        '<div><p class="cg-h">Pages found in search</p>' + tbl(s.pages, 'Page', true) + '</div>' +
      '</div>' + stamp(g));
  }

  /* ---------------------------------------------------------------- speed */
  function loadSpeed(force) {
    fill('speed', '<p class="cg-loading">' + (force ? 'Running PageSpeed on mobile and desktop, this takes up to a minute...' : 'Loading the latest PageSpeed test...') + '</p>');
    return DWData.fn('cgc-insights', { what:'speed', force: !!force }).then(function (r) {
      S.speed = r;
      if (r.error) { fill('speed', '<p class="cg-err">PageSpeed: ' + esc(r.error) + '</p><button type="button" class="mini" data-cg="speed">Try again</button>'); return; }
      drawSpeed(r);
    }).catch(function (e) { fill('speed', '<p class="cg-err">' + esc(e.message) + '</p><button type="button" class="mini" data-cg="speed">Try again</button>'); });
  }

  function cwv(label, m, good, poor, unit) {
    if (!m) return '';
    var v = m.n, cls = v <= good ? 'ok' : v <= poor ? 'mid' : 'bad', word = cls === 'ok' ? 'good' : cls === 'mid' ? 'needs work' : 'poor';
    var show = unit === 'cls' ? Number(v).toFixed(2) : v >= 1000 ? (v / 1000).toFixed(1) + ' s' : Math.round(v) + ' ms';
    return '<dt>' + esc(label) + '</dt><dd>' + show + ' <span class="cg-st ' + (cls === 'ok' ? 'ok' : cls === 'bad' ? 'bad' : '') + '" style="' + (cls === 'mid' ? 'color:var(--cg-mid)' : '') + '">' + word + '</span></dd>';
  }

  function drawSpeed(r) {
    function one(name, s) {
      if (!s) return '';
      var f = s.field, sc = s.scores;
      return '<div><p class="cg-h">' + name + '</p><div class="cg-scores">' +
        scoreBadge('Performance', sc.performance) + scoreBadge('Accessibility', sc.accessibility) + scoreBadge('Best practice', sc.best) + scoreBadge('SEO', sc.seo) +
        '</div><dl class="cg-kv">' +
          cwv('Largest content shows', s.lab.lcp, 2500, 4000) +
          cwv('First content shows', s.lab.fcp, 1800, 3000) +
          cwv('Blocking time', s.lab.tbt, 200, 600) +
          cwv('Layout shift', s.lab.cls, 0.1, 0.25, 'cls') +
          (s.weight ? '<dt>Page weight</dt><dd>' + (s.weight / 1048576).toFixed(2) + ' MB</dd>' : '') +
          (f && f.overall ? '<dt>Real visitors (Chrome)</dt><dd>' + esc(f.overall.toLowerCase()) + '</dd>' : '') +
        '</dl>' +
        ((s.opportunities || []).length ? '<p class="cg-h" style="margin-top:14px">Quickest wins</p><ul class="note" style="margin-left:18px">' +
          s.opportunities.map(function (o) { return '<li>' + esc(o.title) + ' <span style="color:var(--muted-2)">(about ' + (o.saving_ms / 1000).toFixed(1) + ' s)</span></li>'; }).join('') + '</ul>' : '') +
        '</div>';
    }
    fill('speed', '<div class="cg-grid">' + one('Mobile', r.mobile) + one('Desktop', r.desktop) + '</div>' +
      '<p class="note" style="margin-top:12px">Tested ' + esc(ago(r.fetched_at)) + '. Scores move a few points between runs, so watch the trend rather than one result. ' +
      '<button type="button" class="mini" data-cg="speed">Test again now</button></p>');
  }

  /* ---------------------------------------------------------------- settings */
  function drawSettings() {
    var c = S.cfg || {};
    fill('settings',
      '<p class="note" style="margin:10px 0 4px">GA4 and Search Console are read with a Google service account: a robot user that only gets read access to this site\'s data.</p>' +
      '<ol>' +
        '<li>In <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud</a>, create a project (e.g. <b>Dunnworks dashboards</b>) and enable the <b>Google Analytics Data API</b> and the <b>Google Search Console API</b></li>' +
        '<li>IAM and admin, Service accounts, <b>Create service account</b>. Then Keys, Add key, <b>JSON</b>. A file downloads</li>' +
        '<li>Paste that whole file below and save. Its email then shows here' + (S.saEmail ? ': <code>' + esc(S.saEmail) + '</code>' : '') + '</li>' +
        '<li>GA4: Admin, <b>Property access management</b>, add that email as <b>Viewer</b>. The property ID is under Admin, Property details (numbers only)</li>' +
        '<li>Search Console: Settings, <b>Users and permissions</b>, add that email with <b>Restricted</b> access</li>' +
      '</ol>' +
      '<form class="edit" data-cg-form style="border-top:0;padding-top:0">' +
        '<div><label for="cg-ga4">GA4 property ID</label><input id="cg-ga4" name="ga4" inputmode="numeric" placeholder="e.g. 456789123" value="' + esc(c.ga4_property) + '"></div>' +
        '<div><label for="cg-gsc">Search Console site</label><input id="cg-gsc" name="gsc" value="' + esc(c.gsc_site) + '"></div>' +
        '<div><label for="cg-psi">PageSpeed API key (optional)</label><input id="cg-psi" name="psi" value="' + esc(c.psi_key) + '" placeholder="Only if tests hit a limit"></div>' +
        '<div class="wide"><label for="cg-sa">Service account key (JSON)</label><textarea id="cg-sa" name="sa" spellcheck="false" placeholder="' +
          (c.hasKey ? 'A key is saved. Paste a new one here only to replace it.' : '{ &quot;type&quot;: &quot;service_account&quot;, ... }') + '"></textarea></div>' +
        '<div class="wide set-actions"><button class="mini go" type="submit">Save and connect</button><span class="saved" data-cg-saved></span></div>' +
      '</form>');
  }

  function saveSettings(f) {
    var body = { ga4_property: f.elements.ga4.value.replace(/\D/g, '') || null, gsc_site: f.elements.gsc.value.trim() || null,
                 psi_key: f.elements.psi.value.trim() || null, updated_at: new Date().toISOString() };
    var sa = f.elements.sa.value.trim();
    if (sa) {
      try { var j = JSON.parse(sa); if (!j.client_email || !j.private_key) throw 0; }
      catch (e) { say('That key isn\'t right. Paste the whole JSON file Google downloaded.', 'bad'); return; }
      body.sa_json = sa;
    }
    var btn = f.querySelector('button'); btn.disabled = true;
    DWData.rest('cgc_google?id=eq.1', { method:'PATCH', body: body, headers:{ Prefer:'return=minimal' } })
      .then(function () { say('Google settings saved.', 'ok'); return loadCfg(); })
      .then(function () { return loadGoogle(true); })
      .catch(function (e) { say(e.message, 'bad'); })
      .finally(function () { btn.disabled = false; });
  }

  /* ---------------------------------------------------------------- events (bound once) */
  document.addEventListener('click', function (e) {
    if (!root || !root.contains(e.target)) return;
    var d = e.target.closest('[data-cg-days]');
    if (d) {
      S.days = Number(d.getAttribute('data-cg-days'));
      root.querySelectorAll('[data-cg-days]').forEach(function (b) { b.classList.toggle('is-on', b === d); });
      loadTraffic(); loadGoogle(false);
      return;
    }
    var a = e.target.closest('[data-cg]');
    if (!a) return;
    var what = a.getAttribute('data-cg');
    if (what === 'refresh') { loadTraffic(); loadGoogle(true); }
    if (what === 'speed') loadSpeed(true);
  });
  document.addEventListener('submit', function (e) {
    var f = e.target.closest && e.target.closest('[data-cg-form]');
    if (!f || !root || !root.contains(f)) return;
    e.preventDefault(); saveSettings(f);
  });

  w.DWCgc = {
    view: view,
    /* small numbers for the menu tile, loaded with everything else */
    summary: function () {
      return DWData.rest('rpc/cgc_traffic', { method:'POST', body:{ days: 7 } }).catch(function () { return null; });
    }
  };
})(window);
