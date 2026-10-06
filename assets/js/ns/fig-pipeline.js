// §2 of the natural steganography article: from photosites to JPEG.
//
// The noise of one photosite, followed through the development the paper
// models as M = T·P·S·L·D: the Bayer mosaic; demosaicking (D), which spreads
// it over its neighbours in its colour's channel; luminance (L), which keeps
// 0.299, 0.587 or 0.114 of it; the 8×8 blocks (S selects their pixels, P puts
// them in order), the ones it reaches; the DCT (T), which turns it into
// coefficients in each; and the quantisation, which rounds them with the step
// of a JPEG quality.
//
// The photosite is red, at the edge between the centre block and its east
// neighbour, until the reader picks another: a click on the grid while it is
// still photosites, or the arrow keys. fig-dct.js follows it. Every state is
// painted whole; a step change dissolves the previous picture into the next.
const STEPS = 6;
const N = 26; // photosites: 3×3 blocks of 8×8 and the one-photosite rim demosaicking reads
// The noisy photosite, as the reader leaves it; "change" when it moves.
export const burst = Object.assign(new EventTarget(), { at: [13, 16] });
export const BURST = 1500; // its noise, in 14-bit DN: enough for something to survive rounding
const COLOUR = { R: "red", G: "green", B: "blue" };
const CELL = 13;
const X0 = 8;
const Y0 = 8;
const W = 520;
const H = 400;
export const NAMES = ["NW", "N", "NE", "W", "C", "E", "SW", "S", "SE"]; // blocks, row-major
// The factors of M, and the step each one joins the picture at.
const FACTORS = [["T", "DCT", 4], ["P", "order", 3], ["S", "select", 3], ["L", "luma", 2], ["D", "demosaic", 1]];

// The photosite's column of M: the coefficients of each block, by block
// (NAMES) and mode, per DN of noise. fig-dct.js takes them apart.
export function burstColumn(maths) {
  const M = maths.photositesToDct(3);
  const col = burst.at[0] * N + burst.at[1];
  const coef = Array.from({ length: 9 }, () => new Float64Array(64));
  M.rows.forEach((r, n) => {
    const k = r.idx.indexOf(col);
    if (k >= 0) coef[maths.BLOCK_ORDER[3][Math.floor(n / 64)]][n % 64] = r.val[k];
  });
  return coef;
}

export function mount(el, ctx) {
  const { d3, gsap, maths } = ctx;
  let step = 0;
  let qf = 95;
  let playing = [];

  // What the photosite turns into, worked out again whenever it moves: its
  // colour, its column of M block by block, the blocks it reaches.
  let ch, coef, top, reached;
  const follow = () => {
    ch = maths.cfa(...burst.at);
    coef = burstColumn(maths);
    top = d3.max(coef, b => d3.max(b, Math.abs));
    reached = NAMES.filter((name, b) => coef[b].some(v => v !== 0));
  };
  follow();
  // Its colour's channel after demosaicking, per photosite of the grid.
  const spread = (i, j) => {
    const di = i - burst.at[0];
    const dj = j - burst.at[1];
    return Math.abs(di) <= 1 && Math.abs(dj) <= 1 ? maths.KERNEL[ch][di + 1][dj + 1] : 0;
  };
  const list = names => (names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + " and " + names.at(-1));
  // The integer a coefficient is stored as: luminance ×4 from 14 to 16 bits,
  // a step of 256·Q there.
  const quantised = (b, t) => Math.round((4 * BURST * coef[b][t]) / (256 * maths.QTABLES[qf][t]));

  el.textContent = "";
  const svg = d3
    .select(el)
    .append("svg")
    .attr("viewBox", "0 0 " + W + " " + H)
    .attr("tabindex", 0)
    .attr("role", "group");
  const ghost = svg.append("g"); // the previous step's picture, dissolving
  const now = svg.append("g");

  const controls = d3.select(el).append("div").attr("class", "ns-controls");
  const label = controls.append("label");
  label.append("span").text("JPEG quality");
  label
    .append("select")
    .selectAll("option")
    .data([100, 95, 85, 75])
    .join("option")
    .attr("value", d => d)
    .property("selected", d => d === qf)
    .text(d => d);
  label.select("select").on("change", function () {
    qf = +this.value;
    show(step, false);
  });

  // One cell of the grid at a step: its fill, and what it is.
  function cell(s, i, j, c, kmax) {
    const inner = i > 0 && j > 0 && i < N - 1 && j < N - 1;
    const tint = (to, t) => d3.interpolateRgb(c.paper, to)(t);
    const signed = (v, max) => (v ? tint(v > 0 ? c.D : c.blue, Math.sqrt(Math.abs(v) / max)) : c.paper);
    const hue = ch => ({ R: c.D, G: c.C, B: c.blue })[ch];
    // While the grid is still photosites, those of the nine blocks can be picked.
    const pick = inner ? "photosite" + (s && spread(i, j) ? " spot" : "") : null;
    if (s === 0) return { fill: i === burst.at[0] && j === burst.at[1] ? hue(maths.cfa(i, j)) : tint(hue(maths.cfa(i, j)), 0.3), cls: pick };
    if (s === 1) return { fill: tint(hue(ch), spread(i, j)), cls: pick };
    if (s <= 3) return { fill: tint(c.ink, spread(i, j)), opacity: s === 3 && !inner ? 0.25 : 1, cls: pick };
    if (!inner) return { fill: c.paper, opacity: 0 };
    const b = Math.floor((i - 1) / 8) * 3 + Math.floor((j - 1) / 8);
    const t = ((i - 1) % 8) * 8 + ((j - 1) % 8);
    if (s === 4) return { fill: signed(coef[b][t], top), cls: "dct-cell", block: NAMES[b], v: coef[b][t] };
    const k = quantised(b, t);
    return { fill: signed(k, kmax), cls: "q-cell", k };
  }

  function paint(g, s) {
    const c = ctx.colors();
    const fs = ctx.textSize(svg.node());
    g.selectAll("*").remove();
    const text = (x, y, words, fill, anchor) =>
      g.append("text").attr("x", x).attr("y", y).attr("fill", fill || c.ink).attr("font-size", fs).attr("text-anchor", anchor || "start").text(words);

    // The grid.
    const kmax = Math.max(1, d3.max(coef, (b, n) => d3.max(b, (v, t) => Math.abs(quantised(n, t)))));
    const cells = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) cells.push({ i, j, ...cell(s, i, j, c, kmax) });
    g.append("g")
      .selectAll("rect")
      .data(cells)
      .join("rect")
      .attr("class", d => d.cls || null)
      .attr("data-block", d => d.block || null)
      .attr("data-v", d => (d.v === undefined ? null : d.v))
      .attr("data-k", d => (d.k === undefined ? null : d.k))
      .attr("data-i", d => (s <= 3 ? d.i : null))
      .attr("data-j", d => (s <= 3 ? d.j : null))
      .style("cursor", d => (d.cls && d.cls.startsWith("photosite") ? "pointer" : null))
      .on("click", (e, d) => d.cls && d.cls.startsWith("photosite") && choose([d.i, d.j]))
      .attr("x", d => X0 + d.j * CELL)
      .attr("y", d => Y0 + d.i * CELL)
      .attr("width", CELL)
      .attr("height", CELL)
      .attr("fill", d => d.fill)
      .attr("opacity", d => (d.opacity === undefined ? 1 : d.opacity))
      .attr("stroke", c.rule)
      .attr("stroke-width", 0.5);
    const box = (i, j, n, stroke, width) =>
      g.append("rect").attr("x", X0 + j * CELL).attr("y", Y0 + i * CELL).attr("width", n * CELL).attr("height", n * CELL)
        .attr("fill", "none").attr("stroke", stroke).attr("stroke-width", width);
    if (s === 0) box(burst.at[0], burst.at[1], 1, c.ink, 2);
    if (s === 1) box(burst.at[0] - 1, burst.at[1] - 1, 3, c.ink, 2);
    if (s >= 3) {
      NAMES.forEach((name, b) => {
        const i = 1 + Math.floor(b / 3) * 8;
        const j = 1 + (b % 3) * 8;
        const hit = reached.includes(name);
        box(i, j, 8, hit ? c.hot : c.muted, hit ? 2.5 : 1.2);
        if (s === 3) text(X0 + (j + 4) * CELL, Y0 + (i + 4) * CELL + fs / 3, name, hit ? c.ink : c.muted, "middle").attr("font-weight", hit ? 700 : 400);
      });
    }

    // Beside the grid, what this step does, in a few words.
    const x = X0 + N * CELL + 16;
    const line = (n, words, fill) => text(x, 28 + n * fs * 1.6, words, fill);
    const swatch = (n, fill) => g.append("rect").attr("x", x).attr("y", 28 + n * fs * 1.6 - fs * 0.8).attr("width", fs).attr("height", fs).attr("fill", fill);
    const keyed = (n, fill, words) => {
      swatch(n, fill);
      text(x + fs * 1.5, 28 + n * fs * 1.6, words);
    };
    if (s === 0) {
      keyed(0, c.D, "red");
      keyed(1, c.C, "green");
      keyed(2, c.blue, "blue");
      line(4, "one " + COLOUR[ch] + " photosite,");
      line(5, "+" + BURST.toLocaleString("en") + " DN of noise");
      line(7, "click or tap", c.muted);
      line(8, "another one", c.muted);
    } else if (s === 1) {
      line(0, COLOUR[ch] + " kernel");
      // A column per weight: SVG text collapses the spaces that would align them.
      maths.KERNEL[ch].forEach((row, n) => row.forEach((v, m) => text(x + m * fs * 2.4, 28 + (1.2 + n) * fs * 1.6, String(v).replace("0.", "."), c.muted)));
      line(5, maths.KERNEL[ch].flat().filter(v => v).length + " pixels now", c.ink);
    } else if (s === 2) {
      line(0, "Y = 0.299 R");
      line(1, "   + 0.587 G");
      line(2, "   + 0.114 B");
      line(4, "here: " + maths.LUMA[ch] + " " + ch, c.muted);
    } else if (s === 3) {
      line(0, "8×8 blocks");
      line(2, "the spot spans");
      line(3, list(reached));
    } else if (s === 4) {
      keyed(0, c.D, "positive");
      keyed(1, c.blue, "negative");
      line(3, "64 coefficients");
      line(4, "per block,");
      line(5, "low frequencies");
      line(6, "top left");
    } else {
      const kept = cells.filter(d => d.k).length;
      line(0, "k = round(c / Q)");
      line(2, kept + " of 576");
      line(3, "not rounded to 0");
    }

    // M = T·P·S·L·D, a factor at a time.
    const fy = Y0 + N * CELL + fs + 10;
    text(X0, fy, "M =", s >= 1 ? c.ink : c.muted);
    FACTORS.forEach(([f, name, from], n) => {
      const on = s >= from;
      const fx = X0 + 76 + n * 80;
      text(fx, fy, f, on ? c.ink : c.muted, "middle").attr("font-weight", on ? 700 : 400);
      // Still to come: muted, never faded under what can be read.
      text(fx, fy + fs * 1.3, name, on ? c.ink : c.muted, "middle");
      if (n) text(fx - 40, fy, "·", c.muted, "middle");
    });
  }

  function show(i, animate) {
    playing.forEach(t => t.kill());
    playing = [];
    const from = step;
    step = i;
    // The quality only means something once there is something to quantise;
    // hidden, not removed, so the figure keeps its height.
    controls.style("visibility", i === STEPS - 1 ? null : "hidden");
    paint(now, i);
    svg.attr("data-at", burst.at.join(","))
      .attr("aria-label", "A 26 by 26 patch of Bayer photosites with one noisy " + COLOUR[ch] + " photosite, row " + burst.at[0] + ", column " + burst.at[1] + ", followed through demosaicking, luminance, 8 by 8 blocks, the DCT and quantisation: it ends up as coefficients in " + list(reached) + ". The arrow keys move it to another photosite.");
    ghost.selectAll("*").remove();
    gsap.set(ghost.node(), { opacity: 0 });
    // An entrance cut short leaves its opacity behind, and the next one would
    // fade in only up to it: scrolled through quickly, the picture went blank.
    gsap.set(now.node(), { opacity: 1 });
    if (!animate || from === i) return;
    // The picture before dissolves into this one.
    paint(ghost, from);
    playing.push(gsap.fromTo(ghost.node(), { opacity: 1 }, { opacity: 0, duration: 0.9, ease: "power1.inOut", onComplete: () => ghost.selectAll("*").remove() }));
    playing.push(gsap.from(now.node(), { opacity: 0, duration: 0.6 }));
    // Demosaicking: the kernel's pixels light up from the centre out, a
    // square of nine or a cross of five, row by row.
    if (i === 1) {
      const spot = now.selectAll("rect").filter(d => d && spread(d.i, d.j) > 0).nodes();
      playing.push(gsap.from(spot, { opacity: 0, duration: 0.35, delay: 0.3, stagger: { each: 0.06, from: "center", grid: spot.length === 9 ? [3, 3] : undefined } }));
    }
  }

  // Another photosite: this figure and fig-dct.js follow it at once.
  function choose(at) {
    if (at[0] === burst.at[0] && at[1] === burst.at[1]) return;
    burst.at = at;
    follow();
    show(step, false);
    burst.dispatchEvent(new Event("change"));
  }
  svg.on("keydown", e => {
    const by = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    if (!by) return;
    e.preventDefault();
    const inside = v => Math.min(N - 2, Math.max(1, v));
    choose([inside(burst.at[0] + by[0]), inside(burst.at[1] + by[1])]);
  });

  return { steps: STEPS, show, redraw: () => show(step, false) };
}
