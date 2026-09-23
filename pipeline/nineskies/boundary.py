"""Which land is China's, on the grid the probes read (D9, D10, F65).

The area-ratio probe is the one that tests what the projection was chosen
for. Albers equal-area means a cell is a square kilometre wherever it lies,
so *57 % of China's land west of the Heihe-Tengchong line* is a claim a cell
count can check -- and it is a claim about **China's** land, which the built
grid is not. That grid is a rectangle from 73 to 135 E holding Mongolia,
Kazakhstan, Russia and northern India, so before the probe can count anything
something has to say which cells are China's. This module is that something.

It is deliberately not a border. D10 keeps boundary geometry out of the
shipped world, and nothing here is written into a tile, a section, a manifest
or a texture: it burns a mask in memory, counts cells on two sides of a line,
and is read by a report.

Three things have to be decided before the count means anything, and only two
of them are arithmetic.

**Which polygon is China** is not, and it is not hidden inside a default.
Natural Earth's de facto view -- the file `make vectors FETCH=ne-countries`
fetches -- draws each feature where control is exercised rather than where it
is claimed, and draws Hong Kong, Macao and Taiwan as features of their own.
Its own `FCLASS_CN` column records what China's point of view makes of each:
Hong Kong and Macao are Admin-1 regions of China, Taiwan is a province. So
one file carries both readings, and `VIEWS` is both of them, counted side by
side. What it cannot carry is the lines the CHN point-of-view file redraws
inland, in Aksai Chin and the eastern sector; that file is priced beside this
one in `vectors.py` and deliberately not fetched, because a difference this
one can price is a difference the report can show the probe does not turn on.

**Where the line runs** is arithmetic once it is said which plane it is
straight in, and that turns out to matter more than anything else here. Hu
Huanyong drew a straight line on a map in 1935, and a straight line on one
projection is a curve on another: between Heihe and Tengchong, straight in the
equal-area plane runs up to **271 km west** of straight in degrees. So all
three readings a reasonable person would try are counted -- straight in the
plane the cells are counted in, the shortest path over the globe, and straight
on the graticule -- and the first two agree with each other to 36 km and with
the published 57 % to within the probe's tolerance, while the third is 5.7
points out (F65). The line this module means is `albers`, because that is the
plane the area is measured in; it is chosen with the other two printed beside
it rather than asserted.

**What counts as land** is the polygon, inland water included, because that
is how the 9.6 million square kilometres this claim is made of is reckoned.
The mask is checked against that total: a projection that gets the ratio
right and the area wrong has not been tested by a ratio.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Mapping, Sequence

import numpy as np

from . import grid, rivers, shapefile

#: The fetched source this reads, by its id in `vectors.py`.
COUNTRIES = "ne-countries"

#: WGS84's authalic radius: the sphere with the ellipsoid's own total area.
#: What `sphere_km2` measures on, and the reason it is a bound rather than a
#: verdict -- see its docstring.
AUTHALIC_R_M = 6_371_007.181

#: Published areas in square kilometres, for the shapes the report checks
#: against a figure from outside the data. China's is the conventional total
#: and it counts ground the de facto view assigns elsewhere, which is why it
#: is printed rather than compared: the gap between it and the mask is a fact
#: about which polygon, and the two checks above it are the projection's.
PUBLISHED_KM2 = {
    "China": 9_596_960.0,
    "Mongolia": 1_564_116.0,
}


def _field(record: Mapping[str, object], name: str) -> str:
    return str(record.get(name) or "").strip()


@dataclass(frozen=True)
class View:
    """One answer to *which of this file's features is China*."""

    id: str
    name: str
    #: Whether a feature counts, decided from its own attribute row.
    keep: Callable[[Mapping[str, object]], bool]
    #: The whole evidence for that answer, in the file's own words.
    why: str


#: Natural Earth's de facto China: the feature it names China, plus Hong Kong
#: and Macao, which it draws separately and records the sovereign of as China.
ADMINISTERED = View(
    id="administered",
    name="the land Natural Earth draws as China's",
    keep=lambda r: _field(r, "SOVEREIGNT") == "China",
    why="three features carry SOVEREIGNT=China -- China, Hong Kong and Macao "
    "-- and the file's own FCLASS_CN column calls the latter two Admin-1 "
    "regions, so the de facto view and China's own view agree about all three",
)

#: The same, plus the one feature China's own column calls a province of it.
WITH_TAIWAN = View(
    id="with-taiwan",
    name="the same, plus Taiwan",
    keep=lambda r: (
        _field(r, "SOVEREIGNT") == "China"
        or _field(r, "FCLASS_CN") == "Admin-1 states provinces"
    ),
    why="FCLASS_CN=Admin-1 states provinces is Taiwan and, in this file, only "
    "Taiwan: it is what the publisher records of China's point of view, and "
    "the 36,000 km² it adds lies east of the line",
)

VIEWS: tuple[View, ...] = (ADMINISTERED, WITH_TAIWAN)
BY_ID = {view.id: view for view in VIEWS}

#: Which plane the dividing line is straight in. `albers` is the plane the
#: cells are counted in and so the one this module means. `geodesic` is the
#: shortest path over the globe between the same two towns, and `graticule` is
#: the line an atlas prints, straight in degrees. All three are counted,
#: because the first two agree to 36 km and the third does not (F65).
PLANES = ("albers", "geodesic", "graticule")

#: How many points a curved line is drawn with before it is projected. Its
#: 3,200 km at this many steps is a point every 1.6 km, and the curvature it
#: is resolving bends by 271 km over the whole length.
LINE_STEPS = 2048


def load() -> list[shapefile.Shape]:
    """The countries file, refused unless its bytes are the ones recorded."""
    return rivers.load(COUNTRIES)


def features(shapes: Sequence[shapefile.Shape], view: View) -> list[int]:
    """The indices of the features this view counts as China."""
    return [index for index, shape in enumerate(shapes) if view.keep(shape.record)]


def mask(
    shapes: Sequence[shapefile.Shape],
    transform: object,
    shape: tuple[int, int],
    view: View = ADMINISTERED,
    project: Callable[[list[float], list[float]], tuple[list[float], list[float]]] = grid.project,
) -> np.ndarray:
    """True on each cell whose centre is inside this view of China.

    The same burn stage 3 uses for lakes, which is the point: a polygon read
    two ways by two functions is two answers waiting to happen (F65).
    """
    kept = set(features(shapes, view))
    if not kept:
        raise LookupError(f"{view.id}: no feature in this file matches it")
    burnt = rivers.polygons_raster(
        shapes, transform, shape, project=project, keep=kept.__contains__
    )
    return burnt > 0


def centres(transform: object, shape: tuple[int, int]) -> tuple[np.ndarray, np.ndarray]:
    """The projected x of every column and y of every row, at cell centres."""
    if abs(getattr(transform, "b", 0.0)) > 1e-9 or abs(getattr(transform, "d", 0.0)) > 1e-9:
        raise ValueError("this grid is rotated; the row-by-row line below assumes north-up")
    height, width = shape
    x = transform.a * (np.arange(width) + 0.5) + transform.c
    y = transform.e * (np.arange(height) + 0.5) + transform.f
    return x, y


def line_x(
    transform: object,
    shape: tuple[int, int],
    north: tuple[float, float],
    south: tuple[float, float],
    plane: str = "albers",
    project: Callable[[list[float], list[float]], tuple[list[float], list[float]]] = grid.project,
) -> np.ndarray:
    """The projected x the dividing line stands at on each row of the grid.

    A line the grid's own rows are indexed against rather than a polygon: the
    count is *which side of it a cell centre is on*, and a curve that is one
    x per row answers that with one comparison per cell.

    China reaches from 18 to 53.6 N and the line's ends are at 25.0 and 50.25,
    so both tails are extrapolated. For `albers` that is the straight line
    itself and exact. For `graticule` it is the end segment's own bearing
    continued, which is what extending a drawn line means.
    """
    if plane not in PLANES:
        raise ValueError(f"{plane}: not one of {PLANES}")
    _, y = centres(transform, shape)
    if plane == "albers":
        (x0, x1), (y0, y1) = project([north[0], south[0]], [north[1], south[1]])
        if abs(y1 - y0) < 1e-6:
            raise ValueError("the line's two ends are on one parallel")
        return x0 + (y - y0) * (x1 - x0) / (y1 - y0)
    lats, lons = drawn(north, south, plane)
    xs, ys = project(list(lats), list(lons))
    xs, ys = np.asarray(xs), np.asarray(ys)
    order = np.argsort(ys)
    xs, ys = xs[order], ys[order]
    if not np.all(np.diff(ys) > 0):
        raise ValueError("the drawn line doubles back on itself in this projection")
    # np.interp clamps outside its range, and both tails are outside it, so
    # each end segment's own slope is continued far enough to leave the grid.
    reach = 10_000_000.0
    low = xs[0] - (xs[1] - xs[0]) / (ys[1] - ys[0]) * reach
    high = xs[-1] + (xs[-1] - xs[-2]) / (ys[-1] - ys[-2]) * reach
    return np.interp(y, np.r_[ys[0] - reach, ys, ys[-1] + reach], np.r_[low, xs, high])


def drawn(
    north: tuple[float, float], south: tuple[float, float], plane: str
) -> tuple[np.ndarray, np.ndarray]:
    """The line as `LINE_STEPS` points in degrees, for the two curved planes.

    `graticule` steps latitude and longitude together, which is a straight
    line on an equirectangular map and the one an atlas prints. `geodesic` is
    the shortest path over a sphere between the same two towns, interpolated
    the standard way, on a sphere rather than the ellipsoid because the
    difference is metres on a line whose ends are quoted to a hundredth of a
    degree -- 550 m of their own.
    """
    steps = np.linspace(0.0, 1.0, LINE_STEPS)
    if plane == "graticule":
        return (
            north[0] + (south[0] - north[0]) * steps,
            north[1] + (south[1] - north[1]) * steps,
        )
    lat0, lon0, lat1, lon1 = np.radians([north[0], north[1], south[0], south[1]])
    angle = 2 * np.arcsin(
        np.sqrt(
            np.sin((lat1 - lat0) / 2) ** 2
            + np.cos(lat0) * np.cos(lat1) * np.sin((lon1 - lon0) / 2) ** 2
        )
    )
    a = np.sin((1 - steps) * angle) / np.sin(angle)
    b = np.sin(steps * angle) / np.sin(angle)
    x = a * np.cos(lat0) * np.cos(lon0) + b * np.cos(lat1) * np.cos(lon1)
    y = a * np.cos(lat0) * np.sin(lon0) + b * np.cos(lat1) * np.sin(lon1)
    z = a * np.sin(lat0) + b * np.sin(lat1)
    return np.degrees(np.arctan2(z, np.hypot(x, y))), np.degrees(np.arctan2(y, x))


def west_of(
    transform: object,
    shape: tuple[int, int],
    north: tuple[float, float],
    south: tuple[float, float],
    plane: str = "albers",
    project: Callable[[list[float], list[float]], tuple[list[float], list[float]]] = grid.project,
) -> np.ndarray:
    """True on every cell whose centre stands west of the line."""
    x, _ = centres(transform, shape)
    return x[None, :] < line_x(transform, shape, north, south, plane, project)[:, None]


@dataclass(frozen=True)
class Split:
    """What one view of China, divided one way, counts."""

    view: str
    plane: str
    #: Cells inside the mask, and inside it on each side of the line.
    cells: int
    west: int
    east: int
    #: Cells inside the mask that this build has no measured ground for.
    unmeasured: int

    @property
    def west_pct(self) -> float:
        return 100.0 * self.west / self.cells if self.cells else float("nan")

    def km2(self, cell_km2: float) -> float:
        return self.cells * cell_km2


def split(
    inside: np.ndarray,
    west: np.ndarray,
    view: str,
    plane: str,
    measured: np.ndarray | None = None,
) -> Split:
    """Count one mask on two sides of one line."""
    if inside.shape != west.shape:
        raise ValueError(f"mask is {inside.shape} and the division is {west.shape}")
    cells = int(inside.sum())
    in_west = int((inside & west).sum())
    return Split(
        view=view,
        plane=plane,
        cells=cells,
        west=in_west,
        east=cells - in_west,
        unmeasured=0 if measured is None else int((inside & ~measured).sum()),
    )


# ------------------------------------------------------- area, two ways


def planar_km2(
    shapes: Sequence[shapefile.Shape],
    keep: Sequence[int],
    project: Callable[[list[float], list[float]], tuple[list[float], list[float]]] = grid.project,
) -> float:
    """What the rings enclose in the projection's own plane, by shoelace.

    The control on the cell count. A mask is a decision per cell about a
    boundary 36,000 km long, and this is the same boundary with no cells in
    it: the two agreeing says the count is the polygon rather than an artefact
    of where the cell centres fell. Holes carry the opposite handedness and so
    subtract themselves.
    """
    total = 0.0
    for index in keep:
        for ring in shapes[index].parts:
            xs, ys = project(list(ring[:, 1]), list(ring[:, 0]))
            x, y = np.asarray(xs), np.asarray(ys)
            total += 0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y))
    return abs(total) / 1e6


def sphere_km2(shapes: Sequence[shapefile.Shape], keep: Sequence[int]) -> float:
    """The same rings on the equal-area sphere, from the degrees as drawn.

    The check that does not pass through the projection at all, and so the one
    that can say whether the projection is equal-area rather than whether it
    is self-consistent.

    **Its own error is a few tenths of a percent, and that is the floor of what
    it can prove.** The projection is equal-area on the WGS84 ellipsoid, and
    the authalic sphere has the ellipsoid's *total* area but not its area
    element latitude by latitude: the two differ by up to about 0.3 %, one way
    near the equator and the other near the poles. So a shape spanning the
    band averages the error out and a small shape at one end of it does not,
    which is exactly what the report's spread shows (F65).
    """
    total = 0.0
    for index in keep:
        for ring in shapes[index].parts:
            lon = np.radians(ring[:, 0])
            lat = np.radians(ring[:, 1])
            total += float(
                np.sum((np.roll(lon, -1) - lon) * (np.sin(lat) + np.sin(np.roll(lat, -1))))
            )
    return abs(total) * AUTHALIC_R_M ** 2 / 2 / 1e6


def named(shapes: Sequence[shapefile.Shape], name: str) -> list[int]:
    """The indices of the features with this NAME, for the control rows."""
    return [index for index, shape in enumerate(shapes) if _field(shape.record, "NAME") == name]
