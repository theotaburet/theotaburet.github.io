// The maths of the natural steganography article (Taburet, Bas, Sawaya,
// Fridrich, IEEE TIFS 2020), for its figures to compute live. No DOM: Node
// imports this as it is, and tools/ns-check.mjs holds it to the paper's code.

// Bayer phase of the reference code (NS/compute/BIL): on the (8·nb+2)² grid of
// photosites, red sits on odd rows and even columns, blue on even rows and odd
// columns, green wherever row and column have the same parity.
export function cfa(i, j) {
  if (i % 2 === j % 2) return "G";
  return i % 2 ? "R" : "B";
}

// Bilinear demosaicking, as the reference: each kernel is laid on the mosaic
// and only the photosites of its own colour count.
const KERNEL = {
  R: [[0.25, 0.5, 0.25], [0.5, 1, 0.5], [0.25, 0.5, 0.25]],
  G: [[0, 0.25, 0], [0.25, 1, 0.25], [0, 0.25, 0]],
  B: [[0.25, 0.5, 0.25], [0.5, 1, 0.5], [0.25, 0.5, 0.25]]
};
export const LUMA = { R: 0.299, G: 0.587, B: 0.114 }; // ITU-R BT.601, as the code

// The 8×8 DCT-II basis: A[u][x] = c(u) cos((2x+1)uπ/16), orthonormal.
export const A = Array.from({ length: 8 }, (_, u) =>
  Array.from({ length: 8 }, (_, x) => (u ? 0.5 : Math.SQRT1_2 / 2) * Math.cos(((2 * x + 1) * u * Math.PI) / 16))
);

// The order the reference puts blocks in, row-major indices of the nb×nb grid:
// for 3×3, the centre first, then N, W, E, S, then NW, NE, SW, SE.
export const BLOCK_ORDER = { 1: [0], 3: [4, 1, 3, 5, 7, 0, 2, 6, 8] };

// The luminance of pixel (p, q) as weights on the photosites: the demosaicked
// R, G and B of photosite (p+1, q+1), mixed. The one-photosite border is what
// the kernels reach past the blocks.
function lumaRow(p, q, nc) {
  const w = new Map();
  const i = p + 1;
  const j = q + 1;
  for (const ch of ["R", "G", "B"]) {
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const r = i + di;
        const c = j + dj;
        if (r < 0 || c < 0 || r >= nc || c >= nc || cfa(r, c) !== ch) continue;
        const k = KERNEL[ch][di + 1][dj + 1];
        if (!k) continue;
        const at = r * nc + c;
        w.set(at, (w.get(at) || 0) + LUMA[ch] * k);
      }
    }
  }
  return w;
}

// M: the photosites of nb×nb blocks and their border, to the unquantised DCT
// coefficients of those blocks (eq. (24): demosaicking, luminance, selection,
// block order, DCT). Rows: blocks in BLOCK_ORDER, then the 64 modes (u, v)
// row-major. Columns: photosites row-major. Kept sparse, row by row: a
// coefficient sees only the 10×10 photosites under its block.
export function photositesToDct(nb) {
  const nc = 8 * nb + 2;
  const rows = [];
  for (const b of BLOCK_ORDER[nb]) {
    const bi = Math.floor(b / nb) * 8;
    const bj = (b % nb) * 8;
    const luma = [];
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) luma.push(lumaRow(bi + x, bj + y, nc));
    for (let u = 0; u < 8; u++) {
      for (let v = 0; v < 8; v++) {
        const acc = new Map();
        for (let x = 0; x < 8; x++) {
          for (let y = 0; y < 8; y++) {
            const f = A[u][x] * A[v][y];
            luma[x * 8 + y].forEach((wt, at) => acc.set(at, (acc.get(at) || 0) + f * wt));
          }
        }
        const idx = [...acc.keys()].sort((a, c) => a - c);
        rows.push({ idx: Int32Array.from(idx), val: Float64Array.from(idx, k => acc.get(k)) });
      }
    }
  }
  return { rows, cols: nc * nc };
}

// Σ = M diag(v) Mᵀ, dense n×n, row-major: the covariance of the stego signal
// in the DCT domain (eq. (24)). v is its variance at each photosite, where
// the covariance is diagonal, since photosites are independent. Sparse rows
// make it a few tens of milliseconds for 3×3 blocks.
export function covariance(M, v) {
  const n = M.rows.length;
  const S = new Float64Array(n * n);
  const w = new Float64Array(M.cols);
  for (let i = 0; i < n; i++) {
    const a = M.rows[i];
    for (let t = 0; t < a.idx.length; t++) w[a.idx[t]] = a.val[t] * v[a.idx[t]];
    for (let j = i; j < n; j++) {
      const b = M.rows[j];
      let s = 0;
      for (let t = 0; t < b.idx.length; t++) s += w[b.idx[t]] * b.val[t];
      S[i * n + j] = S[j * n + i] = s;
    }
    for (let t = 0; t < a.idx.length; t++) w[a.idx[t]] = 0;
  }
  return S;
}

// Lower-triangular L with L Lᵀ = S. Throws if S is not positive definite.
export function cholesky(S, n) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = S[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) {
        if (!(s > 0)) throw new Error("not positive definite at " + i);
        L[i * n + i] = Math.sqrt(s);
      } else L[i * n + j] = s / L[j * n + j];
    }
  }
  return L;
}

// Solves L Lᵀ x = b, in place.
function cholSolve(L, n, b) {
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * b[k];
    b[i] = s / L[i * n + i];
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * b[k];
    b[i] = s / L[i * n + i];
  }
  return b;
}

// The first k of n jointly Gaussian zero-mean variables, given the other n-k
// observed: mean S12 S22⁻¹ obs, covariance S11 - S12 S22⁻¹ S21, the Schur
// complement (eqs. (26)-(27)). The reference uses a pseudo-inverse; S22 is
// positive definite here, so a Cholesky solve gives the same, faster.
export function conditional(S, n, k, obs) {
  const m = n - k;
  const S22 = new Float64Array(m * m);
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) S22[i * m + j] = S[(k + i) * n + k + j];
  const L22 = cholesky(S22, m);
  const alpha = cholSolve(L22, m, Float64Array.from(obs));
  const X = new Float64Array(m * k); // S22⁻¹ S21, column by column
  const col = new Float64Array(m);
  for (let j = 0; j < k; j++) {
    for (let i = 0; i < m; i++) col[i] = S[(k + i) * n + j];
    cholSolve(L22, m, col);
    for (let i = 0; i < m; i++) X[i * k + j] = col[i];
  }
  const mean = new Float64Array(k);
  const cov = new Float64Array(k * k);
  for (let i = 0; i < k; i++) {
    let s = 0;
    for (let t = 0; t < m; t++) s += S[i * n + k + t] * alpha[t];
    mean[i] = s;
    for (let j = 0; j < k; j++) {
      let c = S[i * n + j];
      for (let t = 0; t < m; t++) c -= S[i * n + k + t] * X[t * k + j];
      cov[i * k + j] = c;
    }
  }
  return { mean, cov };
}

// Standard normal CDF, to double precision (Hart's algorithm, as given by
// West, "Better approximations to cumulative normal functions", 2005).
export function Phi(x) {
  const z = Math.abs(x);
  let c = 0;
  if (z <= 37) {
    const e = Math.exp((-z * z) / 2);
    if (z < 7.07106781186547) {
      let n = 3.52624965998911e-2 * z + 0.700383064443688;
      n = n * z + 6.37396220353165;
      n = n * z + 33.912866078383;
      n = n * z + 112.079291497871;
      n = n * z + 221.213596169931;
      n = n * z + 220.206867912376;
      let d = 8.83883476483184e-2 * z + 1.75566716318264;
      d = d * z + 16.064177579207;
      d = d * z + 86.7807322029461;
      d = d * z + 296.564248779674;
      d = d * z + 637.333633378831;
      d = d * z + 793.826512519948;
      d = d * z + 440.413735824752;
      c = (e * n) / d;
    } else {
      let b = z + 0.65;
      b = z + 4 / b;
      b = z + 3 / b;
      b = z + 2 / b;
      b = z + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
}

// Eq. (29): the probability that N(m, s²), quantised with step q, lands on
// each of the 2K+1 integers around round(m/q). The two outer bins take the
// tails, so the probabilities sum to 1.
export function pmf(m, s, q, K) {
  const c = Math.round(m / q);
  const ks = [];
  const p = [];
  for (let k = -K; k <= K; k++) {
    const lo = k === -K ? -Infinity : (c + k - 0.5) * q;
    const hi = k === K ? Infinity : (c + k + 0.5) * q;
    ks.push(c + k);
    p.push(Phi((hi - m) / s) - Phi((lo - m) / s));
  }
  return { ks, p };
}

// Shannon entropy, in bits: what one draw from p can carry.
export function entropy(p) {
  let h = 0;
  for (const x of p) if (x > 0) h -= x * Math.log2(x);
  return h;
}

// mulberry32: a small seeded generator, so a draw can be replayed.
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A standard normal from a uniform generator (Box-Muller).
export function gauss(rand) {
  let u = 0;
  while (!u) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

// Draws the n variables of N(mean, cov) one after the other, as the scheme
// does inside a block (section V-C): each one's law given the ones before is
// read off the Cholesky factor; its integer is picked from the PMF of that
// law; then a continuous value that rounds to the integer is found again by
// rejection, and the next variable is conditioned on it. Returns every step,
// tries included, so a figure can replay them.
export function sampleSequential(mean, cov, n, steps, K, rand) {
  const L = cholesky(cov, n);
  const z = new Float64Array(n); // the standard normals the draws amount to: s = mean + L z
  const out = [];
  for (let i = 0; i < n; i++) {
    let m = mean[i];
    for (let j = 0; j < i; j++) m += L[i * n + j] * z[j];
    const s = L[i * n + i];
    const q = steps[i];
    const { ks, p } = pmf(m, s, q, K);
    let u = rand();
    let t = 0;
    while (t < p.length - 1 && u >= p[t]) u -= p[t++];
    const k = ks[t];
    const lo = t === 0 ? -Infinity : (k - 0.5) * q;
    const hi = t === p.length - 1 ? Infinity : (k + 0.5) * q;
    // ponytail: plain rejection, as the paper; it averages 2K+1 tries per
    // variable, since a square is picked as often as it is likely.
    const tried = [];
    let x;
    do {
      x = m + s * gauss(rand);
      tried.push(x);
    } while (x < lo || x >= hi);
    z[i] = (x - m) / s;
    out.push({ m, s, ks, p, k, x, tried, h: entropy(p) });
  }
  return out;
}
