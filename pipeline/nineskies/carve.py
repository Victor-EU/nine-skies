"""Stage 3 — the mapped rivers are carved, the mapped lakes are kept.

**What it does.** Stage 2 writes a grid in which 12.64 % of the corridor has no
outlet (F56). The question of which of those closed basins holds real water
needs a map, and D62 answers it with Natural Earth's: a basin a mapped river
runs through is drained along the river, one a mapped lake lies in keeps its
level, and every other one gets the rule `RULE` names. This module applies
that rule to the grid rather than to a list of basins:

- **Every mapped river runs downhill.** Each run of a Natural Earth line
  over measured ground is followed down the valley it lies in, and every cell
  on that way which stands above the lowest ground upstream of it is lowered
  to it. Only lowered, never raised, and never below what upstream already
  reaches -- which, because stage 2's mean-plus-bias only ever reads a valley
  floor high, is never below where the water really is. A basin the river
  runs through is drained by it and by nothing else.
- **A lake keeps its level.** Nothing inside a mapped lake's outline is cut
  below the lowest ground the lake already has, and a river's search for its
  valley does not enter a lake the river does not flow through, which is
  what stops a river rising on Yamdrok's rim from draining Yamdrok (F60).
- **Whatever is still closed afterwards gets `RULE`** -- except a basin a
  kept lake lies in, which is left as the source has it.

**Direction is read off the ground, one run at a time.** Natural Earth does
not draw its lines downstream (F60), so each run is turned so that it flows
from its higher end to its lower, each end read as the lowest ground within
`RADIUS_CELLS` of it. One run at a time rather than by river system, because
a system is joined by a tolerance, and one mistaken join would turn a whole
river round.

**The way down is the one water would take, inside a band.** A line drawn at
1:10 million is a cell or two off its valley in the mountains (F60) and
further off where it has been simplified, so the channel is not the line: it
is the path a priority-flood from the run's lower end grows up to its upper
end, through cells within `RADIUS_CELLS` of the line. Ordered by water level,
then by each cell's own height, so inside a hollow the flood finds the floor
before the walls and the way out is the lowest there is. Runs are cut lowest
first and every channel already cut is a place a later run may end, which is
how a tributary finds its river.

**A channel is four-connected.** Where the way steps diagonally, the lower of
the two cells beside the step is cut too. On eight neighbours a diagonal
step drains, but the surface the game draws between four samples does not:
the two cells across the step stand in the middle of it as a dam.
"""

from __future__ import annotations

import hashlib
import heapq
import json
import math
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Sequence

import numpy as np

from . import coverage, hydro, rivers

#: How far either side of a mapped line its valley is looked for, in cells.
#: Measured rather than chosen (F61): at 2 -- the width this plan once wrote
#: down for the burn -- Natural Earth's line across the neck of the Yarlung's
#: Great Bend is cut as a 2,660 m trench through the ridge the river goes
#: round. The deepest cut falls as the band widens and stops falling at 5,
#: at 968 m in the Dadu's own gorge, while the channel still stays within two
#: cells of the line for nine cells in ten.
RADIUS_CELLS = 5

#: What happens to a closed basin no mapped river drains and no mapped lake
#: lies in. The three the report prices side by side.
FILL = "fill"
LEAVE = "leave"
BREACH = "breach"
RULES = (FILL, LEAVE, BREACH)

#: D62, the user's, 22 September 2026: filled, as HydroSHEDS filled every
#: sink it did not inspect.
RULE = FILL


@dataclass(frozen=True)
class Run:
    """One stretch of one mapped line over measured ground, upstream first."""

    name: str
    feature: int
    cells: tuple[int, ...]


@dataclass
class Channel:
    """The way a run was cut, upstream first, four-connected."""

    run: Run
    cells: list[int]


# ------------------------------------------------------------------ runs


def lowest_near(
    heights: np.ndarray, index: int, radius: int, allowed: np.ndarray | None = None
) -> int:
    """The lowest allowed cell within `radius` cells of `index`; itself if none."""
    height, width = heights.shape
    row, col = divmod(int(index), width)
    r0, r1 = max(0, row - radius), min(height, row + radius + 1)
    c0, c1 = max(0, col - radius), min(width, col + radius + 1)
    block = np.asarray(heights[r0:r1, c0:c1], dtype="float64")
    if allowed is not None:
        block = np.where(allowed[r0:r1, c0:c1], block, np.inf)
    at = int(np.argmin(block))
    if not np.isfinite(block.flat[at]):
        return int(index)
    brow, bcol = divmod(at, c1 - c0)
    return (r0 + brow) * width + (c0 + bcol)


def runs(
    lines: Sequence[rivers.Line],
    cells_of: Callable[[np.ndarray, np.ndarray], np.ndarray],
    heights: np.ndarray,
    measured: np.ndarray,
    radius: int = RADIUS_CELLS,
    step: float = rivers.STEP_M,
) -> list[Run]:
    """Every stretch of every line over measured ground, each turned to flow
    from its higher end to its lower.

    A line is walked at a quarter of a cell, so no cell it crosses is
    stepped over, and split wherever it leaves the grid or measured ground:
    a line through ground nobody measured is compared with nothing.
    """
    flat_measured = measured.ravel()
    found: list[Run] = []
    for line in lines:
        x, y = rivers.walk(line.x, line.y, step)
        cells = cells_of(x, y)
        if len(cells) == 0:
            continue
        cells = cells[np.r_[True, cells[1:] != cells[:-1]]]
        good = (cells >= 0) & flat_measured[np.maximum(cells, 0)]
        stretch: list[int] = []
        for cell, ok in zip(cells.tolist(), good.tolist()):
            if ok:
                stretch.append(int(cell))
                continue
            if len(stretch) > 1:
                found.append(_turned(line, stretch, heights, measured, radius))
            stretch = []
        if len(stretch) > 1:
            found.append(_turned(line, stretch, heights, measured, radius))
    return found


def _turned(line, cells: list[int], heights, measured, radius) -> Run:
    flat = heights.ravel()
    first = flat[lowest_near(heights, cells[0], radius, measured)]
    last = flat[lowest_near(heights, cells[-1], radius, measured)]
    if first < last:
        cells = cells[::-1]
    return Run(name=line.name, feature=line.feature, cells=tuple(cells))


# ------------------------------------------------------------ the valley


def valley(
    heights: np.ndarray,
    allowed: np.ndarray,
    seeds: Sequence[int],
    start: int,
) -> list[int] | None:
    """The way water leaves `start` for the nearest seed through allowed cells.

    A priority-flood from the seeds, ordered by water level, then by the
    cell's own height, then by arrival; the answer is the tree it grows,
    read from `start` back to the seed that reached it. `None` if no seed
    can reach it. Indices are flat into `heights`.
    """
    height, width = heights.shape
    flat = np.asarray(heights, dtype="float64").ravel()
    ok = np.asarray(allowed).ravel()
    if not ok[start]:
        return None
    parent: dict[int, int] = {}
    heap: list[tuple[float, float, int, int]] = []
    arrival = 0
    seed_set = set()
    for seed in sorted(set(int(s) for s in seeds)):
        if ok[seed]:
            seed_set.add(seed)
            parent[seed] = -1
            heap.append((flat[seed], flat[seed], arrival, seed))
            arrival += 1
    heapq.heapify(heap)
    push, pop = heapq.heappush, heapq.heappop
    while heap and start not in parent:
        level, _, _, index = pop(heap)
        row, col = divmod(index, width)
        for drow, dcol in hydro.NB8:
            row2, col2 = row + drow, col + dcol
            if 0 <= row2 < height and 0 <= col2 < width:
                other = row2 * width + col2
                if other in parent or not ok[other]:
                    continue
                parent[other] = index
                own = flat[other]
                push(heap, (own if own > level else level, own, arrival, other))
                arrival += 1
    if start not in parent:
        return None
    path = [start]
    while parent[path[-1]] >= 0:
        path.append(parent[path[-1]])
    return path


def four_connected(path: Sequence[int], heights: np.ndarray, allowed: np.ndarray) -> list[int]:
    """The path with the lower of the two cells beside each diagonal step added."""
    width = heights.shape[1]
    flat = heights.ravel()
    ok = np.asarray(allowed).ravel()
    out = [int(path[0])] if len(path) else []
    for a, b in zip(path, path[1:]):
        row_a, col_a = divmod(int(a), width)
        row_b, col_b = divmod(int(b), width)
        if row_a != row_b and col_a != col_b:
            beside = [c for c in (row_a * width + col_b, row_b * width + col_a) if ok[c]]
            if beside:
                out.append(min(beside, key=lambda c: (float(flat[c]), c)))
        out.append(int(b))
    return out


def channels(
    heights: np.ndarray,
    found: Sequence[Run],
    measured: np.ndarray,
    lakes: np.ndarray,
    radius: int = RADIUS_CELLS,
) -> tuple[list[Channel], list[Run]]:
    """Each run's way down its valley, lowest run first; and the runs with none.

    A run looks for its valley within `radius` cells of its own line, on
    measured ground, and not inside a lake it does not itself touch. It ends
    at the lowest cell near its lower end, or at any channel already cut.
    """
    height, width = heights.shape
    flat = heights.ravel()
    flat_lakes = lakes.ravel()
    order = sorted(
        found,
        key=lambda r: (float(flat[lowest_near(heights, r.cells[-1], radius, measured)]),
                       r.feature, r.cells[0]),
    )
    cut = np.zeros(flat.size, dtype=bool)
    made: list[Channel] = []
    lost: list[Run] = []
    for run in order:
        cells = np.asarray(run.cells)
        own = set(int(k) for k in flat_lakes[cells] if k > 0)
        rows, cols = cells // width, cells % width
        r0, r1 = max(0, int(rows.min()) - radius), min(height, int(rows.max()) + radius + 1)
        c0, c1 = max(0, int(cols.min()) - radius), min(width, int(cols.max()) + radius + 1)
        band = np.zeros((r1 - r0, c1 - c0), dtype=bool)
        for row, col in zip((rows - r0).tolist(), (cols - c0).tolist()):
            band[max(0, row - radius):row + radius + 1, max(0, col - radius):col + radius + 1] = True
        local_lakes = lakes[r0:r1, c0:c1]
        foreign = (local_lakes > 0) & ~np.isin(local_lakes, sorted(own))
        band &= measured[r0:r1, c0:c1] & ~foreign
        local = heights[r0:r1, c0:c1]
        lw = c1 - c0

        def here(index: int) -> int:
            row, col = divmod(int(index), width)
            return (row - r0) * lw + (col - c0)

        def back(index: int) -> int:
            row, col = divmod(int(index), lw)
            return (row + r0) * width + (col + c0)

        end = lowest_near(local, here(run.cells[-1]), radius, band)
        already = cut.reshape(height, width)[r0:r1, c0:c1] & band
        seeds = [end] + np.flatnonzero(already.ravel()).tolist()
        path = valley(local, band, seeds, here(run.cells[0]))
        if path is None:
            lost.append(run)
            continue
        way = four_connected([back(i) for i in path], heights, measured)
        made.append(Channel(run=run, cells=way))
        cut[way] = True
    return made, lost


# ------------------------------------------------------------------ carve


def lake_floors(lakes: np.ndarray, heights: np.ndarray, measured: np.ndarray) -> dict[int, float]:
    """Each lake's lowest measured ground: the level nothing inside it is cut below."""
    flat = heights.ravel()
    ids = lakes.ravel()
    ok = measured.ravel() & (ids > 0)
    floors: dict[int, float] = {}
    for lake in np.unique(ids[ok]).tolist():
        floors[int(lake)] = float(flat[ok & (ids == lake)].min())
    return floors


def carve(
    heights: np.ndarray, made: Sequence[Channel], lakes: np.ndarray, floors: dict[int, float]
) -> np.ndarray:
    """Lower every channel cell to the lowest ground upstream of it.

    The greatest surface no higher than the ground on which every channel
    runs downhill, except where a lake's floor stops it: a cell inside a
    lake's outline is never cut below that lake's lowest ground, and the
    channel leaves the lake at that level. Computed lowest first, so each
    cell is settled once.
    """
    flat = np.asarray(heights, dtype="float64").ravel()
    ids = lakes.ravel()
    floor_of = {int(c): floors[int(ids[c])] for ch in made for c in ch.cells if ids[c] > 0}
    downstream: dict[int, set[int]] = defaultdict(set)
    for ch in made:
        for a, b in zip(ch.cells, ch.cells[1:]):
            if a != b:
                downstream[a].add(b)
    level = {int(c): float(flat[c]) for ch in made for c in ch.cells}
    heap = [(v, c) for c, v in level.items()]
    heapq.heapify(heap)
    while heap:
        value, cell = heapq.heappop(heap)
        if value > level[cell]:
            continue
        for after in downstream.get(cell, ()):
            lowered = max(floor_of.get(after, -math.inf), value)
            if lowered < level[after]:
                level[after] = lowered
                heapq.heappush(heap, (lowered, after))
    out = flat.copy()
    for cell, value in level.items():
        out[cell] = value
    return out.reshape(heights.shape).astype("float32")


# ------------------------------------------------------- the other basins


def closed_lakes(
    heights: np.ndarray, lakes: np.ndarray, floors: dict[int, float], outlets: np.ndarray
) -> list[int]:
    """The lakes still standing in a closed basin: water at their lowest cell
    has nowhere lower to go."""
    filled = hydro.flood(heights, outlets=outlets).filled.ravel()
    flat = heights.ravel()
    ids = lakes.ravel()
    kept = []
    for lake, floor in floors.items():
        cells = np.flatnonzero((ids == lake) & ~outlets.ravel())
        if not len(cells):
            continue
        low = cells[int(np.argmin(flat[cells]))]
        if filled[low] - flat[low] > hydro.DROWNED_M:
            kept.append(lake)
    return sorted(kept)


def breach(heights: np.ndarray, outlets: np.ndarray) -> np.ndarray:
    """Drain every closed basin by lowering its way out instead of filling it.

    The same priority-flood as `hydro.flood`, from the map edge and the
    outlets; when it reaches a cell lower than the one it came from, the
    cell is in a hollow, and the way back to the outlet is lowered to it
    until it meets ground that is already that low. Complete breaching, in
    the sense of Lindsay (2016) and RichDEM, with the flood's own arrival
    tie-break.
    """
    height, width = heights.shape
    flat = np.asarray(heights, dtype="float64").ravel().copy()
    parent = np.full(flat.size, -1, dtype=np.int64)
    seen = np.zeros(flat.size, dtype=bool)
    starts = np.zeros((height, width), dtype=bool)
    starts[0, :] = starts[-1, :] = starts[:, 0] = starts[:, -1] = True
    starts |= np.asarray(outlets, dtype=bool)
    heap: list[tuple[float, int, int]] = []
    arrival = 0
    for index in np.flatnonzero(starts.ravel()).tolist():
        seen[index] = True
        heap.append((flat[index], arrival, index))
        arrival += 1
    heapq.heapify(heap)
    push, pop = heapq.heappush, heapq.heappop
    while heap:
        _, _, index = pop(heap)
        row, col = divmod(index, width)
        for drow, dcol in hydro.NB8:
            row2, col2 = row + drow, col + dcol
            if 0 <= row2 < height and 0 <= col2 < width:
                other = row2 * width + col2
                if seen[other]:
                    continue
                seen[other] = True
                parent[other] = index
                target = flat[other]
                way = index
                while way >= 0 and flat[way] > target:
                    flat[way] = target
                    way = int(parent[way])
                push(heap, (target, arrival, other))
                arrival += 1
    return flat.reshape(height, width).astype("float32")


# ------------------------------------------------------------- stage 3


@dataclass
class Conditioned:
    """What stage 3 did to one grid, and everything the report needs to say so."""

    heights: np.ndarray
    carved: np.ndarray
    rule: str
    channels: list[Channel]
    lost: list[Run]
    river: np.ndarray
    floors: dict[int, float]
    kept: list[int]
    outlets: np.ndarray
    radius: int = RADIUS_CELLS
    runs: int = 0
    notes: dict = field(default_factory=dict)


def apply_rule(
    carved: np.ndarray, rule: str, outlets: np.ndarray, kept_cells: np.ndarray
) -> np.ndarray:
    """The rule for every closed basin the rivers leave, a kept lake's excepted."""
    if rule == LEAVE:
        return carved.copy()
    sinks = outlets | kept_cells
    if rule == FILL:
        return hydro.flood(carved, outlets=sinks).filled
    if rule == BREACH:
        return breach(carved, sinks)
    raise ValueError(f"no rule called {rule!r}; the rules are {', '.join(RULES)}")


def condition(
    heights: np.ndarray,
    lines: Sequence[rivers.Line],
    lakes: np.ndarray,
    measured: np.ndarray,
    cells_of: Callable[[np.ndarray, np.ndarray], np.ndarray],
    rule: str = RULE,
    radius: int = RADIUS_CELLS,
) -> Conditioned:
    """Stage 3 on one grid: carve the rivers, keep the lakes, apply the rule."""
    if rule not in RULES:
        raise ValueError(f"no rule called {rule!r}; the rules are {', '.join(RULES)}")
    heights = np.asarray(heights, dtype="float32")
    found = runs(lines, cells_of, heights, measured, radius)
    made, lost = channels(heights, found, measured, lakes, radius)
    floors = lake_floors(lakes, heights, measured)
    carved = carve(heights, made, lakes, floors)
    outlets = ~measured
    kept = closed_lakes(carved, lakes, floors, outlets)
    kept_cells = np.isin(lakes, kept) & measured
    river = np.zeros(heights.shape, dtype=bool)
    for ch in made:
        river.ravel()[ch.cells] = True
    return Conditioned(
        heights=apply_rule(carved, rule, outlets, kept_cells),
        carved=carved,
        rule=rule,
        channels=made,
        lost=lost,
        river=river,
        floors=floors,
        kept=kept,
        outlets=outlets,
        radius=radius,
        runs=len(found),
    )


# ------------------------------------------------------------ the corridor


def file_digest(path: Path) -> str:
    sha = hashlib.sha256()
    with open(path, "rb") as handle:
        while chunk := handle.read(1 << 20):
            sha.update(chunk)
    return sha.hexdigest()


def conditioned_path(corridor: str) -> Path:
    """Where stage 3 writes its grid, beside the one stage 2 wrote."""
    from .acquire import data_root

    return data_root() / "work" / f"{corridor}-1km-conditioned.tif"


def record_path(corridor: str) -> Path:
    from .acquire import data_root

    return data_root() / "work" / f"{corridor}-conditioning.json"


def inputs(rule: str, radius: int) -> dict:
    """What stage 3 read and chose, and one digest over all of it.

    The rivers and lakes are named by the SHA-256 `make vectors` recorded
    when it fetched them (D60), so a world names the vector bytes it was
    carved with as it names the rasters it was cut from (D24).
    """
    from . import vectors

    record = vectors.read()["digests"]
    named = {source: record[source]["sha256"] for source in (rivers.RIVERS, rivers.LAKES)}
    body = {"rule": rule, "radiusCells": radius, "vectors": named}
    digest = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
    return {**body, "sha256": digest}


@dataclass
class Corridor:
    """One corridor's stage 2 grid and everything stage 3 reads beside it."""

    heights: np.ndarray
    transform: object
    tags: dict
    measured: np.ndarray
    ground: rivers.Grid
    lines: list
    lakes: np.ndarray
    lake_names: list[str]
    path: Path


def load(corridor: str) -> Corridor:
    """Stage 2's grid, where its source reached, and the fetched vectors.

    Where the source reached is asked a sample at a time (`coverage.
    sample_states`), from the same tiles stage 2 warped: a sample is ground
    if the one-degree cell under it was fetched, and everything else --
    open sea, and ground this build never fetched (F54) -- is water leaving
    the world, never changed.
    """
    import rasterio

    from .acquire import data_root, parse_tile_list
    from .grid import CORRIDORS
    from .mosaic import available_tiles, corridor_window

    root = data_root()
    work = root / "work"
    path = work / f"{corridor}-1km.tif"
    sidecar = work / f"{corridor}-sources.json"
    listing = root / "source" / "tileList.txt"
    for needed, how in ((path, "make grid"), (sidecar, "make grid"), (listing, "make acquire")):
        if not needed.exists():
            raise SystemExit(f"no {needed.name} at {needed}; run `{how}` first")
    with rasterio.open(path) as dataset:
        heights = dataset.read(1)
        transform = dataset.transform
        tags = dataset.tags()
    box = CORRIDORS[corridor]
    fetched = {(lat, lon) for lat, lon, _ in available_tiles(box, root / "source" / "cop30")}
    built_from = json.loads(sidecar.read_text()).get("tiles")
    if built_from != len(fetched):
        raise SystemExit(
            f"stage 2 built {corridor} from {built_from} source tiles and {len(fetched)} are "
            f"on disk now, so where the source reached is not known; re-run `make grid`"
        )
    window = corridor_window(box)
    states = coverage.sample_states(window, fetched, parse_tile_list(listing.read_text()))
    measured = states == coverage.DATA
    if measured.shape != heights.shape:
        raise SystemExit(f"coverage is {measured.shape} and the grid is {heights.shape}")
    ground = rivers.Grid(heights=heights, transform=transform, fetched=measured)
    box = rivers.extent(ground)
    lake_shapes = rivers.load(rivers.LAKES)
    return Corridor(
        heights=heights,
        transform=transform,
        tags=tags,
        measured=measured,
        ground=ground,
        lines=rivers.lines_from(rivers.load(rivers.RIVERS), box=box),
        lakes=rivers.lakes_raster(lake_shapes, ground, box=box),
        lake_names=[rivers.name_of(shape.record) for shape in lake_shapes],
        path=path,
    )


def write(corridor: str, source: Corridor, result: Conditioned) -> tuple[Path, dict]:
    """The conditioned grid, georeferenced exactly as stage 2's, and its record."""
    import rasterio

    out = conditioned_path(corridor)
    with rasterio.open(source.path) as dataset:
        profile = dataset.profile
    with rasterio.open(out, "w", **profile) as dataset:
        dataset.write(result.heights.astype("float32"), 1)
        dataset.update_tags(**source.tags, stage3=result.rule, radius=str(result.radius))
    lowered = source.heights - result.carved
    changed = result.heights - result.carved
    record = {
        **inputs(result.rule, result.radius),
        "from": source.path.name,
        "fromSha256": file_digest(source.path),
        "channels": len(result.channels),
        "cellsCarved": int((lowered > hydro.DROWNED_M).sum()),
        "cellsRaised": int((changed > hydro.DROWNED_M).sum()),
        "cellsLowered": int((changed < -hydro.DROWNED_M).sum()),
        "lakesKept": len(result.kept),
    }
    record_path(corridor).write_text(json.dumps(record, indent=2) + "\n")
    return out, record


# ------------------------------------------------------------------ measure


def _where(transform, index: int, width: int) -> tuple[float, float]:
    from . import grid

    row, col = divmod(int(index), width)
    x, y = transform * (col + 0.5, row + 0.5)
    lats, lons = grid.unproject([x], [y])
    return float(lats[0]), float(lons[0])


@dataclass(frozen=True)
class Closed:
    """Where water has no way out on one grid, counted from the map edge as
    `docs/hydro-report.md` counts it."""

    cells: int
    basins: int
    #: Of those, the cells and basins a kept lake lies in.
    lake_cells: int
    lake_basins: int
    #: ...and the rest that touch ground nobody measured, where stage 3 lets
    #: water leave the world rather than guess at what is there.
    edge_cells: int
    edge_basins: int


def closed(heights: np.ndarray, kept_cells: np.ndarray, outlets: np.ndarray) -> Closed:
    drainage = hydro.flood(heights)
    labels, found = hydro.basins(heights, drainage)
    in_lake = np.unique(labels[kept_cells & (labels > 0)])
    near = np.zeros(outlets.shape, dtype=bool)
    height, width = outlets.shape
    for drow, dcol in hydro.NB8 + ((0, 0),):
        near[max(0, drow):height + min(0, drow), max(0, dcol):width + min(0, dcol)] |= outlets[
            max(0, -drow):height + min(0, -drow), max(0, -dcol):width + min(0, -dcol)
        ]
    at_edge = np.setdiff1d(np.unique(labels[near & (labels > 0)]), in_lake)
    return Closed(
        cells=int((labels > 0).sum()),
        basins=len(found),
        lake_cells=int(np.isin(labels, in_lake).sum()),
        lake_basins=len(in_lake),
        edge_cells=int(np.isin(labels, at_edge).sum()),
        edge_basins=len(at_edge),
    )


@dataclass(frozen=True)
class Cost:
    """What one rule for the other basins does to the carved grid."""

    rule: str
    raised: int
    lowered: int
    km3: float
    deepest_m: float
    at: tuple[float, float] | None
    over_100: int
    still_closed: Closed


def price(source: Corridor, result: Conditioned) -> list[Cost]:
    """Every rule applied to the same carved grid, measured the same way."""
    kept_cells = np.isin(source.lakes, result.kept) & source.measured
    width = source.heights.shape[1]
    costs = []
    for rule in RULES:
        out = (
            result.heights
            if rule == result.rule
            else apply_rule(result.carved, rule, result.outlets, kept_cells)
        )
        change = out.astype("float64") - result.carved
        moved = np.abs(change)
        deepest = int(np.argmax(moved))
        costs.append(Cost(
            rule=rule,
            raised=int((change > hydro.DROWNED_M).sum()),
            lowered=int((change < -hydro.DROWNED_M).sum()),
            km3=float(moved.sum() * 1e-3),
            deepest_m=float(moved.ravel()[deepest]),
            at=_where(source.transform, deepest, width) if moved.ravel()[deepest] > 0 else None,
            over_100=int((moved > 100).sum()),
            still_closed=closed(out, kept_cells, result.outlets),
        ))
    return costs


@dataclass(frozen=True)
class RiverRow:
    name: str
    cells: int
    cut: int
    deepest_m: float
    at: tuple[float, float]
    km3: float


def river_rows(source: Corridor, result: Conditioned) -> list[RiverRow]:
    lowered = (source.heights.astype("float64") - result.carved).ravel()
    width = source.heights.shape[1]
    by_name: dict[str, set[int]] = defaultdict(set)
    for ch in result.channels:
        by_name[ch.run.name].update(ch.cells)
    rows = []
    for name, cells in by_name.items():
        index = np.array(sorted(cells))
        cut = lowered[index]
        deepest = int(index[int(np.argmax(cut))])
        rows.append(RiverRow(
            name=name,
            cells=len(index),
            cut=int((cut > hydro.DROWNED_M).sum()),
            deepest_m=float(cut.max()),
            at=_where(source.transform, deepest, width),
            km3=float(cut.sum() * 1e-3),
        ))
    return sorted(rows, key=lambda r: (-r.deepest_m, r.name))


def stem(heights: np.ndarray, transform, prefer: np.ndarray | None = None) -> dict:
    """The grid's own largest river and what it does, as `hydro` reports it."""
    drainage = hydro.flood(heights, prefer=prefer)
    acc = hydro.accumulate(drainage)
    path = hydro.above(heights, hydro.main_stem(drainage, acc), level_m=hydro.SEA_M)
    width = heights.shape[1]
    return {
        "profile": hydro.profile(heights, drainage, path, width),
        "landfalls": hydro.landfalls(heights, path, width, transform),
    }


def reaches(raw: Path, conditioned: Path) -> dict[str, list]:
    """The Yangtze probe's reaches on both grids, as the probe report reads them."""
    from . import probe, probes
    from .sample import GridSampler

    yangtze = probes.MONOTONIC_PROBES[0]
    out = {}
    for label, path in (("stage 2", raw), ("stage 3", conditioned)):
        out[label] = probe.reaches(GridSampler(path), yangtze)
    return out


def measure(corridor: str, source: Corridor, result: Conditioned, out: Path) -> dict:
    kept_cells = np.isin(source.lakes, result.kept) & source.measured
    lowered = source.heights.astype("float64") - result.carved
    lake_ids = source.lakes.ravel()
    on_channel = set(int(k) for k in lake_ids[result.river.ravel()] if k > 0)
    measured_lakes = set(result.floors)
    kept_rows = sorted(
        ((source.lake_names[k - 1], int(((source.lakes == k) & source.measured).sum()))
         for k in result.kept),
        key=lambda item: (-item[1], item[0]),
    )
    return {
        "corridor": corridor,
        "raw": source.path,
        "out": out,
        "inputs": inputs(result.rule, result.radius),
        "shape": source.heights.shape,
        "measured_share": float(source.measured.mean()),
        "runs": result.runs,
        "channels": len(result.channels),
        "lost": [r.name for r in result.lost],
        "channel_cells": int(result.river.sum()),
        "carved_cells": int((lowered > hydro.DROWNED_M).sum()),
        "carved_km3": float(lowered.sum() * 1e-3),
        "carved_deepest": float(lowered.max()),
        "carved_over_300": int((lowered > 300).sum()),
        "rivers": river_rows(source, result),
        "lakes_measured": len(measured_lakes),
        "lakes_on_channel": len(on_channel & measured_lakes),
        "lakes_kept": kept_rows,
        "lakes_open": len(measured_lakes - set(result.kept)),
        "before": closed(source.heights, kept_cells, result.outlets),
        "costs": price(source, result),
        "stem_before": stem(source.heights, source.transform),
        "stem_after": stem(result.heights, source.transform, prefer=result.river),
        "reaches": reaches(source.path, out),
    }


# ------------------------------------------------------------------- report


def _n(value: float) -> str:
    return f"{value:,.0f}"


def render(result: dict) -> str:
    from datetime import date

    from .hydro import NEAR_KM, _para

    height, width = result["shape"]
    km2 = 1.0  # a 1 km cell
    rule = result["inputs"]["rule"]
    costs = {c.rule: c for c in result["costs"]}
    chosen = costs[rule]
    total = height * width
    lines = [
        f"# Stage 3 — {result['corridor']}, 1000 m grid",
        "",
        f"{date.today().isoformat()} · `{result['raw'].name}` → `{result['out'].name}` · "
        f"Natural Earth rivers `{result['inputs']['vectors'][rivers.RIVERS][:12]}…` and lakes "
        f"`{result['inputs']['vectors'][rivers.LAKES][:12]}…` · valleys looked for within "
        f"{result['inputs']['radiusCells']} km of each line · other closed basins: **{rule}** · "
        f"inputs `{result['inputs']['sha256'][:12]}…`",
        "",
    ]
    lines += _para(
        """Generated by `python -m nineskies.carve`. Stage 2's grid, conditioned
        (D62, D63): every run of a Natural Earth river over measured ground is
        followed down the valley it lies in and cut, lower only, until it runs
        downhill; nothing inside a mapped lake is cut below the lake's own floor;
        a lake still closed afterwards keeps its basin; and every other closed
        basin gets the rule named above. `docs/hydro-report.md` is the same grid
        before this stage, and `docs/rivers-report.md` is what the map was
        measured to decide of it (F60)."""
    )
    unchanged = total - result["carved_cells"] - chosen.raised - chosen.lowered
    verb = {FILL: "raised", LEAVE: "left", BREACH: "lowered"}[rule]
    lines += ["## What moved", ""]
    lines += [
        "| | cells | km³ | deepest |",
        "| --- | ---: | ---: | ---: |",
        f"| Cut along mapped rivers | {_n(result['carved_cells'])} | "
        f"{_n(result['carved_km3'])} | {_n(result['carved_deepest'])} m |",
        f"| Other closed basins, {verb} | {_n(chosen.raised + chosen.lowered)} | "
        f"{_n(chosen.km3)} | {_n(chosen.deepest_m)} m |",
        f"| Unchanged | {_n(unchanged)} of {_n(total)} | — | — |",
        "",
    ]

    lines += ["## The rivers", ""]
    lost = result["lost"]
    lines += _para(
        f"""{result['channels']} channels from {result['runs']} runs of mapped line
        over measured ground ({100 * result['measured_share']:.1f} % of this grid's
        samples), {_n(result['channel_cells'])} cells of channel in all.
        {"Every run found its way down." if not lost else
         f"{len(lost)} found no way down its band: {', '.join(sorted(set(lost)))}."}
        A cut is how far a cell stood above the lowest ground upstream of it on
        its own channel. The deepest are where a valley is narrower than a cell:
        stage 2 reads such a cell as mostly wall, and {_n(result['carved_over_300'])}
        cells are cut by more than 300 m."""
    )
    lines += [
        "| River | channel cells | cut | deepest | lat | lon | km³ |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in result["rivers"][:20]:
        lines.append(
            f"| {row.name} | {_n(row.cells)} | {_n(row.cut)} | {_n(row.deepest_m)} m | "
            f"{row.at[0]:.2f} N | {row.at[1]:.2f} E | {row.km3:,.1f} |"
        )
    lines += ["", f"The other {max(0, len(result['rivers']) - 20)} rivers cut less deeply.", ""]

    lines += ["## The lakes", ""]
    kept = result["lakes_kept"]
    named = [f"{name} ({_n(cells)} km²)" for name, cells in kept if name != "(unnamed)"]
    unnamed = sum(1 for name, _ in kept if name == "(unnamed)")
    lines += _para(
        f"""{result['lakes_measured']} mapped lakes have ground on this grid that
        was measured. {result['lakes_on_channel']} lie on a carved channel, which
        leaves each at its own floor. **{len(kept)} are still closed after the
        carve, and are kept:** {', '.join(named)}{f', and {unnamed} unnamed' if unnamed else ''}.
        Kept means the basin a lake lies in is left as the source has it, whatever
        the rule, which is D62's lake clause -- and its named failure, since a lake
        that drains through a river Natural Earth leaves out is kept closed with the
        rest: Chao Lake is on the list."""
    )

    before, after = result["before"], chosen.still_closed
    lines += ["## Where the water can go", ""]
    lines += [
        "| From the map edge | stage 2 | stage 3 |",
        "| --- | ---: | ---: |",
        f"| Cells with no outlet | {_n(before.cells)} ({100 * before.cells / total:.2f} %) | "
        f"{_n(after.cells)} ({100 * after.cells / total:.2f} %) |",
        f"| Closed basins | {_n(before.basins)} | {_n(after.basins)} |",
        f"| …holding a kept lake | {_n(before.lake_basins)}, {_n(before.lake_cells)} km² | "
        f"{_n(after.lake_basins)}, {_n(after.lake_cells)} km² |",
        f"| …against ground nobody measured | {_n(before.edge_basins)}, "
        f"{_n(before.edge_cells)} km² | {_n(after.edge_basins)}, {_n(after.edge_cells)} km² |",
        "",
    ]
    lines += _para(
        """Counted from the map edge, as the hydrology report counts it. Stage 3
        lets water that reaches the sea or ground this build never fetched leave
        the world there, so a basin against such ground is closed to this count
        and open to the stage."""
    )

    lines += ["## The grid's own largest river", ""]
    b, a = result["stem_before"]["profile"], result["stem_after"]["profile"]
    near = lambda falls: sum(1 for f in falls if f.on_channel and f.km_to_stem <= NEAR_KM)  # noqa: E731
    channel_places = sum(1 for f in result["stem_after"]["landfalls"] if f.on_channel)
    lines += _para(
        """Derived from each grid the way `docs/hydro-report.md` derives it -- fill,
        keep the tree the fill grew along, follow the largest catchment -- with
        the carved channels winning a tie of water level on stage 3's, so the tree
        crosses a flat along the river rather than as a wave (D56)."""
    )
    lines += [
        "| | stage 2 | stage 3 |",
        "| --- | ---: | ---: |",
        f"| Length | {_n(b.length_km)} km | {_n(a.length_km)} km |",
        f"| Steps that climb going downstream | {_n(b.uphill_steps)} | {_n(a.uphill_steps)} |",
        f"| Total ascent | {_n(b.ascent_m)} m | {_n(a.ascent_m)} m |",
        f"| Cells under a closed basin's water | {_n(b.drowned_cells)} | {_n(a.drowned_cells)} |",
        f"| Channel places within {NEAR_KM} km | {near(result['stem_before']['landfalls'])} of "
        f"{channel_places} | {near(result['stem_after']['landfalls'])} of {channel_places} |",
        "",
    ]

    lines += ["## The Yangtze probe's reaches", ""]
    lines += _para(
        """The golden probe compares one cell per waypoint, and every path between
        two of them crosses the sill between them (F58). A sill above the upstream
        cell is a reach nothing runs down; it is what the carve is for."""
    )
    lines += ["| Reach | sill over upstream, stage 2 | stage 3 |", "| ---: | ---: | ---: |"]
    two = {r.first: r for r in result["reaches"]["stage 2"]}
    three = {r.first: r for r in result["reaches"]["stage 3"]}
    for first in sorted(two):
        def over(r) -> str:
            return "—" if r is None or r.over_m is None else f"{max(r.over_m, 0.0):,.0f} m"
        lines.append(f"| {first + 1}–{first + 2} | {over(two[first])} | {over(three.get(first))} |")
    dammed = lambda found: sum(1 for r in found if (r.over_m or 0.0) >= 0.5)  # noqa: E731
    lines += [""]
    lines += _para(
        f"""{dammed(result['reaches']['stage 2'])} of {len(two)} reaches are dammed on
        stage 2's grid and {dammed(result['reaches']['stage 3'])} on stage 3's."""
    )

    lines += ["## What the rule for the other basins costs", ""]
    lines += _para(
        """Each rule applied to the same carved grid, and measured the same way. A
        kept lake's basin is left alone by all three, and every cell counted is
        ground the player sees move."""
    )
    lines += [
        "| Rule | cells raised | cells lowered | km³ | deepest | moved over 100 m | still closed |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for rule_name in RULES:
        c = costs[rule_name]
        where = f" at {c.at[0]:.2f} N {c.at[1]:.2f} E" if c.at else ""
        label = f"**{rule_name}**" if rule_name == rule else rule_name
        lines.append(
            f"| {label} | {_n(c.raised)} | {_n(c.lowered)} | {_n(c.km3)} | "
            f"{_n(c.deepest_m)} m{where} | {_n(c.over_100)} | "
            f"{_n(c.still_closed.cells)} cells, {_n(c.still_closed.basins)} basins |"
        )
    lines += [""]
    lines += _para(
        """**Fill** raises every hollow to the lowest point of its rim: HydroSHEDS'
        default for a sink nobody inspected, and right for a grid whose job is to
        route water. On ground that is drawn it pours a flat floor into a sealed
        valley as deep as the valley is sealed, and on an endorheic basin it lifts
        the floor to the rim. **Leave** changes nothing, and the world keeps the
        hollows stage 2 made where no mapped river runs. **Breach** lowers each
        hollow's lowest way out down to its floor instead, restoring a valley the
        1 km grid sealed -- and cutting an outlet for a real closed basin that no
        mapped lake marks."""
    )
    return "\n".join(lines) + "\n"


def build(corridor: str = "sea-to-sky", rule: str = RULE, radius: int = RADIUS_CELLS,
          report: Path | None = None) -> Path:
    source = load(corridor)
    result = condition(
        source.heights, source.lines, source.lakes, source.measured, source.ground.cells,
        rule=rule, radius=radius,
    )
    out, record = write(corridor, source, result)
    print(
        f"stage 3: {record['channels']} channels, {_n(record['cellsCarved'])} cells cut, "
        f"{record['lakesKept']} lakes kept, rule {rule}: {_n(record['cellsRaised'])} raised, "
        f"{_n(record['cellsLowered'])} lowered · wrote {out.name}",
        flush=True,
    )
    if report is not None:
        text = render(measure(corridor, source, result, out))
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(text)
        print(text)
    return out


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(
        description="Stage 3: carve the mapped rivers, keep the mapped lakes (D62, D63)."
    )
    parser.add_argument("--corridor", default="sea-to-sky")
    parser.add_argument("--rule", default=RULE, choices=RULES)
    parser.add_argument("--radius", type=int, default=RADIUS_CELLS)
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args(argv)
    build(args.corridor, args.rule, args.radius, args.report)
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
