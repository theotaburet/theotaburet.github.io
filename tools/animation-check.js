// Headless check for the two canvas animations, which are otherwise only
// observable by watching the page for a few minutes.
//
//   node tools/animation-check.js
//
// Both scripts are run for real against a stub DOM and a fake clock. Nothing
// reaches inside them: the footer game is judged by what it draws (a
// completed line is drawn with its gaps closed, so those frames are the
// clears) and the field by how far its cells spread from one click.
var fs = require("fs");
var vm = require("vm");
var path = require("path");

var JS_DIR = path.join(__dirname, "..", "assets", "js");
var failures = [];

// The page the well is measured against: everything the sidebar leaves.
function host() {
  return {
    appendChild: function () {},
    querySelector: function () { return null; },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 1440 }; }
  };
}

function stub(extra, view) {
  var frames = [];
  var handlers = {};
  var sent = []; // events the script fired at the rest of the page
  var win = {
    innerWidth: (view && view.w) || 1440,
    innerHeight: (view && view.h) || 900,
    devicePixelRatio: 1,
    scrollY: 0,
    matchMedia: function () {
      return { matches: false, addEventListener: function () {} };
    },
    requestAnimationFrame: function (fn) {
      frames.push(fn);
      return frames.length;
    },
    cancelAnimationFrame: function () {},
    addEventListener: function (type, fn) {
      (handlers[type] = handlers[type] || []).push(fn);
    },
    dispatchEvent: function (e) {
      sent.push(e);
      (handlers[e.type] || []).forEach(function (fn) { fn(e); });
      return true;
    },
    clearTimeout: function () {},
    setTimeout: function () {}
  };
  var doc = {
    hidden: false,
    body: { appendChild: function () {} },
    documentElement: {
      scrollHeight: 4000,
      getAttribute: function () { return null; },
      classList: { add: function () {}, remove: function () {}, toggle: function () {} }
    },
    createElement: function () { return extra.canvas; },
    getElementById: function () { return host(); },
    // The well hangs on the content column and measures itself against
    // #main-wrapper, so both lookups have to answer.
    querySelector: function () { return host(); },
    querySelectorAll: function () { return []; },
    addEventListener: function () {}
  };
  var box = {
    window: win,
    document: doc,
    console: console,
    CustomEvent: function (type, init) {
      this.type = type;
      this.detail = init && init.detail;
    },
    MutationObserver: function () { return { observe: function () {} }; }
  };
  box.globalThis = box;
  vm.createContext(box);
  return { box: box, frames: frames, handlers: handlers, sent: sent };
}

function report(name, ok, detail) {
  console.log((ok ? "  ok   " : "  FAIL ") + name + " — " + detail);
  if (!ok) failures.push(name);
}

/* -- the footer well ------------------------------------------------------ */
(function () {
  console.log("footer well (assets/js/site.js)");
  var flashing = false;
  var ctx = {
    globalAlpha: 1,
    fillStyle: "",
    setTransform: function () {},
    save: function () {},
    restore: function () {},
    translate: function () {},
    clearRect: function () { flashing = false; },
    // A cleared line is the only thing drawn at the full 10px pitch; the
    // stack itself leaves a 1px gap.
    fillRect: function (x, y, w, h) { if (h === 10) flashing = true; }
  };
  var canvas = {
    className: "", width: 0, height: 0, style: {},
    setAttribute: function () {},
    addEventListener: function () {},
    getContext: function () { return ctx; },
    // 260px in from the left, part way down a long page: neither offset is a
    // whole number of cells, which is the case the alignment shift is for.
    getBoundingClientRect: function () { return { left: 263, top: 3814 }; }
  };
  var s = stub({ canvas: canvas });
  vm.runInContext(fs.readFileSync(path.join(JS_DIR, "site.js"), "utf8"), s.box);

  var now = 0;
  var clears = 0;
  var was = false;
  for (var i = 0; i < 36000 && s.frames.length; i++) { // 10 minutes at 60fps
    var fn = s.frames.shift();
    now += 16.7;
    fn(now);
    if (flashing && !was) clears++;
    was = flashing;
  }
  var perMin = clears / (now / 60000);
  report("lines clear", clears > 20, clears + " in " + (now / 60000).toFixed(0) +
    " min (" + perMin.toFixed(1) + "/min)");
  report("still playing at the end", s.frames.length > 0, "loop alive");

  // A line going out is the one thing that happens down there, so it says so
  // to the rest of the page rather than just blinking off.
  var sent = s.sent.filter(function (e) {
    return e.type === "field:pulse" && e.detail.shape === "line";
  });
  // A clear stays lit for a moment before it collapses, so the run can end
  // with one still in the air.
  report("a cleared line goes into the page", sent.length >= clears - 1,
    sent.length + " rows sent for " + clears + " clears");
})();

/* -- the background field ------------------------------------------------- */

// One field, wired to a stub canvas that reports what it draws and nothing
// else: how many cells are lit and how far they reach.
function field(VW, VH, scroll, file) {
  var live = 0;
  var minX = 1e9;
  var maxX = -1e9;
  var minY = 1e9;
  var maxY = -1e9;
  // The four corners of the viewport, and whether a cell has ever landed on
  // one. Covering the screen means the corners: a round front whose bounding
  // box spans the viewport has only reached the middle of each side, so a box
  // test here would agree with the bug instead of catching it.
  var corners = [[0, 0], [VW - 10, 0], [0, VH - 10], [VW - 10, VH - 10]];
  var hit = [false, false, false, false];
  var cells = []; // every cell of the last frame, for measuring one band of it
  var jolts = 0; // frames the field was drawn shifted
  var offGrid = 0; // ...by something other than whole cells
  var ctx = {
    globalAlpha: 1,
    fillStyle: "",
    setTransform: function () {},
    save: function () {},
    restore: function () {},
    translate: function (x, y) {
      if (x || y) jolts++;
      if (x % 10 || y % 10) offGrid++;
    },
    clearRect: function () {
      live = 0; minX = 1e9; maxX = -1e9; minY = 1e9; maxY = -1e9; cells = [];
    },
    fillRect: function (x, y) {
      live++;
      cells.push(y);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (var c = 0; c < 4; c++) {
        if (Math.abs(x - corners[c][0]) <= 25 && Math.abs(y - corners[c][1]) <= 25) {
          hit[c] = true;
        }
      }
    }
  };
  var canvas = {
    id: "", style: {}, width: 0, height: 0,
    setAttribute: function () {},
    addEventListener: function () {},
    getContext: function () { return ctx; }
  };
  var s = stub({ canvas: canvas }, { w: VW, h: VH });
  s.box.window.scrollY = scroll || 0;
  vm.runInContext(fs.readFileSync(path.join(JS_DIR, file || "field.js"), "utf8"), s.box);

  var now = 0;
  return {
    run: function (ms) {
      var until = now + ms;
      while (now < until && s.frames.length) {
        var fn = s.frames.shift();
        now += 16.7;
        fn(now);
      }
    },
    fire: function (type, e) {
      (s.handlers[type] || []).forEach(function (fn) { fn(e); });
    },
    seen: function () {
      return { live: live, minX: minX, maxX: maxX, minY: minY, maxY: maxY, jolts: jolts, offGrid: offGrid };
    },
    corners: function () {
      return hit.filter(Boolean).length;
    },
    scroll: function (y) { s.box.window.scrollY = y; },
    // How deep the lit cells run inside one horizontal band of the screen.
    // A band the click's front has not reached yet holds only what was drawn
    // into it, so this measures that shape and nothing else.
    band: function (y0, y1) {
      var ys = cells.filter(function (y) { return y >= y0 && y <= y1; });
      if (!ys.length) return 0;
      return Math.max.apply(null, ys) - Math.min.apply(null, ys) + 10;
    },
    at: function () { return now; }
  };
}

(function () {
  console.log("background field (assets/js/field.js)");

  // A click has to reach every corner of the PAGE, not of the window. The
  // pages on this site are two and three screens tall, and a wave budgeted
  // against the window stopped a third of the way down with the rest of the
  // page untouched. The canvas only ever paints the rows in front of you, so
  // the page is checked a screenful at a time: one click in the middle of the
  // document, seen from the top of it, from the middle, and from the foot —
  // which is what you do, click and then scroll.
  var PAGE = 4000; // what the stub's document is tall
  var CLICK = 2000; // where the click lands, in page coordinates

  // You click where you are looking and then you scroll, so that is the shape
  // of the test: the window sits over the click for it, and moves to the
  // vantage afterwards. Parking it at the vantage from the start hides the
  // thing being tested — the wave used to stop at the corners of whatever
  // screen you clicked on, which from the destination looks like success.
  function clicked(VW, VH, at) {
    var here = Math.round((PAGE - VH) / 2); // the screen the click happens on
    var f = field(VW, VH, here);
    f.run(200);
    var quiet = f.seen().live;
    f.fire("pointerdown", { clientX: VW / 2, clientY: CLICK - here, target: null });
    f.scroll(at);
    var covered = null;
    var over = null;
    for (var t = 0; t < 5400; t++) { // 90 seconds
      f.run(16.7);
      if (covered === null && f.corners() === 4) covered = f.at();
      if (covered !== null && over === null && f.seen().live === 0) over = f.at();
    }
    return { quiet: quiet, covered: covered, over: over, got: f.corners(), f: f };
  }

  var foot = null;
  [
    ["top of the page", 1440, 900, 0],
    ["middle of the page", 1440, 900, Math.round((PAGE - 900) / 2)],
    ["foot of the page", 1440, 900, PAGE - 900],
    ["foot of a 2560 screen", 2560, 1318, PAGE - 1318]
  ].forEach(function (spot) {
    var r = clicked(spot[1], spot[2], spot[3]);
    if (spot[0] === "top of the page") {
      report("still until clicked", r.quiet === 0, r.quiet + " cells before the click");
    }
    report("the wave reaches both corners at the " + spot[0],
      r.covered !== null && r.covered < 20000,
      r.covered === null
        ? "ONLY " + r.got + " of 4 corners ever lit"
        : "in " + (r.covered / 1000).toFixed(1) + "s");
    if (spot[0] === "foot of the page") foot = r;
  });

  // The foot is the last place it gets to, so it is where the end is visible.
  report("and then the page goes back to paper", foot.over !== null,
    foot.over === null
      ? "STILL ALIVE after 90s"
      : "quiet again " + ((foot.over - foot.covered) / 1000).toFixed(1) + "s after it arrived");

  // Pulses are drawn rather than grown, because the spreading above cannot
  // make any of these shapes. Each is checked by what it covers, which is the
  // only thing that tells a ring from the patch it must not be.
  // A field of its own each time: they last a second and a half, so a shape
  // measured on top of the one before it is measuring both.
  function drawn(detail) {
    var f = field(1440, 900);
    f.run(200);
    f.fire("field:pulse", { detail: detail });
    f.run(100);
    var v = f.seen();
    return {
      field: f,
      live: v.live,
      w: v.maxX - v.minX + 10,
      h: v.maxY - v.minY + 10
    };
  }

  // Ten cells of radius is a ring of about sixty cells; the disc it must not
  // be is over three hundred.
  var r = drawn({ x: 720, y: 450, r: 10 });
  report("a ring is a ring, not a patch", r.live > 40 && r.live < 110,
    r.live + " cells lit; a filled disc would be about 310");
  report("and it is round", Math.abs(r.w - 210) < 25 && Math.abs(r.h - 210) < 25,
    r.w + "x" + r.h + "px across");

  // A cleared line has to land as the line it was. One row deep is the whole
  // point: at two it stops reading as a line and starts reading as a smear.
  var l = drawn({ shape: "line", x: 400, y: 700, w: 600 });
  report("a cleared line lands as a line", l.h === 10 && Math.abs(l.w - 610) < 20,
    l.w + "px across and " + l.h + "px deep");

  // Grain is scattered, so it must not fill its own circle.
  var g = drawn({ shape: "grain", x: 1000, y: 200, r: 6, n: 10 });
  report("grain scatters", g.live > 3 && g.live <= 10 && g.w <= 130 && g.h <= 130,
    g.live + " cells inside " + g.w + "x" + g.h + "px");

  // The one that matters, and the one the check above cannot see: a pulse fired
  // while a click is still growing. Spreading is a property of the grid, not of
  // what put a cell there, so a line dropped in by the well used to be picked up
  // by the front and sent back up the page as a wave of its own.
  var c = field(1440, 900);
  c.run(200);
  c.fire("pointerdown", { clientX: 720, clientY: 150, target: null });
  c.fire("field:pulse", { detail: { shape: "line", x: 720, y: 860, w: 1200 } });
  // Short, and measured well clear of the click: the front covers about 300px
  // a second, so anything longer is measuring the wave arriving instead.
  c.run(400);
  var deep = c.band(700, 900);
  report("a pulse caught in a click stays a pulse", deep > 0 && deep <= 30,
    deep === 0 ? "the line never landed" : deep + "px deep, drawn as 10");

  var over = null;
  for (var p = 0; p < 1800; p++) { // 30 seconds
    g.field.run(16.7);
    if (g.field.seen().live === 0 && over === null && p > 30) over = g.field.at();
  }
  report("pulses die where they stand", over !== null,
    over === null ? "STILL ALIVE" : "gone, and nothing spread");
})();

/* -- the heat field -------------------------------------------------------- */
(function () {
  console.log("heat field (assets/js/heat.js)");

  // The whole click is one number, how long it was held. Seen a moment after
  // letting go, a tap has to be a patch and a full charge most of the screen;
  // and once everything has cooled the screen has to be paper again, because
  // that is also when the loop is allowed to go to sleep.
  function held(ms) {
    var f = field(1440, 900, 0, "heat.js");
    f.run(100);
    f.fire("pointerdown", { clientX: 720, clientY: 450, button: 0, target: null });
    f.run(ms);
    f.fire("pointerup", {});
    f.run(60);
    var lit = f.seen().live;
    f.run(6000);
    var v = f.seen();
    return { lit: lit, left: v.live, jolts: v.jolts, offGrid: v.offGrid };
  }

  var tap = held(50);
  var full = held(2200);
  var screen = 145 * 92;
  report("a tap is a patch", tap.lit > 100 && tap.lit < screen * 0.2, tap.lit + " of " + screen + " cells");
  report("a full charge is the screen", full.lit > screen * 0.8, full.lit + " of " + screen + " cells");
  report("a blast shakes the ground by whole cells", full.jolts > 0 && full.offGrid === 0, full.jolts + " jolts, " + full.offGrid + " off the grid");
  report("both cool back to paper", tap.left === 0 && full.left === 0, tap.left + " and " + full.left + " cells left");

  // A right click never gets its pointerup; it must not start a charge.
  var f = field(1440, 900, 0, "heat.js");
  f.run(100);
  f.fire("pointerdown", { clientX: 720, clientY: 450, button: 2, target: null });
  f.run(3000);
  report("a right click charges nothing", f.seen().live === 0, f.seen().live + " cells");

  // Embers belong to the page, not the window: scroll, and they go with the paper.
  var g = field(1440, 900, 0, "heat.js");
  g.run(100);
  g.fire("field:pulse", { detail: { shape: "line", x: 720, y: 450, w: 100 } });
  g.run(17);
  var before = g.seen().minY;
  g.scroll(300);
  g.run(17);
  report("an ember scrolls with the page", before === 450 && g.seen().minY === 150, before + "px, then " + g.seen().minY + "px after scrolling 300px");
})();

if (failures.length) {
  console.error("\n" + failures.length + " failed: " + failures.join(", "));
  process.exit(1);
}
console.log("\nall good");
