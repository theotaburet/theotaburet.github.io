// The simulated embedding of the article's opening figure, with the
// article's own maths (checked against the paper's code in ns-check.mjs).
//
//   node tools/ns-embed.mjs DIR
//
// Reads DIR/iso100.f32 and DIR/iso200.f32: (8·32+2)² photosite values each,
// float32, a 256×256 crop and its one-photosite border. Writes
// DIR/{cover,iso200,stego}.f32, 256×256 luminance in the 16-bit domain after
// a JPEG round trip at QF 100, and DIR/embed.json with the bits it carries.
import fs from "node:fs";
import path from "node:path";
import * as N from "../assets/js/ns/maths.js";

const dir = process.argv[2];
const B = 32;
const nc = 8 * B + 2;
const STEP = 256; // QF 100: a step of 1 in the 8-bit domain, 256 in the 16-bit one
const read = f => Float64Array.from(new Float32Array(fs.readFileSync(path.join(dir, f)).buffer.slice(0)));

// The JPEG coefficients of a crop: developed, ×4 from 14 to 16 bits, a DCT per block.
function coefficients(raw) {
  const Y = N.develop(raw, nc);
  const out = [];
  for (let bi = 0; bi < B; bi++) {
    for (let bj = 0; bj < B; bj++) {
      const x = new Float64Array(64);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) x[i * 8 + j] = 4 * Y[(bi * 8 + i) * (nc - 2) + bj * 8 + j];
      out.push(N.dct8(x));
    }
  }
  return out;
}

// Quantised, then back to pixels: what a viewer of the JPEG sees.
function decode(coeffs) {
  const Y = new Float32Array(256 * 256);
  coeffs.forEach((c, k) => {
    const q = c.map(v => Math.round(v / STEP) * STEP);
    const x = N.idct8(q);
    const bi = Math.floor(k / B);
    const bj = k % B;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) Y[(bi * 8 + i) * 256 + bj * 8 + j] = x[i * 8 + j];
  });
  return Y;
}

const cover = read("iso100.f32");
const c100 = coefficients(cover);
const t0 = Date.now();
const e = N.embed(cover, B, x => 16 * (1.15 * x - 1150), new Array(64).fill(STEP), 5, N.rng(2020));
const stego = c100.map((c, k) => (e.blocks[k] ? c.map((v, t) => v + e.blocks[k][t]) : c));
fs.writeFileSync(path.join(dir, "cover.f32"), Buffer.from(decode(c100).buffer));
fs.writeFileSync(path.join(dir, "stego.f32"), Buffer.from(decode(stego).buffer));
fs.writeFileSync(path.join(dir, "iso200.f32"), Buffer.from(decode(coefficients(read("iso200.f32"))).buffer));
fs.writeFileSync(path.join(dir, "embed.json"), JSON.stringify({ bits: e.bits, drawn: e.blocks.filter(Boolean).length, total: B * B, ms: Date.now() - t0 }));
