"""The grid constants are frozen. These are the checks that keep them honest.

`grid.py` hard-codes the origin and tile counts because tile indices reach the
content hash and the save file, so they must not move when PROJ is upgraded.
That makes it worth testing the thing the constants *claim*: that China fits
inside them, and that the projection really is equal-area — which is the GDD's
"honest scale" pillar, checked here at cell level long before the
Heihe-Tengchong probe can check it at country level.
"""

from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from rasterio.crs import CRS
    from rasterio.warp import transform as transform_points

    HAVE_RASTERIO = True
except ImportError:  # the suite still runs on a bare interpreter
    HAVE_RASTERIO = False

from nineskies import grid  # noqa: E402

# Authalic radius of WGS84 — the sphere with the ellipsoid's surface area.
AUTHALIC_R = 6_371_007.181


def project(lons, lats):
    return transform_points(
        CRS.from_epsg(4326), CRS.from_proj4(grid.ALBERS_PROJ4), lons, lats
    )


def densified_ring(box: grid.LonLatBox, per_edge: int = 60):
    lons, lats = [], []
    for i in range(per_edge):
        t = i / per_edge
        lons.append(box.west + (box.east - box.west) * t)
        lats.append(box.south)
    for i in range(per_edge):
        t = i / per_edge
        lons.append(box.east)
        lats.append(box.south + (box.north - box.south) * t)
    for i in range(per_edge):
        t = i / per_edge
        lons.append(box.east - (box.east - box.west) * t)
        lats.append(box.north)
    for i in range(per_edge):
        t = i / per_edge
        lons.append(box.west)
        lats.append(box.north - (box.north - box.south) * t)
    return lons, lats


def shoelace(xs, ys) -> float:
    total = 0.0
    n = len(xs)
    for i in range(n):
        j = (i + 1) % n
        total += xs[i] * ys[j] - xs[j] * ys[i]
    return abs(total) / 2


def sphere_area(box: grid.LonLatBox) -> float:
    return (
        AUTHALIC_R**2
        * math.radians(box.east - box.west)
        * (math.sin(math.radians(box.north)) - math.sin(math.radians(box.south)))
    )


class TestGridGeometry(unittest.TestCase):
    def test_tile_size_matches_the_engine(self) -> None:
        self.assertEqual(grid.TILE_KM, 64)
        self.assertEqual(grid.TILE_SAMPLES, 65)
        self.assertEqual(grid.TILE_CELLS * grid.RESOLUTION_M, grid.TILE_KM * 1000)

    def test_origin_sits_on_a_tile_boundary(self) -> None:
        step = grid.TILE_KM * 1000
        self.assertEqual(grid.ORIGIN_X_M % step, 0)
        self.assertEqual(grid.ORIGIN_Y_M % step, 0)

    def test_country_window_is_the_whole_grid(self) -> None:
        west, south, east, north = grid.COUNTRY.bounds_m()
        self.assertEqual(west, grid.ORIGIN_X_M)
        self.assertEqual(south, grid.ORIGIN_Y_M)
        self.assertEqual(east - west, grid.WIDTH_CELLS * grid.RESOLUTION_M)
        self.assertEqual(north - south, grid.HEIGHT_CELLS * grid.RESOLUTION_M)

    def test_window_for_bounds_rounds_outward(self) -> None:
        step = grid.TILE_KM * 1000
        window = grid.window_for_bounds(
            grid.ORIGIN_X_M + 1, grid.ORIGIN_Y_M + 1,
            grid.ORIGIN_X_M + step + 1, grid.ORIGIN_Y_M + step + 1,
        )
        self.assertEqual((window.tx0, window.ty0), (0, 0))
        self.assertEqual((window.tx1, window.ty1), (2, 2))

    def test_row_for_tile_y_flips_the_axis(self) -> None:
        window = grid.TileWindow(0, 0, 4, 4)
        # The northernmost tile is raster row 0; the southernmost is the last.
        self.assertEqual(grid.row_for_tile_y(window, 3), 0)
        self.assertEqual(
            grid.row_for_tile_y(window, 0), 3 * grid.TILE_CELLS
        )


@unittest.skipUnless(HAVE_RASTERIO, "needs rasterio (pipeline/.venv)")
class TestGridCoversChina(unittest.TestCase):
    def test_china_fits_inside_the_frozen_grid(self) -> None:
        lons, lats = densified_ring(grid.CHINA, per_edge=200)
        xs, ys = project(lons, lats)
        west, south, east, north = grid.COUNTRY.bounds_m()
        self.assertGreaterEqual(min(xs), west)
        self.assertLessEqual(max(xs), east)
        self.assertGreaterEqual(min(ys), south)
        self.assertLessEqual(max(ys), north)

    def test_the_grid_is_not_wastefully_larger_than_china(self) -> None:
        """A frozen grid can drift from the country it is meant to cover."""
        lons, lats = densified_ring(grid.CHINA, per_edge=200)
        xs, ys = project(lons, lats)
        step = grid.TILE_KM * 1000
        west, south, east, north = grid.COUNTRY.bounds_m()
        for slack in (min(xs) - west, east - max(xs), min(ys) - south, north - max(ys)):
            self.assertLess(slack, step, "more than one spare tile of margin")

    def test_corridor_is_a_strict_subset_of_the_country_grid(self) -> None:
        from nineskies.mosaic import corridor_window

        window = corridor_window(grid.SEA_TO_SKY)
        self.assertTrue(grid.COUNTRY.contains(window.tx0, window.ty0))
        self.assertLessEqual(window.tx1, grid.TILES_X)
        self.assertLessEqual(window.ty1, grid.TILES_Y)
        self.assertGreater(window.count, 0)

    def test_the_corridor_contains_every_corridor_probe(self) -> None:
        from nineskies import probes
        from nineskies.mosaic import corridor_window

        window = corridor_window(grid.SEA_TO_SKY)
        west, south, east, north = window.bounds_m()
        points: list[tuple[float, float]] = []
        for probe in probes.probes_for("corridor"):
            if hasattr(probe, "waypoints"):
                points.extend(probe.waypoints)
            else:
                points.append((probe.lat, probe.lon))
        self.assertTrue(points)
        xs, ys = project([lon for _, lon in points], [lat for lat, _ in points])
        for (lat, lon), x, y in zip(points, xs, ys):
            self.assertTrue(
                west <= x <= east and south <= y <= north,
                f"{lat} N, {lon} E is outside the corridor window",
            )


@unittest.skipUnless(HAVE_RASTERIO, "needs rasterio (pipeline/.venv)")
class TestProjectionIsEqualArea(unittest.TestCase):
    """The 'honest scale' pillar, tested at cell level.

    If this fails the Heihe-Tengchong split cannot be right either, and the
    GDD's first claim about the world is false in a way no player can see.
    """

    def test_one_degree_cells_keep_their_area_across_the_country(self) -> None:
        for lat in range(20, 52, 4):
            for lon in (75, 105, 133):
                box = grid.LonLatBox(south=lat, north=lat + 1, west=lon, east=lon + 1)
                xs, ys = project(*densified_ring(box))
                projected = shoelace(xs, ys)
                truth = sphere_area(box)
                error = abs(projected - truth) / truth
                self.assertLess(
                    error,
                    0.005,
                    f"{lat} N {lon} E: {projected / 1e6:.1f} km2 projected vs "
                    f"{truth / 1e6:.1f} km2 true ({error:.2%})",
                )


if __name__ == "__main__":
    unittest.main()
