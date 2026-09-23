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
- **A basin on the short list of named sinks keeps its level too** (D65).
  Natural Earth draws no lake in the Turpan depression, so the rule above
  would raise the lowest land in China to its rim; `SINKS` is the list of
  basins that are closed in life and that the map cannot say so about, each
  entry a `places.py` id and a sentence of why. It is applied at the basin's
  own floor rather than at the named coordinate, and at the floor of each
  hollow inside that basin the coordinate lies in, so the ground under a
  named place is never raised (F68); the report prints what each entry kept
  beside what the rule would have done instead.

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

**Where a line leaves the grid, the channel meets the river's own crossing.**
A line is drawn at 1:10 million and crosses a grid's edge where it happens to
be, which on a 90 m hero area was 2.4 km from the Jinsha and 276 m up its
wall. So an end on the grid's own edge is moved to where the river crosses:
the lowest ground on the edge inside the band where it leaves, and where it
enters, the first such ground the flood from the lower end settles -- the
lowest way in, never one over a ridge. Nothing is changed on the corridor,
where no measured cell is on the edge (F63).

**Any grid, not only the corridor's.** Stage 6 cuts its hero areas from the
source rather than from this grid, so the same stage runs on each of them
as it is cut: `ground_over` reads the vectors over any grid, and the band and
the walk are set by the grid's cell (D64).
"""

from __future__ import annotations

import hashlib
import heapq
import json
import math
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Mapping, Sequence

import numpy as np

from . import coverage, hydro, rivers

#: How far either side of a mapped line its valley is looked for. Measured
#: rather than chosen (F61): at 2 km -- the width this plan once wrote down
#: for the burn -- Natural Earth's line across the neck of the Yarlung's Great
#: Bend is cut as a 2,660 m trench through the ridge the river goes round. The
#: deepest cut falls as the band widens and stops falling at 5 km, at 968 m in
#: the Dadu's own gorge, while the channel still stays within two cells of the
#: line for nine cells in ten. It is how far the map can be from its valley,
#: which is a fact about the map rather than a grid, so a finer grid looks as
#: far in more cells: 56 on a 90 m hero area, where both areas' channels reach
#: the river's own crossings from 5 km and not from 4 (F63).
RADIUS_M = 5000.0


def radius_cells(resolution_m: float) -> int:
    """The band, in cells of a grid this fine."""
    return int(round(RADIUS_M / resolution_m))


#: The band on stage 2's 1 km grid.
RADIUS_CELLS = radius_cells(1000.0)

#: What happens to a closed basin no mapped river drains and no mapped lake
#: lies in. The three the report prices side by side.
FILL = "fill"
LEAVE = "leave"
BREACH = "breach"
RULES = (FILL, LEAVE, BREACH)

#: How many of the largest closed basins the report ranks, which is how a
#: named sink that ought to exist is seen rather than assumed absent (D65).
TOP_BASINS = 12

#: The size at which a closed basin is counted in the tail beneath that table.
#: A thousand cells is not a cell's mistake, and printing how many there are
#: keeps the twelve from reading as all of them: of the five in that table that
#: nothing keeps, four are anonymous floors inside endorheic country rather than
#: named sinks, and the tail is where the rest of their kind are (F65).
BIG_BASIN_KM2 = 1_000.0

#: D62, the user's, 22 September 2026: filled, as HydroSHEDS filled every
#: sink it did not inspect.
RULE = FILL


@dataclass(frozen=True)
class Sink:
    """A closed basin that is closed in life, kept the way a mapped lake is."""

    #: A `places.py` id. The coordinate lives there and nowhere else (D46);
    #: it only has to fall *inside* the basin, because what marks the basin
    #: is the basin's own floor -- and the ground under it is never raised,
    #: because each hollow it lies in is kept at its own floor too (F68).
    place: str
    #: Why this basin has no outlet, in the same voice a place's source is
    #: written in. It is the whole of what this entry claims.
    source: str


#: The closed basins the map cannot name, named here instead (D65, the user's,
#: 22 September 2026). D62 fills every basin no mapped river drains and no
#: mapped lake marks, which is right for a sink stage 2 invented and wrong for
#: one that has been closed since before there were maps. Natural Earth draws
#: no lake in the Turpan depression and none at the Tarim's end, so the fill
#: would raise the lowest land in China to its rim and take the Turpan golden
#: probe with it (F61). Qaidam and Junggar need no entry: Natural Earth draws
#: lakes in both, so D62's own clause keeps them.
#:
#: It is a list because there is no fetched source that says which sink is
#: real -- that was HydroRIVERS' endorheic flag, ruled out by the project's
#: licence (D61), and RiverATLAS' 2.42 GB, which D62 also left on the shelf.
#: So each entry carries its own source sentence, and the report prints what
#: the entry kept and what the fill would have done instead, which is how a
#: wrong entry is seen rather than believed.
SINKS: tuple[Sink, ...] = (
    Sink(
        "ayding-lake",
        "The Turpan depression has no outlet and never has: its floor is the "
        "lowest exposed land in China at -154 m, and what reaches it evaporates. "
        "Ayding Lake is a salt flat that holds water only after rain, which is "
        "why no map that draws lakes draws one here.",
    ),
    Sink(
        "tarim-terminus",
        "The Tarim ends in the sand rather than in a sea: Natural Earth draws "
        "its last river, the Konqi, stopping inside the basin, and draws no lake "
        "at the end of it. On the 1 km grid the end's lowest way out runs up the "
        "carved Konqi into Bosten Lake, which the rule keeps as a place water "
        "may leave, so without this entry the fill pours the end flat at "
        "Bosten's floor, 261 m over its own (F67, F68).",
    ),
)


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
    start: int | Sequence[int],
) -> list[int] | None:
    """The way water leaves `start` for the nearest seed through allowed cells.

    A priority-flood from the seeds, ordered by water level, then by the
    cell's own height, then by arrival; the answer is the tree it grows,
    read from `start` back to the seed that reached it. `start` may be
    several cells, and then it is the first of them the flood settles: the
    one reached at the lowest level, and the lowest of those. `None` if no
    seed can reach one. Indices are flat into `heights`.
    """
    height, width = heights.shape
    flat = np.asarray(heights, dtype="float64").ravel()
    ok = np.asarray(allowed).ravel()
    one = isinstance(start, (int, np.integer))
    wanted = {int(s) for s in ([start] if one else start) if ok[int(s)]}
    if not wanted:
        return None
    parent: dict[int, int] = {}
    heap: list[tuple[float, float, int, int]] = []
    arrival = 0
    for seed in sorted(set(int(s) for s in seeds)):
        if ok[seed]:
            parent[seed] = -1
            heap.append((flat[seed], flat[seed], arrival, seed))
            arrival += 1
    heapq.heapify(heap)
    push, pop = heapq.heappush, heapq.heappop
    # Stopped when a wanted cell is settled rather than first reached, so that
    # of several the lowest wins. A cell's parent is fixed when it is first
    # reached, so for a single one the way is the same either way.
    while heap:
        level, _, _, index = pop(heap)
        if index in wanted:
            path = [index]
            while parent[path[-1]] >= 0:
                path.append(parent[path[-1]])
            return path
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
    return None


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

    An end on the grid's own edge is where the river leaves the grid or
    enters it, and the line is not where it does (F63). The lower end is
    then the lowest ground on the edge within `radius` of the line's own;
    the upper, the first ground on the edge within `radius` of the line's
    own that the flood from the lower end settles -- the lowest way in, and
    never one reached over a ridge the river's own way is lower than.
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

    def on_edge(index: int) -> bool:
        row, col = divmod(int(index), width)
        return row in (0, height - 1) or col in (0, width - 1)

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

        # The grid's own edge, where it falls inside this band.
        rim = np.zeros(band.shape, dtype=bool)
        rim[0, :] |= r0 == 0
        rim[-1, :] |= r1 == height
        rim[:, 0] |= c0 == 0
        rim[:, -1] |= c1 == width
        rim &= band

        last, first = here(run.cells[-1]), here(run.cells[0])
        end = lowest_near(local, last, radius, rim if on_edge(run.cells[-1]) else band)
        already = cut.reshape(height, width)[r0:r1, c0:c1] & band
        seeds = [end] + np.flatnonzero(already.ravel()).tolist()
        start: int | list[int] = first
        if on_edge(run.cells[0]):
            row, col = divmod(first, lw)
            near = np.zeros(band.shape, dtype=bool)
            near[max(0, row - radius):row + radius + 1, max(0, col - radius):col + radius + 1] = True
            # A seed among them would be a way in that is already the way out:
            # a run too short to leave the edge it starts on.
            ways_in = set(np.flatnonzero((near & rim).ravel()).tolist()) - set(seeds)
            start = sorted(ways_in) or first
        path = valley(local, band, seeds, start)
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


def sink_cells(
    cells_of: Callable[[np.ndarray, np.ndarray], np.ndarray], sinks: Sequence[Sink] = SINKS
) -> dict[str, int]:
    """Each named sink's own cell, for the entries that fall on this grid.

    Through `grid.project`, which is the one place in the pipeline that calls
    a projection library, so a sink lands where a probe reading the same place
    lands and not one cell away.
    """
    if not sinks:
        return {}
    from . import grid as albers
    from . import places

    where = [places.BY_ID[sink.place] for sink in sinks]
    xs, ys = albers.project([p.lat for p in where], [p.lon for p in where])
    found = cells_of(np.asarray(xs, dtype="float64"), np.asarray(ys, dtype="float64"))
    return {sink.place: int(cell) for sink, cell in zip(sinks, found.tolist()) if cell >= 0}


@dataclass(frozen=True)
class Hollow:
    """One closed basin a named sink keeps, and what the rule would have done
    to it instead."""

    #: Its lowest cell, which is what marks it as a place water may leave.
    floor: int
    #: Its cells, how far the fill would have raised its floor, and the mean
    #: rise over the whole of it -- with every hollow outside it already kept.
    cells: int
    deepest_m: float
    mean_m: float
    floor_m: float


@dataclass(frozen=True)
class Kept:
    """What one named sink kept on one grid."""

    place: str
    #: The sink's own cell, where its coordinate falls.
    cell: int
    #: The closed basins it keeps, outermost first: the basin its coordinate
    #: lies in, then the hollow inside that one the coordinate still lies in
    #: once the basin's floor is kept, and so on until the coordinate drains.
    #: Empty where its cell is in no closed basin at all.
    hollows: tuple[Hollow, ...] = ()

    @property
    def floors(self) -> tuple[int, ...]:
        return tuple(hollow.floor for hollow in self.hollows)


#: What the ground outside a basin reads while the basin is looked inside:
#: above any ground there is, so that the one way out is the floor kept.
WALL_M = 1.0e7


def _hollow(basin: hydro.Depression, top: int, left: int, width: int) -> Hollow:
    return Hollow(
        floor=(top + basin.row) * width + left + basin.col,
        cells=basin.cells,
        deepest_m=basin.deepest_m,
        mean_m=basin.mean_m,
        floor_m=basin.floor_m,
    )


def hollows_within(heights: np.ndarray, basin: np.ndarray, floor: int, cell: int) -> list[Hollow]:
    """The hollows inside a kept basin that a cell lies in, outermost first.

    With the basin's floor kept, the fill still raises every hollow in it
    that can only reach the floor by climbing; if `cell` is in one, that
    hollow's floor is kept too and it is looked inside in turn, until the
    cell drains. Looked for in the basin alone, with everything round it a
    wall: every cell of a closed basin is below its rim, so the way from any
    hollow in it to its floor runs inside it, and a flood of the basin by
    itself fills it exactly as a flood of the whole grid would. On the
    country that is a flood of one basin's box rather than of 29.7 million
    cells, once for each level.
    """
    height, width = heights.shape
    out: list[Hollow] = []
    target_row, target_col = divmod(int(cell), width)
    while True:
        rows, cols = np.nonzero(basin)
        # A closed basin never reaches the map edge, which is an outlet, so
        # a box one cell wider than it is always on the grid.
        top, bottom = max(int(rows.min()) - 1, 0), min(int(rows.max()) + 2, height)
        left, right = max(int(cols.min()) - 1, 0), min(int(cols.max()) + 2, width)
        inside = basin[top:bottom, left:right]
        window = np.where(inside, heights[top:bottom, left:right], WALL_M).astype("float32")
        kept = np.zeros(window.shape, dtype=bool)
        floor_row, floor_col = divmod(int(floor), width)
        kept[floor_row - top, floor_col - left] = True
        labels, found = hydro.basins(window, hydro.flood(window, outlets=kept))
        label = int(labels[target_row - top, target_col - left])
        if not label:
            return out
        out.append(_hollow(found[label - 1], top, left, width))
        floor = out[-1].floor
        basin = np.zeros(heights.shape, dtype=bool)
        basin[top:bottom, left:right] = labels == label


def kept_sinks(
    heights: np.ndarray,
    outlets: np.ndarray,
    cells: Mapping[str, int],
    drainage: hydro.Drainage | None = None,
) -> dict[str, Kept]:
    """The closed basin each named sink lies in, kept at its own floor, and
    each hollow inside it that the sink's own coordinate lies in.

    `outlets` is every cell the rule lets water leave at besides these --
    ground nobody measured, and the kept lakes -- so a basin here is one the
    rule would fill, and what a row of the report says the rule would have
    done is what it would have done. Found from the map edge alone, the
    Tarim's end and the Turpan depression were one basin with its floor in
    Turpan, and keeping that floor kept nothing of the Tarim's: the rule
    lets water leave at Bosten Lake, the lowest way out of the Tarim's end
    runs up the carved Konqi into it, and the fill poured 220,244 km² flat
    at Bosten's floor, 1,044.5 m (F67, F68).

    The floor rather than the coordinate, because what a kept cell does is
    let water leave there: the fill raises everything that can only reach the
    mark by climbing, so marking a sink anywhere but its lowest cell would
    pour a floor into the deepest part of the basin it was meant to keep. A
    coordinate therefore only has to fall inside the basin, which is what
    makes this a short list of names rather than a survey.

    And the hollows inside it the coordinate lies in, so that the ground
    under an entry's own coordinate is never raised by the rule: a basin the
    1 km grid draws can hold the place an entry names in a hollow of its own
    above the basin's floor (F68). A hollow no entry lies in is still raised
    to its own rim: one the 1 km grid invented in the Taklamakan is the same
    artefact inside an endorheic basin as outside one, and an entry says the
    place it names has no outlet, not that nothing near it was ever
    mis-measured.

    `hollows` is empty where a sink's cell is in no closed basin at all --
    the carve has already drained it, the coordinate is on a rim, or the
    ground under it was never fetched. Reported rather than passed over: an
    entry that keeps nothing is either finished work or a wrong coordinate,
    and the report prints which.
    """
    if not cells:
        return {}
    if drainage is None:
        drainage = hydro.flood(heights, outlets=outlets)
    labels, found = hydro.basins(heights, drainage)
    width = heights.shape[1]
    out: dict[str, Kept] = {}
    for place, cell in cells.items():
        label = int(labels.ravel()[cell])
        if not label:
            out[place] = Kept(place=place, cell=cell)
            continue
        outer = _hollow(found[label - 1], 0, 0, width)
        inner = hollows_within(heights, labels == label, outer.floor, cell)
        out[place] = Kept(place=place, cell=cell, hollows=(outer, *inner))
    return out


def kept_mask(
    lakes: np.ndarray,
    kept: Sequence[int],
    measured: np.ndarray,
    sinks: Mapping[str, Kept] | None = None,
) -> np.ndarray:
    """Every cell the rule for the other basins must leave alone.

    One function, because the rule is applied in `condition` and priced again
    in `price`, and a kept basin the two disagreed about would be a cost
    reported for a world nobody built.
    """
    mask = np.isin(lakes, kept) & measured
    for sink in (sinks or {}).values():
        mask.ravel()[list(sink.floors)] = True
    return mask


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
    #: The named sinks that fall on this grid, and the basin each kept (D65).
    sinks: dict[str, Kept] = field(default_factory=dict)
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
    step: float = rivers.STEP_M,
    sinks: Sequence[Sink] = SINKS,
) -> Conditioned:
    """Stage 3 on one grid: carve the rivers, keep the lakes, apply the rule.

    `radius` is the band in this grid's cells and `step` the walk along a
    line, a quarter of one: both default to stage 2's 1 km grid. `sinks` are
    the named closed basins kept whatever the rule, of which only the ones
    inside this grid cost anything (D65).
    """
    if rule not in RULES:
        raise ValueError(f"no rule called {rule!r}; the rules are {', '.join(RULES)}")
    heights = np.asarray(heights, dtype="float32")
    found = runs(lines, cells_of, heights, measured, radius, step)
    made, lost = channels(heights, found, measured, lakes, radius)
    floors = lake_floors(lakes, heights, measured)
    carved = carve(heights, made, lakes, floors)
    outlets = ~measured
    kept = closed_lakes(carved, lakes, floors, outlets)
    lake_cells = kept_mask(lakes, kept, measured)
    here = kept_sinks(carved, outlets | lake_cells, sink_cells(cells_of, sinks))
    kept_cells = kept_mask(lakes, kept, measured, here)
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
        sinks=here,
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


def inputs(rule: str, radius: int, sinks: Mapping[str, Kept] | None = None) -> dict:
    """What stage 3 read and chose, and one digest over all of it.

    The rivers and lakes are named by the SHA-256 `make vectors` recorded
    when it fetched them (D60), so a world names the vector bytes it was
    carved with as it names the rasters it was cut from (D24).

    `sinks` names the kept basins of D65 -- the ones on this grid that kept
    something, since an entry whose basin is elsewhere or already drained
    left the grid exactly as it found it. The key is absent when there are
    none, which is why the corridor's digest is what it was before the list
    existed and no section had to be signed again.
    """
    from . import vectors

    record = vectors.read()["digests"]
    named = {source: record[source]["sha256"] for source in (rivers.RIVERS, rivers.LAKES)}
    body = {"rule": rule, "radiusCells": radius, "vectors": named}
    applied = sorted(p for p, sink in (sinks or {}).items() if sink.hollows)
    if applied:
        body["sinks"] = applied
    digest = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
    return {**body, "sha256": digest}


@dataclass
class Corridor:
    """One grid before stage 3 and everything stage 3 reads beside it: a
    corridor's stage 2 grid, or a hero area as stage 6 cuts it."""

    heights: np.ndarray
    transform: object
    tags: dict
    measured: np.ndarray
    ground: rivers.Grid
    lines: list
    lakes: np.ndarray
    lake_names: list[str]
    path: Path
    #: What the source had under each sample, `coverage.STATES`, for a grid a
    #: corridor build made; a hero area's is all fetched and carries none.
    states: np.ndarray | None = None

    @property
    def resolution_m(self) -> float:
        return abs(self.transform.a)

    @property
    def cell_km2(self) -> float:
        """One cell's area; a metre of ground over it is a thousandth of this in km³."""
        return (self.resolution_m / 1000) ** 2


def ground_over(
    heights: np.ndarray, transform, measured: np.ndarray, path: Path, tags: dict | None = None
) -> Corridor:
    """Any grid, and the fetched rivers and lakes over it.

    Refused, naming the command, unless `make vectors` fetched both files and
    they are the bytes it recorded (D60).
    """
    ground = rivers.Grid(heights=heights, transform=transform, fetched=measured)
    box = rivers.extent(ground)
    lake_shapes = rivers.lake_shapes()
    return Corridor(
        heights=heights,
        transform=transform,
        tags=tags or {},
        measured=measured,
        ground=ground,
        lines=rivers.lines_from(rivers.load(rivers.RIVERS), box=box),
        lakes=rivers.lakes_raster(lake_shapes, ground, box=box),
        lake_names=[rivers.name_of(shape.record) for shape in lake_shapes],
        path=path,
    )


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
    corridor_ = ground_over(heights, transform, measured, path, tags)
    corridor_.states = states
    return corridor_


def write(corridor: str, source: Corridor, result: Conditioned) -> tuple[Path, dict]:
    """The conditioned grid, georeferenced exactly as stage 2's, and its record."""
    import rasterio

    out = conditioned_path(corridor)
    with rasterio.open(source.path) as dataset:
        profile = dataset.profile
    with rasterio.open(out, "w", **profile) as dataset:
        dataset.write(result.heights.astype("float32"), 1)
        dataset.update_tags(**source.tags, stage3=result.rule, radius=str(result.radius))
    record = {
        **inputs(result.rule, result.radius, result.sinks),
        "from": source.path.name,
        "fromSha256": file_digest(source.path),
        **counts(source.heights, result),
    }
    record_path(corridor).write_text(json.dumps(record, indent=2) + "\n")
    return out, record


def differs(record: dict, rule: str, vectors: dict) -> str | None:
    """What a conditioning record disagrees with these inputs about, or None.

    One world is carved one way. A hero area is conditioned by this stage as
    stage 6 cuts it (D64), and the country grid it is dropped into was
    conditioned by the same stage earlier, so a build that changed the rule or
    re-fetched the vectors between the two would draw two rules across one
    seam. The band is not compared: it is in cells of its own grid. Nor are
    the kept sinks (D65), for the same reason -- a named sink costs a grid
    nothing unless it falls inside it, so an 11.52 km area and the country
    grid around it disagree about the list whenever the list is not empty.
    """
    if record.get("rule") != rule:
        return f"the grid beside it was carved with rule {record.get('rule')!r} and this is {rule!r}"
    if record.get("vectors") != vectors:
        return "the grid beside it was carved from other river and lake files than these"
    return None


def counts(before: np.ndarray, result: Conditioned) -> dict:
    """What stage 3 did to a grid, as its record and a manifest carry it."""
    lowered = before - result.carved
    changed = result.heights - result.carved
    return {
        "channels": len(result.channels),
        "cellsCarved": int((lowered > hydro.DROWNED_M).sum()),
        "cellsRaised": int((changed > hydro.DROWNED_M).sum()),
        "cellsLowered": int((changed < -hydro.DROWNED_M).sum()),
        "lakesKept": len(result.kept),
    }


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
    #: Of those, the cells and basins a kept lake lies in, or a named sink
    #: (D65) -- the two things the rule for the other basins leaves alone.
    kept_cells: int
    kept_basins: int
    #: ...and the rest that touch ground nobody measured, where stage 3 lets
    #: water leave the world rather than guess at what is there.
    edge_cells: int
    edge_basins: int
    #: The largest of them, when a caller asks for them, largest first. What
    #: makes a short list of named sinks checkable rather than assumed
    #: complete (D65): a basin big enough to be a real one is printed with
    #: what the rule does to it, so a missing entry is seen.
    largest: tuple[BasinRow, ...] = ()
    #: How many basins are over `BIG_BASIN_KM2`, and how many of those are
    #: kept. The table above is twelve rows and this is the tail it sits on:
    #: without it, twelve reads as the whole population (F65).
    big: int = 0
    big_kept: int = 0


@dataclass(frozen=True)
class BasinRow:
    """One closed basin, as the report ranks them."""

    cells: int
    km2: float
    deepest_m: float
    km3: float
    #: Its floor, in degrees; None where the caller passed no transform.
    at: tuple[float, float] | None
    #: True where a kept lake or a named sink already keeps this basin.
    kept: bool
    #: Kilometres from its floor to the nearest mapped river line, where the
    #: caller passed the lines. This is what separates the two kinds of large
    #: closed basin: a valley the 1 km cell sealed has a mapped river running
    #: through it, and an endorheic basin has no mapped line for hundreds of
    #: kilometres, because there is no through-drainage to draw (F60, F65).
    mapped_km: float | None = None


def closed(
    heights: np.ndarray,
    kept_cells: np.ndarray,
    outlets: np.ndarray,
    transform=None,
    cell_km2: float = 1.0,
    top: int = 0,
    lines: Sequence = (),
) -> Closed:
    drainage = hydro.flood(heights)
    labels, found = hydro.basins(heights, drainage)
    in_kept = np.unique(labels[kept_cells & (labels > 0)])
    near = np.zeros(outlets.shape, dtype=bool)
    height, width = outlets.shape
    for drow, dcol in hydro.NB8 + ((0, 0),):
        near[max(0, drow):height + min(0, drow), max(0, dcol):width + min(0, dcol)] |= outlets[
            max(0, -drow):height + min(0, -drow), max(0, -dcol):width + min(0, -dcol)
        ]
    at_edge = np.setdiff1d(np.unique(labels[near & (labels > 0)]), in_kept)
    big = [rank + 1 for rank, basin in enumerate(found) if basin.cells * cell_km2 >= BIG_BASIN_KM2]
    return Closed(
        cells=int((labels > 0).sum()),
        basins=len(found),
        kept_cells=int(np.isin(labels, in_kept).sum()),
        kept_basins=len(in_kept),
        edge_cells=int(np.isin(labels, at_edge).sum()),
        edge_basins=len(at_edge),
        largest=tuple(
            BasinRow(
                cells=basin.cells,
                km2=basin.cells * cell_km2,
                deepest_m=basin.deepest_m,
                km3=basin.cells * basin.mean_m * 1e-3 * cell_km2,
                at=(
                    _where(transform, basin.row * width + basin.col, width)
                    if transform is not None
                    else None
                ),
                kept=bool((rank + 1) in in_kept),
                mapped_km=(
                    _to_lines(transform, basin.row * width + basin.col, width, lines)
                    if lines and transform is not None
                    else None
                ),
            )
            for rank, basin in enumerate(found[:top])
        ),
        big=len(big),
        big_kept=len([label for label in big if label in in_kept]),
    )


def _to_lines(transform, index: int, width: int, lines: Sequence) -> float:
    """Kilometres from one cell to the nearest mapped river line."""
    from . import rivers

    row, col = divmod(int(index), width)
    x, y = transform * (col + 0.5, row + 0.5)
    return rivers.distance_to_lines(x, y, lines) / 1000.0


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
    kept_cells = kept_mask(source.lakes, result.kept, source.measured, result.sinks)
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
            km3=float(moved.sum() * 1e-3 * source.cell_km2),
            deepest_m=float(moved.ravel()[deepest]),
            at=_where(source.transform, deepest, width) if moved.ravel()[deepest] > 0 else None,
            over_100=int((moved > 100).sum()),
            still_closed=closed(out, kept_cells, result.outlets,
                                source.transform, source.cell_km2, top=TOP_BASINS,
                                lines=source.lines),
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
            km3=float(cut.sum() * 1e-3 * source.cell_km2),
        ))
    return sorted(rows, key=lambda r: (-r.deepest_m, r.name))


@dataclass(frozen=True)
class SinkRow:
    """One entry of the named list, against this grid."""

    name: str
    at: tuple[float, float]
    source: str
    #: None where the entry's coordinate is off this grid entirely, which is
    #: every entry on every grid but the country one.
    kept: Kept | None
    #: Each hollow it keeps, outermost first, as the report prints it.
    hollows: tuple[HollowRow, ...] = ()


@dataclass(frozen=True)
class HollowRow:
    hollow: Hollow
    km2: float
    km3: float
    floor_at: tuple[float, float]


def sink_rows(
    source: Corridor, result: Conditioned, sinks: Sequence[Sink] = SINKS
) -> list[SinkRow]:
    """The whole list against this grid, the entries that fall outside it
    included -- a list is only short enough to read if it is all printed."""
    from . import places

    width = source.heights.shape[1]
    rows = []
    for sink in sinks:
        place = places.BY_ID[sink.place]
        kept = result.sinks.get(sink.place)
        rows.append(SinkRow(
            name=place.name,
            at=(place.lat, place.lon),
            source=sink.source,
            kept=kept,
            hollows=tuple(
                HollowRow(
                    hollow=hollow,
                    km2=hollow.cells * source.cell_km2,
                    km3=hollow.cells * hollow.mean_m * 1e-3 * source.cell_km2,
                    floor_at=_where(source.transform, hollow.floor, width),
                )
                for hollow in (kept.hollows if kept is not None else ())
            ),
        ))
    return rows


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
    kept_cells = kept_mask(source.lakes, result.kept, source.measured, result.sinks)
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
        "inputs": inputs(result.rule, result.radius, result.sinks),
        "shape": source.heights.shape,
        "measured_share": float(source.measured.mean()),
        "runs": result.runs,
        "channels": len(result.channels),
        "lost": [r.name for r in result.lost],
        "channel_cells": int(result.river.sum()),
        "carved_cells": int((lowered > hydro.DROWNED_M).sum()),
        "carved_km3": float(lowered.sum() * 1e-3 * source.cell_km2),
        "carved_deepest": float(lowered.max()),
        "carved_over_300": int((lowered > 300).sum()),
        "rivers": river_rows(source, result),
        "lakes_measured": len(measured_lakes),
        "lakes_on_channel": len(on_channel & measured_lakes),
        "lakes_kept": kept_rows,
        "sinks": sink_rows(source, result),
        "lakes_open": len(measured_lakes - set(result.kept)),
        "before": closed(source.heights, kept_cells, result.outlets,
                         source.transform, source.cell_km2, top=TOP_BASINS),
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

    lines += ["## The named sinks", ""]
    sinks = result["sinks"]
    on_grid = [row for row in sinks if row.kept is not None]
    lines += _para(
        f"""The basins that are closed in life and that no map this stage reads
        says so about (D65). Each is kept the way a mapped lake's basin is kept:
        the basin's own floor is a place water may leave, so the rule above
        passes over it and the ground inside it stays as the source has it.
        {len(sinks)} on the list, {len(on_grid)} on this grid. An entry only
        costs the grid it falls inside, which is why this table prints the whole
        list and not the part of it that did something here."""
    )
    lines += [
        "| Sink | coordinate | basin | its floor | the rule would have moved |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for row in sinks:
        kept = row.kept
        where = f"{row.at[0]:.2f} N {row.at[1]:.2f} E"
        if kept is None:
            lines.append(f"| {row.name} | {where} | not on this grid | — | — |")
        elif not row.hollows:
            lines.append(
                f"| {row.name} | {where} | **in no closed basin here** | — | — |"
            )
        for depth, shown in enumerate(row.hollows):
            hollow, at = shown.hollow, shown.floor_at
            name, coordinate = (row.name, where) if depth == 0 else ("…and the hollow inside it", "")
            lines.append(
                f"| {name} | {coordinate} | {_n(shown.km2)} km² | {_n(hollow.floor_m)} m at "
                f"{at[0]:.2f} N {at[1]:.2f} E | {_n(hollow.deepest_m)} m, {_n(shown.km3)} km³ |"
            )
    lines += [""]
    lines += _para(
        """An entry whose basin reads *in no closed basin here* has either been
        drained already, by a mapped river running through it, or been named at a
        coordinate outside the basin it meant -- and the first is finished work
        where the second is a fault. A row beneath an entry is a hollow inside its
        basin that the entry's own coordinate lies in, which the fill would still
        have raised with the basin's floor kept, and it is kept too, so the ground
        under a named coordinate is never raised (F68). Every other hollow inside a
        kept basin is raised to its own rim rather than to the basin's: one the
        1 km cell invented inside an endorheic basin is the same artefact as one
        outside it.
        What each entry claims is only that the basin has no way out:"""
    )
    lines += [""]
    for row in sinks:
        lines.append(f"- **{row.name}** — {row.source}")
    lines += [""]

    before, after = result["before"], chosen.still_closed
    lines += ["## Where the water can go", ""]
    lines += [
        "| From the map edge | stage 2 | stage 3 |",
        "| --- | ---: | ---: |",
        f"| Cells with no outlet | {_n(before.cells)} ({100 * before.cells / total:.2f} %) | "
        f"{_n(after.cells)} ({100 * after.cells / total:.2f} %) |",
        f"| Closed basins | {_n(before.basins)} | {_n(after.basins)} |",
        f"| …holding a kept lake or a named sink | {_n(before.kept_basins)}, "
        f"{_n(before.kept_cells)} km² | {_n(after.kept_basins)}, {_n(after.kept_cells)} km² |",
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

    ranked = costs[LEAVE].still_closed.largest
    if ranked:
        still = costs[LEAVE].still_closed
        lines += _para(
            f"""The {len(ranked)} largest of those basins, on the carved grid and
            before any rule is applied to it. A basin this size is either a real
            one or a valley the 1 km cell sealed, and the *kept* column says
            which this build thinks it is: a mapped lake lies in it, or it is on
            the short list of named sinks (D65), or the rule above moves it.
            Printed because a list of names cannot be checked against what is not
            printed — an entry that ought to exist is a large basin here with no
            mark beside it. The last column is a distance and not a verdict: the
            two kinds overlap in it, and what it is good for is the order of
            magnitude — kilometres where a mapped river runs through the hollow,
            tens where one runs nearby, hundreds where the map draws nothing at
            all because there is no through-drainage to draw (F60, F65)."""
        )
        lines += [
            "| # | km² | deepest | km³ | its floor | kept | nearest mapped line |",
            "| ---: | ---: | ---: | ---: | ---: | :-: | ---: |",
        ]
        for rank, basin in enumerate(ranked, 1):
            at = (f"{basin.at[0]:.2f} N {basin.at[1]:.2f} E" if basin.at else "—")
            near = "—" if basin.mapped_km is None else f"{_n(basin.mapped_km)} km"
            lines.append(
                f"| {rank} | {_n(basin.km2)} | {_n(basin.deepest_m)} m | {_n(basin.km3)} | "
                f"{at} | {'yes' if basin.kept else '—'} | {near} |"
            )
        lines += [""]
        if still.big:
            lines += _para(
                f"""**These {len(ranked)} rows are not the population.**
                {_n(still.big)} of these basins are {_n(BIG_BASIN_KM2)} km² or
                larger and {_n(still.big_kept)} of those are kept, so the table
                above is the largest {len(ranked)} of {_n(still.big)}. That is a
                fact about the instrument rather than about this table: a short
                list of named sinks reaches a basin that has a name, and a basin
                with no name can only be kept by siting a place inside it — from
                the basin the entry is meant to exempt, which is the circularity
                F49 and F50 are about. What would reach them is an extent from
                outside this build, which is `ne-regions` in the price list and
                is priced rather than fetched (F65)."""
            )

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


# ------------------------------------------------------------- hero areas

#: How near a carved channel a moved cell is counted as the river's own
#: ground in the hero report: the distance a river probe searches.
NEAR_RIVER_M = 2000.0


def _distance_m(cells: np.ndarray, to: np.ndarray, width: int, resolution_m: float) -> np.ndarray:
    """Metres from each cell's centre to the nearest of `to`'s; inf if `to` is empty."""
    cells = np.asarray(cells, dtype=np.int64)
    if not len(to):
        return np.full(len(cells), np.inf)
    ty, tx = np.divmod(np.asarray(to, dtype=np.int64), width)
    out = np.empty(len(cells))
    for k in range(0, len(cells), 2048):
        cy, cx = np.divmod(cells[k:k + 2048], width)
        d2 = (cy[:, None] - ty[None, :]) ** 2 + (cx[:, None] - tx[None, :]) ** 2
        out[k:k + 2048] = np.sqrt(d2.min(axis=1)) * resolution_m
    return out


def _edge(index: int, shape: tuple[int, int]) -> str:
    height, width = shape
    row, col = divmod(int(index), width)
    sides = [side for side, on in (("north", row == 0), ("south", row == height - 1),
                                   ("west", col == 0), ("east", col == width - 1)) if on]
    return " and ".join(sides) + " edge" if sides else "inside the area"


def measure_area(
    area_id: str,
    name: str,
    source: Corridor,
    result: Conditioned,
    seam: tuple[dict | None, dict | None] = (None, None),
) -> dict:
    """What stage 3 did to one hero area as stage 6 cut it (F63).

    `source` is the area as cut, before stage 3, and `seam` its edge against
    the country grid before and after, as `hero.boundary_disagreement` reads
    it.
    """
    shape = source.heights.shape
    width = shape[1]
    before = source.heights.astype("float64")
    after = result.heights.astype("float64")
    lowered = before - result.carved
    cut_at = int(np.argmax(lowered))
    river_cells = np.flatnonzero(result.river.ravel())

    found_rivers = []
    for ch in result.channels:
        way_in, way_out = ch.cells[0], ch.cells[-1]
        offsets = _distance_m(np.asarray(ch.cells), np.asarray(ch.run.cells), width,
                              source.resolution_m) / 1000
        found_rivers.append({
            "name": ch.run.name,
            "cells": len(ch.cells),
            "cut": int((lowered.ravel()[ch.cells] > hydro.DROWNED_M).sum()),
            "enters": (_where(source.transform, way_in, width), _edge(way_in, shape),
                       float(before.ravel()[way_in]), float(after.ravel()[way_in])),
            "leaves": (_where(source.transform, way_out, width), _edge(way_out, shape),
                       float(before.ravel()[way_out]), float(after.ravel()[way_out])),
            "offset_km": (float(np.median(offsets)), float(np.percentile(offsets, 90)),
                          float(offsets.max())),
            "sill_was": hydro.sill(source.heights, way_in, way_out),
            "sill_now": hydro.sill(result.heights, way_in, way_out),
        })

    changed = after - result.carved
    moved = np.flatnonzero(np.abs(changed.ravel()) > hydro.DROWNED_M)
    near = _distance_m(moved, river_cells, width, source.resolution_m) <= NEAR_RIVER_M
    drainage = hydro.flood(result.carved)
    _, decided = hydro.basins(result.carved, drainage)
    largest = []
    for basin in decided[:5]:
        index = basin.row * width + basin.col
        largest.append({
            "km2": basin.cells * source.cell_km2,
            "deepest_m": basin.deepest_m,
            "floor_m": basin.floor_m,
            "at": _where(source.transform, index, width),
            "from_river_km": float(_distance_m(np.array([index]), river_cells, width,
                                               source.resolution_m)[0]) / 1000,
        })
    kept_cells = kept_mask(source.lakes, result.kept, source.measured, result.sinks)
    return {
        "id": area_id,
        "name": name,
        "shape": shape,
        "resolution_m": source.resolution_m,
        "cell_km2": source.cell_km2,
        "inputs": inputs(result.rule, result.radius, result.sinks),
        "lost": [r.name for r in result.lost],
        "rivers": found_rivers,
        "carved_cells": int((lowered > hydro.DROWNED_M).sum()),
        "carved_km3": float(lowered.sum() * 1e-3 * source.cell_km2),
        "carved_deepest": float(lowered.ravel()[cut_at]),
        "carved_at": _where(source.transform, cut_at, width),
        "moved_near": int(near.sum()),
        "moved_near_deepest": float(np.abs(changed.ravel()[moved[near]]).max()) if near.any() else 0.0,
        "largest": largest,
        "lakes_kept": [source.lake_names[k - 1] for k in result.kept],
        "before": closed(source.heights, kept_cells, result.outlets),
        "costs": price(source, result),
        "seam": seam,
    }


def render_areas(areas: Sequence[dict]) -> str:
    """`docs/carve-report-hero.md`: stage 3 on every hero area cut."""
    from datetime import date

    from .hydro import _para

    first = areas[0]["inputs"] if areas else inputs(RULE, 0)
    rule = first["rule"]
    lines = [
        "# Stage 3 — hero areas, 90 m grid",
        "",
        f"{date.today().isoformat()} · {len(areas)} areas · Natural Earth rivers "
        f"`{first['vectors'][rivers.RIVERS][:12]}…` and lakes "
        f"`{first['vectors'][rivers.LAKES][:12]}…` · valleys looked for within "
        f"{RADIUS_M / 1000:.0f} km of each line, {first['radiusCells']} cells · other closed "
        f"basins: **{rule}** · inputs `{first['sha256'][:12]}…`",
        "",
    ]
    lines += _para(
        """Generated by `python -m nineskies.hero`. Stage 6 cuts each hero area from
        the source rather than from the country grid, so stage 3 on the country grid
        (`docs/carve-report.md`) never reached one, and the Jinsha crossed a sill in
        Tiger Leaping Gorge on the grid the seventh golden probe reads (F58). Each
        area is conditioned now as it is cut, by the same stage with the same inputs
        (D62, D63, D64): every mapped river carved down its own valley, lower only,
        from where it enters the area to where it leaves; every mapped lake kept;
        every other closed basin given the rule above. The band is the country
        grid's, in metres. The probes read what this writes
        (`docs/probe-report-hero.md`)."""
    )
    for area in areas:
        height, width = area["shape"]
        total = height * width
        costs = {c.rule: c for c in area["costs"]}
        chosen = costs[area["inputs"]["rule"]]
        verb = {FILL: "raised", LEAVE: "left", BREACH: "lowered"}[area["inputs"]["rule"]]
        lines += [f"## {area['name']}", "", f"`{area['id']}` · {width} × {height} samples at "
                  f"{area['resolution_m']:.0f} m", ""]
        unchanged = total - area["carved_cells"] - chosen.raised - chosen.lowered
        cut_where = f" at {area['carved_at'][0]:.2f} N {area['carved_at'][1]:.2f} E" if area["carved_cells"] else ""
        rule_where = f" at {chosen.at[0]:.2f} N {chosen.at[1]:.2f} E" if chosen.at else ""
        lines += [
            "| | cells | km³ | deepest |",
            "| --- | ---: | ---: | ---: |",
            f"| Cut along mapped rivers | {_n(area['carved_cells'])} | {area['carved_km3']:,.2f} | "
            f"{_n(area['carved_deepest'])} m{cut_where} |",
            f"| Other closed basins, {verb} | {_n(chosen.raised + chosen.lowered)} | "
            f"{chosen.km3:,.2f} | {_n(chosen.deepest_m)} m{rule_where} |",
            f"| Unchanged | {_n(unchanged)} of {_n(total)} | — | — |",
            "",
        ]

        lines += ["### The rivers", ""]
        if not area["rivers"]:
            lines += _para("No mapped river crosses this area, so nothing is carved.")
        else:
            lines += [
                "| River | Enters | Leaves | Channel | From the line: median, 90th, worst | "
                "Sill between its ends, as cut | Conditioned |",
                "| --- | --- | --- | ---: | ---: | ---: | ---: |",
            ]
            for r in area["rivers"]:
                (lat0, lon0), side0, was0, _ = r["enters"]
                (lat1, lon1), side1, was1, now1 = r["leaves"]
                leaves = f"{_n(was1)} m" + (f" → {_n(now1)} m" if abs(now1 - was1) >= 0.5 else "")

                def sill(found, start: float) -> str:
                    if found is None:
                        return "nothing joins them"
                    over = found.level_m - start
                    return (f"{_n(found.level_m)} m, where it enters" if over < 0.5
                            else f"{_n(found.level_m)} m, {_n(over)} m over where it enters")

                lo, p90, worst = r["offset_km"]
                lines.append(
                    f"| {r['name']} | {_n(was0)} m, {side0}, {lat0:.4f} N {lon0:.4f} E | "
                    f"{leaves}, {side1}, {lat1:.4f} N {lon1:.4f} E | {_n(r['cells'])} cells, "
                    f"{_n(r['cut'])} cut | {lo:.2f}, {p90:.2f}, {worst:.2f} km | "
                    f"{sill(r['sill_was'], was0)} | {sill(r['sill_now'], r['enters'][3])} |"
                )
            lines += [""]
            lines += _para(
                """The channel is the way a flood from where the river leaves grows up
                the valley to where it enters, through the cells within the band of the
                line; where the line crosses the area's edge is not where the river does,
                so each end is moved to the river's own crossing (F63). The *sill* is the
                highest ground on the lowest path between the channel's two ends: every
                path between them crosses it, so one above where the river enters is a
                dam nothing drains through."""
            )
        lost = area["lost"]
        if lost:
            lines += _para(f"No way down its band was found for: {', '.join(sorted(set(lost)))}.")
        if area["lakes_kept"]:
            lines += _para(f"Kept as closed lakes: {', '.join(area['lakes_kept'])}.")

        before, after = area["before"], chosen.still_closed
        lines += ["### Where the water can go", ""]
        lines += [
            "| From the area's edge | as cut | conditioned |",
            "| --- | ---: | ---: |",
            f"| Cells with no outlet | {_n(before.cells)} ({100 * before.cells / total:.2f} %) | "
            f"{_n(after.cells)} ({100 * after.cells / total:.2f} %) |",
            f"| Closed basins | {_n(before.basins)} | {_n(after.basins)} |",
            "",
        ]
        lines += _para(
            f"""The area's edge is the only way out: every sample is measured, because
            the cut refuses an area with a source cell missing. Of the cells the rule
            moved, {_n(area['moved_near'])} are within {NEAR_RIVER_M / 1000:.0f} km of a
            carved channel -- the distance a river probe searches -- by at most
            {area['moved_near_deepest']:,.1f} m. The five largest basins it decided, as
            they stood after the carve:"""
        )
        lines += [
            "| km² | deepest | floor | lat | lon | from the river |",
            "| ---: | ---: | ---: | ---: | ---: | ---: |",
        ]
        for b in area["largest"]:
            far = "—" if not np.isfinite(b["from_river_km"]) else f"{b['from_river_km']:.1f} km"
            lines.append(
                f"| {b['km2']:,.2f} | {b['deepest_m']:,.1f} m | {_n(b['floor_m'])} m | "
                f"{b['at'][0]:.4f} N | {b['at'][1]:.4f} E | {far} |"
            )
        lines += [""]

        lines += ["### What the rule for the other basins costs", ""]
        lines += [
            "| Rule | cells raised | cells lowered | km³ | deepest | moved over 100 m | still closed |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
        ]
        for rule_name in RULES:
            c = costs[rule_name]
            where = f" at {c.at[0]:.2f} N {c.at[1]:.2f} E" if c.at else ""
            label = f"**{rule_name}**" if rule_name == area["inputs"]["rule"] else rule_name
            lines.append(
                f"| {label} | {_n(c.raised)} | {_n(c.lowered)} | {c.km3:,.2f} | "
                f"{_n(c.deepest_m)} m{where} | {_n(c.over_100)} | "
                f"{_n(c.still_closed.cells)} cells, {_n(c.still_closed.basins)} basins |"
            )
        lines += [""]

        was, now = area["seam"]
        lines += ["### The seam", ""]
        if was is None or now is None:
            lines += _para("No country grid on this machine to measure the area's edge against.")
        else:
            lines += _para(
                f"""The area's edge against the country grid it is dropped into stands
                mean {was['meanM']:,.1f} m and worst {was['worstM']:,.1f} m from it as cut,
                and mean {now['meanM']:,.1f} m and worst {now['worstM']:,.1f} m conditioned,
                against {now['skirtDepthM']:,.0f} m of skirt."""
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
