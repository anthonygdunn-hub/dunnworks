/* Funworks cross-promotion: the before/after slider on the home page, and
   "Ask about the bundle" links that preselect the bundle in the nearest
   enquiry form (or on contact.html via ?want=bundle). */
(function () {
  var BUNDLE = "Brand + Site bundle with Funworks, around £1,850";

  document.querySelectorAll("[data-fw-compare]").forEach(function (box) {
    var range = box.querySelector("input[type=range]");
    function set(v) { box.style.setProperty("--cut", v + "%"); }
    range.addEventListener("input", function () { set(range.value); });
    set(range.value);
  });

  function pick() {
    var sel = document.getElementById("q-budget") || document.getElementById("budget");
    if (sel) sel.value = BUNDLE;
  }
  document.querySelectorAll("[data-fw-bundle]").forEach(function (a) {
    a.addEventListener("click", function () {
      if (document.getElementById("q-budget") || document.getElementById("budget")) pick();
    });
  });
  if (/[?&]want=bundle/.test(location.search)) pick();
})();
