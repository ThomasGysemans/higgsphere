# higgsphere

Mur local qui rassemble **toutes les images et vidéos générées par IA** en un seul endroit :
disposition masonry, la plus récente en haut, avec le prompt exact et les métadonnées de
chaque génération.

- **Masonry en colonnes** — 4 colonnes, puis 3, 2 et 1 en réduisant la fenêtre. Chaque tuile
  garde ses proportions : rien n'est rogné ni déformé.
- **Vidéos au survol** — lecture silencieuse à l'entrée du pointeur, arrêt et retour à zéro
  à la sortie. Les images restent statiques.
- **Lightbox** — clic sur une tuile pour l'agrandir avec le prompt, le modèle, les
  dimensions, le poids, le coût estimé, la date, la graine et les tags. Clic à l'extérieur
  ou Échap pour fermer, ← / → pour naviguer.
- **Recherche et filtres** — recherche plein texte (prompt, modèle, service, tags, nom de
  fichier), avec phrases entre `"guillemets"` ; filtres par type, modèle, service et tag ;
  tri par date, coût ou poids.
- **Détection en direct** — déposez un fichier dans `generations/`, il apparaît dans la
  seconde, sans rechargement.
- **Suppression** — depuis le lightbox, après confirmation ; le média et son sidecar sont
  supprimés définitivement du disque.
- **Coûts en euros** — les sidecars gardent le montant dans la devise facturée (USD le plus
  souvent), le mur convertit à l'affichage et montre le montant d'origine à côté. Les taux
  sont figés dans [src/lib/currency.ts](src/lib/currency.ts), à ajuster de temps en temps.

## Démarrer

```sh
npm install
npm run dev
```

Puis ouvrez http://localhost:5173.

Pour voir le mur peuplé immédiatement (nécessite `ffmpeg`) :

```sh
bash scripts/seed-demo.sh
```

## Déposer des générations

Tout se passe dans `generations/` : le média, plus un fichier `.json` du même nom qui porte
le prompt et les métadonnées.

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
  "created_at": "2026-08-31T10:31:00Z",
  "tags": ["space", "abstract"]
}
```

Le schéma complet, les alias tolérés et les conventions sont décrits dans
[CLAUDE.md](CLAUDE.md).

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production (adapter-node) |
| `npm run preview` | Sert le build |
| `npm run check` | Vérification des types (svelte-check) |

Le dossier surveillé est `./generations` ; il peut être déplacé avec la variable
d'environnement `GENERATIONS_DIR` (chemin absolu).

## Portée

Outil strictement local : pas de SEO, pas d'analytics, aucun appel réseau sortant. Aucune
dépendance runtime en dehors de SvelteKit — les parsers d'en-tête d'image et la disposition
masonry sont écrits à la main.
