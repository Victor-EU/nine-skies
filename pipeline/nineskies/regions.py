"""Which of the nine regions is the aircraft in -- what the ground says by itself (D14).

D14 makes one set of region weights the thing the terrain shader, the air,
the music and the weather tables all read, so that the sky tint and the music
cross the Sichuan/plateau boundary on the same frame. The journal needs the
same map three more times -- per-region counts, *first discovery in each of the
nine regions*, a hint that says "somewhere along the Tian Shan" (F40) -- and
the only position -> region map in the build is a three-way stand-in whose
Sichuan term has zero weight over every kilometre of Expedition 1.

The plan filed the raster as engineering that waited on the full-country
build. The build exists (F64), so this asks the obvious first question of it:
how much of the nine-way map does the ground draw without being told? Three
instruments, all on the 1 km grid the tiles are cut from:

- **A component** is the land joined to a named place through ground on one
  side of a height, four-connected. The plateau is the ground above T joined
  to Lhasa.
- **Pieces** are what a lowland falls into when every way through it narrower
  than some width is cut: an opening at radius r removes each corridor under
  2r + 1 cells, and the pieces left are read back out to their own ground.
  A lowland that holds together at every width is one piece of country with
  no edge in it at that height; one that parts at 5 km has a gorge for a door.
- **A crossing** is the route going in or out of a component. D14's promise is
  one crossing per boundary; a raw threshold over broken ground makes many.

An earlier form of this measured the neck between pairs of named places, and
it read the places rather than the ground between them: a city on a coast or
a border river caps the clearance of every path at its own cell, so Heihe's
tightest point was Heihe and Shanghai's was the sea. Pieces have no ends.

Only China's own cells are counted, because the sea reads 0 m and would join
every lowland to every other, and a lowland in Kazakhstan is not an answer
about Xinjiang. The boundary is burnt in memory and never written (D10, D66).

This is a measurement and not a region map. Where the ground draws no edge,
something else has to, and what that is -- a table of provinces, a map of
named physical regions, a list of named places grown over the relief -- is
the user's (F66). Nothing here is read by any other stage.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np

#: Expedition 1's waypoints, as `places.py` ids and in flying order. The route
#: section lists the same five; a test holds the two together, so this is a
#: second list of names and never a second set of coordinates (D46).
EXPEDITION_1: tuple[str, ...] = ("shanghai", "wuhan", "chongqing", "chengdu", "lhasa")

#: The GDD's three steps, as the heights its own table gives them, and the
#: two bands between them that its table leaves to nobody.
STEPS: tuple[tuple[float, float, str], ...] = (
    (-1e9, 500.0, "first step (the GDD's 0-500 m)"),
    (500.0, 1_000.0, "between the first and second"),
    (1_000.0, 2_000.0, "second step (1,000-2,000 m)"),
    (2_000.0, 4_000.0, "between the second and third"),
    (4_000.0, 5_000.0, "third step (4,000-5,000 m)"),
    (5_000.0, 1e9, "above the third"),
)

#: The plateau read at three heights: the one ground above T joined to Lhasa.
PLATEAU_T: tuple[float, ...] = (2_500.0, 3_000.0, 3_500.0)
#: Radii of the opening-then-closing a raster would need before the route
#: crosses its edge once, in cells.
SMOOTHING: tuple[int, ...] = (2, 5, 10)


#: Heights at which the lowlands are read, and the widths at which they are
#: cut. 500 m is the top of the GDD's first step; 1,500 m is the middle of its
#: second, where the basins of the north-west are.
LOWLAND_T: tuple[float, ...] = (500.0, 1_500.0)
OPENINGS: tuple[int, ...] = (0, 2, 5, 10, 20)
#: A piece smaller than this is left out of the table. Hainan is 33,000 km².
PIECE_KM2 = 20_000.0


# --------------------------------------------------------------------------
# Instruments. Plain numpy and a queue; the venv has no scipy, and nothing
# here is slow enough to want it.


def distance(mask: np.ndarray, edge_outside: bool = True) -> np.ndarray:
    """City-block distance from each cell of `mask` to the nearest cell not in it.

    Zero outside the mask. City-block because it is the distance a
    four-connected erosion measures: a cell survives `erode(mask, r)` exactly
    when this is more than `r`, so an opening of any radius is one threshold
    on one array rather than r passes. L1 separates by axis, so two sweeps
    down the columns and two along the rows are exact.

    Beyond the array's edge counts as outside unless `edge_outside` is False,
    which is what dilation wants -- there, the edge must not grow anything.
    """
    big = mask.shape[0] + mask.shape[1] + 2
    d = np.pad(
        np.where(mask, big, 0).astype(np.int32), 1, constant_values=0 if edge_outside else big
    )
    for i in range(1, d.shape[0]):
        np.minimum(d[i], d[i - 1] + 1, out=d[i])
    for i in range(d.shape[0] - 2, -1, -1):
        np.minimum(d[i], d[i + 1] + 1, out=d[i])
    t = np.ascontiguousarray(d.T)
    for j in range(1, t.shape[0]):
        np.minimum(t[j], t[j - 1] + 1, out=t[j])
    for j in range(t.shape[0] - 2, -1, -1):
        np.minimum(t[j], t[j + 1] + 1, out=t[j])
    return np.ascontiguousarray(t.T)[1:-1, 1:-1]


def erode(mask: np.ndarray, r: int) -> np.ndarray:
    return distance(mask) > r


def dilate(mask: np.ndarray, r: int) -> np.ndarray:
    return mask | (distance(~mask, edge_outside=False) <= r)


def smooth(mask: np.ndarray, r: int) -> np.ndarray:
    """Opening then closing at radius `r`: a spur narrower than 2r + 1 cells
    is cut off and a valley that narrow is closed over, and every crossing
    either made goes with it. Corners round off both ways, which is what a
    diamond does to a square, so a shallow notch in a straight edge stays."""
    if r <= 0:
        return mask.copy()
    opened = dilate(erode(mask, r), r)
    return erode(dilate(opened, r), r)


def component(mask: np.ndarray, seed: tuple[int, int]) -> np.ndarray:
    """The four-connected piece of `mask` holding `seed`; empty if `seed` is not in it."""
    height, width = mask.shape
    out = np.zeros(mask.shape, dtype=bool)
    if not mask[seed]:
        return out
    flat = mask.ravel()
    seen = out.ravel()
    start = seed[0] * width + seed[1]
    seen[start] = True
    queue = deque([start])
    while queue:
        i = queue.popleft()
        row, col = divmod(i, width)
        for j, ok in (
            (i - 1, col > 0),
            (i + 1, col < width - 1),
            (i - width, row > 0),
            (i + width, row < height - 1),
        ):
            if ok and flat[j] and not seen[j]:
                seen[j] = True
                queue.append(j)
    return out


def label(mask: np.ndarray) -> tuple[np.ndarray, int]:
    """Every four-connected piece of `mask` numbered from 1, in the row order
    of each piece's first cell, so the numbering is the same on every run."""
    height, width = mask.shape
    labels = np.zeros(mask.shape, dtype=np.int32)
    flat = mask.ravel()
    out = labels.ravel()
    count = 0
    for start in np.flatnonzero(mask):
        if out[start]:
            continue
        count += 1
        out[start] = count
        queue = deque([int(start)])
        while queue:
            i = queue.popleft()
            row, col = divmod(i, width)
            for j, ok in (
                (i - 1, col > 0),
                (i + 1, col < width - 1),
                (i - width, row > 0),
                (i + width, row < height - 1),
            ):
                if ok and flat[j] and not out[j]:
                    out[j] = count
                    queue.append(j)
    return labels, count


@dataclass(frozen=True)
class Part:
    """One piece of a lowland: its cells inside the smallest window that holds them."""

    top: int
    left: int
    cells: np.ndarray  # bool, the window's shape


def _give_back(ground: np.ndarray, owner: np.ndarray) -> None:
    """Grow each owned piece through `ground` until the ground is spoken for.

    A multi-source breadth-first search from every owned cell with unowned
    ground beside it, so each cell goes to the piece nearest it *along the
    ground*, four-connected; where two are equally near, to the one whose
    cell was queued first, which is row order. In place.
    """
    height, width = ground.shape
    flat = ground.ravel()
    out = owner.ravel()
    owned = owner > 0
    edge = owned & ~erode(owned, 1) & dilate(ground & ~owned, 1)
    queue = deque(np.flatnonzero(edge).tolist())
    while queue:
        i = queue.popleft()
        mine = out[i]
        row, col = divmod(i, width)
        for j, ok in (
            (i - 1, col > 0),
            (i + 1, col < width - 1),
            (i - width, row > 0),
            (i + width, row < height - 1),
        ):
            if ok and flat[j] and not out[j]:
                out[j] = mine
                queue.append(j)


def pieces(ground: np.ndarray, r: int, min_cells: int, core_cells: int = 1_000) -> list[Part]:
    """What `ground` falls into when every way through it narrower than
    2r + 1 cells is cut.

    The cut is an erosion. Every core it leaves of at least `core_cells` is
    then given back the ground it is joined to most directly, so the pieces
    divide the lowland between them rather than each keeping only what an
    opening would -- an opening shaves every corner and drops every valley
    narrower than the cut, which at 41 km is a tenth of the ground below
    1,500 m. Ground joined to no such core belongs to no piece: a crumb, or a
    lowland the cut consumed whole. Largest first; between equals, the one
    whose core starts first in row order.
    """
    core = erode(ground, r) if r else ground
    labels, count = label(core)
    if count == 0:
        return []
    sizes = np.bincount(labels.ravel(), minlength=count + 1)
    keep = sizes >= min(core_cells, min_cells)
    keep[0] = False
    owner = np.where(keep[labels], labels, 0).astype(np.int32)
    del labels
    if r:
        _give_back(ground, owner)
    areas = np.bincount(owner.ravel(), minlength=count + 1)
    rows, cols = np.nonzero(owner)
    which = owner[rows, cols]
    big = np.iinfo(np.int64).max
    top = np.full(count + 1, big, dtype=np.int64)
    left = np.full(count + 1, big, dtype=np.int64)
    bottom = np.full(count + 1, -1, dtype=np.int64)
    right = np.full(count + 1, -1, dtype=np.int64)
    np.minimum.at(top, which, rows)
    np.minimum.at(left, which, cols)
    np.maximum.at(bottom, which, rows)
    np.maximum.at(right, which, cols)
    found = []
    for k in np.flatnonzero(areas >= min_cells):
        if k == 0:
            continue
        t0, l0, b0, r0 = int(top[k]), int(left[k]), int(bottom[k]) + 1, int(right[k]) + 1
        cells = owner[t0:b0, l0:r0] == k
        found.append((-int(areas[k]), int(k), Part(top=t0, left=l0, cells=cells)))
    found.sort(key=lambda f: (f[0], f[1]))
    return [part for _, _, part in found]


def crossings(mask: np.ndarray, cells: Sequence[tuple[int, int]]) -> int:
    """How many times a path goes into or out of `mask`."""
    inside = [bool(mask[rc]) for rc in cells]
    return sum(1 for x, y in zip(inside, inside[1:]) if x != y)


def nearest_inside(
    mask: np.ndarray, rc: tuple[int, int], reach: int = 40
) -> tuple[int, int] | None:
    """The cell of `mask` nearest `rc`, within `reach` cells; ties to the lower index."""
    r0, c0 = rc
    top, left = max(0, r0 - reach), max(0, c0 - reach)
    window = mask[top : r0 + reach + 1, left : c0 + reach + 1]
    rows, cols = np.nonzero(window)
    if rows.size == 0:
        return None
    k = int(np.argmin((rows + top - r0) ** 2 + (cols + left - c0) ** 2))
    return int(rows[k]) + top, int(cols[k]) + left


# --------------------------------------------------------------------------
# The route and the places, on a grid.


def route_cells(
    transform, shape: tuple[int, int], ids: Sequence[str] = EXPEDITION_1
) -> list[tuple[float, tuple[int, int]]]:
    """(km along, cell) at every whole kilometre of straight Albers legs
    through the named places, and at the far end -- the lines the route
    section is cut along, walked the way its ground profile is sampled."""
    from . import grid, places

    at = [places.BY_ID[i] for i in ids]
    xs, ys = grid.project([p.lat for p in at], [p.lon for p in at])
    starts = [0.0]
    for k in range(1, len(ids)):
        starts.append(starts[-1] + float(np.hypot(xs[k] - xs[k - 1], ys[k] - ys[k - 1])) / 1000.0)
    total = starts[-1]
    marks = [float(km) for km in range(int(total) + 1)]
    if marks[-1] < total:
        marks.append(total)
    inverse = ~transform
    out: list[tuple[float, tuple[int, int]]] = []
    leg = 1
    for km in marks:
        while leg < len(ids) - 1 and km > starts[leg]:
            leg += 1
        span = starts[leg] - starts[leg - 1]
        f = 0.0 if span == 0 else (km - starts[leg - 1]) / span
        x = xs[leg - 1] + (xs[leg] - xs[leg - 1]) * f
        y = ys[leg - 1] + (ys[leg] - ys[leg - 1]) * f
        col, row = inverse * (x, y)
        r, c = int(row), int(col)
        if 0 <= r < shape[0] and 0 <= c < shape[1]:
            out.append((km, (r, c)))
    return out


# --------------------------------------------------------------------------
# The measurement.


@dataclass(frozen=True)
class Plateau:
    height_m: float
    cells: int
    inside: tuple[str, ...]
    first_km: float | None
    km_in: int
    raw: int
    smoothed: tuple[tuple[int, int, float | None], ...]  # (radius, crossings, first km)


@dataclass(frozen=True)
class Piece:
    """One piece of a lowland, read back out to its own ground."""

    cells: int
    lat: float
    lon: float
    south: float
    north: float
    west: float
    east: float
    inside: tuple[str, ...]


def _cell(sampler, lat: float, lon: float) -> tuple[int, int]:
    col, row = sampler.to_pixel(lat, lon)
    return int(round(row)), int(round(col))


def _read(part: Part, xs: np.ndarray, ys: np.ndarray, named: dict) -> Piece:
    """Where a piece is: its centre and its extent, from every ninth of its
    cells, and the named places whose own cell is in it."""
    from . import grid

    rows, cols = np.nonzero(part.cells)
    rows, cols = rows[::9], cols[::9]
    lats, lons = grid.unproject(
        list(xs[part.left + cols]), list(ys[part.top + rows])
    )
    h, w = part.cells.shape

    def holds(rc):
        r, c = rc[0] - part.top, rc[1] - part.left
        return 0 <= r < h and 0 <= c < w and bool(part.cells[r, c])

    return Piece(
        cells=int(part.cells.sum()),
        lat=float(np.mean(lats)),
        lon=float(np.mean(lons)),
        south=min(lats),
        north=max(lats),
        west=min(lons),
        east=max(lons),
        inside=tuple(pid for pid, rc in named.items() if holds(rc)),
    )


def measure(path: Path) -> dict:
    from . import boundary, places
    from .sample import GridSampler

    sampler = GridSampler(path)
    heights = sampler.array.astype(np.float64)
    shapes = boundary.load()
    china = boundary.mask(shapes, sampler.transform, heights.shape, boundary.ADMINISTERED)
    resolution_km = sampler.resolution_m / 1000.0
    shape = heights.shape
    cells = {p.id: _cell(sampler, p.lat, p.lon) for p in places.PLACES}
    named = {
        pid: rc
        for pid, rc in cells.items()
        if 0 <= rc[0] < shape[0] and 0 <= rc[1] < shape[1]
    }
    missing = [pid for pid in EXPEDITION_1 if pid not in named or not china[named[pid]]]
    if missing:
        raise SystemExit(
            f"{path.name} does not hold {', '.join(missing)} inside China; the region "
            "measurement reads the whole country -- build it with `make world CORRIDOR=china`"
        )

    ashore = sorted(pid for pid, rc in named.items() if not china[rc])
    inside_china = heights[china]
    steps = [
        (label, int(((inside_china >= lo) & (inside_china < hi)).sum()))
        for lo, hi, label in STEPS
    ]

    route = route_cells(sampler.transform, shape)
    route_rc = [rc for _, rc in route]

    plateaus: list[Plateau] = []
    for t in PLATEAU_T:
        piece = component((heights >= t) & china, named["lhasa"])
        on = [km for km, rc in route if piece[rc]]
        smoothed = []
        for r in SMOOTHING:
            s = smooth(piece, r)
            s_on = [km for km, rc in route if s[rc]]
            smoothed.append((r, crossings(s, route_rc), s_on[0] if s_on else None))
        plateaus.append(
            Plateau(
                height_m=t,
                cells=int(piece.sum()),
                inside=tuple(pid for pid, rc in named.items() if piece[rc]),
                first_km=on[0] if on else None,
                km_in=len(on),
                raw=crossings(piece, route_rc),
                smoothed=tuple(smoothed),
            )
        )

    xs, ys = boundary.centres(sampler.transform, shape)
    min_cells = int(round(PIECE_KM2 / (resolution_km * resolution_km)))
    lowlands: list[tuple[float, int, int, list[Piece]]] = []
    for t in LOWLAND_T:
        below = (heights < t) & china
        for r in OPENINGS:
            found = [_read(part, xs, ys, named) for part in pieces(below, r, min_cells)[:8]]
            lowlands.append((t, r, int(below.sum()), found))

    return {
        "path": path,
        "shape": shape,
        "resolution_km": resolution_km,
        "china_cells": int(china.sum()),
        "steps": steps,
        "plateaus": plateaus,
        "lowlands": lowlands,
        "names": {p.id: p.name for p in places.PLACES},
        "ashore": ashore,
        "ground_on_route": [(km, float(heights[rc])) for km, rc in route],
    }


# --------------------------------------------------------------------------
# The report.


def _km2(cells: int, resolution_km: float) -> str:
    return f"{cells * resolution_km * resolution_km:,.0f}"


def render(result: dict) -> str:
    from datetime import date

    from .hydro import _para

    res = result["resolution_km"]
    names = result["names"]
    total = result["china_cells"]
    lines = [
        f"# Region report — what the ground draws of the nine, {res * 1000:.0f} m grid",
        "",
        f"{date.today().isoformat()} · `{result['path'].name}` · Natural Earth admin-0, "
        "the de facto view, burnt in memory and never written (D10, D66)",
        "",
    ]
    lines += _para(
        "D14's region raster is the one position -> region map the air, the "
        "music, the weather and the journal are all to read. This report asks "
        "how much of it the ground draws without being told: where China's "
        "land, read on one side of a height, falls into pieces the GDD's region "
        "table would recognise, and where it holds together. It is a "
        "measurement and not a region map; nothing else reads it (F66)."
    )

    lines += ["## The GDD's three steps, inside China", ""]
    lines += ["| Band | km² | Share |", "| --- | ---: | ---: |"]
    for label, n in result["steps"]:
        lines.append(f"| {label} | {_km2(n, res)} | {100 * n / total:.1f} % |")
    lines.append("")
    between = sum(n for label, n in result["steps"] if label.startswith("between"))
    lines += _para(
        f"The GDD gives each step a typical height, and {100 * between / total:.1f} % "
        "of China stands between them. A step is a description; an edge "
        "between two of them is a height somebody chooses, which is why "
        "everything below is read at more than one."
    )

    lines += ["## The plateau: an edge the ground draws, and the route crosses it many times", ""]
    lines += [
        "| Ground at or above | km² joined to Lhasa | Expedition 1 first in at | km in | "
        "Crossings, raw | "
        + " | ".join(f"smoothed {2 * r + 1} km" for r in SMOOTHING)
        + " |",
        "| ---: | ---: | ---: | ---: | ---: | " + " | ".join("---:" for _ in SMOOTHING) + " |",
    ]
    for p in result["plateaus"]:
        first = f"km {p.first_km:,.0f}" if p.first_km is not None else "—"
        smoothed = " | ".join(
            f"{n}" + (f" (from km {k:,.0f})" if k is not None else "") for _, n, k in p.smoothed
        )
        lines.append(
            f"| {p.height_m:,.0f} m | {_km2(p.cells, res)} | {first} | {p.km_in:,} | "
            f"{p.raw} | {smoothed} |"
        )
    lines.append("")
    for p in result["plateaus"]:
        held = ", ".join(names[i] for i in p.inside)
        lines.append(f"- **{p.height_m:,.0f} m** holds {held}.")
    lines.append("")
    lines += _para(
        "Smoothed is an opening and then a closing at the radius that cuts off "
        "spurs and closes valleys narrower than the width named. A crossing is "
        "the route going in or out. D14 promises one crossing per boundary, so that the "
        "tint and the music change together once; over the Hengduan a raw "
        "threshold changes them every time a valley dips under it."
    )
    lines += ["Ground under the route across the rim, every 10 km:", "", "```"]
    row = [
        f"{km:5.0f} km {h:6.0f} m"
        for km, h in result["ground_on_route"]
        if 1_690 <= km <= 2_000 and round(km) % 10 == 0
    ]
    for i in range(0, len(row), 4):
        lines.append("   ".join(row[i : i + 4]))
    lines += ["```", ""]

    lines += ["## The lowlands: what they fall into when their narrow ways are cut", ""]
    lines += _para(
        "China's ground below each height, with every way through it narrower "
        "than the width named cut, and then every cell of it given back to the "
        "piece it is joined to most directly along the ground, so the pieces "
        "divide the lowland between them. Pieces of "
        f"{PIECE_KM2:,.0f} km² and more, largest first, with the named places "
        "whose own cell stands in them."
    )
    if result["ashore"]:
        lines += _para(
            "A place whose own cell is outside China's de facto outline is in no "
            "piece at any height: "
            + ", ".join(names[pid] for pid in result["ashore"])
            + ". A city on a border river can sit a cell over the line the "
            "outline follows."
        )
    for t in LOWLAND_T:
        rows = [(r, n, found) for (tt, r, n, found) in result["lowlands"] if tt == t]
        lines += [f"### Below {t:,.0f} m — {_km2(rows[0][1], res)} km² of China", ""]
        lines += [
            "| Cut where narrower than | km² | Centre | Latitude | Longitude "
            "| Named places in it |",
            "| ---: | ---: | --- | --- | --- | --- |",
        ]
        for r, _, found in rows:
            label = "nothing cut" if r == 0 else f"{2 * r + 1} km"
            for k, piece in enumerate(found):
                lines.append(
                    f"| {label if k == 0 else ''} | {_km2(piece.cells, res)} | "
                    f"{piece.lat:.1f} N {piece.lon:.1f} E | "
                    f"{piece.south:.1f}–{piece.north:.1f} N | "
                    f"{piece.west:.1f}–{piece.east:.1f} E | "
                    + (", ".join(names[i] for i in piece.inside) or "—")
                    + " |"
                )
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main(argv: list[str] | None = None) -> int:
    import argparse
    import sys

    from .acquire import data_root

    parser = argparse.ArgumentParser(
        description="What the country grid draws of the nine regions by itself (D14, F66)."
    )
    parser.add_argument("--grid", type=Path, default=None)
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args(argv)

    path = args.grid or data_root() / "work" / "china-1km-conditioned.tif"
    if not path.exists():
        print(f"no built grid at {path}; run `make world CORRIDOR=china` first", file=sys.stderr)
        return 1
    report = render(measure(path))
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(report)
    print(report)
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
