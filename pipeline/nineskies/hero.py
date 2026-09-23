"""Stage 6 — the hero grid: 90 m over a handful of named places.

**Why this stage exists at all.** It was a fidelity preference until F49
measured the Jinsha and F50 put the measurement on the water: at 1 km the
river climbs 221 m in the 41 km downstream from Shigu to Tiger Leaping Gorge,
where the source runs it down 41. That is a golden probe failing on the
artefact the game ships, so `probes.py` defers the check to this grid on
F12's rule rather than leaving a red gate nobody can close.

**Why 90 m, measured rather than inherited.** Two probes read this artefact
and they pull opposite ways: the gorge wants the valley floor left alone, a
summit wants the ridge kept. Sweeping resolution against grid phase — sixteen
sub-cell offsets at each, which is how F12 found the 1 km summit swinging
153 m — gives the window of silhouette biases where both pass at once:

    60 m   every bias from 0.00 to 0.75   gorge 11.7 m, summit 11.1 m to spare
    90 m   0.25 to 0.45                   gorge  4.4 m, summit  3.6 m
   100 m   0.35 alone                     gorge  3.0 m, summit  1.0 m
   120 m   none

So 100 m is not a setting, it is a coincidence — one value of a continuous
knob, with a metre to spare on a 5,337 m mountain. 90 m has a real window and
is what the build plan asked for. 60 m makes the knob stop mattering and costs
2.3 MB per area against 1.0; that is a budget line rather than an engineering
call, and it is written up in the findings for whoever owns the budget.

The summit half of that window is measured on Yulong Xueshan and Haba Xueshan,
the two massifs this gorge runs between, standing in for the Everest probe —
whose own source cells are not on disk. When they are fetched the real number
may differ, and this comment is here so that is checked rather than assumed.

**How a hero tile is addressed** — the question the build plan left open. It
is not addressed against a country tile at all. 90 m does not divide a 64 km
country tile and no tile of 90 m cells does: gcd(90, 64000) is 10, so the
nesting the 65 x 65 country tiles enjoy is unavailable at any tile size. The
hero lattice therefore stands on its own, sharing only the country grid's
origin so that both are indexed from the same corner. What makes that safe is
not shared samples but the engine's skirts: `terrain.ts` drops a ring 900 m
below each tile edge and says they "must out-reach the worst height
disagreement between LODs". So the cut measures that disagreement along its
own boundary and refuses to write a hero area that exceeds it. The guarantee
is checked rather than assumed, which is the only reason a non-nesting grid is
allowed to exist here.

A skirt only hangs down, though, so it closes the seam only where the hero
edge stands higher. Where the country ground does, which is three-quarters of
both rims, the sky showed through until the engine hung a curtain from the
country's side as well (F74). And what this cut measures is the country grid
read bilinearly, a point a kilometre, where the step the engine draws is
between triangles at each lattice's LOD: 452 m at the finest where this reads
330. The drawn step is held to the skirts by the engine's own test on the
built world, `test/terrain/rimCurtain.test.ts`.

**Stage 3 runs on every area as it is cut** (D64, F63). An area is cut from
the source and not from the country grid, so the carve that conditions the
country grid never reached one, and the Jinsha crossed a sill 119 m over
Shigu on the grid the seventh probe reads (F58). `condition` gives each area
the same stage with the same inputs: its mapped rivers carved down their own
valleys from where each enters the area to where it leaves, its mapped lakes
kept, and every other closed basin the rule D62 decided. What is written, the
probes read and the engine draws is the conditioned area.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path

from . import grid, places
from .acquire import data_root, tile_name

# numpy and rasterio are imported inside the functions that need them, on the
# same rule as `grid.py`: the geometry here -- the lattice, the areas, which
# country tiles a hero tile sits on -- is arithmetic a bare interpreter can
# run, and it is the half most worth having a test for. Only the cut needs
# GDAL.

RESOLUTION_M = 90
TILE_CELLS = 128
TILE_SAMPLES = TILE_CELLS + 1  # 129 — the same shared-edge rule as a country tile
TILE_M = RESOLUTION_M * TILE_CELLS  # 11,520

#: Measured, not inherited from stage 2. At a 3.3x reduction a plain mean
#: barely shaves a ridge, so the bias is free to be chosen against the river
#: instead — and it has to be, because the country grid's 0.25 sits at the
#: very edge of the window where both hero probes pass. See the module
#: docstring for the sweep this came out of.
SILHOUETTE_BIAS = 0.40

#: Inherited from `engine/src/terrain/terrain.ts`, where the skirt ring is
#: `900 * verticalExaggeration` deep and is commented "Skirts must out-reach
#: the worst height disagreement between LODs". This grid disagrees with the
#: country grid by construction -- that disagreement is the whole point of it
#: -- so the number that keeps the seam closed is this one, and `cut` checks
#: against it rather than trusting it.
SKIRT_DEPTH_M = 900

INT16_MIN, INT16_MAX = -32768, 32767


@dataclass(frozen=True)
class HeroArea:
    """A rectangle of hero tiles over a named feature.

    `holds` is the contract: these places must fall inside the area, and
    `cut` refuses to write one that does not contain them. That is what stops
    an area drifting off the feature it is named for while still building --
    which is the same fault F49 and F50 found in a coordinate, one level up.
    """

    id: str
    name: str
    hx0: int
    hy0: int
    tiles_x: int
    tiles_y: int
    holds: tuple[str, ...] = ()
    why: str = ""
    note: str = ""
    #: Whether `make hero` cuts it unasked. An area whose publishing is a
    #: decision nobody has made is cut only when named (`--area`), so that
    #: fetching its cells does not publish it (F73).
    published: bool = True
    #: Cell size, metres. 90 unless a scene needs the source's own 30 (design
    #: v2, stage 0: the karst towers at Guilin). Every lattice quantity below
    #: is the area's own, so two resolutions can be cut; the engine draws one
    #: lattice per index, so `write_index` publishes only the index's.
    resolution_m: int = RESOLUTION_M

    @property
    def tile_m(self) -> int:
        return self.resolution_m * TILE_CELLS

    @property
    def count(self) -> int:
        return self.tiles_x * self.tiles_y

    @property
    def hx1(self) -> int:
        return self.hx0 + self.tiles_x

    @property
    def hy1(self) -> int:
        return self.hy0 + self.tiles_y

    def bounds_m(self) -> tuple[float, float, float, float]:
        """(west, south, east, north) in Albers metres."""
        return (
            grid.ORIGIN_X_M + self.hx0 * self.tile_m,
            grid.ORIGIN_Y_M + self.hy0 * self.tile_m,
            grid.ORIGIN_X_M + self.hx1 * self.tile_m,
            grid.ORIGIN_Y_M + self.hy1 * self.tile_m,
        )

    @property
    def width_samples(self) -> int:
        return self.tiles_x * TILE_CELLS + 1

    @property
    def height_samples(self) -> int:
        return self.tiles_y * TILE_CELLS + 1


def tile_of(x_m: float, y_m: float, tile_m: int = TILE_M) -> tuple[int, int]:
    """The hero tile holding a projected point, indexed from the country origin."""
    return (
        math.floor((x_m - grid.ORIGIN_X_M) / tile_m),
        math.floor((y_m - grid.ORIGIN_Y_M) / tile_m),
    )


def country_tiles_under(hx: int, hy: int, tile_m: int = TILE_M) -> list[tuple[int, int]]:
    """Which 64 km country tiles a hero tile overlaps — one, two or four.

    There is no nesting to exploit (see the module docstring), so this is the
    honest answer to "where does this tile sit in the world": a span, not an
    index. Anything that wants to unload a country tile when its hero cover
    arrives has to ask this rather than divide.
    """
    west, south, east, north = (
        grid.ORIGIN_X_M + hx * tile_m,
        grid.ORIGIN_Y_M + hy * tile_m,
        grid.ORIGIN_X_M + (hx + 1) * tile_m,
        grid.ORIGIN_Y_M + (hy + 1) * tile_m,
    )
    step = grid.TILE_KM * 1000
    tx0 = math.floor((west - grid.ORIGIN_X_M) / step)
    ty0 = math.floor((south - grid.ORIGIN_Y_M) / step)
    tx1 = math.ceil((east - grid.ORIGIN_X_M) / step)
    ty1 = math.ceil((north - grid.ORIGIN_Y_M) / step)
    return [(tx, ty) for ty in range(ty0, ty1) for tx in range(tx0, tx1)]


def area_around(
    place_ids: tuple[str, ...], margin_km: float = 8.0, resolution_m: int = RESOLUTION_M
) -> tuple[int, int, int, int]:
    """The smallest hero tile rectangle holding these places, plus a margin."""
    lats = [places.BY_ID[p].lat for p in place_ids]
    lons = [places.BY_ID[p].lon for p in place_ids]
    xs, ys = grid.project(lats, lons)
    m = margin_km * 1000
    tile_m = resolution_m * TILE_CELLS
    hx0, hy0 = tile_of(min(xs) - m, min(ys) - m, tile_m)
    hx1, hy1 = tile_of(max(xs) + m, max(ys) + m, tile_m)
    return hx0, hy0, hx1 - hx0 + 1, hy1 - hy0 + 1


#: The areas the build plan names, in the order it names them. Two of the five
#: have no entry here, and that is the point rather than an omission: an area
#: is sited on places from `places.py`, and inventing a coordinate is precisely
#: the move that cost F49 and F50 -- one written from memory, agreed with
#: itself in three files, and 71 km from the place it named. The Three Gorges
#: below stopped being one of them by being measured rather than recalled, and
#: `siting.py` is that measurement kept. The remaining two are listed in
#: `UNSITED` with what each needs, and neither needs a coordinate: Guilin needs
#: a fetch and Zhangjiajie needs a finer source than we have.
# Sited by `area_around` from `places.py`, written down like the areas above.
TAKLAMAKAN_HX0, TAKLAMAKAN_HY0 = 138, 221
GUILIN_HX0, GUILIN_HY0, GUILIN_TX, GUILIN_TY = 1037, 210, 10, 18

AREAS: tuple[HeroArea, ...] = (
    HeroArea(
        id="tiger-leaping-gorge",
        name="Tiger Leaping Gorge and the first bend",
        hx0=256,
        hy0=89,
        tiles_x=4,
        tiles_y=6,
        holds=("shigu", "tiger-leaping-gorge"),
        why="The seventh golden probe reads this ground and cannot pass at "
        "1 km: the Jinsha climbs 221 m in the 41 km downstream from Shigu, "
        "where the source runs it down 41 (F49, F50).",
        note="Sized to hold both probe waypoints with 8 km to spare, which "
        "is why it is 4 x 6 tiles rather than square.",
    ),
    HeroArea(
        id="three-gorges",
        name="Qutang, Wu and Xiling gorges",
        hx0=336,
        hy0=129,
        tiles_x=12,
        tiles_y=3,
        holds=("qutang-gorge", "wu-gorge", "xiling-gorge"),
        why="The GDD's *thread a gorge at low speed* wants a gorge the "
        "aeroplane can be flown down, and this is 190 km of one. At 1 km the "
        "reservoir through it reads 237-298 m where the source runs it at "
        "156-158, so the water the player would fly along is filled in by "
        "80-140 m and the walls are cut down with it (F52).",
        note="One area rather than three, which is the question the build "
        "plan left open. Three would save 11 tiles and cost five more rim "
        "crossings: the ground reading steps by the grids' disagreement "
        "wherever hero cover starts or stops (F51), and a flight down this "
        "reach would take six of those instead of two. Sized on the same "
        "8 km margin as the gorge above.",
    ),
    HeroArea(
        id="everest",
        name="Everest and the Rongbuk glacier",
        hx0=146,
        hy0=113,
        tiles_x=3,
        tiles_y=3,
        holds=("everest",),
        why="The second probe deferred to this grid: at 1 km the summit is "
        "unpassable at any tolerance because grid phase alone swings it "
        "153 m (F12).",
        note="Outside the Sea to Sky corridor box; its cells came with the "
        "country (F64). Published since design v2: the film's last scene is "
        "the Himalaya from the north.",
    ),
    HeroArea(
        id="taklamakan",
        name="The Taklamakan's central dunes",
        hx0=TAKLAMAKAN_HX0,
        hy0=TAKLAMAKAN_HY0,
        tiles_x=4,
        tiles_y=4,
        holds=("taklamakan-dunes",),
        why="Design v2, scene 7: dunes 100-300 m high and 1-3 km crest to "
        "crest alias into noise on a 1 km grid; at 90 m they are dunes.",
        note="A 46 km square on the dune field, sited from the map rather "
        "than measured; stage 0's still decides whether it stays.",
    ),
    HeroArea(
        id="guilin",
        name="Guilin karst, the Li from Guilin to Yangshuo",
        hx0=GUILIN_HX0,
        hy0=GUILIN_HY0,
        tiles_x=GUILIN_TX,
        tiles_y=GUILIN_TY,
        holds=("guilin", "yangshuo"),
        why="Design v2, scene 3: the towers are 100-500 m across, which 90 m "
        "draws as blobs; this is the one area cut at the source's own 30 m.",
        note="Its own lattice (3,840 m tiles), so it cannot share the 90 m "
        "index the engine reads today. Cut when named, to a directory of its "
        "own; whether the engine grows a second lattice is stage 0's answer.",
        published=False,
        resolution_m=30,
    ),
)

#: Named by the build plan, with no coordinate anything has checked.
UNSITED: tuple[tuple[str, str, str], ...] = (
    (
        "zhangjiajie",
        "Zhangjiajie / Wulingyuan pillars",
        "The cells are on disk and the coordinate is not the blocker any "
        "more: the source is. `siting.py` cannot place this one, and the "
        "reason is that there is nothing there to place it on. At 30 m the "
        "pillars are not resolved as pillars, the ground around the card's "
        "own trigger reads 4.4 % of its cells past 45 deg against Tiger "
        "Leaping Gorge's 20.6 %, and the steepest 10 km box anywhere in the "
        "surrounding degree is 36 km away and still only half as steep as "
        "the gorge already cut. A 90 m grid over it would draw hills. What "
        "this needs is a finer source or a decision not to cut it (F52).",
    ),
)

BY_ID: dict[str, HeroArea] = {a.id: a for a in AREAS}


def transform_for(area: HeroArea):
    """A north-up sample-grid transform, on the same rule as a country tile.

    Sample (0, 0) is centred on the area's north-west corner, so every sample
    lands on a hero tile corner or edge -- which is what makes the 129 x 129
    tiles share their edges with each other exactly, the one nesting property
    this grid does keep.
    """
    from affine import Affine

    west, _south, _east, north = area.bounds_m()
    res = area.resolution_m
    half = res / 2
    return Affine(res, 0.0, west - half, 0.0, -res, north + half)


def boundary_lonlat(area: HeroArea, per_edge: int = 32) -> tuple[list[float], list[float]]:
    """Lat/lon around the area's edge — enough points for a conic projection.

    The four corners are not enough: Albers is conic, so a projected rectangle
    has curved edges in lat/lon and its extreme latitude is in the middle of an
    edge rather than at a corner.
    """
    west, south, east, north = area.bounds_m()
    from rasterio.crs import CRS
    from rasterio.warp import transform as transform_points

    xs: list[float] = []
    ys: list[float] = []
    for i in range(per_edge + 1):
        t = i / per_edge
        xs += [west + (east - west) * t, west + (east - west) * t, west, east]
        ys += [south, north, south + (north - south) * t, south + (north - south) * t]
    lons, lats = transform_points(
        CRS.from_proj4(grid.ALBERS_PROJ4), CRS.from_epsg(4326), xs, ys
    )
    return list(lats), list(lons)


def source_box(area: HeroArea) -> grid.LonLatBox:
    """The one-degree cells this area needs, as a lat/lon box."""
    lats, lons = boundary_lonlat(area)
    return grid.LonLatBox(
        south=math.floor(min(lats)),
        north=math.floor(max(lats)) + 1,
        west=math.floor(min(lons)),
        east=math.floor(max(lons)) + 1,
    )


def missing_cells(area: HeroArea, source: Path | None = None) -> list[str]:
    """Source cells this area needs that are not on disk."""
    source = source or data_root() / "source" / "cop30"
    missing = []
    for lat, lon in source_box(area).cells():
        name = tile_name(lat, lon)
        if not (source / f"{name}.tif").exists():
            missing.append(name)
    return missing


def ready(source: Path | None = None) -> list[HeroArea]:
    """Published areas whose source cells are all on disk: what `make hero`
    cuts. Everest's cells arriving with the country (F64) made it ready, and a
    rule of cells alone would have published it with nobody deciding to."""
    return [a for a in AREAS if a.published and not missing_cells(a, source)]


def warp(vrt_path: Path, area: HeroArea, resampling):
    """Reproject the mosaic into an area's sample grid, one resampling method."""
    import numpy as np
    import rasterio
    from rasterio.crs import CRS
    from rasterio.warp import reproject

    from .mosaic import WARP_CHUNK_MB

    dst = np.zeros((area.height_samples, area.width_samples), dtype="float32")
    with rasterio.Env(GDAL_MAX_DATASET_POOL_SIZE=64, GDAL_CACHEMAX=256):
        with rasterio.open(vrt_path) as src:
            reproject(
                source=rasterio.band(src, 1),
                destination=dst,
                src_crs=src.crs,
                src_nodata=-32767,
                dst_crs=CRS.from_proj4(grid.ALBERS_PROJ4),
                dst_transform=transform_for(area),
                dst_nodata=None,
                init_dest_nodata=False,
                resampling=resampling,
                num_threads=4,
                warp_mem_limit=WARP_CHUNK_MB,
            )
    return dst


def cut_tiles(array, area: HeroArea):
    """(tiles, 129, 129) Int16, tile-row-major with j running north.

    Deliberately the same layout as `tiles.cut_tiles`, down to the flip: the
    engine's heightmap reader should not have to learn a second convention to
    read a finer tile, and a second convention is a second place for the
    north-south flip to be got wrong.
    """
    import numpy as np

    rounded = np.clip(np.rint(array), INT16_MIN, INT16_MAX).astype("int16")
    return cut_layer(rounded, area)


def cut_layer(array, area: HeroArea):
    """(tiles, 129, 129, ...) of any per-sample array, in `cut_tiles`' layout:
    the water layer lies on the samples its heights do (F73)."""
    import numpy as np

    out = np.zeros((area.count, TILE_SAMPLES, TILE_SAMPLES) + array.shape[2:], dtype=array.dtype)
    t = 0
    for j in range(area.tiles_y):
        for i in range(area.tiles_x):
            # Row 0 of the array is the area's north edge; tile j = 0 is its
            # south edge, so count rows down from the top.
            row_north = (area.tiles_y - 1 - j) * TILE_CELLS
            col_west = i * TILE_CELLS
            patch = array[
                row_north : row_north + TILE_SAMPLES,
                col_west : col_west + TILE_SAMPLES,
            ]
            out[t] = patch[::-1]
            t += 1
    return out


def boundary_disagreement(
    area: HeroArea, array, country_path: Path
) -> dict[str, float] | None:
    """How far this area's edge stands from the country grid it is dropped into.

    The seam guarantee, and the reason a non-nesting grid is allowed here at
    all. `terrain.ts` hides an LOD seam behind a skirt `SKIRT_DEPTH_M` deep and
    says it "must out-reach the worst height disagreement between LODs"; this
    is that disagreement, measured rather than assumed. Returns None when there
    is no country grid on this machine to compare against, which the manifest
    then records as unchecked rather than as zero.

    It is the size of the step and not its sign, on the country grid read
    bilinearly rather than as drawn. Which side stands higher decides what
    closes it: the hero skirts where the hero edge does, the country's curtain
    where the country does (F74).
    """
    if not country_path.exists():
        return None
    import numpy as np

    from .sample import GridSampler

    country = GridSampler(country_path)
    lats, lons = boundary_lonlat(area, per_edge=TILE_CELLS)
    tr = transform_for(area)
    inverse = ~tr
    xs, ys = grid.project(lats, lons)
    gaps: list[float] = []
    for lat, lon, x, y in zip(lats, lons, xs, ys):
        theirs = country.elevation_m(lat, lon)
        if theirs != theirs:  # this area reaches outside the built country grid
            continue
        col, row = inverse * (x, y)
        col, row = col - 0.5, row - 0.5
        h, w = array.shape
        c, r = min(max(col, 0.0), w - 1), min(max(row, 0.0), h - 1)
        c0, r0 = int(c), int(r)
        c1, r1 = min(c0 + 1, w - 1), min(r0 + 1, h - 1)
        fc, fr = c - c0, r - r0
        mine = float(
            (array[r0, c0] * (1 - fc) + array[r0, c1] * fc) * (1 - fr)
            + (array[r1, c0] * (1 - fc) + array[r1, c1] * fc) * fr
        )
        gaps.append(abs(mine - theirs))
    if not gaps:
        return None
    return {
        "samples": float(len(gaps)),
        "meanM": float(np.mean(gaps)),
        "worstM": float(max(gaps)),
        "skirtDepthM": float(SKIRT_DEPTH_M),
    }


def digest(path: Path) -> str:
    sha = hashlib.sha256()
    with open(path, "rb") as handle:
        while chunk := handle.read(1 << 20):
            sha.update(chunk)
    return sha.hexdigest()


def condition(area: HeroArea, array, path: Path, rule: str | None = None):
    """Stage 3 on one area as stage 6 cuts it: (the area as cut, what stage 3 did).

    The same stage the country grid gets, with the same vectors and rule and
    the same band in metres -- 56 cells here -- walked at a quarter of this
    grid's cell (D64). Every sample is measured, since `cut` refuses an area
    with a source cell missing, so the only way out of the area is its edge.
    """
    import numpy as np

    from . import carve

    heights = np.asarray(array, dtype="float32")
    measured = np.ones(heights.shape, dtype=bool)
    source = carve.ground_over(heights, transform_for(area), measured, path)
    result = carve.condition(
        heights, source.lines, source.lakes, measured, source.ground.cells,
        rule=rule or carve.RULE,
        radius=carve.radius_cells(area.resolution_m),
        step=area.resolution_m / 4,
    )
    return source, result


#: How far from a river's line `water_layer` measures the ground against the
#: water, in metres: half a 90 m sample, one, and the country's ribbons.
ABOVE_WATER_AT_M = (45.0, 90.0, 150.0, 300.0, 600.0)


def water_layer(source, result):
    """The area's water by the country's rules, from the channels stage 3 has
    just cut rather than found again (F73). Every sample is measured, and no
    area reaches the sea."""
    import numpy as np

    from . import boundary, rivers, water

    shape = result.heights.shape
    land = rivers.polygons_raster(
        boundary.load(), source.transform, shape, box=rivers.extent(source.ground)
    ) > 0
    return water.grid_water(
        result.heights, source.heights, source.transform,
        source.measured, np.zeros(shape, dtype=bool), land,
        source.lakes, source.lake_names, result.channels, water.river_bytes(),
        above_at=ABOVE_WATER_AT_M,
    )


@dataclass
class Cut:
    """One area as written, and what stage 3 did to it on the way (F63).

    `source` is a `carve.Corridor` and `result` a `carve.Conditioned`, named
    as `object` because this module imports `carve` -- and through it numpy --
    only inside the functions that cut, so that the lattice above keeps
    running on a bare interpreter.
    """

    area: HeroArea
    out_dir: Path
    source: object
    result: object
    #: The area's edge against the country grid, as cut and as written.
    seam: tuple[dict | None, dict | None]
    #: What `water.grid_water` measured of it (F73).
    water: dict | None = None


def cut(
    area_id: str,
    corridor: str = "sea-to-sky",
    out_dir: Path | None = None,
    bias: float = SILHOUETTE_BIAS,
) -> Cut:
    import rasterio
    from rasterio.crs import CRS
    from rasterio.enums import Resampling

    from .mosaic import vrt_xml

    area = BY_ID[area_id]
    root = data_root()
    cop30 = root / "source" / "cop30"

    missing = missing_cells(area, cop30)
    if missing:
        raise SystemExit(
            f"{area.id}: {len(missing)} source cell(s) not on disk, so nothing "
            f"was cut. A hero area built over a hole reads as sea level, which "
            f"is a worse answer than no area at all:\n  "
            + "\n  ".join(missing)
        )

    box = source_box(area)
    tiles = [
        (lat, lon, cop30 / f"{tile_name(lat, lon)}.tif") for lat, lon in box.cells()
    ]
    work = root / "work"
    work.mkdir(parents=True, exist_ok=True)
    vrt_path = work / f"hero-{area.id}.vrt"
    vrt_path.write_text(vrt_xml(tiles, box))

    print(f"{area.id}: {area.count} tiles at {area.resolution_m} m, bias {bias}", flush=True)
    mean = warp(vrt_path, area, Resampling.average)
    peak = warp(vrt_path, area, Resampling.max)
    as_cut = mean + bias * (peak - mean)

    # Stage 3, as the country grid had it (D64). Everything below reads the
    # conditioned area: the contract, the seam, the raster and the tiles.
    from . import carve

    tif_path = work / f"hero-{area.id}.tif"
    source, result = condition(area, as_cut, tif_path)
    array = result.heights
    done = carve.counts(source.heights, result)

    # One world, one rule. The country grid this area is dropped into was
    # conditioned by the same stage earlier, and a build that changed the rule
    # or the vectors in between would draw two rules across one seam.
    record = carve.record_path(corridor)
    if record.exists():
        problem = carve.differs(
            json.loads(record.read_text()),
            result.rule,
            carve.inputs(result.rule, result.radius, result.sinks)["vectors"],
        )
        if problem:
            raise SystemExit(
                f"{area.id}: {problem}, so nothing was cut. Run `make carve` and "
                f"`make hero` from the same rule and the same `make vectors`."
            )
    print(
        f"  stage 3: {done['channels']} channel(s), {done['cellsCarved']:,} cells cut, "
        f"{done['lakesKept']} lake(s) kept, rule {result.rule}: {done['cellsRaised']:,} raised, "
        f"{done['cellsLowered']:,} lowered",
        flush=True,
    )

    # The contract: an area holds the places it is named for. Checked against
    # the ground, not just the bounds -- a place inside the rectangle but
    # reading sea level means the warp did not reach it.
    west, south, east, north = area.bounds_m()
    for place_id in area.holds:
        place = places.BY_ID[place_id]
        xs, ys = grid.project([place.lat], [place.lon])
        if not (west <= xs[0] <= east and south <= ys[0] <= north):
            raise SystemExit(f"{area.id} does not contain {place_id}")

    # Against stage 3's grid, which is the one drawn beside this area (F61).
    gaps_as_cut = boundary_disagreement(area, as_cut, carve.conditioned_path(corridor))
    gaps = boundary_disagreement(area, array, carve.conditioned_path(corridor))
    if gaps is None:
        print("  boundary vs the country grid: no country grid here, unchecked")
    else:
        print(
            f"  boundary vs the country grid: mean {gaps['meanM']:.1f} m, "
            f"worst {gaps['worstM']:.1f} m of {SKIRT_DEPTH_M} m of skirt"
        )
        if gaps["worstM"] > SKIRT_DEPTH_M:
            raise SystemExit(
                f"{area.id}: the edge disagrees with the country grid by "
                f"{gaps['worstM']:.0f} m, deeper than the {SKIRT_DEPTH_M} m "
                f"skirt that hides it. The seam would be visible, so nothing "
                f"was written."
            )

    # The working raster, beside the country grid's own and for the same
    # reason: the golden probes read a GeoTIFF, so the artefact that lets the
    # deferred probe finally run has to be one. `dist-world` gets the tiles.
    with rasterio.open(
        tif_path, "w", driver="GTiff", height=area.height_samples,
        width=area.width_samples, count=1, dtype="float32",
        crs=CRS.from_proj4(grid.ALBERS_PROJ4), transform=transform_for(area),
        compress="deflate",
    ) as ds:
        ds.write(array.astype("float32"), 1)
        ds.update_tags(bias=str(bias), area=area.id, resolution_m=str(area.resolution_m),
                       hx0=str(area.hx0), hy0=str(area.hy0),
                       hx1=str(area.hx1), hy1=str(area.hy1),
                       stage3=result.rule, radius=str(result.radius))

    out_dir = out_dir or Path(__file__).resolve().parents[2] / "dist-world" / corridor / "hero"
    out_dir.mkdir(parents=True, exist_ok=True)
    cut_array = cut_tiles(array, area)
    heights_path = out_dir / f"{area.id}.bin"
    heights_path.write_bytes(cut_array.astype("<i2").tobytes())

    # Its water, cut on the same samples and coded as the country's tiles are,
    # a whole area to one file because an area is fetched whole (F73).
    import gzip

    from . import water

    wet = water_layer(source, result)
    water_tiles = cut_layer(wet.data, area)
    coded = gzip.compress(water_tiles.tobytes(), compresslevel=9, mtime=0)
    water_path = out_dir / f"{area.id}.water.bin"
    water_path.write_bytes(coded)
    water_entry = {
        "file": water_path.name,
        "codec": water.CODEC,
        "fileBytes": len(coded),
        **water.entry_for(water_tiles, TILE_SAMPLES, digest(heights_path)),
    }
    wet.result.update(tiles=water_entry["tiles"], tilesWithWater=water_entry["tilesWithWater"])
    print(
        f"  water: {wet.result['channels']} channel(s), {wet.result['surface']:,} samples of "
        f"river surface, {water_entry['tilesWithWater']} of {area.count} tiles wet, "
        f"{len(coded) / 1e3:.1f} kB",
        flush=True,
    )

    manifest = {
        "version": 1,
        "area": area.id,
        "name": area.name,
        "crs": grid.ALBERS_PROJ4,
        "resolutionM": area.resolution_m,
        "tileM": area.tile_m,
        "tileSamples": TILE_SAMPLES,
        "silhouetteBias": bias,
        "window": {
            "hx0": area.hx0,
            "hy0": area.hy0,
            "hx1": area.hx1,
            "hy1": area.hy1,
        },
        "origin": {"originXM": grid.ORIGIN_X_M, "originYM": grid.ORIGIN_Y_M},
        "countryTiles": sorted(
            {t for i in range(area.hx0, area.hx1)
             for j in range(area.hy0, area.hy1)
             for t in country_tiles_under(i, j, area.tile_m)}
        ),
        "holds": list(area.holds),
        "heights": {
            "file": heights_path.name,
            "dtype": "int16",
            "order": "tile-row-major, j ascending, then i ascending",
            "tiles": area.count,
            "bytes": heights_path.stat().st_size,
            "sha256": digest(heights_path),
        },
        "water": water_entry,
        "boundary": gaps or {"unchecked": True},
        "elevationM": {"min": int(cut_array.min()), "max": int(cut_array.max())},
        # What stage 3 read and did, as the country manifest carries it (F61).
        "conditioning": {**carve.inputs(result.rule, result.radius, result.sinks), **done},
    }
    manifest_path = out_dir / f"{area.id}.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    write_index(out_dir)
    print(
        f"  wrote {heights_path.stat().st_size / 1e6:.2f} MB · "
        f"{cut_array.min()}..{cut_array.max()} m · {manifest_path.name} · "
        f"probe with --grid {tif_path}"
    )
    return Cut(area=area, out_dir=out_dir, source=source, result=result,
               seam=(gaps_as_cut, gaps), water=wet.result)


def write_index(out_dir: Path) -> Path:
    """The list of areas actually cut, beside them.

    Nothing else publishes it. The corridor manifest is not the place: it is
    hashed into the section signature (D23), and a hero area appearing or
    disappearing must not change what a route section verifies against. So the
    engine asks this file which areas exist and fetches those, and a corridor
    with no hero cover simply has no index -- the same shape as a checkout with
    no world at all, which the app already knows how to fly.

    Rebuilt from the directory rather than from `chosen`, so cutting one area
    leaves the other entries alone instead of clobbering them.

    One lattice per index (design v2, stage 0): the engine draws the tiles of
    one index from one texture array of one tile size, so every area in a
    directory must share a resolution, and a directory is a lattice. The 30 m
    areas live in `hero-30m/` beside the 90 m `hero/`, each with its own
    index; a directory holding both is refused rather than published wrong.
    """
    areas = []
    resolutions: set[int] = set()
    for area in AREAS:
        path = out_dir / f"{area.id}.json"
        if not path.exists():
            continue
        manifest = json.loads(path.read_text())
        resolutions.add(int(manifest.get("resolutionM", RESOLUTION_M)))
        areas.append(
            {
                "id": area.id,
                "name": area.name,
                "file": path.name,
                "window": manifest["window"],
                "bytes": manifest["heights"]["bytes"],
            }
        )
    if len(resolutions) > 1:
        raise SystemExit(
            f"{out_dir}: areas at {sorted(resolutions)} m in one directory; an index is one "
            f"lattice, so cut each resolution to a directory of its own (--out)"
        )
    resolution = resolutions.pop() if resolutions else RESOLUTION_M
    index = {
        "version": 1,
        "resolutionM": resolution,
        "tileM": resolution * TILE_CELLS,
        "tileSamples": TILE_SAMPLES,
        "origin": {"originXM": grid.ORIGIN_X_M, "originYM": grid.ORIGIN_Y_M},
        "areas": areas,
    }
    path = out_dir / "index.json"
    path.write_text(json.dumps(index, indent=2) + "\n")
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Cut the 90 m hero areas (stage 6).")
    parser.add_argument("--corridor", default="sea-to-sky")
    parser.add_argument(
        "--area", default=None,
        help="one area id, published or not; default every published one on disk",
    )
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--list", action="store_true", help="what is sited, ready, missing")
    parser.add_argument(
        "--report", type=Path, default=None,
        help="where to write what stage 3 did to each area cut (F63)",
    )
    parser.add_argument(
        "--water-report", type=Path, default=None,
        help="where to write the water drawn on each area cut (F73)",
    )
    args = parser.parse_args(argv)

    if args.list:
        print(f"{'area':>24} {'tiles':>6} {'source cells':>14}")
        for area in AREAS:
            missing = missing_cells(area)
            state = "on disk" if not missing else f"{len(missing)} to fetch"
            if not area.published:
                state += ", unpublished"
            print(f"{area.id:>24} {area.count:>6} {state:>14}")
        for area_id, name, why in UNSITED:
            print(f"{area_id:>24} {'—':>6} {'unsited':>14}   {why}")
        return 0

    chosen = [BY_ID[args.area]] if args.area else ready()
    if not chosen:
        print("no hero area has all its source cells on disk", file=sys.stderr)
        return 1
    done = [cut(area.id, args.corridor, args.out) for area in chosen]
    if args.report:
        from . import carve

        text = carve.render_areas([
            carve.measure_area(c.area.id, c.area.name, c.source, c.result, c.seam) for c in done
        ])
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(text)
        print(text)
    if args.water_report:
        from . import water

        text = water.render_areas([(c.area.id, c.area.name, c.water) for c in done])
        args.water_report.parent.mkdir(parents=True, exist_ok=True)
        args.water_report.write_text(text)
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
