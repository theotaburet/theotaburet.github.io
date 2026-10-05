// Citations and notes of the natural steganography article, opened in place,
// as on distill.pub: one bubble for the page, under the citation ([n],
// _includes/ns-cite.html) or the kramdown note (a.footnote) it belongs to.
// It opens on hover, on focus and on a tap; Escape, leaving, or a tap
// elsewhere closes it. A mouse click on a citation still goes to the
// reference in the appendix; a tap opens the bubble instead, which links
// there.
const tip = document.createElement("div");
tip.className = "ns-note";
tip.id = "ns-note";
tip.setAttribute("role", "tooltip");
tip.hidden = true;
document.body.appendChild(tip);

let anchor = null;
let leaving = 0;

function fill(a) {
  tip.textContent = "";
  if (a.classList.contains("ns-cite")) {
    const go = document.createElement("a");
    go.href = a.getAttribute("href");
    go.textContent = "In the references";
    go.addEventListener("click", close);
    tip.append(a.dataset.note, " ", go);
    return;
  }
  // A note: its text at the foot of the page, without the way back up.
  const note = document.getElementById(decodeURIComponent(a.hash.slice(1)));
  if (!note) return;
  const copy = note.cloneNode(true);
  copy.querySelectorAll(".reversefootnote").forEach(r => r.remove());
  copy.removeAttribute("id");
  tip.append(...copy.childNodes);
}

function place() {
  // Measured at the left of the page, where it has its full width: left
  // where the last one was, by the right edge, it would be squeezed.
  tip.style.left = tip.style.top = "0px";
  const r = anchor.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  // Under the anchor, or over it when the screen ends first.
  const top = r.bottom + 8 + h < innerHeight ? r.bottom + 8 : r.top - 8 - h;
  tip.style.left = left + scrollX + "px";
  tip.style.top = top + scrollY + "px";
}

function open(a) {
  clearTimeout(leaving);
  if (anchor && anchor !== a) anchor.removeAttribute("aria-describedby");
  anchor = a;
  fill(a);
  tip.hidden = false;
  place();
  a.setAttribute("aria-describedby", tip.id);
}

function close() {
  clearTimeout(leaving);
  if (!anchor) return;
  anchor.removeAttribute("aria-describedby");
  anchor = null;
  tip.hidden = true;
}

// Leaving the anchor for the bubble keeps it open, so its links can be used.
const later = () => {
  clearTimeout(leaving);
  leaving = setTimeout(close, 250);
};
tip.addEventListener("mouseenter", () => clearTimeout(leaving));
tip.addEventListener("mouseleave", later);

document.querySelectorAll(".ns-cite, a.footnote").forEach(a => {
  a.addEventListener("mouseenter", () => open(a));
  a.addEventListener("mouseleave", later);
  a.addEventListener("focus", () => open(a));
  a.addEventListener("blur", e => {
    if (!tip.contains(e.relatedTarget)) close();
  });
  // A tap is told by its pointerdown: iOS 18.2 labels the click that
  // follows it "mouse" (WebKit bug 282988).
  a.addEventListener("pointerdown", e => (a.dataset.tap = e.pointerType !== "mouse"));
  a.addEventListener("click", e => {
    const tap = a.dataset.tap === "true";
    a.dataset.tap = ""; // a later Enter is a click with no pointer, and follows the link
    if (!tap) return;
    e.preventDefault();
    open(a);
  });
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && anchor) close();
});
document.addEventListener("pointerdown", e => {
  if (anchor && !anchor.contains(e.target) && !tip.contains(e.target)) close();
});
window.addEventListener("resize", () => anchor && place());
