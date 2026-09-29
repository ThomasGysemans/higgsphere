#!/usr/bin/env python3
"""Cherche le meilleur point de coupe franche pour boucler une vidéo.

    find-loop-point.py <video.mp4> [--min-frames 48]

Compare toutes les paires d'images (i, j) séparées d'au moins --min-frames et
classe par MSE croissant sur une version réduite en niveaux de gris.

Lecture du résultat : le MSE de la meilleure paire est comparé à celui de deux
images consécutives. Si le rapport dépasse ~10x, il n'existe pas de point de
coupe franche et il faut mélanger (halfperiod-loop.sh, à défaut seamless-loop.sh) —
c'est le cas de tout flux
turbulent (fumée, flammes, poussière, disque d'accrétion), qui ne repasse jamais
par un état antérieur.

Aucune dépendance : ffmpeg produit des PGM que l'on lit à la main.
"""

import argparse
import shutil
import statistics
import subprocess
import sys
import tempfile
from pathlib import Path

WIDTH, HEIGHT = 192, 108
STRIDE = 3  # on échantillonne un pixel sur trois : suffisant, et bien plus rapide


def read_pgm(path: Path) -> bytes:
    """Lit un PGM binaire (P5) et renvoie ses octets de pixels."""
    data = path.read_bytes()
    fields, i = [], 0
    while len(fields) < 4:  # magic, largeur, hauteur, maxval
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
                    help="longueur minimale de la boucle, en images (défaut : 48)")
    ap.add_argument("--top", type=int, default=10)
    args = ap.parse_args()

    if not shutil.which("ffmpeg"):
        print("ffmpeg est requis", file=sys.stderr)
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
        print(f"Vidéo trop courte : {n} images.", file=sys.stderr)
        return 1

    consecutive = [mse(frames[i], frames[i + 1]) for i in range(n - 1)]
    baseline = statistics.median(consecutive)

    pairs = sorted(
        (mse(frames[i], frames[j]), i, j)
        for i in range(n - args.min_frames)
        for j in range(i + args.min_frames, n)
    )

    print(f"{n} images. MSE entre images consécutives : "
          f"min={min(consecutive):.1f} médiane={baseline:.1f} max={max(consecutive):.1f}")
    print(f"\nMeilleures paires (coupe de i vers j) :")
    for m, i, j in pairs[: args.top]:
        print(f"  i={i:4d}  j={j:4d}  longueur={j - i:4d} img  MSE={m:8.1f}"
              f"  ({m / baseline:6.1f}x le seuil)")

    best = pairs[0][0] / baseline
    print()
    if best <= 10:
        m, i, j = pairs[0]
        print(f"Point de coupe franche exploitable : garder les images {i} à {j - 1}.")
        print(f"  ffmpeg -i {args.video} -vf \"select=between(n\\,{i}\\,{j - 1})\" "
              f"-vsync 0 -an boucle.mp4")
    else:
        print(f"Aucun point de coupe franche ({best:.0f}x le seuil) : le mouvement ne "
              f"repasse jamais par un état antérieur.")
        print("  Mélanger : halfperiod-loop.sh (à préférer) ou seamless-loop.sh (fondu localisé).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
