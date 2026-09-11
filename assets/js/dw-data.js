/* Dunnworks — shared Supabase access for the previews page and the admin.
   No SDK: PostgREST and GoTrue are both plain HTTP, and keeping it dependency
   free is the whole argument this site makes. */
(function (w) {
  'use strict';
  var C = w.DW || {};
  var ready = !!(C.url && C.anonKey);

  var TOKENS = 'dw-auth';

  var store = {
    get: function () {
      try { return JSON.parse(localStorage.getItem(TOKENS) || 'null'); } catch (e) { return null; }
    },
    set: function (t) {
      try { t ? localStorage.setItem(TOKENS, JSON.stringify(t)) : localStorage.removeItem(TOKENS); } catch (e) {}
    }
  };

  function headers(auth) {
    var h = { 'apikey': C.anonKey, 'Content-Type': 'application/json' };
    var t = auth && store.get();
    h.Authorization = 'Bearer ' + (t && t.access_token ? t.access_token : C.anonKey);
    return h;
  }

  // ---- auth -------------------------------------------------------------
  function sendMagicLink(email, redirectTo) {
    return fetch(C.url + '/auth/v1/otp', {
      method: 'POST',
      headers: { 'apikey': C.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, create_user: true, options: { email_redirect_to: redirectTo } })
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.msg || j.error_description || ('HTTP ' + r.status)); });
      return true;
    });
  }

  // Supabase returns the session in the URL fragment, which never leaves the
  // browser. Take it, keep it, and clean the address bar.
  function captureFromHash() {
    var h = w.location.hash || '';
    if (h.indexOf('access_token=') === -1) return false;
    var p = new URLSearchParams(h.replace(/^#/, ''));
    var t = {
      access_token: p.get('access_token'),
      refresh_token: p.get('refresh_token'),
      expires_at: Math.floor(Date.now() / 1000) + (parseInt(p.get('expires_in'), 10) || 3600)
    };
    if (!t.access_token) return false;
    store.set(t);
    history.replaceState(null, '', w.location.pathname + w.location.search);
    return true;
  }

  function refresh() {
    var t = store.get();
    if (!t || !t.refresh_token) return Promise.reject(new Error('no session'));
    return fetch(C.url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'apikey': C.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: t.refresh_token })
    }).then(function (r) {
      if (!r.ok) { store.set(null); throw new Error('session expired'); }
      return r.json();
    }).then(function (j) {
      store.set({ access_token: j.access_token, refresh_token: j.refresh_token,
                  expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600) });
      return true;
    });
  }

  function session() {
    var t = store.get();
    if (!t) return Promise.resolve(null);
    if (t.expires_at && t.expires_at - 60 < Math.floor(Date.now() / 1000)) {
      return refresh().then(function () { return store.get(); }).catch(function () { return null; });
    }
    return Promise.resolve(t);
  }

  function whoami() {
    return session().then(function (t) {
      if (!t) return null;
      return fetch(C.url + '/auth/v1/user', { headers: headers(true) })
        .then(function (r) { return r.ok ? r.json() : null; });
    });
  }

  function signOut() {
    var t = store.get();
    store.set(null);
    if (!t) return Promise.resolve();
    return fetch(C.url + '/auth/v1/logout', { method: 'POST', headers: { 'apikey': C.anonKey, Authorization: 'Bearer ' + t.access_token } })
      .catch(function () {});
  }

  // ---- data -------------------------------------------------------------
  function rest(path, opts) {
    opts = opts || {};
    return session().then(function () {
      return fetch(C.url + '/rest/v1/' + path, {
        method: opts.method || 'GET',
        headers: Object.assign(headers(opts.auth !== false), opts.headers || {}),
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 200)); });
      return r.status === 204 ? null : r.json();
    });
  }

  w.DWData = {
    ready: ready,
    // public read, used by the previews page
    listPublic: function () {
      return rest('dw_projects?select=*&published=eq.true&order=sort_order.asc,name.asc', { auth: false });
    },
    listAll: function () {
      return rest('dw_projects?select=*&order=sort_order.asc,name.asc');
    },
    secrets: function () {
      return rest('dw_project_secrets?select=*');
    },
    update: function (id, patch) {
      return rest('dw_projects?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH', body: patch, headers: { Prefer: 'return=representation' }
      });
    },
    create: function (row) {
      return rest('dw_projects', { method: 'POST', body: row, headers: { Prefer: 'return=representation' } });
    },
    remove: function (id) {
      return rest('dw_projects?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    },
    keys: function () {
      return rest('dw_project_keys?select=*', { auth: false });
    },
    // Rows are seeded when a preview is locked, so this is a patch. It falls
    // back to an insert only if the row is somehow missing.
    setKey: function (slug, doc, patch) {
      var q = 'dw_project_keys?slug=eq.' + encodeURIComponent(slug) + '&doc=eq.' + encodeURIComponent(doc);
      return rest(q, { method: 'PATCH', body: patch, headers: { Prefer: 'return=representation' } })
        .then(function (rows) {
          if (rows && rows.length) return rows;
          return rest('dw_project_keys', {
            method: 'POST',
            body: Object.assign({ slug: slug, doc: doc }, patch),
            headers: { Prefer: 'return=representation' }
          });
        });
    },
    setSecret: function (projectId, patch) {
      return rest('dw_project_secrets', {
        method: 'POST',
        body: Object.assign({ project_id: projectId }, patch),
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' }
      });
    },
    sendMagicLink: sendMagicLink,
    captureFromHash: captureFromHash,
    whoami: whoami,
    signOut: signOut
  };
})(window);
