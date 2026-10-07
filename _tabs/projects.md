---
icon: fas fa-diagram-project
order: 4
description: >-
  Projects by Théo Taburet: diapason, a group radio played in sync from phones
  in the browser; Ravitools, offline points of interest for cycling GPX files;
  research on natural steganography; and a photograph printed in four
  trembling inks, in WebGL.
---

<div class="lede wide-page">
<h1>Four things I've built.</h1>
<div class="lede-body" markdown="1">
<p class="eyebrow"><span class="emo">🧰</span> Selected&nbsp;work &middot; Théo&nbsp;Taburet &middot; signal,&nbsp;images&nbsp;and&nbsp;bicycles</p>

A radio you carry, a map that knows where the water is, a way of hiding a
message in the grain of a photograph, and a photograph printed in four inks that
won't keep still. They have less in common than they look, except that each one
started as something I wanted for myself.
</div>
</div>

<div class="project-cards">
<div class="project-card" data-cursor="fork">
<a class="project-card__media" href="#diapason" tabindex="-1" aria-hidden="true"><img src="/assets/img/projects/diapason.jpg" alt="" loading="lazy"></a>
<h3><a href="#diapason"><span class="emo">📻</span> diapason</a></h3>
<p>Your own radio, broadcast from a phone and played in sync on every speaker around you.</p>
</div>
<div class="project-card" data-cursor="wheel">
<a class="project-card__media" href="#ravitools" tabindex="-1" aria-hidden="true"><img src="/assets/img/projects/ravitools.jpg" alt="" loading="lazy"></a>
<h3><a href="#ravitools"><span class="emo">🚲</span> Ravitools</a></h3>
<p>GPX files enriched with offline water, food and campsite points for long-distance cyclists.</p>
</div>
<div class="project-card" data-cursor="grain">
<a class="project-card__media" href="#stego" tabindex="-1" aria-hidden="true"><img src="/assets/img/projects/steganography.jpg" alt="" loading="lazy"></a>
<h3><a href="#stego"><span class="emo">🌾</span> Natural steganography</a></h3>
<p>Embedding that mimics sensor noise, so the payload is statistically invisible. PhD research.</p>
</div>
<div class="project-card">
<a class="project-card__media" href="#halftone" tabindex="-1" aria-hidden="true"><canvas data-halftone="/assets/img/projects/halftone.jpg" data-depth="/assets/img/projects/halftone-depth.png"></canvas></a>
<h3><a href="#halftone"><span class="emo">🖨️</span> CMYK halftone</a></h3>
<p>A photograph printed in four dithered inks, out of register and trembling, live in WebGL.</p>
</div>
</div>


## <span class="emo">📻</span> diapason {#diapason}

*Your own radio, broadcast from a phone.*

<div class="deploys" data-cursor="fork">
<span><a href="https://diapason.fm">diapason.fm</a> <em class="env">production</em></span>
<span><a href="https://diapason.studio">diapason.studio</a> <em class="env">staging</em></span>
</div>

One person picks the music, and everyone around them plays it out loud on their own
portable speaker, in sync. The phone is the link between the station and whatever
speaker it drives, over Bluetooth or a cable. The more people join, the louder and
wider the result.

The hard part is not sending the audio, it is agreeing on when to play it. Phones
keep their own time and mobile networks are unpredictable, so holding a group tight
enough that the speakers fuse into one instead of smearing is where the work went.

You create a station and get a six-character code and a QR. You point it at
whatever you want to play, which can be a link, a playlist, your microphone, or
just whatever your computer is playing already. Everyone else scans the code,
connects their speaker, and they're in. People who show up late land in time with
the rest.

There is nothing to install and no account to create, because it all runs in the
browser. It keeps playing when a phone locks its screen or drops from Wi-Fi to 4G.
You can let listeners vote on what comes next instead of picking everything
yourself.

I built it for bike rides.

<p class="stack"><span>Rust</span><span>axum</span><span>WebAssembly</span><span>TypeScript</span><span>Astro</span><span>Opus</span><span>Web Audio</span><span>PWA</span></p>

## <span class="emo">🚲</span> Ravitools {#ravitools}

<div class="deploys" data-cursor="wheel">
<span><a href="https://github.com/theotaburet/Ravitools">Source</a> <em class="env">GitHub</em></span>
</div>

Ravitools enriches GPX files with offline points of interest (water, food,
campsites) for long-distance cyclists who lose signal exactly where they most need
to know when the next tap is.

<p class="stack"><span>Python</span><span>GPX</span><span>OpenStreetMap</span></p>

## <span class="emo">🌾</span> Natural steganography in the JPEG domain {#stego}

*PhD research, 2017-2020*

Steganographic embedding that models the sensor noise of a camera, so a hidden
payload is statistically indistinguishable from photonic noise that was always
there. The work derives a closed-form covariance matrix of the stego signal in the
DCT domain, reaching high security (P<sub>E</sub> ≥ 40%) at over 2 bpnzAC.

<p class="stack"><span>Python</span><span>MATLAB</span><span>DCT</span><span>Steganalysis</span></p>

The scheme splits the 8×8 blocks of a JPEG into four interleaved lattices and
embeds into them in order, so that each lattice can be conditioned on the ones
already written. Each cell below is a block; hover or tap one to see its reach,
everything it depends on, step by step:

<div id="dct-grid" data-quiet></div>
<script src="{{ '/assets/js/block-dependency-grid.js' | relative_url }}"></script>

[Hiding a message in the noise of a camera]({{ '/posts/natural-steganography-jpeg/' | relative_url }})
explains the whole scheme with interactive figures, from the sensor to the JPEG file.
See the [publications]({{ '/publications/' | relative_url }}) page for the papers.

## <span class="emo">🖨️</span> CMYK halftone {#halftone}

*A photograph printed by a press that can't hold still.*

<canvas class="halftone" data-halftone="/assets/img/projects/halftone.jpg" data-depth="/assets/img/projects/halftone-depth.png" role="img" aria-label="Cyclists riding away down a road, printed in cyan, magenta, yellow and black dots"></canvas>

<p class="halftone-tools" hidden><input type="file" accept="image/*" hidden><button type="button" class="btn btn-sm btn-outline-secondary" data-pick>Print your own photo</button> <button type="button" class="btn btn-sm btn-outline-secondary" data-reprint>New print</button> <button type="button" class="btn btn-sm btn-outline-secondary" data-riso aria-pressed="false">Riso inks</button> <button type="button" class="btn btn-sm btn-outline-secondary" data-gif>Download the GIF</button> <button type="button" class="btn btn-sm btn-outline-secondary" data-video>Download the video</button> <small data-busy="Working out what is near and what is far…">Or drop or paste a photo on the print. It never leaves your browser.</small></p>

Matt DesLauriers posted [a photograph rebuilt from dithered CMYK plates](https://x.com/mattdesl/status/1402284658671378432) in 2021
without saying how it was made, so I rebuilt it in the browser, measuring his video frame by frame until mine moved like it.

### How it's made

1. **Four plates.** The photograph is split naively into cyan, magenta and yellow,
   each the negative of one channel (cyan is wherever red is missing), with a little
   black under the darkest colours. A real press takes out the colour its black
   replaces; this one doesn't, and that is part of the look.
2. **Dithering.** Each plate becomes a grid of cells, inked or bare, by
   Floyd-Steinberg error diffusion: every cell is rounded to ink or no ink, and
   what the rounding got wrong is handed on to the neighbours not yet drawn, so
   every small patch keeps its tone. The threshold is jittered so the dots never
   fall into rows, and each plate is dithered from a different corner so the four
   grains don't line up, which is what screen angles do on a real press.
3. **Ink on paper.** Every inked cell gets a round dot a little wider than the
   cell, as ink spreads, and the plates are dithered a little lighter to make up
   for it. The four plates are multiplied over a faintly textured off-white sheet
   in the colours of process inks: where two overlap, each filters the light the
   other lets through, which is all subtractive colour is.
4. **Shake.** Twelve times a second the sheet jolts by less than a cell in a new
   direction, and each plate drifts a little on its own, off register. The moves
   are smooth noise rather than circles, with the sizes and rhythms of the video.
5. **Depth.** The part the tweet doesn't show. A depth map, worked out by
   Depth Anything, a neural network that guesses distances from a single picture,
   says how far away each point is. Each plate is drawn as if seen from its own
   viewpoint, a little apart from the others' and wandering: what is near slides
   one way, what is far the other, and the middle distance holds still. The eye
   reads that disagreement as depth, a little as it reads the two views of a pair
   of eyes. Fitted on the video, the slide follows nearness to the power 0.3, and
   the plates move by whole half cells, so the dots jump rather than smear.
6. **Wear.** Dotted vertical scratches show where a plate failed to print, and a
   last pass blurs the colour more than the light, as the tweet's video
   compression did.
7. **No two prints alike.** Every photograph, and every *New print*, gets its own
   press, drawn around what the video shows: it shakes harder or softer, holds its
   plates further off register, bleeds and scratches more or less, and dithers each
   plate from another corner. *Riso inks* swaps the process inks for a
   risograph's fluorescent pink, blue and yellow, which the separation was never
   made for.
8. **Your photo.** It is read in your browser, and its depth map is worked out
   there too, by the same network (about 27 MB, downloaded once). The GIF, for a
   web page, is 24 frames whose moves come back to where they started, so it
   loops without a jump, with the tweet's margin of paper around it. The video,
   for social networks, is the same loop three times over, every dot doubled so
   it lives through their compression.

<p class="stack"><span>WebGL2</span><span>GLSL</span><span>JavaScript</span></p>

<script src="{{ '/assets/js/cmyk-halftone.js' | relative_url }}"></script>
