/* Dunnworks — reissuing a preview passphrase from the admin.

   A locked preview is encrypted with one AES key that never changes. The
   passphrase's only job is to unwrap that key, and the wrapper is a row in
   dw_project_keys. So reissuing a passphrase is a few hundred bytes of
   rewrapping, not a rebuild of a 1MB file.

   Before writing a new wrapper this checks the key by actually decrypting the
   live preview with it. Wrapping the wrong key would lock the client out of
   their own page, and that is not a mistake worth risking to save two seconds.
*/
(function (w) {
  'use strict';
  var ENC = new TextEncoder();

  function b64(buf) {
    var a = new Uint8Array(buf), s = '';
    for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
    return btoa(s);
  }
  function bytes(b64s) {
    var s = atob(b64s), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }
  function rand(n) { return crypto.getRandomValues(new Uint8Array(n)); }

  function derive(pass, salt, iter, usage) {
    return crypto.subtle.importKey('raw', ENC.encode(pass), 'PBKDF2', false, ['deriveKey'])
      .then(function (km) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' },
          km, { name: 'AES-GCM', length: 256 }, true, usage);
      });
  }

  // ---- the passphrase itself ---------------------------------------------
  // Readable down a phone line, and long enough that guessing is pointless.
  var WORDS = ('amber anchor aspen basalt beacon birch bracken bramble brindle cedar chalk cinder ' +
    'clover copper cove crescent damson dovetail ember fathom fennel ferry flint furrow gable ' +
    'garnet gorse granite harbour hazel heather holloway ironwood juniper kestrel lantern larch ' +
    'linden lintel marram meadow mortise orchard osprey pewter pillar quarry quill rowan saffron ' +
    'sandstone sorrel spindle stirrup tamarisk thistle timber tinder trellis verge walnut willow ' +
    'wicker yarrow').split(' ');

  function make() {
    var pick = function () { return WORDS[crypto.getRandomValues(new Uint32Array(1))[0] % WORDS.length]; };
    var a = pick(), b = pick(), c = pick();
    while (b === a) b = pick();
    while (c === a || c === b) c = pick();
    var n = 1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000);
    return a + '-' + b + '-' + c + '-' + n;
  }

  // ---- recovering the file key -------------------------------------------
  function fileKeyFrom(row, pass) {
    var iter = row.file_iter || 600000;
    if (row.wrapped) {
      return derive(pass, bytes(row.wrap_salt), iter, ['decrypt'])
        .then(function (kek) {
          return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(row.wrap_iv) }, kek, bytes(row.wrapped));
        })
        .then(function (raw) {
          return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['decrypt']);
        });
    }
    // no wrapper yet, so the passphrase still is the key
    return derive(pass, bytes(row.file_salt), iter, ['decrypt']);
  }

  // Fetch the locked page and prove the key opens it.
  function verify(slug, doc, key) {
    var path = '/preview/' + slug + '/' + (doc === 'report' ? 'report/' : '');
    return fetch(path, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('cannot read ' + path + ' (HTTP ' + r.status + ')');
      return r.text();
    }).then(function (html) {
      var iv = (html.match(/IV = "([^"]+)"/) || [])[1];
      var ct = (html.match(/<script type="text\/plain" id="ct">([\s\S]*?)<\/script>/) || [])[1];
      if (!iv || !ct) throw new Error('no encrypted payload found at ' + path);
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv) }, key, bytes(ct.trim()));
    }).then(function () { return true; });
  }

  function wrap(key, pass, iter) {
    var salt = rand(16), iv = rand(12);
    return crypto.subtle.exportKey('raw', key).then(function (raw) {
      return derive(pass, salt, iter, ['encrypt']).then(function (kek) {
        return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, kek, raw);
      });
    }).then(function (ctb) {
      return { wrap_salt: b64(salt), wrap_iv: b64(iv), wrapped: b64(ctb) };
    });
  }

  /* Reissue one project's passphrase across every document it has.
     rows: the dw_project_keys rows for this slug
     onStep: called with a short status line so the screen can say what it is doing */
  function reissue(slug, rows, current, next, onStep) {
    if (!rows.length) return Promise.reject(new Error('no key record for ' + slug + '. Run dunnworks-keys.sql.'));
    if (!current) return Promise.reject(new Error('no current passphrase stored, so the file key cannot be recovered'));

    var done = [];
    return rows.reduce(function (chain, row) {
      return chain.then(function () {
        var label = row.doc === 'report' ? 'project sheet' : 'preview';
        onStep && onStep('Checking the ' + label + '…');
        return fileKeyFrom(row, current)
          .then(function (key) {
            return verify(slug, row.doc, key).then(function () { return key; });
          })
          .then(function (key) {
            onStep && onStep('Reissuing the ' + label + '…');
            return wrap(key, next, row.file_iter || 600000);
          })
          .then(function (patch) {
            return w.DWData.setKey(slug, row.doc, patch);
          })
          .then(function () { done.push(row.doc); });
      });
    }, Promise.resolve()).then(function () { return done; })
      .catch(function (e) {
        if (/operation-specific reason|OperationError/i.test(e && e.name + ' ' + e.message)) {
          throw new Error('the stored passphrase does not open that file, so nothing was changed');
        }
        throw e;
      });
  }

  w.DWKeys = { make: make, reissue: reissue };
})(window);
