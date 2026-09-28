"""The sky's cloud maps, kept: a chosen picture made a seamless density map (D95).

`npm run paint -- --set clouds <map>` draws a map from its brief in
`content/clouds/` into `.scratch/paint/clouds/`, which git ignores. The
picture a cloud layer keeps is cut here: to grey, its levels stretched so
clear sky is 0 and the thickest cloud 1, made to tile, and written as WebP
into `app/public/clouds/<map>.webp`, where the cloud layer loads it
(`engine/src/look/clouds.ts`).

The painter is asked for a tileable picture and does not quite make one, so
the tiling is made here: the picture joined to itself rolled half a side,
whose edges are the original's middle and so continue across the wrap. The
original keeps the middle of the square and the rolled copy a band along
each edge, and the two meet along the cheapest path through the band: the
line, row by row, where they differ least (Efros and Freeman's quilting
cut), feathered over a few pixels. Across a field of cumulus that path runs
through clear sky, so no cloud is cut; averaging the two instead leaves a
field of pale ghosts, and joining them by the brighter cuts clouds off
where one of them fades.

    python -m nineskies.cloudmaps keep <picture.png> <map>
"""

from __future__ import annotations

import argparse
import sys
import warnings
from pathlib import Path

import numpy as np

#: WebP quality: a map is read through a shader's threshold, not looked at.
WEBP_QUALITY = 92
#: Percentiles taken as clear sky and as the thickest cloud.
BLACK_PERCENTILE = 1.0
WHITE_PERCENTILE = 99.7
#: The band along each edge in which the cut is sought, a share of the side.
SEAM_BAND = 0.2
#: The cut's feather, pixels (a Gaussian's sigma).
FEATHER_PX = 2.0

OUT = Path("app/public/clouds")


def read_grey(path: Path) -> np.ndarray:
    """(rows, cols) float 0..1, the picture's luminance."""
    import rasterio

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with rasterio.open(path) as ds:
            data = ds.read().astype(np.float64) / 255.0
    if data.shape[0] >= 3:
        return 0.2126 * data[0] + 0.7152 * data[1] + 0.0722 * data[2]
    return data[0]


def levels(grey: np.ndarray) -> np.ndarray:
    lo, hi = np.percentile(grey, [BLACK_PERCENTILE, WHITE_PERCENTILE])
    return np.clip((grey - lo) / max(hi - lo, 1e-6), 0.0, 1.0)


def _cut(error: np.ndarray) -> np.ndarray:
    """Per row, the column of the cheapest top-to-bottom path through `error`, a step of one at most."""
    rows, cols = error.shape
    cost = error.copy()
    for r in range(1, rows):
        prev = cost[r - 1]
        left = np.concatenate([[np.inf], prev[:-1]])
        right = np.concatenate([prev[1:], [np.inf]])
        cost[r] += np.minimum(np.minimum(left, prev), right)
    path = np.empty(rows, dtype=np.int64)
    path[-1] = int(np.argmin(cost[-1]))
    for r in range(rows - 2, -1, -1):
        c = path[r + 1]
        lo, hi = max(0, c - 1), min(cols, c + 2)
        path[r] = lo + int(np.argmin(cost[r, lo:hi]))
    return path


def _inside_columns(own: np.ndarray, other: np.ndarray, band: int) -> np.ndarray:
    """1 where the original is kept, between a cut in the left band and one in the right."""
    rows, cols = own.shape
    error = (own - other) ** 2
    left = _cut(error[:, :band])
    right = cols - band + _cut(error[:, cols - band :])
    c = np.arange(cols)[None, :]
    return ((c > left[:, None]) & (c < right[:, None])).astype(np.float64)


def _blur(a: np.ndarray, sigma: float) -> np.ndarray:
    """A Gaussian blur that wraps, one axis then the other."""
    radius = int(3 * sigma + 0.5)
    k = np.exp(-0.5 * (np.arange(-radius, radius + 1) / sigma) ** 2)
    k /= k.sum()
    for axis in (0, 1):
        a = sum(w * np.roll(a, shift, axis=axis) for shift, w in zip(range(-radius, radius + 1), k))
    return a


def tileable(grey: np.ndarray) -> np.ndarray:
    """The picture made to wrap on both axes: its middle, cut into its rolled self."""
    rows, cols = grey.shape
    rolled = np.roll(grey, (rows // 2, cols // 2), axis=(0, 1))
    across = _inside_columns(grey, rolled, int(SEAM_BAND * cols))
    down = _inside_columns(grey.T, rolled.T, int(SEAM_BAND * rows)).T
    keep = _blur(across * down, FEATHER_PX)
    return keep * grey + (1.0 - keep) * rolled


def encode(grey: np.ndarray) -> bytes:
    from rasterio.io import MemoryFile

    band = np.round(grey * 255.0).astype(np.uint8)
    data = np.stack([band, band, band])
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with MemoryFile() as memory:
            with memory.open(
                driver="WEBP", width=data.shape[2], height=data.shape[1], count=3, dtype="uint8", QUALITY=WEBP_QUALITY
            ) as ds:
                ds.write(data)
            return memory.read()


def keep(picture: Path, name: str, out: Path = OUT) -> Path:
    grey = tileable(levels(read_grey(picture)))
    out.mkdir(parents=True, exist_ok=True)
    target = out / f"{name}.webp"
    target.write_bytes(encode(grey))
    return target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Keep a cloud map: grey, levelled, tiling, into the app.")
    parser.add_argument("step", choices=["keep"])
    parser.add_argument("picture", type=Path)
    parser.add_argument("map")
    args = parser.parse_args(argv)
    target = keep(args.picture, args.map)
    grey = read_grey(target)
    print(f"{target}: {grey.shape[1]} x {grey.shape[0]}, cover {100 * (grey > 0.25).mean():.0f} %, {target.stat().st_size / 1e3:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
