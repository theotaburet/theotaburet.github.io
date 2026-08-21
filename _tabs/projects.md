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

One person picks the sound. Everyone around scans a QR code and hears the same
instant of the same track — in phase, on their own phone, with no install and no
account. Built for bike rides, walks and parties.

A DJ creates a station (a six-character code and a QR), points it at whatever they
want to play — a link, a playlist, their microphone, whatever their computer is
playing — and every listener lands on a shared media clock about two seconds behind
the source. Playback survives a locked screen, a 4G handover, and the server
restarting. Late joiners land in phase without disturbing anyone.

<p class="stack"><span>Rust</span><span>axum</span><span>WebAssembly</span><span>TypeScript</span><span>Astro</span><span>iroh / QUIC</span><span>Opus</span><span>ed25519</span><span>Web Audio</span><span>PWA</span></p>

### How it stays in phase

The hard part isn't streaming, it's agreeing on *when*. The chain that gets there:

- **Clock offset** — bursts of probes over a persistent QUIC bi-stream, reduced by a
  directional order statistic so that queuing on one direction doesn't leak into the
  estimate.
- **Skew tracking** — a weighted regression with two regressors separates real
  oscillator drift from "the phone just got busy".
- **Peer fusion** — two phones in the same room see each other at 2–10 ms. Those
  cross-probes become edges of a graph, solved jointly by weighted least squares
  rather than chained, because chaining offsets compounds error.
- **The server is the clock** — every frame carries its own play-at time, so arrival
  jitter never enters the timeline.
- **Shared horizon** — one room-wide latency shift, ramped identically by every
  listener, so extra depth costs latency but never mutual desync.
- **Scheduling** — a rate servo saturated at 100 ppm (inaudible), with WSOLA
  time-stretch held in reserve for the rare large correction.

Chat, votes and now-playing are ed25519-signed byte blobs that browsers and server
verify with the same code. Rooms can run as a dictatorship, a democracy where
listeners vote the queue, or a parliament of grants.

## Ravitools

<div class="deploys">
<span><a href="https://github.com/theotaburet/Ravitools">Source</a> <em class="env">GitHub</em></span>
</div>

Ravitools enriches GPX files with offline points of interest — water, food,
campsites — for long-distance cyclists who lose signal exactly where they most need
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
