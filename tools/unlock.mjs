#!/usr/bin/env node
/* unlock.mjs — decrypt a page produced by lock.mjs, so it can be edited and
   re-locked. Counterpart to tools/lock.mjs.
     node tools/unlock.mjs --in=preview/x/index.html --out=/tmp/x.html --pass="..."  */
import fs from 'node:fs';
import crypto from 'node:crypto';

const args = {};
for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)=([\s\S]*)$/); if (m) args[m[1]] = m[2]; }
for (const k of ['in', 'out', 'pass']) if (!args[k]) { console.error(`unlock.mjs: --${k} is required`); process.exit(1); }

const page = fs.readFileSync(args.in, 'utf8');
const salt = Buffer.from(page.match(/SALT\s*=\s*"([^"]+)"/)[1], 'base64');
const iv   = Buffer.from(page.match(/IV\s*=\s*"([^"]+)"/)[1], 'base64');
const iter = +page.match(/ITER\s*=\s*(\d+)/)[1];
const ctB64 = page.match(/<script type="text\/plain" id="ct">([\s\S]*?)<\/script>/)[1].trim();
const buf  = Buffer.from(ctB64, 'base64');

const key = crypto.pbkdf2Sync(Buffer.from(args.pass, 'utf8'), salt, iter, 32, 'sha256');
const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
d.setAuthTag(buf.subarray(buf.length - 16));
const plain = Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]);
fs.writeFileSync(args.out, plain);
console.log(`Unlocked ${args.in} -> ${args.out} (${(plain.length/1024).toFixed(0)} KB, ${iter} iterations)`);
