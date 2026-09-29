# higgsphere

[English](README.md) · **Français** · [Español](README.es.md)

Une galerie locale pour toutes les images et vidéos que vous générez avec l'IA : les plus
récentes en premier, chacune à côté du prompt exact, du modèle et du coût qui l'ont
produite. Le dépôt fournit aussi des skills Claude pour optimiser la génération.

## Pourquoi

Les médias IA finissent éparpillés entre les tableaux de bord des fournisseurs, les
dossiers de téléchargement et les historiques de conversation, et le prompt derrière un
résultat se perd presque toujours. higgsphere garde tout dans un seul dossier et l'affiche
sous forme de mur en maçonnerie, avec recherche et filtres.

L'outil est aussi pensé pour être piloté par un LLM. Plutôt que d'écrire vos prompts à la
main, vous décrivez ce que vous voulez à Claude Code (ou à un service équivalent). Il
rédige un prompt détaillé, appelle le modèle, puis enregistre le résultat avec ses
métadonnées. Comme chaque prompt reste à côté de son résultat, vous pouvez comparer les
rendus, garder les formulations qui marchent et demander au LLM d'améliorer la tentative
suivante à partir de ce que vous avez déjà.

## Installation

Nécessite Node.js 20.19+ (Vite 8).

```sh
npm install
npm run dev        # http://localhost:5173
```

Pour générer des médias depuis Claude Code, copiez `.env.example` vers `.env` et ajoutez
votre clé [Kie AI](https://kie.ai).

## Fonctionnement

### Le dossier des résultats

Le dossier `generations/` est la seule source de données du mur. Chaque image ou vidéo y
est rangée à côté d'un fichier `.json` du même nom, qui décrit comment elle a été produite :

```
generations/
  2026-08-31-nebula-drift.png
  2026-08-31-nebula-drift.json
```

```json
{
  "prompt": "A vast nebula drifting through deep space, volumetric dust lanes lit from within",
  "model": "imagen-4-ultra",
  "service": "Google Vertex AI",
  "cost": 0.06,
  "created_at": "2026-08-31T10:31:00Z"
}
```

> Les fichiers JSON peuvent contenir des métadonnées personnalisées, que le LLM renseignera.

Les nouveaux fichiers apparaissent sur le mur en moins d'une seconde, sans rechargement ni
redémarrage. Tous les champs sont optionnels, et les sous-dossiers sont acceptés. Le
schéma complet est dans [CLAUDE.md](CLAUDE.md), que Claude Code lit automatiquement : il
écrit donc ces fichiers correctement sans qu'on le lui dise.

### Le journal des dépenses

`generations/.higgsphere-ledger.jsonl` enregistre tout ce que vous avez payé. Une
génération y est inscrite dès qu'elle apparaît dans le dossier, et l'entrée reste après la
suppression du fichier, que vous le supprimiez depuis l'application ou avec `rm`.
Supprimer un média retire une tuile du mur mais ne fait pas baisser le total dépensé. La
page **Dépenses** (`/stats`) lit ce journal pour montrer les dépenses dans le temps, par
fournisseur et par modèle.

Le journal est en ajout seul et versionné dans git. C'est le seul fichier du dossier
qu'aucun autre ne permet de reconstruire.

### Devises

Chaque sidecar enregistre son coût dans la devise facturée par le fournisseur
(`"currency": "USD"`), et cette valeur n'est jamais réécrite. L'en-tête propose un
sélecteur de **devise d'affichage** : euro (par défaut), dollar américain ou livre
sterling. Tous les montants du mur, du lightbox et de la page Dépenses y sont convertis
au rendu, et le lightbox rappelle aussi le montant facturé d'origine.

- Les taux sont écrits en dur dans `RATES_TO_EUR`, dans
  [src/lib/currency.ts](src/lib/currency.ts), car l'outil ne fait aucun appel réseau. Ils
  vieillissent : mettez-les à jour de temps en temps.
- L'euro sert de devise pivot. Totaux, moyennes, parts et tris sont calculés en euros, et
  convertis vers la devise d'affichage seulement au formatage. La conversion étant
  linéaire, convertir un total revient à totaliser des montants convertis : changer de
  devise ne demande aucun recalcul.
- Une devise facturée absente de la table n'est jamais devinée. Le montant est affiché
  dans sa propre devise, signalé, et exclu des totaux.
- **Pour proposer une autre devise d'affichage**, ajoutez son code à `DISPLAY_CURRENCIES`.
  Le type de `RATES_TO_EUR` fait alors échouer `npm run check` tant que son taux manque.

## Langues

L'interface est disponible en **anglais, français et espagnol**. Un sélecteur de langue se
trouve dans l'en-tête de chaque page.

- **Ce qui est traduit :** l'interface elle-même (libellés, boutons, états vides, messages
  d'erreur), ainsi que le format des dates, des nombres et des pourcentages. La devise est
  un réglage séparé (voir plus haut) : changer de langue ne la modifie jamais.
- **Ce qui n'est jamais traduit :** tout ce qui vient d'un sidecar. Prompts, notes, tags,
  noms de modèles et de fournisseurs, noms de fichiers et métadonnées personnalisées
  s'affichent tels qu'ils ont été écrits.
- **Quelle langue est utilisée :** la dernière choisie dans l'en-tête (mémorisée dans le
  `localStorage` du navigateur), sinon la première langue du navigateur prise en charge,
  sinon l'anglais. La langue est déterminée avant le premier rendu : la page n'affiche
  jamais un instant la mauvaise langue.
- **Les messages du serveur** (avertissements de lecture, erreurs bas niveau) sont des
  diagnostics destinés aux développeurs et restent en anglais. Les erreurs qu'un
  utilisateur peut réellement rencontrer, comme un échec de suppression, portent un
  `code` que le client traduit.

Les traductions se trouvent dans [src/lib/i18n/](src/lib/i18n/). Il n'y a aucune
bibliothèque d'i18n : chaque langue est un simple objet TypeScript.

```
src/lib/i18n/
  en.ts             ← dictionnaire de référence ; son type est le contrat (Messages)
  fr.ts, es.ts      ← typés Messages
  index.svelte.ts   ← liste LOCALES + le store réactif `i18n`
  plural.ts         ← aide aux pluriels, construite sur Intl.PluralRules
```

Les composants lisent leurs textes dans `i18n.m`, par exemple `i18n.m.bar.filters`. `m`
est dérivé de la langue courante : en changer réaffiche tout, sans rechargement.

### Ajouter un texte

1. Ajoutez-le à [`en.ts`](src/lib/i18n/en.ts). C'est ce fichier qui définit le type
   `Messages`.
2. Ajoutez-le à tous les autres dictionnaires. Tant que ce n'est pas fait,
   `npm run check` échoue et nomme la clé manquante.
3. Lisez-le dans un composant via `i18n.m`.

Quelques conventions gardent les traductions sûres et vérifiées par le compilateur :

- **Tout texte qui dépend d'une valeur est une fonction**, comme
  `since: (date: string) => ...`. Le compilateur vérifie alors les paramètres dans chaque
  langue.
- **Les pluriels passent par `plural()`**, défini dans [`plural.ts`](src/lib/i18n/plural.ts),
  jamais par `n > 1`. Les langues divergent : le français met 0 au singulier, l'anglais et
  l'espagnol au pluriel.
- **Le code en ligne s'écrit entre accents graves**, par exemple
  ``'Déposez vos fichiers dans `generations/`'``. Le composant `Rich` rend ces segments en
  `<code>`. Jamais de HTML dans une traduction.

### Ajouter une langue

1. Copiez `src/lib/i18n/en.ts` vers `src/lib/i18n/<code>.ts`, typez l'export `Messages`
   et traduisez les valeurs.
2. Déclarez-la dans `LOCALES`, dans [`index.svelte.ts`](src/lib/i18n/index.svelte.ts),
   avec son nom écrit dans sa propre langue (`Deutsch`, pas `Allemand`).
3. Lancez `npm run check`. Une clé manquante, une clé en trop ou un paramètre mal typé
   fait échouer la vérification.
4. Traduisez aussi ce README, sous le nom `README.<code>.md`, et ajoutez-le aux liens en
   tête de chaque README.

## Skills

Les skills Claude Code de [.claude/skills/](.claude/skills/) s'occupent de la génération
à votre place :

- [`kie-ai`](.claude/skills/kie-ai/SKILL.md) transforme une description en prompt
  détaillé, génère des images ou des vidéos via Kie AI (Kling, Veo, Seedream, Nano
  Banana…) et enregistre le résultat et son fichier `.json` dans `generations/`. Elle
  estime d'abord le coût et ne dépense rien tant que vous n'avez pas répondu
  `kie ok <crédits>`. Un hook le garantit.
- [`video-loop`](.claude/skills/video-loop/SKILL.md) transforme une vidéo générée en boucle
  sans raccord. Elle tourne en local avec `ffmpeg` et ne coûte donc rien.

## Contribuer

- **Ajouter un fournisseur :** écrivez une skill dans `.claude/skills/` qui se termine en
  enregistrant le média et son sidecar dans `generations/`. Le mur n'a besoin d'aucune
  modification.
- **Modifier l'interface :** c'est du SvelteKit avec les runes de Svelte 5.
  [CLAUDE.md](CLAUDE.md) associe chaque fichier à son rôle. Tout texte visible passe par
  les dictionnaires de [src/lib/i18n/](src/lib/i18n/), jamais en dur dans un composant.
- **Rester local :** aucune dépendance runtime hors SvelteKit, et aucun appel réseau
  sortant. Les taux de change sont figés dans [src/lib/currency.ts](src/lib/currency.ts) :
  mettez-les à jour de temps en temps.
- Lancez `npm run check` avant d'ouvrir une PR.
