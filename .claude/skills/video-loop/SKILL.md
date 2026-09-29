---
name: video-loop
description: Transformer une vidéo de generations/ en boucle perpétuelle sans raccord, localement et gratuitement avec ffmpeg — recherche d'un point de coupe franche, mélange sur demi-période ou fondu localisé, mesure du raccord, et sidecar du rendu dérivé. À utiliser dès qu'une vidéo doit boucler (fond animé, wallpaper, GIF), ou avant de générer une vidéo destinée à boucler, pour choisir la quantité de mouvement à demander.
---

# Boucle vidéo sans raccord

Fabrique une boucle à partir d'une vidéo **déjà générée**, quel que soit le service qui l'a
produite. Tout se passe en local avec `ffmpeg` : aucun crédit, résultat déterministe,
source intacte. Seul prérequis : `ffmpeg` (et `python3` pour la recherche de coupe, sans
dépendance externe).

Tout ce qui suit a été vérifié sur pièces entre le 2026-08-31 et le 2026-09-01.

---

## Avant de générer la source

La boucle se prépare dès le prompt. Deux règles, apprises à nos dépens :

- **Ne jamais demander la boucle au modèle.** Passer la même image en première et dernière
  frame, ou écrire « *ending in exactly the same state it began* », **gèle** la vidéo : le
  modèle prend le chemin le plus court, c'est-à-dire ne rien bouger. Une seule frame de
  départ, mouvement libre, et le raccord se fabrique ici. (Détail et mesures : leçons 1 et 2
  de la skill `kie-ai`.)
- **Demander un mouvement lent et continu.** C'est la quantité totale de mouvement qui
  décide si le clip se mélangera proprement — voir « Ce qui gouverne la qualité ».

---

## Choisir la méthode

```bash
S=.claude/skills/video-loop/scripts
```

**1. Chercher d'abord une coupe franche.** Sur un mouvement quasi-périodique il peut exister
deux images très ressemblantes, et une coupe nette vaut toujours mieux qu'un mélange :

```bash
python3 $S/find-loop-point.py source.mp4
```

Il compare le MSE de la meilleure paire à celui de deux images consécutives. **Si le
rapport dépasse ~10×, il n'y a pas de point de coupe** — c'est le cas de tout flux
turbulent (fumée, flammes, poussière, disque d'accrétion), qui ne repasse jamais par un
état antérieur. Il faut alors mélanger, et il y a deux façons de le faire.

**2. `halfperiod-loop.sh` — à préférer.**

```bash
$S/halfperiod-loop.sh source.mp4 sortie.mp4 [ralenti]
```

Mélange la première moitié du clip avec la seconde par une rampe linéaire. Le rebouclage
enchaîne alors deux images **consécutives** de la source : **il n'y a aucune transition
localisée, nulle part**. La durée est divisée par deux, et l'image est en permanence une
superposition de deux états — invisible sur une texture diffuse, visible sur des arêtes
franches.

Le paramètre `ralenti` (interpolation de mouvement) **rallonge la boucle sans aggraver la
superposition** : l'écart de contenu entre les deux couches ne dépend que de la source,
jamais de la vitesse de lecture. Un clip de 15 s ralenti ×2 donne 15 s de boucle.

**3. `seamless-loop.sh` — fondu localisé.**

```bash
$S/seamless-loop.sh source.mp4 sortie.mp4 [images_de_fondu]
```

Fond les `D` dernières images sur les `D` premières et conserve presque toute la durée.
En contrepartie il subsiste une transition localisée, d'autant plus visible que le clip
est long — le fondu apparie alors des états très éloignés. À réserver aux clips courts
ou aux mouvements de faible amplitude. Il écarte l'image finale de la source si elle est
réellement dupliquée (comparaison directe des deux dernières images).

---

## Ce qui gouverne la qualité

Ce n'est pas la durée, c'est **la quantité totale de mouvement** dans le clip. Mesurer
l'écart de la paire qui sera mélangée (image 0 contre image du milieu) : au-dessus de
~0,75 de SSIM le fondu est propre, en dessous il commence à se voir. D'où la conséquence
sur le prompt : **demander explicitement une rotation lente** rend un clip long
compatible avec le mélange. Vérifié — 15 s à 0,9923 par image donnent une meilleure
paire (0,754) que 5 s à 0,983 (0,705).

---

## Vérifier le résultat : mesurer, puis regarder

Les deux scripts de mélange affichent le SSIM du raccord et celui de la pire transition
interne. Un raccord proche de la pire transition interne est invisible.

**Attention à la sur-confiance dans le SSIM.** Sur des textures diffuses (nuages, poussière,
flammes, disque d'accrétion), le SSIM pénalise un fondu bien plus que l'œil ne le perçoit.
Un raccord mesuré à 0,94 contre un plancher de 0,955 s'est révélé parfaitement propre à
l'inspection visuelle. **Mesurer sans regarder conduit à jeter de bons résultats.** Lire
la boucle plusieurs fois de suite avant de conclure.

**Vérifier le compte d'images** du fichier produit contre la valeur attendue — une boucle
qui se termine une image trop tôt reste plausible à l'œil mais n'est plus une boucle :

```bash
ffprobe -v error -count_frames -select_streams v:0 \
  -show_entries stream=nb_read_frames -of csv=p=0 sortie.mp4
```

(`nb_frames` sans `-count_frames` peut mentir.)

Dans un profil SSIM image par image, le `1.000000` final est un **artefact** de la mesure
(ffmpeg répète la dernière image du flux le plus court), pas une image dupliquée.

---

## Écrire le sidecar du rendu dérivé

La boucle est un **nouveau fichier** dans `generations/`, jamais un écrasement de la source
(règle de [CLAUDE.md](../../../CLAUDE.md)). Son sidecar :

- `cost: 0` — **ne jamais recompter le coût de la source**, le total du mur et la page des
  dépenses compteraient deux fois le même paiement. Garder la `currency` de la source.
- `service` et `model` — **ceux de la source, tels quels.** L'étape ffmpeg n'appartient ni
  à l'un ni à l'autre : `"kling-3.0-omni/image-to-video + mélange (ffmpeg)"` fabrique un
  modèle fantôme dans les facettes.
- `prompt` — repris de la source, pour que la boucle reste trouvable par la recherche.
- `width` / `height` / `duration` — **obligatoires**, lus avec `ffprobe` sur le fichier
  produit (la durée n'est plus celle de la source).
- Champs propres à la boucle, conservés dans « Autres métadonnées » : `source_file`,
  `loop_method` (méthode et script, ex. `"halfperiod, .claude/skills/video-loop/scripts/halfperiod-loop.sh"`),
  `slowdown`, `frames`, `fps`, `seam_ssim`, `seam_ssim_worst_internal`, `verdict`.
- `notes` — la méthode retenue, pourquoi (échec de la coupe franche, rapport MSE…), et un
  lien vers la source : `[[nom-de-la-source-sans-extension]]`.
- `tags` — ceux de la source, plus `loop`.

---

## Pièges ffmpeg

Tous rencontrés en écrivant les scripts ; aucun ne produit d'erreur.

- **`$VAR:e` est un modificateur zsh.** Dans un filtre ffmpeg,
  `start_frame=$S:end_frame=$E` est mangé silencieusement. **Toujours accolader :
  `${S}` / `${E}`.** Les scripts sont en `bash` pour cette raison, entre autres.
- **Dans le filtre `blend`, la variable `N` commence à 1, pas à 0.** Une rampe écrite
  `N/(D-1)` ne vaut donc jamais 0 au début et dépasse 1 à la fin : les deux extrémités du
  fondu restent polluées, et le raccord se dégrade sans que rien ne le signale. Écrire
  `(N-1)/(D-1)`. Vérifiable en une commande — `blend=all_expr='N*10'` en sortie
  `yuv420p` brute donne 10, 20, 30… et non 0, 10, 20.
- **`concat` laisse des timestamps irréguliers.** À l'encodage en cadence fixe, ffmpeg
  supprime alors une image *sans erreur ni avertissement* — dans une boucle, c'est
  précisément la dernière du fondu, et le raccord se décale d'une image. Toujours
  renormaliser avec un `,fps=<cadence>` après le `concat`, et vérifier le compte
  d'images.
- Après un graphe de filtres, ne jamais supposer le résultat : `ffmpeg` peut réussir
  (code de sortie 0) en ayant tout supprimé. La ligne de résumé `frame= … drop=N` est à
  lire.
