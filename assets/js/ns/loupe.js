// A loupe for the article's pictures: a round lens that magnifies the pixels
// under it, sharp, as squares. Laid on several views at once it shows the
// same spot in every one, which is how a difference too small to see is
// found. It follows a pointer, a finger (press and drag: the view takes the
// touch, so the page does not scroll meanwhile), and the arrow keys once a
// view has focus, shift for finer steps.
//
//   const lens = loupe(views, { zoom, size, label, value(fx, fy, view) })
//   lens.moveTo(fx, fy)  // a spot, as fractions of the picture's width and height
//   lens.refresh()       // after a canvas under it was redrawn
//
// Each view is an element holding an <img> or a <canvas>; value, if given,
// says what is under the centre, shown beneath the lens.
export function loupe(views, opts = {}) {
  const zoom = opts.zoom || 6;
  const size = opts.size || 120;
  let fx = 0.5;
  let fy = 0.5;

  const parts = views.map(view => {
    const pic = view.querySelector("img, canvas");
    const lens = document.createElement("div");
    lens.className = "ns-lens";
    lens.setAttribute("aria-hidden", "true");
    lens.style.width = lens.style.height = size + "px";
    const read = document.createElement("span");
    read.className = "ns-lens-value";
    lens.appendChild(read);
    view.appendChild(lens);
    view.tabIndex = 0;
    view.setAttribute("role", "group");
    if (!view.hasAttribute("aria-label")) view.setAttribute("aria-label", opts.label || "Magnifier: move it with the arrow keys");
    return { view, pic, lens, read };
  });

  function place() {
    parts.forEach(p => {
      const w = p.pic.offsetWidth;
      const h = p.pic.offsetHeight;
      const cx = p.pic.offsetLeft + fx * w;
      const cy = p.pic.offsetTop + fy * h;
      p.lens.style.left = cx - size / 2 + "px";
      p.lens.style.top = cy - size / 2 + "px";
      p.lens.style.backgroundSize = w * zoom + "px " + h * zoom + "px";
      p.lens.style.backgroundPosition = size / 2 - fx * w * zoom + "px " + (size / 2 - fy * h * zoom) + "px";
      if (opts.value) p.read.textContent = opts.value(fx, fy, p.view) || "";
    });
  }

  function refresh() {
    parts.forEach(p => {
      const src = p.pic.tagName === "CANVAS" ? p.pic.toDataURL() : p.pic.currentSrc || p.pic.src;
      p.lens.style.backgroundImage = "url(" + JSON.stringify(src) + ")";
    });
    place();
  }

  function moveTo(x, y) {
    fx = Math.min(1, Math.max(0, x));
    fy = Math.min(1, Math.max(0, y));
    place();
  }

  const show = on => parts.forEach(p => p.lens.classList.toggle("is-on", on));

  parts.forEach(p => {
    const at = e => {
      const b = p.pic.getBoundingClientRect();
      moveTo((e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height);
    };
    p.view.addEventListener("pointermove", e => {
      show(true);
      at(e);
    });
    p.view.addEventListener("pointerdown", e => {
      show(true);
      at(e);
      if (e.pointerType !== "mouse") p.view.setPointerCapture(e.pointerId);
    });
    p.view.addEventListener("pointerleave", e => {
      if (e.pointerType === "mouse" && !p.view.contains(document.activeElement)) show(false);
    });
    p.view.addEventListener("focus", () => show(true));
    p.view.addEventListener("blur", () => show(false));
    p.view.addEventListener("keydown", e => {
      const d = e.shiftKey ? 0.01 : 0.04;
      const by = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
      if (!by) return;
      e.preventDefault();
      show(true);
      moveTo(fx + by[0], fy + by[1]);
    });
    // A picture still loading has no size yet to place the lens by.
    if (p.pic.tagName === "IMG" && !p.pic.complete) p.pic.addEventListener("load", place, { once: true });
  });
  window.addEventListener("resize", place);

  refresh();
  return { moveTo, refresh };
}
