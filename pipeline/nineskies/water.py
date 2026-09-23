"""Where the water is, as a layer the terrain draws beside the heights (F72).

The heights say nothing about water. GLO-30 writes the sea as 0 m, and the
ramp's 0 m is a green plain, so the East China Sea has been drawn as farmland
since the first corridor. A lake is flat ground at its own level, drawn the
colour of whatever else stands that high: Namtso as plateau and Tai Lake as
paddy. No river is drawn anywhere, though stage 3 carved 98 of them into the
corridor and 314 into the country.

This stage says which samples are water, from the two sources that already
decide it, and only where the two agree:

- **sea** is a sample GLO-30 writes as exactly 0 m that Natural Earth's
  coastline puts outside every country, and every sample of a one-degree cell
  the mirror has no source for (F54). A zero on land is a zero-metre field, and
  a sea sample stage 3 raised is a lagoon the fill closed, and neither is sea;
- **a lake** is a sample inside a Natural Earth lake that stands at the level
  most of that lake's samples carry, and at the same level as a neighbour.
  GLO-30 flattens a water body to one value, so a sample wholly over water
  carries that value exactly and a sample touching the shore does not. The
  neighbour rules out a coincidence: stage 3's fill leaves flat ground all
  over the grid, never at a lake's own level beside another sample of it;
- **a river** is a channel stage 3 cut, found again here by the same two
  functions from the same inputs and checked against the grid they cut:
  every sample stage 3 lowered lies on one of them. Not the mapped line,
  which runs a median kilometre from the valley stage 3 found for it;
- **a river's own surface** is where the grid resolves the river wider than
  its channel (F73): a sample at exactly its channel's level, reached from
  the channel through samples that are too, on ground stage 3 did not raise
  and that no other rule decides. The lake rule's signature again: GLO-30
  flattens a river as it flattens a lake. At 90 m this is the Three Gorges
  reservoir, 157.5 m over 100 km²; at 1 km it is a few hundred samples of
  reservoir and wide reach, because a 1 km sample is rarely all water.

A river is stored as a vector rather than as samples, because a 1 km sample
is 125 m of world at 1:8 and a river drawn in samples is a staircase. Each
sample carries the offset to the nearest point of the nearest river's
centreline, which is linear in position along a straight reach. Interpolated
between four samples it is exact there, so the shader can draw a ribbon of any
width with a smooth edge. The centreline is the channel's own path, cut to
eight-connected and smoothed twice, so it stays within a sample of the valley
floor it was carved along.

Four bytes a sample: the offset east and north in `OFFSET_STEP_M` units about
`OFFSET_ZERO`, the river's Natural Earth scalerank plus one (0 where no river
is within reach), and the standing-water class. Tiles are cut exactly as the
heights are, so a tile's water is the same 65 x 65 samples as its ground.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Sequence

import numpy as np

from . import grid

#: Bytes per sample: offset east, offset north, river, standing water.
CHANNELS = 4
#: One unit of an offset byte, in metres, and the byte that means none.
OFFSET_STEP_M = 32.0
OFFSET_ZERO = 128
#: How far a river's offset is carried: 127 units, 4,064 m. A drawn ribbon is
#: never wider than this less the diagonal of a sample, so it also bounds how
#: wide the shader can make a river to keep it visible from far off.
REACH_UNITS = 127
REACH_M = REACH_UNITS * OFFSET_STEP_M

#: The standing-water byte. A river's surface is standing water in the sense
#: the shader means: a class per sample, drawn with a shore (F73).
LAND, SEA, LAKE, RIVER = 0, 1, 2, 3
CLASSES = {"land": LAND, "sea": SEA, "lake": LAKE, "river": RIVER}
#: The river byte where no river is within reach.
NO_RIVER = 0

#: Segments of centreline measured against the grid at once.
CHUNK = 32

#: How a water file is coded: its bytes as they lie, under gzip. The package
#: codes a country tile so, and `hero.py` a whole area (F72, F73).
CODEC = "rgba8-gzip"

#: Standing higher than this over the water beside it, a sample under a
#: ribbon is wall rather than shore: the report counts them (F73).
WALL_M = 20.0

LAYOUT = (
    "rgba8 per sample, tiles as heights.bin: offset east and north to the "
    "nearest river centreline in offsetStepM units about 128; the river's "
    "Natural Earth scalerank plus one, 0 for none within reachM; standing "
    "water 0 land, 1 sea, 2 lake, 3 a river's own surface"
)


# ------------------------------------------------------------------ standing


def flat(heights: np.ndarray) -> np.ndarray:
    """True where a sample holds exactly the value of a four-neighbour."""
    out = np.zeros(heights.shape, dtype=bool)
    same = heights[1:, :] == heights[:-1, :]
    out[1:, :] |= same
    out[:-1, :] |= same
    same = heights[:, 1:] == heights[:, :-1]
    out[:, 1:] |= same
    out[:, :-1] |= same
    return out


def sea(heights: np.ndarray, fetched: np.ndarray, ocean: np.ndarray, land: np.ndarray) -> np.ndarray:
    """Zero on fetched ground the coastline puts at sea, and every ocean sample."""
    return ocean | (fetched & ~land & (heights == 0.0))


@dataclass(frozen=True)
class Lake:
    """One mapped lake, and how much of its outline the ground agrees is water."""

    id: int
    name: str
    #: Samples inside the outline, on fetched ground.
    samples: int
    #: The value most of them carry.
    level: float
    #: How many carry it.
    at_level: int
    #: How many of those are drawn: at the level and beside another sample of it.
    drawn: int


def lakes(
    heights: np.ndarray, outlines: np.ndarray, fetched: np.ndarray, names: Sequence[str]
) -> tuple[np.ndarray, list[Lake]]:
    """Samples inside a mapped lake, at its level, and flat; and each lake's count.

    `outlines` is stage 3's lake raster: the lake's index plus one on each
    sample whose centre it covers, 0 elsewhere.
    """
    flat_heights = heights.ravel()
    ids = outlines.ravel()
    inside = np.flatnonzero((ids > 0) & fetched.ravel())
    water = np.zeros(heights.size, dtype=bool)
    level_flat = flat(heights).ravel()
    found: list[Lake] = []
    if inside.size == 0:
        return water.reshape(heights.shape), found
    order = inside[np.argsort(ids[inside], kind="stable")]
    lake_of = ids[order]
    starts = np.r_[0, np.flatnonzero(lake_of[1:] != lake_of[:-1]) + 1, lake_of.size]
    for a, b in zip(starts[:-1], starts[1:]):
        cells = order[a:b]
        values, counts = np.unique(flat_heights[cells], return_counts=True)
        level = values[int(np.argmax(counts))]
        at = cells[flat_heights[cells] == level]
        drawn = at[level_flat[at]]
        water[drawn] = True
        lake = int(lake_of[a])
        found.append(
            Lake(
                id=lake,
                name=names[lake - 1] if lake - 1 < len(names) else "(unnamed)",
                samples=int(cells.size),
                level=float(level),
                at_level=int(at.size),
                drawn=int(drawn.size),
            )
        )
    return water.reshape(heights.shape), found


def standing(
    sea_mask: np.ndarray, lake_mask: np.ndarray, surface_mask: np.ndarray | None = None
) -> np.ndarray:
    """The standing-water byte. A lake wins where it meets the sea, which is
    nowhere on either built grid: every lake is inside a country's outline. A
    river's surface never meets either, since `surfaces` stops at both."""
    out = np.zeros(sea_mask.shape, dtype=np.uint8)
    if surface_mask is not None:
        out[surface_mask] = RIVER
    out[sea_mask] = SEA
    out[lake_mask] = LAKE
    return out


def surfaces(
    heights: np.ndarray,
    before: np.ndarray,
    channels: Sequence,
    barred: np.ndarray,
    near: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Where the grid resolves a river wider than its channel, and which
    channel each such sample belongs to (its index plus one, 0 for none).

    A flood from every channel sample over samples at exactly its level:
    four-neighbours, within `near` of a centreline, on ground stage 3 did not
    raise (`heights <= before`), and never into `barred` -- the sea, a lake's
    outline and unfetched ground, which other rules decide. Exact, because
    GLO-30 flattens a river to one value as it does a lake, and an exact match
    beside it is that flattening; the fill also leaves ground flat at a
    channel's level wherever a hollow spills into one, which is why raised
    ground is barred (F73).

    A channel sample is kept only where the flood left it: beside a surface
    sample off the channel. Alone, it is a river narrower than the grid, and a
    staircase of samples one wide drawn as standing water beads; the ribbon
    draws those.
    """
    height, width = heights.shape
    flat = heights.ravel()
    below = (heights <= before).ravel()
    closed = barred.ravel()
    blocked = closed | ~near.ravel()
    owner = np.zeros(flat.size, dtype=np.int32)
    level = np.zeros(flat.size, dtype=flat.dtype)
    queue: deque[int] = deque()
    on_channel = np.zeros(flat.size, dtype=bool)
    for k, channel in enumerate(channels):
        for cell in channel.cells:
            cell = int(cell)
            on_channel[cell] = True
            if owner[cell] or closed[cell]:
                continue
            owner[cell] = k + 1
            level[cell] = flat[cell]
            queue.append(cell)
    while queue:
        cell = queue.popleft()
        row, col = divmod(cell, width)
        for step, ok in ((-width, row > 0), (width, row < height - 1), (-1, col > 0), (1, col < width - 1)):
            other = cell + step
            if not ok or owner[other] or on_channel[other] or blocked[other] or not below[other]:
                continue
            if flat[other] == level[cell]:
                owner[other] = owner[cell]
                level[other] = level[cell]
                queue.append(other)
    wet = (owner > 0).reshape(heights.shape)
    off = wet & ~on_channel.reshape(heights.shape)
    beside = np.zeros(heights.shape, dtype=bool)
    beside[1:, :] |= off[:-1, :]
    beside[:-1, :] |= off[1:, :]
    beside[:, 1:] |= off[:, :-1]
    beside[:, :-1] |= off[:, 1:]
    mask = off | (wet & beside)
    return mask, np.where(mask, owner.reshape(heights.shape), 0)


@dataclass(frozen=True)
class Piece:
    """One connected stretch of a river's own surface."""

    samples: int
    level: float
    river: str
    lat: float
    lon: float


def pieces(mask: np.ndarray, owner: np.ndarray, heights: np.ndarray, names: Sequence[str],
           transform) -> list[Piece]:
    """The surface's connected pieces, largest first, for the report."""
    from .carve import _where

    height, width = mask.shape
    flat_mask = mask.ravel()
    seen = np.zeros(flat_mask.size, dtype=bool)
    found: list[Piece] = []
    for start in np.flatnonzero(flat_mask).tolist():
        if seen[start]:
            continue
        seen[start] = True
        members = [start]
        queue = deque([start])
        while queue:
            cell = queue.popleft()
            row, col = divmod(cell, width)
            for step, ok in ((-width, row > 0), (width, row < height - 1), (-1, col > 0), (1, col < width - 1)):
                other = cell + step
                if ok and flat_mask[other] and not seen[other]:
                    seen[other] = True
                    members.append(other)
                    queue.append(other)
        middle = members[len(members) // 2]
        lat, lon = _where(transform, middle, width)
        values, counts = np.unique(heights.ravel()[members], return_counts=True)
        found.append(Piece(
            samples=len(members),
            level=float(values[int(np.argmax(counts))]),
            river=names[int(owner.ravel()[start]) - 1],
            lat=lat,
            lon=lon,
        ))
    return sorted(found, key=lambda p: -p.samples)


# -------------------------------------------------------------------- rivers


@dataclass(frozen=True)
class Centreline:
    """One carved channel as a line to draw, in sample columns and rows."""

    name: str
    #: The river byte: Natural Earth's scalerank plus one.
    river: int
    x: np.ndarray
    y: np.ndarray


def eight_connected(cells: Sequence[int], width: int) -> list[tuple[int, int]]:
    """A four-connected path as (row, col), without the corner each diagonal
    step turns at. The corner is a staircase, not the river."""
    points = [divmod(int(c), width) for c in cells]
    out: list[tuple[int, int]] = []
    for point in points:
        if out and out[-1] == point:
            continue
        if len(out) >= 2:
            (r0, c0), (r2, c2) = out[-2], point
            if abs(r2 - r0) == 1 and abs(c2 - c0) == 1:
                out.pop()
        out.append(point)
    return out


def chaikin(x: np.ndarray, y: np.ndarray, rounds: int = 2) -> tuple[np.ndarray, np.ndarray]:
    """Corner cutting, both ends kept where they are: a tributary's last point
    is a sample of the channel it joins, and the two lines still meet."""
    for _ in range(rounds):
        if len(x) < 3:
            break
        qx = 0.75 * x[:-1] + 0.25 * x[1:]
        qy = 0.75 * y[:-1] + 0.25 * y[1:]
        rx = 0.25 * x[:-1] + 0.75 * x[1:]
        ry = 0.25 * y[:-1] + 0.75 * y[1:]
        nx = np.empty(2 * len(qx), dtype="float64")
        ny = np.empty_like(nx)
        nx[0::2], nx[1::2] = qx, rx
        ny[0::2], ny[1::2] = qy, ry
        x = np.r_[x[0], nx[1:-1], x[-1]]
        y = np.r_[y[0], ny[1:-1], y[-1]]
    return x, y


def centrelines(
    channels: Sequence, width: int, river_of: Callable[[int], int], rounds: int = 2
) -> list[Centreline]:
    """Each channel's path as a smoothed line. `river_of` maps a Natural Earth
    feature to its river byte."""
    lines = []
    for channel in channels:
        points = eight_connected(channel.cells, width)
        rows = np.array([p[0] for p in points], dtype="float64")
        cols = np.array([p[1] for p in points], dtype="float64")
        x, y = chaikin(cols, rows, rounds)
        lines.append(Centreline(channel.run.name, river_of(channel.run.feature), x, y))
    return lines


def offsets(
    lines: Sequence[Centreline], shape: tuple[int, int], reach: float
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """From each sample to the nearest point of the nearest line, in samples:
    east (+column) and north (-row), and that line's river byte. Samples
    farther than `reach` from every line get none of it."""
    height, width = shape
    # Single precision: the country is 29.7 M samples, and a sample's position
    # needs no more than a millimetre of it.
    best = np.full(shape, np.inf, dtype="float32")
    east = np.zeros(shape, dtype="float32")
    north = np.zeros(shape, dtype="float32")
    river = np.zeros(shape, dtype=np.uint8)
    margin = int(np.ceil(reach)) + 1
    for line in lines:
        x, y = line.x, line.y
        if len(x) == 1:
            x, y = np.r_[x, x], np.r_[y, y]
        for start in range(0, len(x) - 1, CHUNK):
            ax, ay = x[start:start + CHUNK], y[start:start + CHUNK]
            bx, by = x[start + 1:start + CHUNK + 1], y[start + 1:start + CHUNK + 1]
            n = min(len(ax), len(bx))
            ax, ay, bx, by = ax[:n], ay[:n], bx[:n], by[:n]
            c0 = max(0, int(np.floor(min(ax.min(), bx.min()))) - margin)
            c1 = min(width, int(np.ceil(max(ax.max(), bx.max()))) + margin + 1)
            r0 = max(0, int(np.floor(min(ay.min(), by.min()))) - margin)
            r1 = min(height, int(np.ceil(max(ay.max(), by.max()))) + margin + 1)
            if c0 >= c1 or r0 >= r1:
                continue
            px = np.arange(c0, c1, dtype="float64")[None, :, None]
            py = np.arange(r0, r1, dtype="float64")[:, None, None]
            dx, dy = bx - ax, by - ay
            length2 = dx * dx + dy * dy
            with np.errstate(invalid="ignore", divide="ignore"):
                t = ((px - ax) * dx + (py - ay) * dy) / length2
            t = np.clip(np.where(length2 > 0, t, 0.0), 0.0, 1.0)
            qx = ax + t * dx
            qy = ay + t * dy
            d2 = (px - qx) ** 2 + (py - qy) ** 2
            k = np.argmin(d2, axis=2)
            nearest = np.take_along_axis(d2, k[..., None], axis=2)[..., 0]
            window = best[r0:r1, c0:c1]
            better = nearest < window
            if not better.any():
                continue
            gx = np.take_along_axis(np.broadcast_to(qx, d2.shape), k[..., None], axis=2)[..., 0]
            gy = np.take_along_axis(np.broadcast_to(qy, d2.shape), k[..., None], axis=2)[..., 0]
            window[better] = nearest[better]
            east[r0:r1, c0:c1][better] = (px[..., 0] - gx)[better]
            north[r0:r1, c0:c1][better] = -(py[..., 0] - gy)[better]
            river[r0:r1, c0:c1][better] = line.river
    far = best > reach * reach
    east[far] = 0.0
    north[far] = 0.0
    river[far] = NO_RIVER
    return east, north, river


def layer(
    east: np.ndarray,
    north: np.ndarray,
    river: np.ndarray,
    standing_water: np.ndarray,
    resolution_m: float = grid.RESOLUTION_M,
) -> np.ndarray:
    """(rows, cols, 4) bytes. An offset rounds to the nearest unit and is held
    to the byte's range, which only a sample right at the reach can leave."""
    scale = resolution_m / OFFSET_STEP_M
    out = np.empty(east.shape + (CHANNELS,), dtype=np.uint8)
    out[..., 0] = np.clip(np.rint(east * scale) + OFFSET_ZERO, 1, 255)
    out[..., 1] = np.clip(np.rint(north * scale) + OFFSET_ZERO, 1, 255)
    out[..., 2] = river
    out[..., 3] = standing_water
    return out


def cut(array: np.ndarray, window: grid.TileWindow) -> np.ndarray:
    """(tiles, 65, 65, channels), tile-row-major, j running north: `heights.bin`'s
    layout, a sample at a time, so a tile's water lies on its own ground."""
    n = window.count
    s = grid.TILE_SAMPLES
    out = np.zeros((n, s, s) + array.shape[2:], dtype=array.dtype)
    t = 0
    for ty in range(window.ty0, window.ty1):
        for tx in range(window.tx0, window.tx1):
            row_north, col_west = grid.sample_index(window, tx, ty, 0, grid.TILE_CELLS)
            out[t] = array[row_north:row_north + s, col_west:col_west + s][::-1]
            t += 1
    return out


def has_water(tile: np.ndarray) -> bool:
    """Whether a cut tile carries anything the shader would draw."""
    return bool((tile[..., 2] != NO_RIVER).any() or (tile[..., 3] != LAND).any())


# --------------------------------------------------------------------- build


def world_dir(corridor: str) -> Path:
    return Path(__file__).resolve().parents[2] / "dist-world" / corridor


def river_bytes() -> Callable[[int], int]:
    """Natural Earth feature index -> the river byte, its scalerank plus one."""
    from . import rivers

    shapes = rivers.load(rivers.RIVERS)
    ranks = [int(shape.record.get("scalerank") or 0) for shape in shapes]
    return lambda feature: min(254, ranks[feature] + 1)


def channels_checked(source, conditioned: np.ndarray, record: dict) -> list:
    """Stage 3's channels, found again, and refused unless they are the ones
    that cut the grid on disk: as many as its record names, and every sample
    it lowered on one of them."""
    from . import carve, hydro

    found = carve.runs(source.lines, source.ground.cells, source.heights, source.measured)
    made, _lost = carve.channels(source.heights, found, source.measured, source.lakes)
    if len(made) != record.get("channels"):
        raise SystemExit(
            f"found {len(made)} channels and stage 3's record names {record.get('channels')}; "
            f"re-run `make carve`"
        )
    on = np.zeros(source.heights.size, dtype=bool)
    for channel in made:
        on[channel.cells] = True
    lowered = (source.heights - conditioned).ravel() > hydro.DROWNED_M
    stray = int((lowered & ~on).sum())
    if stray:
        raise SystemExit(
            f"{stray} samples stage 3 lowered lie on none of the channels found here; "
            f"re-run `make carve`"
        )
    return made


#: How many pieces of river surface a report lists, largest first.
PIECE_ROWS = 12


@dataclass
class GridWater:
    """One grid's water layer, and the measurement a report prints of it."""

    data: np.ndarray
    result: dict


def grid_water(
    heights: np.ndarray,
    before: np.ndarray,
    transform,
    fetched: np.ndarray,
    ocean: np.ndarray,
    land: np.ndarray,
    outlines: np.ndarray,
    lake_names: Sequence[str],
    made: Sequence,
    river_of: Callable[[int], int],
    above_at: Sequence[float] = (),
) -> GridWater:
    """Every rule above on one grid: the country's, a corridor's or a hero
    area's. `heights` is the grid stage 3 wrote and `before` the one it read;
    `made` its channels, `outlines` its lake raster. `above_at` asks, at each
    distance in metres from a river's line, how high the ground stands over
    the water: what a ribbon that wide would be drawn on."""
    resolution_m = abs(transform.a)
    sea_mask = sea(heights, fetched, ocean, land)
    lake_mask, lake_rows = lakes(heights, outlines, fetched, lake_names)

    shape = heights.shape
    lines = centrelines(made, shape[1], river_of)
    east, north, river = offsets(lines, shape, REACH_M / resolution_m)
    barred = sea_mask | (outlines > 0) | ~fetched
    surface_mask, owner = surfaces(heights, before, made, barred, river != NO_RIVER)
    still = standing(sea_mask, lake_mask, surface_mask)
    data = layer(east, north, river, still, resolution_m)

    on_channel = np.zeros(heights.size, dtype=bool)
    for channel in made:
        on_channel[channel.cells] = True
    on_channel = on_channel.reshape(shape)
    drift = np.hypot(east, north)[on_channel] if on_channel.any() else np.zeros(1)
    found = pieces(surface_mask, owner, heights, [c.run.name for c in made], transform)

    zero = fetched & (heights == 0.0)
    result = {
        "shape": list(shape),
        "resolutionM": resolution_m,
        "sea": int(sea_mask.sum()),
        "seaFetched": int((sea_mask & fetched).sum()),
        "seaOcean": int(ocean.sum()),
        "zeroOnLand": int((zero & land).sum()),
        "raisedAtSea": int((fetched & ~land & (before == 0.0) & (heights != 0.0)).sum()),
        "aboveZeroAtSea": int((fetched & ~land & (heights > 0.0)).sum()),
        "lakes": [lake.__dict__ for lake in sorted(lake_rows, key=lambda r: -r.samples)],
        "lakeSamples": int(sum(r.samples for r in lake_rows)),
        "lakeDrawn": int(lake_mask.sum()),
        "channels": len(made),
        "channelSamples": int(on_channel.sum()),
        "reachSamples": int((river != NO_RIVER).sum()),
        "channelsByRiver": {
            int(k): int(v)
            for k, v in zip(*np.unique([line.river for line in lines], return_counts=True))
        },
        "byRiver": {int(k): int(v) for k, v in zip(*np.unique(river[river != NO_RIVER], return_counts=True))},
        "channelDriftM": {
            "median": float(np.median(drift) * resolution_m),
            "p99": float(np.percentile(drift, 99) * resolution_m),
            "max": float(drift.max() * resolution_m),
        },
        "surface": int(surface_mask.sum()),
        "surfaceOnChannel": int((surface_mask & on_channel).sum()),
        "surfacePieces": len(found),
        "pieces": [piece.__dict__ for piece in found[:PIECE_ROWS]],
    }
    if above_at:
        near = river != NO_RIVER
        levels = channel_levels(heights, made, near)
        result["aboveWater"] = ground_above(
            heights - levels, np.hypot(east, north) * resolution_m, near, above_at
        )
    return GridWater(data=data, result=result)


def channel_levels(heights: np.ndarray, channels: Sequence, near: np.ndarray) -> np.ndarray:
    """The level of the channel sample nearest each sample within `near`,
    nearest by four-neighbour steps; NaN elsewhere. The water beside a sample."""
    height, width = heights.shape
    flat = heights.ravel()
    inside = near.ravel()
    level = np.full(flat.size, np.nan, dtype="float64")
    queue: deque[int] = deque()
    for channel in channels:
        for cell in channel.cells:
            cell = int(cell)
            if np.isnan(level[cell]):
                level[cell] = flat[cell]
                queue.append(cell)
    while queue:
        cell = queue.popleft()
        row, col = divmod(cell, width)
        for step, ok in ((-width, row > 0), (width, row < height - 1), (-1, col > 0), (1, col < width - 1)):
            other = cell + step
            if ok and inside[other] and np.isnan(level[other]):
                level[other] = level[cell]
                queue.append(other)
    return level.reshape(heights.shape)


def ground_above(
    above: np.ndarray, distance_m: np.ndarray, near: np.ndarray, at: Sequence[float]
) -> list[dict]:
    """At each distance from the line, the samples within it and how high they
    stand over the water beside them."""
    rows = []
    for limit in at:
        inside = near & (distance_m <= limit) & ~np.isnan(above)
        values = above[inside]
        if values.size == 0:
            continue
        rows.append({
            "withinM": float(limit),
            "samples": int(values.size),
            "medianM": float(np.median(values)),
            "p90M": float(np.percentile(values, 90)),
            "maxM": float(values.max()),
            "wall": int((values > WALL_M).sum()),
        })
    return rows


def entry_for(tiles_: np.ndarray, tile_samples: int, heights_sha256: str, **more) -> dict:
    """What a grid's water file says of itself, as the package and the engine
    read it."""
    raw = tiles_.tobytes()
    wet = [has_water(tile) for tile in tiles_]
    return {
        "version": 1,
        "layout": LAYOUT,
        "channels": CHANNELS,
        "tileSamples": tile_samples,
        "offsetStepM": OFFSET_STEP_M,
        "offsetZero": OFFSET_ZERO,
        "reachM": REACH_M,
        "classes": dict(CLASSES),
        "tiles": len(wet),
        "tilesWithWater": int(sum(wet)),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        # The heights these samples lie on, which the package checks before it
        # codes a file of them: water cut against other ground is not shipped.
        "heightsSha256": heights_sha256,
        **more,
    }


def build(corridor: str, out_dir: Path | None = None) -> dict:
    import rasterio

    from . import boundary, carve, coverage, rivers, tiles
    from .grid import CORRIDORS
    from .mosaic import corridor_window

    started = time.time()
    out_dir = out_dir or world_dir(corridor)
    manifest_path = out_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"no {manifest_path}; run `make tiles` first")
    manifest = json.loads(manifest_path.read_text())
    record = tiles.conditioning(corridor)
    if manifest.get("conditioning", {}).get("sha256") != record["sha256"]:
        raise SystemExit(
            f"{manifest_path} was cut from another stage 3 grid than the one on disk; "
            f"run `make tiles` first"
        )

    source = carve.load(corridor)
    with rasterio.open(carve.conditioned_path(corridor)) as dataset:
        conditioned = dataset.read(1)
    if conditioned.shape != source.heights.shape:
        raise SystemExit(f"stage 3's grid is {conditioned.shape}, stage 2's {source.heights.shape}")
    made = channels_checked(source, conditioned, record)

    states = source.states
    land = rivers.polygons_raster(boundary.load(), source.transform, conditioned.shape) > 0
    water = grid_water(
        conditioned, source.heights, source.transform,
        states == coverage.DATA, states == coverage.OCEAN, land,
        source.lakes, source.lake_names, made, river_bytes(),
    )

    window = corridor_window(CORRIDORS[corridor])
    cut_tiles = cut(water.data, window)
    path = out_dir / "water.bin"
    path.write_bytes(cut_tiles.tobytes())
    entry = entry_for(
        cut_tiles, grid.TILE_SAMPLES, manifest["heights"]["sha256"],
        conditioningSha256=record["sha256"],
    )
    entry = {"version": 1, "file": path.name, **entry}
    (out_dir / "water.json").write_text(json.dumps(entry, indent=2) + "\n")
    result = {"corridor": corridor, **water.result,
              "tiles": entry["tiles"], "tilesWithWater": entry["tilesWithWater"]}
    result["seconds"] = round(time.time() - started, 1)
    return result


# -------------------------------------------------------------------- report


def _n(value: float) -> str:
    return f"{value:,.0f}"


def _share(part: int, whole: int) -> str:
    return f"{100 * part / whole:.1f} %" if whole else "—"


#: How many lakes the report lists by name, largest outline first.
LAKE_ROWS = 20


def surface_section(result: dict, level: str = "##") -> list[str]:
    """What the grid resolves of its rivers as surfaces, largest piece first."""
    size = f"{result['resolutionM']:,.0f} m"
    area = result["surface"] * (result["resolutionM"] / 1000) ** 2
    lines = [
        "",
        f"{level} A river's own surface",
        "",
        "Where the grid resolves a river wider than its channel: a sample at exactly",
        "its channel's level, reached from the channel through samples that are too,",
        "on ground stage 3 did not raise, and not sea or inside a lake's outline",
        "(F73). A channel sample counts only beside one off the channel; a river one",
        "sample wide is the ribbon's to draw.",
        "",
        f"**{_n(result['surface'])} samples** of {size}, {area:,.1f} km², in "
        f"{_n(result['surfacePieces'])} pieces; {_n(result['surfaceOnChannel'])} of them are "
        f"channel samples.",
    ]
    if result["pieces"]:
        lines += [
            "",
            "| samples | level, m | river | lat | lon |",
            "| ---: | ---: | --- | ---: | ---: |",
        ]
        for piece in result["pieces"]:
            lines.append(
                f"| {_n(piece['samples'])} | {piece['level']:,.2f} | {piece['river']} | "
                f"{piece['lat']:.2f} N | {piece['lon']:.2f} E |"
            )
    return lines


def render_areas(areas: Sequence[tuple[str, str, dict]]) -> str:
    """The report `make hero` writes of the water on each area it cut (F73)."""
    lines = [
        "# Water — hero areas, 90 m grid",
        "",
        "Written by `make hero` (F73). Each area's water, by the rules the country's",
        "is drawn by (`docs/water-report.md`), from the channels stage 3 cut as the",
        "area was cut. At 90 m the grid resolves a river's valley, so what a ribbon",
        "is drawn on is measured here too: the ground within each distance of a",
        "river's line, against the water beside it.",
    ]
    for area_id, name, result in areas:
        drift = result["channelDriftM"]
        lines += [
            "",
            f"## {name}",
            "",
            f"`{area_id}` · {result['shape'][1]} × {result['shape'][0]} samples at "
            f"{result['resolutionM']:.0f} m · {result['tilesWithWater']} of {result['tiles']} tiles carry water",
            "",
            f"**{result['channels']} channel(s)** over {_n(result['channelSamples'])} samples; the drawn",
            f"line lies a median {drift['median']:.0f} m from a channel sample and at most "
            f"{drift['max']:.0f} m. {_n(result['lakeDrawn'])} lake samples of "
            f"{_n(result['lakeSamples'])} inside an outline; {_n(result['sea'])} of sea.",
        ]
        lines += surface_section(result, "###")
        above = result.get("aboveWater") or []
        if above:
            lines += [
                "",
                "### What a ribbon would be drawn on",
                "",
                f"The ground within each distance of the line, over the water beside it. A",
                f"sample more than {WALL_M:.0f} m over it is wall rather than shore.",
                "",
                "| within | samples | median | 90th | highest | wall |",
                "| ---: | ---: | ---: | ---: | ---: | ---: |",
            ]
            for row in above:
                lines.append(
                    f"| {row['withinM']:.0f} m | {_n(row['samples'])} | {row['medianM']:.1f} m | "
                    f"{row['p90M']:.1f} m | {row['maxM']:.1f} m | {_share(row['wall'], row['samples'])} |"
                )
    lines.append("")
    return "\n".join(lines)


def render(result: dict) -> str:
    """The report `make water` writes: what each rule found, and what it left."""
    lakes_ = result["lakes"]
    none = [lake for lake in lakes_ if lake["drawn"] == 0]
    lines = [
        f"# Water — {result['corridor']}",
        "",
        "Written by `make water` (F72). Which samples of the conditioned grid are",
        "water, and the rivers stage 3 carved, as the layer the terrain draws. A",
        "sample is water only where two sources agree: the ground's own value and",
        "Natural Earth's coastline or lake outline. Every number below is a count",
        "of 1 km samples.",
        "",
        "## Sea",
        "",
        "A sample GLO-30 writes as exactly 0 m that the coastline puts outside every",
        "country, and every sample of a one-degree cell the mirror has no source for.",
        "",
        "| | samples |",
        "| --- | ---: |",
        f"| sea | {_n(result['sea'])} |",
        f"| … of it on fetched ground | {_n(result['seaFetched'])} |",
        f"| … of it where the mirror has no source (F54) | {_n(result['seaOcean'])} |",
        f"| 0 m inside the coastline: land at sea level, not sea | {_n(result['zeroOnLand'])} |",
        f"| 0 m outside it that stage 3 raised: lagoons the fill closed | {_n(result['raisedAtSea'])} |",
        f"| above 0 m outside it: the shore itself, and islands the coastline leaves out | {_n(result['aboveZeroAtSea'])} |",
        "",
        "## Lakes",
        "",
        "A sample inside a lake's outline, at the value most of that lake's samples",
        "carry, and holding the same value as a neighbour. GLO-30 flattens a water",
        "body to one value, so a sample wholly over water carries it exactly.",
        "",
        f"**{len(lakes_)} lakes** have fetched ground here: {_n(result['lakeSamples'])} samples inside",
        f"their outlines, of which **{_n(result['lakeDrawn'])} are drawn** "
        f"({_share(result['lakeDrawn'], result['lakeSamples'])}). "
        f"{len(none)} draw nothing: no value is shared by two neighbours at the level most",
        "of their samples carry, so the ground there is not a water surface.",
        "",
        "| lake | outline | level, m | at level | drawn | share |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for lake in lakes_[:LAKE_ROWS]:
        lines.append(
            f"| {lake['name']} | {_n(lake['samples'])} | {lake['level']:,.2f} | "
            f"{_n(lake['at_level'])} | {_n(lake['drawn'])} | {_share(lake['drawn'], lake['samples'])} |"
        )
    if none:
        named = ", ".join(f"{lake['name']} ({_n(lake['samples'])})" for lake in none[:12])
        more = f", and {len(none) - 12} more" if len(none) > 12 else ""
        lines += ["", f"Drawing nothing: {named}{more}."]
    drift = result["channelDriftM"]
    lines += [
        "",
        "## Rivers",
        "",
        "Stage 3's channels, found again from the same inputs and refused unless",
        "every sample it lowered lies on one. Each is cut to eight-connected and",
        "smoothed twice, and every sample within the reach carries its offset to",
        "the nearest point of the nearest one.",
        "",
        f"**{result['channels']} channels** over {_n(result['channelSamples'])} samples. "
        f"The drawn line lies a median **{drift['median']:.0f} m** from a channel sample and at",
        f"most **{drift['max']:.0f} m** — half a sample's diagonal, the corner a four-connected",
        f"step turns at. {_n(result['reachSamples'])} samples carry an offset.",
        "",
        "| river byte (scalerank + 1) | channels | samples within reach |",
        "| ---: | ---: | ---: |",
    ]
    by_river = result["byRiver"]
    by_channels = result.get("channelsByRiver", {})
    for key in sorted(set(by_river) | set(by_channels), key=int):
        lines.append(f"| {key} | {by_channels.get(key, 0)} | {_n(by_river.get(key, 0))} |")
    lines += surface_section(result)
    lines += [
        "",
        "## Tiles",
        "",
        f"{_n(result['tilesWithWater'])} of {_n(result['tiles'])} tiles carry water. "
        f"Built in {result['seconds']:.0f} s.",
        "",
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    from .grid import CORRIDORS

    parser = argparse.ArgumentParser(description="The sea, the lakes and the carved rivers, per tile.")
    parser.add_argument("--corridor", default="sea-to-sky", choices=sorted(CORRIDORS))
    parser.add_argument("--out", type=Path, default=None, help="the built world's directory")
    parser.add_argument("--report", type=Path, default=None)
    parser.add_argument("--json", type=Path, default=None, help="write the measurement here")
    args = parser.parse_args(argv)
    result = build(args.corridor, args.out)
    if args.json:
        args.json.write_text(json.dumps(result, indent=2) + "\n")
    text = render(result)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(text)
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
