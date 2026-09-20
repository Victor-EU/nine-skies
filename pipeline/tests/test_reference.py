"""The committed projection table against PROJ itself.

The other half of this check lives in `test/route/albers.test.ts`, which
compares the engine's `projectAlbers` to the same committed file without
needing Python or a built world. This half is what makes that file worth
believing: it regenerates the table and fails if the committed copy has
drifted from what PROJ now says.

Between them, on every commit: PROJ verifies the table where PROJ exists, and
the engine is verified against the table where it does not.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    import rasterio  # noqa: F401

    HAVE_RASTERIO = True
except ImportError:  # the suite still runs on a bare interpreter
    HAVE_RASTERIO = False

from nineskies import grid, reference  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]


class ReferenceTableTest(unittest.TestCase):
    def setUp(self) -> None:
        self.committed = reference.read(ROOT)

    def test_committed_table_describes_this_grid(self) -> None:
        """No PROJ needed: the stamp has to match the constants beside it."""
        self.assertEqual(self.committed["version"], reference.REFERENCE_VERSION)
        self.assertEqual(self.committed["proj4"], grid.ALBERS_PROJ4)
        self.assertEqual(self.committed["originXM"], grid.ORIGIN_X_M)
        self.assertEqual(self.committed["originYM"], grid.ORIGIN_Y_M)

    def test_covers_both_standard_parallels_and_the_central_meridian(self) -> None:
        """A table that missed them would pass while testing almost nothing."""
        lats = {p["lat"] for p in self.committed["points"]}
        lons = {p["lon"] for p in self.committed["points"]}
        self.assertLessEqual({25.0, 47.0}, lats)
        self.assertIn(105.0, lons)
        self.assertGreaterEqual(len(self.committed["points"]), 40)

    def test_every_named_anchor_is_in_it(self) -> None:
        from nineskies.tiles import ANCHORS

        names = {p["name"] for p in self.committed["points"]}
        self.assertLessEqual(set(ANCHORS), names)

    @unittest.skipUnless(HAVE_RASTERIO, "needs rasterio for PROJ")
    def test_committed_table_is_what_proj_says_today(self) -> None:
        fresh = {p["name"]: p for p in reference.build()["points"]}
        for point in self.committed["points"]:
            now = fresh[point["name"]]
            for axis in ("eastM", "northM"):
                self.assertAlmostEqual(
                    point[axis],
                    now[axis],
                    delta=0.1,
                    msg=(
                        f"{point['name']} {axis}: committed {point[axis]}, "
                        f"PROJ now says {now[axis]}. Re-cut with `make reference`"
                    ),
                )

    @unittest.skipUnless(HAVE_RASTERIO, "needs rasterio for PROJ")
    def test_rendering_it_again_reproduces_the_file_byte_for_byte(self) -> None:
        """So `make reference` on an unchanged tree leaves no diff behind."""
        path = ROOT / reference.REFERENCE_PATH
        self.assertEqual(reference.render(reference.build()), path.read_text("utf-8"))


if __name__ == "__main__":
    unittest.main()
