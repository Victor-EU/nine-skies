"""Stage 11 — the heights as one file per tile, so a world streams (F67), and the
horizon field in the same codec (F69).

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
engine makes the zeros itself. Two tiles that are the same are one file. On
the country that was 30 tiles, and it turned out to be a finding rather than a
saving: they were all 1,044 m, the lower Tarim poured flat at Bosten Lake's
floor (F67, F68), and since that was put right no two land tiles are the same.
The index lists a file by its digest alone, and the engine adds the `.bin`.

**The horizon field is coded the same way, as one 841 × 553 field** (F69).
It is fetched before the first frame, and raw it was 930 kB of the 1.55 MB
first flight cost. Coded, it is 353 kB on the country and 75 kB on the
corridor, whose field is country-sized and mostly zeros. A 2-D predictor did
3 % better, which is not worth a second decoder. The index names the file and
the digest of the `horizon.bin` it was coded from, and the engine fetches the
raw file whenever the two disagree.

**The water layer rides beside the heights, a file per tile that has any**
(F72). `make water` cuts four bytes a sample in the tiles' own layout; here a
tile of it is gzip over those bytes as they lie, which on the corridor was
smaller than byte planes or deltas (0.34 MB against 0.37 and 0.42 for its 672
wet tiles): most of a tile is the same four bytes. A dry tile has no file, and
every tile of open sea is one file. The index names each tile's file as it
does the heights', and the `heights.bin` the layer was cut against, which has
to be this package's.

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
#: The water layer's, which the engine checks the same way (F72).
WATER_CODEC = "rgba8-gzip"
INDEX_VERSION = 1
#: 64 bits of a SHA-256. The country has 4,665 files, so a collision is a
#: one-in-10^12 event; the index is what stops being small first.
NAME_HEX = 16
SUBDIR = "tiles"
INDEX = "index.json"
SAMPLES = grid.TILE_SAMPLES


def delta(field: np.ndarray, width: int = SAMPLES) -> np.ndarray:
    """Each sample less its west neighbour; the first column less its south one.

    A field is rows of `width` samples, south first: a tile is 65 of 65, and
    the horizon field 553 of 841.
    """
    t = field.astype(np.int16).reshape(-1, width)
    out = np.empty_like(t)
    with np.errstate(over="ignore"):
        out[:, 1:] = t[:, 1:] - t[:, :-1]
        out[1:, 0] = t[1:, 0] - t[:-1, 0]
    out[0, 0] = t[0, 0]
    return out


def undelta(d: np.ndarray, width: int = SAMPLES) -> np.ndarray:
    """The inverse, in the same wrapping arithmetic."""
    d = d.astype(np.int16).reshape(-1, width)
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


def encode(field: np.ndarray, width: int = SAMPLES) -> bytes:
    return gzip.compress(planes(delta(field, width)), compresslevel=9, mtime=0)


def decode(data: bytes, width: int = SAMPLES) -> np.ndarray:
    return undelta(unplanes(gzip.decompress(data)), width)


def encode_water(tile: np.ndarray) -> bytes:
    """A tile of the water layer: its bytes as they lie, under gzip (F72)."""
    return gzip.compress(np.ascontiguousarray(tile, dtype=np.uint8).tobytes(), compresslevel=9, mtime=0)


def decode_water(data: bytes, channels: int = 4) -> np.ndarray:
    return np.frombuffer(gzip.decompress(data), dtype=np.uint8).reshape(SAMPLES, SAMPLES, channels)


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


def horizon(world_dir: Path, manifest: dict) -> tuple[dict, bytes]:
    """The horizon field in the tiles' codec, and the index's entry for it.

    The entry names the digest of the raw `horizon.bin` it was coded from,
    which the manifest also names, so a field reduced again since is seen by
    the engine as not this package's and fetched raw.
    """
    entry = manifest["horizon"]
    path = world_dir / entry["file"]
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != entry.get("sha256"):
        raise SystemExit(
            f"{path} is not the file its manifest names "
            f"({digest[:12]} against {str(entry.get('sha256'))[:12]}); re-run `make tiles`"
        )
    width, height = entry["width"], entry["height"]
    field = np.frombuffer(raw, dtype="<i2")
    if field.size != width * height:
        raise SystemExit(f"{path} holds {field.size} samples, manifest says {width} x {height}")
    data = encode(field, width)
    return {
        "name": name_for(data),
        "width": width,
        "height": height,
        "sha256": digest,
        "bytes": len(data),
    }, data


def water(world_dir: Path, manifest: dict) -> tuple[dict, dict[str, bytes]] | None:
    """The water layer a file per wet tile, and the index's entry for it; None
    for a world `make water` has not been run on.

    Refused when `water.bin` is not the file `water.json` names, or was cut
    against other heights than this manifest's: a river drawn on ground that
    has moved since is a river on a hillside.
    """
    from . import water as water_

    record_path = world_dir / "water.json"
    if not record_path.exists():
        return None
    record = json.loads(record_path.read_text())
    path = world_dir / record["file"]
    raw = path.read_bytes() if path.exists() else b""
    digest = hashlib.sha256(raw).hexdigest()
    if digest != record.get("sha256"):
        raise SystemExit(f"{path} is not the file {record_path.name} names; re-run `make water`")
    if record.get("heightsSha256") != manifest["heights"]["sha256"]:
        raise SystemExit(
            f"{path.name} was cut against heights {str(record.get('heightsSha256'))[:12]} and "
            f"the manifest names {manifest['heights']['sha256'][:12]}; re-run `make water`"
        )
    per_tile = SAMPLES * SAMPLES * record["channels"]
    if len(raw) != manifest["heights"]["tiles"] * per_tile:
        raise SystemExit(f"{path} holds {len(raw) // per_tile} tiles, manifest says {manifest['heights']['tiles']}")
    tiles = np.frombuffer(raw, dtype=np.uint8).reshape(-1, SAMPLES, SAMPLES, record["channels"])
    names: list[str] = []
    files: dict[str, bytes] = {}
    for tile in tiles:
        if not water_.has_water(tile):
            names.append("")
            continue
        data = encode_water(tile)
        name = name_for(data)
        names.append(name)
        files[name] = data
    entry = {
        "codec": WATER_CODEC,
        "channels": record["channels"],
        "layout": record["layout"],
        "offsetStepM": record["offsetStepM"],
        "offsetZero": record["offsetZero"],
        "reachM": record["reachM"],
        "classes": record["classes"],
        "sha256": digest,
        "heightsSha256": record["heightsSha256"],
        "files": len(files),
        "bytes": sum(len(d) for d in files.values()),
        "names": names,
    }
    return entry, files


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
    horizon_entry, horizon_data = horizon(world_dir, manifest)
    wet = water(world_dir, manifest)
    water_entry, water_files = wet if wet else (None, {})
    written = {**files, **water_files, horizon_entry["name"]: horizon_data}

    out = world_dir / SUBDIR
    out.mkdir(exist_ok=True)
    for name, data in written.items():
        path = out / f"{name}.bin"
        if not path.exists() or path.read_bytes() != data:
            path.write_bytes(data)
    # Files a previous build wrote and this one does not name. Left behind they
    # would be served forever and nothing would ever fetch them.
    stale = [p for p in out.glob("*.bin") if p.stem not in written]
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
        "horizon": horizon_entry,
    }
    if water_entry is not None:
        index["water"] = water_entry
    (out / INDEX).write_text(json.dumps(index, separators=(",", ":")) + "\n")
    index_bytes = (out / INDEX).stat().st_size
    print(
        f"packed {len(names)} tiles into {len(files)} files, "
        f"{index['bytes'] / 1e6:.2f} MB against {len(raw) / 1e6:.2f} MB of heights.bin "
        f"(mean {index['bytes'] / max(1, len(files)) / 1e3:.2f} kB); "
        f"{zeros} tiles of zeros have no file and {len(names) - zeros - len(files)} "
        f"share one with an identical tile; horizon field {horizon_entry['bytes'] / 1e3:.1f} kB "
        f"against {horizon_entry['width'] * horizon_entry['height'] * 2 / 1e3:.1f} kB raw; "
        f"index {index_bytes / 1e3:.1f} kB; "
        + (
            f"water {water_entry['files']} files, {water_entry['bytes'] / 1e3:.1f} kB for "
            f"{len(water_entry['names']) - water_entry['names'].count('')} wet tiles"
            if water_entry is not None
            else "no water layer: run `make water`"
        )
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
