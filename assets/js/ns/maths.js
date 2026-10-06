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
export const KERNEL = {
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
// the kernels reach past the blocks. opts.luma changes the mix (a single
// channel, to see what demosaicking alone does); opts.mosaic === false drops
// the mosaic and lays opts.kernel on every photosite, a plain low-pass filter
// (Fig. 8b).
function lumaRow(p, q, nc, opts = {}) {
  const w = new Map();
  const i = p + 1;
  const j = q + 1;
  const add = (r, c, k) => {
    if (r < 0 || c < 0 || r >= nc || c >= nc || !k) return;
    const at = r * nc + c;
    w.set(at, (w.get(at) || 0) + k);
  };
  if (opts.mosaic === false) {
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) add(i + di, j + dj, opts.kernel[di + 1][dj + 1]);
    return w;
  }
  const luma = opts.luma || LUMA;
  for (const ch of ["R", "G", "B"]) {
    if (!luma[ch]) continue;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const r = i + di;
        const c = j + dj;
        if (r >= 0 && c >= 0 && r < nc && c < nc && cfa(r, c) === ch) add(r, c, luma[ch] * KERNEL[ch][di + 1][dj + 1]);
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
export function photositesToDct(nb, opts = {}) {
  const nc = 8 * nb + 2;
  const rows = [];
  for (const b of BLOCK_ORDER[nb]) {
    const bi = Math.floor(b / nb) * 8;
    const bj = (b % nb) * 8;
    const luma = [];
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) luma.push(lumaRow(bi + x, bj + y, nc, opts));
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

// Develops a patch of photosites to luminance, pixel by pixel, with the
// weights M uses: pixel (p, q) is photosite (p+1, q+1) demosaicked. nc is the
// side of the patch; the result is (nc-2)², row-major.
export function develop(raw, nc, opts = {}) {
  const n = nc - 2;
  const Y = new Float64Array(n * n);
  for (let p = 0; p < n; p++) {
    for (let q = 0; q < n; q++) {
      let s = 0;
      lumaRow(p, q, nc, opts).forEach((w, at) => (s += w * raw[at]));
      Y[p * n + q] = s;
    }
  }
  return Y;
}

// The 8×8 DCT of a block and its inverse, row-major: A x Aᵀ and Aᵀ c A.
export function dct8(x) {
  const c = new Float64Array(64);
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let s = 0;
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) s += A[u][i] * x[i * 8 + j] * A[v][j];
      c[u * 8 + v] = s;
    }
  }
  return c;
}

export function idct8(c) {
  const x = new Float64Array(64);
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      let s = 0;
      for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) s += A[u][i] * c[u * 8 + v] * A[v][j];
      x[i * 8 + j] = s;
    }
  }
  return x;
}

// The four lattices of blocks (section V-A, Fig. 10): block (bi, bj) belongs
// to one by the parity of its row and column.
export function lattice(bi, bj) {
  if (bi % 2 === 0) return bj % 2 === 0 ? 1 : 3;
  return bj % 2 === 0 ? 4 : 2;
}

// The neighbourhood in M's block order (C, N, W, E, S, NW, NE, SW, SE): the
// offset of each position, and which positions each lattice is drawn
// knowing, the centre first. Λ1 knows nothing, Λ2 its diagonals, Λ3 its
// sides, Λ4 all eight.
export const AROUND = [[0, 0], [-1, 0], [0, -1], [0, 1], [1, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]];
export const GIVEN = { 1: [0], 2: [0, 5, 6, 7, 8], 3: [0, 1, 2, 3, 4], 4: [0, 1, 2, 3, 4, 5, 6, 7, 8] };

// Simulated embedding over a patch (Algorithm 1): the blocks of a patch of
// (8B+2)² photosites, B a side, drawn lattice by lattice, each given the
// neighbours already drawn. vOf(x) is the stego variance of a photosite of
// value x (set to 0 when negative, as the paper says); steps are the 64
// quantisation steps; K half the alphabet; all in the 16-bit domain, where a
// coefficient is the DCT of the luminance ×4. Each coefficient is drawn
// around the cover's own, c + m, so the PMF is over the integer the file
// stores, as the paper's code gets by rounding cover + signal; eq. (29), as
// printed, centres it on the signal's mean alone. A block is drawn only if every neighbour it needs was; the
// others stay null. Returns, per block, the stego signal s (the draw less
// the cover) and the integers stored, round((c + s) / q); the bits they
// carry; and the bits per block of each lattice.
export function embed(raw, B, vOf, steps, K, rand) {
  const nc = 8 * B + 2;
  const M = photositesToDct(3);
  const Y = develop(raw, nc);
  const blocks = new Array(B * B).fill(null);
  const ints = new Array(B * B).fill(null);
  const perLattice = { 1: [], 2: [], 3: [], 4: [] };
  let bits = 0;
  const v = new Float64Array(26 * 26);
  for (const L of [1, 2, 3, 4]) {
    for (let bi = 1; bi < B - 1; bi++) {
      for (let bj = 1; bj < B - 1; bj++) {
        if (lattice(bi, bj) !== L) continue;
        const known = GIVEN[L].slice(1).map(p => blocks[(bi + AROUND[p][0]) * B + bj + AROUND[p][1]]);
        if (known.some(b => !b)) continue;
        for (let i = 0; i < 26; i++) {
          for (let j = 0; j < 26; j++) v[i * 26 + j] = Math.max(0, vOf(raw[((bi - 1) * 8 + i) * nc + (bj - 1) * 8 + j]));
        }
        const S = covariance(M, v);
        const idx = GIVEN[L].flatMap(p => Array.from({ length: 64 }, (_, t) => p * 64 + t));
        const n = idx.length;
        const Ss = new Float64Array(n * n);
        for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) Ss[a * n + b] = S[idx[a] * 576 + idx[b]] + (a === b ? 1e-3 : 0);
        let mean = new Float64Array(64);
        let cov = Ss;
        if (n > 64) ({ mean, cov } = conditional(Ss, n, 64, known.flatMap(b => Array.from(b))));
        for (let t = 0; t < 64; t++) cov[t * 65] += 1e-3; // what rounding leaves of a variance that is zero
        const x = new Float64Array(64);
        for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) x[i * 8 + j] = 4 * Y[(bi * 8 + i) * (nc - 2) + bj * 8 + j];
        const c = dct8(x);
        const draw = sampleSequential(Float64Array.from(mean, (m, t) => c[t] + m), cov, 64, steps, K, rand);
        blocks[bi * B + bj] = Float64Array.from(draw, (d, t) => d.x - c[t]);
        ints[bi * B + bj] = Int32Array.from(draw, d => d.k);
        const h = draw.reduce((a, d) => a + d.h, 0);
        perLattice[L].push(h);
        bits += h;
      }
    }
  }
  return { blocks, ints, bits, perLattice };
}

// The JPEG luminance quantisation tables of the reference code (NS/tools,
// as libjpeg's convert writes them), 8-bit domain, row-major. Multiply by
// 256 for the 16-bit domain the embedding works in.
export const QTABLES = {
  100: new Array(64).fill(1),
  95: [2, 1, 1, 2, 2, 4, 5, 6, 1, 1, 1, 2, 3, 6, 6, 6, 1, 1, 2, 2, 4, 6, 7, 6, 1, 2, 2, 3, 5, 9, 8, 6, 2, 2, 4, 6, 7, 11, 10, 8, 2, 4, 6, 6, 8, 10, 11, 9, 5, 6, 8, 9, 10, 12, 12, 10, 7, 9, 10, 10, 11, 10, 10, 10],
  85: [5, 3, 3, 5, 7, 12, 15, 18, 4, 4, 4, 6, 8, 17, 18, 17, 4, 4, 5, 7, 12, 17, 21, 17, 4, 5, 7, 9, 15, 26, 24, 19, 5, 7, 11, 17, 20, 33, 31, 23, 7, 11, 17, 19, 24, 31, 34, 28, 15, 19, 23, 26, 31, 36, 36, 30, 22, 28, 29, 29, 34, 30, 31, 30],
  75: [8, 6, 5, 8, 12, 20, 26, 31, 6, 6, 7, 10, 13, 29, 30, 28, 7, 7, 8, 12, 20, 29, 35, 28, 7, 9, 11, 15, 26, 44, 40, 31, 9, 11, 19, 28, 34, 55, 52, 39, 12, 18, 28, 32, 41, 52, 57, 46, 25, 32, 39, 44, 52, 61, 60, 51, 36, 46, 48, 49, 56, 50, 52, 50]
};
