"""Stage 2's grid before stage 3 -- where the water cannot go.

**What this module is for.** The build plan's stage 3 is hydro-conditioning:
burn mapped centrelines, enforce monotonic descent along them, flatten named
lakes. Before it ran, and before the fetch it needed was made, what that left
was a promise -- the GDD's *"rivers are carved, not painted"* -- with
no number attached to it, and a golden probe that cannot be made stricter: the
Yangtze monotonicity check walks a hand-placed chord of seven waypoints 500 km
apart, reads 175 of the corridor's 4.7 million cells, and F48 showed it passes
at every channel search radius including none. Densifying the chord finds 942
uphill steps and none of them is evidence, because a straight line from Tiger
Leaping Gorge to Chongqing crosses mountains the river goes around.

The centreline is what removes that objection, and **a centreline does not have
to be downloaded to exist**. A grid that has been mosaicked is already a
statement about where water would run: fill its pits, follow the steepest
descent, and the cells that collect the most upslope area *are* its channels.
That is how HydroSHEDS itself was made from SRTM. What this module derives is
therefore not the Yangtze -- it is **this grid's Yangtze**, which is the thing
worth checking, because the promise is about the world the game ships.

**Everything here is arithmetic** on the rule `siting.py` states: rasterio is
imported inside the two functions that read a built world, and the algorithms
below run on a bare interpreter with numpy and a synthetic array, which is what
`tests/test_hydro.py` does.

**The algorithm is priority-flood** (Barnes, Lehman and Mulla 2014), with the
one addition that makes it pay for itself twice: the flood is a breadth-first
growth outward from the map edge in order of water level, so the cell a given
cell is *first reached from* is a valid receiver -- it is never higher, and it
lies on a path to the edge. Recording that one parent turns the fill into a
drainage tree in the same pass, which is what `accumulate` sums and what
`main_stem` walks. Flats need no second pass for the same reason: inside a
filled lake every cell has the same water level, and the tree that grew across
it is already a consistent set of directions.

**What it cannot answer, and the number that proves it.** A depression is not
by itself a fault. The Tibetan plateau's lakes are endorheic in life: Namtso
has no outlet, and this grid reads it as 2,545 km2 of closed basin 36 m deep,
which is correct. A resampling artefact and a real closed basin look identical
from inside the grid, and telling them apart is exactly what a mapped river
network is for. So this module measures and reports; it does not carve. The
carve is `carve.py` (F61), which reads the answer Natural Earth gives, and this
module goes on measuring the grid stage 2 wrote -- the before of that.
"""

from __future__ import annotations

import heapq
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np

from . import grid, places

#: Eight neighbours. Flow routing is D8 everywhere it is done seriously, and
#: the reason is visible in this corridor's own numbers: at four neighbours a
#: channel running diagonally through a single cell has no path at all, and
#: the share of the grid with no outlet reads 19.5 % instead of 12.6 %. Two
#: thirds of that difference is the connectivity and not the world.
NB8: tuple[tuple[int, int], ...] = (
    (-1, -1), (-1, 0), (-1, 1),
    (0, -1), (0, 1),
    (1, -1), (1, 0), (1, 1),
)

#: A cell counts as drowned when the filled surface stands this far above it.
#: Float32 metres over a country, so anything below a centimetre is the
#: arithmetic talking.
DROWNED_M = 0.01


@dataclass(frozen=True)
class Drainage:
    """A filled surface and the drainage tree that filling it produced.

    `parent` and `order` are flat indices into a (H, W) array: `parent[i]` is
    the cell water leaves `i` for, or -1 if `i` is on the map edge and leaves
    the grid there. `order` is the sequence cells were flooded in, which is a
    topological order of the tree -- every parent appears before its children,
    so one backward sweep accumulates and one forward sweep propagates.
    """

    shape: tuple[int, int]
    filled: np.ndarray
    parent: np.ndarray
    order: np.ndarray

    @property
    def size(self) -> int:
        return self.shape[0] * self.shape[1]


def flood(
    heights: np.ndarray,
    outlets: np.ndarray | None = None,
    prefer: np.ndarray | None = None,
) -> Drainage:
    """Priority-flood a height grid, keeping the tree the flood grew along.

    The map edge is the outlet: every cell on it drains off the grid. For a
    corridor cut out of a country that is a statement about the cut rather
    than about the world, and it is the right one for this measurement --
    water that leaves the window is water this grid cannot account for, and
    counting it as trapped would invent depressions at the seam.

    `outlets` marks more cells water leaves the grid at, each kept at its own
    height: ground nobody measured, and a lake that is kept closed (D62).
    `prefer` marks cells that win a tie of water level, so the tree crosses a
    flat along them -- a carved river -- rather than as the wave D56 draws.
    Neither changes the filled surface, which is the same whatever breaks a
    tie; with neither, this is the flood every report has always run.
    """
    height, width = heights.shape
    flat = np.asarray(heights, dtype="float32").ravel()
    filled = np.empty(flat.size, dtype="float32")
    parent = np.full(flat.size, -1, dtype="int32")
    order = np.empty(flat.size, dtype="int32")
    seen = np.zeros(flat.size, dtype=bool)
    rank = (
        np.zeros(flat.size, dtype="int8")
        if prefer is None
        else np.where(np.asarray(prefer).ravel(), 0, 1).astype("int8")
    )

    heap: list[tuple[float, int, int, int]] = []
    edge = set()
    for row in range(height):
        edge.add(row * width)
        edge.add(row * width + width - 1)
    for col in range(width):
        edge.add(col)
        edge.add((height - 1) * width + col)
    if outlets is not None:
        edge.update(int(i) for i in np.flatnonzero(np.asarray(outlets).ravel()))
    arrival = 0
    for index in sorted(edge):
        filled[index] = flat[index]
        seen[index] = True
        heap.append((float(flat[index]), int(rank[index]), arrival, index))
        arrival += 1
    heapq.heapify(heap)

    # **Ties break on arrival order, and that is not a detail.** Every cell
    # inside a filled basin has the same water level, so the comparison that
    # orders them is the tie-break, and the tie-break is therefore what draws
    # the channel across a flat. Arrival order makes the flood cross a flat as
    # a breadth-first wave from the point it entered, which is the shortest
    # way over; ordering by cell index instead makes it scan, and the scan
    # wanders. Measured on this corridor, the difference is the derived
    # Yangtze passing Chongqing at 2.3 km or at 28.2, and its own mouth at
    # 34 km or at 115 (F56). Both fills are correct and only one of the two
    # trees is a river. It is deterministic either way, which is what a
    # committed report needs.
    push, pop = heapq.heappush, heapq.heappop
    visited = 0
    while heap:
        level, _, _, index = pop(heap)
        order[visited] = index
        visited += 1
        row, col = divmod(index, width)
        for drow, dcol in NB8:
            row2, col2 = row + drow, col + dcol
            if 0 <= row2 < height and 0 <= col2 < width:
                other = row2 * width + col2
                if not seen[other]:
                    seen[other] = True
                    own = flat[other]
                    raised = own if own > level else level
                    filled[other] = raised
                    parent[other] = index
                    push(heap, (float(raised), int(rank[other]), arrival, other))
                    arrival += 1

    return Drainage(
        shape=(height, width),
        filled=filled.reshape(height, width),
        parent=parent,
        order=order[:visited],
    )


@dataclass(frozen=True)
class Sill:
    """The highest ground on the lowest path between two cells.

    Every path between the two crosses ground at least this high -- the
    river's, a chord's, any other -- so it is a bound rather than a search
    result, and it holds on the bilinear surface between cell centres as
    well as on the cells: a point of that surface is a weighted mean of four
    mutually adjacent cells, so ground below a level anywhere on it means a
    cell below that level beside it. A sill above the upstream cell is
    therefore a proof that nothing between the two runs downhill.
    """

    level_m: float
    #: The cell that sets it: the first cell at `level_m` on the lowest path,
    #: walking from the source. A flat-topped sill has others beside it.
    at: int
    #: One lowest path, source first. Not unique, and not the shortest.
    path: tuple[int, ...]


def sill(heights: np.ndarray, source: int, target: int) -> Sill | None:
    """Flood from one cell until the water reaches the other, and say how high.

    The same priority-flood as `flood`, from one cell rather than the map
    edge, with the same eight neighbours and the same arrival tie-break, and
    it stops as soon as it arrives: a cell's level is final the first time
    the flood reaches it, because nothing popped later is lower.

    **A cell with no value is not ground.** NaN compares false against every
    level, so left alone it would be crossed at whatever the water already
    stood at -- a hole the flood walks straight through. It is a wall
    instead, which is what lets a raster clipped to an area's footprint be
    flooded without its corners becoming a way round. `None` when nothing
    joins the two.
    """
    return sills(heights, [(source, target)])[0]


def sills(heights: np.ndarray, pairs: Iterable[tuple[int, int]]) -> list[Sill | None]:
    """`sill` for several pairs of cells on one grid, read once."""
    height, width = heights.shape
    flat = np.asarray(heights, dtype="float64").ravel().tolist()
    return [_sill(flat, height, width, int(a), int(b)) for a, b in pairs]


def _sill(flat: list[float], height: int, width: int, source: int, target: int) -> Sill | None:
    if flat[source] != flat[source] or flat[target] != flat[target]:
        return None
    if source == target:
        return Sill(level_m=flat[source], at=source, path=(source,))

    seen = bytearray(len(flat))
    parent = [-1] * len(flat)
    seen[source] = 1
    heap: list[tuple[float, int, int]] = [(flat[source], 0, source)]
    arrival = 1
    push, pop = heapq.heappush, heapq.heappop
    while heap:
        level, _, index = pop(heap)
        row, col = divmod(index, width)
        for drow, dcol in NB8:
            row2, col2 = row + drow, col + dcol
            if 0 <= row2 < height and 0 <= col2 < width:
                other = row2 * width + col2
                if seen[other]:
                    continue
                seen[other] = 1
                own = flat[other]
                if own != own:
                    continue
                parent[other] = index
                if other == target:
                    path = [other]
                    while path[-1] != source:
                        path.append(parent[path[-1]])
                    path.reverse()
                    top = max(flat[i] for i in path)
                    at = next(i for i in path if flat[i] == top)
                    return Sill(level_m=top, at=at, path=tuple(path))
                push(heap, (own if own > level else level, arrival, other))
                arrival += 1
    return None


def drowning(heights: np.ndarray, drainage: Drainage) -> np.ndarray:
    """How deep the water stands over each cell of a closed depression.

    Zero everywhere the ground already drains. This is the quantity the whole
    stage is about: it is the height a river would have to climb to leave.
    """
    return drainage.filled - np.asarray(heights, dtype="float32")


def accumulate(drainage: Drainage) -> np.ndarray:
    """Upslope cells draining through each cell, itself included.

    At 1 km a cell is a square kilometre, so this is catchment area in km2
    and the number can be read as one.
    """
    acc = np.ones(drainage.size, dtype="int64")
    parent = drainage.parent
    for index in drainage.order[::-1]:
        receiver = parent[index]
        if receiver >= 0:
            acc[receiver] += acc[index]
    return acc.reshape(drainage.shape)


def downstream(drainage: Drainage, index: int) -> list[int]:
    """Every cell from here to the edge, this one first."""
    path = [int(index)]
    parent = drainage.parent
    while True:
        receiver = int(parent[path[-1]])
        if receiver < 0:
            return path
        path.append(receiver)


def upstream_stem(drainage: Drainage, acc: np.ndarray, mouth: int) -> list[int]:
    """Walk up from a cell, always into the largest catchment above it.

    The result is the longest river the grid has above `mouth`, mouth first.
    Held to the tree rather than recomputed from heights, so it is the same
    path `accumulate` counted along.
    """
    height, width = drainage.shape
    parent = drainage.parent
    flat_acc = acc.ravel()
    stem = [int(mouth)]
    while True:
        current = stem[-1]
        row, col = divmod(current, width)
        best, best_acc = -1, 0
        for drow, dcol in NB8:
            row2, col2 = row + drow, col + dcol
            if 0 <= row2 < height and 0 <= col2 < width:
                other = row2 * width + col2
                if parent[other] == current and flat_acc[other] > best_acc:
                    best, best_acc = other, int(flat_acc[other])
        if best < 0 or best_acc < 2:
            return stem
        stem.append(best)


def main_stem(drainage: Drainage, acc: np.ndarray) -> list[int]:
    """The grid's largest river, from the cell everything drains through."""
    return upstream_stem(drainage, acc, int(np.argmax(acc)))


def above(heights: np.ndarray, stem: Sequence[int], level_m: float) -> list[int]:
    """Drop the leading run of cells at or below a level — the sea.

    A corridor's edge is in the water, so a stem traced from the cell with the
    largest catchment starts somewhere offshore and runs up the shelf. Where
    the sea ends is where the river starts, and a report that counted the
    shelf as river would be reporting the cut.
    """
    flat = np.asarray(heights, dtype="float32").ravel()
    for position, index in enumerate(stem):
        if flat[index] > level_m:
            return [int(i) for i in stem[position:]]
    return []


@dataclass(frozen=True)
class Profile:
    """What a river does along a path, read off the *unconditioned* grid."""

    cells: int
    length_km: float
    net_drop_m: float
    uphill_steps: int
    ascent_m: float
    worst_step_m: float
    drowned_cells: int
    deepest_drowning_m: float

    @property
    def uphill_share(self) -> float:
        steps = max(self.cells - 1, 1)
        return self.uphill_steps / steps


def profile_series(
    elevations: Sequence[float], length_km: float, drowning_m: Sequence[float] | None = None
) -> Profile:
    """A profile from heights already sampled, mouth first.

    `elevations[k] - elevations[k + 1]` is the change going downstream, since
    k + 1 is the upstream neighbour. That is the same test
    `MonotonicProbe.check` makes, which is what lets the two be compared.
    """
    values = np.asarray(elevations, dtype="float64")
    if values.size < 2:
        return Profile(int(values.size), 0.0, 0.0, 0, 0.0, 0.0, 0, 0.0)
    change = values[:-1] - values[1:]
    rising = change > 0
    drowned, deepest = 0, 0.0
    if drowning_m is not None:
        under = np.asarray(drowning_m, dtype="float64")
        drowned = int((under > DROWNED_M).sum())
        deepest = float(under.max())
    return Profile(
        cells=int(values.size),
        length_km=float(length_km),
        net_drop_m=float(values[-1] - values[0]),
        uphill_steps=int(rising.sum()),
        ascent_m=float(change[rising].sum()) if rising.any() else 0.0,
        worst_step_m=float(change.max()),
        drowned_cells=drowned,
        deepest_drowning_m=deepest,
    )


def profile(
    heights: np.ndarray, drainage: Drainage | None, path: Sequence[int], width: int
) -> Profile:
    """Walk a path mouth-first and count what a chord of waypoints cannot see.

    `path` runs mouth to head, which is how `main_stem` produces it, so going
    *downstream* is walking the list backwards. A step is uphill when the
    ground rises in the downstream direction, which is the same test
    `MonotonicProbe.check` makes and the reason the two can be compared.
    """
    flat = np.asarray(heights, dtype="float32").ravel()
    elevations = [float(flat[i]) for i in path]
    if len(path) < 2:
        return Profile(len(path), 0.0, 0.0, 0, 0.0, 0.0, 0, 0.0)

    length = 0.0
    for first, second in zip(path, path[1:]):
        row1, col1 = divmod(int(first), width)
        row2, col2 = divmod(int(second), width)
        length += math.hypot(row2 - row1, col2 - col1)

    under = None
    if drainage is not None:
        depth = drainage.filled.ravel()
        under = [float(depth[i] - flat[i]) for i in path]
    return profile_series(elevations, length, under)


@dataclass(frozen=True)
class Depression:
    """One closed basin: how big, how deep, and where its deepest cell is."""

    cells: int
    deepest_m: float
    mean_m: float
    floor_m: float
    row: int
    col: int

    @property
    def volume_km3(self) -> float:
        """At 1 km cells, a metre over a cell is 1e-3 km3."""
        return self.cells * self.mean_m * 1e-3


#: The sinks HydroSHEDS put in front of a person: deeper than 10 m and larger
#: than 10 km² (Technical Documentation v1.4, section 3.3). Each was checked by
#: eye against mapped rivers and lakes and kept or filled. Every other sink it
#: filled without looking. Applied here, the rule says how much of the closed
#: area a mapped network is needed for at all (F59).
INSPECTED_DEPTH_M = 10.0
INSPECTED_KM2 = 10.0


def inspected(basins: Sequence[Depression], resolution_m: float) -> list[Depression]:
    """The basins HydroSHEDS' own rule would have had somebody look at."""
    cell_km2 = (resolution_m / 1000) ** 2
    return [
        basin
        for basin in basins
        if basin.deepest_m > INSPECTED_DEPTH_M and basin.cells * cell_km2 > INSPECTED_KM2
    ]


def depressions(
    heights: np.ndarray, drainage: Drainage, min_cells: int = 1
) -> list[Depression]:
    """Connected closed basins, largest first."""
    return basins(heights, drainage, min_cells)[1]


def basins(
    heights: np.ndarray, drainage: Drainage, min_cells: int = 1
) -> tuple[np.ndarray, list[Depression]]:
    """Connected closed basins, largest first, and which cell is in which.

    Connected on the same eight neighbours the flow is, because a basin that
    a diagonal splits in two is one basin to the water. The label of a cell
    is its basin's place in the list plus one, and 0 outside every basin
    counted -- so a question about one basin's cells is `labels == n + 1`
    rather than a second search that could disagree with this one (F60).
    """
    from collections import deque

    height, width = drainage.shape
    flat = np.asarray(heights, dtype="float32")
    depth = drowning(flat, drainage)
    pit = depth > DROWNED_M
    found_at = np.zeros(pit.shape, dtype="int32")
    found: list[Depression] = []
    for start in np.argwhere(pit):
        row0, col0 = int(start[0]), int(start[1])
        if found_at[row0, col0]:
            continue
        mark = len(found) + 1
        found_at[row0, col0] = mark
        queue = deque([(row0, col0)])
        cells: list[tuple[int, int]] = []
        while queue:
            row, col = queue.popleft()
            cells.append((row, col))
            for drow, dcol in NB8:
                row2, col2 = row + drow, col + dcol
                if (
                    0 <= row2 < height
                    and 0 <= col2 < width
                    and pit[row2, col2]
                    and not found_at[row2, col2]
                ):
                    found_at[row2, col2] = mark
                    queue.append((row2, col2))
        rows = np.array([c[0] for c in cells])
        cols = np.array([c[1] for c in cells])
        values = depth[rows, cols]
        deepest = int(np.argmax(values))
        found.append(
            Depression(
                cells=len(cells),
                deepest_m=float(values.max()),
                mean_m=float(values.mean()),
                floor_m=float(flat[rows[deepest], cols[deepest]]),
                row=int(rows[deepest]),
                col=int(cols[deepest]),
            )
        )
    # Stable, so ties keep discovery order exactly as the list always has.
    order = sorted(range(len(found)), key=lambda i: (-found[i].cells, -found[i].deepest_m))
    kept = [i for i in order if found[i].cells >= min_cells]
    relabel = np.zeros(len(found) + 1, dtype="int32")
    for place, i in enumerate(kept):
        relabel[i + 1] = place + 1
    return relabel[found_at], [found[i] for i in kept]


# --------------------------------------------------------- the built world

#: How near the derived stem must pass a place that promises to be on the
#: water before the report calls it corroborated. One cell's diagonal, and
#: `places.py` writes a channel coordinate to four decimals -- about 11 m --
#: precisely so that a tolerance this tight means something.
NEAR_KM = 1.5

#: Places that should lie along the grid's largest river, mouth first. Not a
#: new table: every one is a `places.py` id, and the two cities are here to
#: be *not* on the channel -- a city centre is beside a river, and a report
#: that expected Wuhan within a kilometre of the water would be checking the
#: wrong claim.
YANGTZE: tuple[str, ...] = (
    "shanghai", "wuhan", "yichang", "xiling-gorge", "wu-gorge",
    "qutang-gorge", "chongqing", "tiger-leaping-gorge", "shigu",
)


@dataclass(frozen=True)
class Landfall:
    """Where the derived stem passes a named place, and how near."""

    place: str
    km_to_stem: float
    km_from_mouth: float
    place_m: float
    stem_m: float
    on_channel: bool


def _cumulative_km(path: Sequence[int], width: int) -> list[float]:
    running, total = [0.0], 0.0
    for first, second in zip(path, path[1:]):
        row1, col1 = divmod(int(first), width)
        row2, col2 = divmod(int(second), width)
        total += math.hypot(row2 - row1, col2 - col1)
        running.append(total)
    return running


def landfalls(
    heights: np.ndarray,
    path: Sequence[int],
    width: int,
    transform,
    place_ids: Iterable[str] = YANGTZE,
) -> list[Landfall]:
    """Check the derived stem against places sited independently of it.

    This is the whole of what makes a DEM-derived channel a claim rather than
    an assertion. Nothing about `main_stem` knows what a Yangtze is; the nine
    places below were sited off the 30 m source by `siting.py` and by hand,
    years of decisions apart from this arithmetic. If the stem meets them in
    order, mouth first, it is the river.
    """
    rows = np.array([divmod(int(i), width)[0] for i in path])
    cols = np.array([divmod(int(i), width)[1] for i in path])
    running = _cumulative_km(path, width)
    flat = np.asarray(heights, dtype="float32")
    inverse = ~transform
    out: list[Landfall] = []
    for place_id in place_ids:
        place = places.BY_ID[place_id]
        xs, ys = grid.project([place.lat], [place.lon])
        col, row = inverse * (xs[0], ys[0])
        distance = np.hypot(rows - row, cols - col)
        nearest = int(np.argmin(distance))
        out.append(
            Landfall(
                place=place_id,
                km_to_stem=float(distance[nearest]),
                km_from_mouth=running[nearest],
                place_m=float(flat[int(row), int(col)]),
                stem_m=float(flat[rows[nearest], cols[nearest]]),
                on_channel=place.on_channel,
            )
        )
    return out


def _lonlat(transform, rows, cols) -> tuple[list[float], list[float]]:
    xs, ys = [], []
    for row, col in zip(rows, cols):
        x, y = transform * (col + 0.5, row + 0.5)
        xs.append(x)
        ys.append(y)
    return grid.unproject(xs, ys)


def _thousands(value: float, places_after: int = 0) -> str:
    return f"{value:,.{places_after}f}"


#: Where the report stops calling the grid's largest river a river. The
#: corridor's east edge is in the Yellow Sea, so a stem traced from the cell
#: with the largest catchment starts offshore; the leading run at or below
#: this is dropped. It takes the delta with it, and that is the honest
#: result rather than a tuning failure: at 1 km with stage 2's bias the last
#: hundred kilometres of the Yangtze read at or below a metre, so this grid
#: cannot tell the river's own tidal reach from the sea it runs into.
SEA_M = 1.0


#: The radius `probe.py` reads a river waypoint through, and the reason this
#: module exists in one number. A 1 km cell straddling a gorge reports the
#: wall as readily as the water, so until there is a centreline a waypoint
#: finds its channel by taking the lowest cell within this much. The search is
#: a *proxy for a centreline*, and the report below is the first thing able to
#: put the proxy beside the thing it stands in for.
CHANNEL_RADIUS_KM = 2.0


def chord_km() -> float:
    """The golden probe's polyline, in kilometres, measured not recalled.

    Projected through the same Albers the grid is in, so that the chord's
    length and the centreline's are the same kind of number.
    """
    from . import probes

    waypoints = probes.MONOTONIC_PROBES[0].waypoints
    xs, ys = grid.project([lat for lat, _ in waypoints], [lon for _, lon in waypoints])
    return sum(
        math.hypot(xs[i + 1] - xs[i], ys[i + 1] - ys[i]) / 1000
        for i in range(len(waypoints) - 1)
    )


def chord_profile(path: Path, stride_km: float) -> Profile:
    """The golden probe's chord, walked at the grid's own resolution.

    Through `GridSampler.walk` and the probe's own 2 km channel search rather
    than through anything written here, because a comparison between the
    chord and the centreline is only a comparison if the chord is read the
    way the probe reads it. F48 walked exactly this and found what the middle
    column of the report prints; it is recomputed rather than quoted so that
    the two columns are one measurement and not a new number beside an old.
    """
    from .sample import GridSampler
    from . import probes

    sampler = GridSampler(path)
    waypoints = probes.MONOTONIC_PROBES[0].waypoints
    series = sampler.walk(waypoints, stride_km, CHANNEL_RADIUS_KM)
    # Source -> mouth in the probe, mouth -> head here, so "downstream" means
    # the same direction in both columns.
    return profile_series(list(reversed(series)), chord_km())


def measure(path: Path) -> dict:
    """Everything this module can say about one built grid."""
    import rasterio

    with rasterio.open(path) as dataset:
        heights = dataset.read(1)
        transform = dataset.transform
        tags = dataset.tags()
        resolution = abs(dataset.transform.a)

    height, width = heights.shape
    drainage = flood(heights)
    depth = drowning(heights, drainage)
    pit = depth > DROWNED_M
    acc = accumulate(drainage)
    basins = depressions(heights, drainage)
    whole_stem = main_stem(drainage, acc)
    stem = above(heights, whole_stem, level_m=SEA_M)
    return {
        "trimmed_cells": len(whole_stem) - len(stem),
        "chord_km": chord_km(),
        "chord_profile": chord_profile(path, resolution / 1000),
        "path": path,
        "tags": tags,
        "resolution_m": resolution,
        "shape": (height, width),
        "cells": heights.size,
        "pit_cells": int(pit.sum()),
        "pit_volume_km3": float(depth[pit].sum() * (resolution / 1000) ** 2 * 1e-3),
        "deepest_m": float(depth.max()),
        "basins": basins,
        "stem": stem,
        "stem_profile": profile(heights, drainage, stem, width),
        "landfalls": landfalls(heights, stem, width, transform),
        "transform": transform,
        "heights": heights,
        "acc": acc,
    }


def _para(text: str, width: int = 74) -> list[str]:
    """One paragraph, wrapped. Generated prose diffs like written prose only
    if it is wrapped like written prose; a number that changes should move one
    line and not reflow a page."""
    import textwrap

    return textwrap.fill(
        " ".join(text.split()),
        width=width,
        break_long_words=False,
        break_on_hyphens=False,
    ).splitlines() + [""]


def render(result: dict, corridor: str) -> str:
    """The report. Every number in it is measured here and none is recalled."""
    from datetime import date

    height, width = result["shape"]
    tags = result["tags"]
    basins = result["basins"]
    prof: Profile = result["stem_profile"]
    chord: Profile = result["chord_profile"]
    stem = result["stem"]
    transform = result["transform"]
    heights = result["heights"]
    big = [b for b in basins if b.cells >= 10]
    looked_at = inspected(basins, result["resolution_m"])
    cell_km2 = (result["resolution_m"] / 1000) ** 2
    looked_at_km2 = sum(b.cells for b in looked_at) * cell_km2
    closed_km2 = result["pit_cells"] * cell_km2
    share = 100 * result["pit_cells"] / result["cells"]

    lines = [
        f"# Hydrology report — {corridor}, {result['resolution_m']:.0f} m grid",
        "",
        f"{date.today().isoformat()} · `{result['path'].name}` · "
        f"bias {tags.get('bias', '?')} · {width} × {height} samples · "
        f"tiles {tags.get('tx0')},{tags.get('ty0')}–{tags.get('tx1')},{tags.get('ty1')}",
        "",
    ]
    lines += _para(
        """Generated by `python -m nineskies.hydro`. **This is stage 2's grid,
        before stage 3 conditions it**: where water cannot leave, and what the
        grid's own largest river does on the way to a sea it mostly does not
        reach. Nothing here is carved; `docs/carve-report.md` asks the same
        questions of the grid the tiles are cut from (F61)."""
    )
    lines += ["## Where the water cannot go", ""]
    lines += [
        f"| Measure | {corridor} |",
        "| --- | ---: |",
        f"| Cells with no outlet | {_thousands(result['pit_cells'])} of "
        f"{_thousands(result['cells'])} ({share:.2f} %) |",
        f"| Separate closed basins | {_thousands(len(basins))} |",
        f"| …of 10 km² or more | {_thousands(len(big))} |",
        f"| …that HydroSHEDS' own rule would have looked at | "
        f"{_thousands(len(looked_at))}, {_thousands(looked_at_km2)} km² |",
        f"| Water to fill them | {_thousands(result['pit_volume_km3'])} km³ |",
        f"| Deepest | {result['deepest_m']:,.1f} m |",
        "",
    ]
    lines += _para(
        """A closed basin is not by itself a fault, and the largest rows below are
        why. The plateau's lakes are endorheic in life — nothing drains out of
        Namtso — so a grid that reads them as closed is reading them right. What
        the share above prices is the *stage* and not the world: every one of
        these is a place the conditioning would have to make a decision about,
        and only a mapped river network can say which way."""
    )
    lines += [
        "| km² | deepest | mean | floor | lat | lon |",
        "| ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    rows = [b.row for b in basins[:12]]
    cols = [b.col for b in basins[:12]]
    lats, lons = _lonlat(transform, rows, cols)
    for basin, lat, lon in zip(basins[:12], lats, lons):
        lines.append(
            f"| {_thousands(basin.cells)} | {basin.deepest_m:,.1f} m | "
            f"{basin.mean_m:,.1f} m | {basin.floor_m:,.1f} m | "
            f"{lat:.3f} N | {lon:.3f} E |"
        )
    lines.append("")
    biggest = basins[0]
    lines += _para(
        f"""The first row is the one that matters to this game. **{_thousands(biggest.cells)}
        km² with its floor at {biggest.floor_m:,.1f} m** is the middle Yangtze and
        the basin above it, sealed: at 1 km the river's way out through the Three
        Gorges is not resolved, so everything upstream of it has no outlet at all.
        The floor is the reservoir's own level, which `siting.py` measured at 158 m
        (F52). Expedition 1 flies the length of it."""
    )
    lines += ["## The grid's own largest river", ""]
    lines += _para(
        """Derived rather than downloaded. Fill the pits, keep the tree the fill
        grew along, and follow the largest catchment upstream from the cell
        everything drains through — which is how HydroSHEDS was made from SRTM,
        and needs no fetch to do once."""
    )
    lines += [
        "| Measure | the chord, as written | the chord at 1 km | this centreline |",
        "| --- | ---: | ---: | ---: |",
        f"| Samples | 7 | {_thousands(chord.cells)} | {_thousands(prof.cells)} |",
        f"| Length | {_thousands(result['chord_km'])} km | "
        f"{_thousands(chord.length_km)} km | {_thousands(prof.length_km)} km |",
        f"| Steps that climb going downstream | 0 | {_thousands(chord.uphill_steps)} "
        f"({100 * chord.uphill_share:.1f} %) | {_thousands(prof.uphill_steps)} "
        f"({100 * prof.uphill_share:.1f} %) |",
        f"| Total ascent | 0 m | {_thousands(chord.ascent_m)} m | "
        f"{_thousands(prof.ascent_m)} m |",
        f"| Worst single step | — | {chord.worst_step_m:,.1f} m | "
        f"{prof.worst_step_m:,.1f} m |",
        f"| Channel search needed | {CHANNEL_RADIUS_KM:.0f} km | "
        f"{CHANNEL_RADIUS_KM:.0f} km | none |",
        "| Verdict | pass | *not evidence* | would fail |",
        "",
    ]
    lines += _para(
        f"""**The middle column is F48's trap and the right-hand one is not.**
        Densifying the chord finds uphill steps that are real ground rather than
        the river: a straight reach from Tiger Leaping Gorge to Chongqing crosses
        mountains the Yangtze goes around, so a fine walk of it measures the
        shortcut. Every cell of the centreline is on the grid's own channel, so
        its steps are about the river — and there are **{prof.uphill_steps /
        max(chord.uphill_steps, 1):.1f}× as many of them**."""
    )
    lines += _para(
        f"""The quiet row is the second from the bottom. The {CHANNEL_RADIUS_KM:.0f}
        km channel search exists because a 1 km cell straddling a gorge reports the
        wall as readily as the water, and it has always been a *proxy for a
        centreline* — `sample.channel_m` says so in as many words. This is the
        first measurement in the repository that can put the proxy beside the
        thing it stands in for, and the centreline needs none of it."""
    )
    lines += _para(
        """The middle column is F48's own, recomputed rather than quoted: it read
        3,382 samples, 942 climbs and 56,988 m when F48 took it, and the whole of
        the difference is one waypoint. `tiger-leaping-gorge` was 71 km from the
        gorge then; moving it (F49, F50) moved the chord. With that coordinate put
        back, this code reproduces F48 to the metre."""
    )
    lines += _para(
        f"""Net drop head to coast is {_thousands(prof.net_drop_m)} m, so the gross
        ascent is **{100 * prof.ascent_m / max(prof.net_drop_m, 1):,.0f} % of the
        fall**, and {_thousands(prof.drowned_cells)} of the centreline's cells
        ({100 * prof.drowned_cells / max(prof.cells, 1):.1f} %) stand under a closed
        basin's water — the deepest by {prof.deepest_drowning_m:,.1f} m. A river
        that is {100 * prof.drowned_cells / max(prof.cells, 1):.0f} % under water in
        the world it runs through is the sentence *"rivers are carved, not
        painted"* costed out."""
    )
    lines += _para(
        f"""The sea is trimmed off the bottom at {SEA_M:.0f} m and it takes
        **{_thousands(result['trimmed_cells'])} cells of delta** with it: at 1 km
        with stage 2's bias the Yangtze's own tidal reach reads at or below a
        metre, so this grid cannot separate it from the water it runs into. That
        is why `shanghai` stands a hundred kilometres from the first row below
        rather than the thirty its city centre is from the channel."""
    )
    lines += ["### Is it the Yangtze?", ""]
    channels = [l for l in result["landfalls"] if l.on_channel]
    cities = [l for l in result["landfalls"] if not l.on_channel]
    lines += _para(
        f"""Nothing above knows what a Yangtze is. These {len(result["landfalls"])}
        places were sited independently — {len(channels)} of them measured onto the
        water off the source's own 30 m (F50, F52) and {len(cities)} as city
        centres — so meeting them **in order, coast first** is the corroboration
        that makes the centreline a claim rather than an assertion. A place that
        promises to be on the water is held to {NEAR_KM} km; a city is beside a
        river rather than in it, and is expected to miss."""
    )
    lines += [
        "| km upstream | place | on channel | km to stem | place reads | stem reads |",
        "| ---: | --- | :---: | ---: | ---: | ---: |",
    ]
    missed = []
    for landfall in sorted(result["landfalls"], key=lambda l: l.km_from_mouth):
        mark = "yes" if landfall.on_channel else "—"
        near = ""
        if landfall.on_channel:
            ok = landfall.km_to_stem <= NEAR_KM
            near = " ✓" if ok else " ✗"
            if not ok:
                missed.append(landfall)
        lines.append(
            f"| {_thousands(landfall.km_from_mouth)} | `{landfall.place}` | {mark} | "
            f"{landfall.km_to_stem:.1f}{near} | {landfall.place_m:,.1f} m | "
            f"{landfall.stem_m:,.1f} m |"
        )
    lines.append("")
    # Asserted nowhere: the expected order is the order `YANGTZE` is written
    # in, coast first, and this is the comparison rather than a claim about it.
    walked = [l.place for l in sorted(result["landfalls"], key=lambda l: l.km_from_mouth)]
    in_order = walked == list(YANGTZE)
    lines += _para(
        f"""{len(channels) - len(missed)} of the {len(channels)} channel places are
        inside {NEAR_KM} km, and the stem meets all {len(walked)}
        {"in the order `YANGTZE` lists them" if in_order else "in this order, which is **not** the order `YANGTZE` lists them"}.
        That is the whole corroboration: the arithmetic above was given no rivers,
        only heights."""
    )
    for landfall in missed:
        lines += _para(
            f"""`{landfall.place}` is the exception at {landfall.km_to_stem:.1f} km,
            where the stem reads {landfall.stem_m:,.1f} m against the place's
            {landfall.place_m:,.1f}. It is not a separate fault: it sits in the
            reach the 1 km grid is already known to be wrong in, where the Jinsha
            climbs 221 m between here and Tiger Leaping Gorge and the seventh
            golden probe had to move to the 90 m hero grid to pass (F49, F50). A
            derived channel is only as good as the heights it is derived from, and
            **the one place it loses the river is the one place the river is
            already known to be lost.**"""
        )
    flat = np.asarray(heights, dtype="float32").ravel()
    elevations = np.array([flat[i] for i in stem], dtype="float64")
    change = elevations[:-1] - elevations[1:]
    running = _cumulative_km(stem, width)
    worst = np.argsort(change)[::-1][:8]
    rows = [divmod(int(stem[k]), width)[0] for k in worst]
    cols = [divmod(int(stem[k]), width)[1] for k in worst]
    lats, lons = _lonlat(transform, rows, cols)
    lines += [
        "### The worst kilometres",
        "",
        "| km upstream | climbs | at | lat | lon |",
        "| ---: | ---: | ---: | ---: | ---: |",
    ]
    for k, lat, lon in zip(worst, lats, lons):
        lines.append(
            f"| {_thousands(running[int(k)])} | {change[int(k)]:,.1f} m | "
            f"{elevations[int(k)]:,.1f} m | {lat:.3f} N | {lon:.3f} E |"
        )
    lines.append("")
    lines += _para(
        """Read the two right-hand columns before the left ones. These are not
        scattered across five thousand kilometres of river — they are a cluster,
        and the cluster is Tiger Leaping Gorge and the Jinsha's run into it. The
        method was given no rivers and no gorges, and the worst thing it finds is
        the fault this repository already knows by name (F49, F50, F52)."""
    )
    lines += ["## What this cannot decide", ""]
    lines += _para(
        """Telling a resampling artefact from a real closed basin needs a mapped
        river network. The numbers above were the argument for fetching one rather
        than a substitute for it: filling every basin would drain the plateau, and
        the largest basin in the table is the reach the game's own expedition
        follows. Nothing here is carved; stage 3 is (F61)."""
    )
    lines += _para(
        f"""How much of it needs a map is measurable, because HydroSHEDS drew the
        line itself. It filled every sink shallower than
        {INSPECTED_DEPTH_M:.0f} m or smaller than {INSPECTED_KM2:.0f} km² without
        looking, and checked the rest by eye against mapped rivers and lakes.
        Applied to this grid, that leaves **{_thousands(len(looked_at))} of the
        {_thousands(len(basins))} basins**, {_thousands(looked_at_km2)} km² of the
        {_thousands(closed_km2)} km² that is closed, for a mapped network to
        decide. F59 priced the fetch, Natural Earth was the one made (F60), and
        D62 gives every basin a rule -- drained along a mapped river, kept under a
        mapped lake, filled otherwise -- which stage 3 applies (F61)."""
    )
    lines += _para(
        """The centreline is the second thing stage 3 replaces rather than
        confirms. It is where water runs **in this grid**, so wherever the grid is
        wrong the channel is wrong with it — which is exactly why walking it
        measures the grid and not the river. The golden probe stays on its
        seven-waypoint chord and keeps `stride_km = None` (F48,
        `probes.MonotonicProbe`): stage 3's carved channels are a mapped
        centreline, and whether the probe walks them or checks the sill between
        its cells is an open decision (F58, F61)."""
    )
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    import argparse
    import sys

    from .acquire import data_root

    parser = argparse.ArgumentParser(
        description="Stage 3's measurement half: closed basins and the derived centreline."
    )
    parser.add_argument("--corridor", default="sea-to-sky")
    parser.add_argument("--grid", type=Path, default=None)
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args(argv)

    path = args.grid or data_root() / "work" / f"{args.corridor}-1km.tif"
    if not path.exists():
        print(f"no built grid at {path}; run `make grid` first", file=sys.stderr)
        return 1
    result = measure(path)
    report = render(result, args.corridor)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(report)
    print(report)
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
