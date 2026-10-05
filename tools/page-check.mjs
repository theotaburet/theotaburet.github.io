// Accessibility, small-screen and search check, run against the site as served.
//
//   bundle exec jekyll serve      # in another terminal
//   node tools/page-check.mjs [http://127.0.0.1:4000]
//
// Drives headless Chrome over the DevTools protocol, so it needs no packages:
// set CHROME to the binary if it is not in the usual macOS place. Every page is
// loaded at phone width, where the theme hides the most, and at desktop width,
// and judged after the site's own scripts have run, since several of the
// fixes are made by them.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.argv[2] || "http://127.0.0.1:4000";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9400 + ((Math.random() * 500) | 0);
const PAGES = [
  "/", "/cv/", "/publications/", "/projects/", "/photos/",
  "/fr/", "/fr/cv/", "/fr/publications/", "/fr/projets/", "/fr/photos/",
  "/archives/", "/tags/", "/categories/"
];
const WIDTHS = [375, 1280];
// Pages with nothing on them yet: kept out of search results.
const THIN = ["/archives/", "/tags/", "/categories/", "/photos/", "/fr/photos/"];
// Pages that exist in both languages, and so have to say so.
const PAIRED = PAGES.filter(p => !["/archives/", "/tags/", "/categories/"].includes(p));

// Runs in the page. Returns one line per problem found.
const CHECKS = page => `((page, THIN, PAIRED) => {
  const bad = [];
  const describe = el => "<" + el.tagName.toLowerCase() + (el.className ? " class='" + el.className + "'" : "") + ">";
  const shown = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";

  if (/^\\s*\\|/.test(document.title)) bad.push("empty page title: " + JSON.stringify(document.title));

  const vp = document.querySelector('meta[name="viewport"]');
  if (vp && /user-scalable\\s*=\\s*no|maximum-scale\\s*=\\s*1(\\D|$)/.test(vp.content)) bad.push("zoom disabled: " + vp.content);

  const W = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > W) bad.push("page scrolls sideways: " + document.documentElement.scrollWidth + " > " + W);

  document.querySelectorAll(".table-wrapper").forEach(t => {
    if (t.scrollWidth > t.clientWidth + 1) bad.push("table scrolls sideways: " + t.scrollWidth + " > " + t.clientWidth);
  });
  document.querySelectorAll("th").forEach(th => {
    if (!th.textContent.trim()) bad.push("empty table header");
  });

  const h1 = [...document.querySelectorAll("h1")].filter(shown);
  if (h1.length !== 1) bad.push(h1.length + " rendered h1");

  // Everything Tab can reach has to say what it is.
  document.querySelectorAll("a[href], button, input, select, textarea, [tabindex]").forEach(el => {
    if (el.tabIndex < 0 || el.disabled || !shown(el)) return;
    if (el.closest("[aria-hidden='true']")) {
      bad.push("focusable inside aria-hidden: " + describe(el));
      return;
    }
    const img = el.querySelector("img[alt]");
    const name = (el.getAttribute("aria-label") || el.textContent || (img && img.alt) || el.title || "").trim();
    if (!name) bad.push("focusable without a name: " + describe(el));

    // And a finger has to be able to reach it: whatever is on top at its
    // centre must be the control itself. Only judged on screen, since that is
    // all elementFromPoint can see, and on its first line: a link that wraps
    // has a box whose middle is the paragraph beside it.
    const b = el.getClientRects()[0];
    const x = b.left + b.width / 2;
    const y = b.top + b.height / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return;
    const hit = document.elementFromPoint(x, y);
    if (hit && hit !== el && !el.contains(hit)) bad.push("covered by " + describe(hit) + ": " + describe(el));
  });

  // Emoji are decoration here; a screen reader should not read "radio" out
  // in front of every heading.
  const EMOJI = /[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u;
  document.querySelectorAll("h1, h2, h3, a, .eyebrow").forEach(el => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode()); ) {
      if (EMOJI.test(n.data) && !n.parentElement.closest("[aria-hidden='true']")) {
        bad.push("emoji read aloud in <" + el.tagName.toLowerCase() + ">: " + el.textContent.trim().slice(0, 40));
        break;
      }
    }
  });

  const grid = document.getElementById("dct-grid");
  if (grid) {
    const imgs = grid.querySelectorAll("[role='img']");
    if (imgs.length !== 1 || !imgs[0].getAttribute("aria-label")) bad.push("dct grid: " + imgs.length + " role=img, expected one labelled");
  }

  const avatar = document.querySelector("#avatar img");
  if (avatar && avatar.alt === "avatar") bad.push("avatar described as 'avatar'");

  // What search engines and agents are told about the page.
  const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent).join("\\n");
  const meta = sel => (document.querySelector(sel) || {}).content || "";
  if (document.documentElement.innerHTML.includes("qc6CJjYAAAAJ")) bad.push("links to the theme's sample Scholar profile, which is Albert Einstein's");
  if (/"BlogPosting"/.test(ld)) bad.push("described to search engines as a blog post");
  if (/&(nbsp|middot);/.test(ld)) bad.push("HTML entities inside JSON-LD");
  const desc = meta('meta[name="description"]');
  if (!desc.trim()) bad.push("no meta description");
  else if (document.documentElement.lang.startsWith("fr") && !/\\b(et|de|des|les|du|en|à|dans)\\b/i.test(desc)) bad.push("French page, description not in French: " + desc.slice(0, 50));
  if (!meta('meta[property="og:image"]')) bad.push("no og:image");
  if ((page === "/" || page === "/fr/") && !/"Person"/.test(ld)) bad.push("home page does not say who it is about (no Person)");
  if ((page === "/" || page === "/fr/") && !/Ezako/.test(document.body.textContent)) bad.push("home page does not mention the current job");

  const noindex = /noindex/.test(meta('meta[name="robots"]'));
  if (THIN.includes(page) !== noindex) bad.push(noindex ? "indexable page marked noindex" : "empty page left open to indexing");

  if (PAIRED.includes(page)) {
    const alt = [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(l => l.hreflang).sort().join(",");
    if (alt !== "en,fr,x-default") bad.push("hreflang alternates: [" + alt + "], expected en, fr, x-default");
    if (!document.querySelector(".lang-switch")) bad.push("no language switch");
  }

  return bad;
})(${JSON.stringify(page)}, ${JSON.stringify(THIN)}, ${JSON.stringify(PAIRED)})`;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "page-check-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + profile,
  "--no-first-run", "--hide-scrollbars", "about:blank"
], { stdio: "ignore" });

// A check that throws must not leave a headless Chrome running behind it.
process.on("exit", () => chrome.kill());

async function quit(code) {
  const gone = new Promise(r => chrome.once("exit", r));
  chrome.kill();
  await gone; // or it is still writing to the profile while that is removed
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  process.exit(code);
}

let target = null;
for (let i = 0; i < 50 && !target; i++) {
  try {
    target = await (await fetch("http://127.0.0.1:" + PORT + "/json/new?about:blank", { method: "PUT" })).json();
  } catch {
    await new Promise(r => setTimeout(r, 200));
  }
}
if (!target) {
  console.error("Chrome did not start: " + CHROME);
  await quit(2);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r));
let seq = 0;
const replies = new Map();
let loaded = null;
ws.addEventListener("message", e => {
  const m = JSON.parse(e.data);
  if (m.id && replies.has(m.id)) replies.get(m.id)(m);
  if (m.method === "Page.loadEventFired" && loaded) loaded();
});
const send = (method, params = {}) =>
  new Promise(r => {
    replies.set(++seq, r);
    ws.send(JSON.stringify({ id: seq, method, params }));
  });

await send("Page.enable");
let failures = 0;
for (const width of WIDTHS) {
  const phone = width < 800;
  await send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: phone });
  await send("Emulation.setTouchEmulationEnabled", { enabled: phone });
  for (const page of PAGES) {
    const ready = new Promise(r => (loaded = r));
    await send("Page.navigate", { url: BASE + page });
    await ready;
    await new Promise(r => setTimeout(r, 300)); // the deferred scripts' DOMContentLoaded work
    const r = await send("Runtime.evaluate", { expression: CHECKS(page), returnByValue: true });
    const bad = r.result.exceptionDetails ? ["check threw: " + r.result.exceptionDetails.text] : r.result.result.value;
    // One line per kind of problem, with a count, so 16 anchors are one line.
    const seen = new Map();
    bad.forEach(b => seen.set(b, (seen.get(b) || 0) + 1));
    console.log((bad.length ? "FAIL " : "ok   ") + page + " @" + width);
    seen.forEach((n, k) => console.log("       " + k + (n > 1 ? "  (x" + n + ")" : "")));
    failures += bad.length;
  }
}

// Behaviour, judged once rather than per page.
const extra = [];
const ev = async expression => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.result.value;
const open = async (page, media = []) => {
  await send("Emulation.setEmulatedMedia", { features: media });
  const ready = new Promise(r => (loaded = r));
  await send("Page.navigate", { url: BASE + page });
  await ready;
  await new Promise(r => setTimeout(r, 1500)); // past the headline's decode
};
const wait = ms => new Promise(r => setTimeout(r, ms));

// In forced colours the custom pointer is drawn in the page's own colour, on
// the page's own colour, with the real one hidden. It has to stand down.
await open("/projects/", [{ name: "forced-colors", value: "active" }]);
if (await ev("document.documentElement.classList.contains('has-cursor')")) extra.push("custom pointer still on in forced colours");

// The pause button stops the background, survives a reload, and lets go.
await open("/", []);
const field = "(()=>{const c=document.getElementById('field');const d=c.getContext('2d').getImageData(0,0,c.width,Math.min(c.height,300)).data;let h=0;for(let i=0;i<d.length;i+=7)h=(h*31+d[i])|0;return h})()";
const moving = async () => { const a = await ev(field); await wait(1200); return a !== (await ev(field)); };
const toggle = "document.querySelector('.motion-toggle')";
if (!(await ev(toggle))) extra.push("no pause button");
else if (!(await moving())) extra.push("background not moving to begin with, so pausing it proves nothing");
else {
  await ev(toggle + ".click()");
  await wait(300);
  if ((await ev(toggle + ".getAttribute('aria-pressed')")) !== "true") extra.push("pause button does not report being pressed");
  if (await moving()) extra.push("background still moving when paused");
  if ((await ev("getComputedStyle(document.querySelector('.smiley .eyes')).animationName")) !== "none") extra.push("faces still blinking when paused");
  await open("/", []);
  if ((await ev(toggle + ".getAttribute('aria-pressed')")) !== "true") extra.push("pause forgotten on reload");
  if (await moving()) extra.push("background moving after a reload while paused");
  if ((await ev("getComputedStyle(document.querySelector('.lede h1')).maskImage")) !== "none") extra.push("headline left masked when loaded paused");
  await ev(toggle + ".click()");
  if (!(await moving())) extra.push("background does not start again when unpaused");
}

// The CV prints as a CV: the site's furniture gone, a letterhead in its
// place, and nothing left at the opacity the scroll reveals start from.
// tools/cv-pdf.sh prints exactly this to the PDFs the pages link to.
for (const page of ["/cv/", "/fr/cv/"]) {
  await open(page, []);
  const head = "document.querySelector('.cv-print-head')";
  if (!(await ev(head))) {
    extra.push(page + " has no print letterhead");
    continue;
  }
  if (await ev(head + ".getClientRects().length")) extra.push(page + " shows its print letterhead on screen");
  await send("Emulation.setEmulatedMedia", { media: "print", features: [] });
  const printed = await ev(`(() => {
    const bad = [];
    const gone = sel => [...document.querySelectorAll(sel)].every(e => !e.getClientRects().length);
    ["#sidebar", "#topbar-wrapper", "#field", ".footer-blocks", ".cv-pdf-link"].forEach(sel => { if (!gone(sel)) bad.push(sel + " printed"); });
    const h = document.querySelector(".cv-print-head");
    if (!h.getClientRects().length || !/Ezako/.test(h.textContent)) bad.push("letterhead missing or without the current job");
    if ([...document.querySelectorAll(".content *")].some(e => e.getClientRects().length && parseFloat(getComputedStyle(e).opacity) < 1)) bad.push("content printed half transparent");
    return bad;
  })()`);
  printed.forEach(b => extra.push(page + " in print: " + b));
  await send("Emulation.setEmulatedMedia", { media: "", features: [] });
}

// Switching theme cross-fades the page, unless motion is reduced; either way
// the theme does change.
for (const reduced of [false, true]) {
  await open("/", reduced ? [{ name: "prefers-reduced-motion", value: "reduce" }] : []);
  const result = await ev(`new Promise(done => {
    let fades = 0;
    if (document.startViewTransition) {
      const real = document.startViewTransition.bind(document);
      document.startViewTransition = cb => { fades++; return real(cb); };
    }
    const before = document.documentElement.getAttribute("data-bs-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const want = before === "dark" ? "light" : "dark";
    document.querySelector('.dropdown-item[data-theme-mode="' + want + '"]').click();
    setTimeout(() => done({ fades, want, now: document.documentElement.getAttribute("data-bs-theme") }), 800);
  })`);
  if (result.now !== result.want) extra.push("theme menu did not switch to " + result.want + (reduced ? " with reduced motion" : ""));
  if (result.fades !== (reduced ? 0 : 1)) extra.push((reduced ? "theme cross-fades despite reduced motion" : "theme switch does not cross-fade") + " (" + result.fades + " transitions)");
}

// What a crawler or an agent reads before any page.
const sitemap = await (await fetch(BASE + "/sitemap.xml")).text();
THIN.forEach(p => {
  if (new RegExp("<loc>https?://[^/<]+" + p + "</loc>").test(sitemap)) extra.push("sitemap lists empty page " + p);
});
const llms = await fetch(BASE + "/llms.txt");
if (!llms.ok || !(await llms.text()).includes("Ezako")) extra.push("no /llms.txt saying who this is");

console.log((extra.length ? "FAIL " : "ok   ") + "behaviour and site files");
extra.forEach(e => console.log("       " + e));
failures += extra.length;

console.log(failures ? "\n" + failures + " problem(s)" : "\nall clear");
await quit(failures ? 1 : 0);
