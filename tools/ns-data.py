# The data behind the natural steganography article's figures, from the two
# RAW files the paper's repository ships (one scene, ISO 100 and ISO 200).
# Small crops only: the article explains the scheme, it does not run it on
# whole photographs.
#
#   uv run --with rawpy --with numpy --with pillow python tools/ns-data.py
#
# Writes assets/data/ns/: noise.json (noise variance against brightness, both
# ISOs), hook.json and four 256×256 PNGs (the same crop at ISO 100, ISO 200,
# ISO 100 with a simulated J-Cov-NS embedding, and the difference). The
# embedding itself runs in tools/ns-embed.mjs, on the article's own maths.
import json
import os
import subprocess
import tempfile

import numpy as np
import rawpy
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "data", "ns")
CACHE = os.path.expanduser("~/.cache/ns-data")
REPO = "https://gitlab.cristal.univ-lille.fr/ttaburet/tifs-ns/-/raw/master/"
FILES = {"iso100": "ISO100/EYED5607.DNG", "iso200": "ISO200/EYED5372.DNG"}
CROP = (1800, 2760)  # ISO 100, top-left of the 256×256 crop: leaves on white cloth
SIDE = 256


def fetch(name):
    os.makedirs(CACHE, exist_ok=True)
    dest = os.path.join(CACHE, os.path.basename(FILES[name]))
    if not os.path.exists(dest):
        # curl, for the system's certificates: uv's own Python does not see them.
        subprocess.run(["curl", "-sSfL", "-o", dest, REPO + FILES[name]], check=True)
    return rawpy.imread(dest).raw_image_visible.astype(np.float64)


def noise(raw):
    """Variance against mean, on the two greens: per 8×8 tile of one colour,
    the variance of a pixel minus the mean of its two horizontal neighbours
    (1.5 times the noise variance on a flat tile). Per brightness bin, the
    lower fifth of the tiles, where texture adds the least; then a line."""
    means, varis = [], []
    for r0, c0 in [(0, 0), (1, 1)]:
        g = raw[r0::2, c0::2]
        res = g[:, 1:-1] - (g[:, :-2] + g[:, 2:]) / 2
        mid = g[:, 1:-1]
        h, w = res.shape[0] // 8 * 8, res.shape[1] // 8 * 8
        tile = lambda a: a[:h, :w].reshape(h // 8, 8, w // 8, 8).transpose(0, 2, 1, 3).reshape(-1, 64)
        means.append(tile(mid).mean(1))
        varis.append(tile(res).var(1) / 1.5)
    m, v = np.concatenate(means), np.concatenate(varis)
    keep = (m > 1100) & (m < 15000)
    m, v = m[keep], v[keep]
    edges = np.quantile(m, np.linspace(0, 1, 41))
    bins = [[float(m[s].mean()), float(np.quantile(v[s], 0.2))]
            for s in ((m >= lo) & (m < hi) for lo, hi in zip(edges[:-1], edges[1:])) if s.sum() > 200]
    a, b = np.polyfit([x for x, _ in bins], [y for _, y in bins], 1)
    return {"bins": [[round(x, 1), round(y, 1)] for x, y in bins], "a": float(a), "b": float(b)}


def align(ref, other, at):
    """Where the ISO 100 crop's content sits in the ISO 200 frame, which is
    framed a little differently: phase correlation on the greens around it,
    rounded to even so the Bayer phase is kept."""
    r, c = at
    pad = 256
    a = ref[r - pad:r + SIDE + pad:2, c - pad:c + SIDE + pad:2]
    b = other[r - pad:r + SIDE + pad:2, c - pad:c + SIDE + pad:2]
    a, b = a - a.mean(), b - b.mean()
    x = np.fft.ifft2(np.fft.fft2(b) * np.conj(np.fft.fft2(a)))
    dy, dx = np.unravel_index(np.argmax(np.abs(x)), x.shape)
    dy = dy - x.shape[0] if dy > x.shape[0] // 2 else dy
    dx = dx - x.shape[1] if dx > x.shape[1] // 2 else dx
    return r + 2 * int(dy), c + 2 * int(dx)


def crop(raw, at):
    """The crop and its one-photosite border: (SIDE+2)² photosites, starting
    one before the crop, so its Bayer phase is the one M assumes (green at
    the crop's top-left, red to its right)."""
    r, c = at
    return raw[r - 1:r + SIDE + 1, c - 1:c + SIDE + 1]


def main():
    raws = {k: fetch(k) for k in FILES}
    os.makedirs(OUT, exist_ok=True)
    json.dump({"iso100": noise(raws["iso100"]), "iso200": noise(raws["iso200"]),
               "paper": {"da": 1.15, "db": -1150}}, open(os.path.join(OUT, "noise.json"), "w"))

    at = {"iso100": CROP, "iso200": align(raws["iso100"], raws["iso200"], CROP)}
    with tempfile.TemporaryDirectory() as tmp:
        for k in FILES:
            crop(raws[k], at[k]).astype(np.float32).tofile(os.path.join(tmp, k + ".f32"))
        subprocess.run(["node", os.path.join(ROOT, "tools", "ns-embed.mjs"), tmp], check=True)
        img = {k: np.fromfile(os.path.join(tmp, k + ".f32"), np.float32).reshape(SIDE, SIDE)
               for k in ("cover", "stego", "iso200")}
        meta = json.load(open(os.path.join(tmp, "embed.json")))

    # One tone curve for all three, from the original: the same light reads the same.
    lo, hi = np.percentile(img["cover"], [0.5, 99.5])
    tone = lambda y: (255 * np.clip((y - lo) / (hi - lo), 0, 1) ** (1 / 2.2)).round().astype(np.uint8)
    Image.fromarray(tone(img["cover"])).save(os.path.join(OUT, "iso100.png"), optimize=True)
    Image.fromarray(tone(img["iso200"])).save(os.path.join(OUT, "iso200.png"), optimize=True)
    Image.fromarray(tone(img["stego"])).save(os.path.join(OUT, "stego.png"), optimize=True)
    d = img["stego"] - img["cover"]
    k = 127 / (4 * d.std() or 1)
    Image.fromarray(np.clip(128 + k * d, 0, 255).round().astype(np.uint8)).save(os.path.join(OUT, "diff.png"), optimize=True)

    json.dump({"size": SIDE, "qf": 100, "bits": meta["bits"], "kbytes": round(meta["bits"] / 8000, 2),
               "blocks": {"drawn": meta["drawn"], "total": meta["total"]},
               "crop": {k: list(map(int, v)) for k, v in at.items()}},
              open(os.path.join(OUT, "hook.json"), "w"))
    print("noise and crops written;", meta["drawn"], "blocks embedded,", round(meta["bits"] / 8000, 2), "KB, in", meta["ms"], "ms")


if __name__ == "__main__":
    main()
