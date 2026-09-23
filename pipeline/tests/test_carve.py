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

try:  # the suite still runs where PROJ is not installed
    import rasterio  # noqa: F401

    HAVE_RASTERIO = True
except ImportError:  # pragma: no cover - a bare interpreter
    HAVE_RASTERIO = False


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

    def test_of_several_ways_in_the_flood_settles_the_lowest(self):
        # Two cells to start from, one of them lower: the flood reaches both
        # and the way back is from the lower. This is what picks a river's own
        # crossing of an edge out of the cells near a line's (F63).
        heights = np.full((5, 9), 500.0, dtype="float32")
        heights[2, :] = 100.0
        heights[1, 8], heights[2, 8] = 400.0, 300.0
        allowed = np.ones(heights.shape, dtype=bool)
        path = carve.valley(heights, allowed, [2 * 9 + 0], [1 * 9 + 8, 2 * 9 + 8])
        self.assertEqual(path[0], 2 * 9 + 8)

    def test_a_way_in_over_a_ridge_loses_to_one_the_river_reaches(self):
        """The rule that keeps a low cell on the edge from becoming a trench.

        A notch on the same edge stands lower than the river's own crossing
        and is walled off from it. Taken as the way in, everything downstream
        of it would be cut to its floor; reached only over the wall, it is
        settled long after the river's own way in.
        """
        heights = np.full((11, 15), 1000.0, dtype="float32")
        heights[5, :] = 300.0 - 5.0 * np.arange(15)  # the valley, west to east
        heights[1, 0] = 100.0  # a notch on the west edge, lower and walled off
        allowed = np.ones(heights.shape, dtype=bool)
        path = carve.valley(heights, allowed, [5 * 15 + 14], [1 * 15 + 0, 5 * 15 + 0])
        self.assertEqual(path[0], 5 * 15 + 0)

    def test_a_diagonal_step_is_made_four_connected(self):
        heights = np.full((5, 5), 100.0, dtype="float32")
        heights[1, 2] = 50.0
        path = carve.four_connected([1 * 5 + 1, 2 * 5 + 2], heights, np.ones((5, 5), bool))
        self.assertEqual(path, [6, 7, 12])  # (1,2) is lower than (2,1)


def crossing_valley() -> np.ndarray:
    """A valley crossing the grid from the west edge to the east, walled at
    1,000 m, its floor falling 5 m a cell and stepping one row north every
    four — so it meets each edge several rows from where a line a couple of
    cells off it does, which is the hero areas' own geometry (F63)."""
    heights = np.full((13, 25), 1000.0, dtype="float32")
    for col in range(25):
        heights[10 - col // 4, col] = 300.0 - 5.0 * col
    return heights


class TestWhereALineLeavesTheGrid(unittest.TestCase):
    """The ends of a channel whose line runs off the edge (F63).

    A line drawn at 1:10 million crosses an edge where it happens to, which
    on a 90 m hero area was 2.4 km from the Jinsha and 300 m up its wall. The
    river's own crossing is the ground's answer to the same question.
    """

    def channel(self, heights, points, radius=4):
        g = ground(heights)
        drawn = line(g, "V", points)
        found = carve.runs([drawn], g.cells, heights, g.fetched, radius)
        made, lost = carve.channels(heights, found, g.fetched,
                                    np.zeros(heights.shape, dtype=int), radius)
        self.assertEqual(lost, [])
        return made[0], drawn, g

    def test_an_end_on_the_edge_is_the_river_s_own_crossing(self):
        heights = crossing_valley()
        made, _, g = self.channel(heights, [(6, 0), (8, 24)])
        self.assertEqual(made.cells[0], at(g, 10, 0))  # the line crosses at row 6
        self.assertEqual(made.cells[-1], at(g, 4, 24))  # ...and at row 8
        self.assertNotEqual(made.cells[0], made.run.cells[0])
        # ...and the whole floor between them is the channel.
        on_floor = {(10 - col // 4) * 25 + col for col in range(25)}
        self.assertTrue(on_floor <= set(made.cells))

    def test_an_end_the_line_keeps_inside_the_grid_is_still_the_line_s(self):
        # Nothing about the corridor moves: its lines stop where the source
        # stops, which is never on the grid's edge (F63).
        heights = crossing_valley()
        made, drawn, g = self.channel(heights, [(6, 1), (8, 23)])
        self.assertEqual(made.cells[0], made.run.cells[0])
        self.assertEqual(made.cells[0], at(g, 6, 1))

    def test_the_channel_is_cut_to_the_edge_it_leaves_by(self):
        """The last cells of a river rising to the edge are cut, rather than
        left as a pit for the rule to fill."""
        heights = crossing_valley()
        heights[4, 24] = 255.0  # the floor rises 70 m in its last cell
        made, _, g = self.channel(heights, [(6, 0), (8, 24)])
        carved = carve.carve(heights, [made], np.zeros(heights.shape, dtype=int), {})
        upstream = float(heights[5, 23])  # the lowest ground above the rise
        self.assertEqual(made.cells[-1], at(g, 4, 24))
        self.assertAlmostEqual(float(carved[4, 24]), upstream, places=3)


class TestOneWorldOneRule(unittest.TestCase):
    """What stops a hero area being carved one way and the grid around it
    another, which nothing else would say (F63)."""

    RECORD = {"rule": carve.FILL, "radiusCells": 5, "vectors": {"ne-rivers": "aa", "ne-lakes": "bb"}}

    def test_the_same_rule_and_the_same_files_agree(self):
        self.assertIsNone(carve.differs(self.RECORD, carve.FILL, self.RECORD["vectors"]))

    def test_another_rule_is_named(self):
        said = carve.differs(self.RECORD, carve.BREACH, self.RECORD["vectors"])
        self.assertIn(carve.FILL, said or "")
        self.assertIn(carve.BREACH, said or "")

    def test_other_vectors_are_named(self):
        self.assertIsNotNone(carve.differs(self.RECORD, carve.FILL, {"ne-rivers": "cc"}))

    def test_the_band_is_not_compared_because_it_is_in_cells(self):
        # 5 on the country grid, 56 on a hero area: the same 5 km.
        record = {**self.RECORD, "radiusCells": carve.radius_cells(90.0)}
        self.assertIsNone(carve.differs(record, carve.FILL, self.RECORD["vectors"]))


class TestTheNamedSinks(unittest.TestCase):
    """The short list of basins that are closed in life, which no map this
    stage reads says so about (D65, F64)."""

    def bowl(self, inner: float | None = None) -> np.ndarray:
        """A ring at 60 m round a floor of 30 m, on ground falling east to the
        map edge. The lowest cell is 10 m at the bowl's west end, so it is not
        the cell a coordinate in the middle of the bowl lands on. With `inner`,
        one cell of the floor is that much lower again."""
        heights = np.tile(np.linspace(100.0, 0.0, 14, dtype="float32"), (9, 1))
        ring = np.zeros(heights.shape, dtype=bool)
        ring[2:7, 2:9] = True
        ring[3:6, 3:8] = False
        heights[ring] = np.maximum(heights[ring], 60.0)
        heights[3:6, 3:8] = 30.0
        heights[4, 3] = 10.0
        if inner is not None:
            heights[4, 7] = inner
        return heights

    def kept(self, heights, row=4, col=6):
        g = ground(heights)
        return carve.kept_sinks(
            heights, np.zeros(heights.shape, dtype=bool), {"turpan": at(g, row, col)}
        )["turpan"]

    def test_a_sink_is_marked_at_its_basin_s_floor_and_not_at_its_own_cell(self):
        heights = self.bowl()
        g = ground(heights)
        sink = self.kept(heights)
        self.assertEqual(sink.cell, at(g, 4, 6))
        self.assertEqual(sink.floor, at(g, 4, 3))  # 10 m, three cells west
        self.assertAlmostEqual(sink.floor_m, 10.0, places=3)
        self.assertAlmostEqual(sink.deepest_m, 50.0, places=3)  # to a rim at 60
        self.assertEqual(sink.cells, 15)

    def test_the_basin_it_names_is_left_alone_and_the_rule_still_has_the_rest(self):
        heights = self.bowl()
        outlets = np.zeros(heights.shape, dtype=bool)
        empty = np.zeros(heights.shape, dtype=int)
        filled = carve.apply_rule(heights, carve.FILL, outlets, np.zeros(heights.shape, bool))
        self.assertAlmostEqual(float(filled[4, 3]), 60.0, places=3)  # raised to the rim

        mask = carve.kept_mask(empty, [], ~outlets, {"turpan": self.kept(heights)})
        out = carve.apply_rule(heights, carve.FILL, outlets, mask)
        np.testing.assert_allclose(out[3:6, 3:8], heights[3:6, 3:8])
        self.assertAlmostEqual(float(out[4, 3]), 10.0, places=3)

    def test_every_rule_leaves_a_named_sink_alone(self):
        heights = self.bowl()
        outlets = np.zeros(heights.shape, dtype=bool)
        mask = carve.kept_mask(
            np.zeros(heights.shape, dtype=int), [], ~outlets, {"turpan": self.kept(heights)}
        )
        for rule in carve.RULES:
            out = carve.apply_rule(heights, rule, outlets, mask)
            np.testing.assert_allclose(out[3:6, 3:8], heights[3:6, 3:8], err_msg=rule)

    def test_a_hollow_inside_a_kept_basin_is_filled_to_its_own_rim(self):
        # The entry says the basin has no outlet, not that nothing inside it
        # was ever mis-measured: a 20 m hollow in a floor of 30 is the same
        # artefact of a 1 km cell inside an endorheic basin as outside one.
        heights = self.bowl(inner=20.0)
        outlets = np.zeros(heights.shape, dtype=bool)
        sink = self.kept(heights)
        self.assertEqual(sink.floor, at(ground(heights), 4, 3))  # still the 10 m cell
        mask = carve.kept_mask(np.zeros(heights.shape, dtype=int), [], ~outlets, {"t": sink})
        out = carve.apply_rule(heights, carve.FILL, outlets, mask)
        self.assertAlmostEqual(float(out[4, 3]), 10.0, places=3)
        self.assertAlmostEqual(float(out[4, 7]), 30.0, places=3)  # its own rim, not 60

    def test_a_sink_in_no_closed_basin_here_keeps_nothing(self):
        heights = self.bowl()
        sink = self.kept(heights, row=0, col=13)  # on the open slope, off the bowl
        self.assertIsNone(sink.floor)
        mask = carve.kept_mask(
            np.zeros(heights.shape, dtype=int), [], np.ones(heights.shape, bool), {"t": sink}
        )
        self.assertFalse(mask.any())

    def test_the_digest_names_only_the_sinks_a_grid_kept(self):
        # The corridor's digest is what it was before the list existed, which
        # is why no section had to be signed again (F64).
        plain = carve.inputs(carve.RULE, carve.RADIUS_CELLS)
        self.assertNotIn("sinks", plain)
        missed = carve.inputs(
            carve.RULE, carve.RADIUS_CELLS, {"turpan": carve.Kept("turpan", 7, None)}
        )
        self.assertEqual(missed["sha256"], plain["sha256"])
        applied = carve.inputs(
            carve.RULE, carve.RADIUS_CELLS, {"turpan": carve.Kept("turpan", 7, 7)}
        )
        self.assertEqual(applied["sinks"], ["turpan"])
        self.assertNotEqual(applied["sha256"], plain["sha256"])

    def test_the_list_names_places_rather_than_coordinates(self):
        from nineskies import places

        for sink in carve.SINKS:
            self.assertIn(sink.place, places.BY_ID, sink.place)
            self.assertGreater(len(sink.source), 40, sink.place)

    @unittest.skipUnless(HAVE_RASTERIO, "needs rasterio for the projection")
    def test_only_the_entries_on_a_grid_cost_it_anything(self):
        from nineskies import grid as albers
        from nineskies import places

        place = places.BY_ID[carve.SINKS[0].place]
        (x,), (y,) = albers.project([place.lat], [place.lon])
        over = rivers.Grid(
            heights=np.zeros((9, 9), dtype="float32"),
            transform=Affine(1000.0, 0.0, x - 4500.0, 0.0, -1000.0, y + 4500.0),
            fetched=np.ones((9, 9), dtype=bool),
        )
        self.assertEqual(carve.sink_cells(over.cells), {place.id: at(over, 4, 4)})
        away = rivers.Grid(
            heights=over.heights,
            transform=Affine(1000.0, 0.0, x + 1e6, 0.0, -1000.0, y + 1e6),
            fetched=over.fetched,
        )
        self.assertEqual(carve.sink_cells(away.cells), {})


class TestTheBand(unittest.TestCase):
    def test_the_band_is_a_distance_and_not_a_count_of_cells(self):
        # 5 km, measured on the 1 km grid (F61) and applied to a 90 m one by
        # looking as far in more cells (F63).
        self.assertEqual(carve.RADIUS_M, 5000.0)
        self.assertEqual(carve.radius_cells(1000.0), carve.RADIUS_CELLS)
        self.assertEqual(carve.RADIUS_CELLS, 5)
        self.assertEqual(carve.radius_cells(90.0), 56)


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
