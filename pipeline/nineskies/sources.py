"""The digests of the source rasters a world was built from (build plan, D24).

Every other link in the chain from published elevation to committed number is
now checkable. A route section is signed by the machine that cut it (D23); the
section names the heightfield's SHA and `loadCorridor` measures it rather than
believing the manifest; the projection both ends depend on is a committed
table PROJ re-derives (D22). The first link was the one nobody could check:
`acquire` verified a download by its byte count and recorded nothing about its
content, so "the corridor was built from the tiles the mirror served" was a
sentence with no evidence behind it. A tile that arrived intact but wrong was
indistinguishable from one that arrived right.

The expectation was that fixing this would only ever be trust-on-first-use --
a digest of whatever we happened to download, checkable afterwards against
nothing but itself. It is not, and the reason is worth writing down: **S3
returns the object's MD5 as its ETag on every request**, including the HEAD
that `acquire` already performs on every tile of every run, and this pipeline
was discarding it. Copernicus GLO-30 objects are single-part uploads, so the
ETag is the plain content digest and not the `md5-of-md5s-N` form a multipart
upload would give. Measured on N29/E091: local MD5 and served ETag agree on
14562d345e9a55dc14e40344e86e524f across 38,500,243 bytes.

So a recorded digest is third-party evidence, not a note to self. Two are
kept per tile. MD5 is the one the mirror publishes and therefore the only one
that can ever be checked against anybody but us; SHA-256 is what local
verification uses afterwards, because MD5 is fine against a truncated transfer
and worthless against a chosen collision, and the point of the second digest
is that the first one's weakness does not propagate.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

SOURCES_VERSION = 1

#: Committed, and therefore in the repository rather than beside the rasters.
#: ~45 kB for the corridor's 331 tiles and one line per tile, so a re-record
#: that changes one tile is a one-line diff.
SOURCES_FILE = Path("pipeline") / "sources" / "cop30.json"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def sources_path(root: Path | None = None) -> Path:
    return (root or repo_root()) / SOURCES_FILE


def digest_file(path: Path) -> dict[str, object]:
    """Both digests in one pass over the file, because 13 GB is two minutes."""
    md5, sha = hashlib.md5(), hashlib.sha256()
    with open(path, "rb") as handle:
        while chunk := handle.read(1 << 20):
            md5.update(chunk)
            sha.update(chunk)
    return {
        "bytes": path.stat().st_size,
        "md5": md5.hexdigest(),
        "sha256": sha.hexdigest(),
    }


def digest_of(names: list[str], digests: dict) -> str:
    """One digest standing for a set of tiles, in a fixed order.

    This is what a corridor manifest records instead of several thousand
    lines of hashes: change any tile, add one or drop one, and it moves. It
    is a digest of digests, so it says which *recorded* tiles went in and
    inherits whatever the record is worth -- which, since every entry was
    corroborated against the mirror's ETag, is more than a self-signed number.
    """
    sha = hashlib.sha256()
    for name in sorted(names):
        entry = digests.get(name)
        sha.update(f"{name} {entry['sha256'] if entry else 'MISSING'}\n".encode())
    return sha.hexdigest()


def read(root: Path | None = None) -> dict:
    path = sources_path(root)
    if not path.exists():
        return {"version": SOURCES_VERSION, "bucket": "", "digests": {}}
    return json.loads(path.read_text())


def render(doc: dict) -> str:
    """One line per tile, so a re-record reads as a diff and not as a rewrite."""
    digests = doc["digests"]
    rows = [
        f'    {json.dumps(name)}: {json.dumps(digests[name], sort_keys=True)}'
        for name in sorted(digests)
    ]
    head = json.dumps({**doc, "digests": "@@DIGESTS@@"}, indent=2, sort_keys=False)
    return head.replace('"@@DIGESTS@@"', "{\n" + ",\n".join(rows) + "\n  }") + "\n"


def write(doc: dict, root: Path | None = None) -> tuple[Path, bool]:
    path = sources_path(root)
    text = render(doc)
    changed = not path.exists() or path.read_text() != text
    if changed:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    return path, changed


def verify(dest: Path, names: list[str], doc: dict | None = None) -> list[str]:
    """Why these local tiles are not the ones recorded. Empty means they are.

    Reads SHA-256 only. The MD5 in the record is the mirror's word and was
    checked against it when the tile arrived; re-checking it here would only
    ask whether this machine can still compute MD5.
    """
    digests = (doc or read())["digests"]
    problems: list[str] = []
    for name in names:
        recorded = digests.get(name)
        if recorded is None:
            problems.append(f"{name}: no digest recorded; run `make sources`")
            continue
        path = dest / f"{name}.tif"
        if not path.exists():
            problems.append(f"{name}: recorded but not on disk")
            continue
        if path.stat().st_size != recorded["bytes"]:
            problems.append(
                f"{name}: {path.stat().st_size} bytes on disk, {recorded['bytes']} recorded"
            )
            continue
        actual = digest_file(path)["sha256"]
        if actual != recorded["sha256"]:
            problems.append(
                f"{name}: sha256 {actual[:12]}… on disk, {recorded['sha256'][:12]}… recorded"
            )
    return problems


def record(corridor: str, workers: int = 8) -> dict:
    """HEAD every tile, hash the local copy, and keep both digests.

    The only step that talks to the mirror on purpose. It is one HEAD per
    tile and nothing is downloaded: what it is fetching is the ETag, which is
    the whole reason these digests are evidence rather than a note to self.
    """
    # Local, because `acquire` imports this module to verify its downloads.
    from concurrent.futures import ThreadPoolExecutor

    from . import acquire

    dest = acquire.data_root() / "source" / "cop30"
    box = acquire.CORRIDORS[corridor]
    present = acquire.load_tile_list(acquire.data_root() / "source" / "tileList.txt")
    names = [acquire.tile_name(lat, lon) for lat, lon in box.cells() if (lat, lon) in present]

    with ThreadPoolExecutor(max_workers=workers) as pool:
        heads = dict(zip(names, pool.map(acquire.remote_head, names)))

    doc = read()
    doc["version"] = SOURCES_VERSION
    doc["bucket"] = acquire.BUCKET
    digests = dict(doc.get("digests", {}))

    missing, disagreed, unserved = [], [], []
    for name in names:
        path = dest / f"{name}.tif"
        if not path.exists():
            missing.append(name)
            continue
        entry = digest_file(path)
        head = heads.get(name)
        served = acquire.content_md5(head[1]) if head else None
        if served is None:
            unserved.append(name)
        elif served != entry["md5"]:
            disagreed.append(f"{name}: local {entry['md5'][:12]}…, mirror {served[:12]}…")
            continue
        digests[name] = entry

    doc["digests"] = digests
    # The set this corridor is built from, as one number. A section records
    # it, so a committed route names the exact rasters its ground came from
    # without carrying several hundred hashes around (D24).
    corridors = dict(doc.get("corridors", {}))
    corridors[corridor] = {"tiles": len(names), "sha256": digest_of(names, digests)}
    doc["corridors"] = corridors
    if disagreed:
        raise SystemExit(
            "local tiles disagree with the mirror, so nothing was recorded:\n  "
            + "\n  ".join(disagreed)
        )
    print(f"{corridor}: {len(names)} tiles · {len(digests)} recorded", flush=True)
    if unserved:
        # Not a failure: the record is still the local truth, it just stops
        # being third-party evidence for those tiles and should say so.
        print(f"  {len(unserved)} served no usable ETag — recorded, not corroborated")
    if missing:
        print(f"  {len(missing)} not on disk — run `make acquire` first")
    return doc


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Source raster digests (D24).")
    parser.add_argument("--corridor", default="sea-to-sky")
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Check local tiles against the committed digests. No network.",
    )
    args = parser.parse_args(argv)

    if args.verify:
        from . import acquire

        dest = acquire.data_root() / "source" / "cop30"
        doc = read()
        names = sorted(doc["digests"])
        problems = verify(dest, names, doc)
        for problem in problems:
            print(f"  ✗ {problem}")
        print(f"{len(names)} recorded tile(s), {len(problems)} problem(s)")
        return 1 if problems else 0

    path, changed = write(record(args.corridor))
    print(f"{'wrote' if changed else 'unchanged'} {path}")
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
