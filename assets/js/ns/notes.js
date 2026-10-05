// Citations and notes of the natural steganography article, opened in place,
// as on distill.pub: one bubble for the page, under the citation ([n],
// _includes/ns-cite.html) or the kramdown note (a.footnote) it belongs to.
// It opens on hover, on focus and on a tap; Escape, leaving, or a tap
// elsewhere closes it. A mouse click on a citation still goes to the
// reference in the appendix; a tap opens the bubble instead.
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
    tip.textContent = a.dataset.note;
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
  a.addEventListener("click", e => {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
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
