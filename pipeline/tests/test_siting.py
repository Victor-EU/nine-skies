"""Siting arithmetic, on synthetic ground. Runs without GDAL or any raster.

What is tested here is the half of `siting.py` that decides where a
coordinate goes: how a slope is measured, what a window reduction does at its
edges, and what a block reduction keeps. The 13.9 GB is only the numbers this
arithmetic is run on, and the measurement it produced is recorded in F52.
"""

from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    import numpy as np

    HAVE_NUMPY = True
except ImportError:  # the suite still runs on a bare interpreter
    HAVE_NUMPY = False

from nineskies import grid, hero, places, siting  # noqa: E402


class TestTheCellIsNotSquare(unittest.TestCase):
    def test_a_cell_narrows_with_latitude_and_the_north_south_one_does_not(self):
        ns_south, ew_south = siting.cell_metres(25.0)
        ns_north, ew_north = siting.cell_metres(45.0)
        self.assertAlmostEqual(ns_south, ns_north)
        self.assertGreater(ew_south, ew_north)
        # One arcsecond is about 30 m, which is the whole reason this source
        # is called GLO-30 and the reason a 90 m grid is a 3x reduction.
        self.assertAlmostEqual(ns_south, 30.92, places=2)

    def test_a_slope_is_measured_against_the_cell_it_crosses(self):
        # The same 30 m step is steeper east-west than north-south, because
        # the cell is shorter that way. Measuring both against one number is
        # how a 60 deg face reads as 55.
        ns, ew = siting.cell_metres(31.0)
        self.assertGreater(math.degrees(math.atan(30 / ew)),
                           math.degrees(math.atan(30 / ns)))


@unittest.skipUnless(HAVE_NUMPY, "needs numpy")
class TestSlope(unittest.TestCase):
    def test_a_step_as_wide_as_it_is_tall_is_forty_five_degrees(self):
        heights = np.array([[0.0, 0.0, 0.0], [0.0, 30.0, 30.0], [0.0, 30.0, 30.0]])
        slope = siting.slope_degrees(heights, 30.0, 30.0)
        self.assertAlmostEqual(float(slope.max()), 45.0, places=4)

    def test_it_takes_the_steeper_axis_rather_than_the_average(self):
        # A cliff that falls along one axis is a cliff. A gradient magnitude
        # would read this at 35 deg, which is a hillside.
        heights = np.array([[0.0, 100.0], [0.0, 100.0]])
        slope = siting.slope_degrees(heights, 100.0, 100.0)
        self.assertAlmostEqual(float(slope.max()), 45.0, places=4)

    def test_flat_ground_has_no_slope(self):
        slope = siting.slope_degrees(np.full((8, 8), 314.0), 30.0, 26.0)
        self.assertEqual(float(slope.max()), 0.0)

    def test_the_result_loses_the_last_row_and_column(self):
        # They have no neighbour. Said out loud because a caller that assumes
        # the shapes match indexes one cell off in both directions.
        slope = siting.slope_degrees(np.zeros((9, 7)), 30.0, 26.0)
        self.assertEqual(slope.shape, (8, 6))


@unittest.skipUnless(HAVE_NUMPY, "needs numpy")
class TestWindows(unittest.TestCase):
    def test_a_max_window_reaches_exactly_k_cells(self):
        a = np.zeros((11, 11), "float32")
        a[5, 5] = 100.0
        reached = siting.box_max(a, 2) > 0
        self.assertTrue(reached[3, 3] and reached[7, 7])
        self.assertFalse(reached[2, 5] or reached[5, 8])

    def test_a_min_window_is_the_same_reduction_the_other_way(self):
        a = np.zeros((9, 9), "float32")
        a[4, 4] = -50.0
        self.assertEqual(float(siting.box_min(a, 1)[3, 3]), -50.0)
        self.assertEqual(float(siting.box_min(a, 1)[2, 2]), 0.0)

    def test_a_window_wraps_at_the_edge_of_the_box(self):
        """Which is why every caller masks a margin before reading a maximum
        out of one. A window that straddles the edge has walked round to the
        far side of the box, and the answer would be ground from 200 km away
        rather than ground that is missing."""
        a = np.zeros((9, 9), "float32")
        a[0, 0] = 100.0
        self.assertEqual(float(siting.box_max(a, 1)[8, 8]), 100.0)

    def test_a_share_window_counts_what_is_in_it(self):
        hot = np.zeros((21, 21), "float32")
        hot[9:12, 9:12] = 1.0
        share = siting.box_share(hot, 5)
        self.assertAlmostEqual(float(share[10, 10]), 9 / 121, places=6)

    def test_a_share_window_shrinks_at_the_edge_rather_than_wrapping(self):
        # The opposite convention to the sweep above, and deliberate: a share
        # is a fraction of a fixed window, so a cell near the edge reports a
        # smaller numerator over the same denominator instead of borrowing
        # ground from the far side.
        hot = np.ones((9, 9), "float32")
        self.assertLess(float(siting.box_share(hot, 2)[0, 0]), 1.0)
        self.assertAlmostEqual(float(siting.box_share(hot, 2)[4, 4]), 1.0)


@unittest.skipUnless(HAVE_NUMPY, "needs numpy")
class TestBlockReduce(unittest.TestCase):
    def test_the_lowest_is_what_finds_a_river_and_the_mean_is_not(self):
        """A block wider than the water is mostly not water. This is the same
        fault `probe.channel_tolerance_m` scales for, one stage earlier: 186 m
        of it at 1 km on ground that has not moved (F50)."""
        block = np.full((8, 8), 1000.0)
        block[:, 3] = 100.0  # a one-cell channel
        lo, hi, mean = siting.block_reduce(block, 8)
        self.assertEqual(float(lo[0, 0]), 100.0)
        self.assertEqual(float(hi[0, 0]), 1000.0)
        self.assertGreater(float(mean[0, 0]), 800.0)

    def test_it_drops_the_remainder_rather_than_padding_it(self):
        lo, _, _ = siting.block_reduce(np.zeros((17, 9)), 8)
        self.assertEqual(lo.shape, (2, 1))


@unittest.skipUnless(HAVE_NUMPY, "needs numpy")
class TestDrama(unittest.TestCase):
    def test_flat_ground_reads_as_flat(self):
        d = siting.drama(np.full((64, 64), 12.0), 31.0)
        self.assertEqual(d.relief_m, 0.0)
        self.assertEqual(d.share_45, 0.0)
        self.assertEqual(d.share_60, 0.0)

    def test_a_cliff_field_reads_as_one(self):
        # Alternating columns 200 m apart at a 30 m posting: every cell is a
        # face. This is what Wulingyuan would have to look like in the source
        # for a 90 m grid to draw pillars, and what it does not (F52).
        a = np.zeros((64, 64), "float32")
        a[:, ::2] = 200.0
        d = siting.drama(a, 31.0)
        self.assertGreater(d.share_60, 90.0)

    def test_the_row_it_prints_carries_the_numbers_a_claim_is_held_to(self):
        a = np.zeros((32, 32), "float32")
        a[16:, :] = 500.0
        row = siting.drama(a, 31.0).line("somewhere")
        self.assertIn("somewhere", row)
        self.assertIn("500 m", row)  # the relief, and the highest


class TestTheSampleGrid(unittest.TestCase):
    def test_sample_zero_is_the_corner_of_the_box(self):
        """GLO-30 centres sample (0, 0) on the tile's north-west corner, which
        is why `mosaic.vrt_xml` offsets its mosaic by half a pixel. Half a
        cell is 15 m: nothing to a coordinate and everything to a seam."""
        self.assertEqual(siting.sample_lonlat(0, 0, 31.0, 109.0), (31.0, 109.0))

    def test_an_index_and_a_coordinate_are_inverses(self):
        for lat, lon in ((31.0222, 109.6089), (30.9511, 110.7756)):
            row, col = siting.sample_index(lat, lon, 32, 109)
            back_lat, back_lon = siting.sample_lonlat(row, col, 32, 109)
            self.assertLess(abs(back_lat - lat), 1 / siting.SOURCE_ARCSEC)
            self.assertLess(abs(back_lon - lon), 1 / siting.SOURCE_ARCSEC)


class TestWhatWasSitedWithIt(unittest.TestCase):
    """The three Yangtze gorges are the first coordinates in this repository
    that were measured out rather than written down and then defended (F52).
    What the measurement cannot supply is the three names -- there is no
    gazetteer here -- so what they rest on is their order along the river and
    the length of each narrows, and that much is checkable."""

    def test_the_three_gorges_run_downstream_in_the_order_they_are_named(self):
        # Qutang above Wu above Xiling, going down the Yangtze, which runs
        # east here. If this ever reverses, a name has moved onto the wrong
        # water and the note in `places.py` is describing something else.
        lons = [places.BY_ID[p].lon
                for p in ("qutang-gorge", "wu-gorge", "xiling-gorge")]
        self.assertEqual(lons, sorted(lons))

    def test_all_three_promise_to_be_on_the_water(self):
        for place_id in ("qutang-gorge", "wu-gorge", "xiling-gorge"):
            place = places.BY_ID[place_id]
            self.assertTrue(place.on_channel, place_id)
            self.assertEqual(place.landform, "gorge")

    def test_the_area_is_named_for_what_it_holds(self):
        area = hero.BY_ID["three-gorges"]
        self.assertEqual(
            set(area.holds), {"qutang-gorge", "wu-gorge", "xiling-gorge"}
        )

    def test_a_coordinate_is_quoted_finely_enough_to_mean_a_cell(self):
        # Two decimals is +/-550 m, which on a river is the difference between
        # the water and the bank -- the fault F50 found. Four decimals is 11 m,
        # which is a source cell.
        for place_id in ("qutang-gorge", "wu-gorge", "xiling-gorge"):
            place = places.BY_ID[place_id]
            for value in (place.lat, place.lon):
                self.assertGreaterEqual(
                    len(f"{value}".split(".")[1]), 4,
                    f"{place_id} is quoted too coarsely to name a cell",
                )

    def test_the_area_is_one_rather_than_three(self):
        """The build plan left this open and F51 closed it: the ground reading
        steps by the grids' disagreement wherever hero cover starts or stops,
        so three areas down one reach would be six of those steps instead of
        two. One area costs eleven more tiles, which is 0.37 MB."""
        area = hero.BY_ID["three-gorges"]
        self.assertEqual((area.tiles_x, area.tiles_y), (12, 3))
        self.assertEqual(area.count, 36)


if __name__ == "__main__":
    unittest.main()
