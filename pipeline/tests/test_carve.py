"""Stage 3's carve, on ground small enough to know the answer to (F61).

Every grid here is a few dozen cells a side with its answer worked out by
hand: a valley sealed by a dam, a lake on a rim, a line drawn a cell off its
valley. The lines are in projected metres on an identity grid, as in
`test_rivers.py`, because what is under test is what the carve does to the
ground and not how a map is projected.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from affine import Affine  # noqa: E402

from nineskies import carve, hydro, rivers  # noqa: E402


def ground(heights: np.ndarray) -> rivers.Grid:
    height, width = heights.shape
    transform = Affine(1000.0, 0.0, 0.0, 0.0, -1000.0, height * 1000.0)
    return rivers.Grid(
        heights=np.asarray(heights, dtype="float32"),
        transform=transform,
        fetched=np.ones(heights.shape, dtype=bool),
    )


def line(g: rivers.Grid, name: str, points: list[tuple[float, float]]) -> rivers.Line:
    """A line through cell centres given as (row, col)."""
    height = g.shape[0]
    return rivers.Line(
        feature=0,
        name=name,
        x=np.array([c * 1000.0 + 500.0 for _, c in points]),
        y=np.array([(height - r) * 1000.0 - 500.0 for r, _ in points]),
    )


def at(g: rivers.Grid, row: int, col: int) -> int:
    return row * g.shape[1] + col


def dammed_valley(dam: float = 300.0) -> np.ndarray:
    """A valley running east down a slope, walled at 1,000 m, dammed at col 12.

    The floor falls 5 m a cell from 200 m at the west edge; the dam is one
    cell thick and stands `dam` metres high across the floor.
    """
    heights = np.full((11, 25), 1000.0, dtype="float32")
    heights[5, :] = 200.0 - 5.0 * np.arange(25)
    heights[5, 12] = dam
    return heights


class TestRuns(unittest.TestCase):
    def test_a_line_drawn_uphill_is_turned_round(self):
        heights = dammed_valley()
        g = ground(heights)
        drawn = line(g, "Up", [(5, 22), (5, 2)])  # mouth first, as NE sometimes has it
        [run] = carve.runs([drawn], g.cells, heights, g.fetched, radius=1)
        self.assertEqual(run.cells[0], at(g, 5, 2))
        self.assertEqual(run.cells[-1], at(g, 5, 22))

    def test_a_line_is_split_where_nobody_measured_the_ground(self):
        heights = dammed_valley()
        g = ground(heights)
        measured = np.ones(heights.shape, dtype=bool)
        measured[:, 10:14] = False
        found = carve.runs([line(g, "V", [(5, 2), (5, 22)])], g.cells, heights, measured, radius=1)
        self.assertEqual(len(found), 2)
        for run in found:
            self.assertTrue(all(measured.ravel()[c] for c in run.cells))


class TestTheValley(unittest.TestCase):
    def test_the_way_down_is_the_floor_and_not_the_line(self):
        """Natural Earth a cell off its valley: the channel is the valley."""
        heights = dammed_valley(dam=100.0)
        g = ground(heights)
        off = line(g, "Off", [(4, 1), (4, 23)])  # one row north of the floor, on the wall
        found = carve.runs([off], g.cells, heights, g.fetched, radius=2)
        made, lost = carve.channels(heights, found, g.fetched, np.zeros(heights.shape, int), radius=2)
        self.assertEqual(lost, [])
        rows = {c // g.shape[1] for c in made[0].cells[1:-1]}
        self.assertEqual(rows, {5})

    def test_inside_a_hollow_the_way_out_starts_at_the_floor(self):
        heights = np.full((9, 9), 500.0, dtype="float32")
        heights[4, :] = 100.0
        heights[3:6, 3:6] = 80.0
        heights[4, 4] = 20.0  # the hollow's floor, off the straight line
        heights[4, 6] = 150.0  # the rim it leaves by
        allowed = np.ones(heights.shape, dtype=bool)
        path = carve.valley(heights, allowed, [4 * 9 + 8], 4 * 9 + 0)
        self.assertIn(4 * 9 + 4, path)
        self.assertEqual(path[-1], 4 * 9 + 8)

    def test_a_valley_does_not_enter_a_lake_its_river_does_not_touch(self):
        heights = dammed_valley(dam=400.0)
        heights[6, 12] = 150.0  # the only way round the dam is through a lake
        lakes = np.zeros(heights.shape, dtype=int)
        lakes[6, 11:14] = 1
        g = ground(heights)
        found = carve.runs([line(g, "V", [(5, 1), (5, 23)])], g.cells, heights, g.fetched, radius=1)
        made, _ = carve.channels(heights, found, g.fetched, lakes, radius=1)
        self.assertFalse(any(lakes.ravel()[c] for c in made[0].cells))

    def test_a_diagonal_step_is_made_four_connected(self):
        heights = np.full((5, 5), 100.0, dtype="float32")
        heights[1, 2] = 50.0
        path = carve.four_connected([1 * 5 + 1, 2 * 5 + 2], heights, np.ones((5, 5), bool))
        self.assertEqual(path, [6, 7, 12])  # (1,2) is lower than (2,1)


class TestTheCarve(unittest.TestCase):
    def cut(self, heights, lakes=None, radius=1, lines=None):
        g = ground(heights)
        lakes = np.zeros(heights.shape, dtype=int) if lakes is None else lakes
        lines = lines or [line(g, "V", [(5, 0), (5, 24)])]
        found = carve.runs(lines, g.cells, heights, g.fetched, radius)
        made, _ = carve.channels(heights, found, g.fetched, lakes, radius)
        floors = carve.lake_floors(lakes, heights, g.fetched)
        return carve.carve(heights, made, lakes, floors), made

    def test_a_dam_is_cut_to_the_floor_above_it_and_no_deeper(self):
        heights = dammed_valley(dam=300.0)
        carved, _ = self.cut(heights)
        # The cell above the dam is at 145; the dam is cut to it.
        self.assertAlmostEqual(float(carved[5, 12]), 145.0, places=3)
        # Below the dam the floor already runs lower and is not touched.
        np.testing.assert_allclose(carved[5, 13:], heights[5, 13:])
        # Nothing but the channel moves.
        moved = np.argwhere(np.abs(carved - heights) > 1e-3)
        self.assertEqual([tuple(m) for m in moved], [(5, 12)])

    def test_the_carve_only_ever_lowers(self):
        rng = np.random.default_rng(5)
        heights = dammed_valley() + rng.normal(0, 20, (11, 25)).astype("float32")
        carved, _ = self.cut(heights, radius=2)
        self.assertTrue((carved <= heights + 1e-4).all())

    def test_a_channel_runs_downhill_its_whole_length(self):
        rng = np.random.default_rng(6)
        heights = dammed_valley() + rng.normal(0, 40, (11, 25)).astype("float32")
        carved, made = self.cut(heights, radius=2)
        profile = carved.ravel()[made[0].cells]
        self.assertTrue((np.diff(profile) <= 1e-4).all())

    def test_a_lake_on_the_river_holds_the_river_at_its_level(self):
        """The river leaves the lake at the lake's floor, not at the ground
        upstream of it, however low that is."""
        heights = dammed_valley(dam=300.0)
        heights[5, 3] = 60.0  # a hollow upstream, lower than the lake
        heights[5, 8:11] = 170.0  # the lake, flat at 170
        lakes = np.zeros(heights.shape, dtype=int)
        lakes[5, 8:11] = 1
        carved, _ = self.cut(heights, lakes=lakes)
        np.testing.assert_allclose(carved[5, 8:11], 170.0)  # not cut to 60
        self.assertAlmostEqual(float(carved[5, 12]), 145.0, places=3)

    def test_where_two_rivers_meet_the_tributary_ends_on_the_river(self):
        heights = dammed_valley(dam=100.0)
        heights[0:5, 16] = 400.0 - 40.0 * np.arange(5)  # a side valley falling south
        g = ground(heights)
        main = line(g, "Main", [(5, 0), (5, 24)])
        side = line(g, "Side", [(0, 16), (4, 16)])
        carved, made = self.cut(heights, lines=[main, side])
        by_name = {ch.run.name: ch for ch in made}
        self.assertIn(by_name["Side"].cells[-1], set(by_name["Main"].cells))


class TestTheRule(unittest.TestCase):
    def pit(self):
        """A hollow no river touches: floor 30, inside a ring whose lowest
        point is 60, on a slope that falls east to the edge."""
        heights = np.tile(np.linspace(100.0, 0.0, 12, dtype="float32"), (9, 1))
        ring = np.zeros(heights.shape, dtype=bool)
        ring[2:7, 2:7] = True
        ring[3:6, 3:6] = False
        heights[ring] = np.maximum(heights[ring], 60.0)
        heights[3:6, 3:6] = 30.0
        return heights

    def test_fill_raises_the_hollow_to_its_rim(self):
        heights = self.pit()
        out = carve.apply_rule(heights, carve.FILL, np.zeros(heights.shape, bool), np.zeros(heights.shape, bool))
        self.assertTrue((out >= heights - 1e-4).all())
        self.assertAlmostEqual(float(out[4, 4]), 60.0, places=3)

    def test_leave_changes_nothing(self):
        heights = self.pit()
        out = carve.apply_rule(heights, carve.LEAVE, np.zeros(heights.shape, bool), np.zeros(heights.shape, bool))
        np.testing.assert_array_equal(out, heights)

    def test_breach_lowers_the_way_out_and_nothing_else(self):
        heights = self.pit()
        out = carve.apply_rule(heights, carve.BREACH, np.zeros(heights.shape, bool), np.zeros(heights.shape, bool))
        self.assertTrue((out <= heights + 1e-4).all())
        self.assertAlmostEqual(float(out[4, 4]), 30.0, places=3)  # the floor stays
        after = hydro.drowning(out, hydro.flood(out))
        self.assertLess(float(after.max()), 1e-3)  # and nothing is closed any more

    def test_a_kept_lake_s_basin_is_left_alone_under_every_rule(self):
        heights = self.pit()
        kept = np.zeros(heights.shape, dtype=bool)
        kept[4, 4] = True
        for rule in carve.RULES:
            out = carve.apply_rule(heights, rule, np.zeros(heights.shape, bool), kept)
            np.testing.assert_allclose(out[3:6, 3:6], heights[3:6, 3:6], err_msg=rule)

    def test_an_unknown_rule_is_refused(self):
        with self.assertRaises(ValueError):
            carve.apply_rule(self.pit(), "drain", np.zeros((9, 12), bool), np.zeros((9, 12), bool))


class TestTheLakes(unittest.TestCase):
    def test_a_lake_in_a_closed_basin_is_kept_and_one_on_a_river_is_not(self):
        heights = np.tile(np.linspace(100.0, 0.0, 12, dtype="float32"), (9, 1))
        heights[1:3, 2:4] = 20.0  # a closed lake
        heights[6, :] = 5.0  # a channel to the edge...
        heights[6, 5:7] = 5.0  # ...through a lake that drains
        lakes = np.zeros(heights.shape, dtype=int)
        lakes[1:3, 2:4] = 1
        lakes[6, 5:7] = 2
        floors = carve.lake_floors(lakes, heights, np.ones(heights.shape, bool))
        kept = carve.closed_lakes(heights, lakes, floors, np.zeros(heights.shape, bool))
        self.assertEqual(kept, [1])

    def test_a_lake_s_floor_is_its_lowest_measured_ground(self):
        heights = np.array([[10.0, 12.0], [11.0, 9.0]], dtype="float32")
        lakes = np.array([[1, 1], [1, 1]])
        measured = np.array([[True, True], [True, False]])
        self.assertEqual(carve.lake_floors(lakes, heights, measured), {1: 10.0})


class TestTheFloodStillFloods(unittest.TestCase):
    def test_outlets_and_preference_leave_the_fill_alone(self):
        rng = np.random.default_rng(12)
        heights = rng.normal(300, 60, (15, 18)).astype("float32")
        prefer = rng.random((15, 18)) < 0.3
        plain = hydro.flood(heights)
        tilted = hydro.flood(heights, prefer=prefer)
        np.testing.assert_array_equal(plain.filled, tilted.filled)

    def test_an_outlet_is_a_way_out(self):
        heights = np.full((7, 7), 100.0, dtype="float32")
        heights[3, 3] = 10.0
        outlets = np.zeros(heights.shape, dtype=bool)
        outlets[3, 3] = True
        self.assertEqual(float(hydro.drowning(heights, hydro.flood(heights, outlets=outlets)).max()), 0.0)

    def test_a_preferred_cell_wins_a_tie(self):
        heights = np.zeros((3, 5), dtype="float32")
        prefer = np.zeros(heights.shape, dtype=bool)
        prefer[1, :] = True
        drainage = hydro.flood(heights, prefer=prefer)
        # The middle row is reached along itself from the west edge.
        self.assertEqual(int(drainage.parent[1 * 5 + 2]), 1 * 5 + 1)


if __name__ == "__main__":
    unittest.main()
