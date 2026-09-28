"""The sky's cloud maps (D95): a painted picture cut into a map that tiles."""

import sys
import unittest
from pathlib import Path

try:
    import numpy as np

    HAVE_NUMPY = True
except ImportError:  # pragma: no cover - a bare interpreter
    HAVE_NUMPY = False

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if HAVE_NUMPY:
    from nineskies import cloudmaps  # noqa: E402


def field(rows: int, cols: int, seed: int) -> "np.ndarray":
    """Scattered soft heaps on black, like a cumulus map, and not tiling."""
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:rows, 0:cols]
    out = np.zeros((rows, cols))
    for _ in range(40):
        cy, cx, r = rng.uniform(0, rows), rng.uniform(0, cols), rng.uniform(4, 12)
        out = np.maximum(out, np.exp(-((y - cy) ** 2 + (x - cx) ** 2) / (2 * r * r)))
    return out


@unittest.skipUnless(HAVE_NUMPY, "numpy")
class Tileable(unittest.TestCase):
    def test_wraps_across_both_edges(self) -> None:
        grey = field(160, 200, 3)
        tiled = cloudmaps.tileable(grey)
        # Across the wrap, neighbours differ no more than neighbours inside.
        inside = np.abs(np.diff(tiled, axis=1)).mean()
        across = np.abs(tiled[:, 0] - tiled[:, -1]).mean()
        self.assertLess(across, 2.0 * inside)
        inside = np.abs(np.diff(tiled, axis=0)).mean()
        across = np.abs(tiled[0, :] - tiled[-1, :]).mean()
        self.assertLess(across, 2.0 * inside)
        # The raw picture does not wrap, or the test says nothing.
        self.assertGreater(np.abs(grey[:, 0] - grey[:, -1]).mean(), 2.0 * np.abs(np.diff(grey, axis=1)).mean())

    def test_keeps_the_middle_as_painted(self) -> None:
        grey = field(160, 200, 5)
        tiled = cloudmaps.tileable(grey)
        np.testing.assert_allclose(tiled[70:90, 90:110], grey[70:90, 90:110], atol=1e-9)

    def test_levels_stretch_clear_to_zero_and_thick_to_one(self) -> None:
        grey = 0.1 + 0.6 * field(100, 100, 7)
        out = cloudmaps.levels(grey)
        self.assertAlmostEqual(float(out.min()), 0.0)
        self.assertAlmostEqual(float(out.max()), 1.0)


if __name__ == "__main__":
    unittest.main()
