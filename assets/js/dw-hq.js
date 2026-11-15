/* Dunnworks console: Workspace (#/hq), a Macro-style hub over everything in the console.
 *
 *   #/hq            Home: what's due, what's coming, and an activity feed grouped by recency
 *   #/hq/board      Every job across every project as a drag and drop board
 *   #/hq/projects   Own products and clients, each with jobs, docs, contacts, email and an AI summary
 *   #/hq/pipeline   Clients and prospects by stage, drag to move
 *   #/hq/docs       Plans, briefs and notes, linked to projects, with [[Project]] links
 *   #/hq/calendar   Launches, chases, due jobs and events on one month view
 *   #/hq/inbox      info@dunnworks.io, matched to projects (Gmail)
 *   #/hq/repos      GitHub repos with last commit and Pages status
 *   #/hq/assistant  Ask, draft, summarise or break work into jobs, grounded in the console's data
 *   #/hq/people     Collaborators and what they can see
 *   Ctrl/Cmd + K    Search everything
 *
 * Tables: dw_projects, dw_project_tasks, dw_task_notes, dw_docs, dw_contacts, dw_events, dw_inbox,
 * dw_activity, dw_members. Edge function: dw-hq. Collaborators see only what RLS gives them.
 */
(function (w) {
  'use strict';

  var D = null, root = null, say = function () {}, ME = { owner: true, email: '', member: null };
  var S = { boardProject: '', boardOwner: '', boardQ: '', pipeQ: '', pipeHide: true, showProspects: false,
            docQ: '', docProject: '', doc: null, month: null, openTask: null, aiProject: '', aiMode: 'ask', aiOut: null };
  var STAGES = ['not-contacted','emailed','called','replied','meeting','quoted','won','lost','parked'];
  var STAGE_NAME = { 'not-contacted':'Not contacted', emailed:'Emailed', called:'Called', replied:'Replied', meeting:'Meeting',
                     quoted:'Quoted', won:'Won', lost:'Lost', parked:'Parked' };
  var COLS = [['todo','To do'],['doing','Doing'],['waiting','Waiting'],['done','Done']];
  var GROUP = { own:'My products', client:'Clients', prospect:'Prospects' };

  /* ------------------------------------------------------------ helpers */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function today() { return ymd(new Date()); }
  function addDays(s, n) { var d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
  function nice(s) { return s ? new Date(s + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }) : ''; }
  function ago(iso) {
    if (!iso) return '';
    var m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60); if (h < 24) return h + 'h ago';
    var d = Math.round(h / 24); if (d < 14) return d + 'd ago';
    return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short' });
  }
  function money(n, zero) { return n ? '£' + Number(n).toLocaleString('en-GB', { maximumFractionDigits:0 }) : (zero ? '£0' : ''); }
  function rest(p, o) { return DWData.rest(p, o); }
  function post(table, body) { return rest(table, { method:'POST', body:body, headers:{ Prefer:'return=representation' } }).then(function (r) { return r[0]; }); }
  function patch(table, id, body) { return rest(table + '?id=eq.' + encodeURIComponent(id), { method:'PATCH', body:body, headers:{ Prefer:'return=representation' } }).then(function (r) { return r && r[0]; }); }
  function del(table, id) { return rest(table + '?id=eq.' + encodeURIComponent(id), { method:'DELETE' }); }
  function fn(body) { return DWData.fn('dw-hq', body); }
  function proj(id) { return D.byId[id] || null; }
  function pname(id) { var p = proj(id); return p ? p.name : 'General'; }
  function who(owner) {
    if (!owner || owner === 'me') return 'Tony';
    if (owner === 'client') return 'Client';
    return owner.charAt(0).toUpperCase() + owner.slice(1);
  }
  function actor(a) {
    if (!a) return 'Someone';
    if (a === 'info@dunnworks.io' || a === 'me') return 'You';
    if (a === 'client') return 'Client';
    if (a === 'system') return 'Console';
    var m = D.members.filter(function (x) { return x.email === a; })[0];
    return m ? m.name : a.split('@')[0];
  }
  function col(t) { return t.done ? 'done' : (t.hq_state || (t.waits ? 'waiting' : 'todo')); }
  function err(e) { say(e && e.message ? e.message : String(e), 'bad'); }
  function go(tab, extra) { location.hash = '#/hq' + (tab ? '/' + tab : '') + (extra ? '/' + extra : ''); }
  function visibleProjects() { return D.projects.filter(function (p) { return p.hq_group !== 'prospect' || S.showProspects; }); }
  function projectOptions(sel, withBlank, blankLabel) {
    var list = D.projects.filter(function (p) { return p.hq_group !== 'prospect' || p.id === sel; })
      .sort(function (a, b) { return (a.hq_group || '').localeCompare(b.hq_group || '') || a.name.localeCompare(b.name); });
    return (withBlank ? '<option value="">' + esc(blankLabel || 'General') + '</option>' : '') + list.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
  }

  /* tiny markdown: headings, lists, bold, italics, code, links and [[Project]] links */
  function md(src) {
    var lines = String(src || '').split('\n'), out = [], list = null;
    function inline(s) {
      s = esc(s);
      s = s.replace(/\[\[([^\]]+)\]\]/g, function (m, name) {
        var p = D.projects.filter(function (x) { return x.name.toLowerCase() === name.toLowerCase() || x.slug === name.toLowerCase(); })[0];
        return p ? '<a href="#/hq/projects/' + p.slug + '" class="hq-ref">' + esc(p.name) + '</a>' : '<span class="hq-ref is-missing">' + name + '</span>';
      });
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');
      s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return s;
    }
    function close() { if (list) { out.push('</' + list + '>'); list = null; } }
    lines.forEach(function (l) {
      var m;
      if ((m = l.match(/^(#{1,3})\s+(.*)/))) { close(); out.push('<h' + (m[1].length + 2) + '>' + inline(m[2]) + '</h' + (m[1].length + 2) + '>'); }
      else if ((m = l.match(/^\s*[-*]\s+\[( |x)\]\s+(.*)/i))) { if (list !== 'ul') { close(); out.push('<ul class="hq-check">'); list = 'ul'; } out.push('<li class="' + (m[1].trim() ? 'is-done' : '') + '">' + inline(m[2]) + '</li>'); }
      else if ((m = l.match(/^\s*[-*]\s+(.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + inline(m[1]) + '</li>'); }
      else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + inline(m[1]) + '</li>'); }
      else if (!l.trim()) { close(); }
      else { close(); out.push('<p>' + inline(l) + '</p>'); }
    });
    close();
    return out.join('');
  }

  /* -------------------------------------------------------------- styles */
  function css() {
    if (document.getElementById('hq-css')) return;
    var s = document.createElement('style'); s.id = 'hq-css';
    s.textContent = [
      'body.hq-on #main{max-width:none;padding-inline:clamp(14px,2.2vw,32px)}',
      'body.hq-on .hd{margin-bottom:16px;padding-bottom:12px}body.hq-on .hd h1{font-size:22px}body.hq-on .hd .sub{display:none}',
      '.hq,.hq *{box-sizing:border-box}',
      '.hq{display:grid;grid-template-columns:168px minmax(0,1fr);gap:22px;align-items:start}',
      '.hq-main select,.hq-main input,.hq-main textarea{max-width:100%}',
      '.hq-drawer-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:80}',
      '.hq-drawer{position:fixed;top:0;right:0;bottom:0;width:min(480px,100vw);background:var(--ink);border-left:1px solid var(--line-2);z-index:81;overflow-y:auto;padding:20px 22px 40px;box-shadow:-20px 0 60px rgba(0,0,0,.35)}',
      '.hq-drawer h3{font-family:var(--font-display);font-size:20px;margin:6px 0 12px;overflow-wrap:anywhere}',
      '.hq-drawer label{display:block;font-family:var(--font-mono);font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted-2);margin:12px 0 5px}',
      '.hq-drawer select,.hq-drawer input,.hq-drawer textarea{width:100%;padding:9px 10px;border:1px solid var(--line-2);border-radius:var(--radius);background:var(--ink-2);color:var(--paper);font:inherit;font-size:14px}',
      '.hq-drawer textarea{min-height:110px;resize:vertical}',
      '.hq-drawer .hq-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
      '.hq-drawer .hq-notes{margin-top:8px}',
      '.hq-more{all:unset;cursor:pointer;font-family:var(--font-mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-2);padding:8px;text-align:center;border:1px dashed var(--line-2);border-radius:var(--radius)}',
      '.hq-nav{position:sticky;top:16px;display:grid;gap:2px}',
      '.hq-nav a{display:flex;justify-content:space-between;gap:8px;padding:9px 11px;border-radius:var(--radius);text-decoration:none;color:var(--muted);font-size:14.5px;border:1px solid transparent}',
      '.hq-nav a:hover{color:var(--paper);background:var(--ink-2)}',
      '.hq-nav a.is-on{color:var(--paper);background:var(--ink-2);border-color:var(--line-2)}',
      '.hq-nav a span{font-family:var(--font-mono);font-size:10.5px;color:var(--accent-2)}',
      '.hq-nav .hq-k{margin-top:10px;font-family:var(--font-mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted-2);padding:9px 11px;border:1px dashed var(--line-2);border-radius:var(--radius);cursor:pointer;background:none;text-align:left}',
      '.hq-nav .hq-k:hover{color:var(--accent-2);border-color:var(--accent-2)}',
      '.hq-main{min-width:0}',
      '.hq-h{font-family:var(--font-display);font-size:22px;margin:0 0 4px}',
      '.hq-s{color:var(--muted);font-size:14px;margin:0 0 18px}',
      '.hq-grid2{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:18px}',
      '.hq-panel{border:1px solid var(--line);border-radius:var(--radius);background:var(--ink-2);padding:16px 17px;min-width:0}',
      '.hq-panel h4{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted-2);font-weight:400;margin:0 0 10px}',
      '.hq-panel h4:not(:first-child){margin-top:18px}',
      '.hq-list{list-style:none;margin:0;padding:0;display:grid;gap:1px}',
      '.hq-list li{display:flex;gap:10px;align-items:baseline;padding:8px 0;border-bottom:1px solid var(--line);font-size:14px;min-width:0}',
      '.hq-list li:last-child{border-bottom:0}',
      '.hq-list .hq-t{flex:1;min-width:0;overflow-wrap:anywhere}',
      '.hq-list .hq-m{font-family:var(--font-mono);font-size:10.5px;color:var(--muted-2);white-space:nowrap}',
      '.hq-pill{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.07em;text-transform:uppercase;padding:2px 6px;border:1px solid var(--line-2);border-radius:var(--radius);color:var(--muted);white-space:nowrap;text-decoration:none}',
      'a.hq-pill:hover{color:var(--accent-2);border-color:var(--accent-2)}',
      '.hq-pill.is-late{border-color:var(--bad);color:var(--bad)}',
      '.hq-pill.is-soon{border-color:var(--accent);color:var(--accent-2)}',
      '.hq-pill.is-ok{border-color:rgba(79,208,138,.5);color:#4fd08a}',
      '.hq-feed-h{font-family:var(--font-mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent-2);margin:14px 0 4px}',
      '.hq-feed-h:first-child{margin-top:0}',
      '.hq-board{display:grid;grid-template-columns:repeat(4,minmax(260px,1fr));gap:12px;overflow-x:auto;padding-bottom:6px;align-items:start}',
      '.hq-pipe{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(230px,1fr);gap:10px;overflow-x:auto;padding-bottom:8px;align-items:start}',
      '.hq-col{background:var(--ink-2);border:1px solid var(--line);border-radius:var(--radius);padding:10px;min-height:120px;max-height:calc(100vh - 250px);overflow-y:auto;display:flex;flex-direction:column;gap:8px}','.hq-col > header{position:sticky;top:-10px;background:var(--ink-2);z-index:1;margin:-10px -10px 0;padding:10px 13px 6px !important}',
      '.hq-col.is-over{border-color:var(--accent);background:var(--accent-dim)}',
      '.hq-col > header{display:flex;justify-content:space-between;align-items:baseline;font-family:var(--font-mono);font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted-2);padding:2px 3px 4px}',
      '.hq-card{background:var(--ink);border:1px solid var(--line);border-radius:var(--radius);padding:10px 11px;cursor:grab;font-size:14px;min-width:0}',
      '.hq-card:hover{border-color:var(--line-2)}',
      '.hq-card.is-drag{opacity:.4}',
      '.hq-card.is-open{border-color:var(--accent);cursor:default}',
      '.hq-card .hq-ct{overflow-wrap:anywhere;line-height:1.35}',
      '.hq-card .hq-cm{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.hq-card{cursor:pointer}.hq-card:active{cursor:grabbing}',
      '.hq-card .hq-cd{margin-top:9px;padding-top:9px;border-top:1px solid var(--line);display:grid;gap:8px}',
      '.hq-card .hq-add{flex-wrap:nowrap}.hq-card .hq-add > *{min-width:0}.hq-card .hq-add input{flex:1 1 auto;width:100%}',
      '.hq-card .hq-cd p{color:var(--muted);font-size:13.5px;margin:0;white-space:pre-wrap}',
      '.hq-notes{list-style:none;margin:0;padding:0;display:grid;gap:6px}',
      '.hq-notes li{font-size:13px;color:var(--muted);border-left:2px solid var(--line-2);padding-left:8px}',
      '.hq-notes b{color:var(--paper);font-weight:500}',
      '.hq-in, .hq-main select, .hq-main textarea, .hq-main input[type=text], .hq-main input[type=date], .hq-main input[type=email], .hq-main input[type=number], .hq-main input[type=search], .hq-main input[type=time]{padding:8px 10px;border:1px solid var(--line-2);border-radius:var(--radius);background:var(--ink);color:var(--paper);font:inherit;font-size:14px;min-width:0}',
      '.hq-main textarea{width:100%;resize:vertical}',
      '.hq-add{display:flex;flex-wrap:wrap;gap:6px}',
      '.hq-add > input[name=title]{flex:1 1 180px}',
      '.hq-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}',
      '.hq-tile{display:block;text-decoration:none;color:inherit;border:1px solid var(--line);border-left:3px solid var(--hq-c,var(--accent));border-radius:var(--radius);background:var(--ink-2);padding:15px 16px}',
      '.hq-tile:hover{border-color:var(--accent-2);border-left-color:var(--hq-c,var(--accent))}',
      '.hq-tile b{font-family:var(--font-display);font-size:17px;display:block}',
      '.hq-tile p{color:var(--muted);font-size:13.5px;margin:6px 0 10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.hq-bar{height:3px;background:var(--line);border-radius:2px;overflow:hidden;margin-top:10px}',
      '.hq-bar i{display:block;height:100%;background:#4fd08a}',
      '.hq-docs{display:grid;grid-template-columns:260px minmax(0,1fr);gap:16px;align-items:start}',
      '.hq-doclist{display:grid;gap:4px;max-height:72vh;overflow:auto}',
      '.hq-doclist button{all:unset;cursor:pointer;display:block;padding:9px 10px;border:1px solid var(--line);border-radius:var(--radius);background:var(--ink-2)}',
      '.hq-doclist button:hover,.hq-doclist button.is-on{border-color:var(--accent)}',
      '.hq-doclist b{display:block;font-size:14px;font-weight:500}',
      '.hq-doclist span{font-family:var(--font-mono);font-size:10px;color:var(--muted-2)}',
      '.hq-doc input[name=title]{width:100%;font-family:var(--font-display);font-size:20px;border:0;background:transparent;padding:4px 0;margin-bottom:8px}',
      '.hq-doc textarea{min-height:52vh;font-family:var(--font-mono);font-size:13px;line-height:1.55}',
      '.hq-md{font-size:15px;line-height:1.6}',
      '.hq-md h3,.hq-md h4,.hq-md h5{font-family:var(--font-display);margin:16px 0 6px;letter-spacing:0;text-transform:none;color:var(--paper);font-weight:600}.hq-md h3{font-size:20px}.hq-md h4{font-size:17px}.hq-md h5{font-size:15px}',
      '.hq-md ul,.hq-md ol{padding-left:20px;margin:6px 0}',
      '.hq-md .hq-check li.is-done{text-decoration:line-through;color:var(--muted)}',
      '.hq-md code{font-family:var(--font-mono);font-size:12.5px;background:var(--ink-3);padding:1px 4px}',
      '.hq-ref{color:var(--accent-2);text-decoration:none;border-bottom:1px dotted}',
      '.hq-ref.is-missing{color:var(--muted-2)}',
      '.hq-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}',
      '.hq-cal > b{font-family:var(--font-mono);font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted-2);font-weight:400;padding:4px}',
      '.hq-day{min-height:92px;border:1px solid var(--line);border-radius:var(--radius);background:var(--ink-2);padding:5px;font-size:12px;display:flex;flex-direction:column;gap:3px;min-width:0}',
      '.hq-day.is-out{opacity:.4}',
      '.hq-day.is-today{border-color:var(--accent)}',
      '.hq-day > span{font-family:var(--font-mono);font-size:10.5px;color:var(--muted-2)}',
      '.hq-ev{display:block;padding:2px 5px;border-radius:2px;background:var(--ink-3);border-left:2px solid var(--muted-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-decoration:none;color:var(--paper)}',
      '.hq-ev.k-launch{border-left-color:#4fd08a}.hq-ev.k-chase{border-left-color:var(--accent-2)}.hq-ev.k-job{border-left-color:#e9b949}.hq-ev.k-meeting,.hq-ev.k-call{border-left-color:#5fb4ff}.hq-ev.k-deadline{border-left-color:var(--bad)}',
      '.hq-out{white-space:pre-wrap;font-size:14.5px;line-height:1.6;background:var(--ink);border:1px solid var(--line);border-radius:var(--radius);padding:14px;margin-top:12px}',
      '.hq-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:90;display:flex;justify-content:center;align-items:flex-start;padding-top:12vh}',
      '.hq-ov > div{width:min(640px,92vw);background:var(--ink);border:1px solid var(--line-2);border-radius:var(--radius);box-shadow:0 20px 60px rgba(0,0,0,.5)}',
      '.hq-ov input{width:100%;padding:16px 18px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--paper);font:inherit;font-size:17px;outline:none}',
      '.hq-ov ul{list-style:none;margin:0;padding:6px;max-height:52vh;overflow:auto}',
      '.hq-ov li a{display:flex;gap:10px;justify-content:space-between;padding:9px 12px;border-radius:var(--radius);text-decoration:none;color:var(--paper);font-size:14.5px}',
      '.hq-ov li a.is-on,.hq-ov li a:hover{background:var(--ink-2)}',
      '.hq-ov li a span{font-family:var(--font-mono);font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted-2)}',
      '.hq-mail li{align-items:flex-start}',
      '.hq-mail li.is-unread .hq-t b{color:var(--accent-2)}',
      '.hq-mail .hq-t small{display:block;color:var(--muted);font-size:13px;margin-top:3px}',
      '.hq-chk{display:grid;gap:4px;max-height:200px;overflow:auto;border:1px solid var(--line);padding:8px;border-radius:var(--radius);background:var(--ink)}',
      '.hq-chk label{display:flex;gap:8px;align-items:center;font-size:13.5px;cursor:pointer}',
      '@media (max-width:1100px){.hq-grid2{grid-template-columns:minmax(0,1fr)}}',
      '@media (max-width:900px){.hq{grid-template-columns:minmax(0,1fr)}.hq-nav{position:static;grid-auto-flow:column;grid-auto-columns:max-content;overflow-x:auto}.hq-nav .hq-k{display:none}.hq-grid2,.hq-docs{grid-template-columns:minmax(0,1fr)}.hq-board{grid-template-columns:repeat(4,minmax(240px,82vw))}.hq-col{max-height:70vh}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------------------------------------------------------------- data */
  function load() {
    var safe = function (p) { return p.catch(function () { return []; }); };
    var calls = [
      rest('dw_projects?select=id,slug,name,sector,blurb,kind,status,stage,hq_group,is_live,live_url,website,go_live_on,contact_name,contact_email,contact_phone,last_contact_on,next_action,next_action_on,outreach_notes,repo,deal_value,colour,has_preview,updated_at&order=name.asc'),
      safe(rest('dw_project_tasks?select=*&order=sort_order.asc,created_at.asc')),
      safe(rest('dw_task_notes?select=*&order=created_at.asc')),
      safe(rest('dw_docs?select=*&order=pinned.desc,updated_at.desc')),
      ME.owner ? safe(rest('dw_contacts?select=*&order=name.asc')) : Promise.resolve([]),
      safe(rest('dw_events?select=*&order=starts_on.asc')),
      safe(rest('dw_activity?select=*&order=at.desc&limit=80')),
      ME.owner ? safe(rest('dw_inbox?select=*&archived=eq.false&order=received_at.desc&limit=150')) : Promise.resolve([]),
      ME.owner ? safe(rest('dw_members?select=*&order=name.asc')) : Promise.resolve([])
    ];
    return Promise.all(calls).then(function (o) {
      D = { projects:o[0] || [], tasks:o[1] || [], notes:{}, docs:o[3] || [], contacts:o[4] || [], events:o[5] || [],
            activity:o[6] || [], inbox:o[7] || [], members:o[8] || [], byId:{}, bySlug:{}, at:Date.now() };
      D.projects.forEach(function (p) { D.byId[p.id] = p; D.bySlug[p.slug] = p; });
      (o[2] || []).forEach(function (n) { (D.notes[n.task_id] = D.notes[n.task_id] || []).push(n); });
    });
  }

  /* ----------------------------------------------------------------- shell */
  var TABS = [
    ['', 'Home'], ['board', 'Board'], ['projects', 'Projects'], ['dashboards', 'Dashboards', 1], ['pipeline', 'Pipeline', 1], ['docs', 'Docs'],
    ['calendar', 'Calendar'], ['inbox', 'Inbox', 1], ['repos', 'Repos', 1], ['assistant', 'Assistant', 1], ['people', 'People', 1]
  ];
  function parts() { return (location.hash || '').replace(/^#\/?/, '').split('/').slice(1); }

  function render() {
    var p = parts(), tab = p[0] || '', extra = p[1] || '';
    var openJobs = D.tasks.filter(function (t) { return !t.done; }).length;
    var unread = D.inbox.filter(function (m) { return !m.is_read; }).length;
    var badge = { board: openJobs, inbox: unread || '', docs: D.docs.length };
    var nav = TABS.filter(function (t) { return ME.owner || !t[2]; }).map(function (t) {
      return '<a href="#/hq' + (t[0] ? '/' + t[0] : '') + '" class="' + (t[0] === tab ? 'is-on' : '') + '">' + t[1] +
        (badge[t[0]] ? '<span>' + badge[t[0]] + '</span>' : '') + '</a>';
    }).join('') + '<button type="button" class="hq-k" data-hq="search">Search  ⌘K</button>';
    root.innerHTML = '<div class="hq"><nav class="hq-nav" aria-label="Workspace">' + nav + '</nav><div class="hq-main" id="hq-main"></div></div>';
    var main = root.querySelector('#hq-main');
    var V = { '':home, board:board, projects:projects, dashboards:dashboards, pipeline:pipeline, docs:docs, calendar:calendar, inbox:inbox, repos:repos, assistant:assistant, people:people };
    var f = V[tab] && (ME.owner || !TABS.filter(function (t) { return t[0] === tab && t[2]; }).length) ? V[tab] : home;
    f(main, extra);
    drawer();
  }

  /* ------------------------------------------------------------------ home */
  function dueBucket(d) {
    if (!d) return '';
    var t = today();
    if (d < t) return 'is-late'; if (d <= addDays(t, 3)) return 'is-soon'; return '';
  }
  function home(el) {
    var t = today(), week = addDays(t, 7);
    var mine = D.tasks.filter(function (x) { return !x.done && (ME.owner ? (x.owner === 'me' || !x.owner) : x.owner === (ME.member && ME.member.task_owner)); });
    var overdue = mine.filter(function (x) { return x.due_on && x.due_on < t; }).sort(function (a, b) { return b.due_on.localeCompare(a.due_on); });
    var due = mine.filter(function (x) { return x.due_on && x.due_on >= t && x.due_on <= week; }).sort(function (a, b) { return a.due_on.localeCompare(b.due_on); });
    var late = overdue.length;
    var chases = ME.owner ? D.projects.filter(function (p) { return p.next_action_on && p.next_action_on <= week && p.stage !== 'won' && p.stage !== 'lost'; })
      .sort(function (a, b) { return a.next_action_on.localeCompare(b.next_action_on); }) : [];
    var unread = D.inbox.filter(function (m) { return !m.is_read; });
    var hour = new Date().getHours();
    var hi = (hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening') + (ME.owner ? ', Tony' : (ME.member ? ', ' + ME.member.name.split(' ')[0] : ''));

    var stat = function (n, l) { return '<div class="stat"><b>' + n + '</b><span>' + l + '</span></div>'; };
    var html = '<h2 class="hq-h">' + esc(hi) + '</h2><p class="hq-s">' + nice(t) + '. Everything on the go, in one place.</p>' +
      '<div class="stats">' + stat(mine.length, ME.owner ? 'Your open jobs' : 'Your jobs') + stat(late, 'Overdue') + stat(due.length, 'Due this week') +
      (ME.owner ? stat(chases.length, 'Chases due') + stat(unread.length, 'Unread email') : '') +
      stat(D.projects.filter(function (p) { return p.hq_group !== 'prospect'; }).length, 'Live projects') + '</div>';

    var jobLi = function (x) {
      return '<li><input type="checkbox" data-hq="tick" data-id="' + x.id + '" aria-label="Done"><span class="hq-t" data-hq="open" data-id="' + x.id + '" style="cursor:pointer">' + esc(x.title) + '</span>' +
        '<a class="hq-pill" href="#/hq/projects/' + esc((proj(x.project_id) || {}).slug) + '">' + esc(pname(x.project_id)) + '</a>' +
        '<span class="hq-pill ' + dueBucket(x.due_on) + '">' + esc(nice(x.due_on)) + '</span></li>'; };
    html += '<div class="hq-grid2"><div class="hq-panel">' +
      (overdue.length ? '<h4>Overdue · ' + overdue.length + (overdue.length > 8 ? ' (latest 8, the rest are on the Board)' : '') + '</h4><ul class="hq-list">' + overdue.slice(0, 8).map(jobLi).join('') + '</ul>' : '') +
      '<h4>Due in the next 7 days</h4>' +
      (due.length ? '<ul class="hq-list">' + due.slice(0, 14).map(jobLi).join('') + '</ul>'
        : '<p class="note">Nothing with a date this week. Put due dates on jobs in the Board and they land here.</p>');
    if (ME.owner) {
      html += '<h4>People to chase</h4>' + (chases.length ? '<ul class="hq-list">' + chases.slice(0, 10).map(function (p) {
        return '<li><span class="hq-t"><a href="#/hq/projects/' + esc(p.slug) + '" class="hq-ref">' + esc(p.name) + '</a> ' + esc(p.next_action || 'follow up') + '</span>' +
          '<span class="hq-pill ' + dueBucket(p.next_action_on) + '">' + esc(nice(p.next_action_on)) + '</span></li>'; }).join('') + '</ul>'
        : '<p class="note">No chases due. Set next action dates in the Pipeline.</p>');
      html += '<h4>Unread email</h4>' + (unread.length ? '<ul class="hq-list">' + unread.slice(0, 6).map(function (m) {
        return '<li><span class="hq-t"><b>' + esc(m.from_name) + '</b> ' + esc(m.subject) + '</span>' +
          (m.project_id ? '<span class="hq-pill">' + esc(pname(m.project_id)) + '</span>' : '') + '<span class="hq-m">' + esc(ago(m.received_at)) + '</span></li>'; }).join('') + '</ul>'
        : '<p class="note">' + (D.inbox.length ? 'Inbox zero. Steady on.' : 'Connect Gmail in Inbox to see email here.') + '</p>');
    }
    html += '</div><div class="hq-panel"><h4>Coming up</h4>' + upcoming() + '<h4>Activity</h4>' + feed(D.activity) + '</div></div>';
    el.innerHTML = html;
  }

  function upcoming() {
    var t = today(), end = addDays(t, 21);
    var items = calItems().filter(function (i) { return i.date >= t && i.date <= end && i.kind !== 'job'; }).slice(0, 10);
    return items.length ? '<ul class="hq-list">' + items.map(function (i) {
      return '<li><span class="hq-pill">' + esc(nice(i.date)) + '</span><span class="hq-t">' + esc(i.title) + '</span><span class="hq-m">' + esc(i.kind) + '</span></li>'; }).join('') + '</ul>'
      : '<p class="note">Nothing in the next three weeks. Add launches and meetings in Calendar.</p>';
  }

  function feed(rows) {
    if (!rows.length) return '<p class="note">Changes to jobs, docs, stages and email show up here as they happen.</p>';
    var now = Date.now(), buckets = [['Last hour', 3600e3], ['Earlier today', null], ['Yesterday', null], ['This week', 7 * 864e5], ['Older', Infinity]];
    var startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    var startYest = startToday.getTime() - 864e5;
    function bucket(at) {
      var t = Date.parse(at);
      if (now - t < 3600e3) return 0; if (t >= startToday.getTime()) return 1; if (t >= startYest) return 2; if (now - t < 7 * 864e5) return 3; return 4;
    }
    var last = -1, out = '';
    rows.slice(0, 40).forEach(function (a) {
      var b = bucket(a.at);
      if (b !== last) { out += (last >= 0 ? '</ul>' : '') + '<p class="hq-feed-h">' + buckets[b][0] + '</p><ul class="hq-list">'; last = b; }
      out += '<li><span class="hq-t"><b>' + esc(actor(a.actor)) + '</b> ' + esc(a.summary) + '</span>' +
        (a.project_id ? '<a class="hq-pill" href="#/hq/projects/' + esc((proj(a.project_id) || {}).slug) + '">' + esc(pname(a.project_id)) + '</a>' : '') +
        '<span class="hq-m">' + esc(ago(a.at)) + '</span></li>';
    });
    return out + '</ul>';
  }

  /* ----------------------------------------------------------------- board */
  function board(el) {
    var q = S.boardQ.toLowerCase();
    var groupOk = function (t) { var p = proj(t.project_id); return p && p.hq_group !== 'prospect'; };
    var list = D.tasks.filter(function (t) {
      if (S.boardProject && t.project_id !== S.boardProject) return false;
      if (!S.boardProject && !groupOk(t)) return false;
      if (S.boardOwner && (t.owner || 'me') !== S.boardOwner) return false;
      if (q && (t.title + ' ' + (t.details || '') + ' ' + pname(t.project_id)).toLowerCase().indexOf(q) === -1) return false;
      if (t.done && t.done_at && Date.now() - Date.parse(t.done_at) > 14 * 864e5) return false;
      return true;
    });
    var owners = {}; D.tasks.forEach(function (t) { owners[t.owner || 'me'] = 1; });
    el.innerHTML = '<h2 class="hq-h">Board</h2><p class="hq-s">Every job across your products and clients. Drag between columns; click a card to open it.</p>' +
      '<div class="bar"><select data-hq="bproj"><option value="">All projects</option>' + projectOptions(S.boardProject) + '</select>' +
      '<select data-hq="bowner"><option value="">Anyone</option>' + Object.keys(owners).sort().map(function (o) {
        return '<option value="' + esc(o) + '"' + (o === S.boardOwner ? ' selected' : '') + '>' + esc(who(o)) + '</option>'; }).join('') + '</select>' +
      '<input type="search" data-hq="bq" placeholder="Filter jobs" value="' + esc(S.boardQ) + '"></div>' +
      '<form class="hq-add" data-hq="addtask" style="margin-bottom:14px"><input class="hq-in" name="title" placeholder="New job…" required>' +
      '<select name="project" required>' + projectOptions(S.boardProject || '', true, 'Pick a project') + '</select>' +
      '<input type="date" name="due"><button class="mini go" type="submit">Add</button></form>' +
      '<div class="hq-board">' + COLS.map(function (c) {
        var items = list.filter(function (t) { return col(t) === c[0]; })
          .sort(function (a, b) { return (a.due_on || '9999').localeCompare(b.due_on || '9999') || (a.sort_order || 0) - (b.sort_order || 0); });
        return '<section class="hq-col" data-col="' + c[0] + '"><header><span>' + c[1] + '</span><span>' + items.length + '</span></header>' +
          items.slice(0, S.colAll === c[0] ? 1000 : (c[0] === 'done' ? 25 : 40)).map(card).join('') +
          (items.length > (c[0] === 'done' ? 25 : 40) && S.colAll !== c[0] ? '<button type="button" class="hq-more" data-hq="colall" data-col="' + c[0] + '">Show all ' + items.length + '</button>' : '') + '</section>';
      }).join('') + '</div>';
    dnd(el, '.hq-card[data-task]', '.hq-col', function (id, colName) { moveTask(id, colName); });
  }

  function card(t) {
    var n = D.notes[t.id] || [], p = proj(t.project_id);
    return '<article class="hq-card' + (S.openTask === t.id ? ' is-open' : '') + '" draggable="true" data-task="' + t.id + '" data-hq="open" data-id="' + t.id + '">' +
      '<div class="hq-ct">' + (t.done ? '<s>' + esc(t.title) + '</s>' : esc(t.title)) + '</div>' +
      '<div class="hq-cm"><span class="hq-pill"' + (p && p.colour ? ' style="border-color:' + esc(p.colour) + '"' : '') + '>' + esc(pname(t.project_id)) + '</span>' +
      (t.owner && t.owner !== 'me' ? '<span class="hq-pill">' + esc(who(t.owner)) + '</span>' : '') +
      (t.due_on ? '<span class="hq-pill ' + (t.done ? '' : dueBucket(t.due_on)) + '">' + esc(nice(t.due_on)) + '</span>' : '') +
      (n.length ? '<span class="hq-pill">' + n.length + ' note' + (n.length === 1 ? '' : 's') + '</span>' : '') + '</div></article>';
  }

  /* job detail in a side drawer, so nothing has to squeeze into a board column */
  function drawer() {
    var old = document.querySelector('.hq-drawer-wrap'); if (old) old.remove();
    var t = S.openTask && D.tasks.filter(function (x) { return x.id === S.openTask; })[0];
    if (!t) return;
    var n = D.notes[t.id] || [], owners = {};
    D.tasks.forEach(function (x) { owners[x.owner || 'me'] = 1; });
    var wrap = document.createElement('div'); wrap.className = 'hq-drawer-wrap';
    wrap.innerHTML = '<div class="hq-drawer-bg" data-hq="close"></div><aside class="hq-drawer" role="dialog" aria-label="Job">' +
      '<div class="row" style="justify-content:space-between"><a class="hq-pill" href="#/hq/projects/' + esc((proj(t.project_id) || {}).slug) + '" data-hq="close">' + esc(pname(t.project_id)) + '</a>' +
      '<button class="mini" type="button" data-hq="close">Close ✕</button></div>' +
      '<form data-hq="taskform" data-id="' + t.id + '">' +
      '<label>Job</label><input type="text" name="title" value="' + esc(t.title) + '">' +
      '<div class="hq-two"><div><label>Column</label><select name="col">' + COLS.map(function (c) {
        return '<option value="' + c[0] + '"' + (col(t) === c[0] ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('') + '</select></div>' +
      '<div><label>Due</label><input type="date" name="due" value="' + esc(t.due_on || '') + '"></div></div>' +
      (ME.owner ? '<div class="hq-two"><div><label>Whose job</label><select name="owner">' + Object.keys(owners).sort().map(function (o) {
        return '<option value="' + esc(o) + '"' + ((t.owner || 'me') === o ? ' selected' : '') + '>' + esc(who(o)) + '</option>'; }).join('') + '</select></div>' +
        '<div><label>Project</label><select name="project">' + projectOptions(t.project_id) + '</select></div></div>' : '') +
      '<label>Details</label><textarea name="details">' + esc(t.details || '') + '</textarea>' +
      '<div class="row" style="margin-top:12px"><button class="mini go" type="submit">Save</button><span class="saved" data-saved></span>' +
      (ME.owner ? '<button class="mini bad" type="button" data-hq="deltask" data-id="' + t.id + '" style="margin-left:auto">Delete</button>' : '') + '</div></form>' +
      '<label style="margin-top:22px">Notes</label>' +
      (n.length ? '<ul class="hq-notes">' + n.map(function (x) { return '<li><b>' + esc(actor(x.author)) + '</b> ' + esc(ago(x.created_at)) + '<br>' + esc(x.body) + '</li>'; }).join('') + '</ul>' : '<p class="note">No notes yet.</p>') +
      '<form data-hq="addnote" data-id="' + t.id + '" style="margin-top:10px"><textarea name="body" placeholder="Add a note…" style="min-height:70px" required></textarea>' +
      '<button class="mini" type="submit" style="margin-top:8px">Post note</button></form></aside>';
    root.appendChild(wrap);
  }

  function moveTask(id, c) {
    var t = D.tasks.filter(function (x) { return x.id === id; })[0]; if (!t || col(t) === c) return;
    var body = c === 'done' ? { done:true, done_at:new Date().toISOString() } : { done:false, done_at:null, hq_state:c, waits: c === 'waiting' };
    Object.assign(t, body); render();
    patch('dw_project_tasks', id, body).then(logLocal.bind(null, t.project_id, c === 'done' ? 'ticked off: ' + t.title : 'moved "' + t.title + '" to ' + c)).catch(err);
  }
  function logLocal(pid, summary) { D.activity.unshift({ at:new Date().toISOString(), actor:ME.email, project_id:pid, summary:summary }); }

  /* generic HTML5 drag and drop: drag items matching sel onto targets matching tgt */
  function dnd(el, sel, tgt, done) {
    var dragId = null;
    el.querySelectorAll(sel).forEach(function (c) {
      c.addEventListener('dragstart', function (e) { S.dragging = true; dragId = c.getAttribute('data-task') || c.getAttribute('data-proj'); c.classList.add('is-drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (x) {} });
      c.addEventListener('dragend', function () { c.classList.remove('is-drag'); setTimeout(function () { S.dragging = false; }, 50); });
    });
    el.querySelectorAll(tgt).forEach(function (z) {
      z.addEventListener('dragover', function (e) { e.preventDefault(); z.classList.add('is-over'); });
      z.addEventListener('dragleave', function () { z.classList.remove('is-over'); });
      z.addEventListener('drop', function (e) { e.preventDefault(); z.classList.remove('is-over'); if (dragId) done(dragId, z.getAttribute('data-col')); dragId = null; });
    });
  }

  /* -------------------------------------------------------------- projects */
  function projects(el, slug) {
    if (slug && D.bySlug[slug]) return projectPage(el, D.bySlug[slug]);
    var list = visibleProjects();
    var order = ['own', 'client', 'prospect'];
    el.innerHTML = '<h2 class="hq-h">Projects</h2><p class="hq-s">Your own products and client work. Each one holds its jobs, docs, contacts and email.</p>' +
      (ME.owner ? '<div class="bar"><label class="note"><input type="checkbox" data-hq="showpros"' + (S.showProspects ? ' checked' : '') + '> Show prospects too (' +
        D.projects.filter(function (p) { return p.hq_group === 'prospect'; }).length + ')</label></div>' : '') +
      order.map(function (g) {
        var ps = list.filter(function (p) { return (p.hq_group || 'prospect') === g; });
        if (!ps.length) return '';
        return '<p class="h-sub">' + GROUP[g] + ' · ' + ps.length + '</p><div class="hq-tiles">' + ps.map(tile).join('') + '</div>';
      }).join('');
  }
  function tile(p) {
    var ts = D.tasks.filter(function (t) { return t.project_id === p.id; });
    var done = ts.filter(function (t) { return t.done; }).length, open = ts.length - done;
    var pc = ts.length ? Math.round(done / ts.length * 100) : 0;
    return '<a class="hq-tile" href="#/hq/projects/' + esc(p.slug) + '"' + (p.colour ? ' style="--hq-c:' + esc(p.colour) + '"' : '') + '>' +
      '<b>' + esc(p.name) + '</b><p>' + esc(p.blurb || p.sector || '') + '</p>' +
      '<div class="row"><span class="hq-pill' + (p.is_live ? ' is-ok' : '') + '">' + (p.is_live ? 'Live' : esc(STAGE_NAME[p.stage] || p.status || '')) + '</span>' +
      (open ? '<span class="hq-pill">' + open + ' open</span>' : '') +
      (p.go_live_on && !p.is_live ? '<span class="hq-pill ' + dueBucket(p.go_live_on) + '">Launch ' + esc(nice(p.go_live_on)) + '</span>' : '') +
      (p.deal_value ? '<span class="hq-pill">' + esc(money(p.deal_value)) + '</span>' : '') + '</div>' +
      (ts.length ? '<div class="hq-bar"><i style="width:' + pc + '%"></i></div>' : '') + '</a>';
  }

  function projectPage(el, p) {
    var ts = D.tasks.filter(function (t) { return t.project_id === p.id; });
    var open = ts.filter(function (t) { return !t.done; }), done = ts.length - open.length;
    var docs_ = D.docs.filter(function (d) { return d.project_id === p.id; });
    var cs = D.contacts.filter(function (c) { return c.project_id === p.id; });
    var mail = D.inbox.filter(function (m) { return m.project_id === p.id; });
    var evs = calItems().filter(function (i) { return i.pid === p.id && i.date >= today(); }).slice(0, 8);
    var act = D.activity.filter(function (a) { return a.project_id === p.id; });
    var link = function (u, l) { return u ? '<a class="mini" href="' + esc(u) + '" target="_blank" rel="noopener">' + l + '</a>' : ''; };

    var html = '<p class="crumb" style="margin-bottom:6px"><a href="#/hq/projects">Projects</a> / ' + esc(GROUP[p.hq_group] || '') + '</p>' +
      '<h2 class="hq-h">' + esc(p.name) + '</h2><p class="hq-s">' + esc(p.blurb || p.sector || '') + '</p>' +
      '<div class="row" style="margin-bottom:16px"><span class="hq-pill' + (p.is_live ? ' is-ok' : '') + '">' + (p.is_live ? 'Live' : esc(STAGE_NAME[p.stage] || '')) + '</span>' +
      '<span class="hq-pill">' + open.length + ' open · ' + done + ' done</span>' +
      link(p.live_url || p.website, 'Website') + (p.has_preview ? '<a class="mini" href="/preview/' + esc(p.slug) + '/" target="_blank" rel="noopener">Preview</a>' : '') +
      (p.repo ? link('https://github.com/' + p.repo, 'Repo') : '') +
      (ME.owner ? '<a class="mini" href="#/wip">Open in console</a><button class="mini go" type="button" data-hq="aisum" data-id="' + p.id + '">AI summary</button>' : '') + '</div>' +
      '<div id="hq-aisum"></div>' +
      '<div class="hq-grid2"><div class="hq-panel"><h4>Jobs</h4>' +
      '<form class="hq-add" data-hq="addtask" style="margin-bottom:8px"><input class="hq-in" name="title" placeholder="New job…" required><input type="hidden" name="project" value="' + p.id + '"><input type="date" name="due"><button class="mini go" type="submit">Add</button></form>' +
      (open.length ? '<ul class="hq-list">' + open.map(function (t) {
        return '<li><input type="checkbox" data-hq="tick" data-id="' + t.id + '" aria-label="Done"><span class="hq-t" data-hq="open" data-id="' + t.id + '" style="cursor:pointer">' + esc(t.title) +
          (t.phase ? ' <span class="hq-m">' + esc(t.phase) + '</span>' : '') + '</span>' +
          (t.owner && t.owner !== 'me' ? '<span class="hq-pill">' + esc(who(t.owner)) + '</span>' : '') +
          '<span class="hq-pill">' + esc(COLS.filter(function (c) { return c[0] === col(t); })[0][1]) + '</span>' +
          (t.due_on ? '<span class="hq-pill ' + dueBucket(t.due_on) + '">' + esc(nice(t.due_on)) + '</span>' : '') + '</li>'; }).join('') + '</ul>'
        : '<p class="note">No open jobs.</p>') +
      '<h4>Docs</h4>' + (docs_.length ? '<ul class="hq-list">' + docs_.map(function (d) {
        return '<li><span class="hq-t"><a class="hq-ref" href="#/hq/docs/' + d.id + '">' + esc(d.title) + '</a></span>' + (d.shared ? '<span class="hq-pill">Shared</span>' : '') + '<span class="hq-m">' + esc(ago(d.updated_at)) + '</span></li>'; }).join('') + '</ul>' : '<p class="note">No docs yet.</p>') +
      (ME.owner ? '<button class="mini" type="button" data-hq="newdoc" data-pid="' + p.id + '" style="margin-top:8px">New doc</button>' : '') +
      '</div><div class="hq-panel">';

    if (ME.owner) {
      html += '<h4>Contacts</h4>' + (cs.length || p.contact_name ? '<ul class="hq-list">' +
        (p.contact_name && !cs.some(function (c) { return c.name === p.contact_name; }) ? '<li><span class="hq-t"><b>' + esc(p.contact_name) + '</b> ' + esc(p.contact_email || '') + ' ' + esc(p.contact_phone || '') + '</span><span class="hq-m">main</span></li>' : '') +
        cs.map(function (c) {
          return '<li><span class="hq-t"><b>' + esc(c.name) + '</b>' + (c.role ? ' · ' + esc(c.role) : '') + (c.email ? ' · <a class="hq-ref" href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '') + (c.phone ? ' · ' + esc(c.phone) : '') + '</span>' +
            '<button class="mini bad" type="button" data-hq="delcontact" data-id="' + c.id + '">×</button></li>'; }).join('') + '</ul>' : '<p class="note">No contacts yet.</p>') +
        '<form class="hq-add" data-hq="addcontact" data-pid="' + p.id + '" style="margin-top:8px"><input class="hq-in" name="name" placeholder="Name" required style="flex:1 1 110px"><input class="hq-in" name="role" placeholder="Role" style="flex:1 1 80px"><input class="hq-in" name="email" type="email" placeholder="Email" style="flex:1 1 140px"><input class="hq-in" name="phone" placeholder="Phone" style="flex:1 1 100px"><button class="mini" type="submit">Add</button></form>' +
        '<h4>Email</h4>' + (mail.length ? '<ul class="hq-list">' + mail.slice(0, 8).map(function (m) {
          return '<li><span class="hq-t"><b>' + esc(m.from_name) + '</b> ' + esc(m.subject) + '</span><span class="hq-m">' + esc(ago(m.received_at)) + '</span></li>'; }).join('') + '</ul>' : '<p class="note">No email matched to this project yet.</p>');
    }
    html += '<h4>Coming up</h4>' + (evs.length ? '<ul class="hq-list">' + evs.map(function (i) {
      return '<li><span class="hq-pill">' + esc(nice(i.date)) + '</span><span class="hq-t">' + esc(i.title) + '</span></li>'; }).join('') + '</ul>' : '<p class="note">Nothing dated.</p>') +
      '<h4>Activity</h4>' + feed(act);
    if (ME.owner) {
      html += '<h4>Workspace settings</h4><form class="edit" data-hq="psettings" data-id="' + p.id + '" style="border-top:0;padding-top:0;margin-top:0">' +
        '<div><label>Group</label><select name="hq_group">' + ['own','client','prospect'].map(function (g) { return '<option value="' + g + '"' + (p.hq_group === g ? ' selected' : '') + '>' + GROUP[g] + '</option>'; }).join('') + '</select></div>' +
        '<div><label>Stage</label><select name="stage">' + STAGES.map(function (s) { return '<option value="' + s + '"' + (p.stage === s ? ' selected' : '') + '>' + STAGE_NAME[s] + '</option>'; }).join('') + '</select></div>' +
        '<div><label>Value £</label><input type="number" name="deal_value" value="' + esc(p.deal_value || '') + '"></div>' +
        '<div><label>Launch</label><input type="date" name="go_live_on" value="' + esc(p.go_live_on || '') + '"></div>' +
        '<div><label>Next action</label><input type="text" name="next_action" value="' + esc(p.next_action || '') + '"></div>' +
        '<div><label>When</label><input type="date" name="next_action_on" value="' + esc(p.next_action_on || '') + '"></div>' +
        '<div><label>GitHub repo</label><input type="text" name="repo" placeholder="anthonygdunn-hub/…" value="' + esc(p.repo || '') + '"></div>' +
        '<div><label>Colour</label><input type="text" name="colour" placeholder="#7000ff" value="' + esc(p.colour || '') + '"></div>' +
        '<div class="wide"><button class="mini go" type="submit">Save</button> <span class="saved" data-saved></span></div></form>';
    }
    el.innerHTML = html + '</div></div>';
  }

  /* ------------------------------------------------------------ dashboards */
  function spark(vals) {
    vals = vals || []; var max = Math.max.apply(null, vals.concat([1])), w = 120, h = 30, n = vals.length || 1;
    var pts = vals.map(function (v, i) { return (i * w / Math.max(1, n - 1)).toFixed(1) + ',' + (h - 2 - (v / max) * (h - 4)).toFixed(1); }).join(' ');
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><polyline fill="none" stroke="var(--accent-2)" stroke-width="2" points="' + pts + '"/></svg>';
  }
  function dashboards(el, slug) {
    el.innerHTML = '<p class="note">Loading dashboards…</p>';
    Promise.all([
      rest('dw_sites?select=*&active=eq.true&order=sort.asc'),
      rest('rpc/dw_sites_summary', { method:'POST', body:{ p_days: 7 } }).catch(function () { return []; })
    ]).then(function (o) {
      var sites = o[0] || [], sum = {}; (o[1] || []).forEach(function (x) { sum[x.slug] = x; });
      var site = slug && sites.filter(function (x) { return x.slug === slug; })[0];
      if (site) {
        el.innerHTML = '<p class="crumb" style="margin-bottom:6px"><a href="#/hq/dashboards">Dashboards</a> / ' + esc(site.host) + '</p>' +
          '<h2 class="hq-h">' + esc(site.name) + '</h2><p class="hq-s"><a class="hq-ref" href="' + esc(site.url) + '" target="_blank" rel="noopener">' + esc(site.host) + '</a>' +
          (site.project_id && proj(site.project_id) ? ' · <a class="hq-ref" href="#/hq/projects/' + esc(proj(site.project_id).slug) + '">project page</a>' : '') + '</p><div id="hq-sd"></div>';
        var box = el.querySelector('#hq-sd');
        if (site.slug === 'woolmer' && w.DWWoolmer) return w.DWWoolmer.view(box, say);
        return w.DWSiteDash.view(box, say, site);
      }
      var tot = 0, totp = 0, taps = 0;
      sites.forEach(function (x) { var m = sum[x.slug] || {}; tot += m.visits || 0; totp += m.visits_prev || 0; taps += m.clicks || 0; });
      el.innerHTML = '<h2 class="hq-h">Dashboards</h2><p class="hq-s">Every site you\'ve built, last 7 days. Open one for traffic, Google search, target keywords, speed and enquiries.</p>' +
        '<div class="stats"><div class="stat"><b>' + sites.length + '</b><span>Sites</span></div><div class="stat"><b>' + tot.toLocaleString('en-GB') + '</b><span>Visits, 7 days</span></div>' +
        '<div class="stat"><b>' + (totp ? (tot >= totp ? '▲ ' : '▼ ') + Math.abs(Math.round(100 * (tot - totp) / totp)) + '%' : '–') + '</b><span>On the week before</span></div><div class="stat"><b>' + taps + '</b><span>Enquiry taps, 7 days</span></div></div>' +
        '<div class="hq-tiles">' + sites.map(function (x) {
          var m = sum[x.slug] || {}, live = !!m.last;
          var d = m.visits_prev ? Math.round(100 * ((m.visits || 0) - m.visits_prev) / m.visits_prev) : null;
          return '<a class="hq-tile" href="#/hq/dashboards/' + esc(x.slug) + '"><b>' + esc(x.name) + '</b><p>' + esc(x.host) + '</p>' +
            (x.slug === 'woolmer' ? '<div class="row"><span class="hq-pill is-ok">Own counter</span><span class="hq-pill">Full woolmer dashboard</span></div>' :
            '<div class="row" style="justify-content:space-between;align-items:center"><div><b style="font-size:26px">' + (m.visits || 0) + '</b> <span class="hq-m">visits' +
              (d != null ? ' · ' + (d >= 0 ? '▲' : '▼') + Math.abs(d) + '%' : '') + '</span></div>' + spark(m.spark) + '</div>' +
            '<div class="row" style="margin-top:8px">' + (live ? '<span class="hq-pill is-ok">Counting</span>' : '<span class="hq-pill is-soon">Waiting for first visit</span>') +
              (m.clicks ? '<span class="hq-pill">' + m.clicks + ' enquiry taps</span>' : '') + (x.gsc ? '<span class="hq-pill">Search Console</span>' : '') + '</div>') + '</a>';
        }).join('') + '</div>';
    }).catch(err);
  }

  /* -------------------------------------------------------------- pipeline */
  function pipeline(el) {
    var q = S.pipeQ.toLowerCase();
    var list = D.projects.filter(function (p) { return p.hq_group !== 'own' && (!q || (p.name + ' ' + (p.sector || '') + ' ' + (p.contact_name || '')).toLowerCase().indexOf(q) !== -1); });
    var stages = S.pipeHide ? STAGES.filter(function (s) { return s !== 'lost' && s !== 'parked'; }) : STAGES;
    var t = today();
    var won = D.projects.filter(function (p) { return p.stage === 'won' && p.deal_value; }).reduce(function (n, p) { return n + Number(p.deal_value); }, 0);
    var live = D.projects.filter(function (p) { return ['replied','meeting','quoted'].indexOf(p.stage) !== -1; });
    el.innerHTML = '<h2 class="hq-h">Pipeline</h2><p class="hq-s">Clients and prospects by stage. Drag a card to move it; the console\'s outreach fields update with it.</p>' +
      '<div class="stats"><div class="stat"><b>' + live.length + '</b><span>Warm</span></div><div class="stat"><b>' + money(live.reduce(function (n, p) { return n + Number(p.deal_value || 0); }, 0), true) + '</b><span>Warm value</span></div>' +
      '<div class="stat"><b>' + (money(won) || '£0') + '</b><span>Won value</span></div><div class="stat"><b>' + D.projects.filter(function (p) { return p.next_action_on && p.next_action_on <= t && p.stage !== 'won' && p.stage !== 'lost'; }).length + '</b><span>Chases due</span></div></div>' +
      '<div class="bar"><input type="search" data-hq="pq" placeholder="Filter by name, trade or contact" value="' + esc(S.pipeQ) + '">' +
      '<label class="note"><input type="checkbox" data-hq="pipehide"' + (S.pipeHide ? ' checked' : '') + '> Hide lost and parked</label></div>' +
      '<div class="hq-pipe">' + stages.map(function (s) {
        var ps = list.filter(function (p) { return (p.stage || 'not-contacted') === s; })
          .sort(function (a, b) { return (a.next_action_on || '9999').localeCompare(b.next_action_on || '9999') || a.name.localeCompare(b.name); });
        var val = ps.reduce(function (n, p) { return n + Number(p.deal_value || 0); }, 0);
        return '<section class="hq-col" data-col="' + s + '"><header><span>' + STAGE_NAME[s] + ' · ' + ps.length + '</span><span>' + money(val) + '</span></header>' +
          ps.slice(0, 80).map(function (p) {
            var late = p.next_action_on && p.next_action_on <= t;
            return '<article class="hq-card" draggable="true" data-proj="' + p.id + '"><div class="hq-ct"><a class="hq-ref" href="#/hq/projects/' + esc(p.slug) + '">' + esc(p.name) + '</a></div>' +
              '<div class="hq-cm">' + (p.sector ? '<span class="hq-pill">' + esc(p.sector) + '</span>' : '') +
              (p.deal_value ? '<span class="hq-pill">' + esc(money(p.deal_value)) + '</span>' : '') +
              (p.next_action_on ? '<span class="hq-pill ' + (late ? 'is-late' : dueBucket(p.next_action_on)) + '">' + esc(p.next_action || 'Next') + ' ' + esc(nice(p.next_action_on)) + '</span>' : '') +
              (p.last_contact_on ? '<span class="hq-pill">Last ' + esc(nice(p.last_contact_on)) + '</span>' : '') + '</div></article>';
          }).join('') + (ps.length > 80 ? '<p class="note">+' + (ps.length - 80) + ' more, filter to find them</p>' : '') + '</section>';
      }).join('') + '</div>';
    dnd(el, '.hq-card[data-proj]', '.hq-col', function (id, stage) {
      var p = proj(id); if (!p || p.stage === stage) return;
      var body = { stage:stage, last_contact_on: ['emailed','called','replied','meeting','quoted','won'].indexOf(stage) !== -1 ? today() : p.last_contact_on };
      if (stage === 'won' && p.hq_group === 'prospect') body.hq_group = 'client';
      Object.assign(p, body); logLocal(p.id, p.name + ' moved to ' + stage); render();
      patch('dw_projects', id, body).then(function () { say(p.name + ' moved to ' + STAGE_NAME[stage], 'ok'); }).catch(err);
    });
  }

  /* ------------------------------------------------------------------ docs */
  function docs(el, id) {
    if (id === 'new') { return newDoc(S.docProject || null); }
    var q = S.docQ.toLowerCase();
    var list = D.docs.filter(function (d) {
      if (S.docProject && d.project_id !== S.docProject) return false;
      return !q || (d.title + ' ' + d.body + ' ' + (d.tags || []).join(' ') + ' ' + pname(d.project_id)).toLowerCase().indexOf(q) !== -1;
    });
    var cur = id ? D.docs.filter(function (d) { return d.id === id; })[0] : null;
    if (!cur && !id && list.length) cur = list[0];
    S.doc = cur ? cur.id : null;
    var canEdit = ME.owner || (cur && cur.shared);
    el.innerHTML = '<h2 class="hq-h">Docs</h2><p class="hq-s">Plans, briefs and notes. Write in plain text with # headings and - lists; link a project with [[Project name]].</p>' +
      '<div class="hq-docs"><div><div class="bar" style="margin-bottom:8px"><input type="search" data-hq="dq" placeholder="Search docs" value="' + esc(S.docQ) + '"></div>' +
      '<div class="bar" style="margin-bottom:8px"><select data-hq="dproj" style="flex:1"><option value="">All projects</option>' + projectOptions(S.docProject) + '</select>' +
      (ME.owner ? '<button class="mini go" type="button" data-hq="newdoc" data-pid="' + esc(S.docProject) + '">New</button>' : '') + '</div>' +
      '<div class="hq-doclist">' + (list.length ? list.map(function (d) {
        return '<button type="button" data-hq="pickdoc" data-id="' + d.id + '" class="' + (cur && cur.id === d.id ? 'is-on' : '') + '"><b>' + (d.pinned ? '📌 ' : '') + esc(d.title) + '</b>' +
          '<span>' + esc(pname(d.project_id)) + ' · ' + esc(ago(d.updated_at)) + '</span></button>'; }).join('') : '<p class="note">No docs match.</p>') + '</div></div>' +
      '<div class="hq-panel hq-doc">' + (cur ? docEditor(cur, canEdit) : '<p class="note">Pick a doc or start a new one.</p>') + '</div></div>';
  }
  function docEditor(d, canEdit) {
    var mode = S.docMode || 'read';
    if (!canEdit) mode = 'read';
    return '<div class="row" style="justify-content:space-between;margin-bottom:6px"><span class="hq-m">' + esc(pname(d.project_id)) + (d.updated_by ? ' · last edit ' + esc(actor(d.updated_by)) : '') + ' · ' + esc(ago(d.updated_at)) + '</span>' +
      (canEdit ? '<div class="row"><button class="mini' + (mode === 'read' ? ' go' : '') + '" type="button" data-hq="dmode" data-m="read">Read</button><button class="mini' + (mode === 'edit' ? ' go' : '') + '" type="button" data-hq="dmode" data-m="edit">Edit</button></div>' : '') + '</div>' +
      (mode === 'edit' ? '<form data-hq="docform" data-id="' + d.id + '"><input type="text" name="title" value="' + esc(d.title) + '">' +
        (ME.owner ? '<div class="hq-add" style="margin-bottom:8px"><select name="project_id"><option value="">General</option>' + projectOptions(d.project_id) + '</select>' +
          '<input type="text" name="tags" placeholder="tags, comma separated" value="' + esc((d.tags || []).join(', ')) + '" style="flex:1">' +
          '<label class="note"><input type="checkbox" name="pinned"' + (d.pinned ? ' checked' : '') + '> Pinned</label>' +
          '<label class="note" title="Collaborators on this project can read and edit it"><input type="checkbox" name="shared"' + (d.shared ? ' checked' : '') + '> Shared</label></div>' : '') +
        '<textarea name="body" spellcheck="true">' + esc(d.body) + '</textarea>' +
        '<div class="row" style="margin-top:8px"><span class="saved" data-saved>Saves as you type</span>' +
        (ME.owner ? '<button class="mini bad" type="button" data-hq="deldoc" data-id="' + d.id + '" style="margin-left:auto">Delete doc</button>' : '') + '</div></form>'
      : '<h3 class="hq-h">' + esc(d.title) + '</h3>' + ((d.tags || []).length ? '<div class="row" style="margin-bottom:8px">' + d.tags.map(function (t) { return '<span class="hq-pill">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
        '<div class="hq-md">' + (md(d.body) || '<p class="note">Empty. Hit Edit.</p>') + '</div>');
  }
  function newDoc(pid) {
    post('dw_docs', { title:'Untitled', body:'', project_id: pid || null, created_by: ME.email, updated_by: ME.email }).then(function (d) {
      D.docs.unshift(d); S.docMode = 'edit'; go('docs', d.id);
    }).catch(err);
  }
  var docTimer = null;
  function saveDoc(form) {
    clearTimeout(docTimer);
    var id = form.getAttribute('data-id'), d = D.docs.filter(function (x) { return x.id === id; })[0];
    var f = form.elements, body = { title: f.title.value.trim() || 'Untitled', body: f.body.value, updated_by: ME.email };
    if (f.project_id) { body.project_id = f.project_id.value || null; body.tags = f.tags.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean); body.pinned = f.pinned.checked; body.shared = f.shared.checked; }
    var mark = form.querySelector('[data-saved]'); mark.textContent = 'Saving…';
    docTimer = setTimeout(function () {
      patch('dw_docs', id, body).then(function (r) { if (r) Object.assign(d, r); mark.textContent = 'Saved'; }).catch(function (e) { mark.textContent = ''; err(e); });
    }, 700);
  }

  /* -------------------------------------------------------------- calendar */
  function calItems() {
    var out = [];
    D.projects.forEach(function (p) {
      if (p.go_live_on && !p.is_live) out.push({ date:p.go_live_on, title:p.name + ' launch', kind:'launch', pid:p.id });
      if (ME.owner && p.next_action_on && p.stage !== 'won' && p.stage !== 'lost') out.push({ date:p.next_action_on, title:(p.next_action || 'Chase') + ': ' + p.name, kind:'chase', pid:p.id });
    });
    D.tasks.forEach(function (t) { if (t.due_on && !t.done) out.push({ date:t.due_on, title:t.title + ' (' + pname(t.project_id) + ')', kind:'job', pid:t.project_id, tid:t.id }); });
    D.events.forEach(function (e) { out.push({ date:e.starts_on, title:(e.at_time ? e.at_time.slice(0, 5) + ' ' : '') + e.title, kind:e.kind, pid:e.project_id, eid:e.id }); });
    return out.sort(function (a, b) { return a.date.localeCompare(b.date); });
  }
  function calendar(el) {
    var base = S.month ? new Date(S.month + '-01T12:00:00') : new Date();
    base.setDate(1);
    var y = base.getFullYear(), m = base.getMonth();
    var first = new Date(y, m, 1, 12), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    var items = calItems(), byDay = {};
    items.forEach(function (i) { (byDay[i.date] = byDay[i.date] || []).push(i); });
    var t = today(), cells = '';
    for (var i = 0; i < 42; i++) {
      var d = new Date(start); d.setDate(start.getDate() + i); var k = ymd(d);
      if (i >= 35 && d.getMonth() !== m) break;
      var its = byDay[k] || [];
      cells += '<div class="hq-day' + (d.getMonth() !== m ? ' is-out' : '') + (k === t ? ' is-today' : '') + '"><span>' + d.getDate() + '</span>' +
        its.slice(0, 4).map(function (x) {
          var href = x.pid && proj(x.pid) ? '#/hq/projects/' + proj(x.pid).slug : '#/hq/calendar';
          return '<a class="hq-ev k-' + esc(x.kind) + '" href="' + href + '" title="' + esc(x.title) + '">' + esc(x.title) + '</a>'; }).join('') +
        (its.length > 4 ? '<span>+' + (its.length - 4) + ' more</span>' : '') + '</div>';
    }
    var mk = y + '-' + ('0' + (m + 1)).slice(-2);
    el.innerHTML = '<h2 class="hq-h">Calendar</h2><p class="hq-s">Launches (green), chases (purple), jobs due (amber), meetings and calls (blue) and deadlines (red).</p>' +
      '<div class="bar"><button class="mini" type="button" data-hq="mon" data-d="-1">‹ Prev</button><b style="font-family:var(--font-display);font-size:18px;min-width:150px;text-align:center">' +
      esc(first.toLocaleDateString('en-GB', { month:'long', year:'numeric' })) + '</b><button class="mini" type="button" data-hq="mon" data-d="1">Next ›</button>' +
      '<button class="mini" type="button" data-hq="mon" data-d="0">Today</button></div>' +
      '<div class="hq-cal">' + ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(function (d) { return '<b>' + d + '</b>'; }).join('') + cells + '</div>' +
      (ME.owner ? '<div class="hq-panel" style="margin-top:16px"><h4>Add to the calendar</h4><form class="hq-add" data-hq="addevent"><input class="hq-in" name="title" placeholder="What" required>' +
        '<input type="date" name="date" required value="' + (mk === t.slice(0, 7) ? t : mk + '-01') + '"><input type="time" name="time">' +
        '<select name="kind"><option value="meeting">Meeting</option><option value="call">Call</option><option value="launch">Launch</option><option value="deadline">Deadline</option><option value="event">Other</option></select>' +
        '<select name="project">' + projectOptions('', true, 'No project') + '</select><button class="mini go" type="submit">Add</button></form>' +
        (D.events.length ? '<h4>Your events</h4><ul class="hq-list">' + D.events.filter(function (e) { return e.starts_on >= addDays(t, -30); }).map(function (e) {
          return '<li><span class="hq-pill">' + esc(nice(e.starts_on)) + '</span><span class="hq-t">' + esc(e.title) + (e.project_id ? ' · ' + esc(pname(e.project_id)) : '') + '</span><span class="hq-m">' + esc(e.kind) + '</span><button class="mini bad" type="button" data-hq="delevent" data-id="' + e.id + '">×</button></li>'; }).join('') + '</ul>' : '') +
        '</div>' : '');
  }

  /* ----------------------------------------------------------------- inbox */
  function inbox(el) {
    el.innerHTML = '<h2 class="hq-h">Inbox</h2><p class="hq-s">info@dunnworks.io from the last 30 days, matched to projects by contact email or business domain.</p><div id="hq-mailstat" class="note">Checking Gmail…</div><div id="hq-mail"></div>';
    fn({ action:'mail_status' }).then(function (s) {
      var st = el.querySelector('#hq-mailstat');
      if (!st) return;
      if (!s.connected) {
        st.innerHTML = '<div class="hq-panel"><h4>Gmail is not connected yet</h4>' + (s.client
          ? '<p class="note" style="margin-bottom:10px">Sign in as info@dunnworks.io and allow read-only access. Google will warn the app is unverified: it\'s your own, so carry on.</p><button class="mini go" type="button" data-hq="gconnect">Connect Gmail</button>'
          : '<p class="note">The Google OAuth client (GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET) isn\'t set in Supabase yet.</p>') + '</div>';
      } else {
        st.innerHTML = '<div class="bar"><button class="mini go" type="button" data-hq="sync">Sync now</button><span class="note">' + esc(s.address || 'Gmail') + ' connected. ' + (s.last ? 'Last new email pulled ' + esc(ago(s.last)) : 'Not synced yet') + '</span><button class="mini" type="button" data-hq="gconnect">Reconnect</button></div>';
      }
      mailList(el.querySelector('#hq-mail'));
    }).catch(function (e) { el.querySelector('#hq-mailstat').textContent = e.message; mailList(el.querySelector('#hq-mail')); });
  }
  function mailList(box) {
    if (!box) return;
    if (!D.inbox.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="hq-panel"><ul class="hq-list hq-mail">' + D.inbox.map(function (m) {
      return '<li class="' + (m.is_read ? '' : 'is-unread') + '"><span class="hq-t"><b>' + esc(m.from_name) + '</b> <span class="hq-m">' + esc(m.from_email) + '</span><br>' + esc(m.subject) + '<small>' + esc(m.snippet) + '</small></span>' +
        '<div style="display:grid;gap:5px;justify-items:end"><span class="hq-m">' + esc(ago(m.received_at)) + '</span>' +
        '<select data-hq="mailproj" data-id="' + esc(m.id) + '" style="max-width:170px">' + projectOptions(m.project_id, true, 'No project') + '</select>' +
        '<div class="row"><a class="mini" href="https://mail.google.com/mail/u/0/#all/' + esc(m.thread_id) + '" target="_blank" rel="noopener">Open</a>' +
        '<button class="mini" type="button" data-hq="mailjob" data-id="' + esc(m.id) + '">Make job</button>' +
        '<button class="mini" type="button" data-hq="mailreply" data-id="' + esc(m.id) + '">Draft reply</button>' +
        '<button class="mini" type="button" data-hq="mailarch" data-id="' + esc(m.id) + '">Archive</button></div></div></li>'; }).join('') + '</ul></div>';
  }

  /* ----------------------------------------------------------------- repos */
  function repos(el, force) {
    el.innerHTML = '<h2 class="hq-h">Repos</h2><p class="hq-s">Your GitHub repos, latest first, with the last commit and GitHub Pages status.</p><div class="bar"><button class="mini" type="button" data-hq="reporef">Refresh</button><span class="note" id="hq-repostat">Loading…</span></div><div id="hq-repos"></div>';
    fn({ action:'repos', force: !!force }).then(function (r) {
      var used = {}; D.projects.forEach(function (p) { if (p.repo) (used[p.repo] = used[p.repo] || []).push(p); });
      el.querySelector('#hq-repostat').textContent = 'Fetched ' + ago(r.fetched_at) + (r.authed === false ? '. Public repos only: add a GITHUB_TOKEN secret to include private ones' : '');
      el.querySelector('#hq-repos').innerHTML = '<div class="hq-panel"><ul class="hq-list">' + (r.repos || []).map(function (x) {
        var ps = used[x.full_name] || [];
        var pages = x.pages ? '<span class="hq-pill ' + (x.pages.status === 'built' ? 'is-ok' : x.pages.status === 'errored' ? 'is-late' : 'is-soon') + '">Pages ' + esc(x.pages.status) + '</span>' : (x.has_pages ? '<span class="hq-pill">Pages</span>' : '');
        return '<li><span class="hq-t"><a class="hq-ref" href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.name) + '</a>' + (x.private ? ' <span class="hq-pill">Private</span>' : '') +
          (x.last_commit ? '<br><span class="note"><a class="hq-ref" href="' + esc(x.last_commit.url) + '" target="_blank" rel="noopener">' + esc(x.last_commit.sha) + '</a> ' + esc(x.last_commit.msg) + '</span>' : '') +
          (ps.length ? '<br>' + ps.slice(0, 6).map(function (p) { return '<a class="hq-pill" href="#/hq/projects/' + esc(p.slug) + '">' + esc(p.name) + '</a>'; }).join(' ') + (ps.length > 6 ? ' <span class="hq-m">+' + (ps.length - 6) + '</span>' : '') : '') + '</span>' +
          pages + (x.homepage ? '<a class="mini" href="' + esc(x.homepage) + '" target="_blank" rel="noopener">Site</a>' : '') + '<span class="hq-m">' + esc(ago(x.pushed_at)) + '</span></li>'; }).join('') + '</ul></div>';
    }).catch(function (e) { var s = el.querySelector('#hq-repostat'); if (s) s.textContent = e.message; });
  }

  /* ------------------------------------------------------------- assistant */
  function assistant(el) {
    var modes = [['ask','Ask'],['summary','Summarise'],['draft','Draft an email'],['tasks','Break into jobs']];
    var ph = { ask:'e.g. What should I do first this week?', summary:'Optional: anything to focus on', draft:'e.g. Chase Gary about the photos for his site, friendly', tasks:'e.g. Everything left to launch Backswing Golf' };
    el.innerHTML = '<h2 class="hq-h">Assistant</h2><p class="hq-s">Claude, reading the console: a project\'s jobs, docs, contacts and email, or the overview across everything. It won\'t make up prices or dates.</p>' +
      '<div class="hq-panel"><div class="bar"><select data-hq="aiproj"><option value="">Everything (overview)</option>' + projectOptions(S.aiProject) + '</select>' +
      modes.map(function (m) { return '<button type="button" class="chip' + (S.aiMode === m[0] ? ' is-on' : '') + '" data-hq="aimode" data-m="' + m[0] + '">' + m[1] + '</button>'; }).join('') + '</div>' +
      '<form data-hq="aiask"><textarea name="prompt" rows="4" placeholder="' + esc(ph[S.aiMode]) + '">' + esc(S.aiPrompt || '') + '</textarea>' +
      '<div class="row" style="margin-top:8px"><button class="mini go" type="submit">Go</button><span class="note" data-aistat></span></div></form><div id="hq-aiout">' + aiOut() + '</div></div>';
  }
  function aiOut() {
    var o = S.aiOut; if (!o) return '';
    if (o.tasks) {
      var pid = S.aiProject;
      return '<form data-hq="aiadd"><ul class="hq-list" style="margin-top:12px">' + o.tasks.map(function (t, i) {
        return '<li><input type="checkbox" name="t' + i + '" checked><span class="hq-t"><b>' + esc(t.title) + '</b>' + (t.details ? '<br><span class="note">' + esc(t.details) + '</span>' : '') + '</span>' +
          '<span class="hq-pill">' + esc(who(t.owner)) + '</span>' + (t.due_on ? '<span class="hq-pill">' + esc(nice(t.due_on)) + '</span>' : '') + '</li>'; }).join('') + '</ul>' +
        (pid ? '<button class="mini go" type="submit">Add ticked jobs to ' + esc(pname(pid)) + '</button>' : '<p class="note">Pick a project above to add these as jobs.</p>') + '</form>';
    }
    return '<div class="hq-out">' + esc(o.text) + '</div><div class="row" style="margin-top:8px"><button class="mini" type="button" data-hq="aicopy">Copy</button>' +
      (S.aiMode === 'draft' ? '<a class="mini" href="mailto:?subject=' + encodeURIComponent(((o.text.match(/^Subject:\s*(.*)$/m) || [])[1] || '')) + '&body=' + encodeURIComponent(o.text.replace(/^Subject:.*\n+/m, '')) + '">Open in mail</a>' : '') +
      (S.aiProject ? '<button class="mini" type="button" data-hq="aisave">Save as doc</button>' : '') + '</div>';
  }
  function runAi(mode, pid, prompt, statusEl) {
    if (statusEl) statusEl.textContent = 'Thinking…';
    return fn({ action:'ai', mode:mode, project_id: pid || null, prompt:prompt }).then(function (r) {
      if (statusEl) statusEl.textContent = '';
      return r;
    }).catch(function (e) { if (statusEl) statusEl.textContent = e.message; throw e; });
  }

  /* ---------------------------------------------------------------- people */
  function people(el) {
    var ps = D.projects.filter(function (p) { return p.hq_group !== 'prospect'; });
    var form = function (m) {
      m = m || { email:'', name:'', role:'collaborator', task_owner:'', project_ids:[], active:true };
      return '<form class="edit" data-hq="member" data-email="' + esc(m.email) + '" style="border-top:0;margin-top:0;padding-top:0">' +
        '<div><label>Name</label><input type="text" name="name" required value="' + esc(m.name) + '"></div>' +
        '<div><label>Email</label><input type="email" name="email" required value="' + esc(m.email) + '"' + (m.email ? ' readonly' : '') + '></div>' +
        '<div><label>Their jobs are marked</label><input type="text" name="task_owner" placeholder="e.g. stuart" value="' + esc(m.task_owner || '') + '"></div>' +
        '<div><label>Role</label><select name="role"><option value="collaborator"' + (m.role === 'collaborator' ? ' selected' : '') + '>Collaborator</option><option value="client"' + (m.role === 'client' ? ' selected' : '') + '>Client</option></select></div>' +
        '<div class="wide"><label>Projects they can see</label><div class="hq-chk">' + ps.map(function (p) {
          return '<label><input type="checkbox" name="p" value="' + p.id + '"' + (m.project_ids.indexOf(p.id) !== -1 ? ' checked' : '') + '> ' + esc(p.name) + '</label>'; }).join('') + '</div></div>' +
        '<div class="wide row"><label class="chk" style="margin:0"><input type="checkbox" name="active"' + (m.active ? ' checked' : '') + '> Access on</label>' +
        '<button class="mini go" type="submit">' + (m.email ? 'Save' : 'Save and send invite') + '</button>' +
        (m.email ? '<button class="mini" type="button" data-hq="reinvite" data-email="' + esc(m.email) + '">Resend invite</button>' : '') + '<span class="saved" data-saved></span></div></form>';
    };
    el.innerHTML = '<h2 class="hq-h">People</h2><p class="hq-s">Collaborators sign in at dunnworks.io/console with an emailed link and see only the Workspace for the projects you tick: jobs, shared docs, dates and activity. Never passphrases, prospects, email or anything else.</p>' +
      D.members.map(function (m) { return '<div class="hq-panel" style="margin-bottom:12px"><h4>' + esc(m.name) + (m.active ? '' : ' · access off') + (m.invited_at ? ' · invited ' + esc(ago(m.invited_at)) : '') + '</h4>' + form(m) + '</div>'; }).join('') +
      '<div class="hq-panel"><h4>Add someone</h4>' + form(null) + '</div>';
  }

  /* ---------------------------------------------------------------- search */
  function search() {
    if (document.querySelector('.hq-ov')) return;
    var ov = document.createElement('div'); ov.className = 'hq-ov';
    ov.innerHTML = '<div role="dialog" aria-label="Search"><input type="search" placeholder="Search projects, jobs, docs, contacts, email…" aria-label="Search"><ul></ul></div>';
    document.body.appendChild(ov);
    var input = ov.querySelector('input'), ul = ov.querySelector('ul'), sel = 0, hits = [];
    function find(q) {
      q = q.toLowerCase().trim(); var out = [];
      var has = function (s) { return String(s || '').toLowerCase().indexOf(q) !== -1; };
      if (!q) {
        TABS.filter(function (t) { return ME.owner || !t[2]; }).forEach(function (t) { out.push({ l:t[1], k:'Go to', h:'#/hq' + (t[0] ? '/' + t[0] : '') }); });
        return out;
      }
      D.projects.forEach(function (p) { if (has(p.name) || has(p.sector) || has(p.contact_name)) out.push({ l:p.name, k:GROUP[p.hq_group] || 'Project', h:'#/hq/projects/' + p.slug }); });
      D.docs.forEach(function (d) { if (has(d.title) || has(d.body)) out.push({ l:d.title, k:'Doc · ' + pname(d.project_id), h:'#/hq/docs/' + d.id }); });
      D.tasks.forEach(function (t) { if (!t.done && (has(t.title) || has(t.details))) out.push({ l:t.title, k:'Job · ' + pname(t.project_id), h:'#/hq/projects/' + ((proj(t.project_id) || {}).slug || '') }); });
      D.contacts.forEach(function (c) { if (has(c.name) || has(c.email)) out.push({ l:c.name + (c.role ? ' (' + c.role + ')' : ''), k:'Contact · ' + pname(c.project_id), h:'#/hq/projects/' + ((proj(c.project_id) || {}).slug || '') }); });
      D.inbox.forEach(function (m) { if (has(m.subject) || has(m.from_name) || has(m.from_email)) out.push({ l:m.subject, k:'Email · ' + m.from_name, h:'#/hq/inbox' }); });
      return out.slice(0, 40);
    }
    function draw() {
      hits = find(input.value); sel = Math.min(sel, Math.max(0, hits.length - 1));
      ul.innerHTML = hits.length ? hits.map(function (h, i) { return '<li><a href="' + esc(h.h) + '" class="' + (i === sel ? 'is-on' : '') + '">' + esc(h.l) + '<span>' + esc(h.k) + '</span></a></li>'; }).join('') : '<li class="note" style="padding:12px">Nothing found.</li>';
    }
    function close() { ov.remove(); }
    input.addEventListener('input', function () { sel = 0; draw(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, hits.length - 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === 'Enter' && hits[sel]) { location.hash = hits[sel].h; close(); }
      else if (e.key === 'Escape') close();
    });
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('a')) close(); });
    draw(); input.focus();
  }

  /* ---------------------------------------------------------------- events */
  function bind() {
    if (root._hqBound) return; root._hqBound = true;

    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-hq]'); if (!b || b.tagName === 'FORM' || b.tagName === 'SELECT' || (b.tagName === 'INPUT' && b.type !== 'checkbox')) return;
      var a = b.getAttribute('data-hq'), id = b.getAttribute('data-id');
      if (a === 'search') return search();
      if (a === 'open') { if (e.target.closest('a')) return; S.openTask = id; return drawer(); }
      if (a === 'close') { S.openTask = null; var dw = document.querySelector('.hq-drawer-wrap'); if (dw) dw.remove(); return; }
      if (a === 'colall') { S.colAll = b.getAttribute('data-col'); return render(); }
      if (a === 'tick') {
        var t = D.tasks.filter(function (x) { return x.id === id; })[0]; if (!t) return;
        t.done = true; t.done_at = new Date().toISOString();
        patch('dw_project_tasks', id, { done:true, done_at:t.done_at }).then(function () { logLocal(t.project_id, 'ticked off: ' + t.title); say('Ticked off: ' + t.title, 'ok'); render(); }).catch(err);
        return;
      }
      if (a === 'deltask') { if (!confirmish(b)) return; del('dw_project_tasks', id).then(function () { D.tasks = D.tasks.filter(function (x) { return x.id !== id; }); S.openTask = null; render(); }).catch(err); return; }
      if (a === 'newdoc') return newDoc(b.getAttribute('data-pid') || null);
      if (a === 'pickdoc') { S.docMode = 'read'; return go('docs', id); }
      if (a === 'dmode') { S.docMode = b.getAttribute('data-m'); return render(); }
      if (a === 'deldoc') { if (!confirmish(b)) return; del('dw_docs', id).then(function () { D.docs = D.docs.filter(function (x) { return x.id !== id; }); go('docs'); }).catch(err); return; }
      if (a === 'mon') {
        var dd = Number(b.getAttribute('data-d')), cur = S.month ? new Date(S.month + '-01T12:00:00') : new Date();
        if (!dd) S.month = null; else { cur.setDate(1); cur.setMonth(cur.getMonth() + dd); S.month = ymd(cur).slice(0, 7); }
        return render();
      }
      if (a === 'delevent') { del('dw_events', id).then(function () { D.events = D.events.filter(function (x) { return x.id !== id; }); render(); }).catch(err); return; }
      if (a === 'delcontact') { if (!confirmish(b)) return; del('dw_contacts', id).then(function () { D.contacts = D.contacts.filter(function (x) { return x.id !== id; }); render(); }).catch(err); return; }
      if (a === 'gconnect') { fn({ action:'gmail_auth_url' }).then(function (r) { location.href = r.url; }).catch(err); return; }
      if (a === 'reporef') return repos(root.querySelector('#hq-main'), true);
      if (a === 'sync') {
        b.disabled = true; b.textContent = 'Syncing…';
        fn({ action:'mail_sync' }).then(function (r) { say(r.added ? r.added + ' new email' + (r.added === 1 ? '' : 's') : 'No new email', 'ok'); return reload(); }).catch(function (e2) { b.disabled = false; b.textContent = 'Sync now'; err(e2); });
        return;
      }
      if (a === 'mailarch') { var m = D.inbox.filter(function (x) { return x.id === id; })[0]; patch('dw_inbox', id, { archived:true, is_read:true }).then(function () { D.inbox.splice(D.inbox.indexOf(m), 1); render(); }).catch(err); return; }
      if (a === 'mailjob') {
        var mm = D.inbox.filter(function (x) { return x.id === id; })[0];
        if (!mm.project_id) return say('Pick a project for this email first', 'bad');
        post('dw_project_tasks', { project_id:mm.project_id, title:'Reply: ' + mm.subject, details:mm.from_name + ' <' + mm.from_email + '>\n' + mm.snippet, owner:'me', sort_order:5, due_on: addDays(today(), 1) })
          .then(function (t) { D.tasks.push(t); patch('dw_inbox', id, { is_read:true }); mm.is_read = true; say('Job added to ' + pname(mm.project_id), 'ok'); render(); }).catch(err);
        return;
      }
      if (a === 'mailreply') {
        var m3 = D.inbox.filter(function (x) { return x.id === id; })[0];
        S.aiProject = m3.project_id || ''; S.aiMode = 'draft';
        S.aiPrompt = 'Draft a reply to this email from ' + m3.from_name + ' <' + m3.from_email + '>, subject "' + m3.subject + '":\n\n' + m3.snippet;
        S.aiOut = null; go('assistant');
        return;
      }
      if (a === 'aimode') { S.aiMode = b.getAttribute('data-m'); S.aiOut = null; return render(); }
      if (a === 'aicopy') { try { navigator.clipboard.writeText(S.aiOut.text); say('Copied', 'ok'); } catch (x) { err('Copy blocked by the browser'); } return; }
      if (a === 'aisave') {
        post('dw_docs', { project_id:S.aiProject, title:'Assistant: ' + (S.aiMode === 'draft' ? 'draft' : S.aiMode) + ' ' + today(), body:S.aiOut.text, tags:['assistant'], created_by:ME.email, updated_by:ME.email })
          .then(function (d) { D.docs.unshift(d); say('Saved to Docs', 'ok'); }).catch(err);
        return;
      }
      if (a === 'aisum') {
        var box = root.querySelector('#hq-aisum'); box.innerHTML = '<p class="note">Reading the jobs, docs and email…</p>';
        runAi('summary', id, '').then(function (r) { box.innerHTML = '<div class="hq-out" style="margin:0 0 16px">' + esc(r.text) + '</div>'; }).catch(function (e3) { box.innerHTML = '<p class="note bad">' + esc(e3.message) + '</p>'; });
        return;
      }
      if (a === 'reinvite') {
        var mem = D.members.filter(function (x) { return x.email === b.getAttribute('data-email'); })[0];
        fn(Object.assign({ action:'invite' }, mem)).then(function (r) { say(r.sent ? 'Invite sent to ' + mem.email : (r.note || 'Saved'), 'ok'); }).catch(err);
        return;
      }
    });

    root.addEventListener('change', function (e) {
      var b = e.target.closest('[data-hq]'); if (!b) return;
      var a = b.getAttribute('data-hq'), id = b.getAttribute('data-id');
      if (a === 'bproj') { S.boardProject = b.value; return render(); }
      if (a === 'bowner') { S.boardOwner = b.value; return render(); }
      if (a === 'dproj') { S.docProject = b.value; return go('docs'); }
      if (a === 'aiproj') { S.aiProject = b.value; S.aiOut = null; return; }
      if (a === 'tcol') return moveTask(id, b.value);
      if (a === 'tdue') { var t = D.tasks.filter(function (x) { return x.id === id; })[0]; t.due_on = b.value || null; patch('dw_project_tasks', id, { due_on:t.due_on }).then(render).catch(err); return; }
      if (a === 'mailproj') { var m = D.inbox.filter(function (x) { return x.id === id; })[0]; m.project_id = b.value || null; patch('dw_inbox', id, { project_id:m.project_id, is_read:true }).then(function () { m.is_read = true; say('Linked to ' + pname(m.project_id), 'ok'); }).catch(err); return; }
      if (a === 'showpros' || a === 'pipehide') { S[a === 'showpros' ? 'showProspects' : 'pipeHide'] = b.checked; return render(); }
    });

    var qTimer = null;
    root.addEventListener('input', function (e) {
      var b = e.target.closest('[data-hq]');
      if (b) {
        var a = b.getAttribute('data-hq');
        if (a === 'bq' || a === 'pq' || a === 'dq') {
          S[a === 'bq' ? 'boardQ' : a === 'pq' ? 'pipeQ' : 'docQ'] = b.value;
          clearTimeout(qTimer); qTimer = setTimeout(function () { render(); var n = root.querySelector('[data-hq="' + a + '"]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250);
          return;
        }
      }
      var f = e.target.closest('form[data-hq="docform"]'); if (f) saveDoc(f);
      var ai = e.target.closest('form[data-hq="aiask"]'); if (ai) S.aiPrompt = ai.elements.prompt.value;
    });

    root.addEventListener('submit', function (e) {
      var f = e.target.closest('form[data-hq]'); if (!f) return;
      e.preventDefault();
      var a = f.getAttribute('data-hq'), el = f.elements;
      if (a === 'addtask') {
        var pid = el.project.value; if (!pid) return say('Pick a project', 'bad');
        var row = { project_id:pid, title:el.title.value.trim(), due_on: el.due.value || null, owner: ME.owner ? 'me' : ((ME.member && ME.member.task_owner) || 'client'), sort_order:100 };
        post('dw_project_tasks', row).then(function (t) { D.tasks.push(t); logLocal(pid, 'added job: ' + t.title); render(); }).catch(err);
      }
      if (a === 'taskform') {
        var tid0 = f.getAttribute('data-id'), tk = D.tasks.filter(function (x) { return x.id === tid0; })[0], c0 = el.col.value, mark0 = f.querySelector('[data-saved]');
        var body0 = { title: el.title.value.trim() || tk.title, due_on: el.due.value || null, details: el.details.value.trim() || null };
        if (el.owner) body0.owner = el.owner.value;
        if (el.project) body0.project_id = el.project.value;
        if (c0 === 'done') { body0.done = true; body0.done_at = tk.done_at || new Date().toISOString(); }
        else { body0.done = false; body0.done_at = null; body0.hq_state = c0; body0.waits = c0 === 'waiting'; }
        patch('dw_project_tasks', tid0, body0).then(function () { Object.assign(tk, body0); mark0.textContent = 'Saved'; var keep = S.openTask; render(); S.openTask = keep; }).catch(err);
      }
      if (a === 'addnote') {
        var tid = f.getAttribute('data-id'), t = D.tasks.filter(function (x) { return x.id === tid; })[0];
        post('dw_task_notes', { task_id:tid, project_id:t.project_id, author: ME.owner ? 'me' : ME.email, body:el.body.value.trim() })
          .then(function (n) { (D.notes[tid] = D.notes[tid] || []).push(n); drawer(); }).catch(err);
      }
      if (a === 'addcontact') {
        post('dw_contacts', { project_id:f.getAttribute('data-pid'), name:el.name.value.trim(), role:el.role.value.trim() || null, email:el.email.value.trim() || null, phone:el.phone.value.trim() || null })
          .then(function (c) { D.contacts.push(c); render(); }).catch(err);
      }
      if (a === 'addevent') {
        post('dw_events', { title:el.title.value.trim(), starts_on:el.date.value, at_time:el.time.value || null, kind:el.kind.value, project_id:el.project.value || null })
          .then(function (ev) { D.events.push(ev); D.events.sort(function (x, y) { return x.starts_on.localeCompare(y.starts_on); }); render(); }).catch(err);
      }
      if (a === 'psettings') {
        var id = f.getAttribute('data-id'), p = proj(id), mark = f.querySelector('[data-saved]');
        var body = { hq_group:el.hq_group.value, stage:el.stage.value, deal_value: el.deal_value.value ? Number(el.deal_value.value) : null, go_live_on:el.go_live_on.value || null,
                     next_action:el.next_action.value.trim() || null, next_action_on:el.next_action_on.value || null, repo:el.repo.value.trim() || null, colour:el.colour.value.trim() || null };
        patch('dw_projects', id, body).then(function () { Object.assign(p, body); mark.textContent = 'Saved'; setTimeout(function () { mark.textContent = ''; }, 1600); }).catch(err);
      }
      if (a === 'aiask') {
        var st = f.querySelector('[data-aistat]'), btn = f.querySelector('button'); btn.disabled = true;
        runAi(S.aiMode, S.aiProject, el.prompt.value.trim(), st).then(function (r) { S.aiOut = r; btn.disabled = false; root.querySelector('#hq-aiout').innerHTML = aiOut(); }).catch(function () { btn.disabled = false; });
      }
      if (a === 'aiadd') {
        var picks = S.aiOut.tasks.filter(function (t, i) { return el['t' + i] && el['t' + i].checked; });
        Promise.all(picks.map(function (t, i) { return post('dw_project_tasks', { project_id:S.aiProject, title:t.title, details:t.details || null, owner:t.owner || 'me', due_on:t.due_on || null, sort_order:200 + i }); }))
          .then(function (rows) { D.tasks = D.tasks.concat(rows); S.aiOut = null; say(rows.length + ' jobs added to ' + pname(S.aiProject), 'ok'); render(); }).catch(err);
      }
      if (a === 'member') {
        var mark2 = f.querySelector('[data-saved]'), existing = f.getAttribute('data-email');
        var ids = [].slice.call(f.querySelectorAll('input[name=p]:checked')).map(function (x) { return x.value; });
        var m = { action:'invite', email:el.email.value.trim(), name:el.name.value.trim(), task_owner:el.task_owner.value.trim() || null, role:el.role.value, project_ids:ids, active:el.active.checked, send: !existing };
        mark2.textContent = 'Saving…';
        fn(m).then(function (r) { mark2.textContent = r.sent ? 'Saved, invite sent' : (r.note || 'Saved'); return reload(); }).catch(function (e4) { mark2.textContent = ''; err(e4); });
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && S.openTask && !document.querySelector('.hq-ov')) { S.openTask = null; var dw = document.querySelector('.hq-drawer-wrap'); if (dw) dw.remove(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && /^#\/hq/.test(location.hash)) { e.preventDefault(); search(); }
    });
  }
  function confirmish(b) {
    if (b.getAttribute('data-sure')) return true;
    b.setAttribute('data-sure', '1'); b.textContent = 'Sure?';
    setTimeout(function () { b.removeAttribute('data-sure'); b.textContent = b.getAttribute('data-hq') === 'delcontact' ? '×' : 'Delete'; }, 2500);
    return false;
  }
  function reload() { return load().then(render); }

  /* ----------------------------------------------------------------- entry */
  w.DWHq = {
    view: function (el, sayFn, me) {
      root = el; say = sayFn || say; if (me) ME = me;
      css(); bind();
      if (D && Date.now() - D.at < 5 * 60 * 1000) return render();
      el.innerHTML = '<p class="note">Loading the workspace…</p>';
      load().then(render).catch(function (e) { el.innerHTML = '<p class="msg bad">' + esc(e.message) + '</p>'; });
    },
    refresh: reload,
    // the console menu shows a count of open jobs across live projects
    summary: function () { return null; }
  };
})(window);
