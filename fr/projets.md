---
layout: page
lang: fr-FR
title: Projets
permalink: /fr/projets/
---

<p class="langbar"><a href="{{ '/fr/' | relative_url }}">À propos</a> · <a href="{{ '/fr/cv/' | relative_url }}">CV</a> · <a href="{{ '/fr/publications/' | relative_url }}">Publications</a> · <a class="here" href="{{ '/fr/projets/' | relative_url }}">Projets</a></p>

## diapason

*Votre propre radio, diffusée depuis un téléphone.*

<div class="deploys">
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

## Ravitools

<div class="deploys">
<span><a href="https://github.com/theotaburet/Ravitools">Source</a> <em class="env">GitHub</em></span>
</div>

Ravitools enrichit les fichiers GPX avec des points d'intérêt hors ligne (eau,
ravitaillement, campings) pour les cyclistes au long cours, qui perdent le réseau
exactement là où ils ont le plus besoin de savoir où est le prochain robinet.

<p class="stack"><span>Python</span><span>GPX</span><span>OpenStreetMap</span></p>

## Stéganographie naturelle dans le domaine JPEG

*Travaux de thèse, 2017-2020*

Un schéma d'insertion qui modélise le bruit de capteur d'un appareil photo, pour qu'une
charge cachée soit statistiquement indiscernable du bruit photonique qui était déjà là.
Ces travaux établissent une forme close de la matrice de covariance du signal stégo dans
le domaine DCT, et atteignent une sécurité élevée (P<sub>E</sub> ≥ 40 %) à plus de
2 bpnzAC.

<p class="stack"><span>Python</span><span>MATLAB</span><span>DCT</span><span>Stéganalyse</span></p>

Le schéma découpe les coefficients DCT en quatre réseaux entrelacés et insère dedans
dans l'ordre, de sorte que chaque réseau puisse être conditionné par ceux déjà écrits.
Survolez une case pour voir ce dont elle dépend :

<div id="dct-grid" data-hint="Survolez une case pour voir tout ce dont elle dépend." data-legend="indépendant|dépend de A|dépend de A, B|dépend de A, B, C"></div>
<script src="{{ '/assets/js/block-dependency-grid.js' | relative_url }}"></script>

Les articles sont sur la page [publications]({{ '/fr/publications/' | relative_url }}).
