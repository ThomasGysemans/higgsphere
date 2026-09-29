#!/usr/bin/env bash
# Fabrique une boucle sans raccord à partir d'une vidéo générée.
#
#   seamless-loop.sh <source.mp4> <sortie.mp4> [images_de_fondu]
#
# Méthode : on jette l'éventuelle image finale dupliquée, puis on fond les D dernières
# images sur les D premières et on place le corps du clip AVANT ce fondu. La lecture
# reboucle donc entre deux images consécutives de la source, sans discontinuité.
#
#   source : [0 .. D-1][D .. L-D-1][L-D .. L-1]
#              head        body        tail
#   sortie : [body][fondu(tail → head)]
#
# Écrit en bash : en zsh, "start_frame=$D:end_frame=$E" est silencieusement mangé
# ($VAR:e est un modificateur zsh). D'où les accolades systématiques ci-dessous.

set -euo pipefail

SRC="${1:?usage: seamless-loop.sh <source.mp4> <sortie.mp4> [images_de_fondu]}"
OUT="${2:?usage: seamless-loop.sh <source.mp4> <sortie.mp4> [images_de_fondu]}"
D="${3:-12}"

[ -f "$SRC" ] || { echo "Source introuvable : $SRC" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg est requis" >&2; exit 1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# nb_frames ment parfois : on compte réellement.
N="$(ffprobe -v error -count_frames -select_streams v:0 \
      -show_entries stream=nb_read_frames -of csv=p=0 "$SRC")"

# Les rendus se terminent souvent sur une image dupliquée figée : elle provoque
# un micro-à-coup en boucle. On la détecte par SSIM sur les deux dernières images.
ffmpeg -v error -y -i "$SRC" -vf "select=eq(n\,$((N - 2)))" -vsync 0 -frames:v 1 "$TMP/p.png"
ffmpeg -v error -y -i "$SRC" -vf "select=eq(n\,$((N - 1)))" -vsync 0 -frames:v 1 "$TMP/q.png"
SS="$(ffmpeg -y -i "$TMP/p.png" -i "$TMP/q.png" -lavfi ssim=stats_file=- -f null - 2>/dev/null \
      | sed 's/.*All://;s/ .*//')"
L="$N"
if awk "BEGIN{exit !(${SS:-0} > 0.9999)}"; then
  L=$((N - 1))
  echo "Image finale dupliquée détectée (SSIM ${SS}) — écartée." >&2
fi

[ "$((L - 2 * D))" -ge 1 ] || {
  echo "Fondu trop long : ${D} images pour ${L} images utiles." >&2; exit 1; }

# Attention : dans le filtre blend, la variable N commence à 1, pas à 0. La rampe
# s'écrit donc (N-1)/(D-1) : sans le décalage, le fondu ne part jamais de zéro et
# dépasse 1 à la fin, ce qui salit les deux extrémités du raccord.
BE=$((L - D)); LAST=$((D - 1))
FPS="$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate \
        -of csv=p=0 "$SRC")"

ffmpeg -v error -y -i "$SRC" -filter_complex "
[0:v]trim=start_frame=0:end_frame=${L},setpts=PTS-STARTPTS,split=3[a][b][c];
[a]trim=start_frame=${D}:end_frame=${BE},setpts=PTS-STARTPTS[body];
[b]trim=start_frame=${BE}:end_frame=${L},setpts=PTS-STARTPTS[tail];
[c]trim=start_frame=0:end_frame=${D},setpts=PTS-STARTPTS[head];
[tail][head]blend=all_expr='A*(1-((N-1)/${LAST}))+B*((N-1)/${LAST})'[trans];
[body][trans]concat=n=2:v=1,fps=${FPS}[out]" \
  -map "[out]" -fps_mode cfr -r "${FPS}" \
  -c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p -an "$OUT"

# Le "fps=" après concat n'est pas cosmétique : concat laisse des timestamps
# irréguliers, et l'encodeur en cadence fixe supprime alors silencieusement la
# dernière image du fondu — ce qui décale le raccord d'une image sans rien signaler.
# D'où la vérification ci-dessous : une boucle qui se termine une image trop tôt
# reste plausible à l'œil mais n'est plus une boucle.
EXPECTED=$((L - D))
GOT="$(ffprobe -v error -count_frames -select_streams v:0 \
        -show_entries stream=nb_read_frames -of csv=p=0 "$OUT")"
[ "$GOT" = "$EXPECTED" ] || {
  echo "Compte d'images inattendu : ${GOT} au lieu de ${EXPECTED}." >&2; exit 1; }

# Contrôle : le raccord doit être du même ordre que la pire transition interne.
NO="$(ffprobe -v error -count_frames -select_streams v:0 \
       -show_entries stream=nb_read_frames -of csv=p=0 "$OUT")"
ffmpeg -v error -y -i "$OUT" -vf "select=eq(n\,0)"            -vsync 0 -frames:v 1 "$TMP/f.png"
ffmpeg -v error -y -i "$OUT" -vf "select=eq(n\,$((NO - 1)))" -vsync 0 -frames:v 1 "$TMP/l.png"
SEAM="$(ffmpeg -y -i "$TMP/l.png" -i "$TMP/f.png" -lavfi ssim=stats_file=- -f null - 2>/dev/null \
        | sed 's/.*All://;s/ .*//')"
MIN="$(ffmpeg -y -i "$OUT" -i "$OUT" -lavfi \
        "[0:v]trim=start_frame=1,setpts=PTS-STARTPTS[x];[1:v]setpts=PTS-STARTPTS[y];[x][y]ssim=stats_file=-" \
        -f null - 2>/dev/null | sed 's/.*All://;s/ .*//' | sort -n | head -1)"

FPS="$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$OUT")"
echo "→ ${OUT} : ${NO} images à ${FPS} i/s, fondu de ${D} images" >&2
echo "  raccord SSIM=${SEAM}   pire transition interne=${MIN}" >&2
echo "  Un raccord du même ordre que la pire transition interne est invisible." >&2
echo "  Le SSIM sous-estime les textures diffuses : REGARDER le résultat avant de conclure." >&2
