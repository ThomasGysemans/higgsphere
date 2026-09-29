#!/usr/bin/env bash
# Perpetual loop by half-period blending.
#
#   halfperiod-loop.sh <source.mp4> <output.mp4> [slowdown]
#
# Preferred over seamless-loop.sh when the motion NEVER goes back through an earlier
# state (turbulent flow: smoke, flames, dust, accretion disk). Where a localized
# crossfade leaves a visible transition, this one has none.
#
# Principle: blend the first half of the clip with the second, with a linear ramp
# from one end to the other.
#
#   output(N) = first(N) * w  +  second(N) * (1-w)     w = (N-1)/(H-1)
#
# At N=1 the output equals second(0), i.e. frame H of the source; at N=H it equals
# first(H-1), i.e. frame H-1. The wrap-around therefore joins two CONSECUTIVE
# frames of the source: there is no discontinuity, anywhere.
#
# The price to pay: the duration is halved, and the image is permanently an
# overlay of two states. On a diffuse texture it's invisible; on sharp edges it
# would show. The "slowdown" parameter (motion interpolation) lengthens the loop
# WITHOUT making the overlay worse — the content gap between the two layers depends
# only on the source, not on playback speed.

set -euo pipefail

SRC="${1:?usage: halfperiod-loop.sh <source.mp4> <output.mp4> [slowdown]}"
OUT="${2:?usage: halfperiod-loop.sh <source.mp4> <output.mp4> [slowdown]}"
K="${3:-1}"

[ -f "$SRC" ] || { echo "Source not found: $SRC" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
FPS="$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$SRC")"
FPSV="$(awk -F/ '{print ($2 ? $1/$2 : $1)}' <<< "$FPS")"   # numeric frame rate, e.g. 24

WORK="$SRC"
if [ "$K" != "1" ]; then
  echo "Slowdown x${K} by motion interpolation (may take a minute)…" >&2
  FPSN="$(awk "BEGIN{print ${FPSV} * ${K}}")"
  ffmpeg -v error -y -i "$SRC" -filter_complex \
    "[0:v]minterpolate=fps=${FPSN}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,setpts=${K}*PTS,fps=${FPS}[o]" \
    -map "[o]" -fps_mode cfr -r "${FPS}" \
    -c:v libx264 -crf 14 -preset medium -pix_fmt yuv420p -an "$TMP/slow.mp4"
  WORK="$TMP/slow.mp4"
fi

N="$(ffprobe -v error -count_frames -select_streams v:0 \
      -show_entries stream=nb_read_frames -of csv=p=0 "$WORK")"
M=$(( N - N % 2 ))          # even length: both halves must be equal
H=$(( M / 2 ))
LAST=$(( H - 1 ))
[ "$H" -ge 8 ] || { echo "Clip too short: ${N} frames." >&2; exit 1; }

# Careful: in blend, the N variable starts at 1. The ramp is therefore written
# (N-1)/(H-1), otherwise both ends of the blend stay polluted.
# The fps= after the blend renormalizes the timestamps: without it, the fixed-rate
# encoder drops a frame without saying so and the seam shifts.
ffmpeg -v error -y -i "$WORK" -filter_complex "
[0:v]trim=start_frame=0:end_frame=${M},setpts=PTS-STARTPTS,split=2[x][y];
[x]trim=start_frame=0:end_frame=${H},setpts=PTS-STARTPTS[first];
[y]trim=start_frame=${H}:end_frame=${M},setpts=PTS-STARTPTS[second];
[first][second]blend=all_expr='A*((N-1)/${LAST})+B*(1-((N-1)/${LAST}))',fps=${FPS}[o]" \
  -map "[o]" -fps_mode cfr -r "${FPS}" \
  -c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p -an "$OUT"

GOT="$(ffprobe -v error -count_frames -select_streams v:0 \
        -show_entries stream=nb_read_frames -of csv=p=0 "$OUT")"
[ "$GOT" = "$H" ] || { echo "Unexpected frame count: ${GOT} instead of ${H}." >&2; exit 1; }

ffmpeg -v error -y -i "$OUT" -vf "select=eq(n\,0)"            -vsync 0 -frames:v 1 "$TMP/f.png"
ffmpeg -v error -y -i "$OUT" -vf "select=eq(n\,$((H - 1)))"  -vsync 0 -frames:v 1 "$TMP/l.png"
SEAM="$(ffmpeg -y -i "$TMP/l.png" -i "$TMP/f.png" -lavfi ssim=stats_file=- -f null - 2>/dev/null \
        | sed 's/.*All://;s/ .*//')"
MIN="$(ffmpeg -y -i "$OUT" -i "$OUT" -lavfi \
        "[0:v]trim=start_frame=1,setpts=PTS-STARTPTS[x];[1:v]setpts=PTS-STARTPTS[y];[x][y]ssim=stats_file=-" \
        -f null - 2>/dev/null | sed 's/.*All://;s/ .*//' | sort -n | head -1)"

DUR="$(awk "BEGIN{printf \"%.2f\", ${GOT}/${FPSV}}")"
echo "→ ${OUT}: ${GOT} frames at ${FPSV} fps, i.e. ${DUR} s" >&2
echo "  seam SSIM=${SEAM}   worst internal transition=${MIN}" >&2
echo "  The seam should be close to the internal transitions: there is no cut anymore." >&2
echo "  SSIM underrates diffuse textures: WATCH the result before concluding." >&2
