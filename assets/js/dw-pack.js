/* dw-pack.js — builds a client pack ("what I need from you") from a project's
   jobs and its saved pack sections, as a print-ready A4 page. The console opens
   it in a new tab; the client gets it as a PDF (Save as PDF from the print
   dialog) attached to an email.

   What comes from the jobs:
   - key dates: every open job owned by someone other than you (and not Google),
     grouped by target date, plus the first milestone (go-live)
   - the checklist: those same jobs, split into "needed for launch" (above the
     first milestone) and "after launch", with anything already done ticked off
   - sections linked to a job drop out once that job is ticked

   Jobs can carry client_title and client_note, which is how they read here.
   Section bodies are HTML written by the owner only. */
(function () {
  'use strict';

  var MARK = '<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><rect x="0.75" y="0.75" width="30.5" height="30.5" fill="#1a1a1a" stroke="#7000ff" stroke-width="1.5"/><path d="M8 10.5 13 16l-5 5.5" fill="none" stroke="#7000ff" stroke-width="2.2" stroke-linecap="square"/><path d="M16 22h8" fill="none" stroke="#f4f2f8" stroke-width="2.2" stroke-linecap="square"/></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function day(s, long) {
    if (!s) return '';
    return new Date(s + 'T12:00:00').toLocaleDateString('en-GB', long ? { weekday:'long', day:'numeric', month:'long', year:'numeric' } : { weekday:'short', day:'numeric', month:'short' }).replace(',', '');
  }
  function two(n) { return ('0' + n).slice(-2); }

  var CSS = [
    ':root{--ink:#101012;--paper:#f4f2f8;--muted:#56525f;--line:rgba(16,16,26,.14);--acc:#6a00f0;--acc2:#a97cff;--dim:rgba(106,0,240,.08)}',
    '@page{size:A4;margin:18mm 17mm 20mm}@page :first{margin:0}',
    '*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    'body{margin:0;font:400 10.4pt/1.55 "IBM Plex Sans",Arial,sans-serif;color:var(--ink);background:#fff}',
    'h1,h2,h3{font-family:Archivo,Arial,sans-serif;letter-spacing:-.02em;margin:0}p{margin:0 0 8pt}ul{margin:0;padding:0;list-style:none}',
    '.cover{height:297mm;width:210mm;background:var(--ink);color:var(--paper);padding:22mm 20mm 18mm;display:flex;flex-direction:column;position:relative;overflow:hidden;page-break-after:always}',
    '.cover::before{content:"";position:absolute;right:-40mm;top:-30mm;width:150mm;height:150mm;border-radius:50%;background:radial-gradient(closest-side,rgba(112,0,255,.35),transparent)}',
    '.cover .dots{position:absolute;right:16mm;top:60mm;width:80mm;height:80mm;background-image:radial-gradient(rgba(169,124,255,.28) 1px,transparent 1.2px);background-size:5mm 5mm}',
    '.brand{display:flex;align-items:center;gap:10pt;font:700 17pt/1 Archivo,sans-serif;letter-spacing:-.03em;position:relative}.brand svg{width:26pt;height:26pt}.brand i{font-style:normal;color:var(--acc2)}',
    '.cover .kicker{margin-top:62mm;position:relative;font:500 9.5pt/1 "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--acc2)}',
    '.cover h1{position:relative;font-size:38pt;line-height:1.02;margin-top:8mm;max-width:150mm}',
    '.cover .lede{position:relative;margin-top:8mm;font-size:13pt;color:#cfcbd9;max-width:140mm}.cover .lede b{color:#fff;font-weight:500}',
    '.cover .meta{position:relative;display:flex;gap:12mm;margin-top:12mm;font-size:9.5pt;color:#a5a1b2}.cover .meta b{display:block;color:var(--paper);font-weight:500;font-size:10.5pt;margin-top:2pt}',
    '.cover .pv{position:relative;margin-top:auto;border:1px solid rgba(169,124,255,.45);background:rgba(112,0,255,.12);padding:7mm 8mm;display:grid;grid-template-columns:1.5fr 1fr;gap:6mm}',
    '.cover .pv span{display:block;font:500 8.5pt/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--acc2);margin-bottom:5pt}',
    '.cover .pv b{font:500 11pt/1.3 "IBM Plex Mono",monospace;color:#fff;overflow-wrap:anywhere}.cover .pv p{grid-column:1/-1;margin:0;color:#cfcbd9;font-size:9.5pt}',
    '.cover .ver{position:absolute;left:20mm;bottom:8mm;font:500 7.5pt/1 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:#6d6879}',
    '.sec{margin-top:10mm}.sec:first-child{margin-top:0}.pb{break-before:page}',
    '.num{display:block;font:500 8.8pt/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--acc);margin-bottom:6pt}',
    'h2{font-size:21pt;line-height:1.1;margin-bottom:8pt}h3{font-size:12pt;margin:12pt 0 5pt;break-after:avoid}',
    '.lead{font-size:11.2pt;color:#2a2833}.muted{color:var(--muted)}.note{font-size:9.3pt;color:var(--muted)}',
    '.box{border:1px solid var(--line);padding:5mm 6mm;margin:5mm 0;break-inside:avoid}.box.acc{border-color:rgba(106,0,240,.35);background:var(--dim)}',
    '.box.dark{background:var(--ink);color:var(--paper);border:0}.box.dark .num{color:var(--acc2)}.box h3{margin-top:0}',
    '.tl{display:grid;margin:5mm 0 2mm;break-inside:avoid}.tl div{border-top:3px solid var(--acc);padding:6pt 8pt 0 0}.tl div.ms{border-top-color:var(--ink)}',
    '.tl b{display:block;font:600 10pt/1.2 Archivo,sans-serif}.tl span{display:block;font:500 8pt/1.2 "IBM Plex Mono",monospace;color:var(--acc);letter-spacing:.06em;text-transform:uppercase;margin-bottom:4pt}',
    '.tl p{font-size:8.6pt;color:var(--muted);margin-top:3pt;line-height:1.4}',
    '.progress{display:flex;align-items:center;gap:10pt;margin:4mm 0;font:500 8.8pt/1 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}',
    '.progress i{flex:1;height:4pt;background:var(--line);position:relative}.progress i b{position:absolute;left:0;top:0;bottom:0;background:var(--acc)}',
    '.check li{position:relative;padding-left:20pt;margin:0 0 6pt;break-inside:avoid}.check li::before{content:"";position:absolute;left:0;top:2.5pt;width:10pt;height:10pt;border:1.3px solid var(--acc)}',
    '.check li b{font-weight:600}.check li small{display:block;color:var(--muted);font-size:9.2pt;margin-top:1pt}',
    '.check.two{columns:2;column-gap:8mm}.check.two li{margin-bottom:4pt}.check.two li small{font-size:8.8pt}',
    '.check li.done::before{background:var(--acc)}.check li.done::after{content:"";position:absolute;left:3.2pt;top:4.2pt;width:3pt;height:5.5pt;border:solid #fff;border-width:0 1.4pt 1.4pt 0;transform:rotate(45deg)}',
    '.check li.done b{color:var(--muted);text-decoration:line-through;text-decoration-color:rgba(86,82,95,.5)}',
    'table{width:100%;border-collapse:collapse;margin:4mm 0;font-size:9.8pt}',
    'th{font:500 8.3pt/1.2 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--acc);text-align:left;padding:0 6pt 6pt 0;border-bottom:1.5px solid var(--ink)}',
    'td{padding:5pt 6pt 5pt 0;border-bottom:1px solid var(--line);vertical-align:top}tr{break-inside:avoid}td.why{color:var(--muted);width:42%}',
    'td.by{white-space:nowrap;font:500 8.8pt/1.5 "IBM Plex Mono",monospace;color:var(--acc);width:20%}td.who{white-space:nowrap;color:var(--muted);width:18%}',
    'td small{display:block;color:var(--muted);font-size:9pt;margin-top:1pt}tr.new td:first-child b::after{content:"New";margin-left:6pt;font:500 7pt/1 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:var(--acc);padding:2pt 4pt;vertical-align:1pt}',
    '.fwd{border-left:3px solid var(--acc);background:#faf9fc;padding:4mm 6mm;font-size:10pt;break-inside:avoid;margin:4mm 0}.fwd p{margin:0 0 6pt}',
    '.course{display:grid;grid-template-columns:38mm 1fr;gap:5mm;border-top:1px solid var(--line);padding:2.4mm 0;break-inside:avoid}',
    '.course b{font:700 13pt/1.1 Archivo,sans-serif}.course span{display:block;font-size:9pt;color:var(--muted);margin-top:2pt}',
    '.hl{background:#fff1c9;padding:0 2pt}',
    '.comp td{font-size:9pt;padding-top:3.5pt;padding-bottom:3.5pt}.comp td:first-child{width:24%}.comp td b a{color:var(--ink);text-decoration:none}',
    '.comp .tag{display:inline-block;font:500 7.5pt/1 "IBM Plex Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--acc);background:var(--dim);padding:3pt 5pt;margin-top:3pt}',
    '.means{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin-top:3mm}.means div{border-top:3px solid var(--acc);padding-top:5pt;break-inside:avoid}',
    '.means b{display:block;font:600 11pt/1.2 Archivo,sans-serif;margin-bottom:4pt}.means p{font-size:9.3pt;color:#2a2833;margin:0}',
    '.sign{margin-top:10mm;display:flex;align-items:center;gap:12pt;break-inside:avoid}.sign svg{width:30pt;height:30pt}.sign b{font:700 13pt/1.2 Archivo,sans-serif}',
    /* screen only: toolbar and a page-like preview */
    '@media screen{body{background:#2a2830;padding:64px 0 40px}.cover,.inner{margin:0 auto 24px;box-shadow:0 10px 40px rgba(0,0,0,.4)}.inner{width:210mm;background:#fff;padding:18mm 17mm 20mm}',
    '.tb{position:fixed;top:0;left:0;right:0;z-index:9;display:flex;gap:10px;align-items:center;padding:10px 16px;background:#101012;border-bottom:1px solid #2c2a33;font:500 11px/1 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:#a5a1b2}',
    '.tb b{color:#f4f2f8;font-weight:500}.tb span{flex:1}.tb button{font:inherit;letter-spacing:inherit;text-transform:inherit;padding:9px 13px;border:1px solid #3a3742;background:transparent;color:#f4f2f8;cursor:pointer}',
    '.tb button.go{background:#6a00f0;border-color:#6a00f0}.tb button:hover{border-color:#a97cff}.tb .ok{color:#4fd08a}}',
    '@media print{.tb{display:none}}',
    '@media screen and (max-width:900px){.cover,.inner{transform-origin:top left}}'
  ].join('\n');

  function isClientJob(t) { return t.owner && t.owner !== 'me' && t.owner !== 'google'; }

  /* p: project row; tasks: its jobs; pack: saved pack; secret: {passphrase}; opts: {origin, today} */
  function build(p, tasks, pack, secret, opts) {
    opts = opts || {};
    pack = pack || {};
    var t0 = opts.today || iso(new Date());
    var list = (tasks || []).slice().sort(function (a, b) { return a.sort_order - b.sort_order; });
    var ms = list.filter(function (t) { return t.milestone; })[0];
    var owners = pack.owners || {};
    var who = function (o) { return owners[o] || (o === 'client' ? 'You' : o.charAt(0).toUpperCase() + o.slice(1)); };
    var title = function (t) { return t.client_title || t.title; };
    var note = function (t) { return t.client_note != null && t.client_note !== '' ? t.client_note : (t.details || ''); };
    var client = list.filter(isClientJob);
    var open = client.filter(function (t) { return !t.done; });
    var done = client.filter(function (t) { return t.done; });
    var pre = function (t) { return !ms || t.sort_order < ms.sort_order; };
    var golive = (ms && ms.due_on) || p.go_live_on;
    var origin = opts.origin || 'https://dunnworks.io';
    var name = p.name || '';
    var docTitle = pack.title || 'What I need from you';
    var sections = (pack.sections || []).filter(function (s) {
      if (!s.task) return true;
      var t = list.filter(function (x) { return x.id === s.task; })[0];
      return !t || !t.done;
    });
    var main = sections.filter(function (s) { return !s.appendix; });
    var apx = sections.filter(function (s) { return s.appendix; });

    /* key dates: open client jobs by date, plus go-live */
    var byDate = {};
    open.forEach(function (t) { if (t.due_on) (byDate[t.due_on] = byDate[t.due_on] || []).push(t); });
    var dates = Object.keys(byDate).map(function (d) { return { d: d, jobs: byDate[d] }; });
    if (ms && golive) dates.push({ d: golive, ms: true });
    dates.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : (a.ms ? -1 : 1); });
    dates = dates.slice(0, 5);
    var tl = dates.length ? '<div class="tl" style="grid-template-columns:repeat(' + dates.length + ',1fr)">' + dates.map(function (x) {
      if (x.ms) return '<div class="ms"><span>' + esc(day(x.d)) + '</span><b>Go live</b><p>' + esc(pack.golive_note || 'Your new website goes live') + '</p></div>';
      var owns = x.jobs.map(function (t) { return t.owner; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
      var head = owns.length === 1 ? 'From ' + who(owns[0]).replace(/^You$/, 'you').replace(/^Your /, 'your ') : x.jobs.length + ' things';
      return '<div><span>' + esc(day(x.d)) + '</span><b>' + esc(head) + '</b><p>' + x.jobs.map(function (t) { return esc(title(t)); }).join('<br>') + '</p></div>';
    }).join('') + '</div>' : '';

    var pct = client.length ? Math.round(done.length / client.length * 100) : 0;
    var rows = function (arr) {
      return arr.map(function (t) {
        var late = t.due_on && t.due_on < t0;
        var fresh = opts.since && t.created_at && t.created_at.slice(0, 10) > opts.since;
        return '<tr' + (fresh ? ' class="new"' : '') + '><td><b>' + esc(title(t)) + '</b>' + (note(t) ? '<small>' + esc(note(t)) + '</small>' : '') + '</td>' +
          '<td class="who">' + esc(who(t.owner)) + '</td><td class="by">' + (t.due_on ? (late ? 'As soon as you can' : 'By ' + esc(day(t.due_on))) : 'When you can') + '</td></tr>';
      }).join('');
    };
    var head = '<thead><tr><th>What</th><th>Who</th><th>When</th></tr></thead>';
    var openPre = open.filter(pre), openPost = open.filter(function (t) { return !pre(t); });

    var n = 0;
    var num = function () { return two(n++); };
    var out = '';

    /* start here */
    out += '<div class="sec"><span class="num">' + num() + ' — Start here</span><h2>' + esc(pack.start_title || 'The short version') + '</h2>' +
      (pack.intro || '') +
      (client.length ? '<div class="progress"><span>' + done.length + ' of ' + client.length + ' done</span><i><b style="width:' + pct + '%"></b></i></div>' : '') +
      (tl ? '<h3>Key dates</h3>' + tl : '') + '</div>';

    /* checklist, from the jobs */
    if (client.length) {
      out += '<div class="sec pb"><span class="num">' + num() + ' — Checklist</span><h2>' + esc(pack.list_title || 'Everything in one list') + '</h2>' +
        '<p class="lead">' + esc(pack.list_lead || 'Each of these is explained in more detail over the page. Tick them off as you go; every time I update this pack, anything done moves to the bottom.') + '</p>' +
        (openPre.length ? '<h3>' + esc(ms ? 'Needed before ' + (golive ? day(golive) : 'launch') : 'Still needed') + '</h3><table>' + head + '<tbody>' + rows(openPre) + '</tbody></table>' : '') +
        (openPost.length ? '<h3>' + (ms ? 'Can follow after launch' : 'Later') + '</h3>' +
          (pack.post_note ? '<p class="note">' + esc(pack.post_note) + '</p>' : '') + '<table>' + head + '<tbody>' + rows(openPost) + '</tbody></table>' : '') +
        (done.length ? '<h3>Already done, thank you</h3><ul class="check two">' + done.map(function (t) {
          return '<li class="done"><b>' + esc(title(t)) + '</b></li>'; }).join('') + '</ul>' : '') +
        '</div>';
    }

    /* the sections */
    main.forEach(function (s) {
      out += '<div class="sec' + (s.nobreak ? '' : ' pb') + '"><span class="num">' + num() + (s.kicker ? ' — ' + esc(s.kicker) : '') + '</span>' +
        (s.title ? '<h2>' + esc(s.title) + '</h2>' : '') + (s.html || '') + '</div>';
    });

    /* sign-off */
    out += '<div class="sec" style="margin-top:10mm;break-inside:avoid"><div class="box dark"><span class="num">Send everything to</span><p style="margin:0;font-size:11.5pt">' +
      esc(pack.contact || 'info@dunnworks.io · WhatsApp or call 07377 599 023') + '</p></div>' +
      '<div class="sign">' + MARK + '<div><b>' + esc((pack.from || 'Tony, Dunnworks').split(',')[0]) + '</b><br><span class="muted">Dunnworks · dunnworks.io</span></div></div></div>';

    apx.forEach(function (s) {
      out += '<div class="sec pb"><span class="num">Appendix' + (s.kicker ? ' — ' + esc(s.kicker) : '') + '</span>' +
        (s.title ? '<h2>' + esc(s.title) + '</h2>' : '') + (s.html || '') + '</div>';
    });

    var pv = p.has_preview && secret && secret.passphrase ?
      '<div class="pv"><div><span>Your preview</span><b>' + esc(origin.replace(/^https?:\/\//, '') + '/preview/' + p.slug) + '</b></div>' +
      '<div><span>Passphrase</span><b>' + esc(secret.passphrase) + '</b></div>' +
      '<p>' + esc(pack.preview_note || 'Have a look before you start. Every page works, and anything highlighted in yellow is a detail I need from you.') + '</p></div>' : '';
    var lede = pack.lede || ('Everything needed to get your new website live' + (golive ? ' on <b>' + esc(day(golive, true).replace(/ \d{4}$/, '')) + '</b>' : '') + ', in one place.');
    var cover = '<section class="cover"><div class="dots"></div>' +
      '<div class="brand">' + MARK + '<span>Dunn<i>works</i></span></div>' +
      '<div class="kicker">' + esc(name) + ' · ' + esc(pack.kicker || 'Website launch') + '</div>' +
      '<h1>' + esc(docTitle) + '</h1><p class="lede">' + lede + '</p>' +
      '<div class="meta"><div>Prepared for<b>' + esc(pack.for || p.contact_name || name) + '</b></div><div>From<b>' + esc(pack.from || 'Tony, Dunnworks') + '</b></div><div>Updated<b>' + esc(day(t0, true).replace(/^\w+ /, '')) + '</b></div></div>' +
      pv + '<div class="ver">' + open.length + ' still to do · ' + done.length + ' done</div></section>';

    var file = (name + ' ' + docTitle + ' ' + t0).replace(/[^\w\d]+/g, '-').replace(/^-|-$/g, '');
    return {
      file: file,
      open: open.length, done: done.length,
      html: '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>' + esc(file) + '</title><meta name="robots" content="noindex">' +
        '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
        '<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">' +
        '<style>' + CSS + '</style></head><body>' +
        '<div class="tb"><b>' + esc(name) + '</b>&nbsp;· client pack<span></span><em data-msg style="font-style:normal"></em>' +
        '<button type="button" data-act="pdf" class="go">Download PDF</button>' +
        (p.contact_email ? '<button type="button" data-act="email">Email ' + esc((pack.for || p.contact_name || 'client').split(/[ ,]/)[0]) + '</button>' : '') +
        '</div>' + cover + '<div class="inner">' + out + '</div>' +
        '<script>(function(){var PID=' + JSON.stringify(String(p.id)) + ';' +
        'function say(t,ok){var m=document.querySelector("[data-msg]");if(m){m.textContent=t;m.className=ok?"ok":"";}}' +
        'document.addEventListener("click",function(e){var b=e.target.closest("[data-act]");if(!b)return;var a=b.getAttribute("data-act");' +
        'if(a==="pdf"){say("In the print window, choose Save as PDF");Promise.race([document.fonts?document.fonts.ready:0,new Promise(function(r){setTimeout(r,2500)})]).then(function(){window.print();});}' +
        'if(a==="email"){if(window.opener&&window.opener.DWPackEmail){window.opener.DWPackEmail(PID,say,function(href){var l=document.createElement("a");l.href=href;document.body.appendChild(l);l.click();l.remove();});}' +
        'else say("Open this pack from the console to email it");}});})();<\/script></body></html>'
    };
  }

  /* the email that goes with the PDF */
  function email(p, pack, built, lastSent) {
    var first = (pack.for || p.contact_name || '').split(/[ ,]/)[0] || 'there';
    var subj = p.name + ': ' + (pack.title || 'What I need from you') + ' (updated ' + new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long' }) + ')';
    var body = 'Hi ' + first + ',\n\n' +
      (lastSent ? 'Here\'s the updated pack for the new website. ' : 'Here\'s everything I need from you for the new website, in one pack. ') +
      'It\'s attached as a PDF.\n\n' +
      (built.done ? built.done + ' done so far, thank you. ' : '') +
      (built.open ? built.open + ' still to do, and the checklist near the front shows what\'s needed first.' : 'Everything is done.') +
      '\n\nAny questions, just give me a call.\n\nTony\nDunnworks · dunnworks.io';
    return 'mailto:' + encodeURIComponent(p.contact_email || '') + '?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body);
  }

  window.DWPack = { build: build, email: email, isClientJob: isClientJob };
})();
