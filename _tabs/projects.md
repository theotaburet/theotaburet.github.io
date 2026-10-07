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

<canvas class="halftone" data-halftone="/assets/img/projects/halftone.jpg" data-depth="/assets/img/projects/halftone-depth.png" role="img" aria-label="Fans waving yellow flags round the Stade Rochelais bus under red flare smoke, printed in cyan, magenta, yellow and black dots"></canvas>

<div class="halftone-tools" hidden>
<p><span class="halftone-label">Photo</span><input type="file" accept="image/*" hidden><button type="button" data-pick>Choose one</button><small aria-live="polite" data-busy="Working out what is near and what is far…">or drop or paste one on the print. It never leaves your browser.</small></p>
<p role="radiogroup" aria-label="Inks"><span class="halftone-label">Inks</span><label><input type="radio" name="inks" value="cmyk" checked><span></span>CMYK</label><label><input type="radio" name="inks" value="pink-blue"><span></span>Fluo pink, blue</label><label><input type="radio" name="inks" value="pink-blue-yellow"><span></span>Fluo pink, blue, yellow</label><label><input type="radio" name="inks" value="sunflower-black"><span></span>Sunflower, black</label><label><input type="radio" name="inks" value="teal-orange"><span></span>Teal, orange</label><label><input type="radio" name="inks" value="aqua-red"><span></span>Aqua, red</label></p>
<p><span class="halftone-label">Press</span><label>Dots <input type="range" name="dots" min="1" max="4" step="0.5" value="1.5" data-unit=" px"><output></output></label><label>Disorder <input type="range" name="disorder" min="0" max="1" step="0.1" value="0.5"><output></output></label><label>Shake <input type="range" name="shake" min="0" max="2" step="0.25" value="1" data-unit="×"><output></output></label><label>Depth <input type="range" name="depth" min="0" max="2" step="0.25" value="1" data-unit="×"><output></output></label><label>Off register <input type="range" name="register" min="0" max="2" step="0.25" value="1" data-unit="×"><output></output></label><label>Wear <input type="range" name="wear" min="0" max="1" step="0.1" value="0.5"><output></output></label></p>
<p><span class="halftone-label">Save</span><button type="button" data-gif>GIF</button><button type="button" data-video>MP4</button></p>
</div>

In 2021 Matt DesLauriers posted [a photograph rebuilt from dithered CMYK plates](https://x.com/mattdesl/status/1402284658671378432).
[In a reply](https://x.com/mattdesl/status/1402318658941108224) he gave the recipe for the image: split it into
cyan, magenta, yellow and black, dither each layer down to a bitmap, then draw a circle of that ink on every
dot, multiplied over the others. He didn't say how it moves, and the movement is what gives it depth. I rebuilt
it in the browser and measured his video frame by frame until mine moved the same way.

The still image follows his recipe, with Floyd-Steinberg for the dithering. The circles are slightly wider
than their cells, as ink spreads, so each plate is dithered a little lighter to make up for it. The colours
are those of printing inks rather than screen primaries, on an off-white sheet.

Twelve times a second the whole sheet jolts by less than a dot, and each plate drifts a little on its own.
Both are measured off the video. The depth comes from a depth map estimated by Depth Anything, a neural
network that guesses distances from a single picture. Each plate is drawn as if seen from its own viewpoint,
a little apart from the others and wandering, so near things slide one way, far things the other, and the
middle distance stays put. On the video the shift follows nearness to the power 0.3. Every print gets its own
press, its shake, register and scratches drawn at random around those values.

Two things went wrong on the way. The first was moiré. Floyd-Steinberg isn't random: it settles into chains
of dots and, around half the ink, into checkerboards, and every plate has its own. Laid over each other, two
nearly regular patterns beat into slow waves, which travel as the plates move. Noise on the threshold broke
the rows but not the chains. Now the threshold wanders with blue noise, a tile of thresholds ranked so that
the cells under any of them are as evenly spread as possible (Ulichney's void-and-cluster), each plate
reading it from a different place. Error diffusion still keeps the tone and the edges, the dots spread
evenly, and the plates no longer share a pattern that could beat. The dots also sit a little off the centre
of their cells: on a shared grid, how much two plates overlap depends on how far apart they are, and that
changes with depth.

The second was at the edges of near things. Moving each dot by the depth under it piled dots up on one side
of a flag and tore a hole on the other, and the holes opened and closed as the viewpoints wandered. Now
each pixel looks up its ink where the depth under it says, so nothing can pile up and nothing can tear. On its
own that lets what is behind eat into the flag's edge, so the depth map is first grown a little past every near
thing's outline and softened: the flag moves whole, and the plate stretches over what is just behind it.

The Riso sets are two or three risograph inks on cream paper. Cyan, magenta and yellow mean nothing to them,
so each set gets its own separation: the amount of each ink that best rebuilds the colour, by least squares
on their optical densities.

<p class="stack"><span>WebGL2</span><span>GLSL</span><span>JavaScript</span></p>

<script src="{{ '/assets/js/cmyk-halftone.js' | relative_url }}"></script>
