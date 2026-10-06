// §6 of the natural steganography article: drawing one real block.
//
// A Λ4 block of a flat grey patch (6000 DN), its eight neighbours already
// drawn. They are drawn here together from Σ, the law embed's lattices give
// them, and the block's law given them is the Schur complement. First in
// the DCT domain, the nine blocks as they lie: the neighbours' coefficients,
// the mean they give the centre's, and how much they narrow each one. Then
// the centre's 64 coefficients as a block, coloured by what the step is
// about, and one of them up close, chosen by the reader, at the scale of its
// quantisation step. The block is drawn as the scheme draws it, coefficient
// by coefficient (maths.sampleSequential): PMF, integer, rejection. Their σ
// narrow as the block fills in, and what each carries is the entropy of its
// PMF; the block's capacity is their sum (Fig. 14).
// The maths run in block-worker.js, off the page's thread.
const STEPS = 6;
const GRIDS = 2; // the steps that show the nine blocks' coefficients, before the centre alone
const NAMES = ["C", "N", "W", "E", "S", "NW", "NE", "SW", "SE"]; // Σ's block order
const SLOT = { C: [1, 1], N: [0, 1], W: [1, 0], E: [1, 2], S: [2, 1], NW: [0, 0], NE: [0, 2], SW: [2, 0], SE: [2, 2] };
const CC = 10; // a coefficient, in the nine blocks
const SIDE = 8 * CC + 6; // a block and the gap after it
const TOP = 3 * SIDE - 6; // the nine blocks' height, and the loupe's
const K = 5; // half the alphabet, as block-worker.js draws it
const W = 480;
const Y0 = 8;
const BC = 28; // a coefficient, in the centre block alone
const BX = 8;
const LX = BX + 8 * BC + 20; // the loupe
const LW = W - 8 - LX;
const BW = LW / (2 * K + 1); // a quantisation bin, in the loupe

export function mount(el, ctx) {
  const { d3, gsap, maths } = ctx;
  let step = 0;
  let qf = 100;
  let seed = 1;
  let chosen = 1; // the coefficient in the loupe
  let law = null; // the block given its neighbours: { mean, cov }
  let draw = null; // sampleSequential's 64 steps
  let obs = null; // the neighbours' coefficients, in Σ's block order after the centre
  let alone = null; // every coefficient's σ alone, in Σ's block order
  let playing = [];
  let shown = qf; // the quality of the draw on screen

  // A draw is asked of the worker; only the answer to the last question is
  // painted, so quick clicks never show an old one.
  const worker = new Worker(new URL("./block-worker.js", import.meta.url), { type: "module" });
  let asked = 0;
  const sample = () => worker.postMessage({ id: ++asked, seed, qf });
  worker.onmessage = ({ data }) => {
    if (data.id !== asked) return;
    ({ law, draw, obs, sd: alone } = data);
    shown = data.qf;
    show(step, false);
  };
  worker.onerror = () => {
    svg.selectAll("*").remove();
    svg.append("text").attr("x", 10).attr("y", 30).attr("font-size", 14).attr("fill", ctx.colors().ink).text("This figure could not be drawn: its worker did not start.");
  };

  el.textContent = "";
  const svg = d3.select(el).append("svg").attr("tabindex", 0).attr("role", "group")
    .attr("aria-label", "One block and its eight neighbours, as DCT coefficients: the neighbours drawn, the mean they give the centre block's coefficients and how much they narrow them. Then the centre's 64 coefficients, drawn one after the other, and one of them up close, its law against the integers the file can store: how its spread narrows and how many bits it carries. Choose the coefficient with the arrow keys, or hover or tap it.");
  const panels = svg.append("g");
  const strip = svg.append("g");

  const controls = d3.select(el).append("div").attr("class", "ns-controls");
  const quality = controls.append("span").attr("role", "radiogroup").attr("aria-label", "JPEG quality")
    .style("display", "flex").style("align-items", "center").style("gap", "0.75rem");
  quality.append("span").text("JPEG quality");
  const group = "block-qf-" + Math.random().toString(36).slice(2);
  [100, 95].forEach(q => {
    const l = quality.append("label");
    l.append("input").attr("type", "radio").attr("name", group).attr("value", q).property("checked", q === qf)
      .on("change", () => {
        qf = q;
        sample();
      });
    l.append("span").text(q);
  });
  controls.append("button").attr("type", "button").attr("class", "btn btn-sm btn-outline-secondary").text("New draw")
    .on("click", () => {
      seed++;
      sample();
    });

  const name = t => "(" + Math.floor(t / 8) + ", " + (t % 8) + ")";
  // The loupe's frame, for the text size of the moment: the curve and the
  // bars stand on the axis, the rejection's tries and the integers under it.
  const frame = fs => {
    const top = Y0 + fs * 1.8;
    const base = Y0 + TOP - fs * 1.6 - 14;
    return { top, base, h: base - top };
  };
  // A law in the loupe, bins of the quantisation around integer c. Its height
  // is the probability of a bin, as the bars', so a law narrower than a bin
  // runs off the top, where it is capped.
  const curve = (m, s, q, c, f) => {
    const px = v => LX + LW / 2 + (v / q - c) * BW;
    const pts = d3.range(161).map(j => m + s * (-4 + (8 * j) / 160)).map(v => [px(v), f.base - f.h * Math.min(1.04, (q / (s * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((v - m) / s) ** 2))]);
    return d3.line()(pts.filter(([x]) => x >= LX && x <= LX + LW));
  };

  function paint() {
    if (!draw) return; // the first draw is on its way
    const c = ctx.colors();
    const fs = ctx.textSize(svg.node());
    panels.selectAll("*").remove();
    strip.selectAll("*").remove();
    quality.style("visibility", step < GRIDS ? "hidden" : null); // nothing to quantise yet
    const y0 = Y0 + TOP + fs * 1.6; // the legend, under either picture
    const text = (x, y, words, fill, anchor) =>
      strip.append("text").attr("x", x).attr("y", y).attr("fill", fill || c.ink).attr("font-size", fs).attr("text-anchor", anchor || "start").text(words);
    svg.attr("viewBox", "0 0 " + W + " " + Math.ceil(y0 + fs * 3.6));
    if (step < GRIDS) return grid(c, fs, y0, text);
    const p = step - GRIDS; // the centre's own steps
    const steps = maths.QTABLES[shown].map(q => 256 * q);
    const before = t => Math.sqrt(law.cov[t * 65]); // σ given the neighbours only

    // Left, the centre block, a value per coefficient: what the step is about.
    const sq = t => before(t) / steps[t];
    const kmax = Math.max(1, d3.max(draw, d => Math.abs(d.k)));
    const ratio = t => draw[t].s / before(t);
    const lo = d3.min(d3.range(64), ratio);
    const hmax = d3.max(draw, d => d.h) || 1;
    const tint = (to, v) => d3.interpolateRgb(c.paper, to)(Math.max(0, Math.min(1, v)));
    const fill = [
      t => tint(c.B, sq(t)),
      t => (draw[t].k ? tint(draw[t].k > 0 ? c.D : c.blue, Math.sqrt(Math.abs(draw[t].k) / kmax)) : c.paper),
      t => tint(c.ink, (1 - ratio(t)) / (1 - lo)),
      t => tint(c.B, draw[t].h / hmax)
    ][p];
    panels.append("g").selectAll("rect").data(d3.range(64)).join("rect").attr("class", "blk-cell")
      .attr("data-t", t => t).attr("data-sq", sq).attr("data-k", t => draw[t].k).attr("data-ratio", ratio).attr("data-h", t => draw[t].h)
      .attr("x", t => BX + (t % 8) * BC).attr("y", t => Y0 + Math.floor(t / 8) * BC).attr("width", BC).attr("height", BC)
      .attr("fill", fill).attr("stroke", c.rule).attr("stroke-width", 0.5).style("cursor", "pointer")
      .on("pointerenter", (e, t) => e.pointerType === "mouse" && choose(t))
      .on("click", (e, t) => choose(t));
    panels.append("rect").attr("class", "blk-chosen").attr("data-t", chosen)
      .attr("x", BX + (chosen % 8) * BC + 1).attr("y", Y0 + Math.floor(chosen / 8) * BC + 1).attr("width", BC - 2).attr("height", BC - 2)
      .attr("fill", "none").attr("stroke", c.hot).attr("stroke-width", 2.5).attr("pointer-events", "none");
    const legend = [
      ["colour: σ / q, given the neighbours", "full at a whole step or more"],
      ["colour: the integer drawn, in order", "red above 0, blue below"],
      ["colour: how much those drawn before narrow σ", "σ after over σ before, down to " + lo.toFixed(2)],
      ["colour: bits each coefficient carries", "most: " + hmax.toFixed(2) + " bits"]
    ][p];
    text(BX, y0, legend[0]);
    text(BX, y0 + fs * 1.4, legend[1]);
    if (p === 3) {
      const total = d3.sum(draw, d => d.h);
      text(BX, y0 + fs * 2.8, "total: " + total.toFixed(2) + " bits, " + (total / 64).toFixed(2) + " a pixel").attr("class", "h-total").attr("data-qf", shown).attr("font-weight", 700);
    }
    loupe(c, fs, p, steps);
  }

  // Right, the chosen coefficient up close: its law against the integers the
  // file can store, eleven around its centre, each a quantisation step wide.
  function loupe(c, fs, p, steps) {
    const t = chosen;
    const d = draw[t];
    const q = steps[t];
    const sdN = Math.sqrt(law.cov[t * 65]);
    const f = frame(fs);
    const g = panels.append("g").attr("class", "loupe").attr("data-t", t);
    const ctr = p === 0 ? Math.round(law.mean[t] / q) : d.ks[K];
    const ks = d3.range(-K, K + 1).map(k => ctr + k);
    const x = k => LX + (k + K) * BW; // a bin's left edge, k from -K
    g.append("text").attr("x", LX).attr("y", Y0 + fs * 0.9).attr("fill", c.ink).attr("font-size", fs).attr("font-weight", 700).text(name(t));
    const value = [
      "σ/q " + (sdN / q).toFixed(2),
      "σ/q " + (d.s / q).toFixed(2),
      "σ/q " + (sdN / q).toFixed(2) + " → " + (d.s / q).toFixed(2),
      d.h.toFixed(2) + " bits"
    ][p];
    g.append("text").attr("class", "loupe-value").attr("x", LX + LW).attr("y", Y0 + fs * 0.9).attr("fill", c.ink).attr("font-size", fs).attr("text-anchor", "end").text(value);
    // The PMF, the integer drawn in red.
    if (p >= 1) {
      const bars = g.append("g").attr("class", "drawn");
      d.p.forEach((pr, k) => bars.append("rect").attr("class", "pmf-bar" + (d.ks[k] === d.k ? " is-drawn" : "")).attr("data-p", pr)
        .attr("x", x(k - K) + BW * 0.12).attr("width", BW * 0.76).attr("y", f.base - f.h * pr).attr("height", f.h * pr)
        .attr("fill", d.ks[k] === d.k ? c.D : c.A).attr("opacity", d.ks[k] === d.k ? 1 : 0.55));
    }
    // The axis, a tick at each bin's edge.
    g.append("line").attr("x1", LX).attr("x2", LX + LW).attr("y1", f.base).attr("y2", f.base).attr("stroke", c.muted);
    for (let k = -K; k <= K + 1; k++) g.append("line").attr("x1", x(k)).attr("x2", x(k)).attr("y1", f.base).attr("y2", f.base + 4).attr("stroke", c.muted);
    // The rejection: tries under the axis, the misses faint.
    if (p === 1) {
      d.tried.forEach((v, n) => {
        const at = LX + LW / 2 + (v / q - ctr) * BW;
        if (at < LX || at > LX + LW) return;
        const last = n === d.tried.length - 1;
        g.append("line").attr("class", "try").attr("x1", at).attr("x2", at).attr("y1", f.base + 1).attr("y2", f.base + 13)
          .attr("stroke", last ? c.ink : c.D).attr("stroke-width", 1.5).attr("opacity", last ? 1 : 0.45);
      });
    }
    // The integers, every other one when they would run into each other,
    // always the one drawn, in bold over its red bar.
    const wide = d3.max(ks, k => String(k).length) * 0.62 * fs > BW * 0.9;
    const mark = p >= 1 ? d.ks.indexOf(d.k) : K;
    ks.forEach((k, n) => {
      if (wide && (n - mark) % 2) return;
      const hit = p >= 1 && k === d.k;
      g.append("text").attr("x", x(n - K) + BW / 2).attr("y", f.base + 14 + fs).attr("text-anchor", "middle").attr("font-size", fs)
        .attr("fill", hit ? c.ink : c.muted).attr("font-weight", hit ? 700 : 400) // red would not read on the dark theme.text(String(k).replace("-", "−"));
    });
    // The law: given the neighbours, then given the coefficients before it too.
    if (p === 2) g.append("path").attr("d", curve(law.mean[t], sdN, q, ctr, f)).attr("fill", "none").attr("stroke", c.muted).attr("stroke-width", 1.2).attr("stroke-dasharray", "3 3");
    const [m, s] = p === 0 ? [law.mean[t], sdN] : [d.m, d.s];
    g.append("path").attr("class", "law").attr("d", curve(m, s, q, ctr, f)).attr("fill", "none").attr("stroke", c.ink).attr("stroke-width", 1.6);
  }

  // The nine blocks as they lie, each coefficient over its σ alone: the
  // neighbours drawn, the centre at the mean they give it. Then the centre's
  // σ given them over its σ alone, the neighbours set back.
  function grid(c, fs, y0, text) {
    const z = k => (k < 64 ? law.mean[k] : obs[k - 64]) / alone[k];
    const ratio = t => Math.sqrt(law.cov[t * 65]) / alone[t];
    const lo = d3.min(d3.range(64), ratio);
    const signed = v => d3.interpolateRgb(c.paper, v > 0 ? c.D : c.blue)(Math.min(1, Math.sqrt(Math.abs(v) / 2.5)));
    const grey = r => d3.interpolateRgb(c.paper, c.ink)((1 - r) / (1 - lo));
    const X = (W - TOP) / 2;
    const cells = d3.range(576).map(k => ({ k, b: NAMES[Math.floor(k / 64)], t: k % 64 }));
    panels.selectAll("rect").data(cells).join("rect").attr("class", "cond-cell")
      .attr("data-block", d => d.b).attr("data-t", d => d.t).attr("data-z", d => z(d.k))
      .attr("data-ratio", d => (d.k < 64 ? ratio(d.t) : null))
      .attr("data-mean", d => (d.k < 64 ? signed(z(d.k)) : null)) // its colour at the step before, to turn from
      .attr("x", d => X + SLOT[d.b][1] * SIDE + (d.t % 8) * CC)
      .attr("y", d => Y0 + SLOT[d.b][0] * SIDE + Math.floor(d.t / 8) * CC)
      .attr("width", CC).attr("height", CC)
      .attr("fill", d => (step === 1 && d.k < 64 ? grey(ratio(d.t)) : signed(z(d.k))))
      .attr("opacity", d => (step === 1 && d.k >= 64 ? 0.3 : 1))
      .attr("stroke", c.rule).attr("stroke-width", 0.5);
    panels.append("rect").attr("x", X + SIDE - 1).attr("y", Y0 + SIDE - 1).attr("width", 8 * CC + 2).attr("height", 8 * CC + 2)
      .attr("fill", "none").attr("stroke", c.hot).attr("stroke-width", 2);
    if (step === 0) {
      text(BX, y0, "colour: a coefficient over its σ alone");
      text(BX, y0 + fs * 1.4, "centre: the mean the neighbours give it");
    } else {
      text(BX, y0, "centre: σ given the neighbours / σ alone");
      text(BX, y0 + fs * 1.4, "strongest at " + lo.toFixed(2) + ", none at 1");
    }
  }

  function choose(t) {
    if (t === chosen) return;
    playing.forEach(p => p.kill());
    playing = [];
    chosen = t;
    paint();
  }
  svg.on("keydown", e => {
    const by = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    if (!by || step < GRIDS) return;
    e.preventDefault();
    const u = Math.min(7, Math.max(0, Math.floor(chosen / 8) + by[0]));
    const v = Math.min(7, Math.max(0, (chosen % 8) + by[1]));
    choose(u * 8 + v);
  });

  function show(i, animate) {
    playing.forEach(t => t.kill());
    playing = [];
    const from = step;
    step = i;
    paint();
    // Before the first draw is back there is nothing to animate; its answer paints the step.
    if (!animate || i === from || !draw) return;
    const centre = panels.selectAll('rect.cond-cell[data-block="C"]').nodes();
    const block = panels.selectAll("rect.blk-cell").nodes();
    if (i === 0) {
      // The neighbours, then the centre filling in, coefficient by coefficient.
      playing.push(gsap.from(panels.selectAll("rect.cond-cell:not([data-block='C'])").nodes(), { opacity: 0, duration: 0.4 }));
      playing.push(gsap.from(centre, { opacity: 0, duration: 0.25, delay: 0.5, stagger: 0.015 }));
    }
    if (i === 1) {
      // The centre turns from its means to how much it learned.
      const tw = { t: 0 };
      const mix = centre.map(r => d3.interpolateRgb(r.dataset.mean, r.getAttribute("fill")));
      const sync = () => centre.forEach((r, n) => r.setAttribute("fill", mix[n](tw.t)));
      sync();
      playing.push(gsap.to(tw, { t: 1, duration: 0.8, delay: 0.2, ease: "power1.inOut", onUpdate: sync }));
    }
    if (i === GRIDS || i === GRIDS + 3) playing.push(gsap.from(block, { opacity: 0, duration: 0.3, stagger: 0.012 }));
    if (i === GRIDS + 1) {
      // Coefficient by coefficient, in the order they are drawn; then the
      // chosen one's PMF.
      playing.push(gsap.from(block, { opacity: 0, duration: 0.2, stagger: 0.03 }));
      playing.push(gsap.from(panels.selectAll(".loupe .drawn, .loupe .try").nodes(), { opacity: 0, duration: 0.4, delay: 0.3, stagger: 0.15 }));
    }
    if (i === GRIDS + 2) {
      // The chosen one's law narrows, from the neighbours' to its own.
      const f = frame(ctx.textSize(svg.node()));
      const d = draw[chosen];
      const q = 256 * maths.QTABLES[shown][chosen];
      const sd = Math.sqrt(law.cov[chosen * 65]);
      const path = panels.select(".loupe path.law").node();
      const tw = { t: 0 };
      const sync = () => path.setAttribute("d", curve(law.mean[chosen] + (d.m - law.mean[chosen]) * tw.t, sd + (d.s - sd) * tw.t, q, d.ks[K], f));
      sync();
      playing.push(gsap.to(tw, { t: 1, duration: 1.4, delay: 0.3, ease: "power2.inOut", onUpdate: sync }));
      playing.push(gsap.from(block, { opacity: 0, duration: 0.3, stagger: 0.012 }));
    }
  }

  sample();
  svg.attr("viewBox", "0 0 " + W + " " + (Y0 + TOP + 70));
  return { steps: STEPS, show, redraw: () => show(step, false) };
}
