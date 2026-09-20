"""Stage 2a — the projected grid that every later stage shares.

Albers Equal Area Conic, central meridian 105 E, standard parallels 25 N and
47 N, 1 km cells, 64 km tiles with a shared edge row and column.

The grid constants are **frozen, not computed at import**. Tile indices end up
inside content hashes and inside save files, so they must not shift when PROJ
ships a new datum grid. `tests/test_grid.py` reprojects China's corners and
fails if the country ever stops fitting inside these numbers — which is the
check that matters, and is different from recomputing them every run.
"""

from __future__ import annotations

from dataclasses import dataclass

ALBERS_PROJ4 = (
    "+proj=aea +lat_1=25 +lat_2=47 +lat_0=0 +lon_0=105 "
    "+x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"
)

RESOLUTION_M = 1000
TILE_KM = 64
TILE_CELLS = TILE_KM * 1000 // RESOLUTION_M  # 64
TILE_SAMPLES = TILE_CELLS + 1  # 65 — neighbours share an edge exactly


@dataclass(frozen=True)
class LonLatBox:
    """A half-open lat/lon box in whole degrees: [south, north) x [west, east)."""

    south: int
    north: int
    west: int
    east: int

    def cells(self) -> list[tuple[int, int]]:
        """Every one-degree cell in the box, by its south-west corner."""
        return [
            (lat, lon)
            for lat in range(self.south, self.north)
            for lon in range(self.west, self.east)
        ]


#: The country the game is about, as a lon/lat box.
CHINA = LonLatBox(south=18, north=54, west=73, east=135)

#: The corridor phase 0 builds. Wider than the Shanghai-Lhasa line because the
#: Yangtze golden probe reaches from Tiger Leaping Gorge to the Tuotuo He
#: headwaters, and because reprojection reads outside the cells it writes.
SEA_TO_SKY = LonLatBox(south=25, north=35, west=89, east=123)

#: `make world CORRIDOR=sea-to-sky` builds the first of these. One definition,
#: because a corridor that means one box to the downloader and another to the
#: tiler is a bug nobody finds until the edges are wrong.
CORRIDORS: dict[str, LonLatBox] = {
    "sea-to-sky": SEA_TO_SKY,
    "china": CHINA,
}

# South-west corner of tile (0, 0), in Albers metres, snapped to a 64 km
# multiple. y is metres north of the equator, because lat_0 is 0.
ORIGIN_X_M = -3_456_000
ORIGIN_Y_M = 1_792_000

# 105 x 69 tiles = 6,720 x 4,416 km = 6,720 x 4,416 cells at 1 km.
#
# The build plan said 82 x 86 (5,248 x 5,504). Those came from China's two
# quoted dimensions — 5,200 km east-west, 5,500 km north-south — which are
# great-circle spans between extreme points, not the bounding box of a
# projected boundary. The projected box is *wider* (62 degrees of longitude
# measured at 18 N, the box's southern edge, is 6,560 km) and *shorter* (the
# north-south span between 18 N and 54 N is 4,351 km, and 5,500 counts down to
# the Nansha Islands, which are outside this box). See finding F10.
TILES_X = 105
TILES_Y = 69

WIDTH_CELLS = TILES_X * TILE_CELLS
HEIGHT_CELLS = TILES_Y * TILE_CELLS


@dataclass(frozen=True)
class TileWindow:
    """A rectangle of tiles, half-open, indexed from the south-west corner."""

    tx0: int
    ty0: int
    tx1: int
    ty1: int

    @property
    def tiles_x(self) -> int:
        return self.tx1 - self.tx0

    @property
    def tiles_y(self) -> int:
        return self.ty1 - self.ty0

    @property
    def count(self) -> int:
        return self.tiles_x * self.tiles_y

    @property
    def width_cells(self) -> int:
        return self.tiles_x * TILE_CELLS

    @property
    def height_cells(self) -> int:
        return self.tiles_y * TILE_CELLS

    # Rasters here are *sample* grids, not cell grids: one more sample than
    # cell on each axis, so the edge row and column two neighbouring tiles
    # share actually exists in the data. Without the extra sample the last
    # tile in each direction has no 65th row to read and the seam reopens.
    @property
    def width_samples(self) -> int:
        return self.width_cells + 1

    @property
    def height_samples(self) -> int:
        return self.height_cells + 1

    def bounds_m(self) -> tuple[float, float, float, float]:
        """(west, south, east, north) in Albers metres."""
        return (
            ORIGIN_X_M + self.tx0 * TILE_KM * 1000,
            ORIGIN_Y_M + self.ty0 * TILE_KM * 1000,
            ORIGIN_X_M + self.tx1 * TILE_KM * 1000,
            ORIGIN_Y_M + self.ty1 * TILE_KM * 1000,
        )

    def contains(self, tx: int, ty: int) -> bool:
        return self.tx0 <= tx < self.tx1 and self.ty0 <= ty < self.ty1


COUNTRY = TileWindow(0, 0, TILES_X, TILES_Y)


def window_for_bounds(
    west_m: float, south_m: float, east_m: float, north_m: float
) -> TileWindow:
    """The smallest tile window containing a projected rectangle."""
    import math

    step = TILE_KM * 1000
    return TileWindow(
        tx0=math.floor((west_m - ORIGIN_X_M) / step),
        ty0=math.floor((south_m - ORIGIN_Y_M) / step),
        tx1=math.ceil((east_m - ORIGIN_X_M) / step),
        ty1=math.ceil((north_m - ORIGIN_Y_M) / step),
    )


def tile_bounds_m(tx: int, ty: int) -> tuple[float, float, float, float]:
    return TileWindow(tx, ty, tx + 1, ty + 1).bounds_m()


def transform_for(window: TileWindow):
    """A north-up sample-grid transform for a tile window.

    Sample (0, 0) is centred exactly on the window's north-west corner, so the
    pixel it stands for spans half a cell outside the window. That is the point:
    it makes every sample land on a tile corner or edge, which is what the
    engine's 65 x 65 heightmaps are.

    Rasters count rows downward from the north edge; the tile grid counts upward
    from the south. This function and `sample_index` are the only places that
    flip happens.
    """
    from affine import Affine

    west, _south, _east, north = window.bounds_m()
    half = RESOLUTION_M / 2
    return Affine(RESOLUTION_M, 0.0, west - half, 0.0, -RESOLUTION_M, north + half)


def sample_index(window: TileWindow, tx: int, ty: int, i: int, j: int) -> tuple[int, int]:
    """(row, col) in a window's array for sample (i, j) of tile (tx, ty).

    i runs west to east, j runs *south to north* — the engine's convention —
    while raster rows run north to south.
    """
    return (window.ty1 - ty) * TILE_CELLS - j, (tx - window.tx0) * TILE_CELLS + i


def row_for_tile_y(window: TileWindow, ty: int) -> int:
    """Raster row of a tile's *north* edge inside a window's array."""
    return (window.ty1 - ty - 1) * TILE_CELLS
