// Runs the figures of the natural steganography article.
//
// A pinned figure lives in a section like
//   <section class="ns-scrolly l-page" data-fig="toy">
//     <figure class="ns-fig" data-quiet><div class="ns-canvas"></div><figcaption>…</figcaption></figure>
//     <div class="ns-steps"><div class="ns-step">…</div>…</div>
//   </section>
// and is drawn into its .ns-canvas by fig-<name>.js next to this file, a
// module exporting
//   mount(el, ctx) → { steps, show(step, animate), redraw() }
// ctx hands it d3, gsap, the maths, the theme's colours and whether motion
// must hold still. This file does the rest: it loads a figure as it comes
// near and shows the state that matches the step of text in view. With
// motion reduced or the site paused it still does, at once, without
// animating: holding still is about movement, not about what is shown.
import * as maths from "./maths.js";
import "./notes.js";

const root = document.documentElement;
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
const still = () => reduce.matches || root.classList.contains("motion-paused");
const live = [];

// Read from the section's custom properties, so they follow the theme, and
// written back by a canvas as #rrggbb: the dark theme writes rgb(r g b),
// which d3 cannot read to mix.
const pen = document.createElement("canvas").getContext("2d");
function colors(el) {
  const cs = getComputedStyle(el);
  const v = n => {
    pen.fillStyle = "#000";
    pen.fillStyle = cs.getPropertyValue("--ns-" + n).trim();
    return pen.fillStyle;
  };
  return { A: v("a"), B: v("b"), C: v("c"), D: v("d"), blue: v("blue"), hot: v("hot"), ink: v("ink"), muted: v("muted"), paper: v("paper"), rule: v("rule") };
}

// The size, in an SVG's own units, of text that should read as 12px where
// the figure is drawn at full size and never fall under about 11px where it
// is drawn narrower, on a phone.
function textSize(svg) {
  const drawn = svg.getBoundingClientRect().width;
  const units = svg.viewBox.baseVal.width;
  return drawn && units ? Math.max(12, (12 * units * 0.95) / drawn) : 12;
}

// Said in the figure's place, so a blocked CDN or a broken module costs the
// picture and not the page. The caption and the text around it remain.
function fallback(canvas, why) {
  canvas.textContent = "";
  const p = document.createElement("p");
  p.className = "ns-fallback";
  p.textContent = "This figure could not be drawn (" + why + "). Its caption and the text around it describe what it shows.";
  canvas.appendChild(p);
}

async function start(section) {
  // A figure in the flow of the text is its own section: one state, no steps.
  const inline = section.classList.contains("ns-inline");
  const fig = inline ? section : section.querySelector(".ns-fig");
  const canvas = fig.querySelector(".ns-canvas");
  const steps = [...section.querySelectorAll(".ns-step")];
  if (!window.d3 || !window.gsap || !window.ScrollTrigger) return fallback(canvas, "a library did not load");
  let view;
  try {
    const mod = await import("./fig-" + section.dataset.fig + ".js");
    view = mod.mount(canvas, { d3: window.d3, gsap: window.gsap, maths, colors: () => colors(section), still, textSize });
  } catch (e) {
    console.error(e);
    return fallback(canvas, e.message);
  }
  fig.dataset.steps = view.steps;
  if (view.keys) fig.dataset.keys = view.keys.join(" ");
  // Drawn at another width (a rotated phone, a resized window), a figure is
  // redrawn, so its text keeps its size.
  let width = 0;
  new ResizeObserver(([e]) => {
    const w = Math.round(e.contentRect.width);
    if (width && w !== width) view.redraw();
    width = w;
  }).observe(canvas);
  section.classList.add("is-live");
  if (inline) {
    view.show(0, false);
    // Held still, it is redrawn as it stands, with nothing left playing.
    live.push({ view, hold: () => view.redraw(), redraw: () => view.redraw() });
    return;
  }

  // The steps as a strip of buttons under the figure: where it is, and a way
  // to any step without scrolling there. A click scrolls the text to its
  // step; the triggers it passes on the way are not obeyed, or the figure
  // would replay every step in between.
  let current = -1;
  let jumping = false;
  const strip = document.createElement("div");
  strip.className = "ns-stepper";
  strip.setAttribute("role", "group");
  strip.setAttribute("aria-label", "Steps of this figure");
  const dots = steps.map((step, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = i + 1;
    b.setAttribute("aria-label", "Step " + (i + 1) + " of " + steps.length);
    b.addEventListener("click", () => {
      jumping = true;
      const release = () => (jumping = false);
      window.addEventListener("scrollend", release, { once: true });
      setTimeout(release, 2000); // no scrollend where it is not supported, or when nothing scrolled
      // Just past where the step takes over, so its first line lands in view.
      window.scrollTo({ top: triggers[i].start + 1, behavior: still() ? "instant" : "smooth" });
      go(i, true);
    });
    strip.appendChild(b);
    return b;
  });
  canvas.appendChild(strip);

  function go(i, animate) {
    i = Math.max(0, Math.min(view.steps - 1, i));
    if (i === current) return;
    current = i;
    fig.dataset.step = i;
    // Held still, the figure is at its end and the whole text is for reading.
    steps.forEach((s, k) => s.classList.toggle("is-active", still() || k === i));
    dots.forEach((d, k) => d.setAttribute("aria-current", k === i ? "step" : "false"));
    view.show(i, animate && !still());
  }
  // Where a step takes the figure over: just under the figure when it is
  // pinned above the text, so the step's first line is in view as it does;
  // mid-screen when the steps run beside it. Measured, not assumed, and
  // measured again on every refresh.
  const column = section.querySelector(".ns-steps");
  const line = () => {
    const f = fig.getBoundingClientRect();
    if (column.getBoundingClientRect().left >= f.right - 1) return "55%";
    return Math.round(parseFloat(getComputedStyle(fig).top) + f.height + 16) + "px";
  };
  const triggers = steps.map((step, i) =>
    window.ScrollTrigger.create({
      trigger: step,
      start: () => "top " + line(),
      end: () => "bottom " + line(),
      onToggle: self => {
        if (self.isActive && !jumping) go(i, true);
      }
    })
  );
  // Where the reader already is: a reload or a jump lands mid-section.
  const here = triggers.findIndex(t => t.isActive);
  go(Math.max(0, here), false);
  live.push({
    view,
    // Redrawn where it is, so a pause stops what is playing, and a resume
    // fades the other steps again.
    hold: () => {
      const i = current;
      current = -1;
      go(i, false);
    },
    redraw: () => view.redraw()
  });
}

function boot() {
  if (window.gsap && window.ScrollTrigger) window.gsap.registerPlugin(window.ScrollTrigger);
  const near = new IntersectionObserver(
    entries =>
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        near.unobserve(e.target);
        start(e.target);
      }),
    { rootMargin: "100% 0px" }
  );
  document.querySelectorAll(".ns-scrolly, .ns-inline").forEach(s => near.observe(s));

  // Terms in the text, coloured as in the figures: hovered or focused, they
  // light up what they name in every figure drawn so far that has it.
  document.querySelectorAll(".ns-key[data-key]").forEach(k => {
    const key = k.dataset.key;
    const to = on => live.forEach(f => f.view.keys && f.view.keys.includes(key) && f.view.highlight(on ? key : null));
    k.tabIndex = 0;
    k.addEventListener("mouseenter", () => to(true));
    k.addEventListener("focus", () => to(true));
    k.addEventListener("mouseleave", () => to(false));
    k.addEventListener("blur", () => to(false));
  });

  // Paused or reduced, or back from either: each figure is redrawn on its
  // step, with nothing left playing.
  const settle = () => live.forEach(f => f.hold());
  window.addEventListener("motion:pause", settle);
  reduce.addEventListener("change", settle);

  // A theme switch repaints; it does not replay.
  const repaint = () => live.forEach(f => f.redraw());
  new MutationObserver(repaint).observe(root, { attributes: true, attributeFilter: ["data-bs-theme"] });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", repaint);

  // MathJax and late images move the steps after the triggers measured them.
  if (window.ScrollTrigger) {
    let t = 0;
    new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => window.ScrollTrigger.refresh(), 150);
    }).observe(document.body);
  }
}

boot();
