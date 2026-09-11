/* Dunnworks — renders /preview/ from the dw_projects table.
   The page ships with the current projects in the HTML, so if Supabase is
   paused, blocked or simply slow, the client still sees their preview and can
   open it. This script only replaces that markup once it has real rows. */
(function (w, d) {
  'use strict';
  var mount = d.getElementById('pv-live');
  var fallback = d.getElementById('pv-fallback');
  if (!mount || !w.DWData || !w.DWData.ready) return;

  var LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
             '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function niceDate(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    if (p.length !== 3) return iso;
    var m = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return parseInt(p[2], 10) + ' ' + m[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  function host(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
  }

  function meta(pairs) {
    var out = pairs.filter(function (p) { return p[1]; }).map(function (p) {
      return '<div><span class="k">' + esc(p[0]) + '</span><span class="v">' + p[1] + '</span></div>';
    }).join('');
    return out ? '<div class="pv-meta">' + out + '</div>' : '';
  }

  function card(r, i, live) {
    var num = (live ? 'Launched ' : 'Preview ') + ('0' + (i + 1)).slice(-2);
    var state = live
      ? '<span class="pv-state is-live">Live</span>'
      : (r.status === 'ready'
          ? '<span class="pv-state is-open">Ready</span>'
          : '<span class="pv-state is-soon">In build</span>');

    var rows, btns;
    if (live) {
      rows = meta([
        ['Sector', esc(r.sector)],
        ['Pages', r.pages ? esc(r.pages) : ''],
        ['Address', r.live_url ? esc(host(r.live_url)) : ''],
        ['Live since', esc(niceDate(r.live_on))]
      ]);
      btns = r.live_url
        ? '<div class="btn-row"><a class="btn" href="' + esc(r.live_url) + '" target="_blank" rel="noopener">Visit the site</a></div>'
        : '';
    } else {
      rows = meta([
        ['Job', 'Rebuild'],
        ['Pages', r.pages ? esc(r.pages) : ''],
        ['Sector', esc(r.sector)],
        ['Project sheet', esc(niceDate(r.report_on))]
      ]);
      var b = [];
      if (r.has_preview && r.status !== 'build') {
        b.push('<a class="btn" href="' + esc(r.slug) + '/"><span class="pv-lock">' + LOCK + ' Open preview</span></a>');
      }
      if (r.has_report && r.status !== 'build') {
        b.push('<a class="btn btn--ghost" href="' + esc(r.slug) + '/report/"><span class="pv-lock">' + LOCK + ' Read the project sheet</span></a>');
      }
      btns = b.length ? '<div class="btn-row">' + b.join('') + '</div>' : '';
    }

    return '<article class="card pv-card"' + (r.status === 'build' ? ' style="border-style:dashed"' : '') + '>' +
      '<div class="pv-top"><span class="num" style="margin:0">' + esc(num) + '</span>' + state + '</div>' +
      '<h3>' + esc(r.name) + '</h3>' +
      (r.blurb ? '<p>' + esc(r.blurb) + '</p>' : '') +
      rows + btns +
    '</article>';
  }

  function section(title, note, list, live) {
    if (!list.length) return '';
    return '<div class="section-head" style="margin-bottom:26px">' +
             '<h2>' + esc(title) + '</h2><p>' + esc(note) + '</p>' +
           '</div>' +
           '<div class="grid cols-2" style="margin-bottom:56px">' +
             list.map(function (r, i) { return card(r, i, live); }).join('') +
           '</div>';
  }

  w.DWData.listPublic().then(function (rows) {
    rows = rows || [];
    if (!rows.length) return;

    var launched = rows.filter(function (r) { return r.is_live; });
    var working = rows.filter(function (r) { return !r.is_live && r.status !== 'archived'; });

    mount.innerHTML =
      section('In progress', 'Being built or rebuilt right now. Each one opens with the passphrase sent to that client.', working, false) +
      section('Launched', 'Built here, signed off, and now running as the client’s own site.', launched, true);

    if (fallback) fallback.remove();
  }).catch(function () { /* the markup already on the page stands */ });
})(window, document);
