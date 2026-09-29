#!/usr/bin/env bash
# Boucle perpétuelle par mélange sur demi-période.
#
#   halfperiod-loop.sh <source.mp4> <sortie.mp4> [ralenti]
#
# À préférer à seamless-loop.sh quand le mouvement ne repasse JAMAIS par un état
# antérieur (flux turbulent : fumée, flammes, poussière, disque d'accrétion). Là
# où un fondu localisé laisse une transition visible, celui-ci n'en a aucune.
#
# Principe : on mélange la première moitié du clip avec la seconde, avec une rampe
# linéaire d'un bout à l'autre.
#
#   sortie(N) = premiere(N) * w  +  seconde(N) * (1-w)     w = (N-1)/(H-1)
#
# À N=1 la sortie vaut seconde(0), c'est-à-dire l'image H de la source ; à N=H elle
# vaut premiere(H-1), c'est-à-dire l'image H-1. Le rebouclage enchaîne donc deux
# images CONSÉCUTIVES de la source : il n'y a aucune discontinuité, nulle part.
#
# Le prix à payer : la durée est divisée par deux, et l'image est en permanence une
# superposition de deux états. Sur une texture diffuse c'est invisible ; sur des
# arêtes franches ça se verrait. Le paramètre « ralenti » (interpolation de
# mouvement) rallonge la boucle SANS aggraver la superposition — l'écart de contenu
# entre les deux couches ne dépend que de la source, pas de la vitesse de lecture.

set -euo pipefail

SRC="${1:?usage: halfperiod-loop.sh <source.mp4> <sortie.mp4> [ralenti]}"
OUT="${2:?usage: halfperiod-loop.sh <source.mp4> <sortie.mp4> [ralenti]}"
K="${3:-1}"

[ -f "$SRC" ] || { echo "Source introuvable : $SRC" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg est requis" >&2; exit 1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
FPS="$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$SRC")"
FPSV="$(awk -F/ '{print ($2 ? $1/$2 : $1)}' <<< "$FPS")"   # cadence numérique, ex. 24

WORK="$SRC"
if [ "$K" != "1" ]; then
  echo "Ralenti x${K} par interpolation de mouvement (peut prendre une minute)…" >&2
  FPSN="$(awk "BEGIN{print ${FPSV} * ${K}}")"
  ffmpeg -v error -y -i "$SRC" -filter_complex \
    "[0:v]minterpolate=fps=${FPSN}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,setpts=${K}*PTS,fps=${FPS}[o]" \
    -map "[o]" -fps_mode cfr -r "${FPS}" \
    -c:v libx264 -crf 14 -preset medium -pix_fmt yuv420p -an "$TMP/slow.mp4"
  WORK="$TMP/slow.mp4"
fi

N="$(ffprobe -v error -count_frames -select_streams v:0 \
      -show_entries stream=nb_read_frames -of csv=p=0 "$WORK")"
M=$(( N - N % 2 ))          # longueur paire : les deux moitiés doivent être égales
H=$(( M / 2 ))
LAST=$(( H - 1 ))
[ "$H" -ge 8 ] || { echo "Clip trop court : ${N} images." >&2; exit 1; }

# Attention : dans blend, la variable N commence à 1. La rampe s'écrit donc
# (N-1)/(H-1), sinon les deux extrémités du mélange restent polluées.
# Le fps= après le blend renormalise les timestamps : sans lui, l'encodeur en
# cadence fixe supprime une image sans le signaler et le raccord se décale.
ffmpeg -v error -y -i "$WORK" -filter_complex "
[0:v]trim=start_frame=0:end_frame=${M},setpts=PTS-STARTPTS,split=2[x][y];
[x]trim=start_frame=0:end_frame=${H},setpts=PTS-STARTPTS[first];
[y]trim=start_frame=${H}:end_frame=${M},setpts=PTS-STARTPTS[second];
[first][second]blend=all_expr='A*((N-1)/${LAST})+B*(1-((N-1)/${LAST}))',fps=${FPS}[o]" \
  -map "[o]" -fps_mode cfr -r "${FPS}" \
  -c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p -an "$OUT"

GOT="$(ffprobe -v error -count_frames -select_streams v:0 \
        -show_entries stream=nb_read_frames -of csv=p=0 "$OUT")"
[ "$GOT" = "$H" ] || { echo "Compte d'images inattendu : ${GOT} au lieu de ${H}." >&2; exit 1; }

ffmpeg -v error -y -i "$OUT" -vf "select=eq(n\,0)"            -vsync 0 -frames:v 1 "$TMP/f.png"
ffmpeg -v error -y -i "$OUT" -vf "select=eq(n\,$((H - 1)))"  -vsync 0 -frames:v 1 "$TMP/l.png"
SEAM="$(ffmpeg -y -i "$TMP/l.png" -i "$TMP/f.png" -lavfi ssim=stats_file=- -f null - 2>/dev/null \
        | sed 's/.*All://;s/ .*//')"
MIN="$(ffmpeg -y -i "$OUT" -i "$OUT" -lavfi \
        "[0:v]trim=start_frame=1,setpts=PTS-STARTPTS[x];[1:v]setpts=PTS-STARTPTS[y];[x][y]ssim=stats_file=-" \
        -f null - 2>/dev/null | sed 's/.*All://;s/ .*//' | sort -n | head -1)"

DUR="$(awk "BEGIN{printf \"%.2f\", ${GOT}/${FPSV}}")"
echo "→ ${OUT} : ${GOT} images à ${FPSV} i/s, soit ${DUR} s" >&2
echo "  raccord SSIM=${SEAM}   pire transition interne=${MIN}" >&2
echo "  Le raccord doit avoisiner les transitions internes : il n'y a plus de coupe." >&2
echo "  Le SSIM sous-estime les textures diffuses : REGARDER le résultat avant de conclure." >&2
