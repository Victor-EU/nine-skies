"""Stage 2's mosaic, where GLO-30 thins its columns (F71).

Until F71 the mosaic declared every tile 3,600 samples wide. North of 50 N a
tile is 2,400, and was read into the western two-thirds of its degree with the
eastern third left at 0 m. These check the rule, the VRT written from it, and
that the one other reader of source tiles reads them the same way.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    import rasterio  # noqa: F401

    HAVE_RASTERIO = True
except ImportError:  # pragma: no cover - a bare interpreter
    HAVE_RASTERIO = False


@unittest.skipUnless(HAVE_RASTERIO, "the mosaic is written for GDAL")
class TestColumns(unittest.TestCase):
    def test_glo30_thins_its_columns_from_50_degrees(self):
        from nineskies import mosaic

        self.assertEqual(mosaic.source_columns(18), 3600)
        self.assertEqual(mosaic.source_columns(49), 3600)
        self.assertEqual(mosaic.source_columns(50), 2400)
        self.assertEqual(mosaic.source_columns(53), 2400)
        self.assertEqual(mosaic.source_columns(60), 1800)
        # South of the equator a tile is named by its south edge too, so the
        # band is read from the edge nearer the equator.
        self.assertEqual(mosaic.source_columns(-50), 3600)
        self.assertEqual(mosaic.source_columns(-51), 2400)

    def test_every_file_in_the_vrt_is_read_one_to_one(self):
        from nineskies import grid, mosaic

        box = grid.LonLatBox(south=50, north=52, west=124, east=126)
        xml = mosaic.vrt_xml([(51, 125, Path("/x/b.tif"))], box)
        self.assertIn("<ComplexSource>", xml)
        self.assertIn('<SrcRect xOff="0" yOff="0" xSize="3600" ySize="3600"/>', xml)
        # Its whole degree: the mosaic's own 3,600 columns, from 125 E.
        self.assertIn('<DstRect xOff="3600" yOff="0" xSize="3600" ySize="3600"/>', xml)
        self.assertNotIn("resampling", xml)

    def test_a_thinned_tile_takes_the_nearest_source_column(self):
        from nineskies import mosaic

        tile = np.broadcast_to(np.arange(2400, dtype=np.uint16), (3600, 2400))
        got = mosaic.stretch_columns(tile)
        self.assertEqual(got.shape, (3600, 3600))
        self.assertEqual(got[0, :6].tolist(), [0, 1, 1, 2, 3, 3])
        self.assertEqual(int(got[0, -1]), 2399)
        same = np.zeros((3600, 3600), dtype=np.uint8)
        self.assertIs(mosaic.stretch_columns(same), same)

    def test_a_thinned_tile_is_stretched_once_and_again_when_its_source_changes(self):
        from rasterio.transform import from_origin

        from nineskies import mosaic

        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp) / "work"
            source = Path(tmp) / "Copernicus_DSM_COG_10_N51_00_E125_00_DEM.tif"
            below = Path(tmp) / "Copernicus_DSM_COG_10_N49_00_E125_00_DEM.tif"
            columns = np.arange(2400, dtype="float32")
            with rasterio.open(
                source, "w", driver="GTiff", width=2400, height=3600, count=1, dtype="float32",
                crs="EPSG:4326", transform=from_origin(125 - 0.75 / 3600, 52 + 0.5 / 3600, 1 / 2400, 1 / 3600),
                compress="deflate",
            ) as dataset:
                dataset.write(np.broadcast_to(columns, (3600, 2400))[None])
            digests = {source.stem: {"sha256": "a" * 64}}
            tiles = [(51, 125, source), (49, 125, below)]
            on, made = mosaic.one_grid(tiles, work, digests, workers=1)
            self.assertEqual(made, 1)
            self.assertEqual(on[1], (49, 125, below))  # a 1" tile is its own file
            with rasterio.open(on[0][2]) as copy:
                self.assertEqual((copy.width, copy.height), (3600, 3600))
                self.assertAlmostEqual(copy.transform.c, 125 - 0.5 / 3600)
                self.assertEqual(copy.read(1, window=((0, 1), (0, 6))).tolist(), [[0, 1, 1, 2, 3, 3]])
            self.assertEqual(mosaic.one_grid(tiles, work, digests, workers=1)[1], 0)
            digests[source.stem]["sha256"] = "b" * 64
            self.assertEqual(mosaic.one_grid(tiles, work, digests, workers=1)[1], 1)

    def test_a_file_that_is_not_the_shape_the_product_publishes_is_named(self):
        from rasterio.transform import from_origin

        from nineskies import mosaic

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "wrong.tif"
            with rasterio.open(
                path, "w", driver="GTiff", width=8, height=8, count=1, dtype="float32",
                crs="EPSG:4326", transform=from_origin(125, 52, 1 / 8, 1 / 8),
            ) as dataset:
                dataset.write(np.zeros((1, 8, 8), dtype="float32"))
            [problem] = mosaic.columns_problems([(51, 125, path)])
        self.assertIn("wrong.tif is 8 x 8", problem)
        self.assertIn("2400 x 3600", problem)


class TestSiting(unittest.TestCase):
    def test_siting_reads_a_thinned_tile_as_the_mosaic_does(self):
        from nineskies import siting

        columns = np.arange(2400, dtype=np.uint16)
        tile = np.broadcast_to(columns, (3600, 2400))
        got = siting.on_arcseconds(tile, 51)
        self.assertEqual(got.shape, (3600, 3600))
        # Each 1" column takes the source column nearest it: 0, 1, 1, 2, 3, 3 ...
        self.assertEqual(got[0, :6].tolist(), [0, 1, 1, 2, 3, 3])
        self.assertEqual(int(got[0, -1]), 2399)

    def test_a_tile_below_50_is_read_unchanged_and_a_wrong_shape_refused(self):
        from nineskies import siting

        tile = np.zeros((3600, 3600), dtype=np.uint8)
        self.assertIs(siting.on_arcseconds(tile, 30), tile)
        with self.assertRaises(ValueError):
            siting.on_arcseconds(tile, 51)


if __name__ == "__main__":
    unittest.main()
