// §0 of the natural steganography article, the opening: two crops of one
// photograph, one taken at ISO 200, the other taken at ISO 100 with a
// payload embedded. Which is which? A loupe shows the same spot in both.
// After a choice, the answer, and four views: the original, ISO 200, the
// embedding, and the difference the embedding made.
//
// The crops and what they carry come from tools/ns-data.py.
import { loupe } from "./loupe.js";

const DATA = new URL("../../data/ns/", import.meta.url);
const NAMES = {
  iso100: "ISO 100, the original",
  iso200: "ISO 200, straight from the camera",
  stego: "ISO 100 + J-Cov-NS embedding",
  diff: "The difference, amplified: embedding − original"
};

export function mount(el) {
  // Which side the payload is on changes from one visit to the next.
  const pair = Math.random() < 0.5 ? ["iso200", "stego"] : ["stego", "iso200"];
  let answered = false;
  let lens = null;
  const grey = {}; // the pixels of each crop, for the value under the lens

  el.textContent = "";
  const question = document.createElement("p");
  question.className = "ns-question";
  question.textContent = "One of these two crops could carry … KB. Which one?";
  const views = document.createElement("div");
  views.className = "ns-views";
  const choices = document.createElement("div");
  choices.className = "ns-choices";
  const verdict = document.createElement("p");
  verdict.className = "ns-verdict";
  verdict.setAttribute("aria-live", "polite");
  el.append(question, views, choices, verdict);

  fetch(new URL("hook.json", DATA))
    .then(r => r.json())
    .then(h => (question.textContent = "One of these two crops could carry " + h.kbytes.toFixed(1) + " KB. Which one?"));

  function view(name, labelled) {
    const v = document.createElement("div");
    v.className = "ns-view";
    v.dataset.crop = name;
    v.setAttribute("aria-label", (labelled ? NAMES[name] : "Crop " + (pair.indexOf(name) ? "on the right" : "on the left")) + ". Magnifier: move it with the arrow keys.");
    const img = document.createElement("img");
    img.src = new URL(name + ".png", DATA).href;
    img.width = img.height = 256;
    img.alt = labelled ? NAMES[name] : "";
    img.addEventListener("load", () => {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      grey[name] = g.getImageData(0, 0, 256, 256).data;
    });
    v.appendChild(img);
    if (labelled) {
      const label = document.createElement("span");
      label.className = "ns-view-label";
      label.textContent = NAMES[name];
      v.appendChild(label);
    }
    return v;
  }

  // The grey level under the lens, out of 255, on the crop it is over.
  const value = (fx, fy, v) => {
    const d = grey[v.dataset.crop];
    if (!d) return "";
    const x = Math.min(255, Math.floor(fx * 256));
    const y = Math.min(255, Math.floor(fy * 256));
    return String(d[(y * 256 + x) * 4]);
  };

  function lay(names, labelled) {
    views.textContent = "";
    views.classList.toggle("is-four", names.length === 4);
    const vs = names.map(n => view(n, labelled));
    views.append(...vs);
    lens = loupe(vs, { zoom: 6, size: 110, value });
  }

  ["Left", "Right"].forEach((side, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-sm btn-outline-secondary";
    b.dataset.choice = pair[i];
    b.textContent = side;
    b.addEventListener("click", () => {
      if (answered) return;
      answered = true;
      const right = pair[i] === "stego";
      verdict.textContent = right
        ? "Yes: the " + side.toLowerCase() + " one carries the payload. Here is what it was made from."
        : "No: the " + side.toLowerCase() + " one is a real ISO 200 photograph. The payload is in the other.";
      choices.remove();
      lay(["iso100", "iso200", "stego", "diff"], true);
    });
    choices.appendChild(b);
  });

  lay(pair, false);
  el.classList.add("ns-loupe");

  return {
    steps: 1,
    show() {},
    // Pictures, not drawings: nothing to repaint for a theme, only the lens to re-read.
    redraw: () => lens && lens.refresh()
  };
}
