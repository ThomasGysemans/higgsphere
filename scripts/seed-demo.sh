#!/usr/bin/env bash
# Remplit ./generations d'un jeu de démonstration (médias + sidecars) pour
# éprouver le mur : formats, ratios et métadonnées variés. Nécessite ffmpeg.
# Usage : bash scripts/seed-demo.sh [dossier]
set -euo pipefail

command -v ffmpeg >/dev/null || { echo "ffmpeg est requis" >&2; exit 1; }

G="${1:-generations}"
mkdir -p "$G"
q() { ffmpeg -y -loglevel error "$@"; }

img() { # nom, source lavfi
  q -f lavfi -i "$2" -frames:v 1 -update 1 "$G/$1"
}

img "nebula-drift.png"      "gradients=s=1024x1024:n=4:seed=7:d=1"
img "portrait-oracle.jpg"   "mandelbrot=s=832x1216:maxiter=200"
img "wide-horizon.webp"     "gradients=s=1536x640:n=3:seed=21:d=1"
img "cell-bloom.png"        "cellauto=s=768x768:rule=110"
img "test-card.png"         "smptebars=s=1200x900"
img "life-study.png"        "life=s=640x900:mold=10:r=12"

q -f lavfi -i "testsrc2=s=1280x720:r=24:d=5"   -c:v libx264 -pix_fmt yuv420p "$G/kinetic-grid.mp4"
q -f lavfi -i "mandelbrot=s=720x1280:r=24" -t 4 -c:v libvpx-vp9 -b:v 1M       "$G/vertical-fractal.webm"
q -f lavfi -i "gradients=s=1080x1080:n=5:d=6:r=24" -c:v libx264 -pix_fmt yuv420p "$G/square-flow.mp4"

meta() { printf '%s\n' "$2" > "$G/${1}.json"; }

meta "nebula-drift" '{
  "prompt": "A vast nebula drifting through deep space, volumetric dust lanes lit from within, ultra wide, cinematic",
  "model": "imagen-4-ultra",
  "service": "Google Vertex AI",
  "width": 1024, "height": 1024,
  "cost": 0.06, "currency": "USD",
  "created_at": "2026-08-30T21:14:00Z",
  "seed": 774213,
  "tags": ["space", "abstract", "wallpaper"],
  "notes": "Deuxième passe, le premier rendu était trop saturé."
}'

meta "portrait-oracle" '{
  "prompt": "Portrait of an oracle carved from obsidian, gold inlay, shallow depth of field, studio lighting",
  "negative_prompt": "blurry, extra fingers, watermark",
  "model": "flux-1.1-pro",
  "service": "Black Forest Labs",
  "size": "832x1216",
  "cost": 0.04,
  "created_at": "2026-08-31T08:02:00Z",
  "seed": "0x1f4a",
  "tags": ["portrait", "sculpture"],
  "steps": 28,
  "guidance": 3.5
}'

meta "wide-horizon" '{
  "prompt": "Impossible horizon line where the ocean folds into the sky, minimal, muted palette",
  "model": "dall-e-3",
  "service": "OpenAI",
  "cost": 0.08,
  "created_at": "2026-08-29T17:40:00Z",
  "tags": ["landscape", "minimal"]
}'

meta "cell-bloom" '{
  "prompt": "Generative cellular bloom, rule 110 automaton rendered as bioluminescent coral",
  "model": "sd-3.5-large",
  "service": "Stability AI",
  "cost": 0.035,
  "created_at": "2026-08-28T11:20:00Z",
  "tags": ["abstract", "generative"]
}'

meta "life-study" '{
  "prompt": "Conway life colony study, phosphor green on black, CRT bloom",
  "model": "flux-1.1-pro",
  "service": "Black Forest Labs",
  "cost": 0.04,
  "created_at": "2026-08-31T09:55:00Z",
  "tags": ["generative", "retro"]
}'

meta "kinetic-grid" '{
  "prompt": "Kinetic grid of light beams sweeping across a dark stage, slow dolly forward",
  "model": "veo-3",
  "service": "Google DeepMind",
  "width": 1280, "height": 720,
  "duration": 5,
  "cost": 1.75, "currency": "USD",
  "created_at": "2026-08-31T10:31:00Z",
  "tags": ["motion", "abstract"],
  "fps": 24,
  "notes": "Rendu 5s, la version 10s dérivait trop."
}'

meta "vertical-fractal" '{
  "prompt": "Endless zoom into a fractal coastline, vertical format for mobile",
  "model": "sora-2",
  "service": "OpenAI",
  "width": 720, "height": 1280,
  "duration": 4,
  "cost": 0.9,
  "created_at": "2026-08-31T11:07:00Z",
  "tags": ["motion", "fractal", "vertical"]
}'

meta "square-flow" '{
  "prompt": "Liquid gradient flowing in a square loop, seamless, soft focus",
  "model": "runway-gen-4",
  "service": "Runway",
  "duration": 6,
  "cost": 0.6,
  "created_at": "2026-08-27T14:12:00Z",
  "tags": ["motion", "loop"]
}'

echo "jeu de démonstration écrit dans $G/ :"; ls -1 "$G"
