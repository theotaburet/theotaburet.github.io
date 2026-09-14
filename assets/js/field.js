// Site-wide background: growth on a lattice.
//
// Every cell sits on the graph-paper grid, never between two lines. A cell
// that lights up spreads to its neighbours, and its colour tracks how long ago
// it was lit: the frontier is D, the lattice that depends on everything
// embedded before it, and the oldest cells at the core have decayed back to A.
// So a patch reads outward in embedding order, A C B D, and dies from the
// middle.
//
// A click seeds a patch and the patch grows, ages and dies on its own. That
// is the only thing that starts it: the field stays still until you ask.
//
// The grid is in page coordinates, so a patch stays where it was drawn and
// scrolls away with the paragraph it sits behind. The canvas itself stays
// fixed and viewport-sized; only the visible rows are ever painted.
(function () {
  var COLORS = ["#a0d8ef", "#8db255", "#f8b862", "#d3381c"]; // A, C, B, D
  var CELL = 10; // grid pitch, CSS px. Matches the graph paper drawn in CSS.
  var GAP = 1; // leaves a hairline of paper showing between cells
  var STEP = 70; // ms per generation; the chunkiness is the point
  // A cell's life sets how thick the ring is, because the front keeps moving
  // while the cells behind it are still alive: at 0.68 cells a generation, 26
  // generations of life trail the front by about 180px. Longer and the ring
  // closes up into a disc that covers most of the screen at once, which is a
  // flood rather than a ripple.
  var LIFE = 26; // generations a cell lives before it goes back to paper
  var SPREAD = 0.6; // chance a young cell lights an empty neighbour
  var YOUNG = 6; // only cells this new can spread, so growth stays a front
  var BURST = 7; // click seeding radius, in cells
  var FADE = 0.45; // share of a life spent fading out at the end of it
  // Cells per generation the front advances at: 0.68 in open ground, 0.43
  // once it is working along an edge, where a cell has fewer neighbours to
  // light. The slower figure is the one to budget with.
  var ADVANCE = 0.4;

  // Age bands as shares of a life, newest first, so all four lattices get
  // their turn however long a cell lives. Fixed generation counts meant that
  // changing LIFE silently dropped a colour off one end.
  var BANDS = [
    [0.16, 3], // D, vermilion
    [0.38, 2], // B, amber
    [0.68, 1], // C, green
    [1, 0] // A, light blue
  ];

  var canvas = document.createElement("canvas");
  canvas.id = "field";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  var ctx = canvas.getContext("2d");
  var cols = 0;
  var rows = 0;
  var age = null; // 0 = paper, otherwise generations lived so far
  var width = 0;
  var height = 0;
  var dark = false;
  var frame = null;
  var nextStep = 0;
  var dirty = true;
  var growing = 0; // generations of spreading left in the current patch
  var target = null; // grid box the current wave has still to cover

  var still = window.matchMedia("(prefers-reduced-motion: reduce)");
  var scheme = window.matchMedia("(prefers-color-scheme: dark)");

  // Chirpy writes data-bs-theme on <html> only once the visitor picks a mode;
  // before that the system preference is what applies.
  function readTheme() {
    var set = document.documentElement.getAttribute("data-bs-theme");
    dark = set ? set === "dark" : scheme.matches;
  }

  // The canvas is fixed, so the paper printed on it has to slide by the same
  // amount as the cells or the squares drift off their lines.
  function paper() {
    canvas.style.backgroundPositionY = -(window.scrollY % CELL) + "px";
  }

  function pageHeight() {
    return Math.max(document.documentElement.scrollHeight, window.innerHeight);
  }

  // Generations a click keeps spreading for: enough to carry the front from
  // where you clicked to the furthest corner of the viewport, and not one
  // more. Left alone it never runs out of fuel — every young cell gets six
  // chances at each of four neighbours — so this is the wall it stops at, and
  // it is measured off the screen rather than picked out of the air. Clicking
  // near an edge therefore runs longer than clicking in the middle, which is
  // what it takes for either to reach the same far corner.
  function sweep(x, y) {
    var dx = Math.max(x, width - x);
    var dy = Math.max(y, height - y);
    return Math.ceil(Math.sqrt(dx * dx + dy * dy) / CELL / ADVANCE);
  }

  // What the wave has to reach: the screen as it stands when you click, in
  // grid cells. The budget above is the backstop; this is what actually stops
  // it, so a front that runs slow still gets all the way out and one that
  // runs fast does not carry on into the dark past the edges.
  function screen() {
    var first = Math.floor(window.scrollY / CELL);
    return {
      x0: 0,
      x1: cols - 1,
      y0: first,
      y1: first + Math.ceil(height / CELL)
    };
  }

  function build() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);

    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cols = Math.ceil(width / CELL) + 1;
    rows = Math.ceil(pageHeight() / CELL) + 1;
    age = new Uint8Array(cols * rows);
    paper();
    dirty = true;
  }

  // The page gets taller as images load and sections reveal. Extend the grid
  // instead of rebuilding it: the rows are laid out top to bottom, so copying
  // the old array into a longer one leaves every living cell where it was.
  function fit() {
    var want = Math.ceil(pageHeight() / CELL) + 1;
    if (want <= rows) return;
    var next = new Uint8Array(cols * want);
    next.set(age);
    age = next;
    rows = want;
  }

  function light(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
    var i = cy * cols + cx;
    if (age[i] === 0) age[i] = 1;
  }

  // Seed a disc of cells, thinning towards the edge so the patch has a ragged
  // outline rather than looking stamped.
  function seed(x, y, radius, density) {
    fit();
    var cx = Math.round(x / CELL);
    var cy = Math.round(y / CELL);
    var r = Math.ceil(radius);
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > radius) continue;
        if (Math.random() > density * (1 - d / (radius + 1))) continue;
        light(cx + dx, cy + dy);
      }
    }
  }

  function generation() {
    var born = [];
    var x0 = cols;
    var x1 = -1;
    var y0 = rows;
    var y1 = -1;
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var i = y * cols + x;
        var a = age[i];
        if (a === 0) continue;
        if (a >= LIFE) {
          age[i] = 0;
          continue;
        }
        age[i] = a + 1;
        if (a > YOUNG || growing <= 0) continue;
        // Orthogonal neighbours only: diagonals make the growth look blobby
        // instead of gridded.
        if (x > 0 && age[i - 1] === 0 && Math.random() < SPREAD) born.push(i - 1);
        if (x < cols - 1 && age[i + 1] === 0 && Math.random() < SPREAD) born.push(i + 1);
        if (y > 0 && age[i - cols] === 0 && Math.random() < SPREAD) born.push(i - cols);
        if (y < rows - 1 && age[i + cols] === 0 && Math.random() < SPREAD) born.push(i + cols);
      }
    }
    for (var k = 0; k < born.length; k++) {
      var b = born[k];
      age[b] = 1;
      var bx = b % cols;
      var by = (b / cols) | 0;
      if (bx < x0) x0 = bx;
      if (bx > x1) x1 = bx;
      if (by < y0) y0 = by;
      if (by > y1) y1 = by;
    }

    if (growing > 0) {
      growing--;
      // The new cells are the front. Once its span has touched every edge of
      // the screen there is nothing left out there to sweep.
      if (
        target &&
        x1 >= 0 &&
        x0 <= target.x0 &&
        x1 >= target.x1 &&
        y0 <= target.y0 &&
        y1 >= target.y1
      ) {
        growing = 0;
      }
    }
    dirty = true;
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    var size = CELL - GAP;
    // Dark mode needs the squares to sit slightly back or they glare.
    var base = dark ? 0.85 : 1;
    var off = window.scrollY;
    var first = Math.max(0, Math.floor(off / CELL));
    var last = Math.min(rows, Math.ceil((off + height) / CELL) + 1);
    for (var y = first; y < last; y++) {
      for (var x = 0; x < cols; x++) {
        var a = age[y * cols + x];
        if (a === 0) continue;
        var band = 0;
        while (band < BANDS.length - 1 && a > BANDS[band][0] * LIFE) band++;
        var left = (LIFE - a) / (FADE * LIFE);
        ctx.globalAlpha = base * (left < 1 ? left : 1);
        ctx.fillStyle = COLORS[BANDS[band][1]];
        ctx.fillRect(x * CELL, y * CELL - off, size, size);
      }
    }
    ctx.globalAlpha = 1;
    dirty = false;
  }

  function tick(now) {
    if (now >= nextStep) {
      nextStep = now + STEP;
      generation();
    }
    if (dirty) draw();
    frame = window.requestAnimationFrame(tick);
  }

  function stop() {
    if (frame === null) return;
    window.cancelAnimationFrame(frame);
    frame = null;
  }

  function start() {
    if (frame !== null) return;
    nextStep = 0;
    frame = window.requestAnimationFrame(tick);
  }

  // Reduced motion gets one arrangement, drawn once and left alone.
  function drawStill() {
    growing = 12;
    target = null;
    var n = Math.ceil((7 * pageHeight()) / height);
    for (var i = 0; i < n; i++) {
      seed(Math.random() * width, Math.random() * pageHeight(), 3 + Math.random() * 5, 0.7);
    }
    for (var g = 0; g < 12; g++) generation();
    draw();
  }

  function render() {
    if (still.matches) {
      stop();
      drawStill();
      return;
    }
    start();
  }

  function reset() {
    readTheme();
    build();
    if (still.matches) drawStill();
  }

  readTheme();
  build();

  if (!still.matches) {
    // The canvas is pointer-events:none, so the window is what hears about it.
    window.addEventListener("pointerdown", function (e) {
      // Only the background answers. A click on a link, a card or the footer
      // game is aimed at that thing; a patch blooming out from under it reads
      // as the page misbehaving rather than as something you did.
      if (
        e.target &&
        e.target.closest &&
        e.target.closest("a, button, input, textarea, select, summary, label, .footer-blocks")
      ) {
        return;
      }
      growing = sweep(e.clientX, e.clientY);
      target = screen();
      seed(e.clientX, e.clientY + window.scrollY, BURST, 0.85);
    });
  }

  window.addEventListener(
    "scroll",
    function () {
      paper();
      dirty = true;
      if (still.matches) draw();
    },
    { passive: true }
  );

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else render();
  });

  render();

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(reset, 150);
  });

  new MutationObserver(function () {
    readTheme();
    dirty = true;
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-bs-theme"]
  });

  // addEventListener on MediaQueryList is unsupported on older Safari.
  if (scheme.addEventListener) {
    scheme.addEventListener("change", reset);
    still.addEventListener("change", render);
  }
})();
