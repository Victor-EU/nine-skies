"""The film's own pictures, kept: a chosen painting shipped as WebP (D95).

`npm run paint -- --set art <picture>` paints from a brief in
`content/art/` into `.scratch/paint/art/`, which git ignores. The one the
film keeps is written here into `app/public/art/<name>.webp`, at the
painted size, for the shell's CSS to set behind a card
(`app/src/film.css`).

    python -m nineskies.art keep <picture.png> <name>
"""

from __future__ import annotations

import argparse
import sys
import warnings
from pathlib import Path

import numpy as np

#: WebP quality: a picture seen dimmed, behind lettering, for a few seconds.
WEBP_QUALITY = 82

OUT = Path("app/public/art")


def keep(picture: Path, name: str, out: Path = OUT) -> Path:
    import rasterio
    from rasterio.io import MemoryFile

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with rasterio.open(picture) as ds:
            data = ds.read()[:3].astype(np.uint8)
        with MemoryFile() as memory:
            with memory.open(
                driver="WEBP", width=data.shape[2], height=data.shape[1], count=3, dtype="uint8", QUALITY=WEBP_QUALITY
            ) as ds:
                ds.write(data)
            encoded = memory.read()
    out.mkdir(parents=True, exist_ok=True)
    target = out / f"{name}.webp"
    target.write_bytes(encoded)
    return target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Keep one of the film's own pictures: into the app as WebP.")
    parser.add_argument("step", choices=["keep"])
    parser.add_argument("picture", type=Path)
    parser.add_argument("name")
    args = parser.parse_args(argv)
    target = keep(args.picture, args.name)
    print(f"{target}: {target.stat().st_size / 1e3:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
