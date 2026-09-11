#!/usr/bin/env node
/*
 * lock.mjs — wrap a single HTML file in a Dunnworks passphrase gate.
 *
 * The whole document is encrypted with AES-256-GCM under a key derived from the
 * passphrase by PBKDF2-SHA256 at 600,000 iterations. Nothing readable is left
 * in the page source, and because GCM is authenticated a wrong passphrase
 * throws rather than returning plausible rubbish.
 *
 *   node tools/lock.mjs --in build.html --out preview/take2/index.html \
 *        --client "Take2Cleaning" --pass "some-passphrase" \
 *        --title "Take2Cleaning — private preview" \
 *        --note "A proposed rebuild of the website."
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)=([\s\S]*)$/);
  if (m) args[m[1]] = m[2];
}
const need = k => { if (!args[k]) { console.error(`lock.mjs: --${k} is required`); process.exit(1); } return args[k]; };

const IN     = need('in');
const OUT    = need('out');
const PASS   = need('pass');
const CLIENT = args.client || 'Private preview';
const TITLE  = args.title  || `${CLIENT} — private preview`;
const NOTE   = args.note   || 'A proposed rebuild of the website. Enter the passphrase you were sent.';
const ITER   = 600000;

const plain = fs.readFileSync(IN);
const salt  = crypto.randomBytes(16);
const iv    = crypto.randomBytes(12);
const key   = crypto.pbkdf2Sync(Buffer.from(PASS, 'utf8'), salt, ITER, 32, 'sha256');

const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
// WebCrypto expects ciphertext followed by the 16 byte tag, which is how
// SubtleCrypto.decrypt reads it back.
const ct = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const page = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(TITLE)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root{--ink:#08080c;--ink2:#101018;--ink3:#181822;--line:#26262f;--line2:#33333f;
    --txt:#e7e7ee;--txt2:#a2a2b2;--txt3:#6f6f80;--v:#7000ff;--v2:#9b4dff;--v-soft:#1b0b33;--bad:#ff7b7b;
    --f:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;
    background:var(--ink);color:var(--txt);font-family:var(--f);line-height:1.6;
    background-image:radial-gradient(900px 420px at 50% -10%,var(--v-soft),transparent 70%);
    -webkit-font-smoothing:antialiased}
  .card{width:100%;max-width:430px;background:var(--ink2);border:1px solid var(--line);
    border-radius:8px;padding:36px 32px 30px;box-shadow:0 30px 80px -30px rgba(0,0,0,.9)}
  .dw{display:flex;align-items:center;gap:11px;font-weight:600;margin-bottom:28px;font-size:.95rem}
  .dw i{width:26px;height:26px;border-radius:4px;background:var(--v);display:grid;place-items:center;
    font-style:normal;font-size:.78rem;font-weight:700;color:#fff;flex:none}
  h1{font-size:1.32rem;letter-spacing:-.02em;margin:0 0 8px;font-weight:600}
  p{margin:0 0 22px;color:var(--txt2);font-size:.92rem}
  label{display:block;font-size:.8rem;font-weight:600;margin-bottom:8px}
  .row{display:flex;gap:8px}
  input{flex:1;min-width:0;padding:12px 14px;font:inherit;font-size:.95rem;color:var(--txt);
    background:var(--ink3);border:1px solid var(--line2);border-radius:5px}
  input:focus{outline:0;border-color:var(--v2);box-shadow:0 0 0 3px rgba(112,0,255,.22)}
  button{padding:12px 22px;font:inherit;font-size:.92rem;font-weight:600;color:#fff;background:var(--v);
    border:0;border-radius:5px;cursor:pointer;transition:.16s;white-space:nowrap}
  button:hover:not(:disabled){background:#5a00cc}
  button:disabled{opacity:.55;cursor:default}
  .msg{margin-top:16px;font-size:.86rem;min-height:1.3em}
  .msg.err{color:var(--bad)}
  .msg.busy{color:var(--txt2)}
  .foot{margin-top:26px;padding-top:20px;border-top:1px solid var(--line);
    font-size:.78rem;color:var(--txt3)}
  .foot a{color:var(--txt2)}
  noscript{display:block;margin-top:16px;color:var(--bad);font-size:.86rem}
</style>
</head>
<body>
<main class="card">
  <div class="dw"><i>D</i> Dunnworks</div>
  <h1>${esc(CLIENT)}</h1>
  <p>${esc(NOTE)}</p>
  <form id="f" autocomplete="off">
    <label for="p">Passphrase</label>
    <div class="row">
      <input id="p" type="password" autocomplete="current-password" autocapitalize="off"
             autocorrect="off" spellcheck="false" required>
      <button id="b" type="submit">Open</button>
    </div>
  </form>
  <div class="msg" id="m" role="status" aria-live="polite"></div>
  <noscript>This preview needs JavaScript, because the content is encrypted in your browser.</noscript>
  <div class="foot">
    Private preview. Not indexed, not linked from anywhere, and not the live site.
    Questions to <a href="mailto:info@dunnworks.io">info@dunnworks.io</a>.
  </div>
</main>
<script type="text/plain" id="ct">${ct.toString('base64')}</script>
<script>
(function(){
  var SALT = "${salt.toString('base64')}", IV = "${iv.toString('base64')}", ITER = ${ITER};
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

  f.addEventListener('submit', async function(e){
    e.preventDefault();
    var pass = p.value;
    if (!pass) return;
    b.disabled = true;
    m.className = 'msg busy';
    m.textContent = 'Unlocking. This takes a second or two.';
    await new Promise(function(r){ setTimeout(r, 40); });
    try {
      var km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass),
        'PBKDF2', false, ['deriveKey']);
      var key = await crypto.subtle.deriveKey(
        { name:'PBKDF2', salt: bytes(SALT), iterations: ITER, hash:'SHA-256' },
        km, { name:'AES-GCM', length:256 }, false, ['decrypt']);
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
</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page);
console.log(`Locked ${path.basename(IN)} (${(plain.length/1024).toFixed(0)} KB) -> ${OUT} (${(page.length/1024).toFixed(0)} KB)`);
