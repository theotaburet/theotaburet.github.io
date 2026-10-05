---
title: "Hiding a message in the noise of a camera"
description: "How natural steganography hides data in JPEG photographs by adding the noise of a higher ISO: from the sensor through demosaicking to the DCT, the dependencies that creates, and how to draw a signal that respects them."
categories: [Research, Steganography]
tags: [steganography, jpeg, demosaicking, sampling]
math: true
ns: true
---

<div class="ns-byline wide-page l-page">
<div><p class="ns-label">Written by</p><p><a href="/">Théo Taburet</a></p></div>
<div><p class="ns-label">Based on</p><p>T. Taburet, P. Bas, W. Sawaya, J. Fridrich, <em>Natural Steganography in JPEG Domain With a Linear Development Pipeline</em>, IEEE Transactions on Information Forensics and Security 16, 2020. <a href="https://doi.org/10.1109/TIFS.2020.3007354">doi:10.1109/TIFS.2020.3007354</a></p></div>
<div><p class="ns-label">Affiliations</p><p>CRIStAL, CNRS, Centrale Lille · IMT Lille-Douai · Binghamton University</p></div>
</div>

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
