#!/usr/bin/env bash
# Makes a seamless loop from a generated video.
#
#   seamless-loop.sh <source.mp4> <output.mp4> [crossfade_frames]
#
# Method: drop the final frame if it's a duplicate, then fade the last D frames into
# the first D and place the body of the clip BEFORE that crossfade. Playback thus
# wraps around between two consecutive frames of the source, with no discontinuity.
#
#   source: [0 .. D-1][D .. L-D-1][L-D .. L-1]
#              head        body        tail
#   output: [body][crossfade(tail → head)]
#
# Written in bash: in zsh, "start_frame=$D:end_frame=$E" gets silently eaten
# ($VAR:e is a zsh modifier). Hence the systematic braces below.

set -euo pipefail

SRC="${1:?usage: seamless-loop.sh <source.mp4> <output.mp4> [crossfade_frames]}"
OUT="${2:?usage: seamless-loop.sh <source.mp4> <output.mp4> [crossfade_frames]}"
D="${3:-12}"

[ -f "$SRC" ] || { echo "Source not found: $SRC" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# nb_frames sometimes lies: we actually count.
N="$(ffprobe -v error -count_frames -select_streams v:0 \
      -show_entries stream=nb_read_frames -of csv=p=0 "$SRC")"

# Renders often end on a frozen duplicate frame: it causes a micro-stutter when
# looping. We detect it by SSIM on the last two frames.
ffmpeg -v error -y -i "$SRC" -vf "select=eq(n\,$((N - 2)))" -vsync 0 -frames:v 1 "$TMP/p.png"
ffmpeg -v error -y -i "$SRC" -vf "select=eq(n\,$((N - 1)))" -vsync 0 -frames:v 1 "$TMP/q.png"
SS="$(ffmpeg -y -i "$TMP/p.png" -i "$TMP/q.png" -lavfi ssim=stats_file=- -f null - 2>/dev/null \
      | sed 's/.*All://;s/ .*//')"
L="$N"
if awk "BEGIN{exit !(${SS:-0} > 0.9999)}"; then
  L=$((N - 1))
  echo "Duplicated final frame detected (SSIM ${SS}) — dropped." >&2
fi

[ "$((L - 2 * D))" -ge 1 ] || {
  echo "Crossfade too long: ${D} frames for ${L} usable frames." >&2; exit 1; }

# Careful: in the blend filter, the N variable starts at 1, not 0. The ramp is
# therefore written (N-1)/(D-1): without the offset, the crossfade never starts from
# zero and exceeds 1 at the end, which dirties both ends of the seam.
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

# The "fps=" after concat isn't cosmetic: concat leaves irregular timestamps, and
# the fixed-rate encoder then silently drops the last frame of the crossfade —
# which shifts the seam by one frame without any warning. Hence the check below:
# a loop that ends one frame early still looks plausible but is no longer a loop.
EXPECTED=$((L - D))
GOT="$(ffprobe -v error -count_frames -select_streams v:0 \
        -show_entries stream=nb_read_frames -of csv=p=0 "$OUT")"
[ "$GOT" = "$EXPECTED" ] || {
  echo "Unexpected frame count: ${GOT} instead of ${EXPECTED}." >&2; exit 1; }

# Check: the seam should be on the same order as the worst internal transition.
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
echo "→ ${OUT}: ${NO} frames at ${FPS} fps, ${D}-frame crossfade" >&2
echo "  seam SSIM=${SEAM}   worst internal transition=${MIN}" >&2
echo "  A seam on the same order as the worst internal transition is invisible." >&2
echo "  SSIM underrates diffuse textures: WATCH the result before concluding." >&2
