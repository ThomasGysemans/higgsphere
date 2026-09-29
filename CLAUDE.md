# higgsphere

Mur local (bento / masonry) qui affiche **toutes les images et vidéos générées par IA**
au même endroit, la plus récente en haut, avec le prompt exact et les métadonnées de
chaque génération.

Outil strictement local : **aucun SEO, aucune analytics, aucun appel réseau sortant.**

---

## Règle centrale — le dossier `generations/`

> **Toute image et toute vidéo générée par une IA pendant une session Claude doit être
> écrite dans le dossier `generations/` à la racine du projet, accompagnée d'un fichier
> de métadonnées `.json` portant le même nom.**

Cette règle est non négociable : c'est la seule source de données du site. Un média placé
ailleurs n'apparaîtra jamais dans la galerie.

```
generations/
  2026-08-31-nebula-drift.png      ← le média
  2026-08-31-nebula-drift.json     ← ses métadonnées (même nom, extension .json)
```

Le site **détecte les nouveaux fichiers tout seul**, sans rechargement ni redémarrage :
un canal SSE (`/api/generations/stream`) surveille le dossier via `fs.watch` récursif et
la page se met à jour dans la seconde. Il ne faut donc jamais redémarrer le serveur après
avoir déposé un fichier.

### Convention de nommage du sidecar

Les deux formes sont acceptées, la première est préférée :

| Média | Sidecar |
| --- | --- |
| `nebula-drift.png` | `nebula-drift.json` (extension **remplacée**) |
| `nebula-drift.png` | `nebula-drift.png.json` (extension **ajoutée**) |

Les sous-dossiers sont autorisés et parcourus récursivement (`generations/2026-08/…`),
ce qui permet de ranger par date ou par projet. Les accents et les espaces dans les noms
de fichiers fonctionnent.

---

## Schéma du sidecar `.json`

Un objet JSON plat. **Tous les champs sont optionnels** — un média sans sidecar apparaît
quand même dans le mur — mais renseignez-en le maximum : le prompt et le coût sont la
raison d'être de cet outil.

```json
{
  "prompt": "A vast nebula drifting through deep space, volumetric dust lanes lit from within",
  "negative_prompt": "blurry, watermark, extra fingers",
  "model": "imagen-4-ultra",
  "service": "Google Vertex AI",
  "width": 1024,
  "height": 1024,
  "duration": 5,
  "cost": 0.06,
  "currency": "USD",
  "created_at": "2026-08-31T10:31:00Z",
  "seed": 774213,
  "tags": ["space", "abstract", "wallpaper"],
  "notes": "Deuxième passe, le premier rendu était trop saturé.",
  "poster": "nebula-drift-poster.jpg"
}
```

### Champs

| Champ | Type | Rôle |
| --- | --- | --- |
| `prompt` | `string` | **Le prompt exact** envoyé au modèle, sans reformulation ni troncature. Alimente la recherche et le lightbox. |
| `negative_prompt` | `string` | Prompt négatif, s'il y en a un. |
| `model` | `string` | Identifiant précis du modèle (`veo-3`, `flux-1.1-pro`, `dall-e-3`…), **et rien d'autre** : pas d'étape de post-traitement accolée. Devient une facette de filtre. |
| `service` | `string` | **Le fournisseur seul** (`OpenAI`, `Runway`, `Kie AI`…) — jamais le modèle entre parenthèses. Devient une facette de filtre, et l'axe de la page des dépenses. |
| `width` / `height` | `number` | Dimensions en pixels. **À renseigner pour les vidéos** (voir plus bas). |
| `duration` | `number` | Durée en secondes, pour les vidéos. |
| `cost` | `number` | Coût estimé de **cette génération**, exprimé dans la devise **facturée par le service** — ne le convertissez pas vous-même. Voir « Coûts et devises ». |
| `currency` | `string` | Code ISO de la devise facturée. `USD` si le champ est absent. |
| `created_at` | `string` | Date ISO 8601. À défaut, le site utilise le `mtime` du fichier. |
| `seed` | `number` \| `string` | Graine, si connue. |
| `tags` | `string[]` | Étiquettes libres. Deviennent des facettes de filtre. |
| `notes` | `string` | Contexte utile : ce qui a été tenté, pourquoi cette version a été gardée. |
| `poster` | `string` | Vignette d'une vidéo, nom de fichier voisin ou chemin relatif à `generations/`. |

`service` et `model` répondent à deux questions différentes — *qui a été payé* et *quoi a
été appelé* — et la page des dépenses les regroupe séparément. Les mélanger
(`"Kie AI (Kling 3.0 Omni)"`) fabrique un fournisseur qui n'existe pas et éclate le total
d'un même prestataire en plusieurs postes. Une étape locale qui suit la génération
(fondu, recadrage, réencodage) n'appartient ni à l'un ni à l'autre : elle va dans `notes`
ou dans un champ supplémentaire.

Tout champ **supplémentaire** (`steps`, `guidance`, `cfg`, `aspect_ratio`, `revised_prompt`…)
est conservé et affiché dans la section « Autres métadonnées » du lightbox. N'hésitez pas
à en ajouter — rien n'est perdu.

### Alias tolérés

Le scanner accepte quelques variantes courantes, pour ne pas perdre de données quand un
sidecar vient d'ailleurs : `createdAt`/`date`/`timestamp` pour `created_at`,
`estimated_cost`/`price` pour `cost`, `provider`/`platform` pour `service`,
`model_name` pour `model`, `labels` pour `tags`, et `size`/`resolution`/`dimensions`
sous la forme `"1024x1024"` à la place de `width`/`height`.

### Dimensions : ce qu'il faut renseigner

- **Images** — inutile de les fournir : le serveur lit l'en-tête du fichier
  (PNG, JPEG, GIF, WebP, AVIF/HEIC) et en déduit les dimensions exactes.
- **Vidéos** — **à renseigner**. Le serveur ne décode pas les conteneurs vidéo. Sans
  `width`/`height`, la tuile est posée en 16:9 puis corrigée dès que le navigateur a lu
  les métadonnées du fichier, ce qui provoque un léger saut de mise en page.

### Coûts et devises

`cost` est un coût **estimé**, pas une facture. Renseignez le tarif public du modèle pour
la génération concernée (par image, par seconde de vidéo, par mégapixel selon le service).
En cas de doute sur le tarif exact, mettez la meilleure estimation possible plutôt que
d'omettre le champ — le total affiché en haut du mur n'a de sens que si la couverture est
complète. Si le coût est réellement inconnu, omettez le champ : il s'affichera `—` au lieu
de fausser le total.

**Écrivez toujours le montant dans la devise facturée par le service**, avec le code
correspondant dans `currency` — le plus souvent `USD`. Ne convertissez rien à la main : le
sidecar garde la donnée d'origine, et le mur se charge de l'affichage.

**Le mur affiche tous les montants en euros.** La conversion est faite à l'affichage
seulement, à partir de la table de taux de [src/lib/currency.ts](src/lib/currency.ts).
Ces taux sont **figés dans le code** — l'outil ne fait aucun appel réseau — donc ils
dérivent avec le temps : relisez-les de temps en temps. Le lightbox affiche le montant
d'origine sous le montant converti, pour que le chiffre reste vérifiable.

Une devise absente de la table n'est jamais convertie de force : le montant est affiché
dans sa propre devise, signalé, et exclu du total, qui indique alors combien de montants
il laisse de côté. Pour couvrir une nouvelle devise, ajoutez son taux à `RATES_TO_EUR`.

---

## Supprimer une génération

Le lightbox porte un bouton **« Supprimer ce média »** en bas du panneau, dans la section
« Fichier ». Il demande une confirmation, puis supprime **définitivement** le média *et*
son sidecar — sans passer par la corbeille. Le mur retire la tuile immédiatement et le
lightbox **se ferme** : on revient au mur, sans média nouveau sous le curseur à l'endroit
où l'on vient de confirmer un effacement.

Côté serveur, `DELETE /api/generations` attend un corps `{ "file": "<chemin relatif>" }`.
La route refuse tout ce qui n'est pas un média (un sidecar seul n'est jamais une cible)
et tout chemin qui s'échappe de `generations/`.

**Le fichier part, la dépense reste.** Avant d'effacer quoi que ce soit, la route archive
le coût, la devise, la date, le fournisseur et le modèle dans le journal des dépenses
(voir plus bas). Supprimer un média ne doit jamais faire baisser le total dépensé : le
mur compte des fichiers, la page des dépenses compte des paiements.

---

## Le journal des dépenses

Fichier `generations/.higgsphere-ledger.jsonl` : le registre de **tout ce qui a été payé**.
Une génération y est inscrite **dès qu'elle apparaît dans le dossier**, pas seulement quand
on la supprime — sans quoi un `rm` dans le terminal emporterait la dépense avec le fichier.
Il commence par un point, donc le scanner du mur et le watcher SSE l'ignorent : il
n'apparaît pas dans la galerie et ne déclenche aucun rescan.

C'est un **journal d'événements** en ajout seul, jamais réécrit. Chaque ligne dit ce qui est
arrivé à une génération, et l'état courant se reconstruit en repliant les lignes dans
l'ordre :

| Événement | Écrit quand |
| --- | --- |
| `created` | un média inconnu apparaît dans `generations/` |
| `updated` | son coût, son fournisseur, son modèle ou son chemin changent |
| `deleted` | il est supprimé — `reason: "app"` depuis le lightbox, `reason: "missing"` s'il a disparu du disque tout seul |

Chaque génération porte un `id` attribué à sa naissance, stable ensuite. Le chemin ne peut
pas servir de clé : un fichier se déplace, et un même nom peut être régénéré après
suppression.

`syncLedger()` est appelé à chaque lecture de `/api/generations` et `/api/spend` — toute
consultation du mur tient donc le journal à jour. Les points qui comptent :

- **Le sidecar prime tant que le média existe.** C'est la donnée éditable ; le journal ne
  prend le relais que quand le fichier n'est plus là. Un prix corrigé à la main dans un
  `.json` produit un `updated`, il n'est jamais écrasé par l'historique.
- **Un sidecar écrit après son média** donne `created` avec `cost: null`, puis `updated`
  avec le prix. C'est le cas normal, pas une anomalie.
- **Un fichier déplacé n'est pas une nouvelle dépense** : reconnu à son nom et à sa taille,
  il donne un `updated` de chemin — pas un couple suppression + création qui compterait
  l'argent deux fois. Ranger dans `generations/2026-08/` est donc sans danger.
- **Les disparitions ne sont constatées que sur un scan complet** (`index.warnings` vide) :
  un dossier momentanément illisible produit un index partiel, et enterrer l'historique sur
  cette base serait pire que de rater un `rm`.
- **Les synchronisations sont sérialisées.** SSE, polling et deux onglets scannent en
  parallèle ; sans file d'attente, deux scans enregistreraient deux fois la même génération.
- La suppression depuis l'application écrit l'événement **avant** d'effacer. Si l'écriture
  échoue, rien n'est supprimé (`fail closed`) ; si la suppression échoue ensuite, le journal
  est tronqué à sa taille précédente, pour qu'un média encore visible ne soit pas compté
  comme supprimé.
- Une ligne illisible est ignorée et signalée, jamais fatale. Le repli est tolérant : un
  `updated` ou un `deleted` sur une identité inconnue ouvre la génération au lieu d'échouer.
- Le journal est versionné (exception dans `.gitignore`) : c'est la seule donnée du dossier
  que rien ne régénère. Le supprimer ne perd que l'historique des générations **déjà
  effacées** — celles encore présentes se réinscrivent au scan suivant.

---

## La page des dépenses

`/stats`, accessible depuis le bouton « Dépenses » de la barre du mur. Elle lit
`GET /api/spend`, qui réunit les sidecars encore présents et le journal — donc **tout ce
qui a été payé**, que le fichier existe encore ou non.

Elle montre, dans l'ordre : le total, le coût moyen et la date de la dernière dépense, une
chronologie en barres empilées par fournisseur (par jour, ou par mois au-delà de 75 jours
d'étendue), une carte par fournisseur avec sa part du total et le détail par modèle, puis
le journal complet des dépenses groupé par date, du plus récent au plus ancien. Les couleurs de fournisseur sont attribuées par rang de dépense et ne bougent
pas quand on filtre.

Le seul filtre est le fournisseur. **Les générations supprimées ne sont pas masquables** :
c'est le fichier qui a disparu, pas le paiement — les cacher rendrait le total faux.

Les mêmes règles de devise qu'ailleurs s'appliquent : affichage en euros, montants non
convertibles exclus du total et signalés, générations sans `cost` comptées comme telles
plutôt que comme des zéros.

---

## Ce qu'il faut faire à chaque génération

1. Écrire le média dans `generations/`, avec un nom descriptif en minuscules-tirets,
   idéalement préfixé de la date : `2026-08-31-nebula-drift.png`.
2. Écrire immédiatement le sidecar `.json` du même nom, avec **au minimum**
   `prompt`, `model`, `cost` et `created_at`.
3. Ne rien redémarrer : le mur se met à jour tout seul.
4. Ne jamais écraser un média existant pour en produire une variante — créer un nouveau
   fichier, et relier les deux par `notes` ou par un `tags` commun.

---

## Lancer le projet

```bash
npm run dev      # http://localhost:5173
npm run check    # svelte-check (types)
npm run build    # build de production (adapter-node)
npm run preview  # sert le build
```

Le dossier surveillé est `./generations` par défaut ; il peut être déplacé via la variable
d'environnement `GENERATIONS_DIR` (chemin absolu).

---

## Architecture

| Chemin | Rôle |
| --- | --- |
| [src/lib/server/scan.ts](src/lib/server/scan.ts) | Parcourt `generations/`, associe médias et sidecars, construit l'index et les facettes. |
| [src/lib/server/probe.ts](src/lib/server/probe.ts) | Lit les dimensions dans l'en-tête des images (PNG, JPEG, GIF, WebP, AVIF/HEIC). |
| [src/routes/api/generations/+server.ts](src/routes/api/generations/+server.ts) | `GET` de l'index complet en JSON ; `DELETE` d'un média et de son sidecar, après archivage de sa dépense. |
| [src/lib/server/ledger.ts](src/lib/server/ledger.ts) | Journal des dépenses : écriture en ajout seul, retour arrière, relecture tolérante. |
| [src/routes/api/spend/+server.ts](src/routes/api/spend/+server.ts) | `GET` de l'index des dépenses : sidecars présents + journal des supprimées. |
| [src/routes/stats/+page.svelte](src/routes/stats/+page.svelte) | Page des dépenses : totaux, chronologie, fournisseurs, journal. |
| [src/routes/api/generations/stream/+server.ts](src/routes/api/generations/stream/+server.ts) | Flux SSE de détection des changements (`fs.watch` + anti-rebond). |
| [src/routes/media/\[...path\]/+server.ts](src/routes/media/[...path]/+server.ts) | Sert les fichiers, avec support des requêtes `Range` (indispensable aux vidéos). |
| [src/lib/currency.ts](src/lib/currency.ts) | Devise d'affichage, table de taux vers l'euro, conversion. |
| [src/lib/gallery.svelte.ts](src/lib/gallery.svelte.ts) | État client : index, recherche, filtres, tri, sélection. |
| [src/lib/spend.svelte.ts](src/lib/spend.svelte.ts) | État client des dépenses : agrégats par fournisseur, par modèle, par période. |
| [src/lib/components/Masonry.svelte](src/lib/components/Masonry.svelte) | Répartition en colonnes (4 → 3 → 2 → 1). |
| [src/lib/components/Tile.svelte](src/lib/components/Tile.svelte) | Tuile : ratio préservé, lecture vidéo au survol. |
| [src/lib/components/Lightbox.svelte](src/lib/components/Lightbox.svelte) | Vue agrandie + prompt + métadonnées. |

---

## Conventions de code

- **Svelte 5 en mode runes** (`$state`, `$derived`, `$props`, `$effect`). Pas de syntaxe
  legacy : les événements s'écrivent `onclick`, pas `on:click`.
- **Commentaires et textes d'interface en français.** Les identifiants, noms de champs
  JSON et termes techniques restent en anglais.
- **SSR désactivé** ([src/routes/+layout.ts](src/routes/+layout.ts)) : l'outil lit le
  disque à la demande, et le rendu client évite de partager le store entre requêtes.
  Conséquence : le navigateur reçoit un document vide, donc
  [src/app.html](src/app.html) porte un `<meta name="color-scheme">` et un fond en style
  inline **avant** le placeholder de tête. Les retirer ramène un flash blanc à chaque
  rechargement. Attention aussi : n'écrivez jamais le littéral du placeholder de tête
  ailleurs dans ce fichier, commentaires compris — SvelteKit n'en substitue que la
  première occurrence, et le vrai placeholder resterait alors non remplacé, sans erreur
  mais sans feuille de style en production.
- **CSS scopé dans les composants**, variables de thème dans
  [src/app.css](src/app.css). Pas de framework CSS.
- **Aucune dépendance runtime** hors SvelteKit : les parsers d'en-tête et la masonry sont
  écrits à la main, volontairement.
- Toute boucle qui parcourt un fichier binaire doit être **bornée** — un média corrompu ne
  doit jamais pouvoir figer le serveur.
- L'endpoint `/media` ne doit jamais servir un fichier hors de `generations/` : la
  vérification de préfixe après `path.resolve` est un invariant de sécurité.

### Comportements à préserver

Ces points sont des exigences produit, pas des détails d'implémentation :

- **Rien n'est rogné ni déformé.** Le ratio ne sert qu'à réserver la place ; le média est
  en `object-fit: contain` et le vrai ratio est réappliqué dès le chargement.
- **Le plus récent est en haut**, et les tuiles se lisent de gauche à droite.
- **Les vidéos démarrent en silence au survol** et s'arrêtent en revenant à zéro à la
  sortie ; les images restent statiques.
- **Le clic hors du lightbox le ferme** (Échap aussi ; ← / → naviguent).
- **Un sidecar illisible ne casse rien** : le média reste affiché, l'erreur est signalée.
- **Aucun flash au rechargement** : le fond est peint dès la première frame, et l'état
  initial du store est « chargement » — un état neutre ferait clignoter l'écran
  « le mur est vide » avant l'arrivée des données.
- **La suppression demande toujours une confirmation explicite.** Elle est définitive —
  le fichier ne passe pas par la corbeille — et emporte le sidecar avec le média.
- **Une dépense ne disparaît jamais.** Supprimer un média retire une tuile du mur, pas un
  euro du total dépensé. Le prix est inscrit au journal dès l'apparition du fichier, et la
  route `DELETE` réécrit l'état final **avant** d'effacer : cet ordre est un invariant.
- **Un fournisseur est une société facturée, pas un couple fournisseur+modèle.** La page des
  dépenses groupe sur `service` ; y glisser le modèle éclate le total d'un même prestataire
  entre plusieurs postes fantômes.
- **Le bouton « copier » du prompt n'apparaît que s'il y a un prompt.** Plus généralement,
  aucune action ne doit être proposée sur une donnée absente.
- **Les montants s'affichent en euros, la donnée reste dans sa devise d'origine.** Un total
  ne doit jamais additionner des devises différentes, ni inclure un montant qu'aucun taux
  ne permet de convertir sans le signaler.
