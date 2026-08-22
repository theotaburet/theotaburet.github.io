---
icon: fas fa-diagram-project
order: 4
---

## diapason

*Your own radio, broadcast from a phone.*

<div class="deploys">
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

## Ravitools

<div class="deploys">
<span><a href="https://github.com/theotaburet/Ravitools">Source</a> <em class="env">GitHub</em></span>
</div>

Ravitools enriches GPX files with offline points of interest (water, food,
campsites) for long-distance cyclists who lose signal exactly where they most need
to know when the next tap is.

<p class="stack"><span>Python</span><span>GPX</span><span>OpenStreetMap</span></p>

## Natural steganography in the JPEG domain

*PhD research, 2017-2020*

Steganographic embedding that models the sensor noise of a camera, so a hidden
payload is statistically indistinguishable from photonic noise that was always
there. The work derives a closed-form covariance matrix of the stego signal in the
DCT domain, reaching high security (P<sub>E</sub> ≥ 40%) at over 2 bpnzAC.

<p class="stack"><span>Python</span><span>MATLAB</span><span>DCT</span><span>Steganalysis</span></p>

The scheme splits the DCT coefficients into four interleaved lattices and embeds
into them in order, so that each lattice can be conditioned on the ones already
written. Hover a cell below to see what it depends on:

<div id="dct-grid"></div>
<script src="{{ '/assets/js/block-dependency-grid.js' | relative_url }}"></script>

See the [publications]({{ '/publications/' | relative_url }}) page for the papers.
