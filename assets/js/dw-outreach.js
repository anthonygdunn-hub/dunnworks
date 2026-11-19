/* Dunnworks console: Outreach (#/outreach).
 * Woolmer leads (dw_projects with wb_place_id) and the drafts the weekly lead agent writes (dw_outreach).
 * Nothing is sent until Anthony presses "Approve & send" here; the edge function dw-outreach re-checks
 * every rule server-side (owner login, cleared for email, not opted out, valid address).
 */
(function (w) {
  'use strict';
  var root = null, say = function () {};
  var S = { tab: 'approve', leads: [], drafts: [], sent: [], key: null, q: '' };
  var KIND = { email: 'Email', followup: 'Follow-up email', walkin: 'Walk-in', call: 'Phone call' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function ago(iso) { if (!iso) return ''; var m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' hr ago' : Math.round(m / 1440) + ' days ago'; }
  function byId(id) { for (var i = 0; i < S.leads.length; i++) if (S.leads[i].id === id) return S.leads[i]; return {}; }
  function hot(l) { return l.last_viewed_at && Date.now() - Date.parse(l.last_viewed_at) < 7 * 864e5; }

  function load() {
    return Promise.all([
      DWData.rest('dw_projects?select=id,name,sector,address,contact_phone,contact_email,stage,can_email,opted_out,company_type,company_number,lead_score,mockup_url,website_check,checked_on,views,last_viewed_at,last_contact_on,next_action,next_action_on,outreach_notes&wb_place_id=not.is.null&order=name.asc'),
      DWData.rest('dw_outreach?select=*&status=in.(draft,approved,failed)&order=created_at.asc'),
      DWData.rest('dw_outreach?select=*&status=eq.sent&order=sent_at.desc&limit=40'),
      DWData.fn('dw-outreach', { action: 'status' }).catch(function () { return { key: false }; })
    ]).then(function (r) { S.leads = r[0] || []; S.drafts = r[1] || []; S.sent = r[2] || []; S.key = r[3]; });
  }

  function stats() {
    var l = S.leads, email = l.filter(function (x) { return x.can_email && !x.opted_out; }).length;
    var week = S.sent.filter(function (m) { return Date.now() - Date.parse(m.sent_at) < 7 * 864e5; }).length;
    var views = l.reduce(function (a, x) { return a + (x.views || 0); }, 0);
    var warm = l.filter(function (x) { return ['replied', 'meeting', 'quoted'].indexOf(x.stage) !== -1; }).length;
    var won = l.filter(function (x) { return x.stage === 'won'; }).length;
    return '<div class="stats">' + [['Leads', l.length], ['To approve', S.drafts.length], ['Hot now', l.filter(hot).length],
      ['Can email', email], ['Contacted this week', week], ['Mock-up views', views], ['Talking', warm], ['Won', won]]
      .map(function (s) { return '<div class="stat"><b>' + s[1] + '</b><span>' + s[0] + '</span></div>'; }).join('') + '</div>';
  }

  function setup() {
    if (S.key && S.key.key) return '';
    return '<div class="c" style="border-color:var(--accent);margin-bottom:18px"><div class="c-top"><h3>Set up Dunnworks email</h3><span class="flag warn">needed for emails</span></div>' +
      '<p class="det">Emails go from <b>hello@dunnworks.io</b>. In Resend, add dunnworks.io as a domain, add the DNS records it shows, then create a <b>sending-only</b> API key for dunnworks.io and paste it here. ' +
      'Until then you can still approve walk-ins and calls.</p>' +
      '<form id="ok-key" class="row"><input type="password" name="k" placeholder="re_..." autocomplete="new-password" data-1p-ignore data-lpignore="true" style="flex:1 1 260px;padding:9px 12px;border:1px solid var(--line-2);border-radius:var(--radius);background:var(--ink);color:var(--paper);font:inherit">' +
      '<button class="mini go" type="submit">Save key</button></form></div>';
  }

  function draftCard(m) {
    var l = byId(m.project_id), isMail = m.kind === 'email' || m.kind === 'followup';
    var block = isMail && (!l.can_email || l.opted_out) ? (l.opted_out ? 'They opted out' : 'Not cleared for email') : (isMail && !(S.key && S.key.key) ? 'Email not set up yet' : '');
    var tel = (l.contact_phone || '').split('/')[0].replace(/\s/g, '');
    return '<div class="c' + (hot(l) ? ' is-due' : '') + '" data-m="' + m.id + '">' +
      '<div class="c-top"><h3>' + esc(l.name || 'Lead') + '</h3><span class="row">' +
        '<span class="flag' + (isMail ? ' live' : '') + '">' + esc(KIND[m.kind] || m.kind) + '</span>' +
        (hot(l) ? '<span class="flag warn">opened mock-up ' + esc(ago(l.last_viewed_at)) + '</span>' : '') +
        (m.status === 'failed' ? '<span class="flag warn">failed: ' + esc((m.error || '').slice(0, 80)) + '</span>' : '') +
      '</span></div>' +
      '<p class="det">' + esc(l.sector || '') + (l.address ? ' · ' + esc(l.address) : '') +
        (l.contact_phone ? ' · <a href="tel:' + esc(tel) + '">' + esc(l.contact_phone) + '</a>' : '') +
        (l.company_type ? ' · ' + esc(l.company_type) + (l.company_number ? ' ' + esc(l.company_number) : '') : '') +
        (l.mockup_url ? ' · <a href="' + esc(l.mockup_url) + '" target="_blank" rel="noopener">mock-up</a>' : '') + '</p>' +
      (m.why ? '<p class="det" style="margin-top:-4px"><b>Why:</b> ' + esc(m.why) + '</p>' : '') +
      '<div class="edit" style="margin-top:6px">' +
        (isMail ? '<div class="wide"><label>To</label><input value="' + esc(m.to_email || l.contact_email || '') + '" disabled></div>' +
                  '<div class="wide"><label>Subject</label><input data-f="subject" value="' + esc(m.subject || '') + '"></div>' : '') +
        '<div class="wide"><label>' + (isMail ? 'Message (your signature, the woolmer line and the opt-out link are added automatically)' : 'What to say') + '</label>' +
        '<textarea data-f="body" style="min-height:' + (isMail ? 190 : 120) + 'px">' + esc(m.body || '') + '</textarea></div>' +
        '<div class="wide row">' +
          (isMail ? '<button class="mini go" data-act="send"' + (block ? ' disabled title="' + esc(block) + '"' : '') + '>Approve &amp; send</button>' + (block ? '<span class="tagline">' + esc(block) + '</span>' : '')
                  : '<button class="mini go" data-act="send">Done it</button>') +
          '<button class="mini" data-act="save">Save edits</button>' +
          '<button class="mini bad" data-act="reject">Reject</button>' +
          '<span class="saved" data-saved></span>' +
        '</div></div></div>';
  }

  function leadRow(l) {
    var tel = (l.contact_phone || '').split('/')[0].replace(/\s/g, '');
    return '<div class="c' + (hot(l) ? ' is-due' : '') + (l.stage === 'lost' || l.opted_out ? ' is-cold' : '') + '" data-l="' + l.id + '">' +
      '<div class="c-top"><h3>' + esc(l.name) + '</h3><span class="row">' +
        (l.lead_score != null ? '<span class="score ' + (l.lead_score >= 70 ? 's-hot' : l.lead_score >= 45 ? 's-warm' : 's-cool') + '">' + l.lead_score + '</span>' : '') +
        '<select data-stage>' + ['not-contacted','emailed','called','replied','meeting','quoted','won','lost','parked'].map(function (s) {
          return '<option' + (s === l.stage ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '</span></div>' +
      '<p class="det">' + esc(l.sector || '') + (l.address ? ' · ' + esc(l.address) : '') +
        (l.contact_phone ? ' · <a href="tel:' + esc(tel) + '">' + esc(l.contact_phone) + '</a>' : '') +
        (l.mockup_url ? ' · <a href="' + esc(l.mockup_url) + '" target="_blank" rel="noopener">mock-up</a>' : '') + '</p>' +
      '<p class="tagline">' + [l.opted_out ? 'opted out' : (l.can_email ? 'can email' : 'visit / call only'),
        l.company_type || 'company not checked', l.website_check || '', l.views ? l.views + ' mock-up view' + (l.views === 1 ? '' : 's') : '',
        l.last_contact_on ? 'last contact ' + l.last_contact_on : '', l.next_action ? 'next: ' + l.next_action + (l.next_action_on ? ' (' + l.next_action_on + ')' : '') : '']
        .filter(Boolean).map(esc).join(' · ') + '</p></div>';
  }

  function render() {
    var tabs = [['approve', 'To approve (' + S.drafts.length + ')'], ['hot', 'Hot leads'], ['leads', 'All leads'], ['sent', 'Sent']];
    var body = '';
    if (S.tab === 'approve') body = S.drafts.length ? S.drafts.map(draftCard).join('') : '<p class="det">Nothing waiting. The lead agent writes new drafts every Monday morning.</p>';
    if (S.tab === 'hot') { var h = S.leads.filter(hot).sort(function (a, b) { return Date.parse(b.last_viewed_at) - Date.parse(a.last_viewed_at); });
      body = h.length ? h.map(leadRow).join('') : '<p class="det">Nobody has opened a mock-up in the last 7 days. You get an email the moment someone does.</p>'; }
    if (S.tab === 'leads') { var q = S.q.toLowerCase(); var ls = S.leads.filter(function (l) { return !q || [l.name, l.sector, l.address, l.stage].join(' ').toLowerCase().indexOf(q) !== -1; })
      .sort(function (a, b) { return (b.lead_score || 0) - (a.lead_score || 0) || a.name.localeCompare(b.name); });
      body = '<div class="bar"><input type="search" id="ol-q" placeholder="Search leads" value="' + esc(S.q) + '"><span class="tagline">' + ls.length + ' of ' + S.leads.length + '</span></div>' + ls.map(leadRow).join(''); }
    if (S.tab === 'sent') body = S.sent.length ? S.sent.map(function (m) { var l = byId(m.project_id);
      return '<div class="c"><div class="c-top"><h3>' + esc(l.name || '') + '</h3><span class="tagline">' + esc(KIND[m.kind] || m.kind) + ' · ' + esc(ago(m.sent_at)) + '</span></div>' +
        (m.subject ? '<p class="det"><b>' + esc(m.subject) + '</b>' + (m.to_email ? ' to ' + esc(m.to_email) : '') + '</p>' : '') +
        '<p class="det" style="white-space:pre-wrap">' + esc((m.body || '').slice(0, 400)) + ((m.body || '').length > 400 ? '…' : '') + '</p></div>'; }).join('') : '<p class="det">Nothing sent yet.</p>';
    root.innerHTML = setup() + stats() +
      '<div class="bar">' + tabs.map(function (t) { return '<button class="chip' + (S.tab === t[0] ? ' is-on' : '') + '" data-tab="' + t[0] + '">' + esc(t[1]) + '</button>'; }).join('') + '</div>' +
      '<div class="cards">' + body + '</div>';
  }

  function reload(msg) { return load().then(function () { render(); if (msg) say(msg, 'ok'); }).catch(function (e) { say('Could not load outreach: ' + e.message, 'bad'); }); }

  function bind() {
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tab]');
      if (t) { S.tab = t.getAttribute('data-tab'); render(); return; }
      var b = e.target.closest('[data-act]'); if (!b) return;
      var card = b.closest('[data-m]'), id = +card.getAttribute('data-m'), act = b.getAttribute('data-act');
      var subj = card.querySelector('[data-f=subject]'), txt = card.querySelector('[data-f=body]'), saved = card.querySelector('[data-saved]');
      var edits = { body: txt.value }; if (subj) edits.subject = subj.value;
      b.disabled = true;
      if (act === 'save') {
        DWData.rest('dw_outreach?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: edits })
          .then(function () { saved.textContent = 'saved'; b.disabled = false; }).catch(function (er) { say(er.message, 'bad'); b.disabled = false; });
      } else if (act === 'reject') {
        DWData.rest('dw_outreach?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { status: 'rejected' } })
          .then(function () { return reload('Rejected.'); }).catch(function (er) { say(er.message, 'bad'); b.disabled = false; });
      } else if (act === 'send') {
        var m = S.drafts.filter(function (x) { return x.id === id; })[0] || {};
        var isMail = m.kind === 'email' || m.kind === 'followup';
        if (isMail && !confirm('Send this email to ' + (m.to_email || byId(m.project_id).contact_email) + ' now?')) { b.disabled = false; return; }
        DWData.rest('dw_outreach?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: Object.assign({ status: 'approved' }, edits) })
          .then(function () { return DWData.fn('dw-outreach', Object.assign({ action: 'send', id: id }, edits)); })
          .then(function () { return reload(isMail ? 'Sent.' : 'Recorded. Follow-up set for a week today.'); })
          .catch(function (er) { say(er.message, 'bad'); reload(); });
      }
    });
    root.addEventListener('change', function (e) {
      var s = e.target.closest('[data-stage]'); if (!s) return;
      var id = s.closest('[data-l]').getAttribute('data-l');
      DWData.rest('dw_projects?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { stage: s.value } })
        .then(function () { byId(id).stage = s.value; say('Stage saved.', 'ok'); }).catch(function (er) { say(er.message, 'bad'); });
    });
    root.addEventListener('input', function (e) { if (e.target.id === 'ol-q') { S.q = e.target.value; var p = e.target.selectionStart; render(); var i = root.querySelector('#ol-q'); i.focus(); i.setSelectionRange(p, p); } });
    root.addEventListener('submit', function (e) {
      if (e.target.id !== 'ok-key') return; e.preventDefault();
      var k = e.target.k.value.trim();
      DWData.rest('rpc/dw_set_resend_key', { method: 'POST', body: { p_key: k } })
        .then(function () { e.target.reset(); return reload('Dunnworks email key saved.'); }).catch(function (er) { say(er.message, 'bad'); });
    });
  }

  w.DWOutreach = {
    view: function (el, sayFn) {
      say = sayFn || say; el.innerHTML = '';
      root = document.createElement('div'); root.className = 'dw-outreach'; el.appendChild(root);
      root.innerHTML = '<p class="det">Loading outreach…</p>';
      bind(); reload();
    },
    count: function () { return S.drafts.length; }
  };
})(window);
