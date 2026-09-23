"""Stage 11, its first part — the heights as one file per tile, so a world streams (F67).

`heights.bin` is every tile of a world in one file, which is how the corridor
has always shipped: 9.8 MB, fetched once before the first frame. The country is
61.2 MB that way, and the plan's first flight is budgeted at ~15 MB for
everything, the local ring of tiles included. The ring is ~137 tiles. So the
country is cut again here, one file per tile, and the engine fetches the ring it
is flying over rather than the country it is not.

**The codec is measured, and it is gzip rather than Brotli.** Over the
country's 4,665 land tiles, each coded on its own:

======================================  ========  =========
per tile                                 total     mean
======================================  ========  =========
raw Int16                               39.42 MB   8.45 kB
gzip                                    21.99 MB   4.71 kB
Brotli                                  18.78 MB   4.03 kB
left delta, byte planes, gzip           18.41 MB   3.95 kB
planar predictor, Brotli                15.90 MB   3.41 kB
======================================  ========  =========

A browser only decodes Brotli that a host labels `Content-Encoding: br`, so the
last row is a smaller file and a hosting requirement. The row above it is 16 %
larger and needs nothing from the host: `DecompressionStream("gzip")` is in
every browser the game targets. Both leave the country far inside the plan's
~30 MB for elevation, and what first flight costs is the ring, where the two
differ by 70 kB.

So a tile is coded as:

1. **left delta** — each sample less the one west of it, and the first column
   less the one south of it; the first sample stands alone. In wrapping 16-bit
   arithmetic, so any Int16 round-trips and none can overflow;
2. **byte planes** — every low byte, then every high byte, because the high
   bytes of a delta are nearly all 0x00 or 0xFF and gzip finds that run only
   when it is contiguous;
3. **gzip**, level 9, with the header's time set to zero so the same tile is
   the same file on every build.

A file is named by the digest of what it holds, so it is immutable and a
rebuild that moves one river re-fetches the tiles the river is in rather than
the country. A tile that is all zeros — open sea, which is every tile without
land in both built worlds — has no file at all; the index says so and the
engine makes the zeros itself. Two tiles that are the same are one file, which
on the country is 30 tiles, and that turned out to be a finding rather than a
saving: they are all 1,044 m, the lower Tarim filled flat (F67). The index
lists a file by its digest alone, and the engine adds the `.bin`.

The index names the `heights.bin` it was cut from by digest. That file stays
the world's authoritative form: every committed section and patch is signed
against its digest (D23), so the package is a way of delivering it, and a
package left behind by a rebuild is refused rather than flown.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import sys
from pathlib import Path

import numpy as np

from . import grid
from .grid import CORRIDORS

#: What the engine checks before it will read a file: `tileCodec.ts` names the
#: same string, and a package in any other is not flown.
CODEC = "delta-planes-gzip"
INDEX_VERSION = 1
#: 64 bits of a SHA-256. The country has 4,665 files, so a collision is a
#: one-in-10^12 event; the index is what stops being small first.
NAME_HEX = 16
SUBDIR = "tiles"
INDEX = "index.json"
SAMPLES = grid.TILE_SAMPLES


def delta(tile: np.ndarray) -> np.ndarray:
    """Each sample less its west neighbour; the first column less its south one."""
    t = tile.astype(np.int16).reshape(SAMPLES, SAMPLES)
    out = np.empty_like(t)
    with np.errstate(over="ignore"):
        out[:, 1:] = t[:, 1:] - t[:, :-1]
        out[1:, 0] = t[1:, 0] - t[:-1, 0]
    out[0, 0] = t[0, 0]
    return out


def undelta(d: np.ndarray) -> np.ndarray:
    """The inverse, in the same wrapping arithmetic."""
    d = d.astype(np.int16).reshape(SAMPLES, SAMPLES)
    first = np.cumsum(d[:, 0], dtype=np.int16)
    rows = d.copy()
    rows[:, 0] = first
    return np.cumsum(rows, axis=1, dtype=np.int16)


def planes(d: np.ndarray) -> bytes:
    """Every low byte, then every high byte."""
    b = d.astype("<i2").reshape(-1).view(np.uint8).reshape(-1, 2)
    return b[:, 0].tobytes() + b[:, 1].tobytes()


def unplanes(data: bytes) -> np.ndarray:
    n = len(data) // 2
    b = np.frombuffer(data, dtype=np.uint8)
    pairs = np.empty((n, 2), dtype=np.uint8)
    pairs[:, 0] = b[:n]
    pairs[:, 1] = b[n:]
    return pairs.reshape(-1).view("<i2").astype(np.int16)


def encode(tile: np.ndarray) -> bytes:
    return gzip.compress(planes(delta(tile)), compresslevel=9, mtime=0)


def decode(data: bytes) -> np.ndarray:
    return undelta(unplanes(gzip.decompress(data)))


def name_for(data: bytes) -> str:
    """The file's name without its `.bin`, which is how the index lists it."""
    return hashlib.sha256(data).hexdigest()[:NAME_HEX]


def pack(tiles: np.ndarray) -> tuple[list[str], dict[str, bytes]]:
    """One name per tile in `heights.bin` order, "" for a tile of zeros."""
    names: list[str] = []
    files: dict[str, bytes] = {}
    for tile in tiles:
        if not tile.any():
            names.append("")
            continue
        data = encode(tile)
        name = name_for(data)
        names.append(name)
        files[name] = data
    return names, files


def build(corridor: str, world_dir: Path | None = None) -> dict:
    world_dir = world_dir or Path(__file__).resolve().parents[2] / "dist-world" / corridor
    manifest = json.loads((world_dir / "manifest.json").read_text())
    heights_path = world_dir / manifest["heights"]["file"]
    raw = heights_path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != manifest["heights"]["sha256"]:
        raise SystemExit(
            f"{heights_path} is not the file its manifest names "
            f"({digest[:12]} against {manifest['heights']['sha256'][:12]}); re-run `make tiles`"
        )
    tiles = np.frombuffer(raw, dtype="<i2").reshape(-1, SAMPLES * SAMPLES)
    if len(tiles) != manifest["heights"]["tiles"]:
        raise SystemExit(f"{heights_path} holds {len(tiles)} tiles, manifest says {manifest['heights']['tiles']}")

    names, files = pack(tiles)

    out = world_dir / SUBDIR
    out.mkdir(exist_ok=True)
    for name, data in files.items():
        path = out / f"{name}.bin"
        if not path.exists() or path.read_bytes() != data:
            path.write_bytes(data)
    # Files a previous build wrote and this one does not name. Left behind they
    # would be served forever and nothing would ever fetch them.
    stale = [p for p in out.glob("*.bin") if p.stem not in files]
    for p in stale:
        p.unlink()

    zeros = names.count("")
    index = {
        "version": INDEX_VERSION,
        "codec": CODEC,
        "tileSamples": SAMPLES,
        "heightsSha256": digest,
        "window": manifest["window"],
        "order": manifest["heights"]["order"],
        "tiles": len(names),
        "files": len(files),
        "bytes": sum(len(d) for d in files.values()),
        "names": names,
    }
    (out / INDEX).write_text(json.dumps(index, separators=(",", ":")) + "\n")
    index_bytes = (out / INDEX).stat().st_size
    print(
        f"packed {len(names)} tiles into {len(files)} files, "
        f"{index['bytes'] / 1e6:.2f} MB against {len(raw) / 1e6:.2f} MB of heights.bin "
        f"(mean {index['bytes'] / max(1, len(files)) / 1e3:.2f} kB); "
        f"{zeros} tiles of zeros have no file and {len(names) - zeros - len(files)} "
        f"share one with an identical tile; index {index_bytes / 1e3:.1f} kB"
        + (f"; {len(stale)} stale file(s) removed" if stale else "")
    )
    return index


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Cut a built world into one file per tile.")
    parser.add_argument("--corridor", default="sea-to-sky", choices=sorted(CORRIDORS))
    parser.add_argument("--world", type=Path, default=None, help="the built world's directory")
    args = parser.parse_args(argv)
    build(args.corridor, args.world)
    return 0


if __name__ == "__main__":
    sys.exit(main())
