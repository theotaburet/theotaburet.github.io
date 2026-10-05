---
title: "Hiding a message in the noise of a camera"
description: "How natural steganography hides data in JPEG photographs by adding the noise of a higher ISO: from the sensor through demosaicking to the DCT, the dependencies that creates, and how to draw a signal that respects them."
categories: [Research, Steganography]
tags: [steganography, jpeg, demosaicking, sampling]
math: true
ns: true
---

Two photographs of the same piece of cloth. One was taken at ISO 200. The other was taken at ISO 100, then given the noise it lacked to pass for ISO 200, drawn so that it could carry a payload. Can you tell which?

<figure class="ns-inline l-page" data-fig="hook" data-quiet>
<div class="ns-canvas"></div>
<figcaption>A 256×256 crop of the Z CAM E1 RAW files that come with the paper's code, developed (bilinear demosaicking, then luminance) and saved as a JPEG at quality 100. The loupe shows the same spot in every view. Blocks along the edges, whose neighbours fall outside the crop, are left as they were.</figcaption>
</figure>

<div class="ns-byline wide-page l-page">
<div><p class="ns-label">Written by</p><p><a href="/">Théo Taburet</a></p></div>
<div><p class="ns-label">Based on</p><p>T. Taburet, P. Bas, W. Sawaya, J. Fridrich, <em>Natural Steganography in JPEG Domain With a Linear Development Pipeline</em>, IEEE Transactions on Information Forensics and Security 16, 2020. <a href="https://doi.org/10.1109/TIFS.2020.3007354">doi:10.1109/TIFS.2020.3007354</a></p></div>
<div><p class="ns-label">Affiliations</p><p>CRIStAL, CNRS, Centrale Lille · IMT Lille-Douai · Binghamton University</p></div>
</div>

## The sensor's noise is a budget

A camera sensor counts photons, and the count is noisy. This *photonic noise* is Gaussian to a very good approximation, and its variance grows with the light: $\sigma^2 = a\,\mu + b$, where $\mu$ is the noiseless value of the photosite. Raise the ISO and the sensor amplifies harder, so the same scene shot at <span class="ns-key" data-key="iso200">ISO 200</span> is noisier than at <span class="ns-key" data-key="iso100">ISO 100</span>.

<figure class="ns-inline l-page" data-fig="noise" data-quiet>
<div class="ns-canvas"></div>
<figcaption>Noise variance against brightness, measured on the two RAW files: green photosites, the variance of each 8×8 tile around a smooth local mean, and in each brightness bin the lower fifth of the tiles, where texture adds least. The lines are fitted to the points.</figcaption>
</figure>

Natural steganography lives in that gap. Starting from an ISO 100 picture $x$, it adds at every photosite a stego signal

$$S \sim \mathcal{N}\big(0,\ (a_2 - a_1)\,x + b_2 - b_1\big),$$

so that the result is distributed exactly as an ISO 200 shot of the same scene would be. Nothing is hidden by keeping the changes small. A whole layer of noise is added, and it is allowed to be there: the only limit on how much it can carry is the gap between the two ISOs.

<aside class="l-gutter" markdown="1">
Two RAW files are not much to measure a sensor with. The paper fits $a$ and $b$ over the whole of E1Base, 10,800 crops, and finds $a_2 - a_1 = 1.15$ and $b_2 - b_1 = -1150$.
</aside>

## From photosites to JPEG coefficients

The stego signal is added where the noise lives, on the photosites, before the camera has done anything with them. The message, though, travels in a JPEG file, and between the two lies the whole development of the picture. Follow the noise of a single photosite through it.

<section class="ns-scrolly l-page" data-fig="pipeline" markdown="1">
<figure class="ns-fig" data-quiet>
<div class="ns-canvas"></div>
<figcaption>The noise of one red photosite, from the Bayer mosaic to quantised DCT coefficients: demosaicked, mixed into luminance, cut into 8×8 blocks, transformed and rounded. Red: positive values; blue: negative.</figcaption>
</figure>
<div class="ns-steps" markdown="1">
<div class="ns-step" markdown="1">
A sensor does not see colour. Each photosite sits under a red, a green or a blue filter, laid out in the Bayer pattern. Here is a patch of 26×26 of them, and one red photosite carrying a burst of noise. Every other photosite is left alone, so what follows is the trace of that one value.
</div>
<div class="ns-step" markdown="1">
Demosaicking fills in, at every pixel, the two colours its photosite did not measure. With bilinear interpolation, the red of a pixel is a weighted average of the red photosites around it: 1 for its own, ½ for a side neighbour, ¼ for a diagonal one. The burst now shows in nine pixels. This is $D$.
</div>
<div class="ns-step" markdown="1">
The paper works on greyscale JPEGs, which keep one plane, the luminance $Y = 0.299\,R + 0.587\,G + 0.114\,B$. The burst only touched red, so it reaches $Y$ at 0.299 of its strength, still over nine pixels. This is $L$.
</div>
<div class="ns-step" markdown="1">
JPEG cuts the picture into 8×8 blocks. The photosite sat at the edge of one: its nine pixels straddle two blocks, the centre one, C, and its east neighbour, E. The rim of photosites around the blocks is there because demosaicking reads one photosite past them. $S$ selects the pixels of the blocks, $P$ puts them in block order.
</div>
<div class="ns-step" markdown="1">
Each block goes through an 8×8 DCT, $T$: 64 coefficients, one per frequency, the low ones top left. One photosite now moves dozens of coefficients in two blocks at once, with fixed signs and proportions. That is one column of $M = T\,P\,S\,L\,D$, the linear map from photosites to DCT coefficients. Noise that was independent from one photosite to the next comes out correlated: within a block, and across the border between blocks.
</div>
<div class="ns-step" markdown="1">
Last, each coefficient is divided by its step in the quantisation table of the chosen quality, and rounded to the integer the file stores. For anything to survive here, the burst is 1,500 DN, about ten times the noise of a bright photosite at ISO 200. Lower the quality and the steps grow: fewer coefficients survive. Natural steganography draws these integers, which is why it carries the most at high qualities.
</div>
</div>
</section>

*Draft: the rest of the article is on its way. This is one of its figures.*

## The draw, in miniature

Before a real block of 64 coefficients, two.

<aside class="l-gutter" markdown="1">
The paper calls this *conditional sampling*, a variation of Gibbs sampling: each variable is drawn once, from its law given the ones drawn before it.
</aside>

<section class="ns-scrolly l-page" data-fig="toy" markdown="1">
<figure class="ns-fig" data-quiet>
<div class="ns-canvas"></div>
<figcaption>Two coefficients with correlation ρ, quantised with step q (the grid), drawn one after the other. Red: the integer drawn and the values rejected on the way. Purple: the draw that is kept.</figcaption>
</figure>
<div class="ns-steps" markdown="1">
<div class="ns-step" markdown="1">
Take two DCT coefficients whose noise moves together, with a correlation $\rho$. Their joint law is a Gaussian, drawn here as an ellipse. The grid is the JPEG quantisation: one square for each pair of integers the file can store.
</div>
<div class="ns-step" markdown="1">
The first coefficient is drawn from its own law. Quantised, that law becomes a handful of probabilities, one per integer: the PMF of eq. (29). An integer is picked from it. Then a continuous value that rounds to that integer is found again by *rejection*: draw from the Gaussian, keep the first value that lands in the right square.
</div>
<div class="ns-step" markdown="1">
The second is drawn knowing the first. Its law is still Gaussian, but slid to $\rho\,s_1$ and narrowed to $\sqrt{1-\rho^2}$: the Schur complement, at the size of a $2\times2$ matrix. Same routine: PMF, integer, rejection.
</div>
<div class="ns-step" markdown="1">
Do it a thousand times and the draws fill the ellipse, as photonic noise would. Drawn each on its own, with the very same histograms, they fill a round cloud instead. That difference is what a steganalyser learns to see.
</div>
<div class="ns-step" markdown="1">
The real scheme writes the same thing as $s = m + L\,n$: a vector $n$ of independent standard normals, bent into shape by $L$, the Cholesky factor of the covariance. Here $L$ is $2\times2$. For a real block it is $64\times64$, worked out after conditioning on up to eight neighbouring blocks.
</div>
<div class="ns-step" markdown="1">
Conditioning has a price. Once the first coefficient is known, the second is less uncertain, so it carries fewer bits. The stronger the correlation, the more the scheme gives up, which is why the capacity falls from one lattice to the next.
</div>
</div>
</section>
