---
layout: page
lang: fr-FR
title: Projets
permalink: /fr/projets/
description: >-
  Projets de Théo Taburet : diapason, une radio de groupe jouée en synchro
  depuis les téléphones, dans le navigateur ; Ravitools, des points d'intérêt
  hors ligne pour les traces GPX à vélo ; la recherche en stéganographie
  naturelle ; une photo imprimée en quatre encres tremblantes, en WebGL ; et
  Boomerang, une vidéo en boucle tirée d'une rafale de photos.
---

<div class="lede wide-page">
<h1>Cinq choses que j'ai construites.</h1>
<div class="lede-body" markdown="1">
<p class="eyebrow"><span class="emo">🧰</span> Travaux&nbsp;choisis &middot; Théo&nbsp;Taburet &middot; signal,&nbsp;images&nbsp;et&nbsp;vélo</p>

Une radio qu'on emporte, une carte qui sait où trouver de l'eau, une façon de
cacher un message dans le grain d'une photographie, une photo imprimée en
quatre encres qui ne tiennent pas en place, et une rafale de photos qui se joue
à l'endroit puis à l'envers. Elles ont moins en commun qu'il n'y
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
<div class="project-card">
<a class="project-card__media" href="#boomerang" tabindex="-1" aria-hidden="true"><video src="/assets/img/projects/boomerang.mp4" poster="/assets/img/projects/boomerang.jpg" autoplay muted loop playsinline></video></a>
<h3><a href="#boomerang"><span class="emo">🪃</span> Boomerang</a></h3>
<p>Une rafale de photos jouée à l'endroit puis à l'envers en vidéo qui boucle, encodée dans le navigateur.</p>
</div>
</div>
<script>matchMedia("(prefers-reduced-motion: reduce)").matches && document.querySelector(".project-card video").removeAttribute("autoplay");</script>


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

*Ce qu'il y a le long de la route, même sans réseau.*

<div class="deploys" data-cursor="wheel">
<span><a href="https://theotaburet.github.io/Ravitools/">Essayer</a> <em class="env">démo</em></span>
<span><a href="https://github.com/theotaburet/Ravitools">Source</a> <em class="env">GitHub</em></span>
</div>

Ravitools enrichit les fichiers GPX avec des points d'intérêt hors ligne (eau,
ravitaillement, campings) pour les cyclistes au long cours, qui perdent le réseau
exactement là où ils ont le plus besoin de savoir où est le prochain robinet.

Chargez une trace et Ravitools demande à OpenStreetMap ce qu'il y a le long : points
d'eau, commerces, restaurants, campings et abris, toilettes, magasins de vélo. Il
cherche dans un couloir qui suit la trace plutôt que dans un rectangle autour, puis
garde chaque lieu selon sa vraie distance à la ligne, dans un rayon que vous réglez :
étroit en ville, large là où il y a peu. Les doublons ne sont fusionnés que quand ça
garde du sens sur la route.

Le profil d'altitude colore chaque pente et signale chaque tronçon, plus long qu'une
distance que vous choisissez, sans eau ou sans commerce. Ce que vous gardez repart en
GPX, KML, KMZ, GeoJSON ou GPX OsmAnd, à charger sur un GPS ou un téléphone avant de
partir.

La démo tourne entièrement dans votre navigateur : la trace n'en sort jamais, et c'est
le navigateur qui demande lui-même à OpenStreetMap ce qu'il y a le long du chemin.
Chercher chaque lieu sur le web demande un serveur, alors la démo laisse cette étape de
côté.

<p class="stack"><span>TypeScript</span><span>React</span><span>Leaflet</span><span>GPX</span><span>OpenStreetMap</span></p>

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

<canvas class="halftone" data-halftone="/assets/img/projects/halftone.jpg" data-depth="/assets/img/projects/halftone-depth.png" role="img" aria-label="Des supporters agitent des drapeaux jaunes autour du bus du Stade Rochelais, sous la fumée rouge des fumigènes, imprimés en points cyan, magenta, jaune et noir"></canvas>

<div class="halftone-tools" hidden>
<p><input type="file" accept="image/*" hidden><button type="button" data-pick>Photo</button><button type="button" aria-expanded="false" aria-controls="halftone-inks">Encres</button><button type="button" aria-expanded="false" aria-controls="halftone-press">Presse</button><button type="button" aria-expanded="false" aria-controls="halftone-analog">Analogique</button><button type="button" aria-expanded="false" aria-controls="halftone-export">Exporter</button></p>
<p id="halftone-inks" role="radiogroup" aria-label="Encres" hidden><label><input type="radio" name="inks" value="cmyk" checked><span></span>CMJN</label><label><input type="radio" name="inks" value="pink-blue"><span></span>Rose fluo, bleu</label><label><input type="radio" name="inks" value="pink-blue-yellow"><span></span>Rose fluo, bleu, jaune</label><label><input type="radio" name="inks" value="sunflower-black"><span></span>Tournesol, noir</label><label><input type="radio" name="inks" value="teal-orange"><span></span>Sarcelle, orange</label><label><input type="radio" name="inks" value="aqua-red"><span></span>Aqua, rouge</label></p>
<p id="halftone-press" hidden><label>Points <input type="range" name="dots" min="120" max="480" step="20" value="320"><output></output></label><label>Désordre <input type="range" name="disorder" min="0" max="1" step="0.1" value="0.5"><output></output></label><label>Tremblement <input type="range" name="shake" min="0" max="2" step="0.25" value="1" data-unit="×"><output></output></label><label>Profondeur <input type="range" name="depth" min="0" max="2" step="0.25" value="1" data-unit="×"><output></output></label><label>Hors repère <input type="range" name="register" min="0" max="2" step="0.25" value="1" data-unit="×"><output></output></label></p>
<p id="halftone-analog" hidden><label>Rayures <input type="range" name="scratches" min="0" max="2" step="0.25" value="1" data-unit="×"><output></output></label><label>Force des rayures <input type="range" name="scratchStrength" min="0" max="1" step="0.1" value="0.7"><output></output></label><label>Encre manquante <input type="range" name="starve" min="0" max="1" step="0.1" value="0"><output></output></label><label>Papier <input type="range" name="grain" min="0" max="2" step="0.25" value="1" data-unit="×"><output></output></label><label>Flou <input type="range" name="soft" min="0" max="2" step="0.25" value="1" data-unit="×"><output></output></label></p>
<div id="halftone-export" hidden>
<p role="radiogroup" aria-label="Format"><label><input type="radio" name="format" value="photo" checked><span></span>Original</label><label><input type="radio" name="format" value="square"><span></span>Carré</label><label><input type="radio" name="format" value="landscape"><span></span>Paysage</label><label><input type="radio" name="format" value="portrait"><span></span>Portrait</label></p>
<p role="radiogroup" aria-label="Fond"><label><input type="radio" name="ground" value="paper" checked><span style="background: #f2f2f5"></span>Papier</label><label><input type="radio" name="ground" value="white"><span style="background: #fff"></span>Blanc</label><label><input type="radio" name="ground" value="black"><span style="background: #000"></span>Noir</label><label><input type="radio" name="ground" value="other"><input type="color" value="#e8d5b0" aria-label="Autre">Autre</label></p>
<p id="halftone-padding"><label>Marge <input type="range" name="padding" min="0" max="25" step="1" value="0" data-unit=" %"><output></output></label></p>
<p><span role="group" aria-label="GIF" data-format="gif"><span aria-hidden="true">GIF</span><button type="button" value="1080">1080p</button><button type="button" value="1440">2K</button><button type="button" value="2160">4K</button></span><span role="group" aria-label="MP4" data-format="mp4"><span aria-hidden="true">MP4</span><button type="button" value="1080">1080p</button><button type="button" value="1440">2K</button><button type="button" value="2160">4K</button></span></p>
</div>
<p><small aria-live="polite" data-busy="Calcul de ce qui est près et de ce qui est loin…">Ou glissez ou collez une photo sur l'impression. Elle reste dans votre navigateur.</small></p>
</div>

En 2021, Matt DesLauriers a publié [une photo reconstruite en plaques CMJN tramées](https://x.com/mattdesl/status/1402284658671378432).
[En réponse à quelqu'un](https://x.com/mattdesl/status/1402318658941108224), il a donné la recette de l'image :
séparer la photo en cyan, magenta, jaune et noir, tramer chaque couche jusqu'à n'avoir plus que des points, puis
dessiner un cercle de l'encre correspondante sur chaque point, en multiplication. Il n'a pas dit comment ça
bouge, et c'est le mouvement qui donne la profondeur. Je l'ai refait dans le navigateur, en mesurant sa vidéo
image par image jusqu'à ce que la mienne bouge pareil.

L'image fixe suit sa recette, avec Floyd-Steinberg pour le tramage. Les cercles débordent un peu de leur
cellule, comme l'encre qui s'étale, donc chaque plaque est tramée un peu plus claire pour compenser. Les
couleurs sont celles des encres d'imprimerie plutôt que celles de l'écran, sur un papier blanc cassé.

Douze fois par seconde, toute la feuille tremble de moins d'un point, et chaque plaque dérive un peu de son
côté. Les deux sont mesurés sur la vidéo. La profondeur vient d'une carte de profondeur estimée par Depth
Anything, un réseau de neurones qui devine les distances à partir d'une seule image. Chaque plaque est
dessinée comme vue de son propre point de vue, un peu à l'écart des autres et qui se promène : ce qui est
proche glisse d'un côté, ce qui est loin de l'autre, et le plan du milieu ne bouge pas. Sur la vidéo, le
décalage suit la proximité à la puissance 0,3. Chaque tirage a sa propre presse : tremblement, repérage et
rayures sont tirés au hasard autour de ces valeurs.

Deux choses ont mal tourné en route. La première, c'est le moiré. Floyd-Steinberg n'est pas aléatoire : il
s'installe dans des chaînes de points et, autour de la moitié d'encre, dans des damiers, et chaque plaque a
les siens. Superposés, deux motifs presque réguliers battent en ondes lentes, qui avancent quand les plaques
bougent. Du bruit sur le seuil cassait les rangées, pas les chaînes. Maintenant le seuil ondule en bruit
bleu : une tuile de seuils classés pour que les cellules sous chacun soient réparties le plus régulièrement
possible (le void-and-cluster d'Ulichney), lue à un endroit différent par chaque plaque. La diffusion
d'erreur garde la tonalité et les contours, les points se répartissent de façon homogène, et les plaques
n'ont plus de motif commun qui puisse battre. Les points sont aussi un peu décalés du centre de leur
cellule : sur une grille commune, le recouvrement de deux plaques dépend de leur écart, et cet écart change
avec la profondeur.

La seconde, c'est au bord des objets proches. Déplacer chaque point selon la profondeur sous lui empilait
les points d'un côté d'un drapeau et ouvrait un trou de l'autre, et ces trous s'ouvraient et se refermaient
au gré des points de vue. Maintenant chaque pixel va chercher son encre là où la profondeur sous lui
l'indique : rien ne peut s'empiler ni se déchirer. Seul, ça laisserait le fond grignoter le bord du
drapeau, donc la carte de profondeur est d'abord gonflée un peu au-delà de la silhouette de chaque objet
proche, puis adoucie : le drapeau bouge d'un bloc, et la plaque s'étire sur ce qui est juste derrière lui.

Les jeux Riso sont deux ou trois encres de risographe sur papier crème. Le cyan, le magenta et le jaune ne
veulent rien dire pour elles, alors chaque jeu a sa propre séparation : la quantité de chaque encre qui
reconstruit le mieux la couleur, par moindres carrés sur leurs densités optiques.

<p class="stack"><span>WebGL2</span><span>GLSL</span><span>JavaScript</span></p>

<script src="{{ '/assets/js/cmyk-halftone.js' | relative_url }}"></script>

## <span class="emo">🪃</span> Boomerang {#boomerang}

*Une rafale de photos, à l'endroit puis à l'envers.*

<div class="deploys">
<span><a href="https://theotaburet.github.io/boomerang/">Essayer</a> <em class="env">démo</em></span>
<span><a href="https://github.com/theotaburet/boomerang">Source</a> <em class="env">GitHub</em></span>
</div>

Déposez quelques photos prises en rafale et Boomerang les joue à l'endroit, puis à
l'envers, en vidéo qui boucle pour Instagram, les Reels ou TikTok : carrée, verticale ou
horizontale, avec une marge de la couleur de votre choix.

La boucle se joue en direct sur un canvas pendant que vous la réglez, et la vidéo n'est
encodée qu'à l'export. Les photos sont décodées, redressées d'après leur EXIF et cadrées
en parallèle dans des workers, puis ffmpeg, compilé en WebAssembly, les encode dans un
autre worker en H.264 que les applis acceptent sans broncher. C'était au départ un
script Python ; aujourd'hui rien n'est envoyé nulle part, et vos photos ne quittent
jamais votre téléphone.

Le cheval en haut de cette page, c'est *Sallie Gardner au galop* : onze photos
qu'Eadweard Muybridge a prises en 1878 avec une rangée d'appareils que la jument
déclenchait en passant, l'une des premières rafales jamais prises, passées dans
Boomerang.

<p class="stack"><span>Astro</span><span>React</span><span>TypeScript</span><span>ffmpeg.wasm</span><span>Web Workers</span></p>
