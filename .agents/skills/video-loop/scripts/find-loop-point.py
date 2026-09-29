#!/usr/bin/env python3
"""Finds the best clean cut point to loop a video.

    find-loop-point.py <video.mp4> [--min-frames 48]

Compares every pair of frames (i, j) at least --min-frames apart and ranks them by
increasing MSE on a downscaled grayscale version.

Reading the result: the MSE of the best pair is compared with that of two consecutive
frames. If the ratio exceeds ~10x, there is no clean cut point and the clip has to be
blended (halfperiod-loop.sh, or failing that seamless-loop.sh) —
this is the case for any
turbulent flow (smoke, flames, dust, accretion disk), which never goes back
through an earlier state.

No dependencies: ffmpeg produces PGMs that we read by hand.
"""

import argparse
import shutil
import statistics
import subprocess
import sys
import tempfile
from pathlib import Path

WIDTH, HEIGHT = 192, 108
STRIDE = 3  # we sample one pixel in three: enough, and much faster


def read_pgm(path: Path) -> bytes:
    """Reads a binary PGM (P5) and returns its pixel bytes."""
    data = path.read_bytes()
    fields, i = [], 0
    while len(fields) < 4:  # magic, width, height, maxval
        while data[i : i + 1].isspace():
            i += 1
        if data[i : i + 1] == b"#":
            while data[i : i + 1] != b"\n":
                i += 1
            continue
        j = i
        while not data[j : j + 1].isspace():
            j += 1
        fields.append(data[i:j])
        i = j
    return data[i + 1 :]


def mse(a: bytes, b: bytes) -> float:
    total = 0
    n = 0
    for k in range(0, len(a), STRIDE):
        d = a[k] - b[k]
        total += d * d
        n += 1
    return total / n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--min-frames", type=int, default=48,
                    help="minimum loop length, in frames (default: 48)")
    ap.add_argument("--top", type=int, default=10)
    args = ap.parse_args()

    if not shutil.which("ffmpeg"):
        print("ffmpeg is required", file=sys.stderr)
        return 1

    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", args.video,
             "-vf", f"scale={WIDTH}:{HEIGHT},format=gray", "-vsync", "0",
             f"{tmp}/%04d.pgm"],
            check=True,
        )
        frames = [read_pgm(p) for p in sorted(Path(tmp).glob("*.pgm"))]

    n = len(frames)
    if n < args.min_frames + 2:
        print(f"Video too short: {n} frames.", file=sys.stderr)
        return 1

    consecutive = [mse(frames[i], frames[i + 1]) for i in range(n - 1)]
    baseline = statistics.median(consecutive)

    pairs = sorted(
        (mse(frames[i], frames[j]), i, j)
        for i in range(n - args.min_frames)
        for j in range(i + args.min_frames, n)
    )

    print(f"{n} frames. MSE between consecutive frames: "
          f"min={min(consecutive):.1f} median={baseline:.1f} max={max(consecutive):.1f}")
    print(f"\nBest pairs (cut from i to j):")
    for m, i, j in pairs[: args.top]:
        print(f"  i={i:4d}  j={j:4d}  length={j - i:4d} fr  MSE={m:8.1f}"
              f"  ({m / baseline:6.1f}x the threshold)")

    best = pairs[0][0] / baseline
    print()
    if best <= 10:
        m, i, j = pairs[0]
        print(f"Usable clean cut point: keep frames {i} to {j - 1}.")
        print(f"  ffmpeg -i {args.video} -vf \"select=between(n\\,{i}\\,{j - 1})\" "
              f"-vsync 0 -an loop.mp4")
    else:
        print(f"No clean cut point ({best:.0f}x the threshold): the motion never "
              f"goes back through an earlier state.")
        print("  Blend: halfperiod-loop.sh (preferred) or seamless-loop.sh (localized crossfade).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
