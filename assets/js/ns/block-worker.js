// The maths of fig-block.js, off the page's thread: at a phone's speed they
// hold it for a third of a second. Σ for 3×3 blocks of a flat grey patch and
// the Cholesky factor of the neighbours' part, once; then, for each
// { id, seed, qf }, the eight neighbours drawn together from Σ, the centre
// block's law given them (the Schur complement), and its draw, coefficient
// by coefficient. Answers { id, qf, law: { mean, cov }, draw }.
import * as maths from "./maths.js";

const K = 5;
const V = 16 * (1.15 * 6000 - 1150); // the stego variance of a 6000 DN photosite, 16-bit
const N = 512; // the neighbours' coefficients
let S = null;
let Ln = null;

function setup() {
  const M = maths.photositesToDct(3);
  S = maths.covariance(M, new Float64Array(M.cols).fill(V));
  for (let i = 0; i < 576; i++) S[i * 577] += 1e-3;
  const Sn = new Float64Array(N * N);
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) Sn[a * N + b] = S[(64 + a) * 576 + 64 + b];
  Ln = maths.cholesky(Sn, N);
}

onmessage = ({ data: { id, seed, qf } }) => {
  if (!S) setup();
  // The neighbours: the same for both qualities, so they compare.
  const rand = maths.rng(seed);
  const z = Float64Array.from({ length: N }, () => maths.gauss(rand));
  const obs = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = 0; k <= i; k++) s += Ln[i * N + k] * z[k];
    obs[i] = s;
  }
  const law = maths.conditional(S, 576, 64, obs);
  for (let t = 0; t < 64; t++) law.cov[t * 65] += 1e-3; // as embed: what rounding leaves of a zero variance
  // The patch is flat: its cover coefficients are 0 but for the DC, a whole
  // number of steps, so drawing around them changes nothing; the law is the
  // stego signal's.
  const draw = maths.sampleSequential(law.mean, law.cov, 64, maths.QTABLES[qf].map(q => 256 * q), K, maths.rng(seed + 1000));
  postMessage({ id, qf, law, draw });
};
