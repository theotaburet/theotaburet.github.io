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

console.log(failures ? "\n" + failures + " problem(s)" : "\nall good");
process.exit(failures ? 1 : 0);
