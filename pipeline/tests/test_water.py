"""Where the water is (F72): the sea, the lakes, and the rivers stage 3 carved.

Each rule is checked on ground small enough to know the answer to, and the one
claim the shader leans on -- that an offset interpolated between four samples
is exact along a straight reach -- is checked as arithmetic rather than
believed.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nineskies import carve, grid, water  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_carve import at, dammed_valley, ground, line  # noqa: E402


def straight(x0: float, y0: float, x1: float, y1: float, river: int = 3) -> water.Centreline:
    return water.Centreline("line", river, np.array([x0, x1]), np.array([y0, y1]))


class TestSea(unittest.TestCase):
    def test_a_zero_is_sea_only_where_the_coastline_says_so(self):
        heights = np.array([[0.0, 0.0, 3.0, 0.0]], dtype="float32")
        fetched = np.ones(heights.shape, dtype=bool)
        ocean = np.zeros(heights.shape, dtype=bool)
        land = np.array([[False, True, False, False]])
        got = water.sea(heights, fetched, ocean, land)
        # A zero on land is a zero-metre field; ground above zero at sea is
        # the coast itself, or an island the coastline does not draw.
        self.assertEqual(got.tolist(), [[True, False, False, True]])

    def test_ground_nobody_fetched_is_sea_only_where_the_mirror_has_no_source(self):
        heights = np.zeros((1, 3), dtype="float32")
        fetched = np.array([[False, False, True]])
        ocean = np.array([[True, False, False]])
        land = np.zeros((1, 3), dtype=bool)
        got = water.sea(heights, fetched, ocean, land)
        # The middle sample exists in the mirror and was not fetched: nothing
        # may be concluded about it (F54), so it is not drawn as anything.
        self.assertEqual(got.tolist(), [[True, False, True]])


class TestLakes(unittest.TestCase):
    def outline(self) -> tuple[np.ndarray, np.ndarray]:
        heights = np.full((5, 6), 50.0, dtype="float32")
        heights += np.arange(30, dtype="float32").reshape(5, 6)  # nothing flat outside
        outlines = np.zeros((5, 6), dtype="int32")
        outlines[1:4, 1:5] = 1
        heights[1:4, 1:4] = 10.5  # the water, one value
        heights[1:4, 4] = [11.0, 12.0, 13.0]  # the shore inside the outline
        return heights, outlines

    def test_a_lake_is_its_level_where_its_outline_and_its_ground_agree(self):
        heights, outlines = self.outline()
        fetched = np.ones(heights.shape, dtype=bool)
        got, [lake] = water.lakes(heights, outlines, fetched, ["Test"])
        self.assertEqual(lake.level, 10.5)
        self.assertEqual((lake.samples, lake.at_level, lake.drawn), (12, 9, 9))
        self.assertTrue(got[1:4, 1:4].all())
        self.assertFalse(got[:, 4].any())
        self.assertEqual(int(got.sum()), 9)

    def test_a_sample_at_the_level_by_coincidence_is_not_drawn(self):
        heights, outlines = self.outline()
        heights[0, 0] = 10.5  # outside the outline: never the lake's
        outlines[4, 5] = 1
        heights[4, 5] = 10.5  # inside it, at the level, and alone
        fetched = np.ones(heights.shape, dtype=bool)
        got, [lake] = water.lakes(heights, outlines, fetched, ["Test"])
        self.assertEqual((lake.at_level, lake.drawn), (10, 9))
        self.assertFalse(got[4, 5])
        self.assertFalse(got[0, 0])

    def test_ground_nobody_fetched_is_no_part_of_a_lake(self):
        heights, outlines = self.outline()
        fetched = np.ones(heights.shape, dtype=bool)
        fetched[1, 1:3] = False
        got, [lake] = water.lakes(heights, outlines, fetched, ["Test"])
        self.assertEqual(lake.samples, 10)
        self.assertFalse(got[1, 1:3].any())

    def test_a_lake_wins_where_it_meets_the_sea(self):
        s = np.array([[True, True, False]])
        k = np.array([[False, True, True]])
        self.assertEqual(water.standing(s, k).tolist(), [[water.SEA, water.LAKE, water.LAKE]])


class TestCentrelines(unittest.TestCase):
    def test_the_corner_a_four_connected_step_turns_at_is_dropped(self):
        width = 10
        # East, north, east, north: a staircase.
        path = [(5, 1), (5, 2), (4, 2), (4, 3), (3, 3), (3, 4)]
        cells = [r * width + c for r, c in path]
        self.assertEqual(
            water.eight_connected(cells, width), [(5, 1), (4, 2), (3, 3), (3, 4)]
        )

    def test_a_straight_path_keeps_every_sample(self):
        width = 10
        cells = [5 * width + c for c in range(1, 6)]
        self.assertEqual(water.eight_connected(cells, width), [(5, c) for c in range(1, 6)])

    def test_smoothing_keeps_both_ends_and_a_straight_line_straight(self):
        x = np.array([0.0, 1.0, 2.0, 3.0])
        y = np.array([0.0, 2.0, 4.0, 6.0])
        sx, sy = water.chaikin(x, y)
        self.assertEqual((sx[0], sy[0], sx[-1], sy[-1]), (0.0, 0.0, 3.0, 6.0))
        np.testing.assert_allclose(sy, 2.0 * sx)
        self.assertGreater(len(sx), len(x))

    def test_a_corner_is_cut_by_no_more_than_a_quarter_of_its_arm(self):
        x = np.array([0.0, 4.0, 4.0])
        y = np.array([0.0, 0.0, 4.0])
        sx, sy = water.chaikin(x, y, rounds=1)
        corner = np.hypot(sx - 4.0, sy - 0.0).min()
        self.assertAlmostEqual(corner, 1.0)


class TestOffsets(unittest.TestCase):
    def test_a_sample_beside_a_line_points_away_from_it(self):
        east, north, river = water.offsets([straight(2, 5, 20, 5, river=4)], (12, 24), reach=3)
        # Row 3 is two rows north of the line.
        self.assertAlmostEqual(float(east[3, 10]), 0.0)
        self.assertAlmostEqual(float(north[3, 10]), 2.0)
        self.assertAlmostEqual(float(north[7, 10]), -2.0)
        self.assertEqual(int(river[3, 10]), 4)

    def test_past_the_reach_there_is_no_river(self):
        east, north, river = water.offsets([straight(2, 5, 20, 5)], (12, 24), reach=3)
        self.assertEqual(int(river[1, 10]), water.NO_RIVER)
        self.assertEqual((float(east[1, 10]), float(north[1, 10])), (0.0, 0.0))
        self.assertEqual(int(river[2, 10]), 3)

    def test_beyond_an_end_the_offset_is_from_the_end(self):
        east, north, _ = water.offsets([straight(2, 5, 20, 5)], (12, 24), reach=5)
        self.assertAlmostEqual(float(east[3, 22]), 2.0)
        self.assertAlmostEqual(float(north[3, 22]), 2.0)

    def test_each_sample_takes_the_nearer_river(self):
        lines = [straight(0, 2, 23, 2, river=2), straight(0, 9, 23, 9, river=9)]
        _, north, river = water.offsets(lines, (12, 24), reach=5)
        self.assertEqual(int(river[4, 10]), 2)
        self.assertEqual(int(river[7, 10]), 9)
        self.assertAlmostEqual(float(north[7, 10]), 2.0)

    def test_an_offset_read_between_four_samples_is_exact_along_a_straight_reach(self):
        """What the shader leans on: the offset to a straight line is linear in
        position, so interpolating it between four samples loses nothing. A
        distance would lose up to half a sample in the cell the line crosses."""
        line_ = straight(3.3, 2.1, 30.7, 17.9)
        east, north, _ = water.offsets([line_], (24, 36), reach=6)
        ax, ay = 3.3, 2.1
        dx, dy = 30.7 - 3.3, 17.9 - 2.1
        rng = np.random.default_rng(7)
        worst_offset = worst_distance = 0.0
        for _ in range(200):
            t = rng.uniform(0.2, 0.8)
            side = rng.uniform(-1.2, 1.2)
            length = np.hypot(dx, dy)
            px = ax + t * dx - side * dy / length
            py = ay + t * dy + side * dx / length
            c0, r0 = int(np.floor(px)), int(np.floor(py))
            fx, fy = px - c0, py - r0

            def lerp(a):
                top = a[r0, c0] * (1 - fx) + a[r0, c0 + 1] * fx
                bottom = a[r0 + 1, c0] * (1 - fx) + a[r0 + 1, c0 + 1] * fx
                return top * (1 - fy) + bottom * fy

            got = float(np.hypot(lerp(east), lerp(north)))
            worst_offset = max(worst_offset, abs(got - abs(side)))
            corners = np.hypot(east, north)
            worst_distance = max(worst_distance, abs(float(lerp(corners)) - abs(side)))
        self.assertLess(worst_offset, 1e-4)
        self.assertGreater(worst_distance, 0.2)


class TestLayer(unittest.TestCase):
    def test_offsets_are_bytes_about_128_in_32_metre_steps(self):
        east = np.array([[0.0, 1.0, -1.0, 9.0]], dtype="float32")
        north = np.array([[0.0, 0.5, 0.0, -9.0]], dtype="float32")
        river = np.array([[0, 2, 3, 4]], dtype=np.uint8)
        still = np.array([[1, 0, 2, 0]], dtype=np.uint8)
        got = water.layer(east, north, river, still)
        self.assertEqual(got[0, 0].tolist(), [128, 128, 0, 1])
        # 1,000 m is 31.25 steps; 500 m is 15.6.
        self.assertEqual(got[0, 1].tolist(), [159, 144, 2, 0])
        self.assertEqual(got[0, 2].tolist(), [97, 128, 3, 2])
        # Past the byte's range, which only a sample at the reach can be.
        self.assertEqual(got[0, 3].tolist(), [255, 1, 4, 0])

    def test_the_reach_fits_the_byte(self):
        self.assertLessEqual(water.REACH_M / water.OFFSET_STEP_M, 127)


class TestCut(unittest.TestCase):
    def test_a_tile_of_water_lies_on_the_same_samples_as_its_ground(self):
        from nineskies import tiles

        window = grid.TileWindow(3, 4, 5, 5)
        rows, cols = window.height_samples, window.width_samples
        values = np.arange(rows * cols, dtype="int64").reshape(rows, cols) % 30000
        array = np.stack([values % 251, values % 241, values % 239, values % 233], axis=-1).astype(np.uint8)
        heights = tiles.cut_tiles(values.astype("float32"), window)
        cut = water.cut(array, window)
        self.assertEqual(cut.shape, (2, grid.TILE_SAMPLES, grid.TILE_SAMPLES, 4))
        np.testing.assert_array_equal(cut[..., 0], (heights.astype("int64") % 251).astype(np.uint8))
        np.testing.assert_array_equal(cut[..., 3], (heights.astype("int64") % 233).astype(np.uint8))

    def test_a_tile_with_nothing_to_draw_is_dry(self):
        tile = np.zeros((65, 65, 4), dtype=np.uint8)
        tile[..., :2] = water.OFFSET_ZERO
        self.assertFalse(water.has_water(tile))
        tile[3, 3, 2] = 5
        self.assertTrue(water.has_water(tile))
        tile[3, 3, 2] = 0
        tile[4, 4, 3] = water.LAKE
        self.assertTrue(water.has_water(tile))


class TestChannels(unittest.TestCase):
    def carved(self):
        heights = dammed_valley()
        g = ground(heights)
        drawn = line(g, "Test", [(5, 1), (5, 23)])
        lakes = np.zeros(heights.shape, dtype="int32")
        result = carve.condition(heights, [drawn], lakes, g.fetched, g.cells, rule=carve.LEAVE)
        source = SimpleNamespace(
            lines=[drawn], ground=g, heights=heights, measured=g.fetched, lakes=lakes
        )
        return source, result

    def test_the_channels_found_again_are_the_ones_that_cut_the_grid(self):
        source, result = self.carved()
        made = water.channels_checked(source, result.heights, {"channels": len(result.channels)})
        self.assertEqual([c.cells for c in made], [c.cells for c in result.channels])

    def test_a_grid_cut_by_other_channels_is_refused(self):
        source, result = self.carved()
        with self.assertRaises(SystemExit):
            water.channels_checked(source, result.heights, {"channels": len(result.channels) + 1})
        stray = result.heights.copy()
        stray[2, 3] -= 5.0
        with self.assertRaises(SystemExit):
            water.channels_checked(source, stray, {"channels": len(result.channels)})

    def test_a_channel_becomes_a_line_through_its_own_samples(self):
        source, result = self.carved()
        [channel] = result.channels
        [drawn] = water.centrelines([channel], source.heights.shape[1], lambda feature: 7)
        self.assertEqual(drawn.river, 7)
        self.assertTrue(np.allclose(drawn.y, 5.0))
        cols = [c % source.heights.shape[1] for c in channel.cells]
        self.assertEqual((drawn.x[0], drawn.x[-1]), (float(cols[0]), float(cols[-1])))
        self.assertEqual(at(source.ground, 5, cols[0]), channel.cells[0])


def a_channel(cells, name: str = "Test"):
    return SimpleNamespace(cells=list(cells), run=SimpleNamespace(name=name, feature=0))


class TestSurfaces(unittest.TestCase):
    """A river's own surface, where the grid resolves it wider than its
    channel (F73): the Three Gorges reservoir at 90 m, in miniature."""

    def reservoir(self):
        # Ground at 50 m; a channel along row 4 at 10 m; the reservoir three
        # rows deep at 10 m over columns 2-6, and the channel alone elsewhere.
        heights = np.full((9, 12), 50.0, dtype="float32")
        heights[4, :] = 10.0
        heights[3:6, 2:7] = 10.0
        return heights, a_channel(4 * 12 + c for c in range(12))

    def surface(self, heights, channel, before=None, barred=None, near=None):
        before = heights if before is None else before
        barred = np.zeros(heights.shape, dtype=bool) if barred is None else barred
        near = np.ones(heights.shape, dtype=bool) if near is None else near
        return water.surfaces(heights, before, [channel], barred, near)

    def test_the_grid_resolves_a_reservoir_at_its_channels_level(self):
        heights, channel = self.reservoir()
        mask, owner = self.surface(heights, channel)
        expected = np.zeros(heights.shape, dtype=bool)
        expected[3:6, 2:7] = True
        np.testing.assert_array_equal(mask, expected)
        self.assertTrue((owner[mask] == 1).all())
        self.assertTrue((owner[~mask] == 0).all())

    def test_a_channel_one_sample_wide_is_the_ribbons_to_draw(self):
        heights, channel = self.reservoir()
        mask, _ = self.surface(heights, channel)
        self.assertFalse(mask[4, :2].any())
        self.assertFalse(mask[4, 7:].any())

    def test_it_is_the_exact_level_and_reached_from_the_channel(self):
        heights, channel = self.reservoir()
        heights[3, 4] = 10.5  # half a metre off the level
        heights[1, 9] = 10.0  # at the level, walled off from the channel
        mask, _ = self.surface(heights, channel)
        self.assertFalse(mask[3, 4])
        self.assertFalse(mask[1, 9])
        self.assertTrue(mask[3, 3])

    def test_ground_stage_three_raised_to_the_level_is_not_water(self):
        # The fill leaves a hollow flat at the level of the channel it spills
        # into: on the corridor, 2,294 of 3,447 samples the rule found so.
        heights, channel = self.reservoir()
        before = heights.copy()
        before[5, 2:7] = 4.0
        mask, _ = self.surface(heights, channel, before=before)
        self.assertFalse(mask[5].any())
        self.assertTrue(mask[3, 2:7].all())

    def test_the_sea_and_a_lake_are_other_rules(self):
        heights, channel = self.reservoir()
        barred = np.zeros(heights.shape, dtype=bool)
        barred[3, :] = True
        mask, _ = self.surface(heights, channel, barred=barred)
        self.assertFalse(mask[3].any())
        self.assertTrue(mask[5, 2:7].all())

    def test_a_surface_goes_no_farther_than_the_offsets_do(self):
        heights, channel = self.reservoir()
        near = np.zeros(heights.shape, dtype=bool)
        near[4:6, :] = True
        mask, _ = self.surface(heights, channel, near=near)
        self.assertFalse(mask[3].any())
        self.assertTrue(mask[5, 2:7].all())

    def test_the_sea_and_a_lake_win_where_they_meet_a_surface(self):
        sea_ = np.array([[True, False, False]])
        lake = np.array([[False, True, False]])
        surface = np.ones((1, 3), dtype=bool)
        self.assertEqual(water.standing(sea_, lake, surface).tolist(), [[water.SEA, water.LAKE, water.RIVER]])
        self.assertEqual(water.standing(sea_, lake).tolist(), [[water.SEA, water.LAKE, water.LAND]])


class TestWhatARibbonIsDrawnOn(unittest.TestCase):
    def test_the_ground_beside_a_channel_is_measured_against_its_water(self):
        # A valley along column 2, its floor falling north to south.
        heights = np.array([[30, 20, 12, 20, 30], [30, 20, 11, 20, 30], [30, 20, 10, 20, 30]], dtype="float32")
        channel = a_channel([2, 7, 12])
        near = np.ones(heights.shape, dtype=bool)
        levels = water.channel_levels(heights, [channel], near)
        np.testing.assert_array_equal(levels[:, 0], [12.0, 11.0, 10.0])
        distance = np.abs(np.arange(5) - 2)[None, :].repeat(3, axis=0) * 90.0
        rows = water.ground_above(heights - levels, distance, near, (45.0, 90.0, 180.0))
        self.assertEqual([r["samples"] for r in rows], [3, 9, 15])
        self.assertEqual([r["maxM"] for r in rows], [0.0, 10.0, 20.0])
        self.assertEqual([r["wall"] for r in rows], [0, 0, 0])

    def test_past_the_reach_nothing_is_measured(self):
        heights = np.zeros((1, 3), dtype="float32")
        levels = water.channel_levels(heights, [a_channel([0])], np.array([[True, True, False]]))
        self.assertTrue(np.isnan(levels[0, 2]))


class TestAGridsWater(unittest.TestCase):
    """`grid_water`, which the country build and the hero cut both call."""

    def test_a_carved_valley_draws_its_river_and_the_surface_it_resolves(self):
        heights = dammed_valley()
        heights[4:7, 3:9] = heights[5, 3]  # a pool the river runs through
        g = ground(heights)
        drawn = line(g, "Test", [(5, 1), (5, 23)])
        lakes = np.zeros(heights.shape, dtype="int32")
        result = carve.condition(heights, [drawn], lakes, g.fetched, g.cells, rule=carve.LEAVE)
        none = np.zeros(heights.shape, dtype=bool)
        made = water.grid_water(
            result.heights, heights, g.transform, g.fetched, none, none, lakes, [],
            result.channels, lambda feature: 5, above_at=(500.0,),
        )
        self.assertEqual(made.data.shape, heights.shape + (water.CHANNELS,))
        self.assertTrue((made.data[..., 2] == 5).any())
        surface = made.data[..., 3] == water.RIVER
        pool = np.zeros(heights.shape, dtype=bool)
        pool[4:7, 3:9] = True
        on_channel = np.zeros(heights.size, dtype=bool)
        on_channel[result.channels[0].cells] = True
        # Every sample of the pool off the channel, and nothing outside it.
        self.assertTrue(surface[pool & ~on_channel.reshape(heights.shape)].all())
        self.assertFalse(surface[~pool].any())
        self.assertEqual(made.result["channels"], 1)
        self.assertGreater(made.result["surface"], 0)
        self.assertEqual(made.result["pieces"][0]["river"], "Test")
        self.assertEqual(made.result["aboveWater"][0]["maxM"], 0.0)

    def test_what_a_water_file_says_of_itself(self):
        tiles_ = np.zeros((2, 3, 3, water.CHANNELS), dtype=np.uint8)
        tiles_[1, 1, 1, 3] = water.RIVER
        entry = water.entry_for(tiles_, 3, "h" * 64, extra=1)
        self.assertEqual(entry["classes"], {"land": 0, "sea": 1, "lake": 2, "river": 3})
        self.assertEqual((entry["tiles"], entry["tilesWithWater"]), (2, 1))
        self.assertEqual(entry["bytes"], tiles_.nbytes)
        self.assertEqual(entry["heightsSha256"], "h" * 64)
        self.assertEqual(entry["extra"], 1)


if __name__ == "__main__":
    unittest.main()
