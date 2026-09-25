"""Stage 12 — the ground's colour. Runs without the mosaic or the network."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

try:
    import numpy as np

    HAVE_NUMPY = True
except ImportError:  # pragma: no cover - a bare interpreter
    HAVE_NUMPY = False

try:
    import rasterio  # noqa: F401

    HAVE_RASTERIO = True
except ImportError:  # pragma: no cover - a bare interpreter
    HAVE_RASTERIO = False

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if HAVE_NUMPY:
    from nineskies import grid, imagery  # noqa: E402


@unittest.skipUnless(HAVE_NUMPY, "numpy")
class TestTheGrid(unittest.TestCase):
    def test_web_mercator_pixels(self):
        x, y = imagery.mercator_pixels(np.array([0.0, -180.0]), np.array([0.0, 0.0]), 0)
        self.assertAlmostEqual(x[0], 128.0, places=6)
        self.assertAlmostEqual(y[0], 128.0, places=6)
        self.assertAlmostEqual(x[1], 0.0, places=6)
        # Zoom 10 at 30 N is ~132 m a pixel, which is why the country reads it.
        self.assertAlmostEqual(imagery.mercator_resolution(10) * np.cos(np.radians(30)), 132.4, places=1)

    def test_an_area_shares_its_tiles_edges(self):
        area = imagery.Area("a", "hero", 11_520, 10, 20, 2, 2)
        self.assertEqual((area.width, area.height), (513, 513))
        image = np.arange(3 * 513 * 513, dtype=np.float32).reshape(3, 513, 513)
        sw = area.split(image, 10, 20)
        se = area.split(image, 11, 20)
        nw = area.split(image, 10, 21)
        for tile in (sw, se, nw):
            self.assertEqual(tile.shape, (3, 257, 257))
        # Rows run north to south: the south-west tile is the image's lower left.
        np.testing.assert_array_equal(sw[:, -1, 0], image[:, 512, 0])
        np.testing.assert_array_equal(sw[:, :, -1], se[:, :, 0])
        np.testing.assert_array_equal(nw[:, -1, :], sw[:, 0, :])
        self.assertEqual(area.tiles(), [(10, 20), (11, 20), (10, 21), (11, 21)])

    def test_sample_zero_sits_on_the_north_west_corner(self):
        area = imagery.country_area(3, 4)
        west, _south, _east, north = area.bounds_m()
        x, y = area.transform() @ (0.5, 0.5)
        self.assertAlmostEqual(x, west)
        self.assertAlmostEqual(y, north)
        self.assertEqual(west, grid.ORIGIN_X_M + 3 * 64_000)
        self.assertEqual(area.cell_m, 250.0)

    def test_the_film_colours_what_the_packs_hold(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "index.json"
            path.write_text(json.dumps({"scenes": [{"tiles": [5, 6, 7, 8]}, {"tiles": [7, 8, 1, 2]}]}))
            self.assertEqual(imagery.film_country_tiles(path), [(1, 2), (5, 6), (7, 8)])


@unittest.skipUnless(HAVE_NUMPY, "numpy")
class TestTheClouds(unittest.TestCase):
    def forest(self, h=120, w=120):
        rgb = np.zeros((3, h, w), np.float32)
        rgb[0], rgb[1], rgb[2] = 35, 62, 38
        return rgb

    def test_the_box_mean_is_a_mean(self):
        rng = np.random.default_rng(1)
        a = rng.random((9, 11)).astype(np.float32)
        w = np.ones_like(a)
        got = imagery.box_mean(a, w, 2)
        self.assertEqual(got.shape, a.shape)
        self.assertAlmostEqual(float(got[4, 5]), float(a[2:7, 3:8].mean()), places=5)
        # At the edge the box holds only what is inside.
        self.assertAlmostEqual(float(got[0, 0]), float(a[0:3, 0:3].mean()), places=5)

    def test_a_cloud_in_the_forest_is_found_and_filled(self):
        rgb = self.forest()
        rgb[:, 50:60, 50:60] = 235  # a cloud
        cleaned, hole = imagery.clean_clouds(rgb, None, 45.0)
        self.assertTrue(hole[55, 55])
        self.assertFalse(hole[10, 10])
        filled = imagery.fill(cleaned, hole)
        np.testing.assert_allclose(filled[:, 55, 55], [35, 62, 38], atol=1.0)
        np.testing.assert_array_equal(filled[:, 10, 10], rgb[:, 10, 10])

    def test_snow_among_rock_is_ground(self):
        rgb = np.zeros((3, 120, 120), np.float32)
        rgb[0], rgb[1], rgb[2] = 120, 112, 105  # rock
        rgb[:, 50:60, 50:60] = 240
        _cleaned, hole = imagery.clean_clouds(rgb, None, 45.0)
        self.assertFalse(hole.any())

    def test_a_pale_patch_among_meadows_high_up_is_snow(self):
        rgb = self.forest()
        rgb[:, 50:60, 50:60] = 240
        elevation = np.full((120, 120), 4200.0, np.float32)
        _cleaned, hole = imagery.clean_clouds(rgb, elevation, 45.0)
        self.assertFalse(hole.any())

    def test_a_silty_river_in_the_forest_is_not_cloud(self):
        rgb = self.forest()
        rgb[0, :, 55:65], rgb[1, :, 55:65], rgb[2, :, 55:65] = 150, 130, 105
        _cleaned, hole = imagery.clean_clouds(rgb, None, 45.0)
        self.assertFalse(hole[:, 58].any())

    def test_a_hole_as_big_as_the_image_takes_the_mean(self):
        rgb = self.forest(8, 8)
        hole = np.zeros((8, 8), bool)
        hole[1:, :] = True
        filled = imagery.fill(rgb, hole)
        np.testing.assert_allclose(filled[:, 7, 7], [35, 62, 38], atol=1e-3)


@unittest.skipUnless(HAVE_NUMPY and HAVE_RASTERIO, "numpy and rasterio")
class TestTheSource(unittest.TestCase):
    def test_an_area_reads_every_mosaic_tile_under_it(self):
        area = imagery.country_area(60, 20)
        x0, y0, x1, y1 = imagery.source_tiles(area)
        lons, lats = imagery.boundary_lonlat(area)
        px, py = imagery.mercator_pixels(lons, lats, area.zoom)
        self.assertLessEqual(x0 * 256, px.min())
        self.assertLessEqual(y0 * 256, py.min())
        self.assertGreaterEqual(x1 * 256, px.max())
        self.assertGreaterEqual(y1 * 256, py.max())
        # A 64 km tile at zoom 10 is a few mosaic tiles a side, not dozens.
        self.assertLessEqual((x1 - x0) * (y1 - y0), 25)

    def test_a_tile_encodes_and_decodes(self):
        from rasterio.io import MemoryFile

        tile = np.zeros((3, 257, 257), np.float32)
        tile[1] = 200
        body = imagery.encode(tile)
        self.assertEqual(body[:4], b"RIFF")
        with MemoryFile(body) as memory, memory.open() as ds:
            back = ds.read()
        self.assertEqual(back.shape, (3, 257, 257))
        self.assertLess(abs(int(back[1, 128, 128]) - 200), 4)


@unittest.skipUnless(HAVE_NUMPY, "numpy")
class TestTheFineColour(unittest.TestCase):
    """F91: a hero tile again at 10 m, for the tiles nearest the camera."""

    def test_a_fine_tile_is_10_m_on_the_same_ground(self):
        for lattice, tile_m, samples in (("hero", 11_520, 1153), ("hero-30m", 3_840, 385)):
            area = imagery.Area("a", lattice, tile_m, 10, 20, 3, 2)
            fine = area.fine(11, 21)
            self.assertEqual((fine.width, fine.height), (samples, samples))
            self.assertEqual(fine.cell_m, 10.0)
            self.assertEqual(fine.zoom, imagery.FINE_ZOOM)
            self.assertEqual(fine.key, "a")  # it reads the area's own composite
            # The same ground as the colour tile it refines: its corner sample on the same corner.
            coarse = imagery.Area("a", lattice, tile_m, 11, 21, 1, 1)
            np.testing.assert_allclose(fine.transform() @ (0.5, 0.5), coarse.transform() @ (0.5, 0.5))
            self.assertEqual(fine.bounds_m(), coarse.bounds_m())

    def test_samples_resample_edge_to_edge(self):
        ramp = np.tile(np.linspace(0, 256, 257, dtype=np.float32), (257, 1))[None]
        up = imagery.resample_samples(ramp, 1153, 1153)
        self.assertEqual(up.shape, (1, 1153, 1153))
        np.testing.assert_allclose(up[0, 0, :], np.linspace(0, 256, 1153), atol=1e-3)
        np.testing.assert_allclose(imagery.resample_samples(up, 257, 257), ramp, atol=1e-3)

    def test_a_fine_tile_carries_its_colour_tiles_corrections_and_fill(self):
        from unittest import mock

        area = imagery.Area("a", "hero-30m", 3_840, 10, 20, 1, 1)
        n = imagery.FINE_CELLS["hero-30m"] + 1
        rng = np.random.default_rng(1)
        raw = np.full((3, 257, 257), 80, np.float32)
        final = raw + 20  # the tone leaning at the edge, say
        hole = np.zeros((257, 257), bool)
        hole[100:140, 100:140] = True  # cloud, filled in the colour tile
        final[:, hole] = 150
        detail = 80 + rng.normal(0, 6, (3, n, n)).astype(np.float32)
        with mock.patch.object(imagery, "reproject_area", return_value=(detail, np.ones((n, n), bool))):
            fine = imagery.fine_tile(area, 10, 20, raw, final, hole, "mosaic")
        self.assertEqual(fine.shape, (3, n, n))
        # Away from the fill: its own detail, moved as the colour tile was moved.
        np.testing.assert_allclose(fine[:, 20:60, 20:60], detail[:, 20:60, 20:60] + 20, atol=1e-3)
        # Inside the fill: the colour tile's, since its own 10 m is the cloud.
        self.assertTrue(np.allclose(fine[:, 180:190, 180:190], 150, atol=1e-3))
        # And the two agree in the broad: one level, not the detail's six.
        self.assertLess(abs(float(fine[:, 20:60, 20:60].mean() - final[:, 15:40, 15:40].mean())), 1.0)



@unittest.skipUnless(HAVE_NUMPY, "numpy")
class TestTheNearColour(unittest.TestCase):
    """F95: the country's sub-tiles along the rails, at 10 m."""

    def test_a_country_tiles_near_view_is_its_grid_in_sixteen_sub_tiles(self):
        from rasterio.warp import Resampling

        view, tile = imagery.near_view(5, 9), imagery.country_area(5, 9)
        self.assertEqual(view.bounds_m(), tile.bounds_m())
        self.assertEqual((view.width, view.height, view.cell_m), (257, 257, 250.0))
        np.testing.assert_allclose(view.transform() @ (0.5, 0.5), tile.transform() @ (0.5, 0.5))
        image = np.arange(257 * 257, dtype=np.float32).reshape(1, 257, 257)
        west, east = view.split(image, 21, 38), view.split(image, 22, 38)
        self.assertEqual(west.shape, (1, 65, 65))
        np.testing.assert_array_equal(west[..., -1], east[..., 0])  # neighbours share their edge
        # The sub-tile at 10 m: its own ground, read as the fine hero tiles are.
        fine = view.fine(22, 38)
        self.assertEqual((fine.width, fine.cell_m, fine.zoom, fine.key), (1601, 10.0, imagery.FINE_ZOOM, "near-5_9"))
        self.assertTrue(fine.is_fine)
        self.assertEqual(imagery.resampling_for(fine), Resampling.lanczos)
        self.assertEqual(imagery.resampling_for(view), Resampling.average)
        self.assertEqual(fine.bounds_m()[:2], (grid.ORIGIN_X_M + 22 * 16_000, grid.ORIGIN_Y_M + 38 * 16_000))

    def test_the_packs_sub_tiles_are_grouped_by_country_tile_and_the_mosaics_read_at_10_m(self):
        from unittest import mock

        with tempfile.TemporaryDirectory() as tmp:
            packs = Path(tmp) / "index.json"
            packs.write_text(json.dumps({"scenes": [{"near": [21, 38, 22, 38, 8, 5]}, {"near": [22, 38]}, {}]}))
            groups = imagery.near_groups(packs)
            self.assertEqual([(p.key, w) for p, w in groups], [("2_1", [(8, 5)]), ("5_9", [(21, 38), (22, 38)])])
            with mock.patch.object(imagery, "archive_region", return_value={(2, 1)}):
                mosaic = imagery.near_from_mosaic(packs)
            self.assertEqual([(a.tx0, a.ty0, a.cells) for a in mosaic], [(21, 38, 1600), (22, 38, 1600)])

    def cut(self, source: str, composite=None, medians=("near-5_9",)):
        """A country tile's near cut, its colour and 10 m source stood in for,
        and in the south the archive's `medians` on disk."""
        from unittest import mock

        parent = imagery.country_area(5, 9)
        rng = np.random.default_rng(2)
        raw = np.full((3, 257, 257), 90, np.float32)
        rgb = raw + 10  # the country tile moved off its source, as a cloud fill or the archive would
        hole = np.zeros((257, 257), bool)
        hole[:, :65] = True  # the western sub-tiles' colour filled
        cut = imagery.Cut(raw, rgb, hole, np.ones((257, 257), bool), source)
        detail = 90 + rng.normal(0, 8, (3, 1601, 1601)).astype(np.float32)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        kept = Path(tmp.name) / "composite"
        kept.mkdir()
        for key in medians:
            (kept / f"{key}.tif").write_bytes(b"")
        with (
            mock.patch("nineskies.composite.composite_path", side_effect=lambda key, root=None: kept / f"{key}.tif"),
            mock.patch.object(imagery, "colour_of", return_value=cut),
            mock.patch.object(imagery, "reproject_area", return_value=(detail, np.ones((1601, 1601), bool))),
            mock.patch.object(imagery, "composite_on", side_effect=composite or (lambda area, root=None: None)),
            mock.patch("nineskies.composite.load_tone", return_value=[{"gain": 1.0, "offset": 0.0, "knee": 250.0}] * 3),
        ):
            result = imagery.cut_near(parent, [(20, 36), (22, 38)], Path(tmp.name))
        return result, rgb, Path(tmp.name)

    def test_a_sub_tile_is_its_own_detail_on_its_country_tiles_colour_and_only_those_wanted_are_cut(self):
        result, rgb, out = self.cut("mosaic")
        self.assertEqual(sorted(result["tiles"]), ["20_36", "22_38"])
        self.assertEqual(result["name"], imagery.name_of(imagery.encode(rgb)))  # checked against the one published
        with rasterio.open(out / "files" / f"{result['tiles']['22_38']}.webp") as ds:
            tile = ds.read().astype(np.float32)
        self.assertEqual(tile.shape, (3, 1601, 1601))
        # Its broad tone is the country tile's, its detail its own.
        self.assertLess(abs(float(tile.mean()) - 100.0), 1.0)
        self.assertGreater(float(tile.std()), 5.0)
        # Where the country tile was filled, the country tile alone: the sub-tile at its western edge.
        with rasterio.open(out / "files" / f"{result['tiles']['20_36']}.webp") as ds:
            filled = ds.read().astype(np.float32)
        self.assertLess(float(filled[:, :, :1500].std()), 2.0)

    def test_in_the_south_the_detail_is_the_archives_or_nothing_is_cut(self):
        result, _rgb, _out = self.cut("composite", medians=())
        self.assertEqual((result["tiles"], result["source"]), ({}, "none"))
        asked = []

        def archive(area, root=None):
            asked.append((area.key, area.width))
            if area.key == "near-5_9" and area.tx0 == 22:
                return None  # sub-tile 22_38 lies past the edge of this median's zone
            rng = np.random.default_rng(area.width)
            return 70 + rng.normal(0, 8, (3, area.height, area.width)).astype(np.float32), np.ones((area.height, area.width), bool)

        result, _rgb, out = self.cut("composite", archive, medians=("near-5_9", "near-5_9-32649"))
        self.assertEqual(result["source"], "composite")
        # Each sub-tile's 250 m from every median, then its 10 m from the one that sees most of it.
        self.assertEqual(
            asked,
            [("near-5_9", 65), ("near-5_9-32649", 65), ("near-5_9", 1601), ("near-5_9", 65), ("near-5_9-32649", 65), ("near-5_9-32649", 1601)],
        )
        with rasterio.open(out / "files" / f"{result['tiles']['22_38']}.webp") as ds:
            tile = ds.read().astype(np.float32)
        # The median's tone is its own; the sub-tile's is the country tile's.
        self.assertLess(abs(float(tile.mean()) - 100.0), 1.5)


if __name__ == "__main__":
    unittest.main()
