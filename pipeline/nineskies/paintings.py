"""The cast's paintings, kept: a chosen picture cut to its figure and shipped.

`npm run paint` draws a figure from its brief into `.scratch/paint/`, which
git ignores. The picture the film keeps is cut here: to the box its figure
fills, a little margin round it, and written as WebP with its alpha into
`app/public/cast/<figure>-<view>.webp`, where the painted figure loads it
(`engine/src/cast/painting.ts`). The box is the figure's own extent, so the
picture's longer side is the figure's longest, the size a cue gives.

    python -m nineskies.paintings keep <picture.png> <figure> <view>
"""

from __future__ import annotations

import argparse
import sys
import warnings
from pathlib import Path

import numpy as np

#: WebP quality: the rock's (F92), for a picture seen at a tenth of the frame.
WEBP_QUALITY = 90
#: Alpha, of 255, below which a pixel is not the figure's for the box.
SOLID = 8
#: Margin kept round the box, pixels, so a filtered edge is not cut.
MARGIN = 12

OUT = Path("app/public/cast")


def read_rgba(path: Path) -> np.ndarray:
    """(4, rows, cols) uint8."""
    import rasterio

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with rasterio.open(path) as ds:
            if ds.count != 4:
                raise SystemExit(f"{path} has {ds.count} bands; a painting has colour and alpha")
            return ds.read()


def box(alpha: np.ndarray) -> tuple[int, int, int, int]:
    """(top, bottom, left, right), exclusive at the far ends, with the margin, inside the picture."""
    rows = np.flatnonzero((alpha >= SOLID).any(axis=1))
    cols = np.flatnonzero((alpha >= SOLID).any(axis=0))
    if rows.size == 0:
        raise SystemExit("the picture is empty")
    h, w = alpha.shape
    return (
        max(0, int(rows[0]) - MARGIN),
        min(h, int(rows[-1]) + 1 + MARGIN),
        max(0, int(cols[0]) - MARGIN),
        min(w, int(cols[-1]) + 1 + MARGIN),
    )


def encode(data: np.ndarray) -> bytes:
    from rasterio.io import MemoryFile

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with MemoryFile() as memory:
            with memory.open(
                driver="WEBP", width=data.shape[2], height=data.shape[1], count=4, dtype="uint8", QUALITY=WEBP_QUALITY
            ) as ds:
                ds.write(data)
            return memory.read()


def keep(picture: Path, figure: str, view: str, out: Path = OUT) -> Path:
    data = read_rgba(picture)
    top, bottom, left, right = box(data[3])
    cut = np.ascontiguousarray(data[:, top:bottom, left:right])
    out.mkdir(parents=True, exist_ok=True)
    target = out / f"{figure}-{view}.webp"
    target.write_bytes(encode(cut))
    return target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Keep a painting of the cast: cut it to its figure, into the app.")
    parser.add_argument("step", choices=["keep"])
    parser.add_argument("picture", type=Path)
    parser.add_argument("figure")
    parser.add_argument("view")
    args = parser.parse_args(argv)
    target = keep(args.picture, args.figure, args.view)
    data = read_rgba(target)
    print(f"{target}: {data.shape[2]} x {data.shape[1]} (aspect {data.shape[2]} / {data.shape[1]}), {target.stat().st_size / 1e3:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
