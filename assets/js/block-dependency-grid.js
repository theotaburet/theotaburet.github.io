// Interactive figure: dependency structure of the 4 DCT lattices used in the
// natural-steganography embedding scheme. Hover a cell to reveal everything it
// depends on, transitively.
(function () {
  var root = document.getElementById("dct-grid");
  if (!root) return;

  var N = 8;
  var COLORS = { A: "#a0d8ef", B: "#f8b862", C: "#8db255", D: "#d3381c" };
  var LEGEND = [
    ["A", "independent"],
    ["B", "depends on A"],
    ["C", "depends on A, B"],
    ["D", "depends on A, B, C"]
  ];
  // Each lattice may only depend on the ones before it in the A < B < C < D order.
  var PRECEDES = { A: "", B: "A", C: "AB", D: "ABC" };

  function typeAt(r, c) {
    if (r % 2 === 0) return c % 2 === 0 ? "A" : "C";
    return c % 2 === 0 ? "D" : "B";
  }

  // Transitive closure over the 8-neighbourhood. Terminates because the allowed
  // set strictly shrinks along A < B < C < D.
  function deps(r0, c0) {
    var out = {};
    var queue = [[r0, c0]];
    while (queue.length) {
      var cell = queue.pop();
      var allowed = PRECEDES[typeAt(cell[0], cell[1])];
      for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
          var nr = cell[0] + dr;
          var nc = cell[1] + dc;
          if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
          if (allowed.indexOf(typeAt(nr, nc)) === -1) continue;
          var key = nr + "," + nc;
          if (out[key]) continue;
          out[key] = true;
          queue.push([nr, nc]);
        }
      }
    }
    return out;
  }

  var style = document.createElement("style");
  style.textContent =
    "#dct-grid .dg-grid{display:grid;grid-template-columns:repeat(" + N + ",minmax(0,1fr));" +
    "gap:3px;max-width:360px;margin:0 auto}" +
    "#dct-grid .dg-cell{aspect-ratio:1;display:flex;align-items:center;justify-content:center;" +
    "color:#fff;font-weight:700;font-size:.8rem;border-radius:3px;cursor:pointer;" +
    "transition:opacity .15s,outline-color .15s;outline:2px solid transparent}" +
    "#dct-grid .dg-dim{opacity:.15}" +
    // Outlines the hovered cell against the *cell* colour, not the page, so it
    // stays visible on all four lattices in both themes.
    "#dct-grid .dg-active{outline-color:var(--heading-color,currentColor);outline-width:3px}" +
    "#dct-grid .dg-legend{display:flex;flex-wrap:wrap;gap:.25rem 1rem;justify-content:center;" +
    "margin-top:1rem;font-size:.85rem}" +
    "#dct-grid .dg-legend span{display:flex;align-items:center;gap:.4rem}" +
    "#dct-grid .dg-swatch{width:.85rem;height:.85rem;border-radius:2px;flex:none}" +
    "#dct-grid .dg-hint{text-align:center;font-size:.85rem;opacity:.7;margin-top:.75rem}";
  root.appendChild(style);

  var grid = document.createElement("div");
  grid.className = "dg-grid";
  var cells = [];

  for (var r = 0; r < N; r++) {
    for (var c = 0; c < N; c++) {
      var t = typeAt(r, c);
      var el = document.createElement("div");
      el.className = "dg-cell";
      el.style.backgroundColor = COLORS[t];
      el.textContent = t;
      el.dataset.pos = r + "," + c;
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", "lattice " + t + " at row " + (r + 1) + ", column " + (c + 1));
      grid.appendChild(el);
      cells.push(el);
    }
  }

  function highlight(pos) {
    if (!pos) {
      cells.forEach(function (el) {
        el.classList.remove("dg-dim", "dg-active");
      });
      return;
    }
    var parts = pos.split(",");
    var set = deps(Number(parts[0]), Number(parts[1]));
    cells.forEach(function (el) {
      var isSelf = el.dataset.pos === pos;
      el.classList.toggle("dg-active", isSelf);
      el.classList.toggle("dg-dim", !isSelf && !set[el.dataset.pos]);
    });
  }

  grid.addEventListener("mouseover", function (e) {
    var el = e.target.closest(".dg-cell");
    if (el) highlight(el.dataset.pos);
  });
  grid.addEventListener("mouseleave", function () {
    highlight(null);
  });

  var hint = document.createElement("p");
  hint.className = "dg-hint";
  hint.textContent = "Hover a cell to see everything it depends on.";

  var legend = document.createElement("div");
  legend.className = "dg-legend";
  LEGEND.forEach(function (entry) {
    var item = document.createElement("span");
    var sw = document.createElement("i");
    sw.className = "dg-swatch";
    sw.style.backgroundColor = COLORS[entry[0]];
    item.appendChild(sw);
    item.appendChild(document.createTextNode(entry[0] + " — " + entry[1]));
    legend.appendChild(item);
  });

  root.appendChild(grid);
  root.appendChild(hint);
  root.appendChild(legend);
})();
