"""Sampling the built grid — what the golden probes actually read.

Everything here takes (lat, lon) and returns metres, so `probes.py` never
learns what a projection is.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.warp import transform as transform_points

from . import grid


@dataclass
class GridSampler:
    """Bilinear sampling of a built Albers raster, addressed in lat/lon."""

    path: Path

    def __post_init__(self) -> None:
        with rasterio.open(self.path) as ds:
            self.array: np.ndarray = ds.read(1)
            self.transform = ds.transform
            self.tags = ds.tags()
        self._inverse = ~self.transform
        self._wgs = CRS.from_epsg(4326)
        self._albers = CRS.from_proj4(grid.ALBERS_PROJ4)

    def to_pixel(self, lat: float, lon: float) -> tuple[float, float]:
        xs, ys = transform_points(self._wgs, self._albers, [lon], [lat])
        col, row = self._inverse * (xs[0], ys[0])
        return col - 0.5, row - 0.5  # cell centres, not corners

    def __call__(self, lat: float, lon: float) -> float:
        return self.elevation_m(lat, lon)

    def elevation_m(self, lat: float, lon: float) -> float:
        col, row = self.to_pixel(lat, lon)
        height, width = self.array.shape
        if not (0 <= col <= width - 1 and 0 <= row <= height - 1):
            return float("nan")
        c0, r0 = int(math.floor(col)), int(math.floor(row))
        c1, r1 = min(c0 + 1, width - 1), min(r0 + 1, height - 1)
        fc, fr = col - c0, row - r0
        a = self.array
        top = a[r0, c0] * (1 - fc) + a[r0, c1] * fc
        bottom = a[r1, c0] * (1 - fc) + a[r1, c1] * fc
        return float(top * (1 - fr) + bottom * fr)

    def channel_m(self, lat: float, lon: float, radius_km: float = 2.0) -> float:
        """The lowest cell within a radius — where a river actually is.

        A 1 km cell straddling a gorge reports the wall as readily as the
        water. Until stage 3 burns HydroSHEDS centrelines, this is how a river
        waypoint finds its own channel; it is a measurement aid, not a fix, and
        `probe.py` reports both numbers so the difference stays visible.
        """
        col, row = self.to_pixel(lat, lon)
        height, width = self.array.shape
        reach = int(math.ceil(radius_km * 1000 / grid.RESOLUTION_M))
        c0, c1 = max(0, int(col) - reach), min(width, int(col) + reach + 1)
        r0, r1 = max(0, int(row) - reach), min(height, int(row) + reach + 1)
        if c0 >= c1 or r0 >= r1:
            return float("nan")
        return float(self.array[r0:r1, c0:c1].min())

    def disc_stats(self, lat: float, lon: float, radius_km: float) -> tuple[float, float]:
        """(mean, standard deviation) over a disc — for the lake flatness probe."""
        col, row = self.to_pixel(lat, lon)
        height, width = self.array.shape
        reach = int(math.ceil(radius_km * 1000 / grid.RESOLUTION_M))
        c0, c1 = max(0, int(col) - reach), min(width, int(col) + reach + 1)
        r0, r1 = max(0, int(row) - reach), min(height, int(row) + reach + 1)
        patch = self.array[r0:r1, c0:c1]
        cols = np.arange(c0, c1)[None, :] - col
        rows = np.arange(r0, r1)[:, None] - row
        inside = (cols**2 + rows**2) <= reach**2
        values = patch[inside]
        if values.size == 0:
            return float("nan"), float("nan")
        return float(values.mean()), float(values.std())
