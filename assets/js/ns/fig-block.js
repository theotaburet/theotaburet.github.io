// §6 of the natural steganography article: drawing one real block.
//
// A Λ4 block of a flat grey patch (6000 DN), its eight neighbours already
// drawn. They are drawn here together from Σ, the law embed's lattices give
// them, and the block's law given them is the Schur complement: 64
// Gaussians, one panel each, at the scale of each coefficient's
// quantisation step. Then the block is drawn as the scheme draws it,
// coefficient by coefficient (maths.sampleSequential): PMF, integer,
// rejection. Their σ narrow as the block fills in, and what each carries is
// the entropy of its PMF; the block's capacity is their sum (Fig. 14).
// The maths run in block-worker.js, off the page's thread.
const STEPS = 4;
const K = 5; // half the alphabet, as block-worker.js draws it
const W = 480;
const PW = 56;
const PH = 34;
const GAP = 2;
const X0 = (W - (8 * PW + 7 * GAP)) / 2;
const Y0 = 8;
const GRID = 8 * PH + 7 * GAP;
const BW = PW / (2 * K + 1); // a quantisation bin, in a panel

export function mount(el, ctx) {
  const { d3, gsap, maths } = ctx;
  let step = 0;
  let qf = 100;
  let seed = 1;
  let law = null; // the block given its neighbours: { mean, cov }
  let draw = null; // sampleSequential's 64 steps
  let playing = [];
  let shown = qf; // the quality of the draw on screen

  // A draw is asked of the worker; only the answer to the last question is
  // painted, so quick clicks never show an old one.
  const worker = new Worker(new URL("./block-worker.js", import.meta.url), { type: "module" });
  let asked = 0;
  const sample = () => worker.postMessage({ id: ++asked, seed, qf });
  worker.onmessage = ({ data }) => {
    if (data.id !== asked) return;
    ({ law, draw } = data);
    shown = data.qf;
    show(step, false);
  };
  worker.onerror = () => {
    svg.selectAll("*").remove();
    svg.append("text").attr("x", 10).attr("y", 30).attr("font-size", 14).attr("fill", ctx.colors().ink).text("This figure could not be drawn: its worker did not start.");
  };

  el.textContent = "";
  const svg = d3.select(el).append("svg").attr("role", "img")
    .attr("aria-label", "The 64 coefficients of one block, each with its Gaussian law given the eight neighbouring blocks, drawn one after the other; then how their spread narrows and how many bits each carries.");
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

  // A law in a panel: bins of the quantisation around integer c, the curve
  // scaled to the panel's height.
  const curve = (m, s, q, c) => {
    const px = v => PW / 2 + (v / q - c) * BW;
    const pts = d3.range(41).map(j => m + s * (-4 + (8 * j) / 40)).map(v => [px(v), PH - 3 - (PH - 9) * Math.exp(-0.5 * ((v - m) / s) ** 2)]);
    return d3.line()(pts.filter(([x]) => x >= 0 && x <= PW));
  };

  function paint() {
    if (!draw) return; // the first draw is on its way
    const c = ctx.colors();
    const fs = ctx.textSize(svg.node());
    panels.selectAll("*").remove();
    strip.selectAll("*").remove();
    const steps = maths.QTABLES[shown].map(q => 256 * q);

    draw.forEach((d, i) => {
      const q = steps[i];
      const sd = Math.sqrt(law.cov[i * 65]);
      const g = panels.append("g").attr("transform", "translate(" + (X0 + (i % 8) * (PW + GAP)) + "," + (Y0 + Math.floor(i / 8) * (PH + GAP)) + ")");
      g.append("rect").attr("width", PW).attr("height", PH).attr("fill", "none").attr("stroke", c.rule);
      if (step === 0) {
        const ctr = Math.round(law.mean[i] / q);
        for (let k = -K; k <= K + 1; k++) g.append("line").attr("x1", PW / 2 + (k - 0.5) * BW).attr("x2", PW / 2 + (k - 0.5) * BW).attr("y1", PH - 3).attr("y2", PH).attr("stroke", c.muted);
        g.append("path").attr("d", curve(law.mean[i], sd, q, ctr)).attr("fill", "none").attr("stroke", c.ink).attr("stroke-width", 1.2);
        return;
      }
      const ctr = d.ks[K];
      // The PMF, the integer drawn in red.
      const drawn = g.append("g").attr("class", "drawn");
      const top = d3.max(d.p);
      d.p.forEach((p, k) => {
        const h = ((PH - 9) * p) / top;
        drawn.append("rect").attr("x", (k + 0.15) * BW).attr("width", BW * 0.7).attr("y", PH - 3 - h).attr("height", h)
          .attr("fill", d.ks[k] === d.k ? c.D : c.A).attr("opacity", step === 1 || d.ks[k] === d.k ? 1 : 0.5);
      });
      if (step === 1) {
        // The rejection: tries along the bottom, the misses faint.
        d.tried.forEach((v, t) => {
          const x = PW / 2 + (v / q - ctr) * BW;
          if (x < 0 || x > PW) return;
          drawn.append("line").attr("x1", x).attr("x2", x).attr("y1", PH - 3).attr("y2", PH)
            .attr("stroke", t === d.tried.length - 1 ? c.ink : c.D).attr("stroke-width", 1.5).attr("opacity", t === d.tried.length - 1 ? 1 : 0.4);
        });
      }
      if (step === 2) g.append("path").attr("d", curve(law.mean[i], sd, q, ctr)).attr("fill", "none").attr("stroke", c.muted).attr("stroke-dasharray", "2 2");
      g.append("path").attr("class", "law").attr("d", curve(d.m, d.s, q, ctr)).attr("fill", "none").attr("stroke", c.ink).attr("stroke-width", 1.2);
    });

    // Under the panels: σ coefficient by coefficient, or the bits.
    const text = (x, y, words, fill, anchor) =>
      strip.append("text").attr("x", x).attr("y", y).attr("fill", fill || c.ink).attr("font-size", fs).attr("text-anchor", anchor || "start").text(words);
    const y0 = Y0 + GRID + fs * 1.6;
    const y1 = y0 + 70;
    const x = d3.scaleLinear([0, 63], [X0 + 4, W - X0 - 4]);
    if (step === 2) {
      text(X0, y0, "σ / q, coefficient by coefficient: dashed, given the neighbours only");
      const y = d3.scaleLinear([0, d3.max(draw, (d, i) => Math.sqrt(law.cov[i * 65]) / steps[i])], [y1, y0 + 10]);
      strip.append("path").attr("d", d3.line()(draw.map((d, i) => [x(i), y(Math.sqrt(law.cov[i * 65]) / steps[i])]))).attr("fill", "none").attr("stroke", c.muted).attr("stroke-dasharray", "3 3");
      strip.append("path").attr("d", d3.line()(draw.map((d, i) => [x(i), y(d.s / steps[i])]))).attr("fill", "none").attr("stroke", c.ink).attr("stroke-width", 1.5);
      strip.append("line").attr("x1", x(0)).attr("x2", x(63)).attr("y1", y1).attr("y2", y1).attr("stroke", c.muted);
    }
    if (step === 3) {
      const total = d3.sum(draw, d => d.h);
      text(X0, y0, "bits each coefficient carries, the entropy of its PMF");
      const y = d3.scaleLinear([0, Math.log2(2 * K + 1)], [y1, y0 + 10]);
      strip.selectAll("rect.h-bar").data(draw).join("rect").attr("class", "h-bar").attr("data-h", d => d.h)
        .attr("x", (d, i) => x(i) - 2.5).attr("width", 5).attr("y", d => y(d.h)).attr("height", d => y1 - y(d.h)).attr("fill", c.B);
      strip.append("line").attr("x1", x(0) - 3).attr("x2", x(63) + 3).attr("y1", y1).attr("y2", y1).attr("stroke", c.muted);
      text(W - X0, y1 + fs * 1.4, "total: " + total.toFixed(2) + " bits, " + (total / 64).toFixed(2) + " a pixel", c.ink, "end").attr("class", "h-total").attr("data-qf", shown).attr("font-weight", 700);
    }
    svg.attr("viewBox", "0 0 " + W + " " + Math.ceil(y1 + fs * 2));
  }

  function show(i, animate) {
    playing.forEach(t => t.kill());
    playing = [];
    const from = step;
    step = i;
    paint();
    if (!animate || i === from) return;
    if (i === 1) {
      // Coefficient by coefficient, in the order they are drawn.
      playing.push(gsap.from(panels.selectAll("g.drawn").nodes(), { opacity: 0, duration: 0.25, stagger: 0.05 }));
    }
    if (i === 2) {
      const tw = { t: 0 };
      const steps = maths.QTABLES[shown].map(q => 256 * q);
      const laws = panels.selectAll("path.law").nodes();
      const sync = () =>
        draw.forEach((d, n) => {
          const sd = Math.sqrt(law.cov[n * 65]);
          laws[n].setAttribute("d", curve(d.m, sd + (d.s - sd) * tw.t, steps[n], d.ks[K]));
        });
      sync();
      playing.push(gsap.to(tw, { t: 1, duration: 1.4, delay: 0.3, ease: "power2.inOut", onUpdate: sync }));
    }
    if (i === 3) playing.push(gsap.from(strip.selectAll("rect.h-bar").nodes(), { scaleY: 0, transformOrigin: "50% 100%", duration: 0.3, stagger: 0.012, clearProps: "transform" }));
  }

  sample();
  svg.attr("viewBox", "0 0 " + W + " " + (Y0 + GRID + 110));
  return { steps: STEPS, show, redraw: () => show(step, false) };
}
