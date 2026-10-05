// Checks the maths behind the natural steganography article against the
// paper's own code, and against what the paper says must hold.
//
//   node tools/ns-check.mjs
//
// tools/ns-reference.json comes from tools/ns-reference.py, which runs the
// reference implementation. Nothing here needs a package.
import fs from "node:fs";
import * as N from "../assets/js/ns/maths.js";

const R = JSON.parse(fs.readFileSync(new URL("ns-reference.json", import.meta.url)));
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "ok   " : "FAIL ") + name + (detail ? "  (" + detail + ")" : ""));
  if (!ok) failures++;
}
const dense = (M, r) => {
  const d = new Float64Array(M.cols);
  M.rows[r].idx.forEach((k, t) => (d[k] = M.rows[r].val[t]));
  return d;
};
const worst = (a, b) => a.reduce((w, x, i) => Math.max(w, Math.abs(x - b[i])), 0);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

// --- The development pipeline as one matrix, M (section III of the paper).
{
  const M1 = N.photositesToDct(1);
  const M3 = N.photositesToDct(3);
  report("M for one block is 64 × 100", M1.rows.length === 64 && M1.cols === 100);
  report("M for 3×3 blocks is 576 × 676", M3.rows.length === 576 && M3.cols === 676);
  let w1 = 0;
  R.M1.forEach((row, r) => (w1 = Math.max(w1, worst(dense(M1, r), row))));
  report("M for one block matches the reference", w1 < 1e-12, "worst " + w1.toExponential(1));
  let w3 = 0;
  for (const [r, row] of Object.entries(R.M3_rows)) w3 = Math.max(w3, worst(dense(M3, +r), row));
  M3.rows.forEach((_, r) => {
    const d = dense(M3, r);
    w3 = Math.max(w3, Math.abs(d.reduce((a, b) => a + b, 0) - R.M3_sum[r]), Math.abs(Math.hypot(...d) - R.M3_norm[r]));
  });
  report("M for 3×3 blocks matches the reference, block order included", w3 < 1e-12, "worst " + w3.toExponential(1));
  let wa = 0;
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let s = 0;
      for (let k = 0; k < 8; k++) s += N.A[u][k] * N.A[v][k];
      wa = Math.max(wa, Math.abs(s - (u === v ? 1 : 0)));
    }
  }
  report("the 8×8 DCT is orthonormal", wa < 1e-14, "worst " + wa.toExponential(1));
}

// --- Covariance and conditioning (sections III-H, IV and V-B).
{
  const M3 = N.photositesToDct(3);
  const n = 576;
  const S = N.covariance(M3, R.v);
  for (let i = 0; i < n; i++) S[i * (n + 1)] += 1e-3; // the reference sampler's eps
  let ws = 0;
  R.S_diag.forEach((d, i) => (ws = Math.max(ws, rel(S[i * (n + 1)], d))));
  for (const [r, row] of Object.entries(R.S_rows)) {
    row.forEach((x, c) => {
      if (Math.abs(x) > 1e-9 * R.S_diag[r]) ws = Math.max(ws, rel(S[+r * n + c], x));
    });
  }
  report("Σ = M diag(v) Mᵀ matches the reference", ws < 1e-9, "worst relative " + ws.toExponential(1));
  let sym = true;
  for (let i = 0; i < n && sym; i++) for (let j = 0; j < i; j++) if (S[i * n + j] !== S[j * n + i]) sym = false;
  report("Σ is symmetric", sym);

  // Blocks in the order C, N, W, E, S, NW, NE, SW, SE; the largest correlation
  // between two of them, on a flat photosite variance.
  const U = N.covariance(M3, new Float64Array(676).fill(1));
  const peak = (a, b) => {
    let m = 0;
    for (let i = 0; i < 64; i++) {
      for (let j = 0; j < 64; j++) {
        const p = a * 64 + i;
        const q = b * 64 + j;
        m = Math.max(m, Math.abs(U[p * n + q]) / Math.sqrt(U[p * (n + 1)] * U[q * (n + 1)]));
      }
    }
    return m;
  };
  report("blocks that do not touch are uncorrelated (NW–NE, W–E, N–S)", peak(5, 6) === 0 && peak(2, 3) === 0 && peak(1, 4) === 0);
  report("side neighbours correlate with the centre", [1, 2, 3, 4].every(b => peak(0, b) > 0.05), [1, 2, 3, 4].map(b => peak(0, b).toFixed(3)).join(" "));
  report("diagonal neighbours barely do", [5, 6, 7, 8].every(b => peak(0, b) < 0.01), [5, 6, 7, 8].map(b => peak(0, b).toFixed(4)).join(" "));
  report("NE and SW, which share three photosites, more than NW and SE, which share two",
    Math.min(peak(0, 6), peak(0, 7)) > Math.max(peak(0, 5), peak(0, 8)));

  const L = N.cholesky(S, n);
  let wl = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let k = 0; k <= j; k++) s += L[i * n + k] * L[j * n + k];
      wl = Math.max(wl, Math.abs(s - S[i * n + j]) / S[i * (n + 1)]);
    }
  }
  report("Cholesky: L Lᵀ = Σ", wl < 1e-12, "worst " + wl.toExponential(1));
  let threw = false;
  try {
    N.cholesky(Float64Array.from([1, 2, 2, 1]), 2);
  } catch (e) {
    threw = true;
  }
  report("Cholesky refuses a matrix that is not positive definite", threw);

  const C = N.conditional(S, n, 64, R.obs);
  const big = Math.max(...R.cov.map(Math.abs));
  let wm = 0;
  let wc = 0;
  C.mean.forEach((m, i) => (wm = Math.max(wm, Math.abs(m - R.mean[i]) / Math.sqrt(R.cov[i * 65]))));
  C.cov.forEach((x, i) => (wc = Math.max(wc, Math.abs(x - R.cov[i]) / big)));
  report("conditional mean of a Λ4 block matches the reference", wm < 1e-9, "worst " + wm.toExponential(1) + " sd");
  report("conditional covariance (Schur complement) matches the reference", wc < 1e-9, "worst " + wc.toExponential(1));
  report("knowing the neighbours never adds variance", C.cov.every((x, i) => i % 65 || x <= S[(i / 65) * (n + 1)] + 1e-9));
}

// --- Quantised sampling (sections V-C and V-D).
{
  let wp = 0;
  for (const c of R.pmf) N.pmf(c.m, c.s, c.q, c.K).p.forEach((p, i) => (wp = Math.max(wp, Math.abs(p - c.p[i]))));
  report("PMF of eq. (29) matches the reference", wp < 1e-12, "worst " + wp.toExponential(1));
  const r = N.rng(3);
  let ws = 0;
  for (let t = 0; t < 200; t++) {
    const p = N.pmf((r() - 0.5) * 20, 0.05 + r() * 5, 0.5 + r() * 4, 1 + Math.floor(r() * 6)).p;
    ws = Math.max(ws, Math.abs(p.reduce((a, b) => a + b, 0) - 1));
  }
  report("a PMF always sums to 1", ws < 1e-12, "worst " + ws.toExponential(1));
  report("Φ: 0.5 at 0, 0.975 at 1.96, symmetric",
    Math.abs(N.Phi(0) - 0.5) < 1e-15 && Math.abs(N.Phi(1.959963984540054) - 0.975) < 1e-12 && Math.abs(N.Phi(-1.3) + N.Phi(1.3) - 1) < 1e-15);
  report("entropy: a fair coin is 1 bit, eight equal outcomes 3",
    Math.abs(N.entropy([0.5, 0.5]) - 1) < 1e-15 && Math.abs(N.entropy(new Array(8).fill(1 / 8)) - 3) < 1e-15);
  const a = N.rng(9);
  const b = N.rng(9);
  const c = N.rng(10);
  const sa = [a(), a(), a()].join();
  report("the generator replays a seed, and another seed differs", sa === [b(), b(), b()].join() && sa !== [c(), c(), c()].join());

  // A real block: Λ4, given its eight neighbours, at QF 100 (a step of 256 in
  // the 16-bit domain of the reference).
  const M3 = N.photositesToDct(3);
  const S = N.covariance(M3, R.v);
  for (let i = 0; i < 576; i++) S[i * 577] += 1e-3;
  const C = N.conditional(S, 576, 64, R.obs);
  const draw = N.sampleSequential(C.mean, C.cov, 64, new Array(64).fill(256), 5, N.rng(1));
  const inBin = d => {
    const t = d.ks.indexOf(d.k);
    const lo = t === 0 ? -Infinity : (d.k - 0.5) * 256;
    const hi = t === d.ks.length - 1 ? Infinity : (d.k + 0.5) * 256;
    return d.x >= lo && d.x < hi;
  };
  report("rejection keeps a value in the square that was drawn, every time", draw.every(inBin));
  report("and the value it keeps is the last one it tried", draw.every(d => d.tried[d.tried.length - 1] === d.x));
  const far = N.sampleSequential([12, 0], Float64Array.from([1, 0, 0, 1]), 2, [0.25, 0.25], 6, N.rng(5));
  report("the draw starts from the conditional mean it is given", Math.abs(far[0].x - 12) < 5 && Math.abs(far[1].x) < 5);

  // The toy of §6a: ρ comes back from 20 000 draws in sequence; drawn each on
  // its own, it does not; and the second, knowing the first, carries fewer bits.
  const toy = (cov, seed) => {
    const g = N.rng(seed);
    let xy = 0;
    let xx = 0;
    let yy = 0;
    let h2 = 0;
    for (let i = 0; i < 20000; i++) {
      const d = N.sampleSequential([0, 0], cov, 2, [0.25, 0.25], 20, g);
      xy += d[0].x * d[1].x;
      xx += d[0].x ** 2;
      yy += d[1].x ** 2;
      h2 += d[1].h;
    }
    return { rho: xy / Math.sqrt(xx * yy), h2: h2 / 20000 };
  };
  const joint = toy(Float64Array.from([1, 0.8, 0.8, 1]), 42);
  const apart = toy(Float64Array.from([1, 0, 0, 1]), 43);
  report("drawn in sequence, the toy recovers ρ = 0.8", Math.abs(joint.rho - 0.8) < 0.02, "ρ̂ = " + joint.rho.toFixed(3));
  report("drawn each on its own, it does not", Math.abs(apart.rho) < 0.02, "ρ̂ = " + apart.rho.toFixed(3));
  const marginal = N.entropy(N.pmf(0, 1, 0.25, 20).p);
  report("conditioning costs bits: the second carries fewer than on its own", joint.h2 < marginal - 0.3,
    joint.h2.toFixed(2) + " < " + marginal.toFixed(2) + " bits");
}

console.log(failures ? "\n" + failures + " problem(s)" : "\nall good");
process.exit(failures ? 1 : 0);
