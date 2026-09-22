"""Stage 3's river network and D9's other vectors -- priced, pinned, and
fetched only by a command that names its licence (F59, D60).

Every source raster in this build came through `acquire.py`, and each one is
corroborated by the mirror's own ETag (D24). Stage 3 needs a second kind of
source: one vector file per product, from publishers other than that mirror.
Three candidates carry what the stage still lacks -- which closed basin is a
clipped meander and which is a lake that never had an outlet -- and they differ
less in bytes than in what downloading them commits the build to. For two of
the three the download is itself acceptance of terms: HydroSHEDS' agreement
binds whoever exercises any right in the data, and HydroATLAS says the same
of downloading. So a fetch here is never a side effect of a build. It names
the licence it accepts, and it refuses when that is not the source's licence.

Each source is pinned to the digest its publisher serves, measured by HEAD
when it was priced. Backblaze B2 sends `x-bz-content-sha1`, S3 sends the MD5
of a single-part upload as its ETag, and figshare publishes `computed_md5`
through its API. The bytes that arrive have to hash to the pin. A publisher
that replaces a file under the same name is refused rather than used, and is
refused before the download, because a HEAD that disagrees with the pin says
so for the price of one request.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping
from urllib.parse import urlparse

from . import acquire, sources

VECTORS_VERSION = 1

#: Committed beside the raster record, and written only by a fetch: it names
#: the licence each file was accepted under, so the repository says which
#: terms a world was built under as well as which bytes.
VECTORS_FILE = Path("pipeline") / "sources" / "vectors.json"

#: When every pin below was measured.
PRICED = "2026-09-22"


class Refused(Exception):
    """A fetch that would have accepted the wrong terms or the wrong bytes."""


@dataclass(frozen=True)
class Licence:
    id: str
    name: str
    url: str
    #: Whether the publisher says that downloading is acceptance of the terms.
    binds_on_download: bool
    #: What the terms ask of a build that ships something made from the data,
    #: paraphrased with the section it comes from. Read before `--accept`.
    terms: tuple[str, ...]


HYDROSHEDS_V1 = Licence(
    id="hydrosheds-v1",
    name="HydroSHEDS version 1 License Agreement (WWF)",
    url="https://data.hydrosheds.org/file/technical-documentation/HydroSHEDS_TechDoc_v1_4.pdf",
    binds_on_download=True,
    terms=(
        "free for commercial use, but shipped only inside a derivative work, never "
        "stand-alone, and only under an end-user licence at least as protective "
        "as this one (2.1.2)",
        "no reverse engineering, passed on to end users, and the data protected "
        "against unauthorised copying as the licensee's own confidential "
        "information would be (2.1.3)",
        "WWF's copyright statement in the product's documentation or metadata "
        "(2.2, Exhibit B)",
        "WWF owns modifications and improvements of the data, however developed (3)",
        "the licensee indemnifies WWF against claims from its own or its end "
        "users' use (5.2)",
        "WWF may terminate the licence at its sole discretion (7.1)",
        "two years of records of sales and of each end user's identity and "
        "address, open to WWF's inspection (10.7)",
    ),
)

CC_BY_COLLECTIVE = Licence(
    id="cc-by-4.0",
    name="CC BY 4.0, for HydroATLAS as a collective database",
    url="https://data.hydrosheds.org/file/technical-documentation/HydroATLAS_TechDoc_v10_1.pdf",
    binds_on_download=True,
    terms=(
        "attribution: Linke et al. (2019), and the source of each attribute used (4.4)",
        "each attribute column is CC BY 4.0 or ODbL 1.0, named column by column in "
        "the RiverATLAS catalog; ODbL is the share-alike licence D9 turned "
        "OpenStreetMap down for (4.1)",
        "the licences of the underpinning datasets in their original format are "
        "not affected (4.1), which is why HydroRIVERS itself is under the "
        "agreement above; which of the two covers the reach geometry inside "
        "RiverATLAS is not stated column by column",
    ),
)

PUBLIC_DOMAIN = Licence(
    id="public-domain",
    name="Natural Earth terms of use",
    url="https://www.naturalearthdata.com/about/terms-of-use/",
    binds_on_download=False,
    terms=("public domain: no permission needed and no credit required, commercial use included",),
)


@dataclass(frozen=True)
class Source:
    id: str
    title: str
    url: str
    #: The name the file is kept under in data/source/vectors/.
    filename: str
    bytes: int
    #: The publisher's own digest as (algorithm, hex), measured when priced.
    pin: tuple[str, str]
    #: How the publisher says it: "b2", "s3" or "figshare".
    publisher: str
    licence: Licence
    #: What it answers for stage 3, in a line.
    carries: str
    #: For figshare, the article whose metadata carries the digest.
    api: str | None = None


SOURCES: tuple[Source, ...] = (
    Source(
        id="hydrorivers-as",
        title="HydroRIVERS v1.0, Central and South-East Asia, shapefile",
        url="https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_as_shp.zip",
        filename="HydroRIVERS_v10_as_shp.zip",
        bytes=90_510_995,
        pin=("sha1", "71a92a2defcee8cf8294544a7dfc93c2c1281c3c"),
        publisher="b2",
        licence=HYDROSHEDS_V1,
        carries="every reach draining 10 km² or 0.1 m³/s, traced at 15″, with "
        "NEXT_DOWN, ENDORHEIC, Strahler order and discharge; no names",
    ),
    Source(
        id="riveratlas",
        title="RiverATLAS v1.0 (HydroATLAS), global, shapefiles by region",
        url="https://figshare.com/ndownloader/files/20087486",
        filename="RiverATLAS_Data_v10_shp.zip",
        bytes=2_418_581_202,
        pin=("md5", "7a6d74226ce8fe6e7e0eb20e2abe71ee"),
        publisher="figshare",
        api="https://api.figshare.com/v2/articles/9890531",
        licence=CC_BY_COLLECTIVE,
        carries="the same reaches and the same HydroRIVERS columns, plus 281 "
        "environmental attributes; one download for the whole globe",
    ),
    Source(
        id="ne-rivers",
        title="Natural Earth 1:10m rivers and lake centrelines",
        url="https://naciscdn.org/naturalearth/10m/physical/ne_10m_rivers_lake_centerlines.zip",
        filename="ne_10m_rivers_lake_centerlines.zip",
        bytes=2_079_507,
        pin=("md5", "686e256cbb714e63ab7728aeda7a269d"),
        publisher="s3",
        licence=PUBLIC_DOMAIN,
        carries="the major rivers only, from World Data Bank 2 placed against SRTM "
        "Plus, with names and a scale rank; no endorheic flag, no stream order, and "
        "effective to about 1:30 million by its publisher's account",
    ),
    Source(
        id="ne-lakes",
        title="Natural Earth 1:10m lakes",
        url="https://naciscdn.org/naturalearth/10m/physical/ne_10m_lakes.zip",
        filename="ne_10m_lakes.zip",
        bytes=2_349_685,
        pin=("md5", "06c430248e291f69d856f4d7f9967968"),
        publisher="s3",
        licence=PUBLIC_DOMAIN,
        carries="lake and reservoir outlines with names, at 1:10 million; D9's "
        "lakes whichever river network is chosen",
    ),
)

BY_ID = {source.id: source for source in SOURCES}

HEX = {"md5": 32, "sha1": 40}

#: Where each publisher says its digest, for the price list.
SAYS = {
    "b2": "serves as x-bz-content-sha1",
    "s3": "serves as its ETag",
    "figshare": "publishes through its API",
}


def data_dir() -> Path:
    return acquire.data_root() / "source" / "vectors"


# ------------------------------------------------------------------ digests


def served_digest(publisher: str, headers: Mapping[str, str]) -> str | None:
    """The digest a response's headers carry, or None where they carry none.

    B2 writes `none` for a file uploaded in parts, which is its version of
    S3's multipart ETag: the global HydroRIVERS file is served that way, and
    the regional one is not. An uploader can still attach a whole-file SHA-1
    to such a file, and B2 then serves it under a second name.
    """
    lower = {key.lower(): value for key, value in headers.items()}
    if publisher == "b2":
        value = (lower.get("x-bz-content-sha1") or "").strip().lower()
        if value in ("", "none"):
            value = (lower.get("x-bz-info-large_file_sha1") or "").strip().lower()
        return value if re.fullmatch(r"[0-9a-f]{40}", value) else None
    if publisher == "s3":
        return acquire.content_md5(lower.get("etag"))
    return None


def digest_file(path: Path, algorithm: str) -> dict[str, object]:
    """The publisher's digest and SHA-256 in one pass, and the size."""
    theirs, ours = hashlib.new(algorithm), hashlib.sha256()
    with open(path, "rb") as handle:
        while chunk := handle.read(1 << 20):
            theirs.update(chunk)
            ours.update(chunk)
    return {
        "bytes": path.stat().st_size,
        algorithm: theirs.hexdigest(),
        "sha256": ours.hexdigest(),
    }


#: data.hydrosheds.org sits behind Cloudflare, which answers `Python-urllib/3`
#: with a 403 and any other agent with the file (F59). The pipeline says what
#: it is instead of borrowing a browser's name.
USER_AGENT = "nineskies-pipeline/1"


def _open(request: urllib.request.Request | str, timeout: float):
    if isinstance(request, str):
        request = urllib.request.Request(request)
    request.add_header("User-Agent", USER_AGENT)
    context = acquire.SSL_CONTEXT if request.full_url.startswith("https:") else None
    return urllib.request.urlopen(request, timeout=timeout, context=context)


def remote(source: Source, timeout: float = 60) -> tuple[int, str | None]:
    """What the publisher serves today, as (bytes, digest). Nothing is downloaded.

    For figshare it is the article's metadata rather than a HEAD: its download
    link answered HEAD with a 202 and no length when this was priced, and the
    API is where it publishes the MD5 anyway.
    """
    if source.publisher == "figshare":
        with _open(source.api, timeout) as response:
            article = json.load(response)
        for entry in article.get("files", []):
            if entry.get("name") == source.filename:
                digest = (entry.get("computed_md5") or "").lower() or None
                return int(entry["size"]), digest
        raise LookupError(f"{source.id}: {source.filename} is not in {source.api}")
    request = urllib.request.Request(source.url, method="HEAD")
    with _open(request, timeout) as response:
        headers = dict(response.headers.items())
    lower = {key.lower(): value for key, value in headers.items()}
    return int(lower["content-length"]), served_digest(source.publisher, headers)


def check(source: Source) -> list[str]:
    """Why the publisher is not serving the bytes that were priced. Empty if it is."""
    size, digest = remote(source)
    algorithm, pinned = source.pin
    problems = []
    if size != source.bytes:
        problems.append(f"{source.id}: serves {size:,} bytes, priced at {source.bytes:,}")
    if digest is None:
        problems.append(f"{source.id}: serves no {algorithm}, so the pin cannot be compared")
    elif digest != pinned:
        problems.append(
            f"{source.id}: serves {algorithm} {digest[:12]}…, priced at {pinned[:12]}…"
        )
    return problems


# -------------------------------------------------------------------- fetch


def fetch(
    source: Source, accept: str, dest: Path | None = None, retries: int = 3
) -> dict[str, object]:
    """Download one source, and return what the record keeps about it.

    Refuses before any request unless `accept` names the source's licence.
    Then refuses before any download if the publisher's HEAD disagrees with
    the pin. A file already on disk that hashes to the pin is kept.
    """
    if accept != source.licence.id:
        why = (
            "fetching it accepts those terms"
            if source.licence.binds_on_download
            else "fetching it accepts nothing"
        )
        raise Refused(
            f"{source.id} is under {source.licence.id} ({source.licence.name}); "
            f"{why}, and the command names the licence either way: "
            f"--accept {source.licence.id}"
            + ("" if not accept else f", not --accept {accept}")
        )
    algorithm, pinned = source.pin
    dest = dest or data_dir()
    dest.mkdir(parents=True, exist_ok=True)
    target = dest / source.filename

    if target.exists() and target.stat().st_size == source.bytes:
        entry = digest_file(target, algorithm)
        if entry[algorithm] == pinned:
            return entry

    problems = check(source)
    if problems:
        raise Refused(
            "the publisher is not serving the bytes that were priced, so nothing "
            "was downloaded:\n  " + "\n  ".join(problems)
        )

    partial = target.with_name(target.name + ".part")
    for attempt in range(retries):
        try:
            theirs, ours = hashlib.new(algorithm), hashlib.sha256()
            with _open(source.url, 300) as response, open(partial, "wb") as handle:
                while chunk := response.read(1 << 20):
                    handle.write(chunk)
                    theirs.update(chunk)
                    ours.update(chunk)
            size = partial.stat().st_size
            if size != source.bytes:
                raise OSError(f"{source.id}: got {size:,} of {source.bytes:,} bytes")
            if theirs.hexdigest() != pinned:
                raise OSError(
                    f"{source.id}: {size:,} bytes arrived but hash to "
                    f"{theirs.hexdigest()[:12]}…, and the publisher's {algorithm} "
                    f"is {pinned[:12]}…"
                )
            partial.replace(target)
            return {"bytes": size, algorithm: pinned, "sha256": ours.hexdigest()}
        except (OSError, urllib.error.URLError):
            partial.unlink(missing_ok=True)
            if attempt == retries - 1:
                raise
            time.sleep(2.0 * (attempt + 1))
    raise AssertionError("unreachable")


# ------------------------------------------------------------------- record


def vectors_path(root: Path | None = None) -> Path:
    return (root or sources.repo_root()) / VECTORS_FILE


def read(root: Path | None = None) -> dict:
    path = vectors_path(root)
    if not path.exists():
        return {"version": VECTORS_VERSION, "digests": {}}
    return json.loads(path.read_text())


def write(doc: dict, root: Path | None = None) -> tuple[Path, bool]:
    path = vectors_path(root)
    text = sources.render(doc)
    changed = not path.exists() or path.read_text() != text
    if changed:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    return path, changed


def record(doc: dict, source: Source, entry: Mapping[str, object]) -> dict:
    """The record with one source added: its bytes, both digests, and its terms."""
    digests = dict(doc.get("digests", {}))
    digests[source.id] = {**entry, "licence": source.licence.id, "url": source.url}
    return {**doc, "version": VECTORS_VERSION, "digests": digests}


def verify(dest: Path | None = None, doc: dict | None = None) -> list[str]:
    """Why the local files are not the ones recorded. Empty means they are."""
    dest = dest or data_dir()
    problems = []
    for source_id, recorded in sorted((doc or read())["digests"].items()):
        source = BY_ID.get(source_id)
        if source is None:
            problems.append(f"{source_id}: recorded, and no longer a source here")
            continue
        path = dest / source.filename
        if not path.exists():
            problems.append(f"{source_id}: recorded but not on disk")
            continue
        actual = digest_file(path, source.pin[0])
        if actual["sha256"] != recorded["sha256"]:
            problems.append(
                f"{source_id}: sha256 {str(actual['sha256'])[:12]}… on disk, "
                f"{str(recorded['sha256'])[:12]}… recorded"
            )
    return problems


# ------------------------------------------------------------------- report


def _size(count: int) -> str:
    return f"{count / 1e9:.2f} GB" if count >= 1e9 else f"{count / 1e6:.1f} MB"


def price_list() -> str:
    """Every candidate, what it costs and what it binds. No network."""
    lines = [
        f"Stage 3's river network and D9's other vectors — priced {PRICED}, "
        "fetched only by a command that names the licence (F59, D60)",
        "",
    ]
    for source in SOURCES:
        algorithm, pinned = source.pin
        licence = source.licence
        lines += [
            f"{source.id}  {source.title}",
            f"  {_size(source.bytes)} ({source.bytes:,} bytes) · {algorithm} {pinned}, "
            f"which {urlparse(source.url).netloc} {SAYS[source.publisher]}",
            f"  carries {source.carries}",
            f"  licence {licence.id}: {licence.name}"
            + (" — downloading is acceptance" if licence.binds_on_download else ""),
        ]
        lines += [f"    · {term}" for term in licence.terms]
        lines.append("")
    lines.append("fetch one:  make vectors FETCH=<id> ACCEPT=<licence>")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Stage 3's river network and D9's other vectors: the price list, "
        "and a fetch that names its licence (F59, D60)."
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="One request per source, and no download: is each publisher still "
        "serving the bytes that were priced?",
    )
    parser.add_argument("--fetch", choices=sorted(BY_ID), help="Download one source.")
    parser.add_argument("--accept", default="", help="The licence --fetch accepts.")
    parser.add_argument(
        "--verify", action="store_true", help="Check local files against the record."
    )
    args = parser.parse_args(argv)

    if args.verify:
        problems = verify()
        for problem in problems:
            print(f"  ✗ {problem}")
        print(f"{len(read()['digests'])} recorded source(s), {len(problems)} problem(s)")
        return 1 if problems else 0

    if args.fetch:
        source = BY_ID[args.fetch]
        try:
            entry = fetch(source, args.accept)
        except Refused as refusal:
            print(f"refused: {refusal}", file=sys.stderr)
            return 2
        path, changed = write(record(read(), source, entry))
        print(f"{source.id}: {entry['bytes']:,} bytes, {source.pin[0]} matches the publisher")
        print(f"{'wrote' if changed else 'unchanged'} {path}")
        return 0

    print(price_list())
    if args.check:
        print()
        failed = 0
        for source in SOURCES:
            problems = check(source)
            failed += bool(problems)
            print(f"  {'✗' if problems else '✓'} {source.id}")
            for problem in problems:
                print(f"      {problem}")
        return 1 if failed else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
