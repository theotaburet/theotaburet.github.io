// §4 of the natural steganography article: why the naive embedding fails.
//
// The stego signal of 8×8 blocks of 8×8 pixels, drawn twice: (a) each DCT
// coefficient on its own, with its own variance, the diagonal of Σ; (b) all
// together, as the sensor makes it: independent noise on the photosites,
// developed. (b) is the law s = L n draws from, here at a size where a
// Cholesky factor would take seconds. The histograms are the same, and so is
// the correlation of neighbouring pixels inside a block; across a block
// border (a) has none. The eye hardly sees it; a detector does.
//
// The numbers of the draw on screen are left on the figure's element
// (data-border-a, data-border-b, data-sd-a, data-sd-b) for tools/page-check.mjs.
const B = 8; // blocks a side
const P = 8 * B; // pixels a side
const W = 520;
const H = 200;

// How much pixels side by side move together, over the pairs that straddle
// the given columns and rows.
function together(img, cuts) {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (const k of cuts) {
    for (let r = 0; r < P; r++) {
      for (const [a, b] of [[img[r * P + k], img[r * P + k + 1]], [img[k * P + r], img[(k + 1) * P + r]]]) {
        ab += a * b;
        aa += a * a;
        bb += b * b;
      }
    }
  }
  return ab / Math.sqrt(aa * bb);
}
const BORDERS = Array.from({ length: B - 1 }, (_, i) => 8 * i + 7); // after columns 7, 15, …
const MIDDLES = Array.from({ length: P - 1 }, (_, k) => k).filter(k => k % 8 !== 7); // every pair inside a block

export function mount(el, ctx) {
  const { d3, maths } = ctx;
  // The variance of each of the 64 coefficients of a block, Σ's diagonal.
  const M = maths.photositesToDct(1);
  const S = maths.covariance(M, new Float64Array(M.cols).fill(1));
  const sd = Float64Array.from({ length: 64 }, (_, t) => Math.sqrt(S[t * 65]));
  let seed = 1;
  let draw = null;

  function sample() {
    const rand = maths.rng(seed);
    const a = new Float64Array(P * P);
    for (let bi = 0; bi < B; bi++) {
      for (let bj = 0; bj < B; bj++) {
        const x = maths.idct8(Float64Array.from(sd, s => s * maths.gauss(rand)));
        for (let p = 0; p < 64; p++) a[(bi * 8 + (p >> 3)) * P + bj * 8 + (p & 7)] = x[p];
      }
    }
    const raw = Float64Array.from({ length: (P + 2) * (P + 2) }, () => maths.gauss(rand));
    const b = maths.develop(raw, P + 2);
    draw = [a, b].map(img => ({
      img,
      sd: Math.sqrt(img.reduce((s, v) => s + v * v, 0) / img.length),
      border: together(img, BORDERS),
      inside: together(img, MIDDLES)
    }));
    Object.assign(el.dataset, { borderA: draw[0].border, borderB: draw[1].border, sdA: draw[0].sd, sdB: draw[1].sd });
  }

  el.textContent = "";
  // Side by side even on a phone: the point is to compare them.
  const views = d3.select(el).append("div").attr("class", "ns-views").style("grid-template-columns", "1fr 1fr");
  const pics = ["(a) each coefficient on its own", "(b) all together, as the sensor makes it"].map(label => {
    const v = views.append("div");
    const canvas = v.append("canvas").attr("width", P).attr("height", P).attr("role", "img")
      .style("display", "block").style("width", "100%").style("height", "auto").style("image-rendering", "pixelated");
    v.append("span").attr("class", "ns-view-label").text(label);
    return canvas;
  });
  const svg = d3.select(el).append("svg").attr("viewBox", "0 0 " + W + " " + H).attr("role", "img")
    .attr("aria-label", "Histograms of the two draws, alike, and the correlation of neighbouring pixels: alike inside a block, near zero across a border for the independent draw only.");
  const controls = d3.select(el).append("div").attr("class", "ns-controls");
  controls.append("button").attr("type", "button").attr("class", "btn btn-sm btn-outline-secondary").text("Draw again")
    .on("click", () => {
      seed++;
      sample();
      paint();
    });
  d3.select(el).append("p").attr("class", "ns-view-label").style("text-align", "center")
    .text("In the paper, drawn each on its own, the signal is caught every time at QF 100: P_E = 0.0 %, against 42.9 % for J-Cov-NS (Table I).");

  function paint() {
    const c = ctx.colors();
    const fs = ctx.textSize(svg.node());
    const scale = 3 * draw[1].sd;

    // The pictures: grey around the middle, the same scale for both.
    draw.forEach((d, n) => {
      const g = pics[n].node().getContext("2d");
      const img = g.createImageData(P, P);
      d.img.forEach((v, p) => {
        const grey = Math.max(0, Math.min(255, 128 + (127 * v) / scale));
        img.data.set([grey, grey, grey, 255], p * 4);
      });
      g.putImageData(img, 0, 0);
      pics[n].attr("aria-label", (n ? "Joint" : "Independent") + " draw, back in pixels" + (n ? "" : ": the 8 by 8 grid of blocks shows"));
    });

    svg.selectAll("*").remove();
    const hue = [c.A, c.B];
    const text = (x, y, words, anchor) => svg.append("text").attr("x", x).attr("y", y).attr("fill", c.ink).attr("font-size", fs).attr("text-anchor", anchor || "start").text(words);

    // Left: the two histograms, one over the other.
    const x = d3.scaleLinear([-scale, scale], [10, 240]);
    const bins = d3.bin().domain(x.domain()).thresholds(d3.range(-scale, scale, scale / 10));
    const hs = draw.map(d => bins(d.img));
    const y = d3.scaleLinear([0, d3.max(hs, h => d3.max(h, b => b.length))], [H - 30, 40]);
    hs.forEach((h, n) => {
      svg.append("path").attr("fill", "none").attr("stroke", hue[n]).attr("stroke-width", 2.5)
        .attr("d", d3.line().curve(d3.curveStepAfter)(h.flatMap(b => [[x(b.x0), y(b.length)], [x(b.x1), y(b.length)]])));
    });
    svg.append("line").attr("x1", 10).attr("x2", 240).attr("y1", H - 30).attr("y2", H - 30).attr("stroke", c.muted);
    text(125, H - 8, "pixel value", "middle");
    text(10, 16, "histograms: the same");

    // Right: neighbouring pixels, inside a block and across a border, a
    // line for each, spaced by the text so it holds on a phone.
    const bx = d3.scaleLinear([0, 1], [390, 510]);
    text(280, 16, "pixels side by side, correlation");
    [["inside a block", "inside"], ["across a border", "border"]].forEach(([label, key], row) => {
      const y0 = 30 + fs * 1.4 + row * fs * 4.2;
      text(280, y0, label);
      draw.forEach((d, n) => {
        const yy = y0 + fs * 1.3 * (n + 1);
        const r = Math.max(0, d[key]);
        svg.append("rect").attr("x", bx(0)).attr("y", yy - fs * 0.75).attr("width", bx(r) - bx(0)).attr("height", fs * 0.8).attr("fill", hue[n]);
        text(bx(0) - 6, yy, (n ? "(b) " : "(a) ") + d[key].toFixed(2), "end");
      });
    });
  }

  sample();
  return { steps: 1, show: () => paint(), redraw: () => paint() };
}
