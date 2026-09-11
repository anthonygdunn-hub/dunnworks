/* Replace the decrypt script inside an already locked preview so the typed
   passphrase unwraps the file key held in Supabase, instead of being the file
   key itself. The encrypted payload is never touched, so this is a text edit
   on a 1MB file rather than a rebuild.

   node tools/rekey.mjs --in=preview/take2/index.html --slug=take2 --doc=site
*/
import fs from 'node:fs';

const arg = n => (process.argv.find(a => a.startsWith('--' + n + '=')) || '').split('=').slice(1).join('=');
const file = arg('in'), slug = arg('slug'), doc = arg('doc') || 'site';
if (!file || !slug) { console.error('need --in and --slug'); process.exit(1); }

const src = fs.readFileSync(file, 'utf8');
const head = src.match(/var SALT = "([^"]+)", IV = "([^"]+)", ITER = (\d+);/);
if (!head) { console.error('no gate found in ' + file); process.exit(1); }
const [, SALT, IV, ITER] = head;

const start = src.lastIndexOf('<script>');
const end = src.indexOf('</script>', start);
if (start === -1 || end === -1) { console.error('no closing gate script'); process.exit(1); }

const gate = `<script>
(function(){
  // The payload below is encrypted with a key that never changes. What the
  // passphrase does is unwrap that key, and the wrapper lives in Supabase, so
  // the passphrase can be reissued without rebuilding this file. If Supabase
  // cannot be reached the original passphrase still works, so a client is
  // never locked out of their own preview by an outage.
  var SALT = "${SALT}", IV = "${IV}", ITER = ${ITER};
  var SLUG = "${slug}", DOC = "${doc}";
  var f = document.getElementById('f'), p = document.getElementById('p'),
      b = document.getElementById('b'), m = document.getElementById('m');

  if (!(window.crypto && window.crypto.subtle)) {
    m.className = 'msg err';
    m.textContent = window.isSecureContext === false
      ? 'This page has to be served over https for the decryption to work.'
      : 'This browser does not support the encryption used here. Try Chrome, Safari, Edge or Firefox.';
    b.disabled = true;
    return;
  }

  function bytes(b64s){
    var s = atob(b64s), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }

  async function derive(pass, saltB64, usage){
    var km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass),
      'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name:'PBKDF2', salt: bytes(saltB64), iterations: ITER, hash:'SHA-256' },
      km, { name:'AES-GCM', length:256 }, false, usage);
  }

  // The site's own config file carries the project address and the publishable
  // key. Reading it from there keeps one copy of both.
  async function wrapRow(){
    var cfg = await (await fetch('/assets/js/dw-config.js', { cache:'no-store' })).text();
    var url = (cfg.match(/url:\\s*'([^']+)'/) || [])[1];
    var key = (cfg.match(/anonKey:\\s*'([^']+)'/) || [])[1];
    if (!url || !key) throw new Error('no config');
    var r = await fetch(url + '/rest/v1/dw_project_keys?select=*&slug=eq.' +
      encodeURIComponent(SLUG) + '&doc=eq.' + encodeURIComponent(DOC),
      { headers: { apikey: key, Authorization: 'Bearer ' + key } });
    if (!r.ok) throw new Error('rest ' + r.status);
    var rows = await r.json();
    return rows[0] || null;
  }

  f.addEventListener('submit', async function(e){
    e.preventDefault();
    var pass = p.value;
    if (!pass) return;
    b.disabled = true;
    m.className = 'msg busy';
    m.textContent = 'Unlocking. This takes a second or two.';
    await new Promise(function(r){ setTimeout(r, 40); });

    var key = null, online = false, row = null;
    try { row = await wrapRow(); online = true; } catch (err) { online = false; }

    try {
      if (online && row && row.wrapped) {
        // current passphrase only. An earlier one no longer unwraps anything.
        var kek = await derive(pass, row.wrap_salt, ['decrypt']);
        var raw = await crypto.subtle.decrypt(
          { name:'AES-GCM', iv: bytes(row.wrap_iv) }, kek, bytes(row.wrapped));
        key = await crypto.subtle.importKey('raw', raw, { name:'AES-GCM' }, false, ['decrypt']);
      } else {
        key = await derive(pass, SALT, ['decrypt']);
      }
      var plain = await crypto.subtle.decrypt(
        { name:'AES-GCM', iv: bytes(IV) }, key,
        bytes(document.getElementById('ct').textContent.trim()));
      var html = new TextDecoder().decode(plain);
      document.open();
      document.write(html);
      document.close();
    } catch (err) {
      m.className = 'msg err';
      m.textContent = 'That passphrase is not right. Check for a stray space at the end.';
      b.disabled = false;
      p.select();
    }
  });
})();
</script>`;

fs.writeFileSync(file, src.slice(0, start) + gate + src.slice(end + '</script>'.length));
console.log(file + '  slug=' + slug + ' doc=' + doc + '  file_salt=' + SALT + '  iter=' + ITER);
