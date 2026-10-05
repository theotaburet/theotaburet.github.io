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

console.log(failures ? "\n" + failures + " problem(s)" : "\nall good");
process.exit(failures ? 1 : 0);
