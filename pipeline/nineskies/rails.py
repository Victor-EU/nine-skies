"""A rail along a river, from the map rather than from a hand (design v2,
plan stage 2).

A scene that follows a river wants its rail on the water, and Natural Earth
already draws the water: the same 1:10m centrelines stage 3 carved into the
grid. This reads one named river, joins its pieces end to end, cuts the reach
between two places, and resamples it every few kilometres into the keys a
scene file carries -- latitude, longitude, height above the ground, speed.

    python -m nineskies.rails Yangtze --from 30.70,111.29 --to 29.57,106.55 \\
        --every 5 --above 250 --speed 90

prints YAML rail keys, which the author pastes into the scene and then
trims, bends and re-times by eye. The recorder in the app is for the other
kind of scene, and for fixing what this one gets wrong.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import numpy as np

from . import grid, shapefile
from .acquire import data_root

RIVERS_ZIP = "ne_10m_rivers_lake_centerlines.zip"


def rivers_path() -> Path:
    return data_root() / "source" / "vectors" / RIVERS_ZIP


def pieces(name: str, path: Path | None = None) -> list[np.ndarray]:
    """Every polyline part Natural Earth draws under this English name, as
    (n, 2) lon/lat arrays."""
    out: list[np.ndarray] = []
    for shape in shapefile.read_zip(path or rivers_path()):
        if shape.kind != "line":
            continue
        r = shape.record
        if str(r.get("name_en") or r.get("name") or "").strip().lower() != name.lower():
            continue
        for part in shape.parts:
            if len(part) >= 2:
                out.append(np.asarray(part, dtype="float64"))
    return out


def chain(parts: list[np.ndarray]) -> np.ndarray:
    """Join the parts end to end, greedily by nearest endpoints, flipping a
    part when its far end is the one that meets the chain. The map draws a
    river in a handful of pieces that touch; this makes them one line."""
    if not parts:
        return np.zeros((0, 2))
    remaining = list(parts)
    line = remaining.pop(0)
    while remaining:
        best = None
        for i, part in enumerate(remaining):
            for flip in (False, True):
                p = part[::-1] if flip else part
                d_end = float(np.hypot(*(line[-1] - p[0])))
                d_start = float(np.hypot(*(line[0] - p[-1])))
                for where, d in (("end", d_end), ("start", d_start)):
                    if best is None or d < best[0]:
                        best = (d, i, flip, where)
        d, i, flip, where = best
        p = remaining.pop(i)
        if flip:
            p = p[::-1]
        line = np.vstack([line, p[1:]]) if where == "end" else np.vstack([p[:-1], line])
    return line


def projected(lonlat: np.ndarray) -> np.ndarray:
    xs, ys = grid.project(list(lonlat[:, 1]), list(lonlat[:, 0]))
    return np.column_stack([xs, ys])


def nearest_index(xy: np.ndarray, lat: float, lon: float) -> int:
    px, py = grid.project([lat], [lon])
    return int(np.argmin(np.hypot(xy[:, 0] - px[0], xy[:, 1] - py[0])))


def reach(lonlat: np.ndarray, start: tuple[float, float], end: tuple[float, float]) -> np.ndarray:
    """The part of the line between the two places, running start to end."""
    xy = projected(lonlat)
    i = nearest_index(xy, *start)
    j = nearest_index(xy, *end)
    if i <= j:
        return lonlat[i : j + 1]
    return lonlat[j : i + 1][::-1]


def resample(lonlat: np.ndarray, every_km: float) -> np.ndarray:
    """Points every `every_km` of real ground along the line, the ends kept."""
    xy = projected(lonlat)
    seg = np.hypot(np.diff(xy[:, 0]), np.diff(xy[:, 1]))
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    total = float(cum[-1])
    if total == 0:
        return lonlat[:1]
    marks = np.arange(0.0, total, every_km * 1000)
    marks = np.append(marks, total)
    out = []
    for m in marks:
        k = int(np.searchsorted(cum, m, side="right") - 1)
        k = min(max(k, 0), len(seg) - 1)
        t = 0.0 if seg[k] == 0 else (m - cum[k]) / seg[k]
        out.append(lonlat[k] + t * (lonlat[k + 1] - lonlat[k]))
    return np.asarray(out)


def length_km(lonlat: np.ndarray) -> float:
    xy = projected(lonlat)
    return float(np.hypot(np.diff(xy[:, 0]), np.diff(xy[:, 1])).sum() / 1000)


def yaml_keys(lonlat: np.ndarray, above_m: float, speed: float) -> str:
    return "\n".join(
        f"  - {{ lat: {lat:.4f}, lon: {lon:.4f}, above_ground_m: {above_m:.0f}, speed: {speed:g} }}"
        for lon, lat in lonlat
    )


def parse_latlon(text: str) -> tuple[float, float]:
    lat, lon = (float(v) for v in text.split(","))
    return lat, lon


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Rail keys along a Natural Earth river.")
    parser.add_argument("name", help="the river's English name as the map spells it: Yangtze, Jinsha, Yellow")
    parser.add_argument("--from", dest="start", required=True, help="lat,lon where the rail begins")
    parser.add_argument("--to", dest="end", required=True, help="lat,lon where it ends")
    parser.add_argument("--every", type=float, default=5.0, help="km between keys")
    parser.add_argument("--above", type=float, default=250.0, help="height above the ground, m")
    parser.add_argument("--speed", type=float, default=90.0, help="real km of ground a minute")
    args = parser.parse_args(argv)

    parts = pieces(args.name)
    if not parts:
        print(f"no river named {args.name!r} in {rivers_path().name}", file=sys.stderr)
        return 1
    line = chain(parts)
    cut = reach(line, parse_latlon(args.start), parse_latlon(args.end))
    keys = resample(cut, args.every)
    print(f"# {args.name}: {len(parts)} piece(s), {length_km(line):.0f} km drawn; "
          f"this reach {length_km(cut):.0f} km, {len(keys)} keys every {args.every:g} km, "
          f"{length_km(cut) / args.speed * 60:.0f} s at {args.speed:g} km/min")
    print(yaml_keys(keys, args.above, args.speed))
    return 0


if __name__ == "__main__":
    sys.exit(main())
