---
icon: fas fa-diagram-project
order: 4
---

## diapason

*Your own radio, broadcast from a phone.*

<div class="deploys">
<span><a href="https://diapason.fm">diapason.fm</a> <em class="env">production</em></span>
<span><a href="https://diapason.studio">diapason.studio</a> <em class="env">staging</em></span>
<span><a href="https://github.com/theotaburet/diapason">Source</a> <em class="env">GitHub</em></span>
</div>

A group of phones is already a sound system. It just has no way to agree on what
to play, or when. diapason is that missing piece: one person picks the sound, and
everyone around hears the same instant of the same track, in phase, on the phone
already in their pocket.

No app to install. No account to create. A web page and a QR code.

### Three steps

1. **Create a station.** You get a six-character code and a QR.
2. **Pick a source.** A link, a playlist, your microphone, or whatever your computer
   happens to be playing. diapason takes it from there.
3. **Everyone scans.** They're in, in phase, within seconds. People who arrive late
   land in time with everyone else without interrupting anything.

### Where it earns its keep

- **Group rides.** A dozen cyclists, one soundtrack, nobody carrying a speaker.
- **Walks and parties.** Any room becomes multi-speaker without hardware, and it
  gets louder simply by more people joining.
- **Anywhere silent is the rule.** Shared listening without filling the space with
  sound.

### Made for real conditions

Playback survives a locked screen, a walk out of Wi-Fi range onto 4G, and the
server restarting underneath it. The room can run as a benevolent dictatorship, or
as a democracy where listeners vote on what plays next.

<p class="stack"><span>Rust</span><span>axum</span><span>WebAssembly</span><span>TypeScript</span><span>Astro</span><span>iroh / QUIC</span><span>Opus</span><span>Web Audio</span><span>PWA</span></p>

## Ravitools

<div class="deploys">
<span><a href="https://github.com/theotaburet/Ravitools">Source</a> <em class="env">GitHub</em></span>
</div>

Ravitools enriches GPX files with offline points of interest (water, food,
campsites) for long-distance cyclists who lose signal exactly where they most need
to know when the next tap is.

<p class="stack"><span>Python</span><span>GPX</span><span>OpenStreetMap</span></p>

## Natural steganography in the JPEG domain

*PhD research, 2017–2020*

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
