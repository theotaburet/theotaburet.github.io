// §3 of the natural steganography article: the dependencies.
//
// Σ = M diag(v) Mᵀ for 3×3 blocks, worked out live, with v uniform: the
// correlation between any two of their 576 DCT coefficients. Left, the
// blocks as they lie, coloured by the correlation with the coefficient
// chosen in the centre block. Middle, all of Σ, read entry by entry with
// the loupe, its blocks named along its sides and the chosen coefficient's
// row outlined: the left picture, unrolled. Right, the chosen coefficient's
// column of Σ turned back into pixels: what knowing it says about every
// pixel around, its own waveform and the trace it leaves past the borders.
// Three developments take the dependencies apart, as Fig. 8 of the paper
// does.
import { loupe } from "./loupe.js";

const N = 576;
const NAMES = ["C", "N", "W", "E", "S", "NW", "NE", "SW", "SE"]; // Σ's block order
const SLOT = { C: [1, 1], N: [0, 1], W: [1, 0], E: [1, 2], S: [2, 1], NW: [0, 0], NE: [0, 2], SW: [2, 0], SE: [2, 2] };
const CELL = 10;
const SIDE = 8 * CELL + 4; // a block and the gap after it
const DEV = {
  full: ["demosaicking + luminance", {}],
  red: ["red channel only", { luma: { R: 1 } }],
  lowpass: ["low-pass only", { mosaic: false, kernel: [[1, 2, 1], [2, 4, 2], [1, 2, 1]].map(r => r.map(v => v / 16)) }]
};

const block = k => NAMES[Math.floor(k / 64)];
const mode = k => [Math.floor((k % 64) / 8), k % 8];
const name = k => block(k) + " (" + mode(k).join(", ") + ")";

export function mount(el, ctx) {
  const { d3, maths } = ctx;
  let dev = "full";
  let chosen = 1; // mode (0, 1) of the centre block
  let S = null;
  let sd = null;
  const corr = (i, j) => S[i * N + j] / (sd[i] * sd[j]);

  function compute() {
    const M = maths.photositesToDct(3, DEV[dev][1]);
    S = maths.covariance(M, new Float64Array(M.cols).fill(1));
    sd = Float64Array.from({ length: N }, (_, i) => Math.sqrt(S[i * N + i]));
  }
  compute(); // before the loupe, which reads Σ as soon as it is laid

  el.textContent = "";
  const controls = d3.select(el).append("div").attr("class", "ns-controls").attr("role", "radiogroup").attr("aria-label", "Development");
  const group = "cov-dev-" + Math.random().toString(36).slice(2);
  Object.entries(DEV).forEach(([key, [label]]) => {
    const l = controls.append("label");
    l.append("input").attr("type", "radio").attr("name", group).attr("value", key).property("checked", key === dev)
      .on("change", () => {
        dev = key;
        compute();
        paint();
      });
    l.append("span").text(label);
  });

  const views = d3.select(el).append("div").attr("class", "ns-views is-wide");
  const pick = views.append("div").attr("class", "cov-pick");
  const picker = pick.append("svg").attr("viewBox", "0 0 " + 3 * SIDE + " " + 3 * SIDE).attr("tabindex", 0)
    .attr("role", "group").attr("aria-label", "Coefficients of 3 by 3 blocks, coloured by their correlation with the chosen one. Choose a coefficient of the centre block with the arrow keys, or click it.");
  pick.append("span").attr("class", "ns-view-label").text("Correlation with the chosen coefficient: click one in the centre block");
  const mat = views.append("div").attr("class", "ns-view cov-mat");
  const canvas = mat.append("canvas").attr("width", N).attr("height", N).style("image-rendering", "auto").node();
  // Over Σ, its 9 × 9 squares, a pair of blocks each, and their names.
  const tiles = mat.append("svg").attr("viewBox", "0 0 " + N + " " + N).attr("aria-hidden", "true");
  mat.attr("aria-label", "All of Σ, 576 by 576 coefficients, 64 per block in the order C, N, W, E, S, NW, NE, SW, SE. The chosen coefficient's row is outlined. Magnifier: move it with the arrow keys.");
  mat.append("span").attr("class", "ns-view-label").text("All of Σ, 576 × 576, block by block; outlined, the chosen coefficient's row: the left picture, unrolled");
  const wave = views.append("div").attr("class", "cov-wave");
  const waves = wave.append("svg").attr("viewBox", "0 0 " + 3 * SIDE + " " + 3 * SIDE).attr("role", "img");
  wave.append("span").attr("class", "ns-view-label").text("Back in pixels: what the chosen coefficient says about its surroundings");
  const note = d3.select(el).append("p").attr("class", "ns-view-label").style("text-align", "center").attr("aria-live", "polite");

  const lens = loupe([mat.node()], {
    zoom: 12,
    size: 120,
    value(fx, fy) {
      const i = Math.min(N - 1, Math.floor(fy * N));
      const j = Math.min(N - 1, Math.floor(fx * N));
      return name(i) + " × " + name(j) + ": " + corr(i, j).toFixed(3);
    }
  });

  // A correlation to a colour: red for positive, blue for negative, as √|ρ|
  // so that a tenth still shows.
  function mixer(c) {
    const paper = d3.rgb(c.paper);
    const pos = d3.rgb(c.D);
    const neg = d3.rgb(c.blue);
    return r => {
      const to = r > 0 ? pos : neg;
      const t = Math.min(1, Math.sqrt(Math.abs(r)));
      return [paper.r + (to.r - paper.r) * t, paper.g + (to.g - paper.g) * t, paper.b + (to.b - paper.b) * t];
    };
  }
  const at = k => {
    const [si, sj] = SLOT[block(k)];
    const [u, v] = mode(k);
    return [sj * SIDE + v * CELL, si * SIDE + u * CELL];
  };

  function paint() {
    const c = ctx.colors();
    const mix = mixer(c);
    const css = r => d3.rgb(...mix(r)).formatHex();

    // The blocks, coloured by their correlation with the chosen coefficient.
    const cells = d3.range(N).map(k => ({ k, r: corr(chosen, k) }));
    picker.selectAll("rect.cov-cell").data(cells).join("rect")
      .attr("class", "cov-cell")
      .attr("data-block", d => block(d.k))
      .attr("data-t", d => d.k % 64)
      .attr("data-r", d => d.r)
      .attr("x", d => at(d.k)[0])
      .attr("y", d => at(d.k)[1])
      .attr("width", CELL)
      .attr("height", CELL)
      .attr("fill", d => css(d.r))
      .attr("stroke", c.rule)
      .attr("stroke-width", 0.5)
      .style("cursor", d => (d.k < 64 ? "pointer" : null))
      .on("click", (e, d) => d.k < 64 && choose(d.k));
    picker.selectAll("rect.cov-chosen").data([chosen]).join("rect").attr("class", "cov-chosen")
      .attr("x", k => at(k)[0]).attr("y", k => at(k)[1]).attr("width", CELL).attr("height", CELL)
      .attr("fill", "none").attr("stroke", c.ink).attr("stroke-width", 2).attr("pointer-events", "none");

    // Σ's squares, the blocks' names along its top and side, and the row
    // the left picture is.
    const fs = ctx.textSize(tiles.node());
    tiles.selectAll("path.cov-tiles").data([0]).join("path").attr("class", "cov-tiles")
      .attr("d", d3.range(1, 9).map(b => "M" + b * 64 + " 0V" + N + "M0 " + b * 64 + "H" + N).join(""))
      .attr("fill", "none").attr("stroke", c.muted).attr("stroke-width", 0.75).attr("vector-effect", "non-scaling-stroke");
    tiles.selectAll("text.cov-top").data(NAMES).join("text").attr("class", "cov-top")
      .attr("x", (b, n) => n * 64 + 32).attr("y", -fs * 0.4).attr("text-anchor", "middle")
      .attr("font-size", fs).attr("fill", c.muted).text(b => b);
    tiles.selectAll("text.cov-side").data(NAMES).join("text").attr("class", "cov-side")
      .attr("x", -fs * 0.3).attr("y", (b, n) => n * 64 + 32 + fs / 3).attr("text-anchor", "end")
      .attr("font-size", fs).attr("fill", c.muted).text(b => b);
    tiles.selectAll("rect.cov-row").data([chosen]).join("rect").attr("class", "cov-row").attr("data-k", k => k)
      .attr("x", 0).attr("y", k => k - 2).attr("width", N).attr("height", 5)
      .attr("fill", "none").attr("stroke", c.ink).attr("stroke-width", 1.5).attr("vector-effect", "non-scaling-stroke");

    // All of Σ, one pixel per entry.
    const g = canvas.getContext("2d");
    const img = g.createImageData(N, N);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const [r, gg, b] = mix(corr(i, j));
        const p = (i * N + j) * 4;
        img.data[p] = r;
        img.data[p + 1] = gg;
        img.data[p + 2] = b;
        img.data[p + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    lens.refresh();

    // The chosen coefficient's column of Σ, block by block through the
    // inverse DCT: Cov(pixel, c) / Var(c), the pixels it predicts.
    const px = [];
    NAMES.forEach((b, n) => {
      const col = Float64Array.from({ length: 64 }, (_, t) => S[chosen * N + n * 64 + t] / S[chosen * N + chosen]);
      maths.idct8(col).forEach((w, p) => px.push({ b, p, w }));
    });
    const top = d3.max(px, d => Math.abs(d.w));
    waves.selectAll("rect.px").data(px).join("rect").attr("class", "px")
      .attr("x", d => SLOT[d.b][1] * SIDE + (d.p % 8) * CELL)
      .attr("y", d => SLOT[d.b][0] * SIDE + Math.floor(d.p / 8) * CELL)
      .attr("width", CELL).attr("height", CELL)
      .attr("fill", d => css(d.w / top))
      .attr("stroke", c.rule)
      .attr("stroke-width", 0.5);
    waves.attr("aria-label", "The pixels around, as predicted by " + name(chosen) + ": its own waveform in the centre block, and a trace one or two pixels deep past each border.");
    let best = 64;
    for (let k = 64; k < N; k++) if (Math.abs(corr(chosen, k)) > Math.abs(corr(chosen, best))) best = k;

    note.text("Chosen: " + name(chosen) + ". Most correlated outside its block: " + name(best) + ", ρ = " + corr(chosen, best).toFixed(3) + ".");
  }

  function choose(k) {
    chosen = k;
    paint();
  }

  // The arrow keys walk the centre block.
  picker.on("keydown", e => {
    const by = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    if (!by) return;
    e.preventDefault();
    const [u, v] = mode(chosen);
    choose(Math.min(7, Math.max(0, u + by[0])) * 8 + Math.min(7, Math.max(0, v + by[1])));
  });

  return { steps: 1, show: () => paint(), redraw: () => paint() };
}
