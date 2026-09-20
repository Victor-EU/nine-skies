"""Stage 1 — acquire Copernicus GLO-30 tiles (build plan, workstream A).

The AWS Open Data mirror serves this bucket anonymously over plain HTTPS, so
this stage needs no AWS CLI, no credentials and no account. That matters more
than convenience: a pipeline stage that depends on a signed-in tool is a stage
that only runs on the machine it was written on.

Downloads are resumable and idempotent. A tile whose local size already
matches the server's Content-Length is left alone, so re-running after an
interruption costs one HEAD per tile and nothing else.
"""

from __future__ import annotations

import argparse
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .grid import CORRIDORS, LonLatBox

BUCKET = "https://copernicus-dem-30m.s3.amazonaws.com"
TILE_LIST = f"{BUCKET}/tileList.txt"

# The bucket names tiles by the south-west corner of the one-degree cell.
TILE_RE = re.compile(r"Copernicus_DSM_COG_10_N(\d{2})_00_E(\d{3})_00_DEM$")


def _ssl_context() -> ssl.SSLContext:
    """A verified context that does not depend on the machine's setup.

    The python.org macOS build ships no CA bundle, so `urllib` cannot verify
    anything until somebody runs Install Certificates.command by hand. certifi
    arrives with rasterio anyway; using it keeps verification on and keeps the
    stage runnable on a fresh checkout.
    """
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


SSL_CONTEXT = _ssl_context()


#: Re-exported so callers can say `from .acquire import CORRIDORS`. The boxes
#: themselves live in `grid.py`, next to the projection they are reprojected by.
__all__ = ["CORRIDORS", "LonLatBox", "main", "tile_name", "tile_url"]


def tile_name(lat: int, lon: int) -> str:
    return f"Copernicus_DSM_COG_10_N{lat:02d}_00_E{lon:03d}_00_DEM"


def tile_url(name: str) -> str:
    return f"{BUCKET}/{name}/{name}.tif"


def parse_tile_list(text: str) -> set[tuple[int, int]]:
    """Cells present in the bucket. Ocean-only cells are simply absent."""
    cells: set[tuple[int, int]] = set()
    for line in text.splitlines():
        match = TILE_RE.match(line.strip())
        if match:
            cells.add((int(match.group(1)), int(match.group(2))))
    return cells


def load_tile_list(cache: Path) -> set[tuple[int, int]]:
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(TILE_LIST, timeout=120, context=SSL_CONTEXT) as response:
            cache.write_bytes(response.read())
    return parse_tile_list(cache.read_text())


def remote_size(name: str, retries: int = 3) -> int | None:
    """Content-Length, or None if the tile is not in the bucket."""
    request = urllib.request.Request(tile_url(name), method="HEAD")
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=60, context=SSL_CONTEXT) as response:
                return int(response.headers["Content-Length"])
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            if attempt == retries - 1:
                raise
        except OSError:
            if attempt == retries - 1:
                raise
        time.sleep(1.5 * (attempt + 1))
    return None


def fetch(name: str, dest: Path, retries: int = 3) -> tuple[str, int, bool]:
    """Download one tile. Returns (name, bytes, downloaded)."""
    target = dest / f"{name}.tif"
    size = remote_size(name)
    if size is None:
        return (name, 0, False)
    if target.exists() and target.stat().st_size == size:
        return (name, size, False)

    partial = target.with_suffix(".tif.part")
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(
                tile_url(name), timeout=300, context=SSL_CONTEXT
            ) as response:
                with open(partial, "wb") as handle:
                    while chunk := response.read(1 << 20):
                        handle.write(chunk)
            if partial.stat().st_size != size:
                raise OSError(f"{name}: got {partial.stat().st_size} of {size} bytes")
            partial.replace(target)
            return (name, size, True)
        except (OSError, urllib.error.HTTPError):
            partial.unlink(missing_ok=True)
            if attempt == retries - 1:
                raise
            time.sleep(2.0 * (attempt + 1))
    return (name, 0, False)


def data_root() -> Path:
    """Where the source cache lives. Overridable, because 13 GB is a choice."""
    env = os.environ.get("NINESKIES_DATA")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[2] / "data"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Acquire Copernicus GLO-30 tiles.")
    parser.add_argument("--corridor", default="sea-to-sky", choices=sorted(CORRIDORS))
    parser.add_argument("--dest", type=Path, default=None)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="HEAD every tile and report the total download size, writing nothing.",
    )
    args = parser.parse_args(argv)

    root = data_root()
    dest = args.dest or root / "source" / "cop30"
    dest.mkdir(parents=True, exist_ok=True)

    box = CORRIDORS[args.corridor]
    present = load_tile_list(root / "source" / "tileList.txt")
    cells = [cell for cell in box.cells() if cell in present]
    names = [tile_name(lat, lon) for lat, lon in cells]
    absent = len(box.cells()) - len(cells)
    print(
        f"{args.corridor}: {len(box.cells())} cells, {len(names)} in the bucket, "
        f"{absent} open ocean",
        flush=True,
    )

    if args.dry_run:
        with ThreadPoolExecutor(max_workers=args.workers * 2) as pool:
            sizes = [s or 0 for s in pool.map(remote_size, names)]
        have = sum(
            (dest / f"{n}.tif").stat().st_size
            for n in names
            if (dest / f"{n}.tif").exists()
        )
        total = sum(sizes)
        print(f"total {total / 1e9:.2f} GB; {have / 1e9:.2f} GB already local")
        print(f"to fetch {(total - have) / 1e9:.2f} GB into {dest}")
        return 0

    started = time.time()
    done = fetched = written = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for name, size, downloaded in pool.map(lambda n: fetch(n, dest), names):
            done += 1
            if downloaded:
                fetched += 1
                written += size
            if done % 20 == 0 or done == len(names):
                elapsed = time.time() - started
                rate = written / elapsed / 1e6 if elapsed else 0.0
                print(
                    f"  {done}/{len(names)} tiles · {written / 1e9:.2f} GB "
                    f"· {rate:.1f} MB/s · {elapsed:.0f}s",
                    flush=True,
                )

    print(f"done: {fetched} downloaded, {len(names) - fetched} already present")
    return 0


if __name__ == "__main__":
    sys.exit(main())
