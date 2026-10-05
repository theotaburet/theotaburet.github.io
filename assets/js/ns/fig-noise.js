// §1 of the natural steganography article: the sensor's noise is a budget.
// Noise variance against brightness, measured on the two RAW files at ISO 100
// and ISO 200, each with its line σ² = aμ + b. The button adds the stego
// signal of natural steganography to the ISO 100 points, a variance of
// (a₂ − a₁)x + b₂ − b₁, and they land on the ISO 200 line: the band between
// the two lines is the room the payload has.
//
// The points come from tools/ns-data.py (assets/data/ns/noise.json).
const DATA = new URL("../../data/ns/noise.json", import.meta.url);
const W = 560;
const H = 380;
const PAD = { l: 84, r: 16, t: 56, b: 48 }; // room on the left for the ticks and the axis title

export function mount(el, ctx) {
  const { d3, gsap } = ctx;
  let n = null; // the noise data, once loaded
  let added = false;
  let t = 0; // how far the stego signal has been added, 0 to 1
  let tween = null;
  let lit = null;

  el.textContent = "";
  const svg = d3
    .select(el)
    .append("svg")
    .attr("viewBox", "0 0 " + W + " " + H)
    .attr("role", "img")
    .attr("aria-label", "Noise variance against brightness at ISO 100 and ISO 200, two rising lines. Adding the stego signal to the ISO 100 points moves them onto the ISO 200 line.");
  const controls = d3.select(el).append("div").attr("class", "ns-controls");
  const button = controls
    .append("button")
    .attr("type", "button")
    .attr("class", "btn btn-sm btn-outline-secondary")
    .attr("aria-pressed", "false")
    .text("Add the stego signal")
    .on("click", () => {
      added = !added;
      button.attr("aria-pressed", String(added)).text(added ? "Take it away" : "Add the stego signal");
      if (tween) tween.kill();
      const to = added ? 1 : 0;
      if (ctx.still()) {
        t = to;
        paint();
      } else tween = gsap.to({ v: t }, { v: to, duration: 1.2, ease: "power2.inOut", onUpdate() { t = this.targets()[0].v; paint(); } });
    });

  fetch(DATA)
    .then(r => r.json())
    .then(d => {
      n = d;
      paint();
    });

  function paint() {
    if (!n) return;
    const c = ctx.colors();
    const fs = ctx.textSize(svg.node());
    svg.selectAll("*").remove();
    const da = n.iso200.a - n.iso100.a;
    const db = n.iso200.b - n.iso100.b;
    const line = (f, m) => f.a * m + f.b;
    const all = n.iso100.bins.concat(n.iso200.bins);
    const x = d3.scaleLinear([d3.min(all, p => p[0]) * 0.98, d3.max(all, p => p[0]) * 1.02], [PAD.l, W - PAD.r]);
    const y = d3.scaleLinear([0, d3.max(all, p => p[1]) * 1.12], [H - PAD.b, PAD.t]);
    const [m0, m1] = x.domain();

    // The axes, in ink.
    const ax = g => g.selectAll("text").attr("fill", c.ink).attr("font-size", fs);
    svg.append("g").attr("transform", "translate(0," + (H - PAD.b) + ")").call(d3.axisBottom(x).ticks(6)).call(ax).call(g => g.selectAll("line, path").attr("stroke", c.muted));
    svg.append("g").attr("transform", "translate(" + PAD.l + ",0)").call(d3.axisLeft(y).ticks(5)).call(ax).call(g => g.selectAll("line, path").attr("stroke", c.muted));
    svg.append("text").attr("x", (PAD.l + W - PAD.r) / 2).attr("y", H - 10).attr("text-anchor", "middle").attr("fill", c.ink).attr("font-size", fs).text("photosite value (14-bit, black level included)");
    svg.append("text").attr("transform", "rotate(-90)").attr("x", -(PAD.t + H - PAD.b) / 2).attr("y", fs + 2).attr("text-anchor", "middle").attr("fill", c.ink).attr("font-size", fs).text("noise variance");

    // The room for the payload: the band between the two lines, as it fills.
    if (t > 0) {
      svg.append("path")
        .attr("d", d3.area().x(m => x(m)).y0(m => y(line(n.iso100, m))).y1(m => y(line(n.iso100, m) + t * (da * m + db)))(d3.range(m0, m1, (m1 - m0) / 60).concat(m1)))
        .attr("fill", c.B)
        .attr("opacity", 0.35);
      svg.append("text").attr("x", x(m0 + (m1 - m0) * 0.62)).attr("y", y(line(n.iso100, m0 + (m1 - m0) * 0.62) + 0.5 * (da * (m0 + (m1 - m0) * 0.62) + db))).attr("fill", c.ink).attr("font-size", fs).attr("opacity", t).text("room for the payload");
    }

    // The two lines, then the points: ISO 200 as measured; ISO 100 as
    // measured, plus as much of the stego signal as has been added.
    svg.append("line").attr("class", "fit100").attr("x1", x(m0)).attr("x2", x(m1)).attr("y1", y(line(n.iso100, m0))).attr("y2", y(line(n.iso100, m1))).attr("stroke", c.A).attr("stroke-width", 2);
    svg.append("line").attr("class", "fit200").attr("x1", x(m0)).attr("x2", x(m1)).attr("y1", y(line(n.iso200, m0))).attr("y2", y(line(n.iso200, m1))).attr("stroke", c.D).attr("stroke-width", 2);
    const dots = (cls, pts, fill, key, dy) =>
      svg.append("g").attr("class", "pts " + cls + (lit === key ? " is-lit" : ""))
        .selectAll("circle").data(pts).join("circle")
        .attr("class", cls)
        .attr("cx", p => x(p[0]))
        .attr("cy", p => y(p[1] + dy(p[0])))
        .attr("r", 4.5)
        .attr("fill", fill)
        .attr("stroke", lit === key ? c.ink : c.paper)
        .attr("stroke-width", lit === key ? 2 : 1);
    dots("p200", n.iso200.bins, c.D, "iso200", () => 0);
    dots("p100", n.iso100.bins, c.A, "iso100", m => t * (da * m + db));

    // The legend, and the slope the eye cannot read: estimated here, and as
    // the paper measured it over its whole database.
    const legend = [[c.A, "ISO 100"], [c.D, "ISO 200"]];
    legend.forEach(([fill, label], i) => {
      svg.append("circle").attr("cx", PAD.l + 8 + i * 90).attr("cy", 18).attr("r", 5).attr("fill", fill);
      svg.append("text").attr("x", PAD.l + 18 + i * 90).attr("y", 22).attr("fill", c.ink).attr("font-size", fs).text(label);
    });
    svg.append("text").attr("x", W - PAD.r).attr("y", 22).attr("text-anchor", "end").attr("fill", c.ink).attr("font-size", fs)
      .text("a₂ − a₁ = " + da.toFixed(2) + " here, 1.15 in the paper");
  }

  return {
    steps: 1,
    show: () => paint(),
    redraw() {
      if (tween) {
        tween.kill();
        tween = null;
        t = added ? 1 : 0;
      }
      paint();
    },
    keys: ["iso100", "iso200"],
    highlight(key) {
      lit = key;
      paint();
    }
  };
}
