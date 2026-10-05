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
// The natural steganography article. A draft until it is published, so only
// `jekyll serve --drafts` serves it: checked when it is there, said when not.
const ARTICLE = "/posts/natural-steganography-jpeg/";
const ARTICLE_UP = await fetch(BASE + ARTICLE).then(r => r.ok, () => false);
if (ARTICLE_UP) PAGES.push(ARTICLE);
else console.log("skip " + ARTICLE + " (not served; start jekyll with --drafts)");

// Runs in the page. Returns one line per problem found.
const CHECKS = page => `((page, THIN, POSTS) => {
  const bad = [];
  const describe = el => "<" + el.tagName.toLowerCase() + (el.className ? " class='" + el.className + "'" : "") + ">";
  const post = page.startsWith("/posts/");
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
    const label = [...(el.labels || [])].map(l => l.textContent).join(" "); // a <label> names a form field
    const name = (el.getAttribute("aria-label") || el.textContent || label || (img && img.alt) || el.title || "").trim();
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
  if (!post && /"BlogPosting"/.test(ld)) bad.push("described to search engines as a blog post");
  if (post && !/"BlogPosting"/.test(ld)) bad.push("article not described to search engines as a blog post");
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
  // An article exists in English until its translation is written.
  if (!post && alt !== "en,fr,x-default") bad.push("hreflang alternates: [" + alt + "], expected en, fr, x-default");
  if (post && alt) bad.push("article claims a translation it does not have: [" + alt + "]");
  if (!post && !document.querySelector("#topbar .lang-switch")) bad.push("no language switch in the top bar");

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
const thrown = []; // uncaught script errors, for the checks that care
ws.addEventListener("message", e => {
  const m = JSON.parse(e.data);
  if (m.id && replies.has(m.id)) replies.get(m.id)(m);
  if (m.method === "Page.loadEventFired" && loaded) loaded();
  if (m.method === "Runtime.exceptionThrown") {
    const x = m.params.exceptionDetails;
    thrown.push((x.exception && x.exception.description) || x.text);
  }
});
const send = (method, params = {}) =>
  new Promise(r => {
    replies.set(++seq, r);
    ws.send(JSON.stringify({ id: seq, method, params }));
  });

await send("Page.enable");
await send("Runtime.enable");
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
const QUIET = [["/projects/", "#dct-grid", "#dct-grid .dg-grid"], ["/fr/projets/", "#dct-grid", "#dct-grid .dg-grid"]];
if (ARTICLE_UP) QUIET.push([ARTICLE, ".ns-scrolly", ".ns-fig svg"]);
for (const [page, near, sel] of QUIET) {
  await open(page, []);
  await ev(`document.querySelector(${JSON.stringify(near)}).scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await wait(600);
  const g = await ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return b && { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
  if (!g) {
    extra.push(page + ": nothing to hover at " + sel);
    continue;
  }
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

// The article, laid out after distill.pub: the text in a readable column,
// wide figures running past it, asides in the margin, a byline that cites
// the paper. Its libraries load there only; each pinned figure stays under
// the top bar while its text goes by; and when the libraries cannot be had,
// a word in each figure's place instead of a hole, with every word of text
// and caption readable.
if (ARTICLE_UP) {
  await open("/projects/", []);
  if ((await ev("typeof d3 + ' ' + typeof gsap")) !== "undefined undefined") extra.push("the article's libraries load on other pages too");
  thrown.length = 0;
  await open(ARTICLE, []);
  const libs = await ev("[typeof d3, typeof gsap, typeof ScrollTrigger].join()");
  if (libs !== "object,object,function") extra.push("article: libraries missing: " + libs);
  const grid = await ev(`(async () => {
    // Measured once on screen: paragraphs slide in as they arrive (site.js).
    document.querySelector(".content > .l-gutter").scrollIntoView({ block: "center", behavior: "instant" });
    await new Promise(r => setTimeout(r, 1200));
    const p = document.querySelector(".content > p").getBoundingClientRect();
    const page = document.querySelector(".content > .ns-scrolly.l-page").getBoundingClientRect();
    const aside = document.querySelector(".content > .l-gutter").getBoundingClientRect();
    return {
      text: Math.round(p.width), page: Math.round(page.width), gap: Math.round(aside.left - p.right),
      beside: Math.round(aside.top - document.querySelector(".content > .l-gutter").previousElementSibling.getBoundingClientRect().top),
      doi: !!document.querySelector(".ns-byline a[href='https://doi.org/10.1109/TIFS.2020.3007354']")
    };
  })()`);
  if (grid.text > 736) extra.push("article: the text column is " + grid.text + "px wide, over 46rem");
  if (grid.page < grid.text + 150) extra.push("article: a wide figure is no wider than the text (" + grid.page + "px for " + grid.text + "px)");
  if (grid.gap < 0) extra.push("article: the aside is not in the margin beside the text");
  if (Math.abs(grid.beside) > 4) extra.push("article: the aside is " + grid.beside + "px off the paragraph it follows");
  if (!grid.doi) extra.push("article: the byline does not link the paper's DOI");
  const cap = await ev(`getComputedStyle(document.querySelector(".ns-fig figcaption"), "::before").content`);
  if (!/Figure/.test(cap || "")) extra.push("article: figure caption not numbered: " + cap);
  const pin = await ev(`(async () => {
    const s = document.querySelector(".ns-scrolly");
    scrollTo({ top: scrollY + s.getBoundingClientRect().top + 300, behavior: "instant" });
    await new Promise(r => setTimeout(r, 400));
    const f = s.querySelector(".ns-fig").getBoundingClientRect();
    const bar = document.getElementById("topbar-wrapper").getBoundingClientRect();
    // Right under the bar, with no strip between them for the text to show through.
    return f.top >= Math.max(0, bar.bottom) - 1 && f.top <= Math.max(0, bar.bottom) + 1 ? "" : "figure not pinned right under the top bar: its top at " + Math.round(f.top) + "px, the bar ends at " + Math.round(bar.bottom) + "px";
  })()`);
  if (pin) extra.push("article: " + pin);
  if (thrown.length) extra.push("article: script error: " + thrown[0]);

  await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["*cdn.jsdelivr.net/npm/d3@*", "*cdn.jsdelivr.net/npm/gsap@*"] });
  await open(ARTICLE, []);
  const cut = await ev(`(async () => {
    for (const s of document.querySelectorAll(".ns-scrolly")) {
      s.scrollIntoView({ behavior: "instant" });
      await new Promise(r => setTimeout(r, 400));
    }
    return {
      blank: [...document.querySelectorAll(".ns-fig")].filter(f => !f.querySelector(".ns-fallback")).length,
      dim: [...document.querySelectorAll(".ns-step")].filter(s => getComputedStyle(s).opacity !== "1").length,
      mute: [...document.querySelectorAll(".ns-fig figcaption")].filter(c => c.textContent.trim().length < 20).length
    };
  })()`);
  await send("Network.setBlockedURLs", { urls: [] });
  if (cut.blank) extra.push("article without its libraries: " + cut.blank + " figure(s) left blank instead of saying so");
  if (cut.dim) extra.push("article without its libraries: " + cut.dim + " step(s) of text left dimmed");
  if (cut.mute) extra.push("article without its libraries: " + cut.mute + " caption(s) gone");
}

// The figures, as a reader meets them: walking the text moves each through
// its steps in order; landing mid-section shows that step at once; the strip
// of steps goes straight where it is asked; the theme repaints; the pause
// button and reduced motion leave each at its end with nothing moving; and
// the toy's controls hold up at their extremes.
if (ARTICLE_UP) {
  const S = `document.querySelectorAll(".ns-scrolly")`;
  const at = f => ev(`${S}[${f}].querySelector(".ns-fig").dataset.step`);
  const toStep = (f, i) => ev(`(() => { const s = ${S}[${f}].querySelectorAll(".ns-step")[${i}]; scrollTo({ top: scrollY + s.getBoundingClientRect().top - innerHeight * 0.5, behavior: "instant" }); })()`);
  const moving = () => ev("gsap.globalTimeline.getChildren(true, true, false).some(t => t.isActive())");
  // Whatever a figure writes is read against its paper: 4.5:1 at least, in
  // the theme the page is in.
  const faintAt = async (f, i) => {
    const faint = await ev(`(() => {
      const lum = c => { const [r, g, b] = c.match(/[\\d.]+/g).map(Number).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const fig = ${S}[${f}].querySelector(".ns-fig");
      const bg = lum(getComputedStyle(fig).backgroundColor);
      return [...fig.querySelectorAll("svg text")].filter(t => {
        for (let e = t; e && e !== fig; e = e.parentElement) if (getComputedStyle(e).opacity === "0") return false;
        const l = lum(getComputedStyle(t).fill);
        return (Math.max(l, bg) + 0.05) / (Math.min(l, bg) + 0.05) < 4.5;
      }).map(t => t.textContent.slice(0, 30));
    })()`);
    const theme = await ev(`document.documentElement.getAttribute("data-bs-theme") || "auto"`);
    if (faint.length) extra.push("article figure " + f + ", step " + i + ", " + theme + " theme: text too faint to read: " + faint.join(" | "));
  };
  thrown.length = 0;
  await open(ARTICLE, []);
  const count = await ev(`${S}.length`);
  for (let f = 0; f < count; f++) {
    const n = await ev(`${S}[${f}].querySelectorAll(".ns-step").length`);
    for (let i = 0; i < n; i++) {
      await toStep(f, i);
      await wait(500);
      const got = await at(f);
      if (got !== String(i)) {
        extra.push("article figure " + f + ": step " + i + " of the text shows step " + got + " of the figure");
        break;
      }
      await faintAt(f, i);
    }
    // Scrolled up from below, a step takes the figure over while its first
    // line is still in view, not hidden behind the figure it drives.
    for (let i = 1; i < n; i++) {
      const r = await ev(`(async () => {
        const s = ${S}[${f}], step = s.querySelectorAll(".ns-step")[${i}], fig = s.querySelector(".ns-fig");
        scrollTo({ top: scrollY + step.getBoundingClientRect().top - innerHeight + 20, behavior: "instant" });
        await new Promise(r => setTimeout(r, 200));
        for (let k = 0; k < 80 && fig.dataset.step !== "${i}"; k++) {
          scrollBy({ top: 20, behavior: "instant" });
          await new Promise(r => setTimeout(r, 60));
        }
        const b = step.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + 12, b.top + 12);
        return { step: fig.dataset.step, readable: !!(hit && step.contains(hit)) };
      })()`);
      if (r.step !== String(i) || !r.readable) {
        extra.push("article figure " + f + ": step " + i + (r.step !== String(i) ? " never takes the figure over" : " takes the figure over with its first line hidden"));
        break;
      }
    }
    const m = await ev(`(() => {
      const s = ${S}[${f}], fig = s.querySelector(".ns-fig"), svg = fig.querySelector("svg");
      return {
        quiet: fig.hasAttribute("data-quiet"), label: !!(svg && svg.getAttribute("aria-label")),
        steps: +fig.dataset.steps, texts: s.querySelectorAll(".ns-step").length,
        strip: s.querySelectorAll(".ns-stepper button").length, caption: !!fig.querySelector("figcaption")
      };
    })()`);
    if (!m.quiet) extra.push("article figure " + f + " not marked data-quiet");
    if (!m.label) extra.push("article figure " + f + " has no aria-label");
    if (m.steps !== m.texts) extra.push("article figure " + f + ": " + m.steps + " states for " + m.texts + " steps of text");
    if (m.strip !== m.texts) extra.push("article figure " + f + ": " + m.strip + " buttons in its strip for " + m.texts + " steps");
    if (!m.caption) extra.push("article figure " + f + " lost its caption when it was drawn");
  }
  if (thrown.length) extra.push("article: script error: " + thrown[0]);

  await open(ARTICLE, []);
  await toStep(0, 4);
  await wait(900);
  if ((await at(0)) !== "4") extra.push("article: landing on step 4 of the first figure shows step " + (await at(0)));

  await toStep(0, 0);
  await wait(600);
  await ev(`(() => {
    const fig = ${S}[0].querySelector(".ns-fig");
    window.__seen = [];
    new MutationObserver(() => window.__seen.push(fig.dataset.step)).observe(fig, { attributes: true, attributeFilter: ["data-step"] });
    ${S}[0].querySelectorAll(".ns-stepper button")[4].click();
  })()`);
  await wait(2500);
  const seen = await ev("window.__seen.join()");
  const cur = await ev(`${S}[0].querySelectorAll(".ns-stepper button")[4].getAttribute("aria-current")`);
  if ((await at(0)) !== "4" || cur !== "step") extra.push("article: clicking step 5 of the strip shows step " + (await at(0)) + ", aria-current " + cur);
  if (seen !== "4") extra.push("article: clicking step 5 of the strip played the steps in between: " + seen);

  const ink = () => ev(`${S}[0].querySelector(".ns-fig svg text")?.getAttribute("fill")`);
  const before = await ink();
  const was = await ev(`document.documentElement.getAttribute("data-bs-theme") === "dark" ? "dark" : "light"`);
  const other = was === "dark" ? "light" : "dark";
  await ev(`document.querySelector('.dropdown-item[data-theme-mode="${other}"]').click()`);
  await wait(900);
  if ((await ink()) === before) extra.push("article: figure text keeps its colour (" + before + ") after the theme switch");
  for (let i = 0; i < (await ev(`${S}[0].querySelectorAll(".ns-step").length`)); i++) {
    await toStep(0, i);
    await wait(500);
    await faintAt(0, i);
  }
  await ev(`document.querySelector('.dropdown-item[data-theme-mode="${was}"]').click()`);
  await wait(600);

  // The pause button stops the animation, not the figure: it stays on the
  // step being read, nothing moves, no text is dimmed; and while paused it
  // still follows the text, a step at a time, without animating.
  await toStep(0, 1);
  await wait(200);
  await ev(toggle + ".click()");
  await wait(400);
  if ((await at(0)) !== "1") extra.push("article: paused mid-animation, the first figure left step 1 for step " + (await at(0)));
  if (await moving()) extra.push("article: still animating while paused");
  if (await ev(`[...${S}[0].querySelectorAll(".ns-step")].some(s => getComputedStyle(s).opacity !== "1")`)) extra.push("article: text left dimmed while paused");
  await toStep(0, 2);
  await wait(500);
  if ((await at(0)) !== "2") extra.push("article: paused, step 2 of the text shows step " + (await at(0)) + " of the figure");
  if (await moving()) extra.push("article: paused, going to the next step animates");
  await ev(toggle + ".click()");

  // Reduced motion: each step of text shows its state at once, nothing moving.
  await open(ARTICLE, [{ name: "prefers-reduced-motion", value: "reduce" }]);
  for (let f = 0; f < count; f++) {
    const n = await ev(`${S}[${f}].querySelectorAll(".ns-step").length`);
    for (let i = 0; i < n; i++) {
      await toStep(f, i);
      await wait(400);
      if ((await at(f)) !== String(i)) {
        extra.push("article, reduced motion: step " + i + " of the text shows step " + (await at(f)) + " of figure " + f);
        break;
      }
      if (await moving()) {
        extra.push("article, reduced motion: figure " + f + " animates at step " + i);
        break;
      }
    }
  }

  await open(ARTICLE, []);
  const toy = await ev(`[...${S}].findIndex(s => s.dataset.fig === "toy")`);
  if (toy < 0) extra.push("article: no toy figure");
  else {
    const T = `${S}[${toy}]`;
    await toStep(toy, 2);
    await wait(2500);
    const pt = () => ev(`${T}.querySelector(".toy-point")?.getAttribute("cx")`);
    const shown = await ev(`(() => { const c = ${T}.querySelector(".toy-point"); return !!c && [c, c.parentNode].every(e => getComputedStyle(e).opacity === "1"); })()`);
    if (!shown) extra.push("article toy: the point drawn at step 3 is not visible once its animation is over");
    const p0 = await pt();
    await ev(`${T}.querySelector(".ns-controls button").click()`);
    await wait(300);
    if ((await pt()) === p0) extra.push("article toy: Draw again draws the same point");
    await toStep(toy, 5);
    await wait(600);
    const words = await ev(`(() => {
      const r = ${T}.querySelectorAll("input[type=range]");
      r[0].value = 0.95; r[0].dispatchEvent(new Event("input"));
      r[1].value = 0.2; r[1].dispatchEvent(new Event("input"));
      return [...${T}.querySelectorAll("svg text")].map(t => t.textContent).join(" | ");
    })()`);
    if (/NaN|Infinity|undefined/.test(words) || !/bits/.test(words)) extra.push("article toy at ρ 0.95, step 0.2: " + String(words).slice(0, 120));
  }
}

// The figures set in the flow of the text, as on Distill: drawn as they come
// near, labelled, readable in both themes, and inside their box.
if (ARTICLE_UP) {
  await open(ARTICLE, []);
  const I = `document.querySelectorAll(".ns-inline")`;
  const inline = await ev(`${I}.length`);
  if (!inline) extra.push("article: no figure in the flow of the text");
  const was = await ev(`document.documentElement.getAttribute("data-bs-theme") === "dark" ? "dark" : "light"`);
  for (const mode of ["light", "dark"]) {
    await ev(`document.querySelector('.dropdown-item[data-theme-mode="${mode}"]').click()`);
    await wait(500);
    for (let f = 0; f < inline; f++) {
      const m = await ev(`(async () => {
        const lum = c => { const [r, g, b] = c.match(/[\\d.]+/g).map(Number).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const fig = ${I}[${f}];
        fig.scrollIntoView({ block: "center", behavior: "instant" });
        await new Promise(r => setTimeout(r, 900));
        const box = fig.getBoundingClientRect();
        const bg = lum(getComputedStyle(fig).backgroundColor);
        const faint = [...fig.querySelectorAll("svg text")].filter(t => {
          for (let e = t; e && e !== fig; e = e.parentElement) if (getComputedStyle(e).opacity === "0") return false;
          const l = lum(getComputedStyle(t).fill);
          return (Math.max(l, bg) + 0.05) / (Math.min(l, bg) + 0.05) < 4.5;
        }).map(t => t.textContent.slice(0, 24));
        const out = [...fig.querySelectorAll(".ns-canvas *")].filter(e => {
          if (e.closest(".ns-lens")) return false;
          const b = e.getBoundingClientRect();
          return b.width > 0 && (b.right > box.right + 1 || b.left < box.left - 1);
        }).map(e => e.tagName.toLowerCase()).slice(0, 3);
        return { name: fig.dataset.fig, live: fig.classList.contains("is-live"), quiet: fig.hasAttribute("data-quiet"),
          label: !!fig.querySelector("[role=img][aria-label], [role=group][aria-label]"), faint, out };
      })()`);
      const at = "article figure " + m.name + ", " + mode + " theme: ";
      if (!m.live) extra.push(at + "never drawn");
      if (!m.quiet) extra.push(at + "not marked data-quiet");
      if (!m.label) extra.push(at + "no labelled picture in it");
      if (m.faint.length) extra.push(at + "text too faint to read: " + m.faint.join(" | "));
      if (m.out.length) extra.push(at + "runs out of its box: " + m.out.join(", "));
    }
  }
  await ev(`document.querySelector('.dropdown-item[data-theme-mode="${was}"]').click()`);
  await wait(400);

  // The loupe: the same spot in every view it is laid on, sharp, inside the
  // picture, and moved by the keys as by the pointer.
  await open(ARTICLE, []);
  const L = `document.querySelector(".ns-loupe")`;
  if (!(await ev(`!!${L}`))) extra.push("article: no figure with a loupe");
  else {
    const c = await ev(`(async () => {
      ${L}.scrollIntoView({ block: "center", behavior: "instant" });
      await new Promise(r => setTimeout(r, 900));
      const b = ${L}.querySelector(".ns-view img, .ns-view canvas").getBoundingClientRect();
      return { x: b.left + b.width * 0.3, y: b.top + b.height * 0.6 };
    })()`);
    await mouse(c.x, c.y);
    await wait(400);
    const lens = () => ev(`[...${L}.querySelectorAll(".ns-view")].map(v => {
      const l = v.querySelector(".ns-lens"), b = v.querySelector("img, canvas").getBoundingClientRect(), r = l.getBoundingClientRect();
      return { shown: getComputedStyle(l).opacity === "1", fx: (r.left + r.width / 2 - b.left) / b.width, fy: (r.top + r.height / 2 - b.top) / b.height, w: b.width, pix: getComputedStyle(l).imageRendering };
    })`);
    let ls = await lens();
    if (!ls.length || !ls.every(l => l.shown)) extra.push("article loupe: not shown on every view under the pointer");
    else {
      const off = Math.max(...ls.map(l => Math.max(Math.abs(l.fx - ls[0].fx), Math.abs(l.fy - ls[0].fy)) * l.w));
      if (off > 1) extra.push("article loupe: the views are " + off.toFixed(1) + "px apart");
      if (Math.abs(ls[0].fx - 0.3) > 0.02 || Math.abs(ls[0].fy - 0.6) > 0.02) extra.push("article loupe: not where the pointer is (" + ls[0].fx.toFixed(2) + ", " + ls[0].fy.toFixed(2) + ")");
      if (!ls.every(l => l.pix === "pixelated")) extra.push("article loupe: smooths the pixels it magnifies");
    }
    await ev(`${L}.querySelector(".ns-view").focus()`);
    for (let k = 0; k < 30; k++) await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
    await wait(200);
    ls = await lens();
    if (!(ls[0] && ls[0].fx > 0.95 && ls[0].fx <= 1.001)) extra.push("article loupe: thirty presses of the right arrow leave it at " + (ls[0] ? ls[0].fx.toFixed(2) : "?") + " of the width");
    await mouse(5, 5);
  }

  // The opening figure: two crops and a question; after a choice, the answer
  // and four views.
  const H = `document.querySelector('.ns-inline[data-fig="hook"]')`;
  const hk = await ev(`(async () => {
    const h = ${H};
    if (!h) return null;
    h.scrollIntoView({ block: "center", behavior: "instant" });
    await new Promise(r => setTimeout(r, 900));
    const imgs = [...h.querySelectorAll(".ns-view img")];
    return { n: imgs.length, loaded: imgs.every(i => i.complete && i.naturalWidth === 256), kb: (h.textContent.match(/([\\d.]+)\\s*KB/) || [])[1] };
  })()`);
  if (!hk) extra.push("article: no opening figure");
  else {
    if (hk.n !== 2 || !hk.loaded) extra.push("article hook: " + hk.n + " crops shown, all loaded: " + hk.loaded);
    const kb = (await (await fetch(BASE + "/assets/data/ns/hook.json")).json()).kbytes;
    if (!(Math.abs(+hk.kb - kb) <= 0.1)) extra.push("article hook: says " + hk.kb + " KB, the data " + kb);
    const after = await ev(`(async () => {
      ${H}.querySelector("button[data-choice]").click();
      await new Promise(r => setTimeout(r, 900));
      const views = [...${H}.querySelectorAll(".ns-view")];
      return { n: views.length, labelled: views.every(v => (v.querySelector(".ns-view-label")?.textContent || "").trim().length > 3), verdict: !!(${H}.querySelector(".ns-verdict")?.textContent || "").trim(), rows: new Set(views.map(v => Math.round(v.getBoundingClientRect().top))).size };
    })()`);
    if (after.n !== 4 || !after.labelled || !after.verdict || after.rows !== 1) extra.push("article hook: after a choice, " + JSON.stringify(after) + " (four labelled views in one row expected)");
  }
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
// On a phone the article is one column: an aside follows its paragraph.
if (ARTICLE_UP) {
  await open(ARTICLE, []);
  const one = await ev(`(() => {
    const p = document.querySelector(".content > p").getBoundingClientRect();
    const a = document.querySelector(".content > .l-gutter").getBoundingClientRect();
    return Math.abs(a.left - p.left) < 20 && a.top > p.top;
  })()`);
  if (!one) extra.push("phone: the article's aside is not under its paragraph");
}
// On a phone the pinned figure, controls, strip and caption included, leaves
// the text most of the screen, on a short phone as on a tall one; nothing in
// it spills over the text; what it writes can be read; and a click in its
// strip of steps lands the step's first line in view, not under the figure.
if (ARTICLE_UP) {
  for (const h of [667, 800]) {
    await send("Emulation.setDeviceMetricsOverride", { width: 375, height: h, deviceScaleFactor: 1, mobile: true });
    await open(ARTICLE, []);
    const fit = await ev(`(async () => {
      const s = document.querySelector(".ns-scrolly");
      scrollTo({ top: scrollY + s.getBoundingClientRect().top + 200, behavior: "instant" });
      await new Promise(r => setTimeout(r, 800));
      const fig = s.querySelector(".ns-fig"), f = fig.getBoundingClientRect();
      const bar = document.getElementById("toc-bar")?.getBoundingClientRect();
      const low = Math.max(...[...fig.querySelectorAll(".ns-canvas > *, figcaption")].map(e => e.getBoundingClientRect().bottom));
      const svg = fig.querySelector("svg"), k = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      const tiny = [...svg.querySelectorAll("text")].filter(t => {
        for (let e = t; e && e !== svg; e = e.parentElement) if (getComputedStyle(e).opacity === "0") return false;
        return parseFloat(getComputedStyle(t).fontSize) * k < 11;
      }).map(t => t.textContent.slice(0, 20));
      return { h: f.height, w: f.width, vw: innerWidth, vh: innerHeight, gap: bar && bar.height ? Math.round(f.top - bar.bottom) : null, spill: Math.round(low - f.bottom), tiny };
    })()`);
    const at = "phone 375×" + h + ": ";
    // Under the theme's title bar, which stays at the top of a post on a phone,
    // with no strip between them for the text to show through.
    if (fit.gap !== null && Math.abs(fit.gap) > 1) extra.push(at + "the pinned figure is " + fit.gap + "px off the title bar above it");
    if (fit.h > fit.vh * 0.6 + 1) extra.push(at + "the pinned figure takes " + Math.round((fit.h / fit.vh) * 100) + "% of the screen");
    if (fit.spill > 1) extra.push(at + "the pinned figure spills " + fit.spill + "px over the text below it");
    if (fit.w > fit.vw) extra.push(at + "the pinned figure is wider than the screen");
    if (fit.tiny.length) extra.push(at + "figure text under 11px: " + fit.tiny.join(" | "));
    const landed = await ev(`(async () => {
      const s = document.querySelector(".ns-scrolly");
      s.querySelectorAll(".ns-stepper button")[4].click();
      await new Promise(r => setTimeout(r, 2000));
      const step = s.querySelectorAll(".ns-step")[4], b = step.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + 12, b.top + 12);
      return !!(hit && step.contains(hit));
    })()`);
    if (!landed) extra.push(at + "a click on step 5 of the strip leaves the step's first line under the figure");
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 1, mobile: true });
}
// On a phone the loupe follows a finger, and the page stays where it is.
if (ARTICLE_UP) {
  await open(ARTICLE, []);
  const v = await ev(`(async () => {
    const fig = document.querySelector(".ns-loupe");
    if (!fig) return null;
    fig.scrollIntoView({ block: "center", behavior: "instant" });
    await new Promise(r => setTimeout(r, 900));
    const b = fig.querySelector(".ns-view img, .ns-view canvas").getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, top: scrollY };
  })()`);
  if (!v) extra.push("phone: no figure with a loupe");
  else {
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: v.x, y: v.y }] });
    for (let k = 1; k <= 6; k++) await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: v.x + k * 8, y: v.y - k * 12 }] });
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await wait(300);
    const end = await ev(`(() => {
      const view = document.querySelector(".ns-loupe .ns-view"), l = view.querySelector(".ns-lens"), b = view.querySelector("img, canvas").getBoundingClientRect(), r = l.getBoundingClientRect();
      return { top: scrollY, fx: (r.left + r.width / 2 - b.left) / b.width };
    })()`);
    if (end.top !== v.top) extra.push("phone: dragging the loupe scrolls the page (" + v.top + " → " + end.top + ")");
    if (!(end.fx > 0.55)) extra.push("phone: the loupe does not follow the finger (" + end.fx.toFixed(2) + ")");
  }
}
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
