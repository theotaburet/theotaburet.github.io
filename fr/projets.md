---
layout: page
lang: fr-FR
title: Projets
permalink: /fr/projets/
description: >-
  Projets de Théo Taburet : diapason, une radio de groupe jouée en synchro
  depuis les téléphones, dans le navigateur ; Ravitools, des points d'intérêt
  hors ligne pour les traces GPX à vélo ; la recherche en stéganographie
  naturelle ; et une photo imprimée en quatre encres tremblantes, en WebGL.
---

<div class="lede wide-page">
<h1>Quatre choses que j'ai construites.</h1>
<div class="lede-body" markdown="1">
<p class="eyebrow"><span class="emo">🧰</span> Travaux&nbsp;choisis &middot; Théo&nbsp;Taburet &middot; signal,&nbsp;images&nbsp;et&nbsp;vélo</p>

Une radio qu'on emporte, une carte qui sait où trouver de l'eau, une façon de
cacher un message dans le grain d'une photographie, et une photo imprimée en
quatre encres qui ne tiennent pas en place. Elles ont moins en commun qu'il n'y
paraît, sauf que chacune est partie d'une envie que j'avais.
</div>
</div>

<div class="project-cards">
<div class="project-card" data-cursor="fork">
<a class="project-card__media" href="#diapason" tabindex="-1" aria-hidden="true"><img src="/assets/img/projects/diapason.jpg" alt="" loading="lazy"></a>
<h3><a href="#diapason"><span class="emo">📻</span> diapason</a></h3>
<p>Votre propre radio, diffusée depuis un téléphone et jouée en synchro sur toutes les enceintes autour.</p>
</div>
<div class="project-card" data-cursor="wheel">
<a class="project-card__media" href="#ravitools" tabindex="-1" aria-hidden="true"><img src="/assets/img/projects/ravitools.jpg" alt="" loading="lazy"></a>
<h3><a href="#ravitools"><span class="emo">🚲</span> Ravitools</a></h3>
<p>Des fichiers GPX enrichis en points d'eau, de ravitaillement et de bivouac, utilisables hors ligne.</p>
</div>
<div class="project-card" data-cursor="grain">
<a class="project-card__media" href="#stego" tabindex="-1" aria-hidden="true"><img src="/assets/img/projects/steganography.jpg" alt="" loading="lazy"></a>
<h3><a href="#stego"><span class="emo">🌾</span> Stéganographie naturelle</a></h3>
<p>Un schéma d'insertion qui imite le bruit du capteur, rendant la charge statistiquement invisible. Thèse.</p>
</div>
<div class="project-card">
<a class="project-card__media" href="#halftone" tabindex="-1" aria-hidden="true"><canvas data-halftone="/assets/img/projects/halftone.jpg" data-depth="/assets/img/projects/halftone-depth.png"></canvas></a>
<h3><a href="#halftone"><span class="emo">🖨️</span> Trame CMJN</a></h3>
<p>Une photo imprimée en quatre encres tramées, mal repérées et tremblantes, en direct en WebGL.</p>
</div>
</div>


## <span class="emo">📻</span> diapason {#diapason}

*Votre propre radio, diffusée depuis un téléphone.*

<div class="deploys" data-cursor="fork">
<span><a href="https://diapason.fm">diapason.fm</a> <em class="env">production</em></span>
<span><a href="https://diapason.studio">diapason.studio</a> <em class="env">préproduction</em></span>
</div>

Une personne choisit la musique, et tout le monde autour la joue à voix haute sur sa
propre enceinte portable, en synchro. Le téléphone fait le lien entre la station et
l'enceinte qu'il pilote, en Bluetooth ou par un câble. Plus il y a de monde, plus le
résultat est fort et large.

Le plus dur n'est pas d'envoyer l'audio, c'est de se mettre d'accord sur le moment où
le jouer. Chaque téléphone a sa propre horloge et les réseaux mobiles sont
imprévisibles, alors tenir un groupe assez serré pour que les enceintes fusionnent en
une seule au lieu de baver, c'est là qu'est passé le travail.

Vous créez une station et vous obtenez un code à six caractères et un QR. Vous la
pointez vers ce que vous voulez diffuser : un lien, une playlist, votre micro, ou
simplement ce que votre ordinateur est déjà en train de jouer. Les autres scannent le
code, branchent leur enceinte, et c'est parti. Ceux qui arrivent en retard se calent
sur les autres.

Il n'y a rien à installer et pas de compte à créer, parce que tout tourne dans le
navigateur. Ça continue de jouer quand un téléphone verrouille son écran ou passe du
Wi-Fi à la 4G. Vous pouvez laisser les auditeurs voter pour la suite plutôt que de
tout choisir vous-même.

Je l'ai construit pour les sorties vélo.

<p class="stack"><span>Rust</span><span>axum</span><span>WebAssembly</span><span>TypeScript</span><span>Astro</span><span>Opus</span><span>Web Audio</span><span>PWA</span></p>

## <span class="emo">🚲</span> Ravitools {#ravitools}

<div class="deploys" data-cursor="wheel">
<span><a href="https://github.com/theotaburet/Ravitools">Source</a> <em class="env">GitHub</em></span>
</div>

Ravitools enrichit les fichiers GPX avec des points d'intérêt hors ligne (eau,
ravitaillement, campings) pour les cyclistes au long cours, qui perdent le réseau
exactement là où ils ont le plus besoin de savoir où est le prochain robinet.

<p class="stack"><span>Python</span><span>GPX</span><span>OpenStreetMap</span></p>

## <span class="emo">🌾</span> Stéganographie naturelle dans le domaine JPEG {#stego}

*Travaux de thèse, 2017-2020*

Un schéma d'insertion qui modélise le bruit de capteur d'un appareil photo, pour qu'une
charge cachée soit statistiquement indiscernable du bruit photonique qui était déjà là.
Ces travaux établissent une forme close de la matrice de covariance du signal stégo dans
le domaine DCT, et atteignent une sécurité élevée (P<sub>E</sub> ≥ 40 %) à plus de
2 bpnzAC.

<p class="stack"><span>Python</span><span>MATLAB</span><span>DCT</span><span>Stéganalyse</span></p>

Le schéma découpe les blocs 8×8 d'un JPEG en quatre réseaux entrelacés et insère
dedans dans l'ordre, de sorte que chaque réseau puisse être conditionné par ceux déjà
écrits. Chaque case est un bloc ; survolez-en ou touchez-en une pour voir sa portée,
tout ce dont elle dépend de proche en proche :

<div id="dct-grid" data-quiet data-hint="Survolez ou touchez un bloc pour voir sa portée : tout ce dont il dépend, de proche en proche." data-label="Huit fois huit blocs JPEG répartis en quatre réseaux entrelacés : A et C alternent sur les lignes impaires, D et B sur les lignes paires." data-legend="indépendant|dépend de A|dépend de A, B|dépend de A, B, C"></div>
<script src="{{ '/assets/js/block-dependency-grid.js' | relative_url }}"></script>

[Un article explicatif, en anglais]({{ '/posts/natural-steganography-jpeg/' | relative_url }}),
présente tout le schéma avec des figures interactives, du capteur au fichier JPEG.
Les articles sont sur la page [publications]({{ '/fr/publications/' | relative_url }}).

## <span class="emo">🖨️</span> Trame CMJN {#halftone}

*Une photo imprimée par une presse qui ne tient pas en place.*

<canvas class="halftone" data-halftone="/assets/img/projects/halftone.jpg" data-depth="/assets/img/projects/halftone-depth.png" role="img" aria-label="Des cyclistes qui s'éloignent sur une route, imprimés en points cyan, magenta, jaune et noir"></canvas>

<p class="halftone-tools" hidden><input type="file" accept="image/*" hidden><button type="button" class="btn btn-sm btn-outline-secondary" data-pick>Imprimer votre photo</button> <button type="button" class="btn btn-sm btn-outline-secondary" data-reprint>Nouveau tirage</button> <button type="button" class="btn btn-sm btn-outline-secondary" data-riso aria-pressed="false">Encres Riso</button> <button type="button" class="btn btn-sm btn-outline-secondary" data-gif>Télécharger le GIF</button> <button type="button" class="btn btn-sm btn-outline-secondary" data-video>Télécharger la vidéo</button> <small data-busy="Calcul de ce qui est près et de ce qui est loin…">Ou glissez ou collez une photo sur l'impression. Elle ne quitte pas votre navigateur.</small></p>

Matt DesLauriers a publié en 2021 [une photo reconstruite en plaques CMJN tramées](https://x.com/mattdesl/status/1402284658671378432)
sans dire comment elle était faite, alors je l'ai reconstruite dans le navigateur, en mesurant sa vidéo image par image jusqu'à ce que la mienne bouge pareil.

### Comment c'est fait

1. **Quatre plaques.** La photo est séparée naïvement en cyan, magenta et jaune,
   chacun le négatif d'un canal (le cyan est là où le rouge manque), avec un peu
   de noir sous les couleurs les plus sombres. Une vraie presse retire la couleur
   que son noir remplace ; celle-ci non, et ça fait partie du rendu.
2. **Tramage.** Chaque plaque devient une grille de cellules, encrées ou nues,
   par diffusion d'erreur de Floyd-Steinberg : chaque cellule est arrondie à
   « encre » ou « pas d'encre », et l'erreur d'arrondi est reportée sur les
   voisines pas encore tracées, si bien que chaque petite zone garde son ton. Le
   seuil est bruité pour que les points ne s'alignent jamais en rangées, et chaque
   plaque est tramée depuis un coin différent pour que les quatre grains ne
   coïncident pas, ce que font les angles de trame sur une vraie presse.
3. **L'encre sur le papier.** Chaque cellule encrée reçoit un point rond un peu
   plus large qu'elle, comme l'encre qui s'étale, et les plaques sont tramées un
   peu plus claires pour compenser. Les quatre plaques se multiplient sur une
   feuille blanc cassé à peine texturée, aux couleurs des encres d'imprimerie : là
   où deux se chevauchent, chacune filtre la lumière que l'autre laisse passer,
   c'est toute la synthèse soustractive.
4. **Le tremblement.** Douze fois par seconde, la feuille saute de moins d'une
   cellule dans une nouvelle direction, et chaque plaque dérive un peu de son
   côté, hors repère. Les mouvements sont un bruit lisse plutôt que des cercles,
   aux amplitudes et aux rythmes de la vidéo.
5. **La profondeur.** La partie que le tweet ne montre pas. Une carte de
   profondeur, calculée par Depth Anything, un réseau de neurones qui devine les
   distances sur une seule image, dit à quelle distance est chaque point. Chaque
   plaque est dessinée comme vue depuis son propre point de vue, un peu à l'écart
   de celui des autres et qui se promène : le proche glisse d'un côté, le lointain
   de l'autre, et le plan du milieu reste immobile. L'œil lit ce désaccord comme
   du relief, un peu comme il lit les deux images de nos deux yeux. Ajusté sur la
   vidéo, le glissement suit la proximité à la puissance 0,3, et les plaques
   bougent par demi-cellules entières, si bien que les points sautent au lieu de
   baver.
6. **L'usure.** Des rayures verticales pointillées montrent où une plaque n'a
   pas imprimé, et une dernière passe floute la couleur plus que la lumière, comme
   l'a fait la compression vidéo du tweet.
7. **Deux tirages ne se ressemblent jamais.** Chaque photo, et chaque *Nouveau
   tirage*, a sa propre presse, tirée autour de ce que montre la vidéo : elle
   tremble plus ou moins fort, repère plus ou moins mal ses plaques, bave et se
   raye plus ou moins, et trame chaque plaque depuis un autre coin. *Encres Riso*
   remplace les encres d'imprimerie par le rose fluo, le bleu et le jaune d'un
   risographe, pour lesquels la séparation n'a jamais été faite.
8. **Votre photo.** Elle est lue dans votre navigateur, et sa carte de
   profondeur y est calculée aussi, par le même réseau (environ 27 Mo,
   téléchargés une fois). Le GIF, pour une page web, fait 24 images dont les
   mouvements reviennent à leur point de départ, si bien qu'il boucle sans saut,
   avec autour la marge de papier du tweet. La vidéo, pour les réseaux sociaux,
   est la même boucle jouée trois fois, chaque point doublé pour survivre à leur
   compression.

<p class="stack"><span>WebGL2</span><span>GLSL</span><span>JavaScript</span></p>

<script src="{{ '/assets/js/cmyk-halftone.js' | relative_url }}"></script>
