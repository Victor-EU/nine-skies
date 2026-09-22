"""Which published tiles the source actually covered, and why the rest are blank.

GLO-30 writes the ocean as exactly zero. So does a destination array nobody
warped anything into. The corridor manifest has always recorded how many tiles
hold land and never which, so a zero in the published heightfield has meant
three different things at once and nothing separated them (F45): the East China
Sea, a cell this build never fetched, and everything outside the window.

The mirror settles two of the three, and it settles them without another
download. Copernicus publishes a one-degree cell only where there is something
to publish, so **a cell absent from the bucket is open ocean** -- 263 of the
2,232 cells over China, and 9 of this corridor's 340, all of them at 120-122 E
off the Jiangsu and Zhejiang coast. That is the publisher's own statement about
where the water is, already on disk in `tileList.txt`, and it has been sitting
unread since stage 1.

What it cannot settle is the ocean *inside* a fetched cell: a coastal raster
holds real sea as real zeros, and at 1 km with a `max` reduction the coast is a
land sample anyway. That half needs a water mask and is phase 2's rivers and
lakes. This is the cheap half the build plan asked for, and the difference
between the two is visible in the four states below: `COAST` is exactly the
place the cheap half runs out.

A tile is 64 km and a cell is about 111, so a tile can and does straddle them.
Nothing here rounds that away: a tile's state is decided by every cell its
footprint touches, and the mixed cases have their own names rather than being
folded into the nearest clean one.
"""

from __future__ import annotations

from dataclasses import dataclass

from . import grid

#: Every source cell under this tile was fetched. Its zeros are real
#: elevations -- sea level land, or ocean inside a raster this cannot tell
#: apart from it.
DATA = "d"

#: No source cell under this tile exists in the mirror at all, so the
#: publisher has said there is nothing here but water. The only state that
#: licenses drawing sea.
OCEAN = "o"

#: Fetched on one side and absent from the mirror on the other: a shoreline,
#: at the resolution a one-degree cell can express one. Some of its zeros are
#: ocean and some may be land, and which is which is the half that needs a
#: water mask.
COAST = "c"

#: A source cell exists under this tile that this build did not fetch. Not
#: water and not data -- the edge of what was asked for. A lon/lat box
#: projects to a curved quadrilateral and the tile window is its bounding
#: rectangle, so every corridor build has corners like this: 296 of this
#: corridor's 1,155 tiles, which is where 169 of its 232 blank tiles come
#: from. Nothing may be concluded about the ground here.
UNREACHED = "e"

STATES = (DATA, OCEAN, COAST, UNREACHED)

LEGEND = {
    DATA: "every source cell under this tile was fetched",
    OCEAN: "no source cell here exists in the mirror, which for GLO-30 means open ocean",
    COAST: "fetched on one side, open ocean on the other",
    UNREACHED: "a source cell exists here that this build did not fetch",
}

#: Points per side used to find the cells under a tile.
#:
#: A 64 km tile against 111 km cells only needs its corners to be right in the
#: common case, but the projection curves and a tile near the top of the grid
#: is a trapezium rather than a square. Nine per side is one point every 8 km,
#: which is the horizon field's own spacing and costs 93,555 points over a
#: corridor -- a single call into PROJ.
SAMPLES_PER_SIDE = 9


def classify(under: set[tuple[int, int]], fetched: set, mirror: set) -> str:
    """One tile's state from the cells under it.

    Order matters and is the point. `UNREACHED` wins over everything, because a
    tile with one unfetched cell in it is a tile nothing may be concluded
    about -- calling it a coast because its other cells happen to be ocean
    would be exactly the guess this module exists to stop.
    """
    if not under:
        return UNREACHED
    if any(c in mirror and c not in fetched for c in under):
        return UNREACHED
    have = sum(1 for c in under if c in fetched)
    if have == len(under):
        return DATA
    if have == 0:
        return OCEAN
    return COAST


@dataclass(frozen=True)
class Coverage:
    """One character per tile, in the heightfield's own order."""

    tiles: str
    counts: dict[str, int]

    def of(self, window: grid.TileWindow, tx: int, ty: int) -> str:
        return self.tiles[index_of(window, tx, ty)]

    def as_json(self) -> dict:
        return {
            "order": "tile-row-major, ty ascending, then tx ascending — the same as heights",
            "legend": LEGEND,
            "counts": self.counts,
            "tiles": self.tiles,
        }


def index_of(window: grid.TileWindow, tx: int, ty: int) -> int:
    """Where a tile sits in the heightfield's order."""
    return (ty - window.ty0) * (window.tx1 - window.tx0) + (tx - window.tx0)


def tile_at(window: grid.TileWindow, index: int) -> tuple[int, int]:
    """The tile at a position in that order. The inverse of `index_of`.

    Both directions live here because this is the one module that knows the
    order the record is written in, and a reader that works it out for itself
    is a second definition of it.
    """
    across = window.tx1 - window.tx0
    return window.tx0 + index % across, window.ty0 + index // across


def cells_under(window: grid.TileWindow, per_side: int = SAMPLES_PER_SIDE) -> list[set]:
    """The one-degree cells each tile of a window touches, in heights order."""
    xs: list[float] = []
    ys: list[float] = []
    for ty in range(window.ty0, window.ty1):
        for tx in range(window.tx0, window.tx1):
            x0, y0, x1, y1 = grid.tile_bounds_m(tx, ty)
            for j in range(per_side):
                for i in range(per_side):
                    xs.append(x0 + (x1 - x0) * i / (per_side - 1))
                    ys.append(y0 + (y1 - y0) * j / (per_side - 1))
    lats, lons = grid.unproject(xs, ys)
    step = per_side * per_side
    return [
        {
            (int(lats[k] // 1), int(lons[k] // 1))
            for k in range(n * step, (n + 1) * step)
        }
        for n in range(window.count)
    ]


def measure(window: grid.TileWindow, fetched: set, mirror: set) -> Coverage:
    states = [classify(u, fetched, mirror) for u in cells_under(window)]
    return Coverage(
        tiles="".join(states),
        counts={s: states.count(s) for s in STATES if states.count(s)},
    )


def sample_states(window: grid.TileWindow, fetched: set, mirror: set):
    """One state per sample, from the one-degree cell under its own centre.

    A level finer than a tile's, for a stage that changes the ground rather
    than one that draws it. A tile on the rim of a corridor is `UNREACHED`
    because some cell under it was never fetched, but the samples inside it
    that stand on a fetched cell are real ground: 247,922 of them in this
    corridor, 5.2 % of its grid, the Yangtze's own headwaters among them
    (F61). A sample reads `DATA` if its cell was fetched, `OCEAN` if the
    mirror has no such cell, and `UNREACHED` otherwise. Nothing here is
    `COAST`: that is a tile straddling two of these, and a sample does not.
    """
    import numpy as np

    transform = grid.transform_for(window)
    xs = transform.c + (np.arange(window.width_samples) + 0.5) * transform.a
    ys = transform.f + (np.arange(window.height_samples) + 0.5) * transform.e
    east, north = np.meshgrid(xs, ys)
    lats, lons = grid.unproject(east.ravel(), north.ravel())
    lat = np.floor(np.asarray(lats)).astype(int)
    lon = np.floor(np.asarray(lons)).astype(int)
    states = np.full(lat.size, UNREACHED, dtype="<U1")
    code = lat * 1000 + lon
    have = np.array(sorted(la * 1000 + lo for la, lo in fetched), dtype=int)
    known = np.array(sorted(la * 1000 + lo for la, lo in mirror), dtype=int)
    states[~np.isin(code, known)] = OCEAN
    states[np.isin(code, have)] = DATA
    return states.reshape(window.height_samples, window.width_samples)


def sample_mask(window: grid.TileWindow, tiles: str, state: str = DATA):
    """Which samples of a window's grid stand only on tiles in `state`.

    A sample on a tile edge is shared by up to four tiles, and it is in the
    mask only if every one of them is -- one unfetched neighbour makes the
    sample a guess, which is `classify`'s rule for a tile one level down.
    Rows run north to south, as the raster's do, while the record counts
    tiles south to north; `index_of` is the only thing here that knows it.

    `state` may name several states, `DATA + COAST` for instance: a sample
    is in the mask when every tile under it is in one of them.
    """
    import numpy as np

    across, down = window.tiles_x, window.tiles_y
    if len(tiles) != across * down:
        raise ValueError(f"{len(tiles)} states for a window of {across * down} tiles")
    good = np.zeros((down, across), dtype=bool)  # tile rows, north first
    for ty in range(window.ty0, window.ty1):
        for tx in range(window.tx0, window.tx1):
            good[window.ty1 - 1 - ty, tx - window.tx0] = (
                tiles[index_of(window, tx, ty)] in state
            )

    def touched(samples: int, tiles_along: int):
        at = np.arange(samples)
        high = np.minimum(at // grid.TILE_CELLS, tiles_along - 1)
        low = np.where((at % grid.TILE_CELLS == 0) & (at > 0), at // grid.TILE_CELLS - 1, high)
        return np.minimum(low, tiles_along - 1), high

    row_low, row_high = touched(window.height_samples, down)
    col_low, col_high = touched(window.width_samples, across)
    return (
        good[np.ix_(row_low, col_low)]
        & good[np.ix_(row_low, col_high)]
        & good[np.ix_(row_high, col_low)]
        & good[np.ix_(row_high, col_high)]
    )
