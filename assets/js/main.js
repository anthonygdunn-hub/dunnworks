/* Dunnworks - shared behaviour. No dependencies, no build step. */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
          "mailto:hello@dunnworks.io?subject=" +
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
            status.textContent = "That did not send. Email hello@dunnworks.io instead and I will pick it up.";
          }
        })
        .finally(function () {
          if (submit) { submit.disabled = false; submit.textContent = "Send enquiry"; }
        });
    });
  }
})();
