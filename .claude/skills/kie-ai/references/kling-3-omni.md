# Kling 3.0 Omni — tarifs, schémas, contraintes

Relevé du 2026-08-31 sur `https://kie.ai/kling-o3` et `https://docs.kie.ai/market/kling/`.
Le modèle est aussi commercialisé sous les noms **Kling O3** et **Kling VIDEO 3.0 Omni**.

## Capacités

Références multimodales (texte, images, vidéos, « éléments » réutilisables), audio natif,
personnages cohérents, narration multi-plans, **jusqu'à 15 secondes** par génération.

Face à Kling VIDEO O1 : audio natif et multi-plans sur tous les modes, référence par
élément vidéo, contrôle de la voix des éléments, durée 10 s → 15 s.

---

## Tarifs — crédits par seconde ($0,005 le crédit)

### `text-to-video` et `image-to-video`

| Résolution | Sans audio | Avec audio natif |
| --- | --- | --- |
| 720p | 14 cr/s — $0,070/s | 18 cr/s — $0,090/s |
| 1080p | 18 cr/s — $0,090/s | 23 cr/s — $0,115/s |
| 4K | 67 cr/s — $0,335/s | 67 cr/s — $0,335/s |

### `reference-to-video`

| Résolution | Sans audio | Avec audio | Avec entrée vidéo |
| --- | --- | --- | --- |
| 720p | 14 cr/s | 18 cr/s | 20 cr/s |
| 1080p | 18 cr/s | 23 cr/s | 27 cr/s |
| 4K | 67 cr/s | 67 cr/s | 67 cr/s |

### `transformation` (vidéo source obligatoire)

720p : 20 cr/s · 1080p : 27 cr/s · 4K : 67 cr/s

> En 4K, l'audio est gratuit — le tarif est plat à 67 cr/s dans tous les cas.
> Les recharges de gros montants donnent +10 % de crédits bonus, soit un prix effectif
> ~10 % inférieur aux montants ci-dessus.

### Coûts fréquents

| | 720p | 1080p | 4K |
| --- | --- | --- | --- |
| 3 s sans audio | 42 cr — $0,21 | 54 cr — $0,27 | 201 cr — $1,01 |
| 5 s sans audio | 70 cr — $0,35 | **90 cr — $0,45** | 335 cr — $1,68 |
| 10 s sans audio | 140 cr — $0,70 | 180 cr — $0,90 | 670 cr — $3,35 |
| 15 s sans audio | 210 cr — $1,05 | 270 cr — $1,35 | 1005 cr — $5,03 |

---

## Endpoints

| Rôle | Méthode et URL |
| --- | --- |
| Créer une tâche | `POST https://api.kie.ai/api/v1/jobs/createTask` |
| Suivre une tâche | `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=…` |
| Solde | `GET https://api.kie.ai/api/v1/chat/credit` |
| Upload de fichier | `POST https://kieai.redpandaai.co/api/file-stream-upload` |

Authentification : en-tête `Authorization: Bearer <KIE_API_KEY>` sur tous les appels,
y compris l'upload.

### Corps de `createTask`

```json
{
  "model": "kling-3.0-omni/image-to-video",
  "callBackUrl": "https://…/callback",
  "input": { }
}
```

`callBackUrl` est optionnel et inutilisable en local (il faut un endpoint public) :
sonder `recordInfo` à la place.

### États de `recordInfo`

`waiting` → `queuing` → `generating` → `success` | `fail`

Champs utiles : `state`, `creditsConsumed` (**renseigné dès `waiting`**), `costTime`
(secondes), `failCode`, `failMsg`, `resultJson` (`{"resultUrls":[…]}`).

---

## Schéma `input` — `image-to-video`

Deux variantes exclusives, distinguées par la taille de `image_urls`.

| Champ | Type | Contraintes |
| --- | --- | --- |
| `prompt` | string | **requis**, ≤ 3072 caractères, non vide après trim |
| `image_urls` | array | **requis**. **1** élément = frame de départ. **2** éléments = départ (index 0) + fin (index 1) |
| `duration` | integer | 3 à 15, **défaut 5** |
| `resolution` | string | `720p` (défaut) \| `1080p` \| `4k` |
| `aspect_ratio` | string | `auto` (défaut) — `16:9`/`9:16`/`1:1` **uniquement** si `customize_multi_shots: true` |
| `audio` | boolean | à passer explicitement |
| `customize_multi_shots` | boolean | défaut `false`. **Doit être `false`** si deux frames |
| `prefer_multi_shots` | boolean | découpage automatique. **Exclusif** avec `customize_multi_shots` |
| `multi_prompt` | array | requis si `customize_multi_shots: true`, ≤ 6 plans, chacun `{duration: 1-15, prompt: ≤512 car.}` |
| `elements` | array | ≤ 3 sujets réutilisables, référencés `@nom` dans le prompt |

### Contraintes sur les fichiers d'entrée

| | Images | Vidéos |
| --- | --- | --- |
| Formats | JPG, JPEG, PNG | MP4, QuickTime |
| Taille max | 50 Mo | 200 Mo |
| Dimensions | largeur **et** hauteur ≥ 300 px | — |
| Ratio | entre **0,4 et 2,5** | — |
| Nombre | selon le mode | exactement 1 |

### Sous-objet `elements`

```json
{
  "name": "element_dog",
  "description": "A happy golden retriever",
  "element_input_urls": ["https://…/front.png", "https://…/side.png"],
  "element_input_audio_urls": [],
  "start_time": 0,
  "end_time": 8000
}
```

`element_input_urls` : **2 à 4 images** pour un sujet multi-vues, **exactement 1 vidéo**
pour un sujet-personnage. Pas de mélange. `start_time`/`end_time` en millisecondes,
uniquement pour une vidéo, durée découpée entre 3000 et 8000 ms.

---

## Autres modes — spécificités

### `reference-to-video`

`video_urls` (0 ou 1 vidéo) et `image_urls` (jusqu'à 7 seules, **plafonné à 4** si une
vidéo est fournie). Règles de dépendance appliquées par l'interface :

- vidéo fournie → `customize_multi_shots` forcé à `false` et `aspect_ratio` forcé à `auto`
- pas de vidéo → `auto` indisponible

### `transformation`

`video_urls` obligatoire (exactement 1), `image_urls` jusqu'à 4 références.
`auto` requis pour une vidéo seule, indisponible si vidéo **et** images.

### Multi-plans (tous modes)

Maximum **6 plans**, **15 s au total**, 1 à 12 s par plan. En plan unique : 3 à 15 s.
Prompt global ≤ 3072 caractères, prompt par plan ≤ 500 (interface) / 512 (API).

---

## Ce que l'API ne fournit pas

- **Pas de `seed`** — aucune reproductibilité entre deux appels.
- **Pas de `negative_prompt`** sur ce modèle.
- Pas de contrôle de la vitesse de mouvement autrement que par le prompt.

## Limites de compte

- 20 nouvelles requêtes de génération par 10 secondes.
- Les crédits n'expirent pas.
- Une génération en échec est intégralement recréditée.
- Si la modération retire l'audio, la moitié des crédits est remboursée et **réessayer le
  même prompt échouera**.
