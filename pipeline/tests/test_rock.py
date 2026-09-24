"""Stage 12c — the walls' rock (F92). Runs without Poly Haven or the network."""

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
    from nineskies import rock  # noqa: E402


def write_png(path: Path, pixels: "np.ndarray") -> None:
    """(rows, cols, bands) of 0-255 as a PNG, under the name the cache gives a JPEG."""
    import warnings

    from rasterio.io import MemoryFile

    data = np.moveaxis(pixels.astype(np.uint8), -1, 0)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with MemoryFile() as memory:
            with memory.open(driver="PNG", width=data.shape[2], height=data.shape[1], count=data.shape[0], dtype="uint8") as ds:
                ds.write(data)
            path.write_bytes(memory.read())


@unittest.skipUnless(HAVE_NUMPY, "numpy")
class TestTheFaces(unittest.TestCase):
    def test_a_map_shrinks_by_whole_blocks_and_stays_tileable(self):
        image = np.arange(16, dtype=np.float64).reshape(4, 4)
        np.testing.assert_allclose(rock.shrink(image, 2), [[2.5, 4.5], [10.5, 12.5]])
        with self.assertRaises(ValueError):
            rock.shrink(np.zeros((6, 6)), 4)

    def test_height_becomes_its_percentile(self):
        rng = np.random.default_rng(3)
        height = rng.normal(0, 1, (32, 32)) ** 3  # skewed, as a scan's is
        ranked = rock.percentile(height)
        self.assertEqual((ranked.min(), ranked.max()), (0.0, 1.0))
        # So a threshold at 1 - s leaves the share s standing, whatever the scan's heights were.
        for share in (0.1, 0.35, 0.8):
            self.assertAlmostEqual(float((ranked > 1 - share).mean()), share, delta=0.01)
        self.assertTrue(np.array_equal(np.argsort(ranked.ravel()), np.argsort(height.ravel(), kind="stable")))

    def test_every_face_the_palettes_name_is_a_scan(self):
        self.assertEqual([r.name for r in rock.ROCKS], ["limestone", "granite", "dark", "sediment"])
        self.assertEqual(len({r.scan for r in rock.ROCKS}), 4)


@unittest.skipUnless(HAVE_NUMPY and HAVE_RASTERIO, "numpy and rasterio")
class TestTheCut(unittest.TestCase):
    def test_a_face_is_cut_with_its_height_its_normals_and_its_credit(self):
        rng = np.random.default_rng(5)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            face = rock.Rock("granite", "some_scan")
            here = rock.source_dir(root) / face.scan
            here.mkdir(parents=True)
            colour = np.dstack([np.full((16, 16), v) for v in (200, 150, 100)])
            write_png(here / "some_scan_diff_2k.jpg", colour)
            write_png(here / "some_scan_disp_2k.jpg", rng.integers(0, 256, (16, 16, 1)))
            write_png(here / "some_scan_nor_gl_2k.jpg", np.dstack([np.full((16, 16), v) for v in (128, 128, 255)]))
            (here / "info.json").write_text(json.dumps({"name": "Some Scan", "dimensions": [5748.3, 5748.3], "authors": {"B": "All", "A": "Photos"}}))
            world = root / "world"
            (world / "rock").mkdir(parents=True)
            (world / "rock" / "granite-old.webp").write_bytes(b"stale")
            with mock.patch.object(rock, "SAMPLES", 8):
                index = rock.cut(world, (face,), root)

            self.assertEqual((index["source"], index["licence"]), ("Poly Haven", "CC0 1.0"))
            [entry] = index["rocks"]
            self.assertEqual(entry["name"], "granite")
            self.assertEqual(entry["url"], "https://polyhaven.com/a/some_scan")
            self.assertEqual(entry["authors"], ["A", "B"])
            self.assertEqual((entry["acrossM"], entry["samples"]), (5.75, 8))
            np.testing.assert_allclose(entry["meanLinear"], rock.srgb_to_linear(np.array([200, 150, 100]) / 255), atol=1e-3)
            self.assertEqual(json.loads((world / "rock" / "index.json").read_text()), index)
            self.assertEqual(
                sorted(p.name for p in (world / "rock").iterdir()), sorted([entry["albedo"], entry["normal"], "index.json"])
            )

            albedo = rock.read_map(world / "rock" / entry["albedo"])
            self.assertEqual(albedo.shape, (8, 8, 4))
            np.testing.assert_allclose(albedo[..., :3].mean(axis=(0, 1)), [200 / 255, 150 / 255, 100 / 255], atol=0.02)
            # The height as its percentile, kept through the coding.
            self.assertAlmostEqual(float(albedo[..., 3].min()), 0.0, delta=0.01)
            self.assertAlmostEqual(float(albedo[..., 3].max()), 1.0, delta=0.01)
            normal = rock.read_map(world / "rock" / entry["normal"])
            np.testing.assert_allclose(normal[..., :3].mean(axis=(0, 1)), [0.5, 0.5, 1.0], atol=0.02)


if __name__ == "__main__":
    unittest.main()
