"""Stage 12d — the ground's relief below its grid (F93), and near the rails (F94). Runs without the source."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

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
    from nineskies import relief  # noqa: E402
    from nineskies.imagery import Area  # noqa: E402


def plane(rows: int, cols: int, east: float, north: float, cell_m: float) -> "np.ndarray":
    """Heights rising `east` and `north` metres a metre, rows north to south."""
    y = np.arange(rows)[:, None] * cell_m  # metres south of the top row
    x = np.arange(cols)[None, :] * cell_m
    return (x * east - y * north).astype(np.float32)


@unittest.skipUnless(HAVE_NUMPY, "numpy")
class TestTheNormal(unittest.TestCase):
    def test_ground_rising_east_or_north_leans_its_normal_west_or_south(self):
        n = relief.normals(plane(6, 6, 0.5, 0.0, 125.0), 125.0)
        np.testing.assert_allclose(n[0], -0.5 / np.sqrt(1.25), atol=1e-6)
        np.testing.assert_allclose(n[1], 0.0, atol=1e-6)
        n = relief.normals(plane(6, 6, 0.0, 0.25, 30.0), 30.0)
        np.testing.assert_allclose(n[0], 0.0, atol=1e-6)
        np.testing.assert_allclose(n[1], -0.25 / np.sqrt(1.0625), atol=1e-6)
        # One sample in from the padding each way.
        self.assertEqual(n.shape, (2, 4, 4))

    def test_encoding_spends_its_bytes_near_flat(self):
        parts = np.array([[[-0.9, -0.2, -0.01, 0.0, 0.001, 0.05, 0.7]]]).repeat(2, axis=0)
        back = relief.decode(relief.encode(parts))
        # Within half a step of the square root, which is finest where the ground is flattest.
        half = 0.5 / relief.ZERO
        err = np.abs(back - parts)
        self.assertEqual(err[..., 3].max(), 0.0)  # flat is stored flat
        self.assertLess(err[..., 4].max(), 2 * np.sqrt(0.001) * half + half * half)
        self.assertLess(err.max(), 2 * half + half * half)
        self.assertLessEqual(int(relief.encode(parts)[:2].max()), 2 * relief.ZERO)


@unittest.skipUnless(HAVE_NUMPY and HAVE_RASTERIO, "numpy and rasterio")
class TestTheCut(unittest.TestCase):
    def area(self) -> "Area":
        return relief.relief_area(Area(key="1_2", lattice="country", tile_m=64_000, tx0=1, ty0=2, tiles_x=2, tiles_y=1))

    def test_two_tiles_cut_as_one_agree_on_the_samples_they_share(self):
        a = self.area()
        rng = np.random.default_rng(5)
        padded = rng.normal(0, 40, (a.height + 2, a.width + 2)).astype(np.float32)
        parts = relief.normals(padded, a.cell_m)
        west, east = a.split(parts, 1, 2), a.split(parts, 2, 2)
        self.assertEqual(west.shape, (2, 513, 513))
        np.testing.assert_array_equal(west[:, :, -1], east[:, :, 0])

    def test_a_cut_writes_a_lossless_image_a_tile_and_an_index_naming_them(self):
        a = self.area()
        hero = relief.relief_area(Area(key="gorge", lattice="hero", tile_m=11_520, tx0=5, ty0=6, tiles_x=1, tiles_y=2))
        ground = {a.key: plane(a.height + 2, a.width + 2, 0.1, 0.0, a.cell_m), hero.key: plane(hero.height + 2, hero.width + 2, 0.0, 0.3, hero.cell_m)}
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(relief, "heights", lambda area: ground[area.key]):
            out = Path(tmp)
            (out / "files").mkdir()
            (out / "files" / "relief-stale.webp").write_bytes(b"old")
            done = relief.cut([a, hero], out)
            index = json.loads((out / "index.json").read_text())
            self.assertEqual(index["encoding"], relief.ENCODING)
            self.assertEqual(index["grids"]["country"], {"cells": 512, "samples": 513})
            self.assertEqual(sorted(index["country"]), ["1_2", "2_2"])
            self.assertEqual(index["hero"]["gorge"]["window"], {"hx0": 5, "hy0": 6, "hx1": 6, "hy1": 8})
            self.assertEqual(len(index["hero"]["gorge"]["tiles"]), 2)
            self.assertFalse((out / "files" / "relief-stale.webp").exists())
            self.assertEqual(done["tiles"], 2)  # each plane is the same everywhere: one file for its tiles
            name = index["hero"]["gorge"]["tiles"][0]
            with rasterio.open(out / "files" / f"{name}.webp") as ds:
                pixels = ds.read()
            self.assertEqual(pixels.shape, (3, 385, 385))
            np.testing.assert_allclose(relief.decode(pixels)[1], -0.3 / np.sqrt(1.09), atol=0.005)

    def test_near_sub_tiles_are_cut_by_their_country_tile_and_only_those_wanted_written(self):
        near = relief.near_areas([(5, 9), (6, 9), (6, 10), (8, 9)])
        # Sub-tiles 5 and 6 are country tile 1's, 8 is tile 2's.
        self.assertEqual([(a.key, a.tx0, a.ty0, a.tiles_x, a.tiles_y, a.cell_m) for a, _ in near], [("near-1_2", 5, 9, 2, 2, 31.25), ("near-2_2", 8, 9, 1, 1, 31.25)])
        self.assertEqual(near[0][1], {(5, 9), (6, 9), (6, 10)})
        ground = {a.key: plane(a.height + 2, a.width + 2, 0.05, 0.0, a.cell_m) for a, _ in near}
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(relief, "heights", lambda area: ground[area.key]):
            out = Path(tmp)
            done = relief.cut([], out, near)
            index = json.loads((out / "index.json").read_text())
            self.assertEqual(index["grids"]["near"], {"cells": 512, "samples": 513})
            self.assertEqual(index["near"]["tileM"], relief.NEAR_TILE_M)
            self.assertEqual(sorted(index["near"]["tiles"]), ["5_9", "6_10", "6_9", "8_9"])  # not 5_10
            self.assertEqual(done["near"], 4)
            with rasterio.open(out / "files" / f"{index['near']['tiles']['6_10']}.webp") as ds:
                pixels = ds.read()
            self.assertEqual(pixels.shape, (3, 513, 513))
            np.testing.assert_allclose(relief.decode(pixels)[0], -0.05 / np.sqrt(1.0025), atol=0.005)

    def test_the_plan_reads_the_country_tiles_the_packs_list_near_each_camera(self):
        with tempfile.TemporaryDirectory() as tmp:
            packs = Path(tmp) / "index.json"
            packs.write_text(json.dumps({"scenes": [{"relief": [3, 4, 5, 4], "near": [13, 17, 12, 17]}, {"relief": [3, 4], "near": [12, 17]}, {}]}))
            self.assertEqual(relief.country_tiles(packs), [(3, 4), (5, 4)])
            self.assertEqual(relief.near_tiles(packs), [(12, 17), (13, 17)])
            areas = relief.plan(Path(tmp), packs)
            self.assertEqual([(a.key, a.cells, a.cell_m) for a in areas], [("3_4", 512, 125.0), ("5_4", 512, 125.0)])


if __name__ == "__main__":
    unittest.main()
