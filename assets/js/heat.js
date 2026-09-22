// Site-wide background: a heat field on the graph paper.
//
// Every cell of the grid holds a temperature between 0 and 1 and is painted
// in the colour of the band that temperature falls in. So whatever adds heat
// is drawn in the same four lattice colours, and whatever cools runs back down
// through them in order, D B C A, before it goes out.
//
// Three things add heat. The header carries a slow field of clouds that thins
// out raggedly below it. The pointer leaves a short trail. A press charges for
// as long as it is held and lets go as a ring: a tap is a ripple, two seconds
// is the whole screen.
//
// Same canvas id, same paper and the same field:pulse event as field.js, which
// this replaces in _includes/metadata-hook.html. Swap the script tag back to
// get the lattice growth again; the two never run together.
(function () {
  var COLORS = ["#a0d8ef", "#8db255", "#f8b862", "#d3381c"]; // A, C, B, D
  var HOT = "#884898"; // past D: the middle of the pointer, the first frames of a blast
  // Where each colour starts, coolest first. Under the first a cell is paper.
  var STEPS = [0.3, 0.46, 0.62, 0.78, 0.9];
  var CELL = 10; // grid pitch, CSS px. Matches the graph paper drawn in CSS.
  var GAP = 1; // leaves a hairline of paper showing between cells
  var BRUSH = 4.2; // the pointer's blob: sigma of a gaussian, in cells
  var IDLE = 1500; // ms a resting pointer keeps its blob
  var FULL = 2200; // ms of holding that make a full charge
  var COOL = 0.878; // what a cell keeps of its heat over one 60Hz frame
  var RING = 1500; // ms a ring lives
  var INTRO = 1600; // ms the header takes to scatter in
  var BAND = 0.3; // how far under the header the clouds stay whole, in screens
  var FADE = 0.35; // and how much further they take to thin out to nothing
  var EMBER = 0.82; // what a ring leaves behind it: D, held, then let go
  var BLOCK = 6; // px, the squares the headline is decoded in
  var READ = 1150; // ms the decode takes to cross the headline
  var LEAD = 0.16; // share of the headline that is noise ahead of the front
  var SKIP = "a, button, input, textarea, select, summary, label, .footer-blocks";

  var canvas = document.createElement("canvas");
  canvas.id = "field";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  var ctx = canvas.getContext("2d");
  var width = 0;
  var height = 0;
  var cols = 0;
  var rows = 0;
  var heat = null; // per cell of the PAGE: an ember stays in its square when the page scrolls
  var hold = null; // ms a cell is kept from cooling
  var gone = null; // ms a cell keeps its cloud out, blown away by a front
  var live = false; // any heat left anywhere
  var raf = 0;
  var now = 0; // the last frame's clock; events in between read it slightly stale
  var began = -1;
  var seed = Math.random() * 1000;
  var waves = [];
  var shake = 0;
  var jx = 0; // the jolt, in whole cells, so the field never leaves its grid
  var jy = 0;
  var pageH = 0; // the page height the arrays were sized for
  var press = null; // {x, y, t0} while the button is down
  var px = -1; // the pointer, and where its trail has got to
  var py = -1;
  var fx = -1;
  var fy = -1;
  var idle = IDLE;
  var foot = 0; // page y where the header ends; 0 on a page without one
  var safes = [];

  var lede = document.querySelector(".lede");
  var title = document.querySelector(".lede h1");
  var keepOut = document.querySelectorAll(".content > *");
  var still = window.matchMedia("(prefers-reduced-motion: reduce)");
  var scheme = window.matchMedia("(prefers-color-scheme: dark)");

  // Chirpy writes data-bs-theme on <html> only once the visitor picks a mode;
  // before that the system preference is what applies.
  function dark() {
    var set = document.documentElement.getAttribute("data-bs-theme");
    return set ? set === "dark" : scheme.matches;
  }

  // The canvas is fixed, so the paper printed on it has to slide by the same
  // amount as the cells or the squares drift off their lines.
  function paper() {
    canvas.style.backgroundPositionY = -(window.scrollY % CELL) + "px";
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
    pageH = Math.max(height, document.documentElement.scrollHeight);
    rows = Math.ceil(pageH / CELL) + 2;
    heat = new Float32Array(cols * rows);
    hold = new Float32Array(cols * rows);
    gone = new Float32Array(cols * rows);
    live = false;
    paper();
  }

  // The usual one-line shader hash: the same cell always gets the same number,
  // which is what keeps a ragged edge from boiling.
  function hash(c, r) {
    var n = Math.sin(c * 127.1 + r * 311.7 + seed * 0.13) * 43758.5453;
    return n - Math.floor(n);
  }

  // The header's weather, 0 to 1: a few sines bent through each other, slow
  // enough that a band drifts a few cells in a second.
  function cloud(nx, ny, s) {
    var wx = nx + Math.sin(ny * 4.6 + s * 0.45 + seed) * 0.06;
    var wy = ny + Math.cos(nx * 5.3 - s * 0.35) * 0.06;
    var v =
      Math.sin(wx * 5.9 + seed * 1.3 + s * 0.28) * Math.cos(wy * 4.4 - seed * 0.7 + s * 0.2) +
      Math.sin((wx * 1.5 + wy * 1.8) * 3.9 - seed + s * 0.15) +
      Math.sin(wy * 8.6 + wx * 2.8 + seed * 2.1) * 0.5;
    return 0.5 + 0.2 * v;
  }

  // Much lower frequency. Under the header the clouds only survive on the
  // high ground of this, so they go out in patches instead of as loose cells.
  function patch(nx, ny, s) {
    return 0.5 + 0.5 * Math.sin(nx * 2.2 + s * 0.11 + seed * 0.7) * Math.cos(ny * 1.9 - s * 0.08 + seed * 0.3);
  }

  // A gaussian of heat at a point of the screen, laid on the page under it.
  // Everything round on this page is one of these: the pointer, the charge,
  // the flash.
  function stamp(x, y, amount, sigma) {
    var cx = x / CELL;
    var cy = (y + window.scrollY) / CELL;
    var reach = Math.ceil(sigma * 2.6);
    var inv = 1 / (2 * sigma * sigma);
    var r0 = Math.max(0, Math.floor(cy - reach));
    var r1 = Math.min(rows - 1, Math.ceil(cy + reach));
    var c0 = Math.max(0, Math.floor(cx - reach));
    var c1 = Math.min(cols - 1, Math.ceil(cx + reach));
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        var dx = c + 0.5 - cx;
        var dy = r + 0.5 - cy;
        var g = amount * Math.exp(-(dx * dx + dy * dy) * inv);
        if (g < 0.02) continue;
        var i = r * cols + c;
        heat[i] = Math.min(1, heat[i] + g);
      }
    }
    live = true;
  }

  // Stamped along the path rather than at its end, so a fast flick is a
  // stroke and not two dots. Half the size once it is over the text.
  function follow(dt) {
    if (fx < 0) {
      fx = px;
      fy = py;
    }
    var dx = px - fx;
    var dy = py - fy;
    var n = Math.max(1, Math.min(48, Math.round(Math.sqrt(dx * dx + dy * dy) / (CELL * 0.8))));
    var size = py + window.scrollY > foot ? BRUSH / 2 : BRUSH;
    for (var k = 1; k <= n; k++) {
      stamp(fx + (dx * k) / n, fy + (dy * k) / n, (0.16 * dt) / 16.7, size);
    }
    fx = px;
    fy = py;
  }

  // Time is stamped by the first frame that sees the ring, not by the event
  // that asked for it: the loop sleeps when the page is quiet, and an event
  // that arrives then would be reading a clock that stopped a minute ago.
  function ring(x, y, power) {
    waves.push({ x: x, y: y + window.scrollY, power: power, t0: -1, R: 0 });
  }

  // Rings are not objects moving through the field, they are heat like
  // everything else: each frame the ring writes itself where it has got to and
  // the cooling erases where it was. Under the header it leaves embers, held
  // for a moment each and let go one by one, so the page keeps the shape of
  // the blast after the blast has left. How many depends on how strong the
  // ring still is: a tap leaves a dither that is gone a hand's width out, a
  // full charge leaves the screen solid. They are laid over everything the
  // ring crossed since the last frame and not just where it stands now, or a
  // slow frame leaves dark hoops where the ring was never seen.
  function ripple() {
    var speed = (Math.sqrt(width * width + height * height) * 1.7) / 1000; // px a ms
    for (var k = waves.length - 1; k >= 0; k--) {
      var w = waves[k];
      if (w.t0 < 0) w.t0 = now;
      var t = (now - w.t0) / RING;
      if (t >= 1) {
        waves.splice(k, 1);
        continue;
      }
      var R = (now - w.t0) * speed;
      var thick = CELL * 5.5 * w.power;
      var amp = (1 - t) * 1.2 * w.power;
      var inv = 1 / (2 * thick * thick);
      var odds = amp * amp * 1.2 - 0.1; // a tap: one cell in ten. Half a second: most of them
      // Only the rows the ring can reach: the page is several screens tall.
      var r0 = Math.max(0, Math.floor((w.y - R - 3 * thick) / CELL));
      var r1 = Math.min(rows - 1, Math.ceil((w.y + R + 3 * thick) / CELL));
      for (var r = r0; r <= r1; r++) {
        var dy = (r + 0.5) * CELL - w.y;
        for (var c = 0; c < cols; c++) {
          var dx = (c + 0.5) * CELL - w.x;
          var d = Math.sqrt(dx * dx + dy * dy);
          var i = r * cols + c;
          var swept = d > w.R - thick && d < R + thick;
          // What the front runs over is blown out of the clouds for a while.
          if (swept && amp > 0.2) gone[i] = 300 + hash(c + 2.2, r + 7.7) * 1200;
          if (
            swept &&
            hold[i] <= 0 &&
            (r + 0.5) * CELL > foot &&
            hash(c + 0.5, r + 0.5) < odds
          ) {
            hold[i] = 350 + hash(c, r) * 1650;
            if (heat[i] < EMBER) heat[i] = EMBER;
          }
          var off = d - R;
          if (off > 3 * thick || off < -3 * thick) continue;
          var g = amp * Math.exp(-off * off * inv);
          if (g > heat[i]) heat[i] = g > 1 ? 1 : g;
        }
      }
      w.R = R;
      live = true;
    }
  }

  function cool(dt) {
    var keep = Math.pow(COOL, dt / 16.7);
    live = false;
    for (var i = 0; i < heat.length; i++) {
      if (gone[i] > 0) {
        gone[i] -= dt;
        live = true;
      }
      if (hold[i] > 0) {
        // Held at D, not at whatever it was: an ember caught in the flash
        // would otherwise keep the flash up for two seconds.
        hold[i] -= dt;
        if (heat[i] > EMBER) heat[i] = Math.max(EMBER, heat[i] * keep);
        live = true;
      } else if (heat[i] > 0) {
        heat[i] *= keep;
        if (heat[i] < 0.003) heat[i] = 0;
        else live = true;
      }
    }
  }

  // The ground jumps by whole squares and the paper stays put, so a blast
  // never knocks a cell off its grid. The page in front of it stays put too:
  // text that jumps is a fault, the ground under it jumping is a blast.
  function tremble(dt) {
    if (shake > 0.01) {
      shake *= Math.pow(0.9, dt / 16.7);
      jx = Math.round((Math.random() - 0.5) * shake * 3);
      jy = Math.round((Math.random() - 0.5) * shake * 3);
    } else {
      shake = jx = jy = 0;
    }
  }

  // The header is an opaque band and the text starts right under it, so the
  // clouds live where the first paragraphs are. Every block of copy keeps them
  // out from under it and they fill what is left: the gutter, the gaps. The
  // edge is decided cell by cell, so a clearing is torn out of the field, not
  // cut. Only the clouds step aside. A click or the pointer is over in a
  // second and goes wherever it lands, text or not.
  function measure() {
    var box = lede && lede.getBoundingClientRect();
    foot = box && box.height ? box.bottom + window.scrollY : 0;
    safes = [];
    for (var k = 0; k < keepOut.length; k++) {
      var b = keepOut[k].getBoundingClientRect();
      if (b.height && b.bottom > 0 && b.top < height) safes.push([b.left - 14, b.top - 10, b.right + 14, b.bottom + 10]);
    }
  }

  function safe(x, y, c, r) {
    var fuzz = CELL * 2.4;
    for (var k = 0; k < safes.length; k++) {
      var s = safes[k];
      if (x >= s[0] && x <= s[2] && y >= s[1] && y <= s[3]) return true;
      if (x >= s[0] - fuzz && x <= s[2] + fuzz && y >= s[1] - fuzz && y <= s[3] + fuzz && hash(c + 9.1, r + 4.7) < 0.55) {
        return true;
      }
    }
    return false;
  }

  function overhead() {
    return foot > 0 && foot + height * (BAND + FADE * 1.5) > window.scrollY;
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(jx * CELL, jy * CELL);
    // Dark mode needs the squares to sit slightly back or they glare.
    ctx.globalAlpha = dark() ? 0.85 : 1;
    var size = CELL - GAP;
    var sy = window.scrollY;
    var s = now / 1000;
    var intro = began < 0 ? 1 : (now - began) / INTRO;
    var weather = overhead();
    var first = Math.floor(sy / CELL);
    var last = Math.floor((sy + height) / CELL) + 1;
    // Rows are the page's, heat and clouds both, so everything scrolls with
    // the paper it was drawn on.
    for (var r = first; r <= last; r++) {
      var y = r * CELL - sy;
      var ny = (r * CELL) / height;
      var deep = ((r * CELL - foot) / height - BAND) / FADE; // past 1.2 no cloud survives
      for (var c = 0; c < cols; c++) {
        var i = r < rows ? r * cols + c : -1;
        var v = i < 0 ? 0 : heat[i];
        if (weather && deep < 1.2 && (i < 0 || gone[i] <= 0)) {
          // How far past the header this cell is, 0 to 1, with the line it is
          // measured from pushed up and down in blocks so the edge is ragged.
          var rag = hash((c >> 1) + 3.3, r >> 2) * 0.6 + 0.2 * Math.sin(c * 0.4 + seed);
          var thin = deep + rag * 0.5;
          var nx = (c * CELL) / width;
          if (
            patch(nx, ny, s) > thin &&
            hash(c * 1.7 + 11.3, r * 1.3 + 5.1) < intro &&
            !safe(c * CELL + CELL / 2, y + CELL / 2, c, r)
          ) {
            v += cloud(nx, ny, s) + (hash(c, r) - 0.5) * 0.12;
          }
        }
        if (v < STEPS[0]) continue;
        var band = 0;
        while (band < 4 && v >= STEPS[band + 1]) band++;
        ctx.fillStyle = band === 4 ? HOT : COLORS[band];
        ctx.fillRect(c * CELL, y, size, size);
      }
    }
    ctx.restore();
  }

  // The headline comes out of noise left to right, the way a payload does.
  // The text is the real <h1> the whole time: what moves is a mask over it,
  // solid behind the front and a flicker of blocks just ahead of it.
  var mask = null;
  var reading = -1; // ms into the decode, -1 when there is none

  function decode(dt) {
    var box = title.getBoundingClientRect();
    if (!box.height) {
      reading = -1;
      return;
    }
    if (!mask) {
      mask = document.createElement("canvas");
      title.style.webkitMaskSize = title.style.maskSize = "100% 100%";
      title.style.webkitMaskRepeat = title.style.maskRepeat = "no-repeat";
    }
    reading += dt;
    var p = (reading / READ) * (1 + LEAD);
    if (p >= 1 + LEAD) {
      title.style.webkitMaskImage = title.style.maskImage = "";
      reading = -1;
      return;
    }
    mask.width = Math.ceil(box.width);
    mask.height = Math.ceil(box.height);
    var m = mask.getContext("2d");
    var n = Math.ceil(mask.width / BLOCK);
    var deep = Math.ceil(mask.height / BLOCK);
    var tick = Math.floor(reading / 60); // the noise is redrawn at 16Hz, not 60: it should chatter, not fizz
    for (var c = 0; c < n; c++) {
      var ahead = c / n - (p - LEAD);
      if (ahead <= 0) {
        m.fillRect(c * BLOCK, 0, BLOCK, mask.height);
      } else if (ahead < LEAD) {
        var odds = 0.25 + 0.75 * (1 - ahead / LEAD);
        for (var r = 0; r < deep; r++) {
          if (hash(c + tick * 3.1, r + tick * 1.7) < odds) m.fillRect(c * BLOCK, r * BLOCK, BLOCK, BLOCK);
        }
      }
    }
    title.style.webkitMaskImage = title.style.maskImage = "url(" + mask.toDataURL() + ")";
  }

  function frame(t) {
    raf = 0;
    var dt = Math.min(t - now, 50); // a loop coming back from sleep is one long frame, not a jump
    now = t;
    if (began < 0) began = t;
    if (document.documentElement.scrollHeight > pageH) build();
    measure();
    cool(dt);
    if (idle < IDLE) {
      idle += dt;
      follow(dt);
    }
    if (press) {
      if (press.t0 < 0) press.t0 = t;
      var ch = Math.min((t - press.t0) / FULL, 1);
      stamp(press.x, press.y, ((0.45 + ch * 0.5) * dt) / 16.7, 8.5 + ch * 34);
      shake = Math.max(shake, 0.12 + ch * 0.35);
    }
    ripple();
    tremble(dt);
    draw();
    if (reading >= 0) decode(dt);
    if (live || press || waves.length || shake || reading >= 0 || overhead()) wake();
  }

  function wake() {
    if (!raf && !still.matches) raf = window.requestAnimationFrame(frame);
  }

  // Letting go is the click. How long it was held is the only thing that sets
  // how big it is: the ring, the flash under it and the shake all come off the
  // same number.
  function release() {
    if (!press) return;
    var ch = press.t0 < 0 ? 0 : Math.min((now - press.t0) / FULL, 1);
    ring(press.x, press.y, 0.35 + ch * 2.1);
    stamp(press.x, press.y, 1, 10.5 + ch * 77);
    shake = 0.45 + ch * 1.9;
    press = null;
    if (title) {
      var box = title.getBoundingClientRect();
      if (box.bottom > 0 && box.top < height) reading = 0;
    }
    wake();
  }

  function aimed(e) {
    return e.target && e.target.closest && e.target.closest(SKIP);
  }

  build();
  measure();

  if (still.matches) {
    // Reduced motion gets the header's weather as a still, and nothing else.
    draw();
  } else {
    if (title) {
      // Masked before the first frame, or the headline shows whole for an
      // instant and then vanishes to be decoded.
      reading = 0;
      decode(0);
    }
    wake();

    // The canvas is pointer-events:none, so the window is what hears about it.
    window.addEventListener("pointerdown", function (e) {
      // Only the background answers. A click on a link, a card or the footer
      // game is aimed at that thing.
      // Primary button only: a right click opens a menu that swallows the
      // pointerup, and the charge would never be let go.
      if (e.button || aimed(e)) return;
      press = { x: e.clientX, y: e.clientY, t0: -1 };
      wake();
    });
    window.addEventListener("pointerup", release);
    // A touch that turns into a scroll is cancelled, not lifted, and a ring
    // for every scroll would be the page misbehaving.
    function drop() {
      press = null;
    }
    window.addEventListener("pointercancel", drop);
    window.addEventListener("blur", drop); // so is a press the window lost sight of
    window.addEventListener("dblclick", function (e) {
      if (aimed(e)) return;
      ring(e.clientX, e.clientY, 2.8);
      stamp(e.clientX, e.clientY, 1, 90);
      shake = 2.4;
      wake();
    });
    window.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return; // a finger has no resting place to draw
      px = e.clientX;
      py = e.clientY;
      idle = 0;
      wake();
    });
    document.addEventListener("pointerleave", function () {
      idle = IDLE;
      fx = -1;
    });
  }

  // What the rest of the page can ask the field to draw: the pointer resting
  // on a project, or a line going out of the well at the foot of the page.
  // Each shape is lit at D, held a moment so it reads as a shape, and cools.
  function mark(c, r) {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    var i = r * cols + c;
    if (heat[i] < EMBER) heat[i] = EMBER;
    hold[i] = 350;
  }

  var SHAPES = {
    ring: function (cx, cy, d) {
      var r = d.r || 4;
      var steps = Math.max(8, Math.round(2 * Math.PI * r));
      for (var i = 0; i < steps; i++) {
        var a = (i / steps) * 2 * Math.PI;
        mark(cx + Math.round(Math.cos(a) * r), cy + Math.round(Math.sin(a) * r));
      }
    },
    line: function (cx, cy, d) {
      var half = Math.round((d.w || 100) / CELL / 2);
      for (var x = -half; x <= half; x++) mark(cx + x, cy);
    },
    grain: function (cx, cy, d) {
      var r = d.r || 5;
      var n = d.n || 12;
      for (var i = 0; i < n; i++) {
        var a = Math.random() * 2 * Math.PI;
        var t = Math.sqrt(Math.random()) * r;
        mark(cx + Math.round(Math.cos(a) * t), cy + Math.round(Math.sin(a) * t));
      }
    }
  };

  window.addEventListener("field:pulse", function (e) {
    if (still.matches) return;
    var d = e.detail || {};
    (SHAPES[d.shape] || SHAPES.ring)(Math.round(d.x / CELL), Math.round((d.y + window.scrollY) / CELL), d);
    live = true;
    wake();
  });

  window.addEventListener(
    "scroll",
    function () {
      paper();
      if (still.matches) {
        measure();
        draw();
      } else wake();
    },
    { passive: true }
  );

  window.addEventListener("resize", function () {
    build();
    if (still.matches) {
      measure();
      draw();
    } else wake();
  });
})();
