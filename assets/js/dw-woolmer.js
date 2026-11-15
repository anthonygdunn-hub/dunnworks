/* Dunnworks console: woolmer.info dashboard (#/woolmer).
 * Tabs, modelled on the Constancia ops dashboard:
 *   Traffic          own cookie-free counter (rpc wb_traffic): visits, page views, channels, landing pages, referrers
 *   Google search    Search Console via edge function wb-insights (woolmer's own service account, wb_google)
 *   Target keywords  wb_keywords + Search Console positions
 *   Speed            PageSpeed Insights via wb-insights
 *   Businesses       rpc wb_stats: listing clicks, mock-up views, Dunnworks leads, guide totals
 */
(function (w) {
  'use strict';
  var SITE = 'https://woolmer.info';
  var S = { days: 30, tab: 'traffic', t: null, d: null, g: null, sp: null, gs: null, kwAll: false, qAll: false, cAll: false, lAll: false };
  var root = null, say = function () {};
  /* Dunnworks brand: violet #7000ff / #a97cff on ink, shades of the same family so channels stay distinguishable */
  var CH = [['Direct', '#7000ff'], ['Organic Search', '#a97cff'], ['Organic Social', '#3b0a8f'], ['Referral', '#d4c2ff'], ['Organic Video', '#c046ff'], ['AI engines', '#757083']];
  var TABS = [['traffic', 'Traffic'], ['google', 'Google search'], ['keywords', 'Target keywords'], ['speed', 'Speed'], ['business', 'Businesses & leads']];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function num(x) { return x == null || isNaN(x) ? '–' : Number(x).toLocaleString('en-GB'); }
  function dshort(d) { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short' }); }
  function dlong(d) { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }); }
  function dfull(d) { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }); }
  function ago(iso) { if (!iso) return ''; var m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' hr ago' : Math.round(m / 1440) + ' days ago'; }
  function delta(cur, prev, lowerBetter) {
    cur = cur || 0; prev = prev || 0;
    if (!prev && !cur) return '<span class="cg-d">no change</span>';
    if (!prev) return '<span class="cg-d up">new</span>';
    var diff = Math.round(100 * (cur - prev) / prev); if (!diff) return '<span class="cg-d">no change</span>';
    var good = lowerBetter ? diff < 0 : diff > 0;
    return '<span class="cg-d ' + (good ? 'up' : 'down') + '">' + (diff > 0 ? '▲ ' : '▼ ') + Math.abs(diff) + '% on the period before</span>';
  }
  function info(t) { return ' <span class="wbx-i" title="' + esc(t) + '" tabindex="0">ⓘ</span>'; }
  function tile(label, value, extra, hint) { return '<div class="cg-tile"><span>' + esc(label) + (hint ? info(hint) : '') + '</span><b>' + value + '</b>' + (extra || '') + '</div>'; }
  function card(title, hint, inner, cls) { return '<section class="cg-sec ' + (cls || '') + '"><h2>' + esc(title) + (hint ? info(hint) : '') + '</h2>' + inner + '</section>'; }
  function niceMax(v) { if (!v || v <= 4) return 4; var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }

  /* stacked (or single) column chart in plain HTML */
  function stacked(rows, series, label) {
    if (!rows || !rows.length) return '<p class="cg-empty">Nothing yet.</p>';
    var totals = rows.map(function (r) { return series.reduce(function (a, s) { return a + (r.v[s[0]] || 0); }, 0); });
    var top = niceMax(Math.max.apply(null, totals));
    var every = Math.ceil(rows.length / (w.innerWidth < 620 ? 4 : 8));
    var grid = [top, top / 2, 0].map(function (g) { return '<div class="cg-gl" style="bottom:' + (100 * g / top) + '%"><span>' + num(Math.round(g)) + '</span></div>'; }).join('');
    var cols = rows.map(function (r, i) {
      var segs = series.map(function (s) { var v = r.v[s[0]] || 0; return v ? '<em style="height:' + (100 * v / top) + '%;background:' + s[1] + '"></em>' : ''; }).join('');
      var tip = '<b>' + esc(r.tip) + '</b>' + series.filter(function (s) { return r.v[s[0]]; }).map(function (s) { return '<br><i style="background:' + s[1] + '"></i>' + esc(s[0]) + ': ' + num(r.v[s[0]]); }).join('') + (series.length > 1 ? '<br>Total: ' + num(totals[i]) : '');
      return '<div class="cg-col" tabindex="0"><div class="wbx-segs">' + segs + '</div>' +
        ((i % every === 0 || i === rows.length - 1) ? '<span class="cg-xl">' + esc(r.label) + '</span>' : '') + '<div class="cg-tip">' + tip + '</div></div>';
    }).join('');
    var legend = series.length > 1 ? '<div class="wbx-leg">' + series.map(function (s) { return '<span><i style="background:' + s[1] + '"></i>' + esc(s[0]) + '</span>'; }).join('') + '</div>' : '';
    return '<div class="cg-chart" role="img" aria-label="' + esc(label) + '"><div class="cg-plot">' + grid + '<div class="cg-cols">' + cols + '</div></div></div>' + legend;
  }
  function hbars(rows, color) {
    if (!rows || !rows.length) return '<p class="cg-empty">Nothing yet.</p>';
    var max = Math.max.apply(null, rows.map(function (r) { return r.n || 0; })) || 1;
    return '<div class="wbx-hb">' + rows.map(function (r) {
      return '<div class="wbx-hr"><span>' + esc(r.k) + '</span><i><em style="width:' + Math.max(2, Math.round(100 * r.n / max)) + '%;background:' + (r.c || color || 'var(--accent)') + '"></em></i><b>' + num(r.n) + '</b></div>';
    }).join('') + '</div>';
  }
  function table(head, rows, opts) {
    opts = opts || {};
    if (!rows.length) return '<p class="cg-empty">' + esc(opts.empty || 'Nothing yet.') + '</p>';
    var limit = opts.limit || 10, show = opts.all ? rows : rows.slice(0, limit);
    return '<div class="cg-wrapx"><table class="cg-table"><thead><tr>' + head.map(function (h, i) { return '<th' + (i && !(opts.text || []).includes(i) ? ' class="n"' : '') + '>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      show.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (i && !(opts.text || []).includes(i) ? ' class="n"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
      (rows.length > limit && opts.more ? '<button type="button" class="wbx-more" data-wbx-more="' + opts.more + '">' + (opts.all ? 'Show fewer' : 'Show all ' + rows.length) + '</button>' : '');
  }
  function plink(p) { return '<a href="' + SITE + esc(p) + '" target="_blank" rel="noopener">' + esc(p) + '</a>'; }

  function css() {
    if (document.getElementById('wbx-css')) return;
    var s = document.createElement('style'); s.id = 'wbx-css';
    s.textContent = [
      '.cg-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px}.cg-bar .sp{flex:1}',
      '.cg-note{border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:var(--radius);background:var(--ink-2);padding:12px 15px;font-size:14px;color:var(--muted);margin-bottom:16px}.cg-note b{color:var(--paper)}',
      '.cg-sec{border:1px solid var(--line);border-radius:var(--radius);background:var(--ink-2);padding:18px 19px;margin-bottom:14px;min-width:0}',
      '.cg-sec > h2{font-family:var(--font-mono);font-size:11px;letter-spacing:.09em;text-transform:uppercase;font-weight:400;margin-bottom:14px;color:var(--muted-2)}',
      '.cg-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:0 0 14px}',
      '.cg-tile{border:1px solid var(--line);border-top:2px solid var(--accent);border-radius:var(--radius);background:var(--ink-2);padding:16px 18px;min-width:0}',
      '.cg-tile > span{display:block;font-family:var(--font-mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted-2);margin-bottom:9px}.cg-tile .wbx-i{display:inline}',
      '.cg-tile b{display:block;font-family:var(--font-display);font-size:30px;line-height:1.05;color:var(--paper);font-weight:700;letter-spacing:-.01em}',
      '.cg-d{display:inline-block;margin-top:6px;font-size:11.5px;color:var(--muted-2)}.cg-d.up{color:var(--cg-good)}.cg-d.down{color:var(--bad)}',
      ':root{--cg-good:#a97cff}:root[data-theme=light]{--cg-good:#5600c2}',
      '.wbx-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:14px}@media (max-width:620px){.wbx-grid{grid-template-columns:1fr}}',
      '.cg-empty{color:var(--muted-2);font-size:13.5px}',
      '.cg-chart{margin:8px 0 4px;padding:0 0 24px 40px}.cg-plot{position:relative;height:260px}',
      '.cg-gl{position:absolute;left:0;right:0;border-top:1px solid var(--line)}',
      '.cg-gl span{position:absolute;right:100%;margin-right:8px;transform:translateY(-50%);font-size:11px;color:var(--muted-2);white-space:nowrap}',
      '.cg-cols{position:absolute;inset:0;display:flex;align-items:flex-end;gap:3px}',
      '.cg-col{position:relative;flex:1;height:100%;display:flex;align-items:flex-end;outline:none;min-width:0}',
      '.wbx-segs{width:100%;max-width:34px;margin:0 auto;height:100%;display:flex;flex-direction:column-reverse}',
      '.wbx-segs em{display:block;width:100%}.wbx-segs em:last-child{border-radius:var(--radius) var(--radius) 0 0}',
      '.cg-col:hover .wbx-segs,.cg-col:focus .wbx-segs{filter:brightness(1.12)}',
      '.cg-xl{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:7px;font-size:11px;color:var(--muted-2);white-space:nowrap}',
      '.cg-tip{display:none;position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);z-index:5;background:var(--ink-3);border:1px solid var(--line-2);border-radius:var(--radius);padding:8px 10px;font-size:12.5px;line-height:1.5;white-space:nowrap;color:var(--paper);pointer-events:none}',
      '.cg-tip i,.wbx-leg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;vertical-align:-1px}',
      '.cg-col:first-child .cg-tip,.cg-col:nth-child(2) .cg-tip{left:0;transform:none}.cg-col:last-child .cg-tip,.cg-col:nth-last-child(2) .cg-tip{left:auto;right:0;transform:none}',
      '.cg-col:hover .cg-tip,.cg-col:focus .cg-tip{display:block}',
      '.wbx-leg{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:var(--muted);margin-top:4px}',
      '.wbx-hb{display:grid;gap:12px}.wbx-hr{display:grid;grid-template-columns:minmax(110px,32%) 1fr 56px;gap:14px;align-items:center;font-size:14px}',
      '.wbx-hr span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--paper)}.wbx-hr b{text-align:right;font-weight:500;font-variant-numeric:tabular-nums}',
      '.wbx-hr i{display:block;height:8px;background:var(--line);border-radius:var(--radius);overflow:hidden}.wbx-hr em{display:block;height:100%;border-radius:var(--radius)}',
      '.cg-table{width:100%;min-width:0;border-collapse:collapse;font-size:13.5px}.wbx-grid > *{min-width:0}.cg-table td{overflow-wrap:anywhere}',
      '.cg-table th,.cg-table td{text-align:left;padding:8px;border-bottom:1px solid var(--line)}',
      '.cg-table th{font-size:12px;color:var(--muted);font-weight:500}.cg-table td a{color:var(--paper);text-decoration:none}.cg-table td a:hover{text-decoration:underline}',
      '.cg-table td.n,.cg-table th.n{text-align:right;font-variant-numeric:tabular-nums}.cg-wrapx{overflow-x:auto}',
      '.wbx-more{margin-top:10px;background:none;border:0;padding:0;color:var(--accent-2);font:inherit;font-size:13px;cursor:pointer}',
      '.wbx-i{color:var(--muted-2);font-size:12px;cursor:help}',
      '.wbx-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px;border-bottom:1px solid var(--line);padding-bottom:10px}',
      '.wbx-range{font-size:14px;color:var(--paper);margin:0 0 6px}.wbx-sub{font-size:13.5px;color:var(--muted);margin:0 0 14px}',
      '.wbx-score{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.wbx-score div{border:1px solid var(--line);border-radius:var(--radius);padding:12px;text-align:center}',
      '.wbx-score b{display:block;font-family:var(--font-display);font-size:28px;font-weight:700;color:var(--paper)}.wbx-score .ok{border-top:2px solid var(--accent)}.wbx-score .ok b{color:var(--accent-2)}.wbx-score .mid{border-top:2px solid #ffb347}.wbx-score .mid b{color:#ffb347}.wbx-score .bad{border-top:2px solid var(--bad)}.wbx-score .bad b{color:var(--bad)}',
      '.wbx-score span{font-size:12px;color:var(--muted)}',
      '.wbx-form textarea{width:100%;min-height:120px;font:12px var(--font-mono);background:var(--ink);color:var(--paper);border:1px solid var(--line);border-radius:var(--radius);padding:10px}',
      '.wbx-steps{margin:8px 0 12px 18px;font-size:14px;color:var(--muted);line-height:1.7}.wbx-steps b,.wbx-steps code{color:var(--paper)}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function rpc(name, body) { return DWData.rest('rpc/' + name, { method:'POST', body: body || {} }); }
  function fn(body) {
    if (DWData.fn) return DWData.fn('wb-insights', body);
    var t = null; try { t = JSON.parse(localStorage.getItem('dw-auth') || 'null'); } catch (e) {}
    return fetch(w.DW.url + '/functions/v1/wb-insights', { method:'POST', body: JSON.stringify(body), headers:{ apikey: w.DW.anonKey, Authorization: 'Bearer ' + (t && t.access_token ? t.access_token : w.DW.anonKey), 'Content-Type':'application/json' } })
      .then(function (r) { return r.json(); });
  }

  function rangeLine(from, to) { return '<p class="wbx-range">Last ' + S.days + ' days: ' + dfull(from) + ' to ' + dfull(to) + '</p>'; }

  function viewTraffic(el) {
    var t = S.t; if (!t) { el.innerHTML = '<p class="cg-empty">Loading…</p>'; return; }
    var series = CH.filter(function (c) { return (t.channels || []).some(function (x) { return x.k === c[0]; }); });
    if (!series.length) series = [CH[0]];
    var rows = (t.daily || []).map(function (r) { return { label: dshort(r.day), tip: dlong(r.day), v: r.ch || {} }; });
    var colour = {}; CH.forEach(function (c) { colour[c[0]] = c[1]; });
    el.innerHTML = rangeLine(t.from, t.to) +
      '<p class="wbx-sub">Visits are counted from 15 November 2026 (page views from 13 November). A visit is someone arriving from outside the site; admin pages and bots are left out. No cookies, so one person on two days counts twice.</p>' +
      '<div class="cg-tiles">' +
        tile('Visits', num(t.visits), delta(t.visits, t.visits_prev), 'Arrivals from outside woolmer: search, social, links, apps or typed in') +
        tile('Page views', num(t.views), delta(t.views, t.views_prev), 'Every page loaded, including moving around the site') +
        tile('From search', num(t.search), '', 'Visits from Google, Bing, DuckDuckGo and other search engines') +
        tile('From social', num(t.social), '', 'Facebook, Instagram, WhatsApp, X, Nextdoor and similar') +
        tile('From AI engines', num(t.ai), '', 'ChatGPT, Perplexity, Claude, Gemini and Copilot') +
      '</div>' +
      card('Visits by channel', 'Each bar is a day; colours show where the visits came from', stacked(rows, series, 'Visits by channel per day')) +
      '<div class="wbx-grid">' +
        card('Channels', 'Where visits came from over the period', hbars((t.channels || []).map(function (c) { return { k: c.k, n: c.n, c: colour[c.k] }; }))) +
        card('Top landing pages', 'The first page people saw when they arrived', table(['Page', 'Visits'], (t.landing || []).map(function (r) { return [plink(r.k), num(r.n)]; }), { more: 'landing', all: S.lAll, limit: 8 })) +
      '</div>' +
      card('Referring sites', 'Sites that sent visitors, excluding typed-in and direct', table(['Site', 'Channel', 'Visits'], (t.refs || []).map(function (r) { return [esc(r.k), esc(r.ch), num(r.n)]; }), { text: [1], empty: 'No referring sites yet.' }));
  }

  function needGoogle(el, g) {
    var email = (S.gs && S.gs.email) || (g && g.sa_email) || '';
    el.innerHTML = '<div class="cg-note"><b>Connect Google Search Console for woolmer.</b> This uses woolmer\'s own Google service account, kept separate from every client\'s.</div>' +
      (g && g.error ? '<div class="cg-note" style="border-left-color:var(--bad)">' + esc(g.error) + '</div>' : '') +
      card('Set up (about 5 minutes)', '', '<ol class="wbx-steps">' +
        '<li>In <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Google Cloud</a>, create a project called <b>woolmer</b>.</li>' +
        '<li>Turn on the <a href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com" target="_blank" rel="noopener">Search Console API</a> for it.</li>' +
        '<li>Under <b>IAM &amp; Admin → Service accounts</b>, create one called <b>woolmer-dashboard</b> (no roles needed), then <b>Keys → Add key → JSON</b>. A file downloads.</li>' +
        '<li>Open that file, copy everything, and paste it below.</li>' +
        '<li>In <a href="https://search.google.com/search-console/users?resource_id=https%3A%2F%2Fwoolmer.info%2F" target="_blank" rel="noopener">Search Console → Settings → Users and permissions</a>, add the service account\'s email' + (email ? ' (<code>' + esc(email) + '</code>)' : '') + ' with <b>Restricted</b> permission.</li></ol>' +
        '<form class="wbx-form" data-wbx-form><textarea name="sa" placeholder="Paste the service account JSON key here" spellcheck="false" autocomplete="off"></textarea><p style="margin-top:10px"><button class="mini" type="submit">Save key</button> <span class="cg-empty">Stored so only woolmer\'s server can read it. It isn\'t shown again.</span></p></form>' +
        (email ? '<p class="cg-empty">Saved service account: <code>' + esc(email) + '</code>. Once it\'s added in Search Console, press Refresh.</p>' : ''));
  }

  function viewGoogle(el) {
    var g = S.g; if (!g) { el.innerHTML = '<p class="cg-empty">Loading Search Console…</p>'; return; }
    if (g.setup || g.error || !g.gsc) return needGoogle(el, g);
    var s = g.gsc, c = s.cur, p = s.prev, days = s.daily || [];
    el.innerHTML = rangeLine(s.from, s.to) + '<p class="wbx-sub">Google Search Console. Its last 2 to 3 days fill in late, so the newest days read low at first. Updated ' + esc(ago(g.fetched_at)) + '.</p>' +
      '<div class="cg-tiles">' +
        tile('Clicks', num(c.clicks), delta(c.clicks, p.clicks), 'People who clicked through to woolmer from Google') +
        tile('Impressions', num(c.impressions), delta(c.impressions, p.impressions), 'Times woolmer appeared in Google results') +
        tile('Click rate', (c.ctr || 0) + '%', '', 'Clicks divided by impressions') +
        tile('Average position', (c.position == null || !c.impressions) ? '–' : c.position, p.position ? '<span class="cg-d">' + p.position + ' the period before</span>' : '', 'Lower is better; 1 to 10 is page 1') +
        tile('Non-brand clicks', num(s.nonbrand_clicks), '', 'Clicks from searches that don\'t include "woolmer"') +
      '</div>' +
      card('Impressions', 'Times woolmer appeared in Google per day', stacked(days.map(function (r) { return { label: dshort(r.d), tip: dlong(r.d), v: { Impressions: r.impressions } }; }), [['Impressions', '#7000ff']], 'Impressions per day')) +
      card('Clicks', 'Clicks from Google per day', stacked(days.map(function (r) { return { label: dshort(r.d), tip: dlong(r.d), v: { Clicks: r.clicks } }; }), [['Clicks', '#a97cff']], 'Clicks per day')) +
      '<div class="wbx-grid">' +
        card('Top searches', 'What people searched before seeing woolmer', table(['Search', 'Clicks', 'Impressions', 'Position'], (s.queries || []).map(function (r) { return [esc(r.k) + (/woolmer/i.test(r.k) ? ' <span class="cg-empty">(brand)</span>' : ''), num(r.clicks), num(r.impressions), r.position]; }), { more: 'q', all: S.qAll })) +
        card('Close to page 1', 'Searches where woolmer sits between 4th and 20th: the quickest wins', table(['Search', 'Impressions', 'Position'], (s.close || []).map(function (r) { return [esc(r.k), num(r.impressions), r.position]; }), { more: 'c', all: S.cAll, empty: 'Nothing close to page 1 yet.' })) +
      '</div>' +
      card('Search landing pages', 'Pages people reached from Google', table(['Page', 'Clicks', 'Impressions', 'Position'], (s.pages || []).map(function (r) { return [plink(r.k), num(r.clicks), num(r.impressions), r.position]; })));
  }

  function where(pos) { return pos == null ? 'Not in the top 50' : pos <= 3 ? 'Top 3' : pos <= 10 ? 'Page 1' : pos <= 20 ? 'Page 2' : pos <= 50 ? 'Top 50' : 'Not in the top 50'; }
  function viewKeywords(el) {
    var g = S.g; if (!g) { el.innerHTML = '<p class="cg-empty">Loading…</p>'; return; }
    if (g.setup || g.error || !g.gsc) return needGoogle(el, g);
    var k = g.gsc.keywords || [];
    var onP1 = k.filter(function (x) { return x.position != null && x.position <= 10; });
    var vol = k.reduce(function (a, x) { return a + (x.volume || 0); }, 0), volP1 = onP1.reduce(function (a, x) { return a + (x.volume || 0); }, 0);
    var opp = k.filter(function (x) { return x.position == null || x.position > 10; }).sort(function (a, b) { return (b.volume || 0) - (a.volume || 0) || (b.impressions - a.impressions); }).slice(0, 10);
    el.innerHTML = rangeLine(g.gsc.from, g.gsc.to) + '<p class="wbx-sub">The local searches woolmer is built to win, and where it stands on each in Google UK.</p>' +
      '<div class="cg-tiles">' +
        tile('Keywords tracked', num(k.length)) + tile('On page 1', num(onP1.length)) +
        tile('Monthly searches targeted', vol ? num(vol) : '–', vol ? '' : '<span class="cg-d">needs search volumes</span>', 'Sum of Google UK monthly searches for the tracked keywords') +
        tile('Of those, on page 1', vol ? Math.round(100 * volP1 / vol) + '%' : '–') +
        tile('Clicks from target keywords', num(k.reduce(function (a, x) { return a + x.clicks; }, 0))) +
      '</div>' +
      card('Progress by keyword', 'Position is Google\'s average for the period, from Search Console', table(['Keyword', 'Page', 'Monthly searches', 'Position', 'Where we are', 'Shown', 'Clicks'],
        k.map(function (x) { return [esc(x.keyword), plink(x.page || '/'), x.volume == null ? '–' : num(x.volume), x.position == null ? '–' : x.position, where(x.position), num(x.impressions), num(x.clicks)]; }), { text: [1, 4], more: 'kw', all: S.kwAll, limit: 15 })) +
      card('Biggest opportunities', 'Not on page 1 yet, biggest first', table(['Keyword', 'Page', 'Monthly searches', 'Where we are'], opp.map(function (x) { return [esc(x.keyword), plink(x.page || '/'), x.volume == null ? '–' : num(x.volume), where(x.position)]; }), { text: [1, 3] })) +
      card('How to read this', '', '<p class="wbx-sub" style="margin:0">Positions come from Search Console and only show once woolmer has appeared for that exact search. Monthly search volumes need a keyword data source (Google Ads Keyword Planner or DataForSEO); until one is added they show as –.</p>');
  }

  function viewSpeed(el) {
    var sp = S.sp; if (!sp) { el.innerHTML = '<p class="cg-empty">Running PageSpeed on woolmer.info… this takes up to a minute.</p>'; return; }
    if (sp.error) {
      el.innerHTML = '<div class="cg-note" style="border-left-color:var(--bad)">' + esc(sp.error) + '</div>' +
        card('Add a free PageSpeed key', '', '<p class="wbx-sub">Without a key, PageSpeed shares Google\'s anonymous daily limit, which runs out. In the same Google Cloud project as the Search Console key: turn on the <a href="https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com" target="_blank" rel="noopener">PageSpeed Insights API</a>, then <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Credentials → Create credentials → API key</a>, restrict it to the PageSpeed Insights API, and paste it here.</p>' +
          '<form data-wbx-psi style="display:flex;gap:8px;flex-wrap:wrap"><input name="k" autocomplete="off" spellcheck="false" placeholder="AIza…" style="flex:1;min-width:240px;font:13px var(--font-mono);background:var(--ink);color:var(--paper);border:1px solid var(--line);border-radius:var(--radius);padding:8px 10px"><button class="mini" type="submit">Save key</button></form>' +
          (S.gs && S.gs.psi ? '<p class="cg-empty" style="margin-top:8px">A key is saved. Press Refresh to try again.</p>' : ''));
      return;
    }
    var sc = function (label, s) { var cls = s == null ? '' : s >= 90 ? 'ok' : s >= 50 ? 'mid' : 'bad'; return '<div class="' + cls + '"><b>' + (s == null ? '–' : s) + '</b><span>' + label + '</span></div>'; };
    var block = function (name, r) { return card(name, '', '<div class="wbx-score">' + sc('Performance', r.scores.performance) + sc('Accessibility', r.scores.accessibility) + sc('Best practice', r.scores.best) + sc('SEO', r.scores.seo) + '</div>' +
      '<p class="wbx-sub" style="margin:12px 0 0">Largest paint ' + esc(r.lcp || '–') + ' · Layout shift ' + esc(r.cls || '–') + ' · Blocking ' + esc(r.tbt || '–') + '</p>' +
      (r.opportunities && r.opportunities.length ? '<ul class="wbx-steps">' + r.opportunities.map(function (o) { return '<li>' + esc(o.title) + ' <span class="cg-empty">(saves about ' + (o.saving_ms / 1000).toFixed(1) + 's)</span></li>'; }).join('') + '</ul>' : '')); };
    el.innerHTML = '<p class="wbx-sub">Google PageSpeed Insights for the home page. Updated ' + esc(ago(sp.fetched_at)) + '.</p><div class="wbx-grid">' + block('Mobile', sp.mobile) + block('Desktop', sp.desktop) + '</div>';
  }

  function viewBusiness(el) {
    var d = S.d; if (!d) { el.innerHTML = '<p class="cg-empty">Loading…</p>'; return; }
    var t = d.totals || {}, p = d.prev || {}, s = d.site || {};
    var clicks = (t.call || 0) + (t.website || 0) + (t.directions || 0) + (t.menu || 0), pclicks = (p.call || 0) + (p.website || 0) + (p.directions || 0) + (p.menu || 0);
    var mockViews = (d.mockups || []).reduce(function (a, r) { return a + (r.views || 0); }, 0);
    el.innerHTML = '<p class="wbx-sub">Clicks and mock-up views are counted from 15 November 2026. A summary is emailed to hello@woolmer.info every day at 7pm.</p>' +
      '<div class="cg-tiles">' +
        tile('Calls, websites, directions', num(clicks), delta(clicks, pclicks), 'Clicks from listings to phone, website, directions or menu') +
        tile('Mock-up views', num(mockViews)) + tile('Dunnworks clicks', num(t.dunnworks || 0), delta(t.dunnworks, p.dunnworks)) +
        tile('Listings', num(s.places)) + tile('Claimed', num(s.claimed)) + tile('Upcoming events', num(s.events)) +
        tile('Email subscribers', num(s.subscribers)) + tile('Waiting for you', num((s.waiting || 0) + (s.submissions || 0)), '<a class="cg-d" href="' + SITE + '/admin/" target="_blank" rel="noopener">open woolmer admin</a>') +
      '</div>' +
      card('Businesses', 'Your sales evidence: "40 people looked you up on woolmer this month and 12 tried to call"', table(['Business', 'Views', 'Calls', 'Website', 'Directions', 'Menu'],
        (d.business || []).map(function (r) { return ['<a href="' + SITE + esc(r.path) + '" target="_blank" rel="noopener">' + esc(r.name || r.path) + '</a>', num(r.views), num(r.calls), num(r.website), num(r.directions), num(r.menu)]; }), { limit: 25, empty: 'No listing views yet.' })) +
      card('Mock-ups (Dunnworks leads)', 'A business opening its own mock-up more than once is a warm lead', table(['Mock-up', 'Views', 'Dunnworks clicks'],
        (d.mockups || []).map(function (r) { return ['<a href="' + SITE + esc(r.path) + '" target="_blank" rel="noopener">' + esc(r.name || r.path) + '</a>', num(r.views), num(r.clicks)]; }), { limit: 25, empty: 'No mock-up views yet.' })) +
      card('Dunnworks clicks by page', '', table(['Page', 'Link', 'Clicks'], (d.dunnworks || []).map(function (r) { return [plink(r.path), esc(r.label || ''), num(r.n)]; }), { text: [1], empty: 'No Dunnworks clicks yet.' }));
  }

  function paint() {
    if (!root) return;
    var el = root.querySelector('[data-wbx]'); if (!el) return;
    ({ traffic: viewTraffic, google: viewGoogle, keywords: viewKeywords, speed: viewSpeed, business: viewBusiness })[S.tab](el);
  }
  function load(force) {
    say('');
    if (S.tab === 'traffic') rpc('wb_traffic', { p_days: S.days }).then(function (t) { S.t = t; paint(); }).catch(function (e) { say(e.message, 'bad'); });
    if (S.tab === 'business') rpc('wb_stats', { p_days: S.days }).then(function (d) { S.d = d; paint(); }).catch(function (e) { say(e.message, 'bad'); });
    if (S.tab === 'google' || S.tab === 'keywords') {
      rpc('wb_google_status').then(function (gs) { S.gs = gs; }).catch(function () {});
      fn({ what: 'google', days: S.days, force: !!force }).then(function (g) { S.g = g; paint(); }).catch(function (e) { S.g = { error: e.message }; paint(); });
    }
    if (S.tab === 'speed') rpc('wb_google_status').then(function (gs) { S.gs = gs; }).catch(function () {});
    if (S.tab === 'speed') fn({ what: 'speed', force: !!force }).then(function (sp) { S.sp = sp; paint(); }).catch(function (e) { S.sp = { error: e.message }; paint(); });
  }
  function view(el, sayFn) {
    root = el; say = sayFn || say; css();
    el.innerHTML = '<div class="wbx-tabs">' + TABS.map(function (t) { return '<button type="button" class="chip' + (S.tab === t[0] ? ' is-on' : '') + '" data-wbx-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div class="cg-bar">' + (S.tab === 'speed' ? '' : [7, 30, 90].map(function (n) { return '<button type="button" class="chip' + (n === S.days ? ' is-on' : '') + '" data-wbx-days="' + n + '">' + n + ' days</button>'; }).join('')) +
      '<span class="sp"></span><a class="mini" href="' + SITE + '/" target="_blank" rel="noopener">Open woolmer.info</a><button type="button" class="mini" data-wbx-refresh>Refresh</button></div>' +
      '<div data-wbx><p class="cg-empty">Loading…</p></div>';
    paint(); load();
  }
  document.addEventListener('click', function (e) {
    if (!root) return;
    var b = e.target.closest && e.target.closest('[data-wbx-days],[data-wbx-refresh],[data-wbx-tab],[data-wbx-more]');
    if (!b || !root.contains(b)) return;
    if (b.hasAttribute('data-wbx-tab')) { S.tab = b.getAttribute('data-wbx-tab'); view(root, say); }
    else if (b.hasAttribute('data-wbx-days')) { S.days = +b.getAttribute('data-wbx-days'); S.t = S.d = S.g = null; view(root, say); }
    else if (b.hasAttribute('data-wbx-more')) { var k = b.getAttribute('data-wbx-more'); if (k === 'kw') S.kwAll = !S.kwAll; if (k === 'q') S.qAll = !S.qAll; if (k === 'c') S.cAll = !S.cAll; if (k === 'landing') S.lAll = !S.lAll; paint(); }
    else load(true);
  });
  document.addEventListener('submit', function (e) {
    var pf = e.target.closest && e.target.closest('[data-wbx-psi]');
    if (pf && root && root.contains(pf)) {
      e.preventDefault();
      rpc('wb_set_psi_key', { p_key: pf.querySelector('input').value.trim() }).then(function () { say('PageSpeed key saved.', 'ok'); S.sp = null; paint(); load(true); }).catch(function (err) { say(err.message, 'bad'); });
      return;
    }
    var f = e.target.closest && e.target.closest('[data-wbx-form]');
    if (!f || !root || !root.contains(f)) return;
    e.preventDefault();
    var v = f.querySelector('textarea').value.trim(); if (!v) return;
    rpc('wb_set_google', { p_json: v }).then(function (email) {
      f.querySelector('textarea').value = '';
      say('Saved. Now add ' + email + ' as a user on woolmer.info in Search Console, then press Refresh.', 'ok');
      S.gs = { email: email }; S.g = null; load(true);
    }).catch(function (err) { say(err.message, 'bad'); });
  });

  w.DWWoolmer = {
    view: view,
    summary: function () { return rpc('wb_stats', { p_days: 7 }).catch(function () { return null; }); }
  };
})(window);
