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

Les coûts sont enregistrés dans la devise facturée par le fournisseur. L'en-tête permet
d'afficher tous les montants en euros, en dollars américains ou en livres sterling,
convertis avec des taux fixes.

## Langues

L'interface est disponible en anglais, en français et en espagnol ; la langue se choisit
dans l'en-tête. Seule l'interface est traduite : prompts, notes, tags et tout ce qui vient
d'un sidecar s'affichent tels qu'ils ont été écrits.

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
  [CLAUDE.md](CLAUDE.md) associe chaque fichier à son rôle.
- **Rester local :** aucune dépendance runtime hors SvelteKit, et aucun appel réseau
  sortant. Les taux de change sont figés dans [src/lib/currency.ts](src/lib/currency.ts) :
  mettez-les à jour de temps en temps.
- Lancez `npm run check` avant d'ouvrir une PR.
