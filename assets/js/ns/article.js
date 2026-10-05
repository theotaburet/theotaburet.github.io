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
// near, shows the state that matches the step of text in view, and, with
// motion reduced or the site paused, shows each figure as it ends.
import * as maths from "./maths.js";

const root = document.documentElement;
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
const still = () => reduce.matches || root.classList.contains("motion-paused");
const live = [];

// Read from the section's custom properties, so they follow the theme.
function colors(el) {
  const cs = getComputedStyle(el);
  const v = n => cs.getPropertyValue("--ns-" + n).trim();
  return { A: v("a"), B: v("b"), C: v("c"), D: v("d"), hot: v("hot"), ink: v("ink"), muted: v("muted"), paper: v("paper"), rule: v("rule") };
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
  const fig = section.querySelector(".ns-fig");
  const canvas = fig.querySelector(".ns-canvas");
  const steps = [...section.querySelectorAll(".ns-step")];
  if (!window.d3 || !window.gsap || !window.ScrollTrigger) return fallback(canvas, "a library did not load");
  let view;
  try {
    const mod = await import("./fig-" + section.dataset.fig + ".js");
    view = mod.mount(canvas, { d3: window.d3, gsap: window.gsap, maths, colors: () => colors(section), still });
  } catch (e) {
    console.error(e);
    return fallback(canvas, e.message);
  }
  fig.dataset.steps = view.steps;
  section.classList.add("is-live");

  let current = -1;
  function go(i, animate) {
    i = Math.max(0, Math.min(view.steps - 1, i));
    if (i === current) return;
    current = i;
    fig.dataset.step = i;
    // Held still, the figure is at its end and the whole text is for reading.
    steps.forEach((s, k) => s.classList.toggle("is-active", still() || k === i));
    view.show(i, animate && !still());
  }
  const triggers = steps.map((step, i) =>
    window.ScrollTrigger.create({
      trigger: step,
      start: "top 60%",
      end: "bottom 60%",
      onToggle: self => {
        if (self.isActive && !still()) go(i, true);
      }
    })
  );
  // Where the reader already is: a reload or a jump lands mid-section.
  const here = triggers.findIndex(t => t.isActive);
  go(still() ? view.steps - 1 : Math.max(0, here), false);
  live.push({
    end: () => {
      current = -1;
      go(view.steps - 1, false);
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
  document.querySelectorAll(".ns-scrolly").forEach(s => near.observe(s));

  // Paused or reduced, every figure goes to where it ends and stays there.
  const settle = () => {
    if (still()) live.forEach(f => f.end());
  };
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
