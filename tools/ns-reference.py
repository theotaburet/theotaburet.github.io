# Values from the reference implementation of the TIFS 2020 paper, for
# tools/ns-check.mjs to hold assets/js/ns/maths.js to.
#
#   uv run --with numpy --with scipy python tools/ns-reference.py
#
# Fetches NS/compute/BIL from the paper's repository into a temporary folder
# (it needs nothing but numpy), computes, and writes tools/ns-reference.json
# next to this file. Run once; the JSON is what is committed.
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from scipy.special import erf

REPO = "https://gitlab.cristal.univ-lille.fr/ttaburet/tifs-ns/-/raw/master/"
tmp = tempfile.mkdtemp()
for f in ["NS/__init__.py", "NS/compute/__init__.py", "NS/compute/BIL/__init__.py"]:
    os.makedirs(os.path.join(tmp, os.path.dirname(f)), exist_ok=True)
    # curl, for the system's certificates: uv's own Python does not see them.
    subprocess.run(["curl", "-sSfL", "-o", os.path.join(tmp, f), REPO + f], check=True)
sys.path.insert(0, tmp)
from NS.compute import BIL  # noqa: E402

M1 = BIL.getPhotositesToDctMatrix(1, "Y")
M3 = BIL.getPhotositesToDctMatrix(3, "Y")

rs = np.random.RandomState(7)
# A stego variance per photosite as the sampler computes it (compute_PP_T):
# 16 (a x + b), a = 1.15 and b = -1150, on photosite values x.
v = 16 * (1.15 * rs.uniform(2000, 9000, 676) - 1150)
S = M3 @ np.diag(v) @ M3.T + 1e-3 * np.eye(576)  # the sampler's eps
obs = rs.normal(0, 1, 512) * np.sqrt(np.diag(S)[64:])
c11, c12, c21, c22 = S[:64, :64], S[:64, 64:], S[64:, :64], S[64:, 64:]
reg = c12 @ np.linalg.pinv(c22)


def pmf(m, s, q, K):
    """As RJ.generateSamples: 2K+1 bins round m/q, the outer two open-ended."""
    k = np.arange(-K, K + 1)
    mh, sh = m / q, s / q
    hi, lo = 0.5 + k + np.round(mh), -0.5 + k + np.round(mh)
    lo[0], hi[-1] = -np.inf, np.inf
    return (0.5 * (erf((hi - mh) / (sh * np.sqrt(2))) - erf((lo - mh) / (sh * np.sqrt(2))))).tolist()


ROWS = [0, 1, 9, 63, 64, 70, 200, 320, 448, 575]
out = {
    "M1": M1.tolist(),
    "M3_rows": {r: M3[r].tolist() for r in ROWS},
    "M3_sum": M3.sum(axis=1).tolist(),
    "M3_norm": np.linalg.norm(M3, axis=1).tolist(),
    "v": v.tolist(),
    "S_diag": np.diag(S).tolist(),
    "S_rows": {r: S[r].tolist() for r in ROWS},
    "obs": obs.tolist(),
    "mean": (reg @ obs).tolist(),
    "cov": (c11 - reg @ c21).ravel().tolist(),
    "pmf": [
        {"m": m, "s": s, "q": q, "K": K, "p": pmf(m, s, q, K)}
        for m, s, q, K in [(0.3, 1.2, 1, 5), (-7.4, 3.1, 2, 3), (130.0, 40.0, 1536, 1), (0.0, 0.2, 1, 2)]
    ],
}
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "ns-reference.json"), "w") as fh:
    json.dump(out, fh)
