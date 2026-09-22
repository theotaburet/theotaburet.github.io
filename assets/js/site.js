// Three small pieces of page furniture: a custom pointer, scroll reveals, and
// the stack of falling blocks in the footer. Kept in one file because none of
// them is big enough to be worth its own request.
(function () {
  var still = window.matchMedia("(prefers-reduced-motion: reduce)");
  var coarse = window.matchMedia("(pointer: coarse)");

  /* -------------------------------------------------------------------------
     Pointer. A dot that tracks exactly and a ring that lags behind it, so the
     cursor has some weight. Difference blending means it stays visible over
     the photographs without needing a colour of its own.

     What it is over changes its shape, so the pointer says what a thing is
     before you click it: a ring that opens on a link, a square viewfinder on
     a picture, a caret on running text.
     ---------------------------------------------------------------------- */
  (function cursor() {
    if (still.matches || coarse.matches) return;

    var dot = document.createElement("div");
    var ring = document.createElement("div");
    dot.className = "cursor-dot";
    ring.className = "cursor-ring";
    dot.setAttribute("aria-hidden", "true");
    ring.setAttribute("aria-hidden", "true");
    document.body.appendChild(ring);
    document.body.appendChild(dot);
    document.documentElement.classList.add("has-cursor");

    var tx = window.innerWidth / 2;
    var ty = window.innerHeight / 2;
    var rx = tx;
    var ry = ty;
    var shown = false;

    // Most specific first, and the first match wins: a project card is an <a>,
    // but what you want to know about it is that it is a picture.
    var KINDS = [
      ["link", "a, button, input, textarea, select, summary, label"],
      ["text", "p, li, h1, h2, h3, h4, blockquote, figcaption, td"]
    ];

    // The two things a kind can ask for beyond a shape, both keyed by the
    // kind's name. Adding a cursor is a block in the stylesheet and, only if
    // it wants one of these, one line here — nothing below knows what a wheel
    // or a fork is.
    var RIGID = { wheel: 26 }; // rolls; the radius in px, matching the CSS
    // Stirs the background: how often, and what to draw. field.js owns the
    // shapes; this only says which one and how big.
    var PULSE = {
      // A train of rings, each wider than the last and then back to the
      // middle, so the diapason radiates rather than merely glows. Six steps
      // run a little over the life of a cell, which is what keeps a new ring
      // off one that is still lit.
      fork: {
        every: 340,
        detail: function (n) {
          return { shape: "ring", r: 3 + (n % 6) * 2 };
        }
      },
      // The page it belongs to is about hiding a payload in sensor noise.
      grain: {
        every: 200,
        detail: function () {
          return { shape: "grain", r: 6, n: 10 };
        }
      }
    };

    var root = document.documentElement;
    var kind = "";
    var spin = 0; // radians the wheel has rolled so far
    var beat = null; // the timer behind PULSE, running only while hovered
    var wave = 0; // how far into its train the current pulse is

    // Asks the background field to answer, without either script reaching into
    // the other: field.js listens for this and decides for itself what a pulse
    // looks like.
    function pulse() {
      if (document.hidden) return; // a hidden tab still runs timers
      var p = PULSE[kind];
      if (!p) return;
      var d = p.detail(wave++);
      d.x = tx;
      d.y = ty;
      window.dispatchEvent(new CustomEvent("field:pulse", { detail: d }));
    }

    window.addEventListener("pointermove", function (e) {
      // One radian per radius travelled, which is what rolling is.
      if (RIGID[kind]) spin += (e.clientX - tx) / RIGID[kind];
      tx = e.clientX;
      ty = e.clientY;
      if (!shown) {
        shown = true;
        rx = tx;
        ry = ty;
        root.classList.add("cursor-on");
      }
      var found = "";
      if (e.target && e.target.closest) {
        // The page names its own cursor wherever it wants a particular one,
        // so the script carries no list of what this site is about. Scoped
        // under body because <html> is where the answer is written: an
        // unscoped match would find the attribute this handler set on the
        // last move and never let go of it.
        var tag = e.target.closest("body [data-cursor]");
        found = tag ? tag.getAttribute("data-cursor") : "";
        for (var i = 0; i < KINDS.length && !found; i++) {
          if (e.target.closest(KINDS[i][1])) found = KINDS[i][0];
        }
      }
      // Only on a change: this runs on every pointer move, and writing the
      // attribute each time invalidates style for the whole document.
      if (found === kind) return;
      kind = found;
      if (kind) root.setAttribute("data-cursor", kind);
      else root.removeAttribute("data-cursor");

      // A kind that stirs the field gets a timer for exactly as long as the
      // pointer is on it. The field's rule is that it stays still unless
      // asked; a hover is a small ask, and it stops being made the moment you
      // move away.
      if (beat) beat = window.clearInterval(beat);
      if (PULSE[kind]) {
        wave = 0; // every train starts from the middle
        pulse();
        beat = window.setInterval(pulse, PULSE[kind].every);
      }
    });

    document.addEventListener("pointerleave", function () {
      document.documentElement.classList.remove("cursor-on");
      shown = false;
      if (beat) beat = window.clearInterval(beat);
    });

    (function follow() {
      var r = RIGID[kind];
      if (r) {
        // A rim that trails behind its own hub is not a wheel. The lag that
        // gives the ring its weight everywhere else has to go here.
        rx = tx;
        ry = ty;
      } else {
        rx += (tx - rx) * 0.18;
        ry += (ty - ry) * 0.18;
      }
      dot.style.transform = "translate3d(" + tx + "px," + ty + "px,0)";
      ring.style.transform =
        "translate3d(" + rx + "px," + ry + "px,0)" +
        (r ? " rotate(" + spin + "rad)" : "");
      window.requestAnimationFrame(follow);
    })();
  })();

  /* -------------------------------------------------------------------------
     Scroll reveals. No markup needed: the selectors below are the things worth
     staggering in. Anything already on screen at load reveals immediately.
     ---------------------------------------------------------------------- */
  (function reveal() {
    var SELECTOR =
      ".lede, .photo-wall img, .project-card, .content h2, .content h3, .deploys, .content > p, .content > ul";
    var targets = [].slice.call(document.querySelectorAll(SELECTOR));
    if (!targets.length) return;

    if (still.matches || !("IntersectionObserver" in window)) {
      targets.forEach(function (el) {
        el.classList.add("is-in");
      });
      return;
    }

    targets.forEach(function (el) {
      el.classList.add("to-reveal");
    });

    function showAll() {
      targets.forEach(function (el) {
        el.classList.add("is-in");
      });
    }

    // Hiding content and waiting for an observer is only safe with a way out.
    // A background tab, a prerender, or anything that stops the observer from
    // firing would otherwise leave the whole page blank.
    var failsafe = window.setTimeout(showAll, 1400);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) window.setTimeout(showAll, 1400);
    });

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry, i) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          // Stagger only within a batch, so a long page never queues up a
          // visible wait.
          window.clearTimeout(failsafe);
          window.setTimeout(function () {
            el.classList.add("is-in");
          }, Math.min(i, 6) * 55);
          io.unobserve(el);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );

    targets.forEach(function (el) {
      io.observe(el);
    });
  })();

  /* -------------------------------------------------------------------------
     The colophon. The theme parks it under the article, where it falls
     between the end of the text and the top of the well and belongs to
     neither. It says who the site is, so it goes where the site's name is.
     Moved rather than overridden: the theme ships it inside a template this
     site does not otherwise need a copy of.
     ---------------------------------------------------------------------- */
  (function credit() {
    var tail = document.getElementById("tail-wrapper");
    var note = tail && tail.querySelector("footer");
    var icons = document.querySelector("#sidebar .sidebar-bottom");
    if (!note || !icons) return;
    // The theme's classes lay it out as a wide two-column band; in a 300px
    // column it is two short lines.
    note.className = "sidebar-credit";
    icons.parentNode.insertBefore(note, icons);
    tail.parentNode.remove(); // the empty row it was sitting in
  })();

  /* -------------------------------------------------------------------------
     Footer. A Tetris well as wide as the content column, playing itself on
     the same 10px lattice as the background field: the blocks land in the
     squares of the graph paper, not between them.

     A row that wide takes about forty pieces to complete, so several fall at
     once — one at a time would take the better part of a minute per line and
     look, again, like a stack that never clears.
     ---------------------------------------------------------------------- */
  (function blocks() {
    // Last element of the content column, so the well rests on the very bottom
    // edge of the page. It hangs inside .container and not on #main-wrapper,
    // which the theme lays out as a flex row: a canvas dropped in there
    // becomes a second column and squeezes the whole page into a strip.
    var host =
      document.querySelector("#main-wrapper > .container") || document.body;

    // What it is measured against, which is deliberately not what it hangs
    // from. The container is a different width on every page — the wide ones
    // drop its max-width altogether — and a well that changes size from one
    // page to the next reads as a mistake rather than as an edge. The wrapper
    // is the page: everything the sidebar leaves, the same on all of them.
    var bleed = document.getElementById("main-wrapper") || host;

    var COLORS = ["#a0d8ef", "#f8b862", "#8db255", "#d3381c"];
    // Pitch and inset both match CELL and GAP in field.js. Change one and the
    // blocks stop sitting in the squares.
    var CELL = 10;
    var GAP = 1;
    var ROWS = 18;
    var FALL = 13; // rows per second
    var STAGGER = 130; // ms between one piece entering and the next
    var FLIGHT = 22; // columns per piece in flight, so the rate follows width
    var FLASH = 200; // ms a completed line stays lit before it collapses
    var WIPE = 60; // ms per row when the well tops out and comes down

    // The seven tetrominoes, spelled out as cells. Rotations are computed.
    var SHAPES = [
      [[0, 0], [1, 0], [2, 0], [3, 0]],
      [[0, 0], [1, 0], [0, 1], [1, 1]],
      [[0, 0], [1, 0], [2, 0], [1, 1]],
      [[0, 0], [0, 1], [1, 1], [2, 1]],
      [[2, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [0, 1], [1, 1]],
      [[0, 0], [1, 0], [1, 1], [2, 1]]
    ];

    // A quarter turn, pulled back against the origin so every form indexes
    // from (0, 0) and a column stays a column.
    function turn(shape) {
      var h = 0;
      shape.forEach(function (c) {
        if (c[1] > h) h = c[1];
      });
      return shape.map(function (c) {
        return [h - c[1], c[0]];
      });
    }

    // Everything the placement search wants to know about a form, worked out
    // once: its extent, the lowest and highest cell in each of its columns,
    // and how many cells it puts in each of its rows.
    function describe(cells) {
      var w = 0;
      var h = 0;
      cells.forEach(function (c) {
        if (c[0] + 1 > w) w = c[0] + 1;
        if (c[1] + 1 > h) h = c[1] + 1;
      });
      var low = [];
      var high = [];
      var rows = [];
      for (var i = 0; i < w; i++) {
        low.push(-1);
        high.push(h);
      }
      for (var j = 0; j < h; j++) rows.push(0);
      cells.forEach(function (c) {
        if (c[1] > low[c[0]]) low[c[0]] = c[1];
        if (c[1] < high[c[0]]) high[c[0]] = c[1];
        rows[c[1]]++;
      });
      return { cells: cells, w: w, h: h, low: low, high: high, rows: rows };
    }

    var FORMS = SHAPES.map(function (shape) {
      var raw = [shape];
      for (var i = 0; i < 3; i++) raw.push(turn(raw[raw.length - 1]));
      return raw.map(describe);
    });

    var canvas = document.createElement("canvas");
    canvas.className = "footer-blocks";
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);

    var ctx = canvas.getContext("2d");
    var width = 0;
    var cols = 0;
    var ox = 0; // shift that puts the blocks on the paper's own lines
    var oy = 0;
    var board = [];
    var top = []; // first filled row in each column, or ROWS if the column is clear
    var fill = []; // filled cells in each row
    var busy = []; // columns a falling piece has spoken for
    var flying = [];
    var nextAt = 0;
    var wanted = -1; // column the visitor clicked, if any
    var lit = null; // completed rows, lit and about to collapse
    var litAt = 0;
    var wiping = -1; // row being cleared after a top-out, -1 when not wiping
    var wipeAt = 0;
    var last = 0;
    var running = false;

    // The graph paper is drawn from the viewport's left edge and the page's
    // top, neither of which this canvas starts on. Measure the difference and
    // draw everything shifted by it, and the squares line up.
    //
    // It is measured every frame rather than once. This canvas sits below
    // every image on the page, so each lazy one that arrives shifts it, and
    // there is no single moment afterwards that is reliably the last: load
    // fires before the images below the fold have been fetched at all.
    function align() {
      var box = canvas.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      // Layout reports where the canvas would like to be; the compositor
      // paints it on a whole device pixel. Line the blocks up with where it
      // actually is, or they sit a fraction of a pixel off the rules.
      var left = Math.round(box.left * dpr) / dpr;
      var top = Math.round(box.top * dpr) / dpr + window.scrollY;
      ox = ((left % CELL) + CELL) % CELL;
      oy = ((top % CELL) + CELL) % CELL;
    }

    function size() {
      canvas.style.marginLeft = "0px";
      var page = bleed.getBoundingClientRect();
      // Floored, and the offset below left fractional: a page 1704.5 wide
      // rounded up is a canvas half a pixel too wide for it, which is a
      // horizontal scrollbar on every page.
      width = Math.max(CELL * 8, Math.floor(page.width));
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(ROWS * CELL * dpr);
      canvas.style.width = width + "px";
      canvas.style.height = ROWS * CELL + "px";
      // Now pull it back out over the container's own margins, so it runs the
      // full width of the page rather than the width of the text. Measured
      // rather than computed from a breakpoint: the container's inset is a
      // max-width and two paddings that each change on their own.
      canvas.style.marginLeft =
        page.left - canvas.getBoundingClientRect().left + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      align();
      // The last column has to fit whole once the shift is taken off.
      return Math.max(8, Math.floor((width + ox - (CELL - GAP)) / CELL) + 1);
    }

    function build() {
      var next = size();
      if (next === cols) return false;
      cols = next;
      board = [];
      for (var r = 0; r < ROWS; r++) board.push(new Array(cols).fill(-1));
      flying = [];
      lit = null;
      wiping = -1;
      return true;
    }

    // top[] and fill[] are kept up to date as pieces land, but a collapse
    // moves every row, so it is cheaper to count the whole board again than
    // to patch them.
    function recount() {
      top = new Array(cols).fill(ROWS);
      fill = new Array(ROWS).fill(0);
      busy = new Array(cols).fill(0);
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < cols; c++) {
          if (board[r][c] < 0) continue;
          fill[r]++;
          if (r < top[c]) top[c] = r;
        }
      }
      flying.forEach(function (p) {
        for (var i = 0; i < p.form.w; i++) busy[p.col + i]++;
      });
    }

    // Where this form comes to rest in this column, from the stack heights
    // alone. Copying the board to try a placement would mean a few hundred
    // copies of a 2500 cell array every time a piece enters.
    function landing(form, col) {
      var row = ROWS;
      for (var dx = 0; dx < form.w; dx++) {
        var limit = top[col + dx] - 1 - form.low[dx];
        if (limit < row) row = limit;
      }
      return row;
    }

    // How good the well looks afterwards: a completed line is worth a lot, a
    // hole sealed under an overhang costs a lot, and the rest is a mild
    // preference for low and even.
    function score(form, col, row) {
      var holes = 0;
      var stack = 0;
      for (var dx = 0; dx < form.w; dx++) {
        holes += top[col + dx] - 1 - form.low[dx] - row;
        stack += ROWS - Math.min(top[col + dx], row + form.high[dx]);
      }

      var lines = 0;
      for (var ly = 0; ly < form.h; ly++) {
        var r = row + ly;
        if (r >= 0 && fill[r] + form.rows[ly] === cols) lines++;
      }

      // Bumpiness against the neighbours on either side, not the whole well:
      // only this corner of it is being changed.
      var bumps = 0;
      var prev = null;
      for (var dx2 = -1; dx2 <= form.w; dx2++) {
        var c = col + dx2;
        if (c < 0 || c >= cols) {
          prev = null;
          continue;
        }
        var t = dx2 >= 0 && dx2 < form.w ? Math.min(top[c], row + form.high[dx2]) : top[c];
        if (prev !== null) bumps += Math.abs(t - prev);
        prev = t;
      }

      return lines * 30 - holes * 12 - stack * 0.5 - bumps * 0.6;
    }

    function free(col, w) {
      for (var i = 0; i < w; i++) {
        if (busy[col + i]) return false;
      }
      return true;
    }

    // Try every rotation in every free column and keep the best landing.
    function plan(only) {
      var forms = FORMS[(Math.random() * FORMS.length) | 0];
      var best = null;
      for (var f = 0; f < forms.length; f++) {
        var form = forms[f];
        for (var col = 0; col + form.w <= cols; col++) {
          if (only >= 0 && col !== Math.min(only, cols - form.w)) continue;
          if (!free(col, form.w)) continue;
          var row = landing(form, col);
          if (row < 0) continue; // no room to enter here
          var s = score(form, col, row);
          if (!best || s > best.score) best = { form: form, col: col, row: row, score: s };
        }
      }
      return best;
    }

    function spawn() {
      var pick = wanted >= 0 ? plan(wanted) || plan(-1) : plan(-1);
      wanted = -1;
      if (!pick) {
        // Nowhere left to put anything. Take the well down one row at a time
        // rather than blinking it out, so you can see what happened.
        if (!flying.length) {
          wiping = ROWS - 1;
          wipeAt = 0;
        }
        return;
      }
      for (var i = 0; i < pick.form.w; i++) busy[pick.col + i]++;
      flying.push({
        form: pick.form,
        col: pick.col,
        row: pick.row,
        y: -pick.form.h,
        colour: (Math.random() * COLORS.length) | 0
      });
    }

    function land(p, now) {
      var cells = p.form.cells;
      for (var i = 0; i < cells.length; i++) {
        var x = p.col + cells[i][0];
        var y = p.row + cells[i][1];
        if (y < 0 || y >= ROWS) continue;
        board[y][x] = p.colour;
        fill[y]++;
        if (y < top[x]) top[x] = y;
      }
      for (var j = 0; j < p.form.w; j++) busy[p.col + j]--;

      var done = [];
      for (var r = 0; r < ROWS; r++) {
        if (fill[r] === cols) done.push(r);
      }
      if (done.length) {
        lit = done;
        litAt = now + FLASH;
      }
    }

    function collapse() {
      // The well and the background are on the same lattice, so a line goes
      // out into the page rather than merely vanishing: the row lands behind
      // the well as the row it was, full width, and fades there. A ring here
      // read as something popping at random instead of as the line that went.
      // Off screen it seeds rows that are never drawn, which costs nothing
      // and is why it needs no guard.
      var box = canvas.getBoundingClientRect();
      lit.forEach(function (row) {
        window.dispatchEvent(
          new CustomEvent("field:pulse", {
            detail: {
              shape: "line",
              x: box.left + width / 2,
              y: box.top + row * CELL + CELL / 2,
              w: width
            }
          })
        );
      });

      // Highest index first, so the rows below keep their numbers.
      for (var i = lit.length - 1; i >= 0; i--) {
        board.splice(lit[i], 1);
        board.unshift(new Array(cols).fill(-1));
      }
      lit = null;
      recount();
      // Everything still in the air was aimed at a row that has just moved.
      flying.forEach(function (p) {
        p.row = landing(p.form, p.col);
      });
    }

    function block(x, y, colour, inset) {
      ctx.fillStyle = COLORS[colour];
      ctx.fillRect(x * CELL, y * CELL, CELL - inset, CELL - inset);
    }

    function step(now) {
      var dt = Math.min(64, now - last || 16);
      last = now;

      if (wiping >= 0) {
        if (now >= wipeAt) {
          board[wiping].fill(-1);
          wiping--;
          wipeAt = now + WIPE;
          if (wiping < 0) {
            recount();
            nextAt = now + 400;
          }
        }
        draw();
        if (running) window.requestAnimationFrame(step);
        return;
      }

      if (lit) {
        if (now >= litAt) collapse();
      } else {
        if (flying.length < Math.max(1, Math.round(cols / FLIGHT)) && now >= nextAt) {
          spawn();
          nextAt = now + STAGGER;
        }
        for (var i = flying.length - 1; i >= 0; i--) {
          var p = flying[i];
          p.y = Math.min(p.row, p.y + (FALL * dt) / 1000);
          if (p.y >= p.row) {
            flying.splice(i, 1);
            land(p, now);
          }
        }
      }

      draw();
      if (running) window.requestAnimationFrame(step);
    }

    function draw() {
      align();
      ctx.clearRect(0, 0, width, ROWS * CELL);
      ctx.save();
      ctx.translate(-ox, -oy);
      ctx.globalAlpha = 0.9;
      for (var r = 0; r < ROWS; r++) {
        // A completed line closes its joints and reads as one bar for a
        // moment. That works in either theme, which a white flash would not.
        var going = lit && lit.indexOf(r) >= 0;
        for (var c = 0; c < cols; c++) {
          if (board[r][c] < 0) continue;
          ctx.globalAlpha = going ? 1 : 0.9;
          block(c, r, board[r][c], going ? 0 : GAP);
        }
      }
      ctx.globalAlpha = 1;
      flying.forEach(function (p) {
        var cells = p.form.cells;
        for (var i = 0; i < cells.length; i++) {
          block(p.col + cells[i][0], p.y + cells[i][1], p.colour, GAP);
        }
      });
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Start from a well that is already in play. An empty one waiting on an
    // observer that may never fire would just be a gap above the copyright.
    function seed() {
      var h = 2;
      for (var c = 0; c < cols; c++) {
        h = Math.max(0, Math.min(5, h + ((Math.random() * 3) | 0) - 1));
        for (var r = ROWS - h; r < ROWS; r++) {
          board[r][c] = (Math.random() * COLORS.length) | 0;
        }
      }
      recount();
      // Nothing should vanish on the first frame.
      for (var r2 = 0; r2 < ROWS; r2++) {
        if (fill[r2] === cols) {
          board[r2][0] = -1;
          fill[r2]--;
        }
      }
    }

    build();
    seed();
    draw();

    if (still.matches) {
      // nothing further: the seeded well is the whole picture
    } else {
      canvas.addEventListener("pointerdown", function (e) {
        var box = canvas.getBoundingClientRect();
        wanted = Math.max(0, Math.min(cols - 1, ((e.clientX - box.left + ox) / CELL) | 0));
        nextAt = 0; // send one now rather than waiting out the stagger
      });

      // Only run while the footer is actually on screen.
      var onscreen = false;

      function resume() {
        if (running || !onscreen || document.hidden) return;
        running = true;
        last = 0;
        window.requestAnimationFrame(step);
      }

      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (entries) {
          onscreen = entries[0].isIntersecting;
          if (onscreen) resume();
          else running = false;
        }).observe(canvas);
      } else {
        onscreen = true;
        resume();
      }

      // The observer fires once. If the tab happened to be in the background
      // at that moment the loop never started, and no later intersection
      // change comes along to start it: coming back has to try again itself.
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) running = false;
        else resume();
      });
    }

    var timer = null;
    window.addEventListener("resize", function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        if (build()) seed();
        else align();
        draw();
      }, 150);
    });
  })();
})();
