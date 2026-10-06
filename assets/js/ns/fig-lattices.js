// §5 of the natural steganography article: conditioning between blocks.
//
// The blocks of a JPEG cut into four lattices (Fig. 10 of the paper), drawn
// one lattice after the other, each block given its neighbours already
// drawn: Λ1 given nothing, Λ2 its four corners, Λ3 its four sides, Λ4 all
// eight. Hovering a block, or moving to it with the arrow keys, shows what it
// is drawn given; with "reach" on, everything it depends on in the end, as
// the Projects card does. Under the grid, the chain rule, a factor a step,
// with the bits a block of each lattice carries.

// Bits a block, by lattice, on a flat grey patch (6000 DN, QF 100, K = 5):
// maths.embed over 16×16 blocks, seed 3, the blocks drawn with all their
// neighbours. Seconds to work out, so written here; tools/ns-check.mjs works
// them out again and holds them to it.
export const BITS = { 1: 65.8, 2: 64.6, 3: 46.9, 4: 43.1 };

const STEPS = 5;
const ROWS = 8;
const COLS = 12;
const CELL = 34;
const GAP = 3;
const W = 480;
const X0 = (W - (COLS * CELL + (COLS - 1) * GAP)) / 2;
const Y0 = 8;
const GRID = ROWS * CELL + (ROWS - 1) * GAP;
// The block each step points its arrows at, near the middle.
const FEATURED = { 2: [3, 5], 3: [4, 5], 4: [3, 4] };
const FACTORS = ["p(Λ1)", "p(Λ2 | Λ1)", "p(Λ3 | Λ1, Λ2)", "p(Λ4 | Λ1, Λ2, Λ3)"];

export function mount(el, ctx) {
  const { d3, gsap, maths } = ctx;
  let step = 0;
  let hover = null; // [bi, bj]
  let reach = false;
  let lit = null; // a lattice key from the text, "L2"
  let playing = [];

  const blocks = [];
  for (let bi = 0; bi < ROWS; bi++) for (let bj = 0; bj < COLS; bj++) blocks.push({ bi, bj, L: maths.lattice(bi, bj) });
  const at = (bi, bj) => [X0 + bj * (CELL + GAP) + CELL / 2, Y0 + bi * (CELL + GAP) + CELL / 2];
  const inside = (bi, bj) => bi >= 0 && bj >= 0 && bi < ROWS && bj < COLS;
  // What a block is drawn given: its neighbours in GIVEN, the centre aside.
  const given = (bi, bj) =>
    maths.GIVEN[maths.lattice(bi, bj)].slice(1).map(p => [bi + maths.AROUND[p][0], bj + maths.AROUND[p][1]]).filter(([i, j]) => inside(i, j));
  // And everything it depends on in the end.
  function closure(bi, bj) {
    const out = new Map();
    const queue = [[bi, bj]];
    while (queue.length) {
      const [i, j] = queue.pop();
      for (const [ni, nj] of given(i, j)) {
        const k = ni * COLS + nj;
        if (!out.has(k)) {
          out.set(k, [ni, nj]);
          queue.push([ni, nj]);
        }
      }
    }
    return [...out.values()];
  }

  el.textContent = "";
  const svg = d3.select(el).append("svg").attr("tabindex", 0).attr("role", "group")
    .attr("aria-label", "Twelve by eight JPEG blocks in four interleaved lattices, drawn one lattice after the other. Move through the blocks with the arrow keys to see what each is drawn given.");
  const grid = svg.append("g");
  const marks = svg.append("g").attr("pointer-events", "none");
  const notes = svg.append("g");
  svg.append("defs").append("marker").attr("id", "ns-arrow").attr("viewBox", "0 0 10 10").attr("refX", 9).attr("refY", 5)
    .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto-start-reverse")
    .append("path").attr("d", "M0,0 L10,5 L0,10 z");

  const controls = d3.select(el).append("div").attr("class", "ns-controls");
  const toggle = controls.append("button").attr("type", "button").attr("class", "btn btn-sm btn-outline-secondary").attr("aria-pressed", "false")
    .text("Show the reach")
    .on("click", () => {
      reach = !reach;
      toggle.attr("aria-pressed", String(reach));
      paint();
    });

  svg.on("mouseleave", () => {
    hover = null;
    paint();
  });
  svg.on("focus", () => {
    hover = hover || FEATURED[4];
    paint();
  });
  svg.on("blur", () => {
    hover = null;
    paint();
  });
  svg.on("keydown", e => {
    const by = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    if (!by) return;
    e.preventDefault();
    const [i, j] = hover || FEATURED[4];
    hover = [Math.min(ROWS - 1, Math.max(0, i + by[0])), Math.min(COLS - 1, Math.max(0, j + by[1]))];
    paint();
  });

  function paint() {
    const c = ctx.colors();
    const fs = ctx.textSize(svg.node());
    const hue = { 1: c.A, 2: c.B, 3: c.C, 4: c.D };
    const grey = d3.interpolateRgb(c.paper, c.muted)(0.3);
    const near = hover ? (reach ? closure(...hover) : given(...hover)) : [];
    const isNear = new Set(near.map(([i, j]) => i * COLS + j));
    const isHover = d => hover && d.bi === hover[0] && d.bj === hover[1];

    // The blocks, kept from one paint to the next, so the one under the
    // pointer stays the one under the pointer.
    grid.selectAll("rect.block").data(blocks, d => d.bi * COLS + d.bj).join("rect")
      .attr("class", d => "block" + (isNear.has(d.bi * COLS + d.bj) ? " is-given" : "") + (lit && "L" + d.L === lit ? " is-key" : ""))
      .attr("data-bi", d => d.bi)
      .attr("data-bj", d => d.bj)
      .attr("data-lattice", d => d.L)
      .attr("x", d => at(d.bi, d.bj)[0] - CELL / 2)
      .attr("y", d => at(d.bi, d.bj)[1] - CELL / 2)
      .attr("width", CELL)
      .attr("height", CELL)
      .attr("rx", 3)
      .attr("fill", d => (d.L <= step ? hue[d.L] : grey))
      .attr("opacity", d => (hover && !isHover(d) && !isNear.has(d.bi * COLS + d.bj) ? 0.35 : 1))
      .attr("stroke", d => (isHover(d) || isNear.has(d.bi * COLS + d.bj) || (lit && "L" + d.L === lit) ? c.ink : "none"))
      .attr("stroke-width", d => (isHover(d) ? 3.5 : 2.5))
      .attr("stroke-dasharray", d => (isHover(d) ? "4 3" : null))
      .on("mouseenter", (e, d) => {
        hover = [d.bi, d.bj];
        paint();
      });

    // The arrows of this step: what its lattice is drawn given.
    marks.selectAll("*").remove();
    svg.select("marker path").attr("fill", c.ink);
    const f = FEATURED[step];
    if (f && !hover) {
      const [tx, ty] = at(...f);
      // From each neighbour's centre to the edge of the block it informs,
      // in ink over a rim of paper, so it reads on every colour.
      given(...f).forEach(([i, j]) => {
        const [sx, sy] = at(i, j);
        const d = Math.hypot(tx - sx, ty - sy);
        const cut = (CELL / 2 + 2) * (Math.abs(tx - sx) && Math.abs(ty - sy) ? Math.SQRT2 : 1);
        const line = (stroke, width, head) =>
          marks.append("line").attr("class", head ? "arrow" : null)
            .attr("x1", sx).attr("y1", sy).attr("x2", tx - ((tx - sx) * cut) / d).attr("y2", ty - ((ty - sy) * cut) / d)
            .attr("stroke", stroke).attr("stroke-width", width).attr("stroke-linecap", "round").attr("marker-end", head ? "url(#ns-arrow)" : null);
        line(c.paper, 5, false);
        line(c.ink, 2, true);
        marks.append("circle").attr("cx", sx).attr("cy", sy).attr("r", 3.5).attr("fill", c.ink).attr("stroke", c.paper).attr("stroke-width", 1.5);
      });
    }

    // The chain rule, a factor a step, each with what its blocks carry; two
    // factors a line, so it holds on a phone.
    notes.selectAll("*").remove();
    const text = (x, y, words, fill, anchor) =>
      notes.append("text").attr("x", x).attr("y", y).attr("fill", fill || c.ink).attr("font-size", fs).attr("text-anchor", anchor || "middle").text(words);
    let y = Y0 + GRID + fs * 1.8;
    FACTORS.forEach((words, n) => {
      const L = n + 1;
      const on = L <= step;
      const x = X0 + (n % 2) * (W / 2);
      const yy = y + Math.floor(n / 2) * fs * 3.2;
      notes.append("rect").attr("x", x).attr("y", yy - fs * 0.8).attr("width", fs * 0.8).attr("height", fs * 0.8).attr("rx", 2).attr("fill", hue[L]).attr("opacity", on ? 1 : 0.3);
      text(x + fs * 1.3, yy, words, on ? c.ink : c.muted, "start").attr("font-weight", L === step ? 700 : 400); // muted when still to come, never faded
      if (on) text(x + fs * 1.3, yy + fs * 1.3, BITS[L].toFixed(1) + " bits a block", c.muted, "start").attr("class", "lat-bits").attr("data-lattice", L).attr("data-bits", BITS[L]);
    });
    y += fs * 6.4;
    if (step) {
      const mean = d3.mean(d3.range(1, step + 1), L => BITS[L]);
      text(X0, y, "so far, on a flat, bright patch at QF 100: " + mean.toFixed(1) + " bits a block, " + (mean / 64).toFixed(2) + " a pixel", c.ink, "start");
    }
    // As tall as its text needs, which is taller on a phone.
    svg.attr("viewBox", "0 0 " + W + " " + Math.ceil(y + fs * 0.8));
  }

  function show(i, animate) {
    playing.forEach(t => t.kill());
    playing = [];
    // An entrance cut short leaves its inline opacity, which would win over
    // the attribute that dims blocks on hover.
    grid.selectAll("rect.block").attr("style", null);
    const from = step;
    step = i;
    paint();
    if (!animate || i <= from) return;
    // The new lattice arrives, all at once for Λ1, which needs nothing; then
    // its arrows.
    const fresh = grid.selectAll("rect.block").filter(d => d.L > from && d.L <= i).nodes();
    playing.push(gsap.from(fresh, { opacity: 0, scale: 0.6, transformOrigin: "50% 50%", duration: 0.4, stagger: i === 1 ? 0 : 0.015, clearProps: "opacity,transform" }));
    playing.push(gsap.from(marks.selectAll("line").nodes(), { opacity: 0, duration: 0.3, delay: 0.5, stagger: 0.08 }));
  }

  svg.attr("viewBox", "0 0 " + W + " " + (Y0 + GRID + 120));
  return {
    steps: STEPS,
    show,
    redraw: () => show(step, false),
    keys: ["L1", "L2", "L3", "L4"],
    highlight(key) {
      lit = key;
      paint();
    }
  };
}
