---
name: kie-ai
description: Générer des images et des vidéos via l'API Kie AI (Kling 3.0 Omni, Veo, Seedream, Nano Banana…), prédire le coût en crédits avant de payer, et déposer le résultat dans generations/ avec son sidecar. À utiliser dès qu'il faut produire un média IA pour ce projet, estimer une dépense en crédits, ou contrôler la qualité d'une vidéo générée. Pour boucler une vidéo, voir la skill video-loop.
---

# Kie AI — génération de médias pour higgsphere

Kie AI est un revendeur d'API multi-modèles (Kling, Veo, Seedream, Suno, Nano Banana…).
La clé est dans `.env`, variable `KIE_API_KEY`. **Ne jamais l'afficher dans une sortie.**

Tout ce qui suit a été vérifié sur pièces le 2026-08-31. Les tarifs et les schémas
peuvent bouger : en cas de doute, relire la doc du modèle (voir « Sources » en bas).

---

## Règle numéro un : aucune dépense sans le « kie ok » de l'utilisateur

**Aucun crédit ne se dépense sans une confirmation explicite, tapée par l'utilisateur
lui-même** : un message contenant `kie ok <crédits>` (ex. `kie ok 90`). Il accorde un
budget plafonné, valable 30 minutes, qui se débite à chaque `create` / `run` et remplace
tout budget précédent. `kie stop` le révoque.

Ce n'est pas une consigne, c'est une barrière :
[.claude/hooks/kie-guard.py](../../hooks/kie-guard.py) refuse toute commande payante sans
budget suffisant (hook `PreToolUse`), et `kie.sh` débite le budget juste avant
`createTask` — sans budget, il refuse aussi. Une réponse via `AskUserQuestion`, un « oui »
ou une permission accordée à l'outil **ne suffisent pas** : seul le message de
l'utilisateur est lu.

Le déroulé, à chaque génération :

1. Écrire le payload, puis `kie.sh estimate payload.json` (local, gratuit) et
   `kie.sh credits` (solde).
2. Annoncer à l'utilisateur ce qui va être généré et **le coût en crédits, USD et EUR**,
   puis lui demander de répondre `kie ok <crédits>`. S'arrêter là.
3. Seulement après son message : `kie.sh run payload.json generations/xxx.mp4`.
   Plusieurs tirages : un appel littéral par commande, dans la limite du budget.

Le garde-fou refuse aussi, sans exception : la lecture de `.env` ou de `KIE_API_KEY`, tout
appel direct à l'API (curl, script maison), les boucles et chemins non littéraux autour de
`kie.sh run`, et toute modification de lui-même, de `kie.sh` qui retirerait le débit, ou
des hooks de `.claude/settings.json`. **Ne jamais chercher à le contourner** : s'il bloque
à tort, le dire à l'utilisateur, qui peut l'éditer lui-même.

Un modèle absent de sa table de tarifs (`estimate` répond « non estimable ») consomme
**tout** le budget en un appel : le plafond n'est alors plus garanti, seulement « un appel
par confirmation ». Ajouter son tarif à la table dès qu'il est connu.

Un budget débité n'est jamais rendu, même si `createTask` échoue ensuite : redemander.

## Prédire le coût avant de payer

`creditsConsumed` est calculé **à la soumission**, à partir des seuls paramètres
(durée × résolution × audio). Le coût est donc entièrement prévisible — il n'y a aucune
excuse pour découvrir la facture après coup. Annoncer le montant en crédits, en USD et
en EUR **avant** d'appeler `createTask`, et vérifier le solde d'abord :

```bash
.claude/skills/kie-ai/scripts/kie.sh estimate payload.json
.claude/skills/kie-ai/scripts/kie.sh credits
```

**1 crédit = $0,005.** Conversion en euros avec le taux de
[src/lib/currency.ts](../../../src/lib/currency.ts) (`RATES_TO_EUR.USD`), jamais un taux inventé.

> **Le piège qui coûte cher** : `duration` vaut **5 par défaut** dans le schéma. Un appel
> qui omet le champ paie 5 secondes. Toujours le passer explicitement.

Une génération **en échec n'est pas facturée** (le solde est recrédité en une minute).

---

## Le pipeline, en cinq étapes

Le script `scripts/kie.sh` encapsule les quatre premières.

```bash
S=.claude/skills/kie-ai/scripts

$S/kie.sh credits                              # 1. solde avant dépense
$S/kie.sh upload mon-image.jpg                 # 2. → URL publique temporaire
$S/kie.sh estimate payload.json                # → annoncer, attendre « kie ok N »
$S/kie.sh run payload.json generations/xxx.mp4 # 3+4+5. crée, attend, télécharge
```

`run` affiche l'état, les crédits consommés et le temps de génération. Il refuse de
télécharger si la tâche a échoué.

Ensuite, **écrire le sidecar `.json`** (voir plus bas) — sans quoi le média apparaît dans
le mur mais sans prompt ni coût, ce qui vide l'outil de son intérêt.

> **La vidéo doit boucler ?** Lire la skill `video-loop` **avant** de composer le prompt :
> la boucle se fabrique en post, mais sa qualité dépend de la quantité de mouvement
> demandée ici. Un clip mal prompté se paie, puis ne se boucle pas.

### Pourquoi passer par l'upload

L'API n'accepte que des URL (`^(https?|oss)://`), jamais de fichier local ni de base64
dans `image_urls`. L'endpoint d'upload est sur un **autre hôte** que l'API de génération :
`https://kieai.redpandaai.co/api/file-stream-upload`.

**Les URL sont temporaires des deux côtés** — celle de l'upload comme celle du résultat.
Télécharger le média immédiatement ; ne jamais référencer une URL Kie depuis le sidecar
comme si elle était pérenne.

---

## Modèle de référence : Kling 3.0 Omni

Quatre modes, quatre identifiants :

| Identifiant | Entrée | Usage |
| --- | --- | --- |
| `kling-3.0-omni/text-to-video` | prompt seul | création ex nihilo |
| `kling-3.0-omni/image-to-video` | 1 image (départ) **ou** 2 (départ + fin) | **animer une image existante** |
| `kling-3.0-omni/reference-to-video` | jusqu'à 7 images et/ou 1 vidéo | recomposer une scène à partir de références |
| `kling-3.0-omni/transformation` | 1 vidéo source + jusqu'à 4 images | transformer une vidéo |

**Pour animer une image en préservant son cadrage, c'est `image-to-video`.**
`reference-to-video` reconstruit une scène et ne garantit ni la composition ni les dimensions.

Tarifs, schémas complets, contraintes de fichiers et limites : [references/kling-3-omni.md](references/kling-3-omni.md).

---

## Leçons durement acquises

Chacune a été payée. Les relire avant de composer un appel.

### 1. Première frame = dernière frame **gèle** la vidéo

Passer deux fois la même image dans `image_urls` pour obtenir une boucle parfaite est une
fausse bonne idée : face à « pars de X, arrive à X », le modèle prend le chemin le plus
court, c'est-à-dire ne rien bouger. Mesuré : SSIM 0,9998 entre images consécutives sur
tout le clip, et 1,000000 sur les deux dernières. 70 crédits perdus.

**Ne jamais demander la boucle au modèle.** Une seule frame de départ, mouvement libre,
et le raccord se fabrique en post avec la skill `video-loop` — gratuitement et de façon
déterministe.

### 2. Le prompt peut renforcer l'immobilité

La formule « *ending in exactly the same state it began, so the clip loops seamlessly* »
s'additionne à la contrainte des deux frames et aggrave le gel. Dans un prompt qui vise
du mouvement, **exiger l'amplitude** (« *completing a clearly visible arc of their orbit* »)
et ne jamais évoquer un retour à l'état initial.

### 3. Il n'y a pas de `seed`

Le schéma n'expose aucune graine : deux appels identiques donnent deux résultats
différents, et **un test en 720p ne peut pas être « rejoué » en 1080p**. Un test basse
résolution valide le *prompt*, jamais le rendu.

Conséquence sur la façon de dépenser : la bonne stratégie est **plusieurs tirages, on
garde le meilleur**, pas un appel unique peaufiné. Et comme l'écart 720p → 1080p n'est que
de 4 crédits par seconde, un palier de test 720p ne se justifie que pour valider un prompt
neuf — pas pour économiser.

### 4. Le profil SSIM se termine par un `1.000000` qui est un **artefact**

La mesure du mouvement compare le flux décalé d'une image au flux d'origine. Les deux
n'ont pas la même longueur, et ffmpeg répète la dernière image pour la comparaison
finale : **le dernier `1.000000` de la liste ne signale donc pas une image dupliquée.**

Cette valeur m'a fait conclure à tort à un doublon figé en fin de rendu, dans deux clips
qui n'en avaient pas. Pour vérifier un doublon, **extraire les deux dernières images et
les comparer directement**.

### 5. `aspect_ratio` n'est pas libre

`16:9`, `9:16` et `1:1` ne sont acceptés **que si `customize_multi_shots: true`**.
Sinon il faut `auto` — ce qui est justement ce qu'on veut pour préserver les dimensions
de l'image source. Avec deux frames, `customize_multi_shots` **doit** valoir `false`,
donc `aspect_ratio` **doit** valoir `auto`.

### 6. L'audio a un coût, et une modération

`audio: true` fait passer le 1080p de 18 à 23 crédits/s. Si la modération retire l'audio
(vidéos avec bébés ou grossièretés), la moitié des crédits est remboursée et **réessayer
le même prompt échouera**. Pour ce projet, `audio: false` par défaut.

### 7. Débit limité

20 nouvelles requêtes de génération par tranche de 10 secondes, par compte. Lancer des
tirages en parallèle est possible, mais pas en rafale illimitée.

---

## Contrôle qualité : mesurer, puis regarder

Ne jamais livrer une vidéo sans l'avoir mesurée **et** regardée. Les deux, dans cet ordre,
et sans laisser la mesure trancher seule.

**Le mouvement a-t-il eu lieu ?** SSIM entre images consécutives :

```bash
ffmpeg -y -i clip.mp4 -i clip.mp4 -lavfi \
  "[0:v]trim=start_frame=1,setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]ssim=stats_file=-" \
  -f null - 2>/dev/null | sed 's/.*All://;s/ .*//'
```

Repères mesurés sur ce projet : **≈ 0,9998 = clip figé** (échec) ; **≈ 0,98 = mouvement
franc**. Ignorer le `1.000000` final, c'est un artefact (voir leçon 4).

**La caméra a-t-elle bougé ?** Extraire la première et la dernière image et les comparer
à l'œil sur des repères immobiles (un point brillant, un bord net). Une carte de
différence amplifiée aide :

```bash
ffmpeg -v error -y -i f0.png -i f120.png \
  -lavfi "blend=all_mode=difference,format=gray,lutyuv=y=clip(val*14\,0\,255)" diff.png
```

> Ne pas amplifier avec `eq=contrast=…` : ça sature l'image en aplat et ne montre rien.

**Le SSIM ne tranche pas seul.** Sur des textures diffuses (nuages, poussière, flammes,
disque d'accrétion), il pénalise les écarts bien plus que l'œil ne les perçoit : regarder
le clip avant de le jeter.

---

## Écrire le sidecar

Voir [CLAUDE.md](../../../CLAUDE.md) pour le schéma complet. Spécificités Kie AI :

- `service` — **`"Kie AI"`, rien de plus.** Pas `"Kie AI (Kling 3.0 Omni)"` : le modèle a
  déjà son champ, et la page des dépenses groupe par fournisseur — un nom composé y crée
  un prestataire fantôme et éclate le total de Kie AI en plusieurs postes.
- `model` — l'identifiant appelé (`kling-3.0-omni/image-to-video`), sans y accoler les
  étapes locales qui suivent : elles vont dans `notes` ou dans un champ supplémentaire.
- `cost` — le montant **en USD**, jamais converti à la main : `crédits × 0,005`.
  `currency: "USD"`.
- `width` / `height` — **obligatoires**, le serveur ne décode pas les conteneurs vidéo.
  Les lire avec `ffprobe`, ne pas les supposer.
- `duration` — en secondes, réelle (`ffprobe`), pas celle demandée.
- Champs supplémentaires conservés et affichés dans « Autres métadonnées », donc les
  renseigner généreusement : `credits`, `credits_rate`, `task_id`, `resolution`,
  `aspect_ratio`, `audio`, `generation_time_s`, `reference_image`, `verdict`.
- `notes` — **y consigner ce qui a été tenté et pourquoi cette version est gardée.**
  C'est ce qui rend un échec réutilisable dans six mois.
- Relier les variantes entre elles avec `[[nom-du-fichier-sans-extension]]` dans `notes`.

Un rendu dérivé localement (boucle, recadrage, réencodage) porte `cost: 0` : **ne jamais
recompter le coût de la source**, le total du mur deviendrait faux. Pour une boucle, le
sidecar complet est décrit dans la skill `video-loop`.

---

## Pièges d'environnement

- **zsh ne découpe pas les variables en mots.** `set -- $cfg` ne marche pas ; utiliser
  `${=cfg}` ou un tableau. Les scripts de cette skill sont en `bash` pour cette raison.
- **`$VAR:e` est un modificateur zsh.** Dans un filtre ffmpeg,
  `start_frame=$S:end_frame=$E` est mangé silencieusement. **Toujours accolader :
  `${S}` / `${E}`.**
- `ffprobe` sur `nb_frames` peut mentir ; pour un compte fiable, `-count_frames` et
  `nb_read_frames`.

Les pièges propres aux graphes de filtres ffmpeg (`blend`, `concat`, images supprimées
en silence) sont dans la skill `video-loop`.

---

## Sources

- Doc d'un modèle : `https://docs.kie.ai/market/kling/v3-omni-<mode>.md`
  (la version `.md` rend le schéma OpenAPI complet, la page HTML non).
- Index de toute la doc : `https://docs.kie.ai/llms.txt`
- Les pages marketing `https://kie.ai/<modèle>` renvoient **403 à WebFetch** ; passer par
  `curl` avec un User-Agent de navigateur. Les tarifs par sous-modèle y sont dans le
  payload JSON de l'app, champ `pricingDesc` — invisible à l'œil sur la page rendue.
