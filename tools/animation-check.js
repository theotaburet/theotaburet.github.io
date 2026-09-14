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

function stub(extra) {
  var frames = [];
  var handlers = {};
  var win = {
    innerWidth: 1440,
    innerHeight: 900,
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
    getElementById: function () {
      return { appendChild: function () {}, clientWidth: 1180 };
    },
    querySelectorAll: function () { return []; },
    addEventListener: function () {}
  };
  var box = {
    window: win,
    document: doc,
    console: console,
    MutationObserver: function () { return { observe: function () {} }; }
  };
  box.globalThis = box;
  vm.createContext(box);
  return { box: box, frames: frames, handlers: handlers };
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
})();

/* -- the background field ------------------------------------------------- */
(function () {
  console.log("background field (assets/js/field.js)");
  var live = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  var VW = 1440, VH = 900; // the stub viewport the wave has to cover
  var ctx = {
    globalAlpha: 1,
    fillStyle: "",
    setTransform: function () {},
    clearRect: function () {
      live = 0; minX = 1e9; maxX = -1e9; minY = 1e9; maxY = -1e9;
    },
    fillRect: function (x, y) {
      live++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  };
  var canvas = {
    id: "", style: {}, width: 0, height: 0,
    setAttribute: function () {},
    addEventListener: function () {},
    getContext: function () { return ctx; }
  };
  var s = stub({ canvas: canvas });
  vm.runInContext(fs.readFileSync(path.join(JS_DIR, "field.js"), "utf8"), s.box);

  var now = 0;
  function run(ms) {
    var until = now + ms;
    while (now < until && s.frames.length) {
      var fn = s.frames.shift();
      now += 16.7;
      fn(now);
    }
  }
  run(200);
  var quiet = live;
  // Dead centre of the 1440x900 stub viewport: the wave should reach its edges.
  s.handlers.pointerdown.forEach(function (fn) {
    fn({ clientX: 720, clientY: 450, target: null });
  });

  // The far edge the front reaches, not the span between its edges: the
  // middle of the wave dies as it expands, so the span understates it.
  var farX = -1, farY = -1, nearX = 1e9, nearY = 1e9, gone = null, swept = null;
  for (var t = 0; t < 3600; t++) { // 60 seconds
    run(16.7);
    if (live) {
      if (maxX > farX) farX = maxX;
      if (maxY > farY) farY = maxY;
      if (minX < nearX) nearX = minX;
      if (minY < nearY) nearY = minY;
    }
    if (swept === null && farX >= VW - 20 && farY >= VH - 20 && nearX <= 10 && nearY <= 10) {
      swept = now;
    }
    if (live === 0 && gone === null && t > 30) gone = now;
  }
  report("still until clicked", quiet === 0, quiet + " cells before the click");
  report("wave sweeps the whole viewport", swept !== null,
    swept === null
      ? "only reached x " + Math.round(farX + 10) + ", y " + Math.round(farY + 10) + " of " + VW + "x" + VH
      : "all " + VW + "x" + VH + " by " + (swept / 1000).toFixed(1) + "s");
  report("wave dies out", gone !== null,
    gone === null ? "STILL ALIVE after 60s" : "gone after " + (gone / 1000).toFixed(1) + "s");
})();

if (failures.length) {
  console.error("\n" + failures.length + " failed: " + failures.join(", "));
  process.exit(1);
}
console.log("\nall good");
