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
  "/fr/", "/fr/cv/", "/fr/publications/", "/fr/projets/", "/fr/photos/"
];
// The theme's lists of posts. Until there is a post they list nothing, so
// they stay out of the menu.
const POSTS = fs.readdirSync(new URL("../_posts", import.meta.url)).some(f => f.endsWith(".md"));
const WIDTHS = [375, 1280];
// Pages with nothing on them yet: kept out of search results.
const THIN = ["/photos/", "/fr/photos/"];

// Runs in the page. Returns one line per problem found.
const CHECKS = page => `((page, THIN, POSTS) => {
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

  // Every page exists in both languages, and has to say so.
  const alt = [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(l => l.hreflang).sort().join(",");
  if (alt !== "en,fr,x-default") bad.push("hreflang alternates: [" + alt + "], expected en, fr, x-default");
  if (!document.querySelector("#topbar .lang-switch")) bad.push("no language switch in the top bar");

  if (!POSTS) document.querySelectorAll("#sidebar a[href]").forEach(a => {
    if (/^\\/(archives|tags|categories)\\/$/.test(a.pathname)) bad.push("menu links to an empty list of posts: " + a.pathname);
  });

  // Light and dark, one tap away at the top of every page, not in a menu.
  const theme = document.querySelector("#topbar button[aria-pressed]");
  if (!theme || !shown(theme)) bad.push("no light/dark button in the top bar");
  else {
    const b = theme.getBoundingClientRect();
    if (b.left < 0 || b.right > innerWidth || b.width < 24 || b.height < 24) bad.push("light/dark button off screen or under 24px");
  }

  return bad;
})(${JSON.stringify(page)}, ${JSON.stringify(THIN)}, ${POSTS})`;

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
  await open("/", []);
  if ((await ev(toggle + ".getAttribute('aria-pressed')")) !== "true") extra.push("pause forgotten on reload");
  if (await moving()) extra.push("background moving after a reload while paused");
  if ((await ev("getComputedStyle(document.querySelector('.lede h1')).maskImage")) !== "none") extra.push("headline left masked when loaded paused");
  await ev(toggle + ".click()");
  if (!(await moving())) extra.push("background does not start again when unpaused");
}

// The faces on the About page, under a mouse. They follow it with eyes and
// mouth, by less than half a square; the happy one jumps and gives off hearts,
// the sad one shrinks back and blushes; each blinks now and then; and the
// field fills each in its own colour. Paused, none of it.
const mouse = (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
const faces = `(() => {
  const f = {};
  document.querySelectorAll(".smiley").forEach(s => {
    const b = s.getBoundingClientRect();
    const at = 48 * b.width / 156; // where eyes and mouth start, at rest
    f[s.dataset.mood] = {
      x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width,
      eye: s.querySelector("rect").getBoundingClientRect().left - b.left - at,
      mouth: s.querySelector("path").getBoundingClientRect().left - b.left - at,
      moving: s.getAnimations().length > 0,
      hearts: s.parentElement.querySelectorAll("svg:not(.smiley)").length,
      blush: [...s.querySelectorAll("*")].some(e => getComputedStyle(e).fill === "rgb(211, 56, 28)" && +getComputedStyle(e).opacity > 0)
    };
  });
  return f;
})()`;
// Blinks seen per face over a while, frame by frame: an eye under half its height is shut.
const blinks = ms => ev(`new Promise(done => {
  const n = { happy: 0, sad: 0 }, shut = {}, end = performance.now() + ${ms};
  (function look() {
    document.querySelectorAll(".smiley").forEach(s => {
      const m = s.dataset.mood;
      const closed = s.querySelector("rect").getBoundingClientRect().height < s.getBoundingClientRect().height * 6 / 156;
      if (closed && !shut[m]) n[m]++;
      shut[m] = closed;
    });
    if (performance.now() < end) requestAnimationFrame(look);
    else done(n);
  })();
})`);
// The colour the field shows most of under a face, give or take the canvas's rounding.
const like = (got, want) => got.split(",").every((v, i) => Math.abs(v - want.split(",")[i]) <= 3);
const tint = mood => ev(`(() => {
  const b = document.querySelector('.smiley[data-mood="${mood}"]').getBoundingClientRect();
  const d = document.getElementById("field").getContext("2d").getImageData(b.left, b.top, b.width, b.height).data;
  const n = {};
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) n[d[i] + "," + d[i + 1] + "," + d[i + 2]] = (n[d[i] + "," + d[i + 1] + "," + d[i + 2]] || 0) + 1;
  return (Object.entries(n).sort((a, b) => b[1] - a[1])[0] || ["paper"])[0];
})()`);
await open("/", []);
await ev("document.querySelector('.moods').scrollIntoView({ block: 'center' })");
await wait(800);
const F = await ev(faces);
if (!F.happy || !F.sad) extra.push("About page has no happy and sad face");
else {
  await mouse(F.happy.x + 300, F.happy.y);
  await wait(800);
  let G = await ev(faces);
  if (!(G.happy.eye > 0.5 && G.happy.eye <= 5.5)) extra.push("face looks " + G.happy.eye.toFixed(1) + "px toward the pointer, expected a little, under half a square");
  if (Math.abs(G.happy.mouth - G.happy.eye) > 0.5) extra.push("face's mouth does not move with its eyes");
  await mouse(F.happy.x, F.happy.y);
  await wait(200);
  G = await ev(faces);
  if (!G.happy.hearts) extra.push("happy face gives off no hearts under the pointer");
  if (!G.happy.moving) extra.push("happy face does not jump under the pointer");
  await wait(400);
  if (!like(await tint("happy"), "248,184,98")) extra.push("happy face not filled in amber under the pointer: " + (await tint("happy")));
  await mouse(F.sad.x, F.sad.y);
  await wait(600);
  G = await ev(faces);
  if (!(G.sad.w < F.sad.w - 3)) extra.push("sad face does not shrink back under the pointer");
  if (!G.sad.blush) extra.push("sad face does not blush under the pointer");
  if (!like(await tint("sad"), "160,216,239")) extra.push("sad face not filled in blue under the pointer: " + (await tint("sad")));
  // In the dark theme the ink is pale, which vanishes on a coloured face: it
  // turns dark once the colour reaches it, before the pointer does.
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await mouse(F.happy.x + 85, F.happy.y);
  await wait(400);
  const ink = await ev(`getComputedStyle(document.querySelector('.smiley[data-mood="happy"]')).color`);
  if (!/^rgb\((\d{1,2}), (\d{1,2}), (\d{1,2})\)$/.test(ink)) extra.push("dark theme: ink still pale (" + ink + ") on a face coloured in");
  await send("Emulation.setEmulatedMedia", { features: [] });
  await mouse(5, 5);
  const seen = await blinks(7000);
  if (!seen.happy || !seen.sad) extra.push("faces did not both blink in 7s: " + JSON.stringify(seen));

  await ev(toggle + ".click()");
  await mouse(F.happy.x + 300, F.happy.y + 100);
  await wait(500);
  const P0 = await ev(faces);
  await mouse(F.happy.x - 300, F.happy.y - 100);
  await wait(500);
  if ((await ev(faces)).happy.eye !== P0.happy.eye) extra.push("faces follow the pointer when paused");
  await mouse(F.happy.x, F.happy.y);
  await wait(200);
  G = await ev(faces);
  if (G.happy.hearts || G.happy.moving) extra.push("happy face jumps or gives off hearts when paused");
  await mouse(F.sad.x, F.sad.y);
  await wait(600);
  if ((await ev(faces)).sad.w < F.sad.w - 3) extra.push("sad face shrinks back when paused");
  const still = await blinks(7000);
  if (still.happy || still.sad) extra.push("faces blink when paused: " + JSON.stringify(still));
  await ev(toggle + ".click()");
}

// A figure read by hovering is read in peace: whatever the pointer does over
// it, a stroke or a press, the background under it stays paper.
for (const page of ["/projects/", "/fr/projets/"]) {
  await open(page, []);
  await ev("document.getElementById('dct-grid').scrollIntoView({ block: 'center', behavior: 'instant' })");
  await wait(600);
  const g = await ev("(() => { const b = document.querySelector('#dct-grid .dg-grid').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()");
  for (let i = 1; i < 10; i++) {
    await mouse(g.x + (g.w * i) / 10, g.y + (g.h * i) / 10);
    await wait(60);
  }
  const mid = { x: g.x + g.w / 2, y: g.y + g.h / 2, button: "left", clickCount: 1 };
  await send("Input.dispatchMouseEvent", { type: "mousePressed", ...mid });
  await wait(300);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...mid });
  await wait(150);
  const lit = await ev(`(() => {
    const d = document.getElementById("field").getContext("2d").getImageData(${g.x}, ${g.y}, ${g.w}, ${g.h}).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
    return n;
  })()`);
  if (lit) extra.push(page + ": the background lights up under the dependency figure (" + lit + " px)");
  await mouse(5, 5);
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

// On a phone, the sidebar's bottom row works under a finger: the theme menu
// opens and switches to light, and the language link goes to French. With the
// menu open the theme pushes the page 260px right; if the browser may zoom out
// to fit that, the sidebar grows with it and the row jumps away from the tap.
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 1, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true });
await open("/", [{ name: "prefers-color-scheme", value: "dark" }]);
const tap = async sel => {
  const b = await ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
  if (!b) return false;
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: b.x, y: b.y }] });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await wait(600);
  return true;
};
await tap("#sidebar-trigger");
await tap("#mode-toggle");
if (!(await tap('.dropdown-item[data-theme-mode="light"]'))) extra.push("phone: the theme menu does not open under a finger");
else if ((await ev("document.documentElement.getAttribute('data-bs-theme')")) !== "light") extra.push("phone: tapping Light does not switch to light");

// The top bar's own two: light/dark and the language, one tap each, with no
// menu to open first. The theme picked there is kept, and the search box,
// when it opens, still has the bar to itself.
const mode = () => ev("document.documentElement.getAttribute('data-bs-theme') + ' ' + document.querySelector('#topbar button[aria-pressed]')?.getAttribute('aria-pressed')");
await open("/", []); // light, from the menu above
if (!(await tap("#topbar button[aria-pressed]"))) extra.push("phone: no light/dark button in the top bar");
else {
  if ((await mode()) !== "dark true") extra.push("phone: the top bar button does not switch light to dark: " + (await mode()));
  await open("/", []);
  if ((await mode()) !== "dark true") extra.push("phone: the theme picked in the top bar is forgotten on reload: " + (await mode()));
  await tap("#topbar button[aria-pressed]");
  if ((await mode()) !== "light false") extra.push("phone: the top bar button does not switch dark to light: " + (await mode()));
}
await tap("#search-trigger");
const searching = await ev(`(() => {
  const gone = sel => [...document.querySelectorAll(sel)].every(e => !e.getClientRects().length);
  const box = document.getElementById("search-input").getBoundingClientRect();
  return { gone: gone("#topbar button[aria-pressed], #topbar .lang-switch"), w: Math.round(box.width), right: box.right };
})()`);
if (!searching.gone || searching.w < 150 || searching.right > 375) extra.push("phone: the search box shares the top bar: " + JSON.stringify(searching));
await open("/", []);
const went = new Promise(r => (loaded = r));
if (!(await tap("#topbar .lang-switch"))) extra.push("phone: no language link in the top bar");
await Promise.race([went, wait(3000)]);
if ((await ev("location.pathname")) !== "/fr/") extra.push("phone: tapping FR does not go to the French page");
else if ((await ev("document.querySelector('#topbar .lang-switch')?.textContent")) !== "EN") extra.push("phone: the French page offers no way back to English");
await send("Emulation.setTouchEmulationEnabled", { enabled: false });
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

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
