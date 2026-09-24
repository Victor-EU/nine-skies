"""Stage 12c — the walls' rock, from photographed cliff faces (F92).

The ground's colour is a photograph taken from above (`imagery.py`), and the
film draws relief six times steeper than the ground's (F14). A slope of 45
degrees stands on screen at 80, with six times the surface its photograph
covers: the photograph's texels are drawn down it as streaks, and five parts
in six of any wall have no picture at all. The engine lays a photographed
rock face there instead, tinted to the scene's rock and mapped on the wall
itself (`engine/src/terrain/rock.ts`).

**The source.** Poly Haven's scanned textures. Every asset there is CC0
(https://polyhaven.com/license, read 24 September 2026): "You can use our
assets for any purpose" and "You do not need to give credit". They are
credited anyway, in `NOTICE.md`. Four faces, one for each kind of rock the
film's walls are, each a real surface a few metres to a dozen across, a
drone's or a camera's scan with its colour, its normals and its height:

| Rock | Scan | Across | Scenes |
| --- | --- | --- | --- |
| limestone | Marble Cliff 04 | 12.7 m | the Three Gorges, Karst, the First Bend |
| granite | Marble Cliff 03 | 5.7 m | Huangshan |
| dark | Dark Rock 02 | 2.0 m | the Roof, the Wall |
| sediment | Cliff Side | 1.8 m | Loess, Heaven Lake, Below the Sea |

**What is cut.** Each face at `SAMPLES` a side, from the 2k JPEGs:
- `<rock>.webp`: its colour, and in alpha its height as a percentile, so a
  threshold at 1 - s leaves the share s of the face standing out. The
  engine lays the rock there and the vegetation in what is below it.
- `<rock>-normal.webp`: its normals, OpenGL's convention (+y up the image).
- `index.json`: each face's source, authors, size and mean linear colour,
  which the engine divides out to tint the face to the scene's rock.

    python -m nineskies.rock fetch      # into data/source/polyhaven/, once
    python -m nineskies.rock cut        # into dist-world/china/rock/
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .acquire import SSL_CONTEXT, data_root

SITE = "Poly Haven"
LICENCE = "CC0 1.0"
LICENCE_URL = "https://polyhaven.com/license"
FILE_URL = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/{id}/{id}_{map}_2k.jpg"
INFO_URL = "https://api.polyhaven.com/info/{id}"
USER_AGENT = "nine-skies-pipeline/1 (a research film; fetches each file once and caches it)"
#: The maps a face is cut from: colour, normals (OpenGL), height.
MAPS = ("diff", "nor_gl", "disp")
#: Samples a side of a cut face.
SAMPLES = 1024
WEBP_QUALITY = 90
INDEX_VERSION = 1


@dataclass(frozen=True)
class Rock:
    name: str
    scan: str


ROCKS = (
    Rock("limestone", "marble_cliff_04"),
    Rock("granite", "marble_cliff_03"),
    Rock("dark", "dark_rock_02"),
    Rock("sediment", "cliff_side"),
)


def source_dir(root: Path | None = None) -> Path:
    return (root or data_root()) / "source" / "polyhaven"


def get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, context=SSL_CONTEXT, timeout=120) as response:
        return response.read()


def fetch(rocks: tuple[Rock, ...] = ROCKS, root: Path | None = None) -> dict[str, int]:
    """Each face's maps and description into the cache, once."""
    counts = {"cached": 0, "fetched": 0}
    for rock in rocks:
        here = source_dir(root) / rock.scan
        wanted = [(f"{rock.scan}_{m}_2k.jpg", FILE_URL.format(id=rock.scan, map=m)) for m in MAPS]
        wanted.append(("info.json", INFO_URL.format(id=rock.scan)))
        for name, url in wanted:
            dest = here / name
            if dest.exists():
                counts["cached"] += 1
                continue
            body = get(url)
            dest.parent.mkdir(parents=True, exist_ok=True)
            tmp = dest.with_suffix(".part")
            tmp.write_bytes(body)
            tmp.replace(dest)
            counts["fetched"] += 1
            print(f"{dest.relative_to(source_dir(root).parent)}: {len(body) / 1e6:.1f} MB", flush=True)
    return counts


def read_map(path: Path) -> np.ndarray:
    """A map as (rows, cols, bands), 0 to 1."""
    import warnings

    from rasterio.io import MemoryFile

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # a JPEG is not georeferenced
        with MemoryFile(path.read_bytes()) as memory, memory.open() as ds:
            data = ds.read()
    return np.moveaxis(data, 0, -1).astype(np.float64) / 255.0


def shrink(image: np.ndarray, samples: int) -> np.ndarray:
    """Down to `samples` a side by averaging whole blocks: the scans are tileable, and stay so."""
    h, w = image.shape[:2]
    if h % samples or w % samples:
        raise ValueError(f"a {w} x {h} map does not divide into {samples}")
    k = h // samples
    shape = (samples, k, samples, k) + image.shape[2:]
    return image.reshape(shape).mean(axis=(1, 3))


def percentile(height: np.ndarray) -> np.ndarray:
    """Each sample's rank among the face's heights, 0 to 1."""
    flat = height.ravel()
    order = np.argsort(flat, kind="stable")
    rank = np.empty(flat.size)
    rank[order] = np.arange(flat.size) / (flat.size - 1)
    return rank.reshape(height.shape)


def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def encode(pixels: np.ndarray) -> bytes:
    """(rows, cols, 3 or 4), 0 to 1, as WebP."""
    import warnings

    from rasterio.io import MemoryFile

    data = np.moveaxis(np.clip(np.round(pixels * 255.0), 0, 255).astype(np.uint8), -1, 0)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with MemoryFile() as memory:
            with memory.open(
                driver="WEBP", width=data.shape[2], height=data.shape[1], count=data.shape[0], dtype="uint8", QUALITY=WEBP_QUALITY
            ) as ds:
                ds.write(data)
            return memory.read()


def name_of(stem: str, body: bytes) -> str:
    return f"{stem}-{hashlib.sha256(body).hexdigest()[:12]}.webp"


def cut_rock(rock: Rock, out: Path, root: Path | None = None) -> dict:
    here = source_dir(root) / rock.scan
    colour = shrink(read_map(here / f"{rock.scan}_diff_2k.jpg")[..., :3], SAMPLES)
    height = percentile(shrink(read_map(here / f"{rock.scan}_disp_2k.jpg")[..., 0], SAMPLES))
    normal = shrink(read_map(here / f"{rock.scan}_nor_gl_2k.jpg")[..., :3], SAMPLES) * 2.0 - 1.0
    normal /= np.maximum(np.linalg.norm(normal, axis=2, keepdims=True), 1e-6)
    albedo_body = encode(np.dstack([colour, height]))
    normal_body = encode(normal * 0.5 + 0.5)
    albedo, normals = name_of(rock.name, albedo_body), name_of(f"{rock.name}-normal", normal_body)
    (out / albedo).write_bytes(albedo_body)
    (out / normals).write_bytes(normal_body)
    info = json.loads((here / "info.json").read_text())
    size_mm = info.get("dimensions") or [0, 0]
    return {
        "name": rock.name,
        "scan": rock.scan,
        "title": info.get("name", rock.scan),
        "url": f"https://polyhaven.com/a/{rock.scan}",
        "authors": sorted(info.get("authors", {})),
        "acrossM": round(size_mm[0] / 1000.0, 2),
        "samples": SAMPLES,
        "albedo": albedo,
        "normal": normals,
        "meanLinear": [round(float(v), 4) for v in srgb_to_linear(colour).reshape(-1, 3).mean(axis=0)],
        "bytes": len(albedo_body) + len(normal_body),
    }


def cut(world: Path, rocks: tuple[Rock, ...] = ROCKS, root: Path | None = None) -> dict:
    out = world / "rock"
    out.mkdir(parents=True, exist_ok=True)
    faces = [cut_rock(rock, out, root) for rock in rocks]
    keep = {f[k] for f in faces for k in ("albedo", "normal")} | {"index.json"}
    for stale in out.iterdir():
        if stale.name not in keep:
            stale.unlink()
    index = {
        "version": INDEX_VERSION,
        "source": SITE,
        "licence": LICENCE,
        "licenceUrl": LICENCE_URL,
        "rocks": faces,
    }
    (out / "index.json").write_text(json.dumps(index, indent=2) + "\n")
    return index


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="The walls' rock, from Poly Haven's scanned cliff faces.")
    parser.add_argument("step", choices=["fetch", "cut"])
    parser.add_argument("--world", type=Path, default=Path("dist-world/china"))
    args = parser.parse_args(argv)
    if args.step == "fetch":
        counts = fetch()
        print(f"{counts['fetched']} fetched, {counts['cached']} cached, under {source_dir()}")
        return 0
    index = cut(args.world)
    for f in index["rocks"]:
        print(f"{f['name']}: {f['title']}, {f['acrossM']} m, {f['bytes'] / 1e6:.2f} MB")
    print(f"{sum(f['bytes'] for f in index['rocks']) / 1e6:.2f} MB into {args.world / 'rock'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
