/* Dunnworks - shared behaviour. No dependencies, no build step. */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- theme switch ----
     Dark is the default. The inline script in each <head> applies a saved
     choice before the first paint, so there is no flash of the wrong theme. */
  var root = document.documentElement;
  var THEME_KEY = "dw-theme";
  var toggles = document.querySelectorAll("[data-theme-toggle]");

  function currentTheme() {
    return root.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function applyTheme(theme) {
    root.classList.add("theme-switching");
    if (theme === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.remove("theme-switching"); });
    });

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#ffffff" : "#101012");

    Array.prototype.forEach.call(toggles, function (btn) {
      btn.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
      btn.setAttribute("title", theme === "light" ? "Switch to the dark theme" : "Switch to the light theme");
    });
  }

  applyTheme(currentTheme());

  Array.prototype.forEach.call(toggles, function (btn) {
    btn.addEventListener("click", function () {
      var next = currentTheme() === "light" ? "dark" : "light";
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* private mode */ }
    });
  });

  /* ---- mobile nav ---- */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.textContent = open ? "Close" : "Menu";
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A" && nav.classList.contains("is-open")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.textContent = "Menu";
      }
    });
  }

  /* ---- scroll reveals ---- */
  var revealables = document.querySelectorAll("[data-reveal]");
  if (reduced || !("IntersectionObserver" in window)) {
    Array.prototype.forEach.call(revealables, function (el) { el.classList.add("is-in"); });
  } else {
    var revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var delay = parseInt(entry.target.getAttribute("data-reveal-delay") || "0", 10);
        setTimeout(function () { entry.target.classList.add("is-in"); }, delay);
        revealer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    Array.prototype.forEach.call(revealables, function (el) { revealer.observe(el); });
  }

  /* ---- counters ---- */
  var counters = document.querySelectorAll("[data-count]");
  function runCount(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var suffix = el.getAttribute("data-suffix") || "";
    var prefix = el.getAttribute("data-prefix") || "";
    if (reduced) { el.textContent = prefix + target + suffix; return; }
    var start = null;
    var duration = 1100;
    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  if (counters.length) {
    if (!("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(counters, runCount);
    } else {
      var countObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          runCount(entry.target);
          countObserver.unobserve(entry.target);
        });
      }, { threshold: 0.4 });
      Array.prototype.forEach.call(counters, function (el) { countObserver.observe(el); });
    }
  }

  /* ---- footer year ---- */
  var year = document.querySelector("[data-year]");
  if (year) year.textContent = new Date().getFullYear();

  /* ---- enquiry form ----
     Posts to Web3Forms. Add your access key to the hidden input in contact.html.
     With no key set, the form falls back to opening the visitor's email client. */
  /* ---- hero showreel: cycle the four client sites in the frame ---- */
  var reel = document.getElementById("hero-showreel");
  if (reel) {
    var panes = [].slice.call(reel.querySelectorAll(".hero-shot"));
    var urlOut = document.getElementById("hero-url");
    /* the first capture ships with the page, the rest wait until it has loaded */
    var fetchRest = function () {
      [].forEach.call(reel.querySelectorAll("img[data-src]"), function (img) {
        img.src = img.getAttribute("data-src");
        img.removeAttribute("data-src");
      });
    };
    if (document.readyState === "complete") { window.setTimeout(fetchRest, 300); }
    else { window.addEventListener("load", function () { window.setTimeout(fetchRest, 300); }); }

    if (panes.length > 1 && !reduced) {
      var at = 0;
      window.setInterval(function () {
        if (document.hidden) return;
        panes[at].classList.remove("is-live");
        at = (at + 1) % panes.length;
        panes[at].classList.add("is-live");
        if (urlOut) urlOut.textContent = panes[at].getAttribute("data-url") || "";
      }, 7000);
    }
  }

  /* ---- how it works: the rail walks itself, and hovering takes it over ---- */
  var flow = document.querySelector(".flow");
  if (flow) {
    var fsteps = [].slice.call(flow.querySelectorAll(".flow-step"));
    var setStep = function (i) {
      fsteps.forEach(function (el, n) {
        var on = n === i;
        el.classList.toggle("is-on", on);
        el.setAttribute("aria-pressed", on ? "true" : "false");
      });
      /* the fill stops at the middle of the live node */
      flow.style.setProperty("--flow-fill", ((i + 0.5) / fsteps.length * 100).toFixed(2) + "%");
    };

    var idx = 0, timer = null, held = false;
    var tick = function () {
      if (document.hidden || held) return;
      idx = (idx + 1) % fsteps.length;
      setStep(idx);
    };
    var start = function () { if (!timer && !reduced) timer = window.setInterval(tick, 3600); };
    var stop = function () { if (timer) { window.clearInterval(timer); timer = null; } };

    fsteps.forEach(function (el, n) {
      var take = function () { held = true; idx = n; setStep(n); };
      el.addEventListener("mouseenter", take);
      el.addEventListener("focus", take);
      el.addEventListener("click", take);
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); take(); }
      });
    });
    flow.addEventListener("mouseleave", function () { held = false; });
    flow.addEventListener("focusout", function (e) {
      if (!flow.contains(e.relatedTarget)) held = false;
    });

    setStep(0);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) start(); else stop(); });
      }, { threshold: 0.3 }).observe(flow);
    } else { start(); }
  }

  /* ---- case study clips: run only while on screen, so nothing animates out of sight ---- */
  var shots = [].slice.call(document.querySelectorAll(".shot"));
  if (shots.length) {
    if (!("IntersectionObserver" in window)) {
      shots.forEach(function (el) { el.classList.add("is-playing"); });
    } else {
      var sio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          e.target.classList.toggle("is-playing", e.isIntersecting);
        });
      }, { threshold: 0.15 });
      shots.forEach(function (el) { sio.observe(el); });
    }
  }

  var form = document.getElementById("enquiry-form");
  if (form) {
    var status = form.querySelector(".form-status");
    var submit = form.querySelector("button[type=submit]");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = new FormData(form);
      var key = (data.get("access_key") || "").toString().trim();

      if (data.get("company_website")) return; /* honeypot */

      if (!key || key.indexOf("REPLACE") === 0) {
        var body =
          "Name: " + (data.get("name") || "") + "\n" +
          "Email: " + (data.get("email") || "") + "\n" +
          "Phone: " + (data.get("phone") || "") + "\n" +
          "Current website: " + (data.get("website") || "") + "\n" +
          "Budget: " + (data.get("budget") || "") + "\n\n" +
          (data.get("message") || "");
        window.location.href =
          "mailto:info@dunnworks.io?subject=" +
          encodeURIComponent("Website enquiry from " + (data.get("name") || "the website")) +
          "&body=" + encodeURIComponent(body);
        if (status) {
          status.className = "form-status ok";
          status.textContent = "Opening your email app. Send the message and I will reply within one working day.";
        }
        return;
      }

      if (submit) { submit.disabled = true; submit.textContent = "Sending"; }
      if (status) { status.className = "form-status"; status.textContent = "Sending your enquiry"; }

      fetch("https://api.web3forms.com/submit", { method: "POST", body: data })
        .then(function (r) { return r.json(); })
        .then(function (out) {
          if (out.success) {
            form.reset();
            if (status) {
              status.className = "form-status ok";
              status.textContent = "Thanks. Your enquiry is in and I will reply within one working day.";
            }
          } else {
            throw new Error(out.message || "Send failed");
          }
        })
        .catch(function () {
          if (status) {
            status.className = "form-status bad";
            status.textContent = "That did not send. Email info@dunnworks.io instead and I will pick it up.";
          }
        })
        .finally(function () {
          if (submit) { submit.disabled = false; submit.textContent = "Send enquiry"; }
        });
    });
  }
  /* ---- cookie consent ----
     The site itself only stores the theme choice, which needs no consent.
     Anything optional (analytics, marketing) must be added as
       <script type="text/plain" data-consent="analytics" data-src="..."></script>
     and it is only switched on after the visitor accepts that category.
     The choice is kept in localStorage under "dw-consent". */
  (function () {
    var path = window.location.pathname;
    if (/^\/(admin|preview)(\/|$)/.test(path)) return;

    var KEY = "dw-consent";
    var VERSION = 1;
    var POLICY = "/cookies.html";

    function read() {
      try {
        var c = JSON.parse(localStorage.getItem(KEY) || "null");
        return c && c.v === VERSION ? c : null;
      } catch (e) { return null; }
    }

    function activate(c) {
      var tags = document.querySelectorAll('script[type="text/plain"][data-consent]');
      Array.prototype.forEach.call(tags, function (old) {
        if (!c[old.getAttribute("data-consent")] || old.getAttribute("data-activated")) return;
        old.setAttribute("data-activated", "1");
        var s = document.createElement("script");
        if (old.getAttribute("data-src")) s.src = old.getAttribute("data-src");
        else s.text = old.text;
        old.parentNode.insertBefore(s, old.nextSibling);
      });
      try { document.dispatchEvent(new CustomEvent("dw:consent", { detail: c })); } catch (e) {}
    }

    function save(analytics, marketing) {
      var c = { v: VERSION, necessary: true, analytics: !!analytics, marketing: !!marketing, date: new Date().toISOString() };
      try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
      activate(c);
      close();
    }

    window.dwConsent = { get: read, open: function () { open(true); } };

    var box = null;
    var lastFocus = null;

    function close() {
      if (!box) return;
      box.classList.remove("is-open");
      document.body.classList.remove("cc-open");
      var b = box;
      box = null;
      setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 250);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function open(showPrefs) {
      if (box) return;
      lastFocus = document.activeElement;
      var c = read() || { analytics: false, marketing: false };
      box = document.createElement("div");
      box.className = "cc";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-live", "polite");
      box.setAttribute("aria-label", "Cookie preferences");
      box.innerHTML =
        '<button class="cc-x" type="button" aria-label="Close: necessary cookies only">&times;</button>' +
        '<p class="cc-text">This site uses cookies and similar storage to remember your preferences and, only if you allow it, ' +
        'to understand how visitors use the site. By clicking "Accept all", you consent to our use of cookies. ' +
        '<a href="' + POLICY + '">Cookie policy</a></p>' +
        '<div class="cc-prefs"' + (showPrefs ? "" : " hidden") + '>' +
          '<label class="cc-opt"><input type="checkbox" checked disabled><span><b>Necessary</b>Keeps the site working and remembers your light or dark theme. Always on.</span></label>' +
          '<label class="cc-opt"><input type="checkbox" data-cc="analytics"' + (c.analytics ? " checked" : "") + '><span><b>Analytics</b>Anonymous visit counts, so I can see which pages are useful.</span></label>' +
          '<label class="cc-opt"><input type="checkbox" data-cc="marketing"' + (c.marketing ? " checked" : "") + '><span><b>Marketing</b>Measuring whether adverts lead to enquiries.</span></label>' +
        '</div>' +
        '<div class="cc-actions">' +
          '<button class="cc-btn cc-accept" type="button">Accept all</button>' +
          '<button class="cc-btn cc-custom" type="button">' + (showPrefs ? "Save choices" : "Customise") + '</button>' +
          '<button class="cc-btn cc-reject" type="button">Reject all</button>' +
        '</div>';
      document.body.appendChild(box);
      document.body.classList.add("cc-open");
      requestAnimationFrame(function () { if (box) box.classList.add("is-open"); });

      var prefs = box.querySelector(".cc-prefs");
      var custom = box.querySelector(".cc-custom");
      function val(name) { var i = box.querySelector('[data-cc="' + name + '"]'); return i && i.checked; }

      box.querySelector(".cc-accept").addEventListener("click", function () { save(true, true); });
      box.querySelector(".cc-reject").addEventListener("click", function () { save(false, false); });
      box.querySelector(".cc-x").addEventListener("click", function () { save(false, false); });
      custom.addEventListener("click", function () {
        if (prefs.hidden) {
          prefs.hidden = false;
          custom.textContent = "Save choices";
          var first = prefs.querySelector('[data-cc]');
          if (first) first.focus();
        } else {
          save(val("analytics"), val("marketing"));
        }
      });
      box.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && read()) close();
      });
    }

    /* "Cookie settings" link in every footer */
    var fb = document.querySelector(".footer-bottom");
    if (fb) {
      var link = document.createElement("button");
      link.type = "button";
      link.className = "cc-link";
      link.textContent = "Cookie settings";
      link.addEventListener("click", function () { open(true); });
      fb.appendChild(link);
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-cookie-settings]"), function (el) {
      el.addEventListener("click", function (e) { e.preventDefault(); open(true); });
    });

    var existing = read();
    if (existing) activate(existing);
    else open(false);
  })();
  /* ---- sign-in tokens landing on a public page ----
     Supabase falls back to the Site URL when a redirect is not honoured, so a
     magic link can arrive here instead of the console. Carry the hash across
     rather than losing it. */
  if (window.location.hash.indexOf("access_token=") !== -1 &&
      !/^\/console(\/|$)/.test(window.location.pathname)) {
    window.location.replace("/console/" + window.location.hash);
    return;
  }

  /* ---- private area link in every footer ---- */
  (function () {
    if (/^\/(console|admin|preview)(\/|$)/.test(window.location.pathname)) return;
    var fb = document.querySelector(".footer-bottom");
    if (!fb) return;
    var a = document.createElement("a");
    a.className = "cc-link";
    a.href = "/console/";
    a.rel = "nofollow";
    a.textContent = "Preview";
    a.setAttribute("aria-label", "Private preview area");
    a.style.textDecoration = "none";
    fb.appendChild(a);
  })();
})();
