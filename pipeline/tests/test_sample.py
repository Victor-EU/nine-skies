"""The sampler's windows, the source read beside a hero grid, and the sills a
monotonic probe's report prints between its waypoints (F58).

Real rasters, written to a temporary directory: what is under test is the
arithmetic between a file and a report -- projections, windows, cell indices
-- and a fake sampler would be a second implementation of exactly that.
Synthetic ground, so every answer is known before it is read.
"""

import math
import sys
import tempfile
import unittest
from pathlib import Path

try:
    import numpy as np
    import rasterio
    from rasterio.crs import CRS
    from affine import Affine

    HAVE_RASTERIO = True
except ImportError:  # pragma: no cover - a bare interpreter
    HAVE_RASTERIO = False

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nineskies import grid, places, probes  # noqa: E402

GORGE = next(p for p in probes.MONOTONIC_PROBES if p.grid == "hero")
CELL_M = 90.0
#: The water falls from here at the upstream waypoint to 50 m less at the
#: downstream one, between walls at 200 m.
TOP_M, FALL_M, WALL_M = 100.0, 50.0, 200.0


def channel_height(x, y, ends, dam_m=None):
    """A straight channel between two projected points, and walls elsewhere."""
    (x0, y0), (x1, y1) = ends
    dx, dy = x1 - x0, y1 - y0
    t = np.clip(((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy), 0.0, 1.0)
    off = np.hypot(x - (x0 + t * dx), y - (y0 + t * dy))
    heights = np.where(off <= 1.5 * CELL_M, TOP_M - FALL_M * t, WALL_M)
    if dam_m is not None:
        heights = np.where((off <= 1.5 * CELL_M) & (np.abs(t - 0.5) < 0.01), dam_m, heights)
    return heights


def projected(points):
    xs, ys = grid.project([lat for lat, _ in points], [lon for _, lon in points])
    return list(zip(xs, ys))


def write_grid(path, dam_m=None, hole=False):
    """A 90 m Albers raster holding both of the gorge probe's waypoints."""
    ends = projected(GORGE.waypoints)
    west = min(x for x, _ in ends) - 5_000.0
    north = max(y for _, y in ends) + 5_000.0
    east = max(x for x, _ in ends) + 5_000.0
    south = min(y for _, y in ends) - 5_000.0
    width = int(math.ceil((east - west) / CELL_M))
    height = int(math.ceil((north - south) / CELL_M))
    xs = west + (np.arange(width) + 0.5) * CELL_M
    ys = north - (np.arange(height) + 0.5) * CELL_M
    heights = channel_height(xs[None, :], ys[:, None], ends, dam_m).astype("float32")
    if hole:
        heights[:, :] = np.nan
    with rasterio.open(
        path, "w", driver="GTiff", height=height, width=width, count=1,
        dtype="float32", crs=CRS.from_proj4(grid.ALBERS_PROJ4),
        transform=Affine(CELL_M, 0.0, west, 0.0, -CELL_M, north),
    ) as ds:
        ds.write(heights, 1)
    return path


def write_source(path, footprint, dam_m=None, nodata_at=None):
    """A 1″ geographic raster of the same ground, reaching past the footprint.

    Past it on purpose: the reach outside the area is a way round a dam the
    area does not have, and the reader must not take it.
    """
    from rasterio.warp import transform as transform_points

    lats = [lat for lat, _ in GORGE.waypoints]
    lons = [lon for _, lon in GORGE.waypoints]
    step = 1.0 / 3600.0
    west, north = min(lons) - 0.1, max(lats) + 0.1
    width = int((max(lons) + 0.1 - west) / step)
    height = int((north - (min(lats) - 0.1)) / step)
    lon_c = west + (np.arange(width) + 0.5) * step
    lat_c = north - (np.arange(height) + 0.5) * step
    lon_g, lat_g = np.meshgrid(lon_c, lat_c)
    x, y = transform_points(
        CRS.from_epsg(4326), CRS.from_proj4(grid.ALBERS_PROJ4),
        lon_g.ravel().tolist(), lat_g.ravel().tolist(),
    )
    x = np.asarray(x).reshape(lon_g.shape)
    y = np.asarray(y).reshape(lon_g.shape)
    heights = channel_height(x, y, projected(GORGE.waypoints), dam_m).astype("float32")
    if nodata_at is not None:
        heights[nodata_at] = -32767.0
    with rasterio.open(
        path, "w", driver="GTiff", height=height, width=width, count=1,
        dtype="float32", crs=CRS.from_epsg(4326), nodata=-32767.0,
        transform=Affine(step, 0.0, west, 0.0, -step, north),
    ) as ds:
        ds.write(heights, 1)
    return path


@unittest.skipUnless(HAVE_RASTERIO, "needs numpy and rasterio")
class TestTheWindow(unittest.TestCase):
    """One definition of the square a channel search reads, and what it reads."""

    @classmethod
    def setUpClass(cls):
        from nineskies.sample import GridSampler

        cls.tmp = tempfile.TemporaryDirectory()
        cls.sampler = GridSampler(write_grid(Path(cls.tmp.name) / "grid.tif"))

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_the_cell_is_the_one_the_channel_search_reads(self):
        for lat, lon in GORGE.waypoints:
            cell = self.sampler.channel_cell(lat, lon, 2.0)
            self.assertEqual(
                float(self.sampler.array.ravel()[cell]), self.sampler.channel_m(lat, lon, 2.0)
            )

    def test_a_2_km_window_on_a_90_m_grid_is_47_cells_a_side(self):
        # ceil(2000 / 90) = 23 cells either side of the waypoint's own. The
        # report used to count this with the 1 km grid's constant and say 25.
        lat, lon = GORGE.waypoints[0]
        self.assertEqual(self.sampler.cells_read([(lat, lon)], 2.0), 47 * 47)
        self.assertEqual(self.sampler.cells_read(GORGE.waypoints, 2.0), 2 * 47 * 47)

    def test_a_cell_read_twice_is_counted_once(self):
        lat, lon = GORGE.waypoints[0]
        self.assertEqual(self.sampler.cells_read([(lat, lon), (lat, lon)], 2.0), 47 * 47)

    def test_the_window_in_metres_is_the_ground_it_reads(self):
        lat, lon = GORGE.waypoints[0]
        west, south, east, north = self.sampler.window_m(lat, lon, 2.0)
        self.assertAlmostEqual(east - west, 47 * CELL_M, places=3)
        self.assertAlmostEqual(north - south, 47 * CELL_M, places=3)
        (x, y), = projected([(lat, lon)])
        self.assertTrue(west < x < east and south < y < north)

    def test_a_cell_centre_comes_back_to_the_same_cell(self):
        cell = self.sampler.channel_cell(*GORGE.waypoints[1], 2.0)
        col, row = self.sampler.to_pixel(*self.sampler.cell_latlon(cell))
        width = self.sampler.array.shape[1]
        self.assertEqual((round(row), round(col)), divmod(cell, width))
        self.assertAlmostEqual(row, round(row), places=6)
        self.assertAlmostEqual(col, round(col), places=6)

    def test_off_the_raster_there_is_no_cell_and_nothing_read(self):
        self.assertIsNone(self.sampler.channel_cell(40.0, 120.0, 2.0))
        self.assertEqual(self.sampler.cells_read([(40.0, 120.0)], 2.0), 0)
        self.assertIsNone(self.sampler.window_m(40.0, 120.0, 2.0))

    def test_a_window_that_reads_nothing_names_no_cell(self):
        # NaN is what `channel_m` returns here, so no cell is what this
        # returns: a sill measured from a cell the check never compared would
        # be a statement about a different check.
        from nineskies.sample import GridSampler

        with tempfile.TemporaryDirectory() as raw:
            empty = GridSampler(write_grid(Path(raw) / "hole.tif", hole=True))
            lat, lon = GORGE.waypoints[0]
            self.assertTrue(math.isnan(empty.channel_m(lat, lon, 2.0)))
            self.assertIsNone(empty.channel_cell(lat, lon, 2.0))


@unittest.skipUnless(HAVE_RASTERIO, "needs numpy and rasterio")
class TestTheSource(unittest.TestCase):
    """The source a hero area was cut from, over that area and no further."""

    @classmethod
    def setUpClass(cls):
        from nineskies.sample import GridSampler, SourceSampler

        cls.tmp = tempfile.TemporaryDirectory()
        tmp = Path(cls.tmp.name)
        cls.grid = GridSampler(write_grid(tmp / "grid.tif"))
        cls.source = SourceSampler(write_source(tmp / "source.tif", cls.grid), cls.grid)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_nothing_outside_the_area_is_ground(self):
        height, width = self.grid.array.shape
        west, north = self.grid.transform @ (0, 0)
        east, south = self.grid.transform @ (width, height)
        ground = ~np.isnan(self.source.array)
        inside = (
            (self.source._x >= west) & (self.source._x <= east)
            & (self.source._y >= south) & (self.source._y <= north)
        )
        self.assertTrue(ground.any())
        self.assertTrue((~inside).any(), "the fixture must reach past the area")
        np.testing.assert_array_equal(ground, inside)

    def test_the_lowest_source_cell_in_a_window_is_on_the_water(self):
        for lat, lon in GORGE.waypoints:
            cell = self.source.lowest_within(*self.grid.window_m(lat, lon, 2.0))
            self.assertLess(float(self.source.array.ravel()[cell]), WALL_M)

    def test_a_box_with_no_source_in_it_has_no_lowest_cell(self):
        self.assertIsNone(self.source.lowest_within(0.0, 0.0, 1.0, 1.0))

    def test_a_cell_centre_is_where_it_says(self):
        cell = self.source.lowest_within(*self.grid.window_m(*GORGE.waypoints[0], 2.0))
        lat, lon = self.source.cell_latlon(cell)
        row, col = divmod(cell, self.source.array.shape[1])
        t = self.source.transform
        self.assertAlmostEqual(lon, t.c + (col + 0.5) * t.a, places=9)
        self.assertAlmostEqual(lat, t.f + (row + 0.5) * t.e, places=9)

    def test_no_data_is_not_ground(self):
        from nineskies.sample import SourceSampler

        with tempfile.TemporaryDirectory() as raw:
            path = write_source(Path(raw) / "gap.tif", self.grid, nodata_at=(slice(None), slice(None)))
            gap = SourceSampler(path, self.grid)
            self.assertTrue(np.isnan(gap.array).all())


@unittest.skipUnless(HAVE_RASTERIO, "needs numpy and rasterio")
class TestTheSillsBetweenWaypoints(unittest.TestCase):
    """What the report prints beside *pass* (F58)."""

    def report(self, grid_dam=None, source_dam=None, with_source=False):
        from nineskies import probe
        from nineskies.sample import GridSampler, SourceSampler

        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            sampler = GridSampler(write_grid(tmp / "grid.tif", dam_m=grid_dam))
            source = (
                SourceSampler(write_source(tmp / "source.tif", sampler, dam_m=source_dam), sampler)
                if with_source
                else None
            )
            failures, lines = probe.run(sampler, "corridor", "hero", source)
            found = probe.reaches(sampler, GORGE, source)
        return failures, "\n".join(lines), found

    def test_a_river_that_falls_has_no_dam_and_says_so_carefully(self):
        failures, report, found = self.report()
        self.assertEqual(failures, [])
        (reach,) = found
        self.assertEqual(reach.sill_m, reach.upstream_m)
        self.assertTrue(reach.at_upstream)
        self.assertIn("no reach between them crosses a sill above its upstream cell", report)
        # A sill level with its start rules a dam out and nothing more.
        self.assertIn("does not by itself make any path run downhill", report)

    def test_a_dam_between_the_waypoints_is_printed_beside_the_pass(self):
        failures, report, found = self.report(grid_dam=150.0)
        # The check still passes: it compares two cells, and they fall.
        self.assertEqual(failures, [])
        (reach,) = found
        self.assertEqual(reach.sill_m, 150.0)
        self.assertGreater(reach.over_m, 45.0)
        self.assertIn("its one reach is dammed on this grid", report)
        verdict = report.index("| pass |")
        self.assertLess(verdict, report.index("dammed on this grid"))
        self.assertLess(report.index("dammed on this grid"), report.index("The channel minimum"))

    def test_the_sill_is_placed_at_the_dam(self):
        _, report, found = self.report(grid_dam=150.0)
        (reach,) = found
        (a, b) = GORGE.waypoints
        middle = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        from nineskies.probe import _km

        self.assertLess(_km(reach.where, middle), 1.0)
        self.assertIn(f"{reach.where[0]:.4f} N, {reach.where[1]:.4f} E", report)

    def test_the_coverage_line_counts_what_the_search_reads(self):
        _, report, _ = self.report()
        self.assertIn(f"reads **{2 * 47 * 47:,} cells of", report)

    def test_the_source_row_says_whose_dam_it_is(self):
        # A dam on the grid alone: the grid's row carries it and the source's
        # does not, which is the difference the rows are there to show.
        _, report, found = self.report(grid_dam=150.0, with_source=True)
        on_grid, on_source = found
        self.assertEqual(on_source.on, "the source, 1″")
        self.assertEqual(on_grid.sill_m, 150.0)
        self.assertTrue(on_source.at_upstream)
        self.assertIn("The source rows ask the same question", report)
        self.assertIn("| 1 → 2 | the source, 1″ |", report)

    def test_a_dam_in_the_source_is_the_source_s(self):
        _, _, found = self.report(grid_dam=150.0, source_dam=120.0, with_source=True)
        on_grid, on_source = found
        self.assertEqual((on_grid.sill_m, on_source.sill_m), (150.0, 120.0))

    def test_a_sill_is_named_by_the_nearest_place(self):
        from nineskies.probe import _nearest

        gorge = places.BY_ID["tiger-leaping-gorge"]
        self.assertTrue(_nearest((gorge.lat, gorge.lon), GORGE, 0).endswith("`tiger-leaping-gorge`"))
        self.assertTrue(_nearest((gorge.lat, gorge.lon), GORGE, 0).startswith("0.0 km"))


if __name__ == "__main__":
    unittest.main()
