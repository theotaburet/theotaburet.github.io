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
  // flood rather than a ripple. Both numbers are set by pace() below, which
  // keeps that 180px while changing how fast the front covers it.
  var SPAN = 26; // the life a front moving one pass a generation wants
  var LIFE = SPAN; // generations a cell lives before it goes back to paper
  var PUSH = 1; // spread passes per generation
  var SPREAD = 0.6; // chance a young cell lights an empty neighbour
  var YOUNG = 6; // only cells this new can spread, so growth stays a front
  var BURST = 7; // click seeding radius, in cells
  var FADE = 0.45; // share of a life spent fading out at the end of it
  // Cells per generation the front advances at: 0.68 in open ground, 0.43
  // once it is working along an edge, where a cell has fewer neighbours to
  // light. The slower figure is the one to budget with.
  var ADVANCE = 0.4;
  // A cell drawn by a pulse carries this bit on top of its age. The click is
  // the only thing allowed to spread: a shape lit while a click is still
  // growing would be picked up by the front and turned into a front of its own,
  // so a line going out of the well at the foot of the page came back up the
  // page as a second wave. Set above YOUNG by construction, so spread() passes
  // over it already; ageing and drawing take the bit back off.
  var DRAWN = 128;
  var AGE = 127;

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

  // The ceiling on how long a click keeps spreading, in generations: enough to
  // carry the front from where you clicked to the furthest corner of the page,
  // and not one more. Left alone it never runs out of fuel — every young cell
  // gets six chances at each of four neighbours — so this is the wall it stops
  // at. Normally it never gets here: the front runs out of page first, which
  // generation() sees as a pass that lights nothing. The page and not the
  // screen, because the pages here are two and three screens tall and a wave
  // that stopped at the bottom of the window stopped in the middle of the page.
  // ADVANCE is the slow figure on purpose, this being the backstop.
  function sweep(x, y) {
    var dx = Math.max(x, width - x);
    var dy = Math.max(y, pageHeight() - y);
    return Math.ceil(Math.sqrt(dx * dx + dy * dy) / CELL / ADVANCE / PUSH);
  }

  // How hard the front is pushed, from the size of what it has to cross. It
  // advances a fixed number of pixels a second, so the bigger the page the
  // longer it takes: a three-screen page at one pass a generation needs the
  // better part of a minute to reach the far corner, by which time it reads as
  // having died on the way out rather than as a wave. Extra passes a generation
  // buy that back, and the shorter life keeps the ring the same thickness in
  // pixels — only the speed changes, and only where it has to. 1700 is a
  // laptop screen's diagonal: a page that size lands on one pass, which is
  // where this started.
  function pace() {
    var h = pageHeight();
    var diagonal = Math.sqrt(width * width + h * h);
    PUSH = Math.max(1, Math.min(4, Math.round(diagonal / 1700)));
    LIFE = Math.round(SPAN / PUSH);
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

    pace();
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

  // Set while a pulse is drawing, so a shape does not have to remember to say
  // so: every shape below is still just an entry in SHAPES.
  var fixed = false;

  function light(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
    var i = cy * cols + cx;
    if (age[i] === 0) age[i] = fixed ? DRAWN + 1 : 1;
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

  // One pass of the front. Every young cell gets a chance at each of its empty
  // orthogonal neighbours — diagonals make the growth look blobby instead of
  // gridded. Returns how many cells were born, which is the only thing that
  // says whether the front still has anywhere to go.
  function spread() {
    var born = [];
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var i = y * cols + x;
        var a = age[i];
        if (a === 0 || a > YOUNG) continue; // DRAWN cells fall out here
        if (x > 0 && age[i - 1] === 0 && Math.random() < SPREAD) born.push(i - 1);
        if (x < cols - 1 && age[i + 1] === 0 && Math.random() < SPREAD) born.push(i + 1);
        if (y > 0 && age[i - cols] === 0 && Math.random() < SPREAD) born.push(i - cols);
        if (y < rows - 1 && age[i + cols] === 0 && Math.random() < SPREAD) born.push(i + cols);
      }
    }
    for (var k = 0; k < born.length; k++) age[born[k]] = 1;
    return born.length;
  }

  function generation() {
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var i = y * cols + x;
        var a = age[i];
        if (a === 0) continue;
        age[i] = (a & AGE) >= LIFE ? 0 : a + 1;
      }
    }

    if (growing > 0) {
      // Several passes on one beat rather than one pass on a faster beat: the
      // 70ms step is what makes this read as steps instead of a smear, and it
      // stays exactly where it was.
      var born = 0;
      for (var p = 0; p < PUSH; p++) born += spread();
      growing--;
      // The front stops when it has nowhere left to go, and nowhere left to go
      // is a generation that lit nothing. It needs no geometry and so it cannot
      // disagree with the shape the front actually has — every measurement of
      // that shape was wrong in its own way: a bounding box that spans the page
      // has only reached the middle of each side, and a radius assumes a circle,
      // which this is not once it is working along an edge. Births cannot be
      // wrong: the only empty cells a young cell can reach are outside what is
      // already lit, so while there is page left there are births.
      if (born === 0) growing = 0;
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
        var a = age[y * cols + x] & AGE;
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
      var y = e.clientY + window.scrollY;
      growing = sweep(e.clientX, y);
      seed(e.clientX, y, BURST, 0.85);
    });
  }

  // What the rest of the page can ask the field to draw. Every one of these
  // is lit all at once and then only ages, so it runs through the four
  // lattices and fades where it stands. Nothing spreads, including during a
  // click: whatever asked, a hover or a line going out, never turns into the
  // sweep this whole file is arranged to avoid. Adding a shape is an entry
  // here and nothing else.
  var SHAPES = {
    // The growth above is a texture and it cannot make a circle. A vibrating
    // thing radiates circles, so this one is drawn.
    ring: function (cx, cy, d) {
      var r = d.r || 4;
      // A step per cell of circumference, so the circle is as solid at
      // thirteen cells across as at three and never comes out dashed.
      var steps = Math.max(8, Math.round(2 * Math.PI * r));
      for (var i = 0; i < steps; i++) {
        var a = (i / steps) * 2 * Math.PI;
        light(cx + Math.round(Math.cos(a) * r), cy + Math.round(Math.sin(a) * r));
      }
    },
    // A row, for a line going out of the well at the foot of the page. It
    // lands in the page as the line it was: a circle there reads as something
    // popping at random rather than as the line that just went.
    line: function (cx, cy, d) {
      var half = Math.round((d.w || 100) / CELL / 2);
      for (var x = -half; x <= half; x++) light(cx + x, cy);
    },
    // Scattered cells, thinning outwards. Noise, which is the subject of the
    // page this one belongs to.
    grain: function (cx, cy, d) {
      var r = d.r || 5;
      var n = d.n || 12;
      for (var i = 0; i < n; i++) {
        var a = Math.random() * 2 * Math.PI;
        var t = Math.sqrt(Math.random()) * r;
        light(cx + Math.round(Math.cos(a) * t), cy + Math.round(Math.sin(a) * t));
      }
    }
  };

  // Something on the page asking the field to answer it: the pointer resting
  // on a project, or a line going out in the well at the foot of the page.
  window.addEventListener("field:pulse", function (e) {
    if (still.matches) return;
    var d = e.detail || {};
    fit();
    fixed = true;
    (SHAPES[d.shape] || SHAPES.ring)(
      Math.round(d.x / CELL),
      Math.round((d.y + window.scrollY) / CELL),
      d
    );
    fixed = false;
    dirty = true;
  });

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
