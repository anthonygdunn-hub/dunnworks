/* Dunnworks site counter. No cookies, no storage, nothing personal: one row per page, per referring
   site, per day, plus a count of taps on phone, email, WhatsApp, directions and social links and of
   form sends. Add to any site Dunnworks looks after:
     <script defer src="https://dunnworks.io/t.js" data-site="SLUG"></script>
   Read back in the console under Workspace → Dashboards. */
(function () {
  'use strict';
  var me = document.currentScript, site = me && me.getAttribute('data-site');
  if (!site || navigator.webdriver || /^(localhost|127\.|192\.168\.)/.test(location.hostname) || location.protocol === 'file:') return;
  var U = 'https://acdpgarasgfhvupzsbxf.supabase.co/rest/v1/rpc/', K = 'sb_publishable_OWTVpDyadL1lITnCp4gfAQ_EZxVHldY';
  function send(fn, body) {
    try { fetch(U + fn, { method: 'POST', keepalive: true, headers: { apikey: K, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch (e) {}
  }
  function path() { return location.pathname || '/'; }
  function event(kind, label) { send('dw_site_event', { p_site: site, p_kind: kind, p_label: String(label || '').slice(0, 80), p_path: path() }); }
  var ref = '';
  try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
  send('dw_site_hit', { p_site: site, p_path: path(), p_ref: ref });

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]'); if (!a) return;
    var h = a.getAttribute('href') || '', host = '';
    try { host = new URL(a.href).hostname.replace(/^www\./, ''); } catch (x) {}
    if (/^tel:/i.test(h)) event('call', h.slice(4).replace(/\s+/g, ''));
    else if (/^mailto:/i.test(h)) event('email', h.slice(7).split('?')[0]);
    else if (/(^|\.)wa\.me$|whatsapp\.com$/.test(host)) event('whatsapp', 'WhatsApp');
    else if (/^maps\.|google\.[a-z.]+$/.test(host) && /maps/.test(a.href) || /maps\.apple\.com|goo\.gl$/.test(host)) event('directions', 'Directions');
    else if (/(facebook|instagram|tiktok|linkedin|twitter|x|youtube)\.com$/.test(host)) event('social', host);
  }, true);

  document.addEventListener('submit', function (e) {
    var f = e.target; if (!f || f.tagName !== 'FORM') return;
    var name = f.getAttribute('data-track') || f.getAttribute('name') || f.id || f.getAttribute('aria-label') || 'Form';
    event(/book/i.test(name + ' ' + (f.getAttribute('action') || '')) ? 'booking' : 'form', name);
  }, true);

  // for forms or bookings sent by script: window.dwTrack('booking', 'Club collection')
  window.dwTrack = event;
})();
