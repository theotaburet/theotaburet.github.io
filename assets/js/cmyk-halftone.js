// A photograph printed the way a cheap press would: naive CMYK separation, each
// plate dithered with Floyd-Steinberg once on the CPU, a round dot of pure ink
// on every inked cell, the four plates multiplied together on the GPU. Twelve times
// a second the sheet shakes, and every plate is seen from its own wandering
// viewpoint over a depth map, so what is near slides further than what is far
// and the inks part along the planes of the picture. A few dotted scratches show
// where a plate failed to print.
//
// Any <canvas data-halftone="image.jpg" data-depth="depth.png"> on the page
// gets it, the depth map being optional. Without WebGL2 the canvas is swapped
// for the plain image.
(function () {
  var VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  // Pass 1: the plates in multiply. Plate space is in cells; texture row 0 is
  // the bottom (UNPACK_FLIP_Y).
  var HALFTONE_FRAG = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uPlates;      // RGBA8: R=C, G=M, B=Y, A=K (0/255)
uniform vec2  uPlateSize;       // cells in x, cells in y
uniform float uMargin;          // cells of plate beyond each edge of the canvas
uniform float uCell;            // size of a cell in pixels
uniform float uRadius;          // dot radius in cells
uniform vec2  uOffsets[4];      // offset of each plate in cells
uniform sampler2D uDepth;       // nearness, 0 far to 1 near
uniform float uDepthCurve;      // the parallax follows nearness to this power
uniform float uPivot;           // and stands still at this value of it
uniform vec2  uCam[4];          // each plate's viewpoint: cells of shift per unit of nearness
uniform vec3  uInks[4];         // ink colours
uniform vec3  uPaper;           // paper colour
uniform float uJitter;          // how far a dot may sit from its cell's centre, in cells
uniform float uRough;           // how much of the ink fails to take, in patches the size of a dot
uniform float uGrain;           // how much the sheet's fibres and clouds show
uniform vec2  uBorder;          // px of bare paper left and below the print (as much right and above)
uniform vec4  uGround;          // a flat colour round the print instead of the sheet, if alpha is 1

// vertical scratches: A = (x px, y0 px, y1 px, width px); B = (plate bitmask, strength, seed, 0)
uniform int   uScratchCount;
uniform vec4  uScratchA[8];
uniform vec4  uScratchB[8];

out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

// the sheet, in cells: short fibres lying mostly across, and a faint cloudiness,
// lighter and darker by a few percent around the paper's colour
float sheet(vec2 c) {
  return 1.0 + uGrain * (0.07 * (vnoise(c * vec2(0.6, 2.0)) - 0.5) + 0.05 * (vnoise(c / 12.0) - 0.5));
}

float inked(ivec2 c, int plate) {
  if (c.x < 0 || c.y < 0 || c.x >= int(uPlateSize.x) || c.y >= int(uPlateSize.y)) return 0.0;
  vec4 t = texelFetch(uPlates, c, 0);
  return plate == 0 ? t.r : plate == 1 ? t.g : plate == 2 ? t.b : t.a;
}

// where a plate sits at a point of the canvas (in cells): the sheet's shake and
// the plate's drift, by whole half-cells so the grain holds still between steps,
// and its viewpoint over the depth there, smoothly, so that two dots side by
// side never jump apart along a line of the depth map
vec2 shiftAt(vec2 at, int plate) {
  float z = pow(texture(uDepth, at / (uPlateSize - 2.0 * uMargin)).r, uDepthCurve) - uPivot;
  return floor(uOffsets[plate] * 2.0 + 0.5) / 2.0 + z * uCam[plate];
}

// two uniform numbers for a cell of a plate (pcg2d, Jarzynski and Olano 2020):
// sin-based hashes lose their randomness to float precision at these sizes
vec2 rand2(ivec2 c, int plate) {
  uvec2 v = uvec2(c + 4096) * 1664525u + 1013904223u + uint(plate) * 2654435761u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return vec2(v) / 4294967295.0;
}

// every inked cell holds a round dot, anti-aliased over a pixel, somewhere in
// its cell rather than at its centre (dots on a grid read as a grid, and two
// plates' grids beat against each other). Each pixel reads its plate where the
// depth under it says, so a plate stretches over a change of depth: moving
// the dots instead would pile them up on one side and tear a hole on the
// other. A dot a little wider than its cell reaches into the next one, hence
// the neighbours.
float ink(vec2 at, int plate) {
  vec2 s0 = shiftAt(at, plate);
  ivec2 c0 = ivec2(floor(at + uMargin - s0));
  float cov = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      ivec2 c = c0 + ivec2(dx, dy);
      if (inked(c, plate) < 0.5) continue;
      vec2 centre = vec2(c) + 0.5 + uJitter * (rand2(c, plate) - 0.5) - uMargin;
      float d = length(at - centre - s0) * uCell;
      cov = max(cov, clamp(uRadius * uCell - d + 0.5, 0.0, 1.0));
    }
  }
  // a worn press starves its plates in patches, which travel with the plate
  return cov * (1.0 - uRough * smoothstep(0.4, 0.9, vnoise((at - s0) * 0.9 + float(plate) * 37.0)));
}

// scratch: a dotted vertical band where the plate lays no ink
float scratchMask(vec2 fragPx, int plate) {
  float m = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uScratchCount) break;
    vec4 A = uScratchA[i];
    vec4 B = uScratchB[i];
    int bits = int(B.x + 0.5);
    if (((bits >> plate) & 1) == 0) continue;
    if (fragPx.x < A.x || fragPx.x >= A.x + A.w) continue;
    if (fragPx.y < A.y || fragPx.y >= A.z) continue;
    // dotted: segments of ~6 px, 60 % of them on
    float seg = floor(fragPx.y / 6.0);
    if (hash(vec2(seg, B.z)) > 0.6) continue;
    m *= 1.0 - B.y;
  }
  return m;
}

void main() {
  vec2 fragPx = gl_FragCoord.xy - uBorder;
  vec3 color = uPaper * sheet(gl_FragCoord.xy / uCell);
  if (any(lessThan(fragPx, vec2(0.0))) || any(greaterThanEqual(fragPx, (uPlateSize - 2.0 * uMargin) * uCell))) {
    fragColor = vec4(mix(color, uGround.rgb, uGround.a), 1.0);
    return;
  }
  for (int p = 0; p < 4; p++)
    color *= mix(vec3(1.0), uInks[p], ink(fragPx / uCell, p) * scratchMask(fragPx, p));
  fragColor = vec4(color, 1.0);
}`;

  // Pass 2: the luma softened a little and the chroma a little more, the
  // video the reference went through.
  var CHROMA_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uTexel;        // 1 / resolution
uniform float uLumaBlur;    // px
uniform float uChromaBlur;  // px
in vec2 vUv;
out vec4 fragColor;

vec3 toYcc(vec3 c) { float y = dot(c, vec3(0.299, 0.587, 0.114)); return vec3(y, c.b - y, c.r - y); }
vec3 fromYcc(vec3 v) { float r = v.z + v.x; float b = v.y + v.x; float g = (v.x - 0.299 * r - 0.114 * b) / 0.587; return vec3(r, g, b); }

void main() {
  vec2 s2 = 2.0 * pow(max(vec2(uLumaBlur, uChromaBlur), 0.01), vec2(2.0));
  vec3 acc = vec3(0.0); vec2 wsum = vec2(0.0);
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 w = exp(-dot(o, o) / s2);
      vec3 s = toYcc(texture(uTex, vUv + o * uTexel).rgb);
      acc += vec3(s.x * w.x, s.yz * w.y); wsum += w;
    }
  }
  fragColor = vec4(clamp(fromYcc(vec3(acc.x / wsum.x, acc.yz / wsum.y)), 0.0, 1.0), 1.0);
}`;

  /* -------------------------------------------------------------------------
     Plates: naive CMYK separation and Floyd-Steinberg, into one RGBA8 texture
     (R=C, G=M, B=Y, A=K), 0 or 255 per channel, row 0 at the top.
     ---------------------------------------------------------------------- */

  // Ulichney's void-and-cluster: a rank for every cell of a 64 x 64 tile such
  // that the cells under any threshold are spread as evenly as can be (blue
  // noise), on a torus so the tile repeats seamlessly.
  var blueNoise = (function () {
    var N = 64, n = N * N, R = 4, K = [];
    for (var dy = -R; dy <= R; dy++) for (var dx = -R; dx <= R; dx++) K.push([dx, dy, Math.exp(-(dx * dx + dy * dy) / (2 * 1.5 * 1.5))]);
    var bits = new Uint8Array(n), E = new Float32Array(n), rank = new Float32Array(n);
    var flip = function (i, v) {
      bits[i] = v;
      var x = i % N, y = (i / N) | 0;
      for (var k = 0; k < K.length; k++) E[((y + K[k][1] + N) % N) * N + ((x + K[k][0] + N) % N)] += v ? K[k][2] : -K[k][2];
    };
    var extreme = function (want, sign) { // the 1 in the tightest cluster, or the 0 in the largest void
      var best = -1, bv = -Infinity;
      for (var i = 0; i < n; i++) if (bits[i] === want && sign * E[i] > bv) { bv = sign * E[i]; best = i; }
      return best;
    };
    for (var i = 0; i < n / 10; i++) { var j = (Math.random() * n) | 0; if (!bits[j]) flip(j, 1); }
    for (;;) { var c = extreme(1, 1); flip(c, 0); var v = extreme(0, -1); flip(v, 1); if (c === v) break; }
    var start = bits.slice(), ones = 0;
    for (i = 0; i < n; i++) ones += bits[i];
    for (var r = ones - 1; r >= 0; r--) { c = extreme(1, 1); flip(c, 0); rank[c] = r; }
    for (i = 0; i < n; i++) if (start[i] !== bits[i]) flip(i, start[i]);
    for (r = ones; r < n; r++) { v = extreme(0, -1); flip(v, 1); rank[v] = r; }
    for (i = 0; i < n; i++) rank[i] = (rank[i] + 0.5) / n;
    return rank;
  })();

  // Floyd-Steinberg on a density plane in [0,1], 1 = ink, serpentine so it
  // draws no diagonal lattice in the light tones. `f` mirrors the plane first
  // (1 in x, 2 in y): a different orientation per plate is what screen angles
  // are on a press, the plates' grain stops lining up.
  function floydSteinberg(src, w, h, f, noise) {
    var ox = (Math.random() * 64) | 0, oy = (Math.random() * 64) | 0;
    var at = function (x, y) { return (f & 2 ? h - 1 - y : y) * w + (f & 1 ? w - 1 - x : x); };
    var buf = new Float32Array(w * h), out = new Uint8Array(w * h), x, y;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) buf[y * w + x] = src[at(x, y)];
    for (y = 0; y < h; y++) {
      var d = y & 1 ? -1 : 1;
      for (var k = 0; k < w; k++) {
        x = d > 0 ? k : w - 1 - k;
        var i = y * w + x, v = buf[i] >= 0.5 + noise * (blueNoise[((y + oy) & 63) * 64 + ((x + ox) & 63)] - 0.5) ? 1 : 0, err = buf[i] - v;
        out[at(x, y)] = v;
        if (x + d >= 0 && x + d < w) buf[i + d] += err * (7 / 16);
        if (y + 1 < h) {
          if (x - d >= 0 && x - d < w) buf[i + w - d] += err * (3 / 16);
          buf[i + w] += err * (5 / 16);
          if (x + d >= 0 && x + d < w) buf[i + w + d] += err * (1 / 16);
        }
      }
    }
    return out;
  }

  // The whole photo resampled to `width` x `height` cells through a 2D canvas
  // (bilinear), its edges carried out over `margin` more cells each side.
  function buildPlates(image, opts) {
    // fitted on the reference video
    var kWeight = opts.kWeight != null ? opts.kWeight : 0.3;
    var contrast = opts.contrast || 1.1;
    var saturation = opts.saturation || 1.2;
    var balance = opts.balance || [0.9, 0.95, 1]; // gains on red, green and blue, for the reference's neutral greys
    var gamma = opts.gamma || 0.65; // lifts the middle tones, which real inks and overlaps darken
    // a dot covers `gain` cells, overlaps aside: dither less ink, so the dots
    // that spread past their cells still add up to the right tone
    var spread = 1 / (opts.gain || 1);
    var riso = opts.inks && opts.inks.length < 4 && separate(opts.inks, opts.paper);

    var cw = opts.width, ch = opts.height, mg = opts.margin;
    var w = cw + 2 * mg, h = ch + 2 * mg;

    var cv = document.createElement("canvas");
    cv.width = cw;
    cv.height = ch;
    var ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, cw, ch);
    var px = ctx.getImageData(0, 0, cw, ch).data;

    var n = w * h;
    var planes = [0, 1, 2, 3].map(function () { return new Float32Array(n); });
    var c = planes[0], m = planes[1], y = planes[2], k = planes[3];

    for (var i = 0; i < n; i++) {
      var at = (Math.min(ch - 1, Math.max(0, ((i / w) | 0) - mg)) * cw + Math.min(cw - 1, Math.max(0, (i % w) - mg))) * 4;
      var r = (px[at] / 255) * balance[0], g = (px[at + 1] / 255) * balance[1], b = (px[at + 2] / 255) * balance[2];
      // light grade: saturation around luminance, then contrast around 0.5
      var l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * saturation; g = l + (g - l) * saturation; b = l + (b - l) * saturation;
      r = Math.pow(clamp01((r - 0.5) * contrast + 0.5), gamma);
      g = Math.pow(clamp01((g - 0.5) * contrast + 0.5), gamma);
      b = Math.pow(clamp01((b - 0.5) * contrast + 0.5), gamma);
      if (riso) { riso(r, g, b, planes, i, spread); continue; }
      // naive separation: pure inks, no under-colour removal
      c[i] = 1 - Math.pow(r, spread);
      m[i] = 1 - Math.pow(g, spread);
      y[i] = 1 - Math.pow(b, spread);
      k[i] = 1 - Math.pow(1 - (1 - Math.max(r, g, b)) * kWeight, spread);
    }

    var f = shuffle([0, 1, 2, 3]); // which plate gets which orientation changes every print
    // a threshold that wanders with blue noise: alone, Floyd-Steinberg draws
    // worms and checkerboards, which four plates beat into waves; white noise
    // breaks them up but clumps the dots
    var noise = opts.noise != null ? opts.noise : 0.8;
    var data = new Uint8Array(n * 4);
    for (var p = 0; p < (riso ? opts.inks.length : 4); p++) {
      var bits = floydSteinberg(planes[p], w, h, f[p], noise);
      for (var j = 0; j < n; j++) data[j * 4 + p] = bits[j] * 255;
    }
    return { width: w, height: h, data: data };
  }

  // A risograph's drums get their own separation: as much of each ink as best
  // rebuilds the colour once the inks multiply on the paper, by least squares
  // on optical densities (the log of the light each lets through), then the
  // share of the cell to cover to lay that much down.
  function separate(inks, paper) {
    var A = inks.map(function (ink) { return ink.map(function (v, ch) { return Math.log(Math.max(v, 0.03) / paper[ch]); }); });
    // (A Aᵀ)⁻¹ A by Gauss-Jordan; A Aᵀ is positive definite, so no pivoting
    var M = A.map(function (a) { return A.map(function (b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }).concat(a); });
    var N = inks.length;
    for (var i = 0; i < N; i++) {
      var d = M[i][i], j;
      for (j = 0; j < N + 3; j++) M[i][j] /= d;
      for (var k = 0; k < N; k++) {
        if (k === i) continue;
        var e = M[k][i];
        for (j = 0; j < N + 3; j++) M[k][j] -= e * M[i][j];
      }
    }
    var P = M.map(function (row) { return row.slice(N); });
    var T = inks.map(function (ink) { return (ink[0] / paper[0] + ink[1] / paper[1] + ink[2] / paper[2]) / 3; }); // how much light an ink lets through
    return function (r, g, b, planes, i, spread) {
      var lr = Math.log(Math.max(r, 0.03) / paper[0]), lg = Math.log(Math.max(g, 0.03) / paper[1]), lb = Math.log(Math.max(b, 0.03) / paper[2]);
      for (var p = 0; p < N; p++) {
        var dens = clamp01(P[p][0] * lr + P[p][1] * lg + P[p][2] * lb);
        var cover = (1 - Math.pow(T[p], dens)) / (1 - T[p]);
        planes[p][i] = 1 - Math.pow(1 - clamp01(cover), spread);
      }
    };
  }

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  /* -------------------------------------------------------------------------
     Renderer.
     ---------------------------------------------------------------------- */

  var DEFAULTS = {
    cell: 2,               // output pixels per cell (2 ≈ the reference video)
    radius: 0.65,          // cells: a little past the cell, as ink spreads, so dark areas close up
    jitter: 0.5,           // cells a dot may stray across its cell: enough that two plates' dots no longer beat
                           // against each other whatever their offsets, not so much that they clump
    scale: 1,              // our cells to the reference's: the moves below are measured in its cells
    margin: 16,            // cells dithered past every edge, more than any plate moves at the sliders' ends, so no edge shows
    ampGlobal: 0.65,       // cells; the sheet's shake, measured on the reference
    ampDiff: 0.4,          // cells; each plate's own drift on top of it
    ampDepth: 2.25,        // cells per unit of nearness: the viewpoint all the plates share
    ampDepthDiff: 2.4,     // and how far each plate's own wanders from it
    motion: 1,             // all four moves at once: 0 holds the print still
    depthCurve: 0.3,       // fitted on the reference: its parallax separates the middle
    pivot: 0.46,           // distance from the far, not just the near from the rest
    fps: 12,
    lumaBlur: 0.45,        // px; the reference's dots are a little soft
    chromaBlur: 0.65,      // px; more turns the dots' colours to mud
    misregister: 0.5,      // cells each plate may sit off register, either way
    // the analogue flaws, each absent at 0
    scratches: 1,          // how many scratches: about four a frame at 1
    scratchStrength: 0.7,  // how much ink a scratch takes off, each one give or take a quarter
    starve: 0,             // 0 to 1: how badly the ink takes, in patches
    grain: 1,              // how much the sheet's fibres and clouds show
    soft: 1,               // how soft the dots and their colours are: the blurs above, scaled
    loop: Infinity,        // frames after which the moves come round again
    seed: 0,
    // Process inks on an off-white sheet, not screen primaries: pure ones lay
    // screen-green and screen-blue wherever two of them meet.
    paper: [0.95, 0.95, 0.96],
    inks: [[0, 0.68, 0.94], [0.93, 0.05, 0.55], [1, 0.93, 0.05], [0.15, 0.13, 0.14]] // C, M, Y, K
  };

  class CMYKHalftone {
    constructor(canvas, params) {
      this.canvas = canvas;
      this.base = Object.assign({}, DEFAULTS, params);
      this.reroll();
      this.plates = null;
      this.platesTex = null;
      this.uA = {};
      this.uB = {};
      this.scratches = [];
      this.frame = 0;
      this.lastStep = 0;
      this.raf = 0;

      var gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false });
      if (!gl) throw new Error("WebGL2 not supported");
      this.gl = gl;

      this.progA = this.link(VERT, HALFTONE_FRAG);
      this.progB = this.link(VERT, CHROMA_FRAG);
      for (const n of ["uPlates", "uPlateSize", "uMargin", "uCell", "uRadius", "uOffsets", "uDepth", "uCam", "uDepthCurve", "uPivot", "uInks", "uPaper", "uBorder", "uGround", "uJitter", "uRough", "uGrain", "uScratchCount", "uScratchA", "uScratchB"])
        this.uA[n] = gl.getUniformLocation(this.progA, n);
      for (const n of ["uTex", "uTexel", "uLumaBlur", "uChromaBlur"]) this.uB[n] = gl.getUniformLocation(this.progB, n);

      // one triangle over the whole screen
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);

      this.fbo = gl.createFramebuffer();
      this.fboTex = gl.createTexture();
      this.setDepth(this.flat());
    }

    // No depth map: everything at the pivot, so nothing slides.
    flat() {
      var v = Math.round(255 * Math.pow(this.params.pivot, 1 / this.params.depthCurve));
      return new Uint8Array([v, v, v, 255]);
    }

    // A depth map, near bright and far dark, at any size: it is stretched over
    // the plates. Without one the print stays flat.
    setDepth(src) {
      var gl = this.gl;
      this.depth = src;
      if (!this.depthTex) this.depthTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.depthTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      if (src instanceof Uint8Array) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.render();
    }

    // The print centred on a sheet W x H px: what is left round it is bare
    // paper, and a print a little larger than the sheet runs off its edges.
    setPlates(plates, W, H) {
      var gl = this.gl;
      this.plates = plates;
      var cell = this.params.cell;
      var m = this.params.margin;
      this.canvas.width = W;
      this.canvas.height = H;
      this.border = [(W - (plates.width - 2 * m) * cell) / 2, (H - (plates.height - 2 * m) * cell) / 2];

      if (!this.platesTex) this.platesTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.platesTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // row 0 -> bottom, like gl_FragCoord
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, plates.width, plates.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, plates.data);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

      gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.canvas.width, this.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.render();
    }

    // A new press: new draws for it, kept apart from the settings they scale.
    reroll() {
      this.dice = press();
      this.update();
    }

    // The settings in `base` as this press holds them.
    update() {
      this.params = Object.assign({}, this.base, pressed(this.base, this.dice));
    }

    // Discrete steps at `fps`: the boil has to change per frame, not continuously.
    start() {
      this.stop();
      var self = this;
      var tick = function (t) {
        var step = 1000 / self.params.fps;
        if (t - self.lastStep >= step) {
          self.lastStep = t;
          self.frame++;
          self.updateScratches();
          self.render();
        }
        self.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }

    stop() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    }

    // No orbit and no loop: the sheet takes a new direction every couple of
    // frames, each plate drifts a little slower on top of it, and the plates
    // parting and closing is what reads as depth. Timescales and sizes are the
    // reference video's.
    // Each plate is seen from its own wandering viewpoint, so the plates part
    // further on what is near than on what is far: the depth in the reference.
    cams() {
      var P = this.params, t = this.frame, o = new Float32Array(8);
      for (var i = 0; i < 8; i++) o[i] = P.scale * (P.ampDepth * drift(t / 2.4, P.seed + 20 + (i & 1), P.loop / 2.4) + P.ampDepthDiff * drift(t / 2.4, P.seed + 22 + i, P.loop / 2.4));
      return o;
    }

    offsets() {
      var P = this.params, t = this.frame, o = new Float32Array(8);
      for (var i = 0; i < 8; i++) o[i] = P.scale * (P.register[i] + P.ampGlobal * drift(t / 2, P.seed + (i & 1), P.loop / 2) + P.ampDiff * drift(t / 3, P.seed + i + 2, P.loop / 3));
      return o;
    }

    updateScratches() {
      var P = this.params;
      var W = this.canvas.width - 2 * this.border[0], H = this.canvas.height - 2 * this.border[1];
      this.scratches = this.scratches.filter(function (s) { return s.life > 0; });
      for (const s of this.scratches) { s.life--; s.x += Math.floor(Math.random() * 3) - 1; }
      var target = poisson(P.scratchesMean);
      while (this.scratches.length < Math.min(target, 8)) {
        var L = Math.floor((0.25 + Math.random() * 0.75) * H);
        var y0 = Math.floor(Math.random() * (H - L + 1));
        var nPlates = pick([1, 2, 3], [0.4, 0.4, 0.2]);
        var bits = 0;
        for (const p of shuffle([0, 1, 2, 3]).slice(0, nPlates)) bits |= 1 << p;
        this.scratches.push({
          x: Math.floor(Math.random() * W), y0: y0, y1: y0 + L,
          w: (Math.random() < 0.5 ? 1 : 2) * P.cell / 2, bits: bits,
          strength: Math.min(1, P.scratchStrength * (0.75 + 0.5 * Math.random())),
          seed: Math.random() * 1000, life: 1 + Math.floor(Math.random() * 3)
        });
      }
    }

    render() {
      if (!this.plates) return;
      var gl = this.gl, P = this.params;
      var W = this.canvas.width, H = this.canvas.height;

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.viewport(0, 0, W, H);
      gl.useProgram(this.progA);
      gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.platesTex);
      gl.uniform1i(this.uA.uPlates, 0);
      gl.uniform2f(this.uA.uPlateSize, this.plates.width, this.plates.height);
      gl.uniform1f(this.uA.uMargin, P.margin);

      gl.uniform1f(this.uA.uCell, P.cell);
      gl.uniform1f(this.uA.uRadius, P.radius);
      gl.uniform1f(this.uA.uDepthCurve, P.depthCurve);
      gl.uniform1f(this.uA.uPivot, P.pivot);
      gl.uniform2fv(this.uA.uOffsets, this.offsets());
      gl.uniform2fv(this.uA.uCam, this.cams());
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.depthTex);
      gl.uniform1i(this.uA.uDepth, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform3fv(this.uA.uInks, new Float32Array(P.inks.concat([[1, 1, 1], [1, 1, 1], [1, 1, 1]]).slice(0, 4).flat())); // no ink on the drums a set lacks
      gl.uniform3f(this.uA.uPaper, P.paper[0], P.paper[1], P.paper[2]);
      gl.uniform2fv(this.uA.uBorder, this.border);
      gl.uniform4fv(this.uA.uGround, P.ground ? P.ground.concat(1) : [0, 0, 0, 0]);
      gl.uniform1f(this.uA.uJitter, P.jitter);
      gl.uniform1f(this.uA.uRough, P.rough);
      gl.uniform1f(this.uA.uGrain, P.grain);
      var A = new Float32Array(32), B = new Float32Array(32);
      this.scratches.forEach(function (s, i) {
        A.set([s.x, s.y0, s.y1, s.w], i * 4);
        B.set([s.bits, s.strength, s.seed, 0], i * 4);
      });
      gl.uniform1i(this.uA.uScratchCount, this.scratches.length);
      gl.uniform4fv(this.uA.uScratchA, A);
      gl.uniform4fv(this.uA.uScratchB, B);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(this.progB);
      gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
      gl.uniform1i(this.uB.uTex, 0);
      gl.uniform2f(this.uB.uTexel, 1 / W, 1 / H);
      gl.uniform1f(this.uB.uLumaBlur, P.lumaBlur);
      gl.uniform1f(this.uB.uChromaBlur, P.chromaBlur);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    }

    link(vs, fs) {
      var gl = this.gl;
      var mk = function (type, src) {
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
        return s;
      };
      var p = gl.createProgram();
      gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, "aPos");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
      return p;
    }
  }

  // Every print gets its own press, drawn around the reference's values: how
  // hard it shakes, how far each plate wanders and sits off register, how much
  // how scratched it is. The colours bleed alike on every one.
  function press() {
    var r = function (a, b) { return a + Math.random() * (b - a); };
    return {
      seed: r(0, 1000), shake: r(0.6, 1.5), drift: r(0.6, 1.6), depth: r(0.7, 1.4), depthDiff: r(0.7, 1.4),
      register: [0, 0, 0, 0, 0, 0, 0, 0].map(function () { return r(-1, 1); }), scratches: r(0, 2)
    };
  }
  function pressed(P, d) {
    return {
      seed: d.seed,
      ampGlobal: P.ampGlobal * d.shake * P.motion,
      ampDiff: P.ampDiff * d.drift * P.motion,
      ampDepth: P.ampDepth * d.depth * P.motion,
      ampDepthDiff: P.ampDepthDiff * d.depthDiff * P.motion,
      register: d.register.map(function (v) { return v * P.misregister; }),
      lumaBlur: P.lumaBlur * P.soft,
      chromaBlur: P.chromaBlur * P.soft,
      scratchesMean: 4 * P.scratches * d.scratches,
      rough: 0.6 * P.starve
    };
  }

  // Smooth noise in [-1, 1]: a random value at every integer, eased in between,
  // the same values again every `n` (24 frames over 2, 2.4 and 3 are whole).
  function drift(t, seed, n) {
    var i = Math.floor(t), f = t - i;
    f = f * f * (3 - 2 * f);
    return rand(i % n, seed) * (1 - f) + rand((i + 1) % n, seed) * f;
  }
  function rand(i, seed) {
    var x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
    return 2 * (x - Math.floor(x)) - 1;
  }

  function poisson(mean) {
    var L = Math.exp(-mean), k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  }
  function pick(vals, probs) {
    var r = Math.random();
    for (var i = 0; i < vals.length; i++) { r -= probs[i]; if (r <= 0) return vals[i]; }
    return vals[vals.length - 1];
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* -------------------------------------------------------------------------
     Page: one renderer per canvas. A card's dots are 1.5 CSS px (finer than
     the reference's 2) and a whole number of device pixels; the print under
     its project has as many dots across its photo on a phone as on a desktop.
     Animated only while on screen, and never for someone who asked for less
     motion.
     ---------------------------------------------------------------------- */
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));

  // Dots `dots` CSS px wide on a screen of `dpr`: whole device pixels a cell,
  // the moves and the blur kept to their size on screen.
  function sizes(dots, dpr) {
    var cell = Math.max(2, Math.round(dots * dpr));
    return { dots: dots, cell: cell, scale: (2 * dpr) / cell, lumaBlur: 0.22 * cell, chromaBlur: 0.33 * cell };
  }

  // `dots` across a photo `side` px on its short side, whatever the screen or
  // the sheet round it: the cell a fraction of the photo, and the moves and
  // the blur with it, as they were with 1.5 px dots on a 480 px photo.
  function ruling(dots, side) {
    var cell = side / dots;
    return { cell: cell, scale: (2 * dots) / 480, lumaBlur: 0.22 * cell, chromaBlur: 0.33 * cell };
  }

  document.querySelectorAll("canvas[data-halftone]").forEach(function (canvas) {
    var img = new Image();
    img.src = canvas.getAttribute("data-halftone");
    img.alt = canvas.getAttribute("aria-label") || "";
    img.decode().then(function () {
      var fx = new CMYKHalftone(canvas, sizes(1.5, dpr));
      var next = canvas.nextElementSibling;
      if (next && next.classList.contains("halftone-tools")) tools(next, canvas, fx);
      print(fx, img);
      var depth = new Image();
      depth.src = canvas.getAttribute("data-depth") || "";
      depth.decode().then(function () { fx.setDepth(dilate(depth)); }, function () {});
      if (still) return;
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) fx.start();
        else fx.stop();
      }).observe(canvas);
    }).catch(function () {
      img.className = canvas.className;
      canvas.replaceWith(img);
    });
  });

  // Near things grow a few pixels past their outline, then the map is softened:
  // where a plate's view slides off a near thing, what stretches is the ground
  // just behind it, gently, not the thing's own edge.
  function dilate(src) {
    var img = src;
    if (!(src instanceof ImageData)) {
      var k = Math.min(1, 512 / Math.max(src.width, src.height));
      var ctx = Object.assign(document.createElement("canvas"), { width: Math.round(src.width * k), height: Math.round(src.height * k) }).getContext("2d", { willReadFrequently: true });
      ctx.drawImage(src, 0, 0, ctx.canvas.width, ctx.canvas.height);
      img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    var w = img.width, h = img.height, v = new Float32Array(w * h), i;
    for (i = 0; i < w * h; i++) v[i] = img.data[i * 4];
    filter(v, w, h, Math.round(w / 100), true); // about 1% of the width each side
    filter(v, w, h, Math.round(w / 160), false);
    for (i = 0; i < w * h; i++) img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v[i];
    return img;
  }

  // In place, `r` each side, along x then along y: the largest value, or the mean.
  function filter(v, w, h, r, max) {
    var tmp = new Float32Array(w * h);
    for (var pass = 0; pass < 2; pass++) {
      var from = pass ? tmp : v, to = pass ? v : tmp;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var acc = 0;
        for (var t = -r; t <= r; t++) {
          var u = pass ? from[Math.min(h - 1, Math.max(0, y + t)) * w + x] : from[y * w + Math.min(w - 1, Math.max(0, x + t))];
          acc = max ? Math.max(acc, u) : acc + u / (2 * r + 1);
        }
        to[y * w + x] = acc;
      }
    }
  }

  // A visitor's photo has no depth map, so Depth Anything works one out in the
  // browser: about 27 MB of model on the first photo, cached after that. It
  // runs in a worker of its own, as loading and running it take seconds the
  // page would otherwise freeze for. It says how much of the model has come,
  // then sends the depth back as RGBA, 512 px at most on its long side (it
  // comes out the photo's size, and the plates are smaller than that). The
  // photo itself goes nowhere.
  //
  // The model and ONNX Runtime's WASM are kept in IndexedDB, not the Cache API
  // transformers.js uses by default: the site's service worker deletes every
  // cache but its own whenever the site changes, and 27 MB should come down
  // once, not once a release.
  var DEPTH_WORKER = `
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1";
const db = new Promise((ok, ko) => {
  const r = indexedDB.open("halftone-depth", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("files");
  r.onsuccess = () => ok(r.result);
  r.onerror = () => ko(r.error);
});
const files = async (mode, op) => {
  const tx = (await db).transaction("files", mode), r = op(tx.objectStore("files"));
  return new Promise((ok, ko) => { tx.oncomplete = () => ok(r.result); tx.onerror = () => ko(tx.error); });
};
env.useBrowserCache = false;
env.useCustomCache = true;
env.customCache = {
  match: async (key) => { const f = await files("readonly", (s) => s.get(key)); return f && new Response(f.body, { headers: f.headers }); },
  put: async (key, res) => { const body = await res.blob(); await files("readwrite", (s) => s.put({ body, headers: [...res.headers] }, key)); }
};
const run = pipeline("depth-estimation", "onnx-community/depth-anything-v2-small", {
  dtype: "q8",
  progress_callback: (p) => p.status === "progress" && /\.onnx$/.test(p.file) && postMessage({ progress: p.progress })
});
onmessage = async ({ data: { id, blob } }) => {
  try {
    let d = (await (await run)(blob)).depth;
    const k = Math.min(1, 512 / Math.max(d.width, d.height));
    d = (await d.resize(Math.round(d.width * k), Math.round(d.height * k))).rgba();
    postMessage({ id, width: d.width, height: d.height, data: d.data }, [d.data.buffer]);
  } catch (e) {
    postMessage({ id, error: String(e) });
  }
};`;
  var worker, asked = 0;
  function depthOf(blob, progress) {
    worker = worker || new Worker(URL.createObjectURL(new Blob([DEPTH_WORKER], { type: "text/javascript" })), { type: "module" });
    var id = ++asked;
    return new Promise(function (done, fail) {
      worker.onerror = function (e) { worker = null; fail(e); };
      worker.onmessage = function (e) {
        var m = e.data;
        if (m.progress != null) return progress(m.progress);
        if (m.id !== id) return; // an earlier photo's, not wanted any more
        if (m.error) return fail(new Error(m.error));
        done(new ImageData(new Uint8ClampedArray(m.data.buffer), m.width, m.height));
      };
      worker.postMessage({ id: id, blob: blob });
    });
  }

  // The sheet as wide as its canvas, in the format's shape or else the photo's,
  // and the whole photo on it in whole cells, at least `padding` of its short
  // side from every edge, the rest bare paper. The one under its project fits
  // inside its canvas's fixed box, so the panel by it never moves, sized to
  // its device pixels, its dots a share of the photo: its plates are then the
  // photo's alone, and a new format or padding lays the same ones out again
  // (`keep`), smaller or larger, with no new dither. A card's is blurred anyway.
  function print(fx, img, keep) {
    var P = fx.base, p = P.padding || 0, r = img.width / img.height, b = p / (1 - 2 * p), c = fx.canvas;
    var tool = c.classList.contains("halftone");
    fx.aspect = P.aspect || (Math.max(r, 1) + 2 * b) / (Math.max(1 / r, 1) + 2 * b);
    var W = Math.floor(Math.min(c.clientWidth, tool ? c.clientHeight * fx.aspect : Infinity) * dpr), H = Math.round(W / fx.aspect);
    var m = p * Math.min(W, H), s = Math.min((W - 2 * m) / img.width, (H - 2 * m) / img.height);
    if (tool) Object.assign(P, ruling(P.dots, s * Math.min(img.width, img.height))), fx.update();
    var k = s / P.cell;
    fx.image = img;
    fx.setPlates((keep && fx.plates) || buildPlates(img, { width: Math.ceil(img.width * k), height: Math.ceil(img.height * k), margin: P.margin, gain: Math.PI * P.radius * P.radius, inks: P.inks, paper: P.paper }), W, H);
  }

  // The sheet on screen, scaled up to `R` px on its short side and an even
  // number on the other as video wants: the same plates, so the same dots,
  // with its press, inks, settings and depth. `draw(i)` puts its frame `i` on
  // `ctx`. Its moves come round again every 24 frames, so they loop without a
  // jump.
  var frame = function (a, R) { return a < 1 ? [R, 2 * Math.round(R / a / 2)] : [2 * Math.round((R * a) / 2), R]; };
  function copy(fx, R) {
    var g = new CMYKHalftone(document.createElement("canvas"), fx.base), f = frame(fx.aspect, R);
    var k = R / Math.min(fx.canvas.width, fx.canvas.height);
    ["cell", "lumaBlur", "chromaBlur"].forEach(function (n) { g.base[n] *= k; });
    g.base.loop = 24;
    g.dice = fx.dice;
    g.update();
    g.setPlates(fx.plates, f[0], f[1]);
    g.setDepth(fx.depth);
    var ctx = Object.assign(document.createElement("canvas"), { width: g.canvas.width, height: g.canvas.height }).getContext("2d", { willReadFrequently: true });
    return {
      ctx: ctx,
      draw: function (i) {
        g.frame = i;
        g.updateScratches();
        g.render();
        ctx.drawImage(g.canvas, 0, 0);
      },
      done: function () { g.gl.getExtension("WEBGL_lose_context").loseContext(); }
    };
  }
  var breathe = function () { return new Promise(function (go) { setTimeout(go); }); };

  // The loop as a GIF, on the first frame's palette, a frame at a time so the
  // page breathes in between.
  async function gif(fx, R) {
    var G = await import("https://cdn.jsdelivr.net/npm/gifenc@1.0.3/+esm");
    var c = copy(fx, R), W = c.ctx.canvas.width, H = c.ctx.canvas.height, enc = G.GIFEncoder(), palette;
    for (var i = 0; i < 24; i++) {
      c.draw(i);
      var px = c.ctx.getImageData(0, 0, W, H).data;
      palette = palette || G.quantize(px, 256);
      enc.writeFrame(G.applyPalette(px, palette), W, H, { palette: i ? null : palette, delay: 1000 / fx.params.fps });
      await breathe();
    }
    c.done();
    enc.finish();
    return new Blob([enc.bytes()], { type: "image/gif" });
  }

  // The loop `loops` times over as an H.264 MP4, encoded frame by frame
  // (WebCodecs), not recorded as it plays, so no frame is lost at either end.
  // About 16 bits a dot a frame, whatever the size: what costs is the dots.
  // ponytail: held to 40 Mbit/s (the default's 33 and some), since asking a
  // hardware encoder for the 280 that 960 dots came to hung a Mac outright.
  async function video(fx, R) {
    var M = await import("https://cdn.jsdelivr.net/npm/mediabunny@1.61.3/dist/bundles/mediabunny.min.mjs");
    var c = copy(fx, R), fps = fx.params.fps, dots = fx.plates.width * fx.plates.height;
    var out = new M.Output({ format: new M.Mp4OutputFormat(), target: new M.BufferTarget() });
    var track = new M.CanvasSource(c.ctx.canvas, { codec: "avc", bitrate: Math.min(16 * dots * fps, 40e6), keyFrameInterval: 2 });
    out.addVideoTrack(track, { frameRate: fps });
    await out.start();
    for (var i = 0; i < 24 * fx.base.loops; i++) {
      c.draw(i);
      await track.add(i / fps, 1 / fps);
    }
    c.done();
    await out.finalize();
    return new Blob([out.target.buffer], { type: "video/mp4" });
  }

  function download(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // The ink sets: process inks on an off-white sheet, or two or three of a
  // risograph's drums on cream, which buildPlates separates for those inks.
  var hex = function (h) { return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16) / 255; }); };
  var CREAM = hex("f7f0e1");
  var INKS = {
    cmyk: { inks: DEFAULTS.inks, paper: DEFAULTS.paper },
    "pink-blue": { inks: ["ff48b0", "0078bf"].map(hex), paper: CREAM },
    "pink-blue-yellow": { inks: ["ff48b0", "0078bf", "ffe800"].map(hex), paper: CREAM },
    "sunflower-black": { inks: ["ffb511", "1d1d1b"].map(hex), paper: CREAM },
    "teal-orange": { inks: ["00838a", "ff6c2f"].map(hex), paper: CREAM },
    "aqua-red": { inks: ["5ec8e5", "ff665e"].map(hex), paper: CREAM }
  };
  var css = function (c) { return "rgb(" + c.map(function (v) { return Math.round(v * 255); }) + ")"; };

  // Or two or three drums drawn at random, also on cream: a dark one, so the
  // print keeps its shadows, and one or two bright ones, none too like
  // another for the separation to tell them apart.
  var DARK = ["0078bf", "3255a4", "3d5588", "00838a", "00a95c", "765ba7", "914e72", "407060", "1d1d1b", "484d7a", "925f52", "6c5d80", "235ba8", "2f6165"].map(hex);
  var BRIGHT = ["ff48b0", "ffe800", "ffb511", "ff6c2f", "5ec8e5", "ff665e", "f15060", "ff7477", "62a8e5", "82d8d5", "e3ed55", "f984ca", "9d7ad2", "67b346", "ffae3b", "00aa93"].map(hex);
  var any = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  var near = function (a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.35; };
  function draw() {
    var inks = [any(DARK)], n = Math.random() < 0.5 ? 2 : 3;
    while (inks.length < n) {
      var ink = any(BRIGHT);
      if (!inks.some(function (i) { return near(i, ink); })) inks.unshift(ink);
    }
    return { inks: inks, paper: CREAM };
  }

  // What each slider sets in the renderer's settings, from its value.
  var KNOBS = {
    // the ones in % are shares of the renderer's 1
    disorder: function (v) { return { jitter: v / 100 }; },
    scratchStrength: function (v) { return { scratchStrength: v / 100 }; },
    starve: function (v) { return { starve: v / 100 }; },
    // shake is how much the press moves at all, and at 0 the print holds still;
    // off register is how far the plates sit and wander apart, depth how far
    // they part by depth as it moves
    shake: function (v) { return { motion: v }; },
    register: function (v) { return { misregister: DEFAULTS.misregister * v, ampDiff: DEFAULTS.ampDiff * v }; },
    depth: function (v) { return { ampDepth: DEFAULTS.ampDepth * v, ampDepthDiff: DEFAULTS.ampDepthDiff * v }; },
    padding: function (v) { return { padding: v / 100 }; }
  };
  // the sheet's width over its height; 0 for the photo's own
  var FORMATS = { photo: 0, square: 1, landscape: 16 / 9, portrait: 4 / 5 };
  // the others set the setting they are named after
  var knob = function (name, v) { var o = {}; o[name] = v; return (KNOBS[name] || function () { return o; })(v); };

  /* Beside the print, or under it on a narrow screen: a panel that shows one
     thing at a time. Its root lists the photo and six topics, each with what
     it is set to; a topic goes through its choices a step at a time, its
     sliders together on one, back and forth or straight to a step by its
     dot, and the export through the file,
     its size, its loops if it is a video and a recap, each choice tapped
     moving on to the next. The photo is the visitor's own if they like,
     picked, dropped on the print or pasted, read locally (nothing is sent
     anywhere). The settings are read off the controls first, so a form the
     browser restored still says what is printed. */
  function tools(bar, canvas, fx) {
    var file = bar.querySelector("input[type=file]"), pick = bar.querySelector("[data-pick]");
    var note = canvas.parentNode.querySelector("small[data-busy]"), said = note.textContent, photos = 0;
    var busy = function (on) { [canvas, bar, note].forEach(function (e) { e.setAttribute("aria-busy", on); }); };
    var photoChip = bar.querySelector("[name=format][value=photo] + span");
    var named = function (path) {
      fx.name = path.split("/").pop().replace(/\.[^.]*$/, "") || "halftone";
      pick.lastChild.textContent = fx.name;
    };
    named(canvas.getAttribute("data-halftone"));
    var load = function (f) {
      if (!f || !/^image\//.test(f.type)) return;
      var img = new Image(), mine = ++photos;
      busy(true); // from now: decoding and dithering a big photo take a moment too
      img.src = URL.createObjectURL(f);
      img.decode().then(function () {
        canvas.setAttribute("aria-label", f.name || "");
        named(f.name || "");
        fx.reroll();
        print(fx, img);
        photoChip.style.aspectRatio = img.width + " / " + img.height;
        fx.setDepth(fx.flat()); // until its depth is known
        URL.revokeObjectURL(img.src);
        note.textContent = note.dataset.busy;
        depthOf(f, function (pc) {
          if (mine === photos) note.textContent = note.dataset.busy + " " + Math.round(pc) + " %";
        }).then(function (d) {
          if (mine === photos) fx.setDepth(dilate(d));
        }, function (e) {
          console.warn("No depth for this photo, so it stays flat:", e);
        }).then(function () {
          if (mine !== photos) return;
          note.textContent = said;
          busy(false);
        });
      }, function () {
        if (mine === photos) busy(false); // not an image the browser can read
      });
    };
    pick.onclick = function () { file.click(); };
    file.onchange = function () { load(file.files[0]); };
    canvas.ondragover = function (e) { e.preventDefault(); };
    canvas.ondrop = function (e) { e.preventDefault(); load(e.dataTransfer.files[0]); };
    document.addEventListener("paste", function (e) { load(e.clipboardData.files[0]); });

    // each ink set shows its inks overprinted on its paper; the random one
    // the draw it will print, and a new one at each click once printed
    bar.querySelectorAll("input[name=inks]").forEach(function (radio) {
      var set = INKS[radio.value] || draw(), chips = radio.nextElementSibling;
      var paint = function () {
        chips.textContent = "";
        chips.style.background = css(set.paper);
        set.inks.forEach(function (ink) { chips.appendChild(document.createElement("i")).style.background = css(ink); });
      };
      var use = function () {
        Object.assign(fx.base, set);
        fx.update();
        print(fx, fx.image);
      };
      paint();
      if (radio.checked) Object.assign(fx.base, set);
      if (INKS[radio.value]) return (radio.onchange = use);
      radio.onclick = function () {
        if (fx.base.inks === set.inks) {
          set = draw();
          paint();
        }
        use();
      };
    });
    bar.querySelectorAll("input[name=format]").forEach(function (radio) {
      if (radio.checked) fx.base.aspect = FORMATS[radio.value];
      radio.onchange = function () {
        fx.base.aspect = FORMATS[radio.value];
        print(fx, fx.image, true);
      };
    });
    // round the print, the sheet itself or a flat colour, the last one picked
    bar.querySelectorAll("input[name=ground]").forEach(function (radio) {
      var color = radio.parentNode.querySelector("[type=color]");
      var set = function () {
        fx.base.ground = color ? hex(color.value.slice(1)) : { paper: null, white: [1, 1, 1], black: [0, 0, 0] }[radio.value];
        fx.update();
        fx.render();
      };
      if (radio.checked) set();
      radio.onchange = set;
      if (color) color.oninput = function () { radio.checked = true; set(); };
    });
    var lang = document.documentElement.lang;
    bar.querySelectorAll("input[type=range]").forEach(function (input) {
      var out = input.nextElementSibling, show = function () { out.textContent = (+input.value).toLocaleString(lang) + (input.dataset.unit || ""); };
      show();
      Object.assign(fx.base, knob(input.name, +input.value));
      var redither = input.name === "dots", relay = input.name === "padding"; // new cells, a new dither; the same, smaller
      var applied = input.value, last = 0;
      var set = function () {
        applied = input.value;
        Object.assign(fx.base, knob(input.name, +input.value));
        fx.update();
        if (redither || relay) print(fx, fx.image, relay);
        else fx.render();
      };
      // a new dither at every step of a drag flickers like static: four a
      // second at most, and the last one when let go
      input.oninput = function () {
        show();
        if (redither && performance.now() - last < 250) return;
        last = performance.now();
        set();
      };
      input.onchange = function () { if (input.value !== applied) set(); };
    });
    fx.update();

    // What it is set to, said where it is shown: the file the export will
    // make, how long, and on the root what each topic is set to.
    var val = function (name) { return bar.querySelector("[name=" + name + "]:checked"); };
    var loops = bar.querySelector("[data-video]"), length = bar.querySelector("[data-length]"), recap = bar.querySelector("dl");
    if (!window.VideoEncoder) {
      bar.querySelector("[name=file][value=mp4]").parentNode.hidden = true;
      bar.querySelector("[name=file][value=gif]").checked = true;
    }
    var tell = function () {
      var mp4 = val("file").value === "mp4", f = frame(fx.aspect, +val("size").value);
      loops.hidden = !mp4;
      length.textContent = (fx.base.loops * 24) / fx.params.fps + " s";
      recap.querySelector("[data-file]").textContent = val("file").parentNode.textContent;
      recap.querySelector("[data-px]").textContent = val("size").parentNode.textContent + " · " + f[0] + "×" + f[1];
      recap.querySelector("[data-length]").textContent = mp4 ? length.textContent : 24 / fx.params.fps + " s, " + recap.querySelector("[data-length]").dataset.gif;
      bar.querySelectorAll("[data-open]").forEach(function (row) {
        row.lastChild.textContent = steps(bar.querySelector("[data-topic=" + row.dataset.open + "]")).map(function (s) {
          return s === loops ? length.textContent : [].map.call(s.querySelectorAll(":checked, [type=range]"), function (i) {
            return i.type === "radio" ? i.parentNode.textContent : i.previousElementSibling.textContent.toLowerCase() + " " + i.nextElementSibling.textContent;
          }).join(" · ");
        }).filter(Boolean).join(" · ");
      });
    };
    bar.addEventListener("input", tell);
    bar.addEventListener("change", tell);

    // The panel: the root, or a topic at one of its steps.
    var root = bar.querySelector("[data-view=root]"), view = bar.querySelector("[data-view=topic]");
    var title = view.querySelector("b"), dots = view.querySelector("p > span");
    var prev = bar.querySelector("[data-prev]"), next = bar.querySelector("[data-next]"), on = null, at = null;
    next.dataset.next = next.textContent;
    var steps = function (topic) { return [].filter.call(topic.querySelectorAll(".step"), function (s) { return !s.hidden; }); };
    // the panel as tall as the root or the topic last opened, whichever is
    // taller, and a topic's steps all as tall as its tallest
    var topics = bar.querySelectorAll("[data-topic]");
    topics.forEach(function (t) { t.hidden = true; });
    var show = function (topic, step) {
      var left = on;
      on = topic;
      at = step;
      root.inert = !!topic;
      view.inert = !topic;
      bar.querySelectorAll(".step").forEach(function (s) { s.inert = s !== step; });
      if (topic) topics.forEach(function (t) { t.hidden = t !== topic; });
      if (!topic) return bar.querySelector("[data-open=" + left.dataset.topic + "]").focus({ preventScroll: true });
      var all = steps(topic), i = all.indexOf(step);
      title.textContent = bar.querySelector("[data-open=" + topic.dataset.topic + "] b").textContent;
      dots.textContent = "";
      if (all.length > 1) all.forEach(function (s) {
        var dot = dots.appendChild(document.createElement("button"));
        dot.type = "button";
        dot.setAttribute("aria-label", s.querySelector("span").textContent);
        if (s === step) dot.setAttribute("aria-current", "step");
        dot.onclick = function () { show(topic, s); };
      });
      prev.hidden = !i; // the way back to the root is up top
      next.hidden = !!step.querySelector("[data-save]");
      next.textContent = i === all.length - 1 ? next.dataset.done : next.dataset.next;
      (step.querySelector(":checked, input, button") || step).focus({ preventScroll: true });
    };
    var go = function (d) {
      var all = steps(on), s = all[all.indexOf(at) + d];
      show(s ? on : null, s);
    };
    bar.querySelectorAll("[data-open]").forEach(function (row) {
      row.onclick = function () {
        var topic = bar.querySelector("[data-topic=" + row.dataset.open + "]");
        show(topic, steps(topic)[0]);
      };
    });
    bar.querySelector("[data-back]").onclick = function () { show(null); };
    prev.onclick = function () { go(-1); };
    next.onclick = function () { go(1); };
    bar.onkeydown = function (e) { if (e.key === "Escape" && on) show(null); };
    // the export is a cascade: a choice tapped, even the one already made,
    // and on to the next; the arrow keys only move it, so a keyboard can look
    var tapped = 0;
    bar.onpointerdown = function () { tapped = Date.now(); };
    bar.onclick = function (e) {
      if (e.target.type === "radio" && e.target.closest("[data-cascade]") && Date.now() - tapped < 1000) setTimeout(go, 180, 1);
    };

    bar.querySelector("[data-reroll]").onclick = function () { fx.reroll(); fx.render(); };
    // the form puts every control back as the page had it; each then says so
    bar.onreset = function () {
      setTimeout(function () {
        bar.querySelectorAll("input:checked, input[type=range]").forEach(function (i) {
          if (i.type === "range") i.dispatchEvent(new Event("input", { bubbles: true }));
          i.dispatchEvent(new Event("change", { bubbles: true }));
        });
      });
    };

    var save = bar.querySelector("[data-save]");
    save.onclick = function () {
      var format = val("file").value, make = format === "gif" ? gif : video, name = fx.name + "-" + val("size").parentNode.textContent + "." + format;
      save.disabled = true;
      save.setAttribute("aria-busy", true);
      make(fx, +val("size").value).then(function (blob) { download(blob, name); }, function (e) { console.warn("No " + name + ":", e); }).finally(function () {
        save.disabled = false;
        save.setAttribute("aria-busy", false);
        save.focus({ preventScroll: true }); // a disabled button drops it
      });
    };
    tell();
    bar.hidden = note.parentNode.hidden = false;
  }
})();
