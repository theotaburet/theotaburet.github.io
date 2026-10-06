// §2 of the natural steganography article, continued: what a DCT
// coefficient is.
//
// The 64 patterns of the 8×8 DCT, each where its coefficient sits in a
// block: slow cosines top left, fast ones bottom right. A coefficient is how
// much of its pattern a block holds, the two multiplied pixel by pixel and
// summed. The pattern chosen is laid over blocks C and E of the pipeline
// figure, multiplied by the luminance its burst left there, and the two sums
// are that pattern's coefficients in C and E, the ones its DCT step showed.
import { BURST, burstColumn } from "./fig-pipeline.js";

const PITCH = 36; // a pattern and the gap after it
const PX = 4; // a pixel of a pattern
const X0 = 8;
const Y0 = 8;
const CELL = 12; // a pixel of C and E
const GAP = 6; // between C and E
const RX = X0 + 8 * PITCH + 18;
const W = 520;
const ROWS = ["pattern", "× luminance", "= product, summed"];

export function mount(el, ctx) {
  const { d3, gsap, maths } = ctx;
  const unit = t => Float64Array.from({ length: 64 }, (_, k) => +(k === t));
  const basis = d3.range(64).map(t => maths.idct8(unit(t)));
  // The burst's luminance in C and E, in DN: the inverse DCT of its
  // coefficients there.
  const coef = burstColumn(maths);
  const lum = [4, 5].map(b => maths.idct8(coef[b]).map(v => v * BURST));
  const lmax = d3.max(lum, L => d3.max(L));
  let chosen = 1;
  let shown = [0, 0]; // the sums as written, for the next change to count from
  let playing = [];

  el.textContent = "";
  const svg = d3
    .select(el)
    .append("svg")
    .attr("viewBox", "0 0 " + W + " 420") // measured by textSize before the first paint
    .attr("tabindex", 0)
    .attr("role", "group")
    .attr("aria-label", "The 64 patterns of the 8 by 8 DCT. Choose one with the arrow keys, or hover or tap it: it is multiplied pixel by pixel by the burst's luminance in blocks C and E, and summed.");
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

    // Right, the chosen pattern over C and E, the luminance, the product.
    const lab = fs * 1.4;
    rowY = [0, 1, 2].map(r => Y0 + lab + r * (lab + 8 * CELL + 12));
    label = ROWS.map((words, r) => text(RX, rowY[r] - fs * 0.45, words));
    const px = [0, 1].flatMap(b => d3.range(64).map(p => ({ b, p, x: RX + b * (8 * CELL + GAP) + (p % 8) * CELL, dy: Math.floor(p / 8) * CELL })));
    const row = (r, cls) =>
      svg.append("g").selectAll("rect").data(px).join("rect").attr("class", cls).attr("data-b", d => "CE"[d.b])
        .attr("x", d => d.x).attr("y", d => rowY[r] + d.dy).attr("width", CELL).attr("height", CELL)
        .attr("fill", c.paper).attr("stroke", c.rule).attr("stroke-width", 0.5);
    row(0, "dct-px");
    row(1, "dct-lum").attr("fill", d => d3.interpolateRgb(c.paper, c.ink)(lum[d.b][d.p] / lmax));
    row(2, "dct-prod");
    // Where the burst is, outlined on the pattern: the pixels it weighs.
    svg.append("g").selectAll("rect").data(px.filter(d => lum[d.b][d.p] > 1e-9)).join("rect")
      .attr("x", d => d.x).attr("y", d => rowY[0] + d.dy).attr("width", CELL).attr("height", CELL)
      .attr("fill", "none").attr("stroke", c.ink).attr("stroke-width", 1.5).attr("pointer-events", "none");
    const sy = rowY[2] + 8 * CELL + fs * 1.3;
    sumText = [0, 1].map(b => text(RX + b * (8 * CELL + GAP) + 4 * CELL, sy, "", c.ink, "middle").attr("class", "dct-sum").attr("data-b", "CE"[b]).attr("font-weight", 700));
    svg.attr("viewBox", "0 0 " + W + " " + Math.ceil(Math.max(below + fs * 2, sy + fs * 0.6)));
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
    const rects = [...svg.selectAll("rect.dct-px").nodes(), ...svg.selectAll("rect.dct-prod").attr("data-v", d => prod[d.b][d.p]).nodes()];
    const to = rects.map(r => {
      const d = r.__data__;
      return r.classList.contains("dct-px") ? signed(c, w[d.p], wmax) : signed(c, prod[d.b][d.p], pmax);
    });
    sumText.forEach((s, b) => s.attr("data-sum", sums[b]));
    note.text("Pattern " + name(chosen) + ": coefficient " + fmt(sums[0]) + " in C, " + fmt(sums[1]) + " in E.");
    const from = shown;
    shown = sums;
    const write = (t, mix) => {
      rects.forEach((r, n) => r.setAttribute("fill", mix ? mix[n](t) : to[n]));
      sumText.forEach((s, b) => s.text("CE"[b] + ": " + fmt(from[b] + (sums[b] - from[b]) * t)));
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

  return { steps: 1, show: () => paint(), redraw: () => paint() };
}
