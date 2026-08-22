// Drops a language switch into the sidebar, next to the theme toggle.
// Injected through _includes/metadata-hook.html so no theme file is forked.
// Pages without a counterpart (archives, categories, tags, posts) get nothing.
(function () {
  var PAIRS = {
    "/": "/fr/",
    "/cv/": "/fr/cv/",
    "/publications/": "/fr/publications/",
    "/projects/": "/fr/projets/"
  };

  function init() {
    var here = location.pathname.replace(/\/?$/, "/");
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

    var bottom = document.querySelector(".sidebar-bottom");
    if (!bottom) return;

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
