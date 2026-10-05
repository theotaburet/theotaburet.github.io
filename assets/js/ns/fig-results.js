// §7 of the natural steganography article: how much it carries.
//
// The detector's error P_E for each scheme of the paper's Table I, grouped by
// JPEG quality, with the payload of the natural steganography schemes under
// each group; J-Cov-NS against SRNet (Table III); and J-Cov-NS with an
// alphabet of 2K+1 integers (Table IV), K on a slider. 50 % is a coin toss.
//
// The numbers are the paper's, copied into assets/data/ns/results.json.
const DATA = new URL("../../data/ns/", import.meta.url);
const W = 640;
const PAD = { l: 56, r: 12, t: 34 };
const PLOT = 240;
// Each series: where its numbers are, its name, and how it is drawn.
const SERIES = [
  ["jcovns", "J-Cov-NS", "B", true],
  ["alphabet", "J-Cov-NS, 2K+1 integers", "B", false],
  ["srnet", "J-Cov-NS vs SRNet", "hot", false],
  ["pseudo", "pseudo-embedding", "C", true],
  ["scaling", "covariance scaling", "A", true],
  ["intra", "blocks drawn independently", "muted", true],
  ["independent", "coefficients drawn independently", "D", true],
  ["siuniward", "SI-UNIWARD at 1 bpnzAC", "ink", true]
];

export function mount(el, ctx) {
  const { d3, gsap } = ctx;
  let r = null;
  let k = 3; // K = 5, the paper's choice
  let from = null; // where the alphabet's points were, to move them from

  el.textContent = "";
  // A viewBox from the start: the text is sized by it, at the first paint too.
  const svg = d3.select(el).append("svg").attr("viewBox", "0 0 " + W + " " + (PAD.t + PLOT + 40)).attr("role", "img")
    .attr("aria-label", "The detector's error for each scheme at JPEG qualities 100, 95, 85 and 75. J-Cov-NS stays near 42 %, close to the 50 % of a coin toss, where the other ways of drawing the signal, and SI-UNIWARD, fall towards 0 at high qualities.");
  const legend = d3.select(el).append("div").attr("class", "ns-controls");
  const controls = d3.select(el).append("div").attr("class", "ns-controls");
  const label = controls.append("label");
  label.append("span").text("Alphabet");
  const slider = label.append("input").attr("type", "range").attr("min", 0).attr("max", 3).attr("step", 1).property("value", k)
    .attr("aria-label", "Half the alphabet, K").attr("data-k", 5)
    .on("input", function () {
      from = svg.selectAll('circle.pe[data-series="alphabet"]').nodes().map(n => +n.getAttribute("cy"));
      k = +this.value;
      paint();
    });
  const out = label.append("output");
  const note = d3.select(el).append("p").attr("class", "ns-view-label").style("text-align", "center");

  Promise.all([fetch(new URL("results.json", DATA)).then(x => x.json()), fetch(new URL("hook.json", DATA)).then(x => x.json())]).then(([res, hook]) => {
    r = res;
    note.text("At QF 100 that is about " + r.bpp[100] + " bit a pixel (Fig. 13a). The 256×256 crop that opens this article carries " + hook.kbytes.toFixed(1) + " KB.");
    paint();
  });

  function paint() {
    if (!r) return;
    const c = ctx.colors();
    const fs = ctx.textSize(svg.node());
    const T = Math.max(PAD.t, fs * 2.8); // room above the plot for the axis title, bigger on a phone
    const K = r.alphabet.K[k];
    slider.attr("data-k", K).attr("aria-valuetext", "K = " + K);
    out.text("K = " + K + ", " + (2 * K + 1) + " integers");
    const H = T + PLOT + fs * 3.4;
    svg.attr("viewBox", "0 0 " + W + " " + H).selectAll("*").remove();
    const y = d3.scaleLinear([0, 50], [T + PLOT, T]);
    const band = d3.scaleBand(r.qf, [PAD.l, W - PAD.r]).paddingInner(0.12);
    const slot = d3.scaleBand(SERIES.map(s => s[0]), [0, band.bandwidth()]).padding(0.2);
    const text = (x, yy, words, fill, anchor) =>
      svg.append("text").attr("x", x).attr("y", yy).attr("fill", fill || c.ink).attr("font-size", fs).attr("text-anchor", anchor || "middle").text(words);

    // The grid, and the coin toss.
    [0, 10, 20, 30, 40].forEach(v => {
      svg.append("line").attr("x1", PAD.l).attr("x2", W - PAD.r).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", c.rule);
      text(PAD.l - 8, y(v) + fs / 3, v, c.ink, "end");
    });
    svg.append("line").attr("x1", PAD.l).attr("x2", W - PAD.r).attr("y1", y(50)).attr("y2", y(50)).attr("stroke", c.muted).attr("stroke-dasharray", "5 4");
    text(PAD.l - 8, y(50) + fs / 3, 50, c.ink, "end");
    text(W - PAD.r, y(50) - 7, "50 %: a coin toss", c.ink, "end");
    const axis = text(4, T - fs * 1.3, "P", c.ink, "start");
    axis.append("tspan").attr("baseline-shift", "sub").attr("font-size", fs * 0.75).text("E");
    axis.append("tspan").text(" (%)");

    r.qf.forEach((qf, i) => {
      const x0 = band(qf);
      text(x0 + band.bandwidth() / 2, T + PLOT + fs * 1.4, "QF " + qf);
      text(x0 + band.bandwidth() / 2, T + PLOT + fs * 2.7, r.payload[i].toFixed(1) + " bpnzAC", c.muted);
      SERIES.forEach(([key, name, hue, filled]) => {
        const pe = key === "srnet" ? r.srnet[i] : key === "alphabet" ? r.alphabet.pe[i][k] : r.tableI[key][i];
        if (pe === null) return;
        const colour = c[hue];
        svg.append("circle").attr("class", "pe").attr("data-series", key).attr("data-qf", qf).attr("data-pe", pe)
          .attr("cx", x0 + slot(key) + slot.bandwidth() / 2).attr("cy", y(pe)).attr("r", 5.5)
          .attr("fill", filled ? colour : c.paper).attr("stroke", filled ? c.paper : colour).attr("stroke-width", filled ? 1 : 2.5)
          .append("title").text(name + (key === "alphabet" ? ", K = " + K : "") + ", QF " + qf + ": " + pe.toFixed(1) + " %");
      });
    });

    // The alphabet's points move from where they were.
    if (from && !ctx.still()) {
      svg.selectAll('circle.pe[data-series="alphabet"]').nodes().forEach((n, i) => {
        const to = +n.getAttribute("cy");
        gsap.fromTo(n, { attr: { cy: from[i] } }, { attr: { cy: to }, duration: 0.5, ease: "power2.out" });
      });
    }
    from = null;

    // The legend, in the page's text, so it wraps on a phone.
    legend.selectAll("span.ns-legend-item").data(SERIES).join("span").attr("class", "ns-legend-item")
      .style("display", "inline-flex").style("align-items", "center").style("gap", "0.35rem")
      .html("")
      .each(function ([, name, hue, filled]) {
        const item = d3.select(this);
        item.append("span").style("display", "inline-block").style("width", "0.7rem").style("height", "0.7rem").style("border-radius", "50%")
          .style("background", filled ? c[hue] : "transparent").style("border", "2px solid " + c[hue]);
        item.append("span").text(name);
      });
  }

  return { steps: 1, show: () => paint(), redraw: () => paint() };
}
