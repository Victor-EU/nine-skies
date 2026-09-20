"""The projection reference table the engine checks itself against.

`grid.py` owns the projection and PROJ computes it. `projectAlbers` in
`engine/src/terrain/worldGrid.ts` is a second implementation of the same
equations, because content is authored in degrees, the simulation flies in
metres, and a browser has no PROJ in it. Two implementations of one projection
drift, and the only thing that stops them is a table of points PROJ has
answered for.

That table used to be the seven anchors inside a built manifest, which meant
the check ran only where a corridor had been built - three of the ten tests a
fresh clone still skipped after F24. It is a committed artefact now: points
spanning the whole country, written here by PROJ and read there by
`test/route/albers.test.ts`, which needs no Python and no world.

`tests/test_reference.py` regenerates the table and fails if the committed
copy has drifted, so PROJ verifies it where PROJ exists and the engine
consumes it where it does not. Between them the comparison runs on every
commit, which is what it could not do before.
"""

from __future__ import annotations

import json
from pathlib import Path

from . import grid

REFERENCE_VERSION = 1

#: Where the committed table lives, relative to the repository root.
REFERENCE_PATH = Path("pipeline/reference/albers.json")

#: A lattice over China, chosen for where a projection goes wrong rather than
#: for where the game goes. Both standard parallels are on it (25 N, 47 N),
#: because that is where the cone touches and the scale error changes sign;
#: so is the central meridian (105 E), where easting depends on nothing but
#: the origin; and so are the corners of the country box, where the cone's
#: convergence is largest and a spherical slip is worth kilometres.
LATITUDES = (18.0, 25.0, 30.0, 36.0, 40.0, 47.0, 54.0)
LONGITUDES = (73.0, 89.0, 105.0, 121.0, 135.0)


def points() -> list[tuple[str, float, float]]:
    """Every point in the table, as (name, lat, lon).

    The lattice first, then the named places the route actually crosses. The
    named ones are not redundant: they are the coordinates content is authored
    in, so a drift that only showed at an authored waypoint would still be
    caught by the exact number an expedition uses.
    """
    from .tiles import ANCHORS

    lattice = [
        (f"grid-{int(lat):02d}N-{int(lon):03d}E", lat, lon)
        for lat in LATITUDES
        for lon in LONGITUDES
    ]
    named = [(name, lat, lon) for name, (lat, lon) in ANCHORS.items()]
    return lattice + named


def build() -> dict:
    """The table as PROJ answers it, in the country grid's own metres."""
    entries = points()
    xs, ys = grid.project([lat for _, lat, _ in entries], [lon for _, _, lon in entries])
    return {
        "version": REFERENCE_VERSION,
        "proj4": grid.ALBERS_PROJ4,
        "originXM": grid.ORIGIN_X_M,
        "originYM": grid.ORIGIN_Y_M,
        # A decimetre, matching the manifest's anchors. Far finer than
        # anything the game can see and far coarser than the difference
        # between an ellipsoidal and a spherical projection, which is the
        # mistake this table exists to catch.
        "toleranceM": 0.1,
        "points": [
            {
                "name": name,
                "lat": lat,
                "lon": lon,
                "eastM": round(x - grid.ORIGIN_X_M, 1),
                "northM": round(y - grid.ORIGIN_Y_M, 1),
            }
            for (name, lat, lon), x, y in zip(entries, xs, ys)
        ],
    }


def render(table: dict) -> str:
    return json.dumps(table, indent=2) + "\n"


def write(root: Path = Path(".")) -> Path:
    path = root / REFERENCE_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render(build()), encoding="utf-8")
    return path


def read(root: Path = Path(".")) -> dict:
    return json.loads((root / REFERENCE_PATH).read_text(encoding="utf-8"))


if __name__ == "__main__":
    written = write()
    table = read()
    print(f"{written}: {len(table['points'])} points, tolerance {table['toleranceM']} m")
