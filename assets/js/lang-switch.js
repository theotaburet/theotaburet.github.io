---
# Front matter so Jekyll fills in the page pairs below.
---
// Sidebar language handling, injected through _includes/metadata-hook.html so
// no theme file is forked.
//
//   - every page in PAIRS gets an FR/EN switch at the right of the top bar
//   - French pages get their sidebar repointed at the French equivalents
//
// Pages outside PAIRS (posts, and their archives, categories and tags) exist in English
// only: no switch, and their sidebar entries are left alone.
(function () {
  var PAIRS = {{ site.data.translations | jsonify }}; // _data/translations.yml

  // Chirpy's fr-FR locale has no key for these tabs, so it falls back to the
  // English page title. Only Projects actually differs between the two.
  var FR_LABELS = { "/fr/projets/": "PROJETS" };

  function normalize(path) {
    return path.replace(/\/?$/, "/");
  }

  // The top bar's switches: this language link, and the light/dark button
  // site.js puts in front of it. Made here, on every page, because this
  // script runs first.
  function bar() {
    var top = document.getElementById("topbar");
    if (!top) return null;
    var group = document.createElement("div");
    group.className = "topbar-switches";
    top.insertBefore(group, document.getElementById("search-trigger"));
    return group;
  }

  function addSwitch(group, target, label) {
    var a = document.createElement("a");
    a.href = target;
    a.className = "lang-switch btn btn-link";
    a.textContent = label;
    a.hreflang = label === "FR" ? "fr-FR" : "en";
    // The label is in the language it switches to, so say it in that voice.
    a.lang = label === "FR" ? "fr" : "en";
    a.setAttribute(
      "aria-label",
      label === "FR" ? "Passer en français" : "Switch to English"
    );
    group.appendChild(a);
  }

  // The sidebar is rendered from the English tabs on every page, including the
  // French ones. Repoint the entries that have a French counterpart, and move
  // the active marker onto the current page.
  function localizeSidebar(here) {
    document.querySelectorAll("#sidebar a[href]").forEach(function (a) {
      var fr = PAIRS[normalize(a.pathname)];
      if (!fr) return;

      a.href = fr;

      var span = a.querySelector("span");
      if (span && FR_LABELS[fr]) span.textContent = FR_LABELS[fr];

      var item = a.closest(".nav-item");
      if (item) item.classList.toggle("active", fr === here);
    });
  }

  function init() {
    var group = bar();
    var here = normalize(location.pathname);
    var target = PAIRS[here];
    var label = "FR";

    if (!target) {
      for (var en in PAIRS) {
        if (PAIRS[en] === here) {
          target = en;
          label = "EN";
          break;
        }
      }
    }
    if (!target) return;

    if (label === "EN") localizeSidebar(here);

    if (group) addSwitch(group, target, label);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
