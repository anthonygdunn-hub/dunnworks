/* Honest Handicap: menu, golf animations, and the two forms.
   No libraries. Anyone with "reduce motion" switched on gets still pictures. */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FN = 'https://acdpgarasgfhvupzsbxf.supabase.co/functions/v1/';
  var loaded = Date.now();

  /* mobile menu */
  var btn = document.querySelector('.menu-btn'), nav = document.getElementById('mainnav');
  function closeMenu() { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
  btn.addEventListener('click', function () { var o = nav.classList.toggle('open'); btn.setAttribute('aria-expanded', String(o)); });
  window.HHcloseMenu = closeMenu;

  /* reveal: pencil circles draw, score bars fill, blocks rise */
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: .25 }) : null;
  function observe(root) {
    (root || document).querySelectorAll('.rv-up, .verdict, .rcard, .bars').forEach(function (el) {
      if (!io || reduce) { el.classList.add('in'); return; }
      if (!el.classList.contains('in')) io.observe(el);
    });
  }
  window.HHobserve = observe;

  /* the putt line: the ball rolls toward the flag as the page scrolls */
  var ball = document.querySelector('.putt .ball'), head = document.getElementById('top');
  function onScroll() {
    var max = document.documentElement.scrollHeight - innerHeight;
    var p = max > 0 ? Math.min(1, scrollY / max) : 0;
    ball.style.setProperty('--p', (p * (innerWidth - 34)) + 'px');
    head.classList.toggle('stuck', scrollY > 10);
  }
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll);

  /* still pictures for anyone who prefers less motion */
  if (reduce) document.querySelectorAll('svg.anim').forEach(function (s) { if (s.pauseAnimations) { s.setCurrentTime(+s.dataset.still || 0); s.pauseAnimations(); } });

  /* ---- forms ---- */
  function show(msg, text, bad) { msg.textContent = text; msg.classList.add('show'); msg.classList.toggle('bad', !!bad); msg.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); }
  function missing(f) {
    return Array.prototype.filter.call(f.querySelectorAll('[required]'), function (i) {
      if (i.matches(':disabled')) return false;
      return i.type === 'checkbox' ? !i.checked : !String(i.value).trim();
    });
  }
  function busy(f, on, label) {
    var b = f.querySelector('button[type=submit]');
    if (!b) return;
    if (on) { b.dataset.label = b.firstChild.textContent; b.firstChild.textContent = label; b.disabled = true; }
    else { b.firstChild.textContent = b.dataset.label || b.firstChild.textContent; b.disabled = false; }
  }
  function post(name, body) {
    var opts = { method: 'POST', body: body };
    if (!(body instanceof FormData)) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
    return fetch(FN + name, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; });
    });
  }
  function mailFallback(f, subject) {
    var lines = [];
    Array.prototype.forEach.call(f.elements, function (el) {
      if (!el.name || el.type === 'submit' || el.type === 'file' || el.name === 'website' || el.name === 'code') return;
      var lab = f.querySelector('label[for="' + el.id + '"]');
      lines.push((lab ? lab.textContent : el.name) + ': ' + (el.type === 'checkbox' ? (el.checked ? 'Yes' : 'No') : el.value));
    });
    return 'mailto:hello@honesthandicap.golf?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\n'));
  }

  /* Become a tester */
  var join = document.getElementById('joinform');
  if (join) join.addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = join.querySelector('.msg'), bad = missing(join);
    if (bad.length) { show(msg, 'Please fill in the boxes marked as needed, and tick the box at the end.', true); bad[0].focus(); return; }
    var d = {}; Array.prototype.forEach.call(join.elements, function (el) { if (el.name) d[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
    d.ms = Date.now() - loaded;
    busy(join, true, 'Sending...');
    post('hh-join', d).then(function (j) {
      busy(join, false);
      if (j.ok) {
        join.reset();
        join.innerHTML = '<div class="done full"><h2>You\'re on the list</h2><p>' + (j.already
          ? 'You\'re already a tester. Use your tester code to <a href="/submit/">hand in a card</a>.'
          : 'Thanks. Anthony will be in touch with your tester code once he\'s had a look, usually within a few days.') + '</p></div>';
        observe(join);
      } else show(msg, j.error || 'That didn\'t go through. Please try again.', true);
    }).catch(function () {
      busy(join, false);
      show(msg, 'We couldn\'t reach the server. Your email app will open with everything filled in instead.', true);
      location.href = mailFallback(join, 'Become a tester');
    });
  });

  /* Hand in a review card */
  var card = document.getElementById('reviewform');
  if (card) {
    var code = document.getElementById('r-code'), rest = document.getElementById('r-rest'), hi = document.getElementById('r-hi');
    var check = document.getElementById('r-check'), cmsg = document.getElementById('r-codemsg');
    var photos = document.getElementById('r-photos'), thumbs = document.getElementById('r-thumbs');
    var shrunk = [];
    rest.disabled = true;

    function checkCode() {
      if (!code.value.trim()) { show(cmsg, 'Put your tester code in first. It looks like HH-7KQ2-MX9P.', true); code.focus(); return; }
      var fd = new FormData(); fd.append('code', code.value); fd.append('check', '1'); fd.append('website', card.website.value);
      check.disabled = true; check.firstChild.textContent = 'Checking...';
      post('hh-card', fd).then(function (j) {
        check.disabled = false; check.firstChild.textContent = 'Check my code';
        if (j.ok && j.first_name) {
          cmsg.classList.remove('show');
          hi.innerHTML = 'Hi <strong></strong>, the card is yours. Your name and home course go on from your tester record.';
          hi.querySelector('strong').textContent = j.first_name;
          hi.hidden = false; rest.disabled = false; code.readOnly = true; check.hidden = true;
          var hc = document.getElementById('r-hc'); if (hc && !hc.value && j.handicap != null) hc.value = j.handicap;
          document.getElementById('r-prod').focus();
        } else show(cmsg, j.error || 'That code didn\'t work.', true);
      }).catch(function () { check.disabled = false; check.firstChild.textContent = 'Check my code'; show(cmsg, 'We couldn\'t reach the server. Try again in a minute.', true); });
    }
    check.addEventListener('click', checkCode);
    code.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); checkCode(); } });

    /* photos: shrink to 1800px JPEGs in the browser (this also turns iPhone HEIC photos into JPEGs) */
    function shrink(file) {
      return new Promise(function (ok) {
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () {
          var s = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
          var c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          c.toBlob(function (b) { ok(b ? new File([b], 'photo.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', .85);
        };
        img.onerror = function () { URL.revokeObjectURL(url); ok(file); };
        img.src = url;
      });
    }
    photos.addEventListener('change', function () {
      var list = Array.prototype.slice.call(photos.files, 0, 3);
      if (photos.files.length > 3) show(card.querySelector('#r-rest .msg'), 'Only the first three photos will be sent.', false);
      thumbs.innerHTML = '';
      Promise.all(list.map(shrink)).then(function (out) {
        shrunk = out;
        out.forEach(function (f) { var i = new Image(); i.alt = ''; i.src = URL.createObjectURL(f); thumbs.appendChild(i); });
      });
    });

    card.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = card.querySelector('#r-rest .msg');
      if (rest.disabled) { checkCode(); return; }
      var bad = missing(card);
      if (bad.length) { show(msg, 'Please fill in the boxes marked as needed: all five scores, your verdict and how it played.', true); bad[0].focus(); return; }
      var w = document.getElementById('r-play');
      if (w.value.trim().length < 150) { show(msg, 'Tell us a bit more about how it played: a couple of paragraphs is perfect.', true); w.focus(); return; }
      var fd = new FormData();
      Array.prototype.forEach.call(card.elements, function (el) { if (el.name && el.type !== 'file' && el.type !== 'submit') fd.append(el.name, el.value); });
      shrunk.forEach(function (f, i) { fd.append('photos', f, 'photo' + (i + 1) + '.jpg'); });
      fd.append('ms', String(Date.now() - loaded));
      busy(card, true, shrunk.length ? 'Sending card and photos...' : 'Sending...');
      post('hh-card', fd).then(function (j) {
        busy(card, false);
        if (j.ok) {
          card.innerHTML = '<div class="done full"><h2>Card handed in</h2><p>Thanks' + (j.first_name ? ', ' + j.first_name.replace(/[<>&]/g, '') : '') +
            '. Anthony checks every card before it goes up' + (j.photos ? ', photos and all' : '') + '. You\'ll see it on the site once it\'s live.</p>' +
            '<p><a class="btn btn-line btn-sm" href="/submit/">Hand in another card<span class="gb"></span></a></p></div>';
          observe(card); scrollTo(0, 0);
        } else {
          show(msg, j.error || 'That didn\'t go through. Please try again.', true);
          var f = j.field && document.querySelector('[name="' + j.field + '"]'); if (f) f.focus();
        }
      }).catch(function () { busy(card, false); show(msg, 'We couldn\'t reach the server. Nothing has been lost: try again in a minute.', true); });
    });
  }

  observe(); onScroll();
})();
