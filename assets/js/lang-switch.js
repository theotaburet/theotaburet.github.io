// Sidebar language handling, injected through _includes/metadata-hook.html so
// no theme file is forked.
//
//   - every page in PAIRS gets an FR/EN switch next to the theme toggle
//   - French pages get their sidebar repointed at the French equivalents
//
// Pages outside PAIRS (archives, categories, tags, posts) exist in English
// only: no switch, and their sidebar entries are left alone.
(function () {
  var PAIRS = {
    "/": "/fr/",
    "/cv/": "/fr/cv/",
    "/publications/": "/fr/publications/",
    "/projects/": "/fr/projets/"
  };

  // Chirpy's fr-FR locale has no key for these tabs, so it falls back to the
  // English page title. Only Projects actually differs between the two.
  var FR_LABELS = { "/fr/projets/": "PROJETS" };

  function normalize(path) {
    return path.replace(/\/?$/, "/");
  }

  function addSwitch(bottom, target, label) {
    var a = document.createElement("a");
    a.href = target;
    a.className = "lang-switch";
    a.textContent = label;
    a.hreflang = label === "FR" ? "fr-FR" : "en";
    a.setAttribute(
      "aria-label",
      label === "FR" ? "Passer en français" : "Switch to English"
    );

    var toggle = bottom.querySelector(".btn-group");
    if (toggle) toggle.insertAdjacentElement("afterend", a);
    else bottom.insertBefore(a, bottom.firstChild);
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

    var bottom = document.querySelector(".sidebar-bottom");
    if (bottom) addSwitch(bottom, target, label);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
