"""Stage 3's first mapped rivers against the grid's own (F60).

F59 priced three river networks and recommended fetching the one that binds
nothing first -- Natural Earth, public domain -- and measuring two things
before deciding whether anything more is needed:

- **What it decides.** HydroSHEDS' own rule leaves 3,710 of the corridor's
  74,019 closed basins for a map to decide (`hydro.inspected`). For each, this
  asks what the mapped network says: a river that crosses the basin's rim
  twice or more passes through it, which makes the basin a clipped channel;
  a network that ends inside it may be a sink; a lake inside it is standing
  water; nothing is nothing.
- **Where its lines sit.** A line drawn at 1:10 million is only worth burning
  into a grid if it runs where the grid's valleys do. It is measured two ways:
  against the five places `places.py` sited on the water from the 30 m
  source, independently of both, and against this grid's own large channels.

What the file does not carry is direction. Natural Earth's lines are not
drawn downstream -- 20 of the 77 wholly inside the corridor run uphill from
first vertex to last -- and its tributaries often stop short of the river
they join rather than meeting it. So direction is read off the ground
instead: lines whose ends come within `JOIN_M` of each other are one system,
and a system's **mouth is its lowest free end**, because a river's sources
are in its hills and its mouth is not. A mouth inside a basin outranks
anything else a line does there. What no rule here can see is a river that
rises on a basin's rim and wanders in and out along it before leaving: it
crosses the rim as often as a river passing through, and Yamdrok, which has no
outlet, reads that way (F60).

Only ground the source reached is measured: a sample on a tile any part of
which was never fetched is a zero nobody measured (F54), and a line through
it is compared with nothing.
"""

from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Sequence

import numpy as np

from . import coverage, grid, hydro, places, shapefile, vectors

RIVERS = "ne-rivers"
LAKES = "ne-lakes"

#: Lines are walked at this spacing -- a quarter of a cell -- so no cell a
#: line crosses is stepped over.
STEP_M = 250.0

#: A stretch of line inside or outside a basin shorter than this is a line
#: tracing the rim, not a crossing. A kilometre is one cell.
RUN_M = 1000.0

#: What counts as one of this grid's own channels when a mapped line is
#: measured against them: a thousand square kilometres of catchment, the
#: grid's large rivers and none of its streams.
CHANNEL_KM2 = 1000

#: How far to look for such a channel before calling it absent.
SEARCH_CELLS = 15

#: A line's end within this of another line is a confluence rather than a
#: source or a mouth. Natural Earth joins some tributaries on a shared vertex
#: and stops others short: of the 186 ends near this corridor that meet no
#: other line exactly, a quarter lie within a kilometre of one (F60).
JOIN_M = 2000.0

#: A river needs this much measured line to get a row of its own.
ROW_KM = 200

#: The basins listed one by one: F59 found 43 of the inspected ones this big,
#: holding more than half of their area.
LARGE_KM2 = 1000

ENDS = "a mapped river system ends inside it"
CROSSED = "a mapped river crosses its rim twice or more"
LAKE = "a mapped lake lies in it"
ONCE = "a mapped river crosses its rim once"
SILENT = "nothing mapped touches it"
SAYS = (ENDS, CROSSED, LAKE, ONCE, SILENT)


def load(source_id: str) -> list[shapefile.Shape]:
    """A fetched source, refused unless its bytes are the ones recorded (D60)."""
    source = vectors.BY_ID[source_id]
    recorded = vectors.read()["digests"].get(source_id)
    if recorded is None:
        raise SystemExit(
            f"{source_id} has not been fetched: make vectors FETCH={source_id} "
            f"ACCEPT={source.licence.id}"
        )
    problems = vectors.verify(doc={"digests": {source_id: recorded}})
    if problems:
        raise SystemExit("\n".join(problems))
    return shapefile.read_zip(vectors.data_dir() / source.filename)


# ------------------------------------------------------------------- lines


@dataclass(frozen=True)
class Line:
    """One part of one mapped river, in projected metres."""

    feature: int
    name: str
    #: The vertices as drawn.
    x: np.ndarray
    y: np.ndarray


def walk(x: np.ndarray, y: np.ndarray, step: float) -> tuple[np.ndarray, np.ndarray]:
    """A polyline resampled to at most `step` between points, every vertex kept."""
    xs, ys = [x[:1]], [y[:1]]
    for i in range(len(x) - 1):
        n = max(1, int(math.ceil(math.hypot(x[i + 1] - x[i], y[i + 1] - y[i]) / step)))
        fraction = np.arange(1, n + 1) / n
        xs.append(x[i] + (x[i + 1] - x[i]) * fraction)
        ys.append(y[i] + (y[i + 1] - y[i]) * fraction)
    return np.concatenate(xs), np.concatenate(ys)


Box = tuple[float, float, float, float]


def touches(parts: Sequence[np.ndarray], box: Box | None) -> bool:
    """Whether any part's extent overlaps a (west, south, east, north) box."""
    if box is None:
        return True
    west, south, east, north = box
    for part in parts:
        if (
            part[:, 0].max() >= west
            and part[:, 0].min() <= east
            and part[:, 1].max() >= south
            and part[:, 1].min() <= north
        ):
            return True
    return False


def name_of(record: dict) -> str:
    return str(record.get("name_en") or record.get("name") or "").strip() or "(unnamed)"


def lines_from(
    shapes: Sequence[shapefile.Shape],
    project: Callable[[list[float], list[float]], tuple[list[float], list[float]]] = grid.project,
    box: Box | None = None,
) -> list[Line]:
    """Every part of every line inside `box`, projected."""
    found = []
    for feature, shape in enumerate(shapes):
        for part in shape.parts:
            if not touches([part], box):
                continue
            xs, ys = project(list(part[:, 1]), list(part[:, 0]))
            found.append(
                Line(
                    feature=feature,
                    name=name_of(shape.record),
                    x=np.asarray(xs, dtype="float64"),
                    y=np.asarray(ys, dtype="float64"),
                )
            )
    return found


# ------------------------------------------------------------ on the grid


@dataclass(frozen=True)
class Grid:
    """The one grid this module measures against, and where it was fetched."""

    heights: np.ndarray
    transform: object
    #: True where every tile under a sample was fetched (F54).
    fetched: np.ndarray

    @property
    def shape(self) -> tuple[int, int]:
        return self.heights.shape

    def cells(self, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        """The flat index of the cell under each point, or -1 off the grid."""
        inverse = ~self.transform
        col = np.floor(inverse.a * x + inverse.b * y + inverse.c).astype("int64")
        row = np.floor(inverse.d * x + inverse.e * y + inverse.f).astype("int64")
        height, width = self.shape
        on = (col >= 0) & (col < width) & (row >= 0) & (row < height)
        return np.where(on, row * width + col, -1)

    def centre(self, index: int) -> tuple[float, float]:
        row, col = divmod(int(index), self.shape[1])
        t = self.transform
        return (
            t.a * (col + 0.5) + t.b * (row + 0.5) + t.c,
            t.d * (col + 0.5) + t.e * (row + 0.5) + t.f,
        )


def crossings(along: np.ndarray, min_run: int) -> Counter:
    """How many times a line crosses into or out of each basin it touches.

    `along` is the basin label under each step, 0 outside every basin. A run
    shorter than `min_run` steps is a line tracing a rim and is merged into
    what surrounds it; the first and last runs are kept whatever their length,
    because a line that ends a step inside a basin has still gone in.
    """
    if len(along) == 0:
        return Counter()
    change = np.flatnonzero(along[1:] != along[:-1]) + 1
    starts = np.r_[0, change]
    lengths = np.diff(np.r_[starts, len(along)])
    values = along[starts]
    keep = lengths >= min_run
    keep[0] = keep[-1] = True
    values = values[keep]
    values = values[np.r_[True, values[1:] != values[:-1]]]
    count: Counter = Counter()
    for before, after in zip(values[:-1], values[1:]):
        if before > 0:
            count[int(before)] += 1
        if after > 0:
            count[int(after)] += 1
    return count


def lakes_raster(
    shapes: Sequence[shapefile.Shape],
    ground: Grid,
    project: Callable[[list[float], list[float]], tuple[list[float], list[float]]] = grid.project,
    box: Box | None = None,
) -> np.ndarray:
    """Which lake, by its index plus one, stands on each cell; 0 for none.

    A shapefile writes outer rings clockwise and holes anticlockwise, and
    projection keeps the handedness, so a ring's signed area says which it
    is; each hole joins the outer ring before it. A cell is the lake's when
    its centre is inside.
    """
    from rasterio import features

    height, width = ground.shape
    burn = []
    for index, shape in enumerate(shapes):
        if not touches(shape.parts, box):
            continue
        polygons: list[list[list[tuple[float, float]]]] = []
        for ring in shape.parts:
            xs, ys = project(list(ring[:, 1]), list(ring[:, 0]))
            coords = list(zip(xs, ys))
            twice_area = sum(
                x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(coords, coords[1:] + coords[:1])
            )
            if twice_area < 0 or not polygons:
                polygons.append([coords])
            else:
                polygons[-1].append(coords)
        if polygons:
            burn.append(({"type": "MultiPolygon", "coordinates": polygons}, index + 1))
    if not burn:
        return np.zeros((height, width), dtype="int32")
    return features.rasterize(
        burn, out_shape=(height, width), transform=ground.transform, fill=0, dtype="int32"
    )


def mouths(lines: Sequence[Line], ground: Grid, join_m: float = JOIN_M) -> list[int]:
    """The cell each mapped river system ends in, where that can be known.

    An end within `join_m` of another line joins it, and the lines joined
    that way are one system. Its free ends are its sources and its mouth, and
    the mouth is the lowest of them. It is named only when every free end
    stands on fetched ground: a system that leaves the grid, or crosses
    ground nobody measured, may end anywhere.
    """
    parent = list(range(len(lines)))

    def root(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    free: list[list[tuple[float, float]]] = [[] for _ in lines]
    for i, line in enumerate(lines):
        for x, y in ((line.x[0], line.y[0]), (line.x[-1], line.y[-1])):
            nearest, joined = math.inf, -1
            for j, other in enumerate(lines):
                if j != i:
                    d = distance_to_lines(x, y, [other])
                    if d < nearest:
                        nearest, joined = d, j
            if nearest <= join_m:
                parent[root(i)] = root(joined)
            else:
                free[i].append((x, y))
    systems: dict[int, list[tuple[float, float]]] = defaultdict(list)
    for i in range(len(lines)):
        systems[root(i)].extend(free[i])
    fetched = ground.fetched.ravel()
    heights = ground.heights.ravel()
    found = []
    for ends in systems.values():
        if not ends:
            continue
        cells = ground.cells(np.array([e[0] for e in ends]), np.array([e[1] for e in ends]))
        if (cells < 0).any() or not fetched[cells].all():
            continue
        found.append(int(cells[int(np.argmin(heights[cells]))]))
    return found


@dataclass(frozen=True)
class Verdict:
    crossings: int
    ends: int
    rivers: tuple[str, ...]
    lakes: tuple[str, ...]
    lake_cells: int

    @property
    def says(self) -> str:
        if self.ends:
            return ENDS
        if self.crossings >= 2:
            return CROSSED
        if self.lake_cells:
            return LAKE
        if self.crossings == 1:
            return ONCE
        return SILENT


def verdicts(
    labels: np.ndarray,
    wanted: Sequence[int],
    lines: Sequence[Line],
    lakes: np.ndarray,
    lake_names: Sequence[str],
    ground: Grid,
    step: float = STEP_M,
    run: float = RUN_M,
    ends_at: Sequence[int] = (),
) -> dict[int, Verdict]:
    """What the mapped network says about each wanted basin, by label.

    `ends_at` is the cell of each known mouth (`mouths`)."""
    flat = labels.ravel()
    wanted_set = set(int(b) for b in wanted)
    crossed: Counter = Counter()
    ends: Counter = Counter()
    rivers: dict[int, set[str]] = defaultdict(set)
    min_run = max(1, int(round(run / step)))
    for line in lines:
        x, y = walk(line.x, line.y, step)
        cells = ground.cells(x, y)
        along = np.where(cells >= 0, flat[np.maximum(cells, 0)], 0)
        if not along.any():
            continue
        for basin, n in crossings(along, min_run).items():
            if basin in wanted_set:
                crossed[basin] += n
        for basin in set(int(b) for b in np.unique(along[along > 0])):
            if basin in wanted_set:
                rivers[basin].add(line.name)
    for cell in ends_at:
        if int(flat[cell]) in wanted_set:
            ends[int(flat[cell])] += 1
    in_lake = (lakes.ravel() > 0) & (flat > 0)
    lake_cells: dict[int, Counter] = defaultdict(Counter)
    for basin, lake in zip(flat[in_lake], lakes.ravel()[in_lake]):
        if int(basin) in wanted_set:
            lake_cells[int(basin)][int(lake)] += 1
    return {
        basin: Verdict(
            crossings=crossed[basin],
            ends=ends[basin],
            rivers=tuple(sorted(rivers[basin])),
            lakes=tuple(lake_names[lake - 1] for lake, _ in lake_cells[basin].most_common()),
            lake_cells=sum(lake_cells[basin].values()),
        )
        for basin in wanted
    }


# ----------------------------------------------------------------- offsets


def distance_to_lines(x: float, y: float, lines: Sequence[Line]) -> float:
    """Metres from a point to the nearest segment of any line."""
    best = math.inf
    for line in lines:
        x0, y0, x1, y1 = line.x[:-1], line.y[:-1], line.x[1:], line.y[1:]
        dx, dy = x1 - x0, y1 - y0
        length2 = dx * dx + dy * dy
        with np.errstate(invalid="ignore", divide="ignore"):
            t = np.clip(((x - x0) * dx + (y - y0) * dy) / length2, 0.0, 1.0)
        t = np.where(length2 > 0, t, 0.0)
        near = np.hypot(x0 + t * dx - x, y0 + t * dy - y)
        if len(near):
            best = min(best, float(near.min()))
    return best


def channel_offsets(
    lines: Sequence[Line],
    acc_km2: np.ndarray,
    ground: Grid,
    threshold_km2: float = CHANNEL_KM2,
    search: int = SEARCH_CELLS,
    step_m: float = 1000.0,
) -> dict[str, np.ndarray]:
    """Kilometres from each measured kilometre of each river to the grid's nearest
    large channel, by river name; inf where none is within `search` cells.

    Only points on fetched ground are measured, and only fetched channels count.
    """
    height, width = ground.shape
    channel = (acc_km2 >= threshold_km2) & ground.fetched
    fetched = ground.fetched.ravel()
    t = ground.transform
    found: dict[str, list[float]] = defaultdict(list)
    for line in lines:
        x, y = walk(line.x, line.y, step_m)
        cells = ground.cells(x, y)
        for px, py, cell in zip(x, y, cells):
            if cell < 0 or not fetched[cell]:
                continue
            row, col = divmod(int(cell), width)
            r0, r1 = max(0, row - search), min(height, row + search + 1)
            c0, c1 = max(0, col - search), min(width, col + search + 1)
            rows, cols = np.nonzero(channel[r0:r1, c0:c1])
            if len(rows) == 0:
                found[line.name].append(math.inf)
                continue
            cx = t.a * (c0 + cols + 0.5) + t.c
            cy = t.e * (r0 + rows + 0.5) + t.f
            found[line.name].append(float(np.hypot(cx - px, cy - py).min()) / 1000)
    return {name: np.asarray(values) for name, values in found.items()}


# ------------------------------------------------------------------ measure


def measure(grid_path: Path, manifest_path: Path) -> dict:
    """Everything this module says about one built corridor."""
    import rasterio

    with rasterio.open(grid_path) as dataset:
        heights = dataset.read(1)
        transform = dataset.transform
    manifest = json.loads(manifest_path.read_text())
    window = grid.TileWindow(**manifest["window"])
    fetched = coverage.sample_mask(window, manifest["coverage"]["tiles"])
    if fetched.shape != heights.shape:
        raise SystemExit(f"coverage is {fetched.shape} and the grid is {heights.shape}")
    ground = Grid(heights=heights, transform=transform, fetched=fetched)

    river_shapes = load(RIVERS)
    lake_shapes = load(LAKES)
    box = extent(ground)
    lines = lines_from(river_shapes, box=box)
    on_grid = [line for line in lines if (ground.cells(*walk(line.x, line.y, STEP_M)) >= 0).any()]

    drainage = hydro.flood(heights)
    acc = hydro.accumulate(drainage)
    labels, basins = hydro.basins(heights, drainage)
    resolution = abs(transform.a)
    looked_at = set(hydro.inspected(basins, resolution))
    wanted = [n + 1 for n, b in enumerate(basins) if b in looked_at]
    # A basin any cell of which stands on unfetched ground is a question about
    # zeros, not about rivers.
    unfetched = np.bincount(labels[~fetched], minlength=len(basins) + 1)
    measured = [b for b in wanted if unfetched[b] == 0]

    lakes = lakes_raster(lake_shapes, ground, box=box)
    lake_names = [name_of(shape.record) for shape in lake_shapes]
    ends_at = mouths(on_grid, ground)
    said = verdicts(labels, measured, on_grid, lakes, lake_names, ground, ends_at=ends_at)

    on_water = []
    for place in places.on_channel():
        xs, ys = grid.project([place.lat], [place.lon])
        on_water.append((place, distance_to_lines(xs[0], ys[0], on_grid) / 1000))

    return {
        "grid_path": grid_path,
        "resolution_m": resolution,
        "shape": heights.shape,
        "fetched_share": float(fetched.mean()),
        "versions": {s: _version(s) for s in (RIVERS, LAKES)},
        "digests": {s: vectors.read()["digests"][s]["sha256"] for s in (RIVERS, LAKES)},
        "river_shapes": len(river_shapes),
        "lake_shapes": len(lake_shapes),
        "features_on_grid": len({line.feature for line in on_grid}),
        "lake_cells": int((lakes > 0).sum()),
        "lakes_on_grid": int(len(np.unique(lakes[lakes > 0]))),
        "basins": basins,
        "labels": labels,
        "inspected": len(wanted),
        "measured": measured,
        "said": said,
        "mouths": len(ends_at),
        "on_water": on_water,
        "offsets": channel_offsets(on_grid, acc, ground),
        "transform": transform,
    }


def extent(ground: Grid, margin: float = 1.0) -> Box:
    """The grid's footprint in degrees, a degree wider all round: the box a
    shape has to touch to be worth projecting. Walked along the edges, because
    an Albers rectangle is a curved quadrilateral in degrees."""
    height, width = ground.shape
    t = ground.transform
    xs, ys = [], []
    for k in range(33):
        f = k / 32
        for col, row in ((f * width, 0), (f * width, height), (0, f * height), (width, f * height)):
            xs.append(t.a * col + t.b * row + t.c)
            ys.append(t.d * col + t.e * row + t.f)
    lats, lons = grid.unproject(xs, ys)
    return (min(lons) - margin, min(lats) - margin, max(lons) + margin, max(lats) + margin)


def _version(source_id: str) -> str:
    import zipfile

    source = vectors.BY_ID[source_id]
    with zipfile.ZipFile(vectors.data_dir() / source.filename) as archive:
        name = next((n for n in archive.namelist() if n.endswith("VERSION.txt")), None)
        return archive.read(name).decode("ascii").strip() if name else "?"


# ------------------------------------------------------------------- report


def _n(value: float) -> str:
    return f"{value:,.0f}"


def render(result: dict, corridor: str) -> str:
    from datetime import date

    from .hydro import _para

    basins = result["basins"]
    said: dict[int, Verdict] = result["said"]
    measured = result["measured"]
    km2 = (result["resolution_m"] / 1000) ** 2
    lines = [
        f"# Mapped rivers against the grid — {corridor}, {result['resolution_m']:.0f} m grid",
        "",
        f"{date.today().isoformat()} · `{result['grid_path'].name}` · Natural Earth 1:10m "
        f"rivers {result['versions'][RIVERS]} (sha256 `{result['digests'][RIVERS][:12]}…`) "
        f"and lakes {result['versions'][LAKES]} (sha256 `{result['digests'][LAKES][:12]}…`)",
        "",
    ]
    lines += _para(
        """Generated by `python -m nineskies.rivers`. Nothing is carved. This asks
        the first river network fetched (F59) the two questions F59 left for it:
        what it decides of the closed basins HydroSHEDS' own rule says need a map,
        and whether its lines run where this grid's valleys do. Only ground the
        source reached is measured: a sample on a tile any part of which was never
        fetched is a zero nobody measured (F54)."""
    )
    lines += [
        "| Read | Count |",
        "| --- | ---: |",
        f"| River lines in the file | {_n(result['river_shapes'])} |",
        f"| …touching this grid | {_n(result['features_on_grid'])} |",
        f"| Lakes in the file | {_n(result['lake_shapes'])} |",
        f"| …with a cell on this grid | {_n(result['lakes_on_grid'])}, "
        f"{_n(result['lake_cells'] * km2)} km² |",
        f"| Samples on fetched ground | {100 * result['fetched_share']:.1f} % |",
        "",
    ]

    lines += ["## Where its lines sit", "", "### Against places sited on the water", ""]
    lines += _para(
        """Five places in `places.py` were measured onto the river off the source's
        own 30 m, independently of this network and of the grid (F50, F52). The
        grid's own derived river meets four of them inside 1.5 km
        (`docs/hydro-report.md`)."""
    )
    lines += ["| Place | Nearest mapped line |", "| --- | ---: |"]
    for place, km in result["on_water"]:
        mark = "✓" if km <= hydro.NEAR_KM else "✗"
        lines.append(f"| `{place.id}` | {km:.2f} km {mark} |")
    within = sum(1 for _, km in result["on_water"] if km <= hydro.NEAR_KM)
    lines += [""]
    lines += _para(
        f"""{within} of the {len(result['on_water'])} are inside
        {hydro.NEAR_KM} km of a Natural Earth line."""
    )

    lines += ["### Against this grid's own channels", ""]
    lines += _para(
        f"""Every kilometre of mapped line on fetched ground, measured to the
        nearest cell of this grid with {CHANNEL_KM2:,} km² or more draining
        through it, looked for within {SEARCH_CELLS} km. Where they disagree,
        this table cannot say which is wrong: inside a sealed basin the grid's
        channel is the flood's tie-break (D56), and that is the ground a carve
        is for."""
    )
    lines += [
        "| River | km of line | median | 90th percentile | within 1 km | within 2 km | none within 15 km |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    offsets = result["offsets"]
    every = np.concatenate([v for v in offsets.values()]) if offsets else np.array([])
    ranked = sorted(offsets.items(), key=lambda item: (-len(item[1]), item[0]))
    for name, values in [("all lines", every)] + [(n, v) for n, v in ranked if len(v) >= ROW_KM]:
        finite = values[np.isfinite(values)]
        if not len(values):
            continue
        median = f"{np.median(finite):.2f} km" if len(finite) else "—"
        p90 = f"{np.percentile(finite, 90):.1f} km" if len(finite) else "—"
        label = f"**{name}**" if name == "all lines" else name
        lines.append(
            f"| {label} | {_n(len(values))} | {median} | {p90} | "
            f"{100 * np.mean(values <= 1):.0f} % | {100 * np.mean(values <= 2):.0f} % | "
            f"{_n(np.isinf(values).sum())} |"
        )
    lines.append("")

    lines += ["## What it decides", ""]
    lines += _para(
        f"""Of the {_n(result['inspected'])} basins HydroSHEDS' rule would have had a
        person look at, {_n(len(measured))} stand wholly on fetched ground. Each is
        asked what the mapped network does at it, in the order of the rows. A
        river system whose mouth -- its lowest free end -- is inside ends there,
        which makes the basin a sink; {result['mouths']} systems on fetched ground
        have a mouth that can be named at all. A river crossing the rim twice or
        more passes through, so the basin is a clipped channel to be drained. A
        lake is standing water."""
    )
    lines += ["| Natural Earth | Basins | km² |", "| --- | ---: | ---: |"]
    tally: Counter = Counter()
    area: Counter = Counter()
    for label in measured:
        says = said[label].says
        tally[says] += 1
        area[says] += basins[label - 1].cells * km2
    for says in SAYS:
        lines.append(f"| {says} | {_n(tally[says])} | {_n(area[says])} |")
    lines.append("")

    largest = sorted(
        (b for b in measured if basins[b - 1].cells * km2 > LARGE_KM2),
        key=lambda b: (-basins[b - 1].cells, b),
    )
    lines += [f"### The {len(largest)} over {LARGE_KM2:,} km²", ""]
    lines += [
        "| km² | deepest | lat | lon | Natural Earth | rivers | lakes |",
        "| ---: | ---: | ---: | ---: | --- | --- | --- |",
    ]
    rows = [basins[b - 1].row for b in largest]
    cols = [basins[b - 1].col for b in largest]
    t = result["transform"]
    xs = [t.a * (c + 0.5) + t.c for c in cols]
    ys = [t.e * (r + 0.5) + t.f for r in rows]
    lats, lons = grid.unproject(xs, ys) if largest else ([], [])
    for basin, lat, lon in zip(largest, lats, lons):
        verdict = said[basin]
        lines.append(
            f"| {_n(basins[basin - 1].cells * km2)} | {basins[basin - 1].deepest_m:,.1f} m | "
            f"{lat:.2f} N | {lon:.2f} E | {verdict.says} | "
            f"{', '.join(verdict.rivers) or '—'} | {', '.join(verdict.lakes[:3]) or '—'} |"
        )
    lines.append("")

    lines += ["## What it cannot decide", ""]
    lines += _para(
        f"""**{_n(tally[SILENT])} basins, {_n(area[SILENT])} km²,** are touched by no
        mapped river or lake. At 1:10 million that is most of them, and it is the
        half of the question F59 said Natural Earth could not answer. A lake with
        no mapped river is not a sink either: the network is too coarse to draw
        every outflow, so a lake that drains through a river this map leaves out
        reads exactly like one that does not drain at all. D62 settles both the
        way HydroSHEDS settled the sinks it did not inspect: the untouched basins
        are filled, and the lakes this map draws are kept at their level."""
    )
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    import argparse
    import sys

    from .acquire import data_root

    parser = argparse.ArgumentParser(
        description="Stage 3's first mapped rivers against the grid's own (F60)."
    )
    parser.add_argument("--corridor", default="sea-to-sky")
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args(argv)

    grid_path = data_root() / "work" / f"{args.corridor}-1km.tif"
    manifest_path = world_root() / args.corridor / "manifest.json"
    for path, how in ((grid_path, "make grid"), (manifest_path, "make tiles")):
        if not path.exists():
            print(f"no {path.name} at {path}; run `{how}` first", file=sys.stderr)
            return 1
    report = render(measure(grid_path, manifest_path), args.corridor)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(report)
    print(report)
    return 0


def world_root() -> Path:
    """Where `make tiles` publishes a world: `dist-world/` beside the repository."""
    return Path(__file__).resolve().parents[2] / "dist-world"


if __name__ == "__main__":
    import sys

    sys.exit(main())
