// §2 of the natural steganography article, continued: what a DCT
// coefficient is.
//
// The 64 patterns of the 8×8 DCT, each where its coefficient sits in a
// block: slow cosines top left, fast ones bottom right. A coefficient is how
// much of its pattern a block holds, the two multiplied pixel by pixel and
// summed. The pattern chosen is laid over the blocks the pipeline figure's
// photosite reaches (C and E for the red one it starts with), multiplied by
// the luminance its burst left there, and the sums are that pattern's
// coefficients in those blocks, the ones its DCT step showed. A photosite
// picked there is followed here.
import { BURST, NAMES, burst, burstColumn } from "./fig-pipeline.js";

const PITCH = 36; // a pattern and the gap after it
const PX = 4; // a pixel of a pattern
const X0 = 8;
const Y0 = 8;
const GAP = 6; // between blocks
const COL = 104; // a column of sums
const RX = X0 + 8 * PITCH + 18;
const W = 520;
const ROWS = ["pattern", "× luminance", "= product, summed"];

export function mount(el, ctx) {
  const { d3, gsap, maths } = ctx;
  const unit = t => Float64Array.from({ length: 64 }, (_, k) => +(k === t));
  const basis = d3.range(64).map(t => maths.idct8(unit(t)));
  // The blocks the burst reaches, in the smallest window of the nine that
  // holds them: one, two side by side or one above the other, or four. Its
  // luminance in each, in DN: the inverse DCT of its coefficients there.
  let win, lum, lmax, cell;
  const follow = () => {
    const coef = burstColumn(maths);
    const hit = d3.range(9).filter(b => coef[b].some(v => v !== 0));
    const rows = d3.extent(hit, b => Math.floor(b / 3));
    const cols = d3.extent(hit, b => b % 3);
    win = [];
    for (let r = rows[0]; r <= rows[1]; r++) for (let c = cols[0]; c <= cols[1]; c++) win.push({ name: NAMES[r * 3 + c], r: r - rows[0], c: c - cols[0] });
    lum = win.map(w => maths.idct8(coef[NAMES.indexOf(w.name)]).map(v => v * BURST));
    lmax = d3.max(lum, L => d3.max(L));
    cell = rows[1] > rows[0] ? 6 : 12; // a pixel: two rows of blocks in the height of one
  };
  follow();
  let chosen = 1;
  let shown = {}; // the sums as written, by block, for the next change to count from
  let playing = [];

  el.textContent = "";
  const svg = d3
    .select(el)
    .append("svg")
    .attr("viewBox", "0 0 " + W + " 420") // measured by textSize before the first paint
    .attr("tabindex", 0)
    .attr("role", "group")
    .attr("aria-label", "The 64 patterns of the 8 by 8 DCT. Choose one with the arrow keys, or hover or tap it: it is multiplied pixel by pixel by the burst's luminance in the blocks it reaches, and summed.");
  const note = d3.select(el).append("p").attr("class", "ns-view-label").style("text-align", "center").attr("aria-live", "polite");

  const name = t => "(" + Math.floor(t / 8) + ", " + (t % 8) + ")";
  const fmt = v => (v < -0.05 ? "−" : "+") + Math.abs(v).toFixed(1);
  const signed = (c, v, max) => d3.interpolateRgb(c.paper, v > 0 ? c.D : c.blue)(max ? Math.sqrt(Math.min(1, Math.abs(v) / max)) : 0);

  let rowY = [];
  let label = null;
  let sumText = [];

  // Everything the theme and the text size decide, drawn whole; then the
  // chosen pattern, at once.
  function paint() {
    const c = ctx.colors();
    const fs = ctx.textSize(svg.node());
    svg.selectAll("*").remove();
    const text = (x, y, words, fill, anchor) =>
      svg.append("text").attr("x", x).attr("y", y).attr("fill", fill || c.ink).attr("font-size", fs).attr("text-anchor", anchor || "start").text(words);

    // Left, the 64 patterns.
    const thumbs = svg.append("g").attr("pointer-events", "none").attr("shape-rendering", "crispEdges"); // or seams show between the pixels
    basis.forEach((w, t) => {
      const max = d3.max(w, Math.abs);
      const g = thumbs.append("g").attr("transform", "translate(" + (X0 + (t % 8) * PITCH) + "," + (Y0 + Math.floor(t / 8) * PITCH) + ")");
      w.forEach((v, p) => g.append("rect").attr("x", (p % 8) * PX).attr("y", Math.floor(p / 8) * PX).attr("width", PX).attr("height", PX).attr("fill", signed(c, v, max)));
    });
    svg.append("rect").attr("class", "dct-chosen").attr("width", 8 * PX + 4).attr("height", 8 * PX + 4).attr("fill", "none").attr("stroke", c.ink).attr("stroke-width", 2).attr("pointer-events", "none");
    // On top, one target per pattern: hovered with a mouse, tapped, clicked.
    svg.append("g").selectAll("rect").data(d3.range(64)).join("rect")
      .attr("class", "dct-pattern").attr("data-t", t => t)
      .attr("x", t => X0 + (t % 8) * PITCH - 1.5).attr("y", t => Y0 + Math.floor(t / 8) * PITCH - 1.5)
      .attr("width", PITCH).attr("height", PITCH).attr("fill", "transparent").style("cursor", "pointer")
      .on("pointerenter", (e, t) => e.pointerType === "mouse" && choose(t))
      .on("click", (e, t) => choose(t));
    const below = Y0 + 8 * PITCH + fs;
    text(X0, below, "horizontal frequency →", c.muted);
    text(X0, below + fs * 1.4, "vertical frequency ↓", c.muted);

    // Right, the chosen pattern over the blocks, the luminance, the product.
    const lab = fs * 1.4;
    const span = d3.max(win, w => w.r) + 1;
    const tall = span * 8 * cell + (span - 1) * GAP;
    rowY = [0, 1, 2].map(r => Y0 + lab + r * (lab + tall + 12));
    label = ROWS.map((words, r) => text(RX, rowY[r] - fs * 0.45, words));
    const px = win.flatMap((w, n) => d3.range(64).map(p => ({ n, p, x: RX + w.c * (8 * cell + GAP) + (p % 8) * cell, dy: w.r * (8 * cell + GAP) + Math.floor(p / 8) * cell })));
    const row = (r, cls) =>
      svg.append("g").selectAll("rect").data(px).join("rect").attr("class", cls).attr("data-b", d => win[d.n].name)
        .attr("x", d => d.x).attr("y", d => rowY[r] + d.dy).attr("width", cell).attr("height", cell)
        .attr("fill", c.paper).attr("stroke", c.rule).attr("stroke-width", 0.5);
    row(0, "dct-px");
    row(1, "dct-lum").attr("fill", d => d3.interpolateRgb(c.paper, c.ink)(lum[d.n][d.p] / lmax));
    row(2, "dct-prod");
    // Where the burst is, outlined on the pattern: the pixels it weighs.
    svg.append("g").selectAll("rect").data(px.filter(d => lum[d.n][d.p] > 1e-9)).join("rect")
      .attr("x", d => d.x).attr("y", d => rowY[0] + d.dy).attr("width", cell).attr("height", cell)
      .attr("fill", "none").attr("stroke", c.ink).attr("stroke-width", 1.5).attr("pointer-events", "none");
    // The sums, laid out as the blocks are.
    const sy = rowY[2] + tall + fs * 1.3;
    sumText = win.map(w => text(RX + w.c * COL, sy + w.r * fs * 1.3, "").attr("class", "dct-sum").attr("data-b", w.name).attr("font-weight", 700));
    svg.attr("viewBox", "0 0 " + W + " " + Math.ceil(Math.max(below + fs * 2, sy + (span - 1) * fs * 1.3 + fs * 0.6)));
    update(false);
  }

  // The chosen pattern: its pixels, the products, and the two sums, which
  // count to their new values.
  function update(animate) {
    playing.forEach(t => t.kill());
    playing = [];
    const c = ctx.colors();
    const w = basis[chosen];
    const wmax = d3.max(w, Math.abs);
    const prod = lum.map(L => L.map((y, p) => y * w[p]));
    const pmax = d3.max(prod, P => d3.max(P, Math.abs));
    const sums = prod.map(P => d3.sum(P));
    svg.select(".dct-chosen").attr("data-t", chosen).attr("x", X0 + (chosen % 8) * PITCH - 2).attr("y", Y0 + Math.floor(chosen / 8) * PITCH - 2);
    label[0].text("pattern " + name(chosen));
    const rects = [...svg.selectAll("rect.dct-px").nodes(), ...svg.selectAll("rect.dct-prod").attr("data-v", d => prod[d.n][d.p]).nodes()];
    const to = rects.map(r => {
      const d = r.__data__;
      return r.classList.contains("dct-px") ? signed(c, w[d.p], wmax) : signed(c, prod[d.n][d.p], pmax);
    });
    sumText.forEach((s, n) => s.attr("data-sum", sums[n]));
    note.text("Pattern " + name(chosen) + ": coefficient " + win.map((b, n) => fmt(sums[n]) + " in " + b.name).join(", ") + ".");
    const from = win.map(b => shown[b.name] || 0);
    shown = Object.fromEntries(win.map((b, n) => [b.name, sums[n]]));
    const write = (t, mix) => {
      rects.forEach((r, n) => r.setAttribute("fill", mix ? mix[n](t) : to[n]));
      sumText.forEach((s, n) => s.text(win[n].name + ": " + fmt(from[n] + (sums[n] - from[n]) * t)));
    };
    if (!animate) return write(1);
    // From wherever the last change was cut short.
    const mix = rects.map((r, n) => d3.interpolateRgb(r.getAttribute("fill"), to[n]));
    const tw = { t: 0 };
    playing.push(gsap.to(tw, { t: 1, duration: 0.35, ease: "power1.out", onUpdate: () => write(tw.t, mix) }));
  }

  function choose(t) {
    if (t === chosen) return;
    chosen = t;
    update(!ctx.still());
  }

  svg.on("keydown", e => {
    const by = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    if (!by) return;
    e.preventDefault();
    const u = Math.min(7, Math.max(0, Math.floor(chosen / 8) + by[0]));
    const v = Math.min(7, Math.max(0, (chosen % 8) + by[1]));
    choose(u * 8 + v);
  });

  // A photosite picked in the pipeline figure: its blocks, drawn whole.
  burst.addEventListener("change", () => {
    follow();
    paint();
  });

  return { steps: 1, show: () => paint(), redraw: () => paint() };
}
