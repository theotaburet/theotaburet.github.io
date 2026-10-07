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
uniform float uBorder;          // px of bare paper around the print

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
  return 1.0 + 0.07 * (vnoise(c * vec2(0.6, 2.0)) - 0.5) + 0.05 * (vnoise(c / 12.0) - 0.5);
}

float inked(ivec2 c, int plate) {
  if (c.x < 0 || c.y < 0 || c.x >= int(uPlateSize.x) || c.y >= int(uPlateSize.y)) return 0.0;
  vec4 t = texelFetch(uPlates, c, 0);
  return plate == 0 ? t.r : plate == 1 ? t.g : plate == 2 ? t.b : t.a;
}

// every inked cell holds a round dot, anti-aliased over a pixel; a dot a little
// wider than its cell reaches into the next one, hence the neighbours
float ink(vec2 pos, int plate) {
  ivec2 c0 = ivec2(floor(pos));
  float cov = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      ivec2 c = c0 + ivec2(dx, dy);
      if (inked(c, plate) < 0.5) continue;
      float d = length(pos - vec2(c) - 0.5) * uCell;
      cov = max(cov, clamp(uRadius * uCell - d + 0.5, 0.0, 1.0));
    }
  }
  return cov;
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
    fragColor = vec4(color, 1.0);
    return;
  }
  float z = pow(texture(uDepth, (fragPx / uCell + uMargin) / uPlateSize).r, uDepthCurve) - uPivot;
  for (int p = 0; p < 4; p++) {
    // whole half-cells only: the grain holds still between steps and the
    // planes part along seams instead of smearing
    vec2 shift = floor((uOffsets[p] + z * uCam[p]) * 2.0 + 0.5) / 2.0;
    vec2 pos = fragPx / uCell + uMargin - shift;
    color *= mix(vec3(1.0), uInks[p], ink(pos, p) * scratchMask(fragPx, p));
  }
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

  // Floyd-Steinberg on a density plane in [0,1], 1 = ink, serpentine so it
  // draws no diagonal lattice in the light tones. `f` mirrors the plane first
  // (1 in x, 2 in y): a different orientation per plate is what screen angles
  // are on a press, the plates' grain stops lining up.
  function floydSteinberg(src, w, h, f, noise) {
    var at = function (x, y) { return (f & 2 ? h - 1 - y : y) * w + (f & 1 ? w - 1 - x : x); };
    var buf = new Float32Array(w * h), out = new Uint8Array(w * h), x, y;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) buf[y * w + x] = src[at(x, y)];
    for (y = 0; y < h; y++) {
      var d = y & 1 ? -1 : 1;
      for (var k = 0; k < w; k++) {
        x = d > 0 ? k : w - 1 - k;
        var i = y * w + x, v = buf[i] >= 0.5 + noise * (Math.random() - 0.5) ? 1 : 0, err = buf[i] - v;
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

  // Resampled to the plane through a 2D canvas (bilinear).
  function buildPlates(image, opts) {
    opts = opts || {};
    var planeWidth = opts.planeWidth || 320;
    // fitted on the reference video
    var kWeight = opts.kWeight != null ? opts.kWeight : 0.3;
    var contrast = opts.contrast || 1.1;
    var saturation = opts.saturation || 1.2;
    var balance = opts.balance || [0.9, 0.95, 1]; // gains on red, green and blue, for the reference's neutral greys
    var gamma = opts.gamma || 0.65; // lifts the middle tones, which real inks and overlaps darken
    // a dot covers `gain` cells, overlaps aside: dither less ink, so the dots
    // that spread past their cells still add up to the right tone
    var spread = 1 / (opts.gain || 1);

    var w = planeWidth;
    var h = Math.max(1, Math.round((planeWidth * image.height) / image.width));

    var cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    var ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, w, h);
    var px = ctx.getImageData(0, 0, w, h).data;

    var n = w * h;
    var c = new Float32Array(n), m = new Float32Array(n), y = new Float32Array(n), k = new Float32Array(n);

    for (var i = 0; i < n; i++) {
      var r = (px[i * 4] / 255) * balance[0], g = (px[i * 4 + 1] / 255) * balance[1], b = (px[i * 4 + 2] / 255) * balance[2];
      // light grade: saturation around luminance, then contrast around 0.5
      var l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * saturation; g = l + (g - l) * saturation; b = l + (b - l) * saturation;
      r = Math.pow(clamp01((r - 0.5) * contrast + 0.5), gamma);
      g = Math.pow(clamp01((g - 0.5) * contrast + 0.5), gamma);
      b = Math.pow(clamp01((b - 0.5) * contrast + 0.5), gamma);
      // naive separation: pure inks, no under-colour removal
      c[i] = 1 - Math.pow(r, spread);
      m[i] = 1 - Math.pow(g, spread);
      y[i] = 1 - Math.pow(b, spread);
      k[i] = 1 - Math.pow(1 - (1 - Math.max(r, g, b)) * kWeight, spread);
    }

    var f = shuffle([0, 1, 2, 3]); // which plate gets which orientation changes every print
    var noise = opts.noise != null ? opts.noise : 0.8; // a jittered threshold: no rows or lattices
    var bc = floydSteinberg(c, w, h, f[0], noise);
    var bm = floydSteinberg(m, w, h, f[1], noise);
    var by = floydSteinberg(y, w, h, f[2], noise);
    var bk = floydSteinberg(k, w, h, f[3], noise);

    var data = new Uint8Array(n * 4);
    for (var j = 0; j < n; j++) {
      data[j * 4] = bc[j] * 255;
      data[j * 4 + 1] = bm[j] * 255;
      data[j * 4 + 2] = by[j] * 255;
      data[j * 4 + 3] = bk[j] * 255;
    }
    return { width: w, height: h, data: data };
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
    scale: 1,              // our cells to the reference's: the moves below are measured in its cells
    margin: 8,             // cells dithered past every edge, more than any plate ever moves, so no edge shows
    ampGlobal: 0.65,       // cells; the sheet's shake, measured on the reference
    ampDiff: 0.4,          // cells; each plate's own drift on top of it
    ampDepth: 2.25,        // cells per unit of nearness: the viewpoint all the plates share
    ampDepthDiff: 2.4,     // and how far each plate's own wanders from it
    depthCurve: 0.3,       // fitted on the reference: its parallax separates the middle
    pivot: 0.46,           // distance from the far, not just the near from the rest
    fps: 12,
    lumaBlur: 0.45,        // px; the reference's dots are a little soft
    chromaBlur: 0.65,      // px; more turns the dots' colours to mud
    scratchesMean: 5,
    scratchStrength: [0.5, 0.85],
    border: 0,             // px of bare paper around the print
    loop: Infinity,        // frames after which the moves come round again
    register: [0, 0, 0, 0, 0, 0, 0, 0], // cells; where each plate sits when still
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
      for (const n of ["uPlates", "uPlateSize", "uMargin", "uCell", "uRadius", "uOffsets", "uDepth", "uCam", "uDepthCurve", "uPivot", "uInks", "uPaper", "uBorder", "uScratchCount", "uScratchA", "uScratchB"])
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

    setPlates(plates) {
      var gl = this.gl;
      this.plates = plates;
      var cell = this.params.cell;
      var m = this.params.margin;
      this.canvas.width = (plates.width - 2 * m) * cell + 2 * this.params.border;
      this.canvas.height = (plates.height - 2 * m) * cell + 2 * this.params.border;
      this.canvas.style.aspectRatio = this.canvas.width + " / " + this.canvas.height;

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

    reroll() {
      this.params = Object.assign({}, this.base, press(this.base));
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
      var H = this.canvas.height - 2 * P.border, W = this.canvas.width - 2 * P.border;
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
          strength: P.scratchStrength[0] + Math.random() * (P.scratchStrength[1] - P.scratchStrength[0]),
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
      gl.uniform3fv(this.uA.uInks, new Float32Array(P.inks.flat()));
      gl.uniform3f(this.uA.uPaper, P.paper[0], P.paper[1], P.paper[2]);
      gl.uniform1f(this.uA.uBorder, P.border);
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
  // the colour bleeds, the dots boil and spread, and how scratched it is.
  function press(P) {
    var r = function (a, b) { return a + Math.random() * (b - a); };
    return {
      seed: r(0, 1000),
      ampGlobal: P.ampGlobal * r(0.6, 1.5),
      ampDiff: P.ampDiff * r(0.6, 1.6),
      ampDepth: P.ampDepth * r(0.7, 1.4),
      ampDepthDiff: P.ampDepthDiff * r(0.7, 1.4),
      register: P.register.map(function (v) { return v + r(-0.5, 0.5); }),
      chromaBlur: P.chromaBlur * r(0.6, 1.4),
      scratchesMean: r(0, 8)
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
     Page: one renderer per canvas, its dots 1.5 CSS px (finer than the
     reference's 2) and a whole number of device pixels, its moves still the
     reference's size on screen. Animated only while on screen, and never for
     someone who asked for less motion.
     ---------------------------------------------------------------------- */
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  var cell = Math.max(2, Math.round(1.5 * dpr));

  // As many whole cells as fit in `width` CSS px. The print under its project
  // is sized to them exactly so no dot is resampled; a card's is blurred anyway.
  function fit(canvas, width) {
    var n = Math.floor((width * dpr) / cell);
    if (canvas.classList.contains("halftone")) canvas.style.width = (n * cell) / dpr + "px";
    return n;
  }

  document.querySelectorAll("canvas[data-halftone]").forEach(function (canvas) {
    var img = new Image();
    img.src = canvas.getAttribute("data-halftone");
    img.alt = canvas.getAttribute("aria-label") || "";
    img.decode().then(function () {
      var fx = new CMYKHalftone(canvas, { cell: cell, scale: (2 * dpr) / cell, lumaBlur: 0.22 * cell, chromaBlur: 0.33 * cell });
      print(fx, img, fit(canvas, canvas.clientWidth));
      var depth = new Image();
      depth.src = canvas.getAttribute("data-depth") || "";
      depth.decode().then(function () { fx.setDepth(depth); }, function () {});
      var next = canvas.nextElementSibling;
      if (next && next.classList.contains("halftone-tools")) tools(next, canvas, fx);
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

  // A visitor's photo has no depth map, so Depth Anything works one out in the
  // browser: about 27 MB of model on the first photo, cached after that. The
  // photo itself still goes nowhere.
  var estimator;
  function depthOf(blob) {
    estimator = estimator || import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1").then(function (t) {
      return t.pipeline("depth-estimation", "onnx-community/depth-anything-v2-small", { dtype: "q8" });
    }).catch(function (e) { estimator = null; throw e; });
    return estimator.then(function (run) { return run(blob); }).then(function (r) { return r.depth.toCanvas(); });
  }

  // `cells` across the canvas, and the margin past it on both sides
  function print(fx, img, cells) {
    fx.image = img;
    fx.setPlates(buildPlates(img, { planeWidth: cells + 2 * fx.base.margin, gain: Math.PI * fx.base.radius * fx.base.radius }));
  }

  // The print again at the reference's 2 px a cell, 320 cells on its long
  // side, with its press, inks and depth, on a sheet with the reference's
  // margin: its 24 frames. Its moves come round again after the last one, so
  // they loop without a jump; it is dithered anew, so its grain isn't the screen's.
  function frames(fx) {
    var img = fx.image, n = Math.round(320 * Math.min(1, img.width / img.height)), k = 2 / fx.params.cell;
    var g = new CMYKHalftone(document.createElement("canvas"), fx.base);
    g.params = Object.assign({}, fx.params, { cell: 2, scale: 1, lumaBlur: fx.params.lumaBlur * k, chromaBlur: fx.params.chromaBlur * k, loop: 24 });
    g.params.border = Math.round(0.486 * Math.min(n, (n * img.height) / img.width)); // 167 px of paper round 688 of print
    print(g, img, n);
    g.setDepth(fx.depth);
    var W = g.canvas.width, H = g.canvas.height, out = [];
    var ctx = Object.assign(document.createElement("canvas"), { width: W, height: H }).getContext("2d", { willReadFrequently: true });
    for (g.frame = 0; g.frame < 24; g.frame++) {
      g.updateScratches();
      g.render();
      ctx.drawImage(g.canvas, 0, 0);
      out.push(ctx.getImageData(0, 0, W, H));
    }
    g.gl.getExtension("WEBGL_lose_context").loseContext();
    return out;
  }

  // For a web page: the loop as a GIF, on one palette.
  function gif(fx) {
    return import("https://cdn.jsdelivr.net/npm/gifenc@1.0.3/+esm").then(function (G) {
      var enc = G.GIFEncoder(), palette;
      frames(fx).forEach(function (f, i) {
        palette = palette || G.quantize(f.data, 256);
        enc.writeFrame(G.applyPalette(f.data, palette), f.width, f.height, { palette: i ? null : palette, delay: 1000 / fx.params.fps });
      });
      enc.finish();
      return new Blob([enc.bytes()], { type: "image/gif" });
    });
  }

  // For social networks: the loop three times over as an H.264 MP4, every dot
  // doubled so it lives through their own compression. Encoded frame by frame
  // (WebCodecs), not recorded as it plays, so no frame is lost at either end.
  async function video(fx) {
    var M = await import("https://cdn.jsdelivr.net/npm/mediabunny@1.61.3/dist/bundles/mediabunny.min.mjs");
    var fr = frames(fx), fps = fx.params.fps, src = document.createElement("canvas"), c = document.createElement("canvas");
    src.width = fr[0].width; src.height = fr[0].height;
    c.width = 2 * src.width; c.height = 2 * src.height;
    var ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    var out = new M.Output({ format: new M.Mp4OutputFormat(), target: new M.BufferTarget() });
    var track = new M.CanvasSource(c, { codec: "avc", bitrate: 1.5e7, keyFrameInterval: 2 });
    out.addVideoTrack(track, { frameRate: fps });
    await out.start();
    for (var i = 0; i < 3 * fr.length; i++) {
      src.getContext("2d").putImageData(fr[i % fr.length], 0, 0);
      ctx.drawImage(src, 0, 0, c.width, c.height);
      await track.add(i / fps, 1 / fps);
    }
    await out.finalize();
    return new Blob([out.target.buffer], { type: "video/mp4" });
  }

  function save(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // Riso drums for the C, M and Y plates, and none for K
  var RISO = [[0, 0.47, 0.75], [1, 0.28, 0.69], [1, 0.91, 0], [1, 1, 1]];

  /* The visitor's own photo, picked, dropped on the print or pasted, read
     locally (nothing is sent anywhere); a new press for the same photo; Riso
     inks; and the print as a GIF or a video. */
  function tools(bar, canvas, fx) {
    var file = bar.querySelector("input"), riso = bar.querySelector("[data-riso]");
    var note = bar.querySelector("small"), said = note.textContent, photos = 0;
    var load = function (f) {
      if (!f || !/^image\//.test(f.type)) return;
      var img = new Image();
      img.src = URL.createObjectURL(f);
      img.decode().then(function () {
        // as wide as the column, at most 80% of the screen tall
        canvas.style.width = "";
        var n = fit(canvas, Math.min(canvas.clientWidth, (innerHeight * 0.8 * img.width) / img.height));
        canvas.setAttribute("aria-label", f.name || "");
        fx.reroll();
        print(fx, img, n);
        fx.setDepth(fx.flat()); // until its depth is known
        URL.revokeObjectURL(img.src);
        var mine = ++photos;
        note.textContent = note.dataset.busy;
        depthOf(f).then(function (d) {
          if (mine === photos) fx.setDepth(d);
        }, function () {}).then(function () {
          if (mine === photos) note.textContent = said;
        });
      });
    };
    bar.querySelector("[data-pick]").onclick = function () { file.click(); };
    file.onchange = function () { load(file.files[0]); };
    canvas.ondragover = function (e) { e.preventDefault(); };
    canvas.ondrop = function (e) { e.preventDefault(); load(e.dataTransfer.files[0]); };
    document.addEventListener("paste", function (e) { load(e.clipboardData.files[0]); });

    bar.querySelector("[data-reprint]").onclick = function () {
      fx.reroll();
      print(fx, fx.image, fx.plates.width - 2 * fx.base.margin);
    };
    riso.onclick = function () {
      var on = riso.getAttribute("aria-pressed") !== "true";
      riso.setAttribute("aria-pressed", on);
      riso.classList.toggle("active", on);
      fx.base.inks = fx.params.inks = on ? RISO : DEFAULTS.inks;
      fx.render();
    };
    // one button per format, each idle until its file is ready
    var exporter = function (btn, make, name) {
      btn.onclick = function () {
        btn.disabled = true;
        make().then(function (blob) { save(blob, name); }).finally(function () { btn.disabled = false; });
      };
    };
    exporter(bar.querySelector("[data-gif]"), function () { return gif(fx); }, "halftone.gif");
    var vid = bar.querySelector("[data-video]");
    if (window.VideoEncoder) exporter(vid, function () { return video(fx); }, "halftone.mp4");
    else vid.hidden = true;
    bar.hidden = false;
  }
})();
