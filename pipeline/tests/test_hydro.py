"""Stage 3's measurement half. Runs without GDAL or any elevation data.

Everything here is a grid small enough to know the answer to by hand, which
is the point: the corridor measurement in `docs/hydro-report.md` is 4.7
million cells and unverifiable by eye, so the arithmetic under it has to be
checked somewhere it can be.
"""

import sys
import unittest
from pathlib import Path

try:
    import numpy as np

    HAVE_NUMPY = True
except ImportError:  # pragma: no cover - a bare interpreter
    HAVE_NUMPY = False

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nineskies import hydro  # noqa: E402


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class TestTheFill(unittest.TestCase):
    def test_a_slope_has_nothing_to_fill(self):
        # Every cell drains west, so the filled surface is the surface.
        heights = np.tile(np.arange(8, dtype="float32"), (6, 1))
        drainage = hydro.flood(heights)
        np.testing.assert_allclose(drainage.filled, heights)
        self.assertEqual(float(hydro.drowning(heights, drainage).max()), 0.0)

    def test_a_pit_fills_to_its_lowest_rim_and_no_further(self):
        # A plateau at 100 with a 2x2 hole at 10, and a spillway at 40 running
        # north from the hole to the edge. Water stands at 40, not at 100: the
        # fill is the lowest way out and not the highest wall.
        heights = np.full((7, 7), 100.0, dtype="float32")
        heights[3:5, 3:5] = 10.0
        heights[0:3, 3] = 40.0
        drainage = hydro.flood(heights)
        depth = hydro.drowning(heights, drainage)
        self.assertAlmostEqual(float(drainage.filled[3, 3]), 40.0, places=4)
        self.assertAlmostEqual(float(depth[3, 3]), 30.0, places=4)
        # The spillway is already at the water level and is not drowned.
        self.assertAlmostEqual(float(depth[2, 3]), 0.0, places=4)
        # And the wall it did not have to climb is untouched.
        self.assertAlmostEqual(float(drainage.filled[3, 6]), 100.0, places=4)

    def test_a_pit_with_a_way_out_is_not_a_pit(self):
        heights = np.full((7, 7), 100.0, dtype="float32")
        heights[3:5, 3:5] = 10.0
        heights[3, 0:4] = 5.0  # a channel to the west edge
        drainage = hydro.flood(heights)
        self.assertLess(float(hydro.drowning(heights, drainage).max()), 1e-5)

    def test_eight_neighbours_is_not_a_detail(self):
        # The only way out of this hole is diagonal. At four neighbours it is
        # a closed basin and at eight it is a channel -- which is two thirds
        # of the difference between 19.5 % and 12.6 % on the real corridor.
        heights = np.full((5, 5), 100.0, dtype="float32")
        heights[2, 2] = 10.0
        heights[1, 1] = 8.0
        heights[0, 0] = 5.0
        drainage = hydro.flood(heights)
        self.assertAlmostEqual(float(hydro.drowning(heights, drainage)[2, 2]), 0.0, places=4)
        # …and it leaves the way it came: down the diagonal.
        self.assertEqual(hydro.downstream(drainage, 2 * 5 + 2), [12, 6, 0])

    def test_the_fill_is_reproducible(self):
        rng = np.random.default_rng(9)
        heights = rng.normal(500, 80, (20, 25)).astype("float32")
        first, second = hydro.flood(heights), hydro.flood(heights)
        np.testing.assert_array_equal(first.filled, second.filled)
        np.testing.assert_array_equal(first.parent, second.parent)
        np.testing.assert_array_equal(first.order, second.order)

    def test_a_flat_is_crossed_as_a_wave_and_not_as_a_scan(self):
        """The tie-break claim in `flood`, stated as an invariant.

        Inside a flat every cell has the same water level, so the tie-break
        draws the channel. Breaking on arrival order makes the flood cross a
        flat breadth-first from where it entered, which means a cell's depth
        in the drainage tree is its Chebyshev distance from the entry. Break
        on cell index instead and the tree becomes a scan, the depths run to
        the hundreds here, and on the corridor the derived Yangtze passes
        Chongqing at 28 km instead of 2 (F56).
        """
        # A flat plateau walled in on three sides with one low cell in the
        # middle of the north edge: the flood can only enter there.
        heights = np.full((11, 11), 50.0, dtype="float32")
        heights[0, :] = 99.0
        heights[:, 0] = 99.0
        heights[:, -1] = 99.0
        heights[-1, :] = 99.0
        heights[0, 5] = 10.0
        drainage = hydro.flood(heights)
        entry = 0 * 11 + 5
        for row in range(1, 10):
            for col in range(1, 10):
                index = row * 11 + col
                # `downstream` includes the cell itself, so its length is one
                # more than the number of hops to the root.
                hops = len(hydro.downstream(drainage, index)) - 1
                chebyshev = max(abs(row - 0), abs(col - 5))
                self.assertEqual(
                    hops, chebyshev,
                    f"cell ({row}, {col}) is {hops} hops from the entry, "
                    f"not the {chebyshev} a breadth-first crossing would give",
                )
        self.assertEqual(int(drainage.parent[entry]), -1)


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class TestTheDrainageTree(unittest.TestCase):
    def test_every_cell_is_accounted_for_exactly_once(self):
        rng = np.random.default_rng(3)
        heights = rng.normal(200, 40, (14, 17)).astype("float32")
        drainage = hydro.flood(heights)
        acc = hydro.accumulate(drainage)
        roots = [i for i in range(drainage.size) if drainage.parent[i] < 0]
        self.assertEqual(sum(int(acc.ravel()[i]) for i in roots), heights.size)
        self.assertEqual(int(acc.min()), 1)

    def test_a_receiver_is_never_higher_than_what_drains_into_it(self):
        rng = np.random.default_rng(11)
        heights = rng.normal(1000, 200, (18, 18)).astype("float32")
        drainage = hydro.flood(heights)
        filled = drainage.filled.ravel()
        for index in range(drainage.size):
            receiver = int(drainage.parent[index])
            if receiver >= 0:
                self.assertLessEqual(filled[receiver], filled[index] + 1e-4)

    def test_downstream_reaches_the_edge(self):
        rng = np.random.default_rng(5)
        heights = rng.normal(700, 150, (12, 12)).astype("float32")
        drainage = hydro.flood(heights)
        path = hydro.downstream(drainage, 6 * 12 + 6)
        self.assertEqual(int(drainage.parent[path[-1]]), -1)
        row, col = divmod(path[-1], 12)
        self.assertTrue(row in (0, 11) or col in (0, 11))

    def test_the_main_stem_of_a_valley_is_its_floor(self):
        # A V running west to east with a gentle fall along it. The largest
        # catchment is the floor, and nothing tells the code that.
        rows, cols = 9, 20
        heights = np.zeros((rows, cols), dtype="float32")
        for row in range(rows):
            for col in range(cols):
                heights[row, col] = 100.0 + abs(row - 4) * 30.0 - col * 2.0
        drainage = hydro.flood(heights)
        stem = hydro.main_stem(drainage, hydro.accumulate(drainage))
        floor = [divmod(int(i), cols)[0] for i in stem]
        self.assertTrue(all(row == 4 for row in floor), floor)
        self.assertGreater(len(stem), cols // 2)


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class TestTheProfile(unittest.TestCase):
    def test_a_descent_has_no_uphill_steps(self):
        # Mouth first, so the series rises as it goes upstream.
        result = hydro.profile_series([0.0, 10.0, 25.0, 40.0], 3.0)
        self.assertEqual(result.uphill_steps, 0)
        self.assertEqual(result.ascent_m, 0.0)
        self.assertEqual(result.net_drop_m, 40.0)
        self.assertEqual(result.cells, 4)

    def test_one_notch_is_one_uphill_step_of_its_own_size(self):
        result = hydro.profile_series([0.0, 10.0, 4.0, 40.0], 3.0)
        self.assertEqual(result.uphill_steps, 1)
        self.assertAlmostEqual(result.ascent_m, 6.0, places=5)
        self.assertAlmostEqual(result.worst_step_m, 6.0, places=5)

    def test_drowning_is_counted_where_it_is_deeper_than_the_arithmetic(self):
        result = hydro.profile_series(
            [0.0, 10.0, 20.0], 2.0, drowning_m=[0.0, 0.001, 14.0]
        )
        self.assertEqual(result.drowned_cells, 1)
        self.assertAlmostEqual(result.deepest_drowning_m, 14.0, places=5)

    def test_a_path_of_one_cell_profiles_to_nothing(self):
        self.assertEqual(hydro.profile_series([12.0], 0.0).uphill_steps, 0)
        self.assertEqual(hydro.profile_series([], 0.0).cells, 0)

    def test_diagonal_steps_are_longer_than_straight_ones(self):
        heights = np.zeros((4, 4), dtype="float32")
        straight = hydro.profile(heights, None, [0, 1, 2], 4)
        diagonal = hydro.profile(heights, None, [0, 5, 10], 4)
        self.assertAlmostEqual(straight.length_km, 2.0, places=6)
        self.assertAlmostEqual(diagonal.length_km, 2 * 2 ** 0.5, places=6)


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class TestTheBasins(unittest.TestCase):
    def test_two_holes_are_two_basins_with_their_own_depths(self):
        heights = np.full((9, 13), 100.0, dtype="float32")
        heights[3:5, 2:4] = 60.0       # four cells, 40 m deep
        heights[3:5, 8:11] = 25.0      # six cells, 75 m deep
        found = hydro.depressions(heights, hydro.flood(heights))
        self.assertEqual(len(found), 2)
        self.assertEqual([b.cells for b in found], [6, 4])
        self.assertAlmostEqual(found[0].deepest_m, 75.0, places=4)
        self.assertAlmostEqual(found[0].floor_m, 25.0, places=4)
        self.assertAlmostEqual(found[1].deepest_m, 40.0, places=4)

    def test_a_basin_split_by_a_diagonal_is_one_basin(self):
        # Two square holes touching at a corner. To water that is one lake,
        # and `depressions` connects on the same eight neighbours the flow
        # does rather than on four.
        heights = np.full((9, 9), 100.0, dtype="float32")
        heights[3:5, 3:5] = 20.0
        heights[5:7, 5:7] = 20.0
        found = hydro.depressions(heights, hydro.flood(heights))
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].cells, 8)

    def test_small_basins_can_be_filtered_out(self):
        heights = np.full((9, 13), 100.0, dtype="float32")
        heights[3:5, 2:4] = 60.0
        heights[6, 9] = 90.0
        self.assertEqual(len(hydro.depressions(heights, hydro.flood(heights))), 2)
        self.assertEqual(
            len(hydro.depressions(heights, hydro.flood(heights), min_cells=2)), 1
        )

    def test_volume_is_mean_depth_over_the_basin(self):
        heights = np.full((9, 9), 100.0, dtype="float32")
        heights[4, 4] = 90.0
        basin = hydro.depressions(heights, hydro.flood(heights))[0]
        self.assertEqual(basin.cells, 1)
        self.assertAlmostEqual(basin.volume_km3, 10.0 * 1e-3, places=9)

    def test_hydrosheds_looked_at_what_was_deeper_and_larger_than_ten(self):
        """Both bounds are strict, as its documentation writes them (F59)."""

        def basin(cells: int, deepest_m: float) -> hydro.Depression:
            return hydro.Depression(cells, deepest_m, deepest_m / 2, 0.0, 0, 0)

        at_1km = [basin(11, 10.5), basin(10, 50.0), basin(500, 10.0), basin(12, 12.0)]
        self.assertEqual(hydro.inspected(at_1km, 1000.0), [at_1km[0], at_1km[3]])
        # The same rule in square kilometres, not in cells: 1,235 cells of 90 m
        # are 10.0035 km² and 1,234 are 9.9954.
        at_90m = [basin(1235, 20.0), basin(1234, 20.0)]
        self.assertEqual(hydro.inspected(at_90m, 90.0), [at_90m[0]])


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class TestTheSill(unittest.TestCase):
    """The lowest crossing between two cells, which is what a probe's pass
    between two waypoints is bounded by (F58)."""

    @staticmethod
    def valley(dam: float | None = None) -> "np.ndarray":
        # A valley running west to east, its floor falling from 50 to 43,
        # between walls at 200. A dam across it at column 4 when asked.
        heights = np.full((5, 9), 200.0)
        heights[2, 1:8] = np.arange(50.0, 43.0, -1.0)
        if dam is not None:
            heights[1:4, 4] = dam
        return heights

    @staticmethod
    def index(heights, row, col):
        return row * heights.shape[1] + col

    def test_a_valley_that_falls_has_its_sill_at_the_start(self):
        heights = self.valley()
        found = hydro.sill(heights, self.index(heights, 2, 1), self.index(heights, 2, 7))
        self.assertEqual(found.level_m, 50.0)
        self.assertEqual(found.at, self.index(heights, 2, 1))

    def test_a_dam_is_the_sill_and_is_where_the_sill_is(self):
        heights = self.valley(dam=80.0)
        found = hydro.sill(heights, self.index(heights, 2, 1), self.index(heights, 2, 7))
        self.assertEqual(found.level_m, 80.0)
        # On the dam, in whichever of its three cells the path went over: a
        # flat-topped sill has more than one place a path can cross it.
        self.assertEqual(found.at % heights.shape[1], 4)

    def test_the_sill_is_the_lowest_way_over_and_not_the_lowest_cell_of_the_dam(self):
        # A notch at 60 in a dam at 80, one row off the valley floor. The way
        # over is through the notch, so the sill is 60 and it is there -- the
        # dam's own lowest cell on the floor row is not what a path crosses.
        heights = self.valley(dam=80.0)
        heights[1, 4] = 60.0
        found = hydro.sill(heights, self.index(heights, 2, 1), self.index(heights, 2, 7))
        self.assertEqual(found.level_m, 60.0)
        self.assertEqual(divmod(found.at, heights.shape[1]), (1, 4))

    def test_the_level_is_the_same_whichever_end_it_is_flooded_from(self):
        heights = self.valley(dam=80.0)
        a, b = self.index(heights, 2, 1), self.index(heights, 2, 7)
        self.assertEqual(hydro.sill(heights, a, b).level_m, hydro.sill(heights, b, a).level_m)

    def test_the_path_is_a_path_and_its_highest_cell_is_the_sill(self):
        heights = self.valley(dam=80.0)
        heights[1, 4] = 60.0
        a, b = self.index(heights, 2, 1), self.index(heights, 2, 7)
        found = hydro.sill(heights, a, b)
        self.assertEqual((found.path[0], found.path[-1]), (a, b))
        width = heights.shape[1]
        for first, second in zip(found.path, found.path[1:]):
            (r1, c1), (r2, c2) = divmod(first, width), divmod(second, width)
            self.assertLessEqual(max(abs(r1 - r2), abs(c1 - c2)), 1)
        self.assertEqual(max(heights.ravel()[list(found.path)]), found.level_m)
        self.assertIn(found.at, found.path)

    def test_it_is_the_minimax_and_not_just_a_path(self):
        # Against the definition, on grids too irregular to reason about by
        # hand: the least level at which the two cells are joined by cells no
        # higher than it, found by trying every level there is.
        from collections import deque

        def joined_at(heights, a, b, level):
            h, w = heights.shape
            flat = heights.ravel()
            if flat[a] > level or flat[b] > level:
                return False
            seen, queue = {a}, deque([a])
            while queue:
                cell = queue.popleft()
                if cell == b:
                    return True
                r, c = divmod(cell, w)
                for dr, dc in hydro.NB8:
                    r2, c2 = r + dr, c + dc
                    other = r2 * w + c2
                    if 0 <= r2 < h and 0 <= c2 < w and other not in seen and flat[other] <= level:
                        seen.add(other)
                        queue.append(other)
            return False

        rng = np.random.default_rng(58)
        for _ in range(40):
            heights = rng.integers(0, 30, size=(7, 8)).astype("float64")
            a, b = (int(i) for i in rng.choice(heights.size, 2, replace=False))
            expected = min(v for v in np.unique(heights) if joined_at(heights, a, b, v))
            self.assertEqual(hydro.sill(heights, a, b).level_m, expected)

    def test_eight_neighbours_here_too(self):
        # A wall at 90 with one diagonal gap. At four neighbours the only way
        # over is the wall; at eight the gap is a way through.
        heights = np.full((4, 4), 90.0)
        heights[0, 0] = heights[1, 1] = heights[2, 2] = heights[3, 3] = 10.0
        found = hydro.sill(heights, 0, 15)
        self.assertEqual(found.level_m, 10.0)

    def test_a_cell_with_no_value_is_a_wall_and_not_a_hole(self):
        # A dam of NaN with a gap at 70. Left to compare, NaN would be crossed
        # at the level the water already stood at, and the sill would read 50.
        heights = self.valley()
        heights[:, 4] = np.nan
        heights[0, 4] = 70.0
        a, b = self.index(heights, 2, 1), self.index(heights, 2, 7)
        self.assertEqual(hydro.sill(heights, a, b).level_m, 200.0)
        heights[1, 4] = 70.0
        self.assertEqual(hydro.sill(heights, a, b).level_m, 70.0)

    def test_nothing_joins_two_cells_across_a_wall_of_nothing(self):
        heights = self.valley()
        heights[:, 4] = np.nan
        self.assertIsNone(hydro.sill(heights, self.index(heights, 2, 1), self.index(heights, 2, 7)))
        self.assertIsNone(hydro.sill(heights, self.index(heights, 2, 4), self.index(heights, 2, 7)))

    def test_a_cell_to_itself_is_its_own_sill(self):
        heights = self.valley()
        found = hydro.sill(heights, 20, 20)
        self.assertEqual((found.level_m, found.at, found.path), (heights.ravel()[20], 20, (20,)))

    def test_several_reaches_at_once_are_each_reach_alone(self):
        heights = self.valley(dam=80.0)
        pairs = [(19, 25), (25, 19), (21, 22)]
        self.assertEqual(
            [s.level_m for s in hydro.sills(heights, pairs)],
            [hydro.sill(heights, a, b).level_m for a, b in pairs],
        )


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class TestTheSeaTrim(unittest.TestCase):
    def test_only_the_leading_run_is_dropped(self):
        # A stem that starts offshore, climbs, and dips below the sea line
        # again inland. The second dip is a lake and must survive.
        heights = np.array([[0.0, 0.5, 4.0, 0.2, 9.0]], dtype="float32")
        kept = hydro.above(heights, [0, 1, 2, 3, 4], level_m=1.0)
        self.assertEqual(kept, [2, 3, 4])

    def test_a_stem_entirely_at_sea_keeps_nothing(self):
        heights = np.zeros((1, 4), dtype="float32")
        self.assertEqual(hydro.above(heights, [0, 1, 2, 3], level_m=1.0), [])


class TestTheChord(unittest.TestCase):
    """The comparison the report is built around, checked without a world."""

    def test_the_chord_is_the_probe_s_own_waypoints(self):
        from nineskies import probes

        self.assertEqual(hydro.CHANNEL_RADIUS_KM, 2.0)
        self.assertEqual(len(probes.MONOTONIC_PROBES[0].waypoints), 7)
        # Measured through the same projection the grid is in. The build plan
        # quotes 3,380 km for this; that is a great-circle figure and this is
        # the projected one, which is the number a grid-counted length can be
        # compared with.
        self.assertAlmostEqual(hydro.chord_km(), 3363.0, delta=5.0)

    def test_the_chord_is_much_shorter_than_the_river(self):
        # 54 % of the Yangtze's published 6,300 km, which is what a shortcut
        # looks like and the whole of why F48 would not densify it.
        self.assertLess(hydro.chord_km() / 6300.0, 0.56)


if __name__ == "__main__":
    unittest.main()
