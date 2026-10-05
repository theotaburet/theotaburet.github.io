// §6a of the natural steganography article: the draw, in miniature.
//
// Two DCT coefficients that move together (correlation ρ), quantised with a
// step q, drawn as the scheme draws every coefficient: the first from its own
// law, its integer picked from the PMF and a continuous value consistent with
// it found again by rejection; then the second from its law given the first.
// A thousand such draws fill the ellipse a detector expects, where drawn each
// on its own they fill a round cloud. The last step counts what conditioning
// costs in bits. ρ, q and the seed are the reader's.
//
// d3 draws, gsap times: every animation tweens a number and redraws from it.
const STEPS = 6;
const R = 3.2; // the plot spans ±R standard deviations
const CLOUD = 1000;
const LAYERS = ["grid", "ell", "indep", "joint", "top", "side", "tries1", "tries2", "guide", "point", "note", "axes"];
// What each step shows; every other layer is hidden.
const SHOWN = [
  ["grid", "ell", "axes"],
  ["grid", "ell", "axes", "top", "tries1", "guide"],
  ["grid", "ell", "axes", "top", "side", "tries1", "tries2", "guide", "point"],
  ["grid", "ell", "axes", "joint", "indep", "note"],
  ["grid", "ell", "axes", "joint", "note"],
  ["grid", "ell", "axes", "joint", "note"]
];

const clamp = v => Math.max(-R, Math.min(R, v));
const lerp = (a, b, t) => a + (b - a) * t;
const density = (m, sd) => v => Math.exp(-0.5 * ((v - m) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
function corr(pts) {
  let a = 0;
  let b = 0;
  let ab = 0;
  for (const [u, v] of pts) {
    a += u * u;
    b += v * v;
    ab += u * v;
  }
  return ab / Math.sqrt(a * b);
}

export function mount(el, ctx) {
  const { d3, gsap, maths } = ctx;
  let rho = 0.8;
  let q = 0.5;
  let seed = 1;
  let step = 0;
  let s = null; // the draws, recomputed when ρ, q or the seed change
  let c = ctx.colors();
  let playing = []; // the tweens of the step on screen, killed on the next

  const x = d3.scaleLinear([-R, R], [60, 360]);
  const y = d3.scaleLinear([-R, R], [400, 100]);
  let top = null; // density to height, in the panel above the plot
  let side = null; // density to width, in the panel to its right

  el.textContent = "";
  const svg = d3
    .select(el)
    .append("svg")
    .attr("viewBox", "0 0 480 420")
    .attr("role", "img")
    .attr("aria-label", "Two correlated coefficients drawn one after the other: the first from its own distribution, the second given the first. A thousand such draws fill the correlation ellipse; drawn independently they fill a round cloud.");
  const layer = {};
  LAYERS.forEach(n => (layer[n] = svg.append("g")));

  const controls = d3.select(el).append("div").attr("class", "ns-controls");
  function slider(label, min, max, by, value, set) {
    const l = controls.append("label");
    l.append("span").text(label);
    l.append("input")
      .attr("type", "range")
      .attr("min", min)
      .attr("max", max)
      .attr("step", by)
      .property("value", value)
      .on("input", function () {
        set(+this.value);
        out.text((+this.value).toFixed(2));
        compute();
        show(step, false);
      });
    const out = l.append("output").text(value.toFixed(2));
  }
  slider("Correlation ρ", 0, 0.95, 0.05, rho, v => (rho = v));
  slider("Quantisation step", 0.2, 1.5, 0.1, q, v => (q = v));
  controls
    .append("button")
    .attr("type", "button")
    .attr("class", "btn btn-sm btn-outline-secondary")
    .text("Draw again")
    .on("click", () => {
      seed++;
      compute();
      show(step, !ctx.still());
    });

  function compute() {
    const cov = Float64Array.from([1, rho, rho, 1]);
    const eye = Float64Array.from([1, 0, 0, 1]);
    const steps = [q, q];
    const K = Math.ceil(R / q) + 2; // wide enough that the tails are nothing
    const rand = maths.rng(seed);
    const one = maths.sampleSequential([0, 0], cov, 2, steps, K, rand);
    const joint = [];
    const indep = [];
    const normals = [];
    let h = 0;
    for (let i = 0; i < CLOUD; i++) {
      const d = maths.sampleSequential([0, 0], cov, 2, steps, K, rand);
      joint.push([d[0].x, d[1].x]);
      // The two standard normals this draw amounts to: s = L n.
      normals.push([d[0].x, (d[1].x - rho * d[0].x) / Math.sqrt(1 - rho * rho)]);
      h += d[0].h + d[1].h;
      const e = maths.sampleSequential([0, 0], eye, 2, steps, K, rand);
      indep.push([e[0].x, e[1].x]);
    }
    const marginal = maths.entropy(maths.pmf(0, 1, q, K).p);
    s = { one, joint, indep, normals, bitsJoint: h / CLOUD, bitsIndep: 2 * marginal, rJoint: corr(joint), rIndep: corr(indep) };
    // One density scale for both panels, so the narrower law looks taller.
    const sc = Math.sqrt(1 - rho * rho);
    const peak = 1.05 * Math.max(density(0, 1)(0), density(0, sc)(0), ...one[0].p.map(p => p / q), ...one[1].p.map(p => p / q));
    top = d3.scaleLinear([0, peak], [92, 22]);
    side = d3.scaleLinear([0, peak], [368, 470]);
  }

  function text(g, at, words, fill, anchor) {
    return g
      .append("text")
      .attr("x", at[0])
      .attr("y", at[1])
      .attr("fill", fill || c.ink)
      .attr("font-size", 12)
      .attr("text-anchor", anchor || "start")
      .text(words);
  }

  function bars(g, d, across) {
    const shown = d.ks.map((k, i) => ({ k, p: d.p[i] })).filter(b => Math.abs(b.k * q) <= R);
    const sel = g.selectAll("rect").data(shown).join("rect").attr("fill", b => (b.k === d.k ? c.D : c.A));
    if (across) {
      sel
        .attr("x", b => x((b.k - 0.5) * q) + 0.5)
        .attr("width", b => Math.max(0, x((b.k + 0.5) * q) - x((b.k - 0.5) * q) - 1))
        .attr("y", b => top(b.p / q))
        .attr("height", b => top(0) - top(b.p / q));
    } else {
      sel
        .attr("y", b => y((b.k + 0.5) * q) + 0.5)
        .attr("height", b => Math.max(0, y((b.k - 0.5) * q) - y((b.k + 0.5) * q) - 1))
        .attr("x", side(0))
        .attr("width", b => side(b.p / q) - side(0));
    }
  }

  function paint() {
    c = ctx.colors();
    LAYERS.forEach(n => layer[n].selectAll("*").remove());
    const [d1, d2] = s.one;
    const sc = Math.sqrt(1 - rho * rho);

    // The quantisation: one square per pair of integers.
    const cuts = d3.range(Math.ceil(-R / q - 0.5), Math.floor(R / q - 0.5) + 1).map(k => (k + 0.5) * q);
    layer.grid.selectAll("line.v").data(cuts).join("line").attr("class", "v")
      .attr("x1", x).attr("x2", x).attr("y1", y(-R)).attr("y2", y(R)).attr("stroke", c.rule);
    layer.grid.selectAll("line.h").data(cuts).join("line").attr("class", "h")
      .attr("y1", y).attr("y2", y).attr("x1", x(-R)).attr("x2", x(R)).attr("stroke", c.rule);
    layer.grid.append("rect").attr("x", x(-R)).attr("y", y(R)).attr("width", x(R) - x(-R)).attr("height", y(-R) - y(R))
      .attr("fill", "none").attr("stroke", c.muted);

    // The law: its contours at one and two standard deviations.
    const ring = r => d3.line()(d3.range(0, 2 * Math.PI + 0.05, 0.05).map(t => [x(r * Math.cos(t)), y(r * (rho * Math.cos(t) + sc * Math.sin(t)))]));
    layer.ell.selectAll("path").data([1, 2]).join("path").attr("d", ring)
      .attr("fill", "none").attr("stroke", c.ink).attr("stroke-width", 1.5).attr("stroke-dasharray", r => (r === 2 ? "4 3" : null));

    text(layer.axes, [x(R), y(-R) + 16], "s₁", c.ink, "end");
    text(layer.axes, [x(-R) - 8, y(R) + 10], "s₂", c.ink, "end");

    // Above: the law of s₁ and its PMF, the drawn integer in red.
    bars(layer.top, d1, true);
    layer.top.append("path").attr("fill", "none").attr("stroke", c.ink)
      .attr("d", d3.line()(d3.range(-R, R + 0.001, 0.05).map(v => [x(v), top(density(0, 1)(v))])));
    // Right: the law of s₂ given s₁, sideways.
    bars(layer.side, d2, false);
    layer.side.append("path").attr("fill", "none").attr("stroke", c.ink)
      .attr("d", d3.line()(d3.range(-R, R + 0.001, 0.05).map(v => [side(density(d2.m, d2.s)(v)), y(v)])));

    // The rejection tries: s₁'s along the top edge, s₂'s down the guide. The
    // misses stay as faint red marks, the kept one in ink.
    const tries = (g, d, place) =>
      g.selectAll("circle").data(d.tried).join("circle")
        .each(function (v, i) {
          const [cx, cy] = place(v);
          d3.select(this).attr("cx", cx).attr("cy", cy);
          this.classList.toggle("miss", i < d.tried.length - 1);
        })
        .attr("r", 3.5)
        .attr("fill", (v, i) => (i < d.tried.length - 1 ? c.D : c.ink))
        .attr("opacity", (v, i) => (i < d.tried.length - 1 ? 0.35 : 1));
    tries(layer.tries1, d1, v => [x(clamp(v)), y(R)]);
    tries(layer.tries2, d2, v => [x(clamp(d1.x)), y(clamp(v))]);
    layer.guide.append("line").attr("x1", x(clamp(d1.x))).attr("x2", x(clamp(d1.x))).attr("y1", y(R)).attr("y2", y(-R))
      .attr("stroke", c.D).attr("stroke-dasharray", "3 3");
    layer.point.append("circle").attr("class", "toy-point").attr("cx", x(clamp(d1.x))).attr("cy", y(clamp(d2.x))).attr("r", 6).attr("fill", c.hot);

    layer.indep.selectAll("circle").data(s.indep).join("circle")
      .attr("cx", d => x(clamp(d[0]))).attr("cy", d => y(clamp(d[1]))).attr("r", 1.6).attr("fill", c.A).attr("opacity", 0.7);
    layer.joint.selectAll("circle").data(s.joint).join("circle")
      .attr("cx", d => x(clamp(d[0]))).attr("cy", d => y(clamp(d[1]))).attr("r", 1.6).attr("fill", c.B).attr("opacity", 0.85);

    // The strip above the plot, once the panels are gone: the legend, L, or the bits.
    if (step === 3) {
      text(layer.note, [60, 40], "● drawn as the scheme does,  ρ̂ = " + s.rJoint.toFixed(2), c.B);
      text(layer.note, [60, 64], "● each drawn on its own,  ρ̂ = " + s.rIndep.toFixed(2), c.A);
    } else if (step === 4) {
      text(layer.note, [60, 40], "s = L n,   L = [ 1   0 ;  " + rho.toFixed(2) + "   " + sc.toFixed(2) + " ]");
      text(layer.note, [60, 64], "n: two independent standard normals", c.muted);
    } else if (step === 5) {
      const w = d3.scaleLinear([0, Math.max(s.bitsIndep, s.bitsJoint)], [0, 300]);
      text(layer.note, [60, 26], "drawn together: " + s.bitsJoint.toFixed(2) + " bits");
      layer.note.append("rect").attr("x", 60).attr("y", 31).attr("height", 10).attr("width", w(s.bitsJoint)).attr("fill", c.B);
      text(layer.note, [60, 62], "each on its own: " + s.bitsIndep.toFixed(2) + " bits", c.muted);
      layer.note.append("rect").attr("x", 60).attr("y", 67).attr("height", 10).attr("width", w(s.bitsIndep)).attr("fill", c.A);
    }
  }

  // The misses come one by one and fade to marks; the kept one stays.
  function rejection(g) {
    const dots = g.selectAll("circle").nodes();
    const tl = gsap.timeline();
    tl.set(dots, { opacity: 0 });
    dots.forEach(d => {
      tl.to(d, { opacity: 1, duration: 0.15 });
      if (d.classList.contains("miss")) tl.to(d, { opacity: 0.35, duration: 0.2 }, "+=0.1");
    });
    return tl;
  }

  // The thousand draws arrive, the scheme's first, then the independent ones.
  function rain() {
    const joint = layer.joint.selectAll("circle").nodes();
    const indep = layer.indep.selectAll("circle").nodes();
    gsap.set([...joint, ...indep], { opacity: 0 });
    return gsap.timeline()
      .to(joint, { opacity: 0.85, duration: 0.01, stagger: 1.2 / joint.length })
      .to(indep, { opacity: 0.7, duration: 0.01, stagger: 1.2 / indep.length });
  }

  // Each draw starts as the pair of standard normals it came from and is bent
  // into place by L.
  function unbend() {
    const dots = layer.joint.selectAll("circle");
    const mix = { t: 0 };
    const place = () =>
      dots
        .attr("cx", (d, i) => x(clamp(lerp(s.normals[i][0], d[0], mix.t))))
        .attr("cy", (d, i) => y(clamp(lerp(s.normals[i][1], d[1], mix.t))));
    place();
    return gsap.to(mix, { t: 1, duration: 1.6, delay: 0.4, ease: "power2.inOut", onUpdate: place });
  }

  // Repainted from scratch each time, so a step cut short never leaves
  // half-faded dots behind it; then, if asked, the step plays its entrance.
  function show(i, animate) {
    playing.forEach(t => t.kill());
    playing = [];
    step = i;
    paint();
    const on = new Set(SHOWN[i]);
    LAYERS.forEach(n => {
      const node = layer[n].node();
      const opacity = on.has(n) ? 1 : 0;
      if (animate) playing.push(gsap.fromTo(node, { opacity: node.style.opacity === "" ? opacity : +node.style.opacity }, { opacity, duration: 0.4 }));
      else gsap.set(node, { opacity });
    });
    if (!animate) return;
    if (i === 1) playing.push(rejection(layer.tries1));
    if (i === 2) {
      playing.push(rejection(layer.tries2));
      playing.push(gsap.from(layer.point.node(), { opacity: 0, duration: 0.4, delay: 0.25 * s.one[1].tried.length + 0.2 }));
    }
    if (i === 3) playing.push(rain());
    if (i === 4) playing.push(unbend());
  }

  compute();
  return { steps: STEPS, show, redraw: () => show(step, false) };
}
