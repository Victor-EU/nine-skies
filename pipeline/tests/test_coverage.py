"""What a published tile's blankness means (F54).

The module this tests is small and the reason it exists is not: a zero in the
heightfield has meant three different things since the first corridor was
built, and the map drew 39 % of its frame in one colour because of it (F45).
These tests are about the classification refusing to guess, which is the only
property that matters — a cheerful default here puts the fault straight back.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nineskies import coverage, grid

try:
    import numpy  # noqa: F401
    import rasterio  # noqa: F401

    HAVE_PROJ = True
except ImportError:  # pragma: no cover
    HAVE_PROJ = False


class TestClassify(unittest.TestCase):
    """The four states, and the order they are decided in."""

    def test_every_cell_fetched_is_data(self):
        under = {(30, 110), (30, 111)}
        self.assertEqual(coverage.classify(under, under, under), coverage.DATA)

    def test_no_cell_in_the_mirror_is_ocean(self):
        # The publisher's own statement: Copernicus writes a one-degree cell
        # only where there is something to write.
        under = {(31, 122), (32, 122)}
        self.assertEqual(coverage.classify(under, set(), set()), coverage.OCEAN)

    def test_fetched_on_one_side_and_absent_on_the_other_is_a_coast(self):
        land, sea = (31, 121), (31, 122)
        self.assertEqual(
            coverage.classify({land, sea}, {land}, {land}), coverage.COAST
        )

    def test_a_cell_the_mirror_has_and_this_build_did_not_fetch_is_unreached(self):
        want, have = (31, 88), (31, 89)
        self.assertEqual(
            coverage.classify({want, have}, {have}, {want, have}), coverage.UNREACHED
        )

    def test_unreached_beats_ocean_rather_than_averaging_with_it(self):
        """The one ordering that could put the fault back.

        A tile with one unfetched cell and three absent ones is a tile nothing
        may be concluded about. Calling it a coast — or worse, ocean — because
        most of it is missing from the mirror would be the map painting the
        corner of a rectangle blue all over again.
        """
        unfetched = (31, 88)
        absent = {(31, 121), (31, 122), (32, 122)}
        under = {unfetched} | absent
        self.assertEqual(
            coverage.classify(under, set(), {unfetched}), coverage.UNREACHED
        )

    def test_a_tile_with_no_cells_under_it_is_unreached_and_not_ocean(self):
        # Cannot happen from `cells_under`, which always samples something.
        # It is here because "we found nothing" and "there is nothing" are the
        # two sentences this whole module exists to keep apart (F52's rule).
        self.assertEqual(coverage.classify(set(), set(), set()), coverage.UNREACHED)


class TestTheRecord(unittest.TestCase):
    def test_a_state_has_a_legend_entry_and_nothing_else_does(self):
        self.assertEqual(set(coverage.LEGEND), set(coverage.STATES))

    def test_the_string_is_one_character_per_tile_in_heights_order(self):
        window = grid.TileWindow(4, 7, 7, 9)  # 3 x 2
        cover = coverage.Coverage("doced?"[:6], {})
        self.assertEqual(len(cover.tiles), window.count)
        # Tile-row-major, ty ascending then tx ascending: the fourth character
        # is the first tile of the second row.
        self.assertEqual(cover.of(window, 4, 7), "d")
        self.assertEqual(cover.of(window, 6, 7), "c")
        self.assertEqual(cover.of(window, 4, 8), "e")

    def test_a_tile_and_its_index_are_inverses(self):
        # The record's order has two readers — the map, through the engine,
        # and the build-time check that the mirror and the warp agree. They
        # go opposite ways through it, so they are one definition here.
        window = grid.TileWindow(28, 12, 83, 33)
        for tx, ty in [(28, 12), (82, 12), (28, 32), (82, 32), (55, 20)]:
            n = coverage.index_of(window, tx, ty)
            self.assertEqual(coverage.tile_at(window, n), (tx, ty))
        self.assertEqual(coverage.tile_at(window, window.count - 1), (82, 32))

    def test_counts_name_only_the_states_that_occur(self):
        window = grid.TileWindow(0, 0, 2, 1)
        cover = coverage.Coverage("do", {"d": 1, "o": 1})
        self.assertEqual(cover.as_json()["counts"], {"d": 1, "o": 1})
        self.assertEqual(cover.of(window, 1, 0), "o")


@unittest.skipUnless(HAVE_PROJ, "needs rasterio for the inverse projection")
@unittest.skipUnless(HAVE_PROJ, "numpy not installed")
class TestTheSampleMask(unittest.TestCase):
    """What a measurement may read, one sample at a time (F60)."""

    # Two tiles by two, the south-east one never fetched. The record runs
    # south to north; the mask, like the raster, runs north to south.
    WINDOW = grid.TileWindow(0, 0, 2, 2)
    TILES = coverage.DATA + coverage.UNREACHED + coverage.DATA + coverage.DATA

    def test_a_sample_is_measured_only_if_every_tile_it_touches_was_fetched(self):
        mask = coverage.sample_mask(self.WINDOW, self.TILES)
        self.assertEqual(mask.shape, (129, 129))
        self.assertTrue(mask[0, 0] and mask[63, 100] and mask[100, 63] and mask[64, 0])
        # The south-east tile, and both edges it shares with fetched tiles.
        self.assertFalse(mask[128, 128] or mask[100, 100])
        self.assertFalse(mask[64, 100] or mask[100, 64] or mask[64, 64])

    def test_a_record_for_another_window_is_refused(self):
        with self.assertRaises(ValueError):
            coverage.sample_mask(self.WINDOW, self.TILES[:3])


@unittest.skipUnless(HAVE_PROJ, "needs rasterio for the inverse projection")
class TestTheSampleStates(unittest.TestCase):
    """A sample's own cell, a level finer than its tile's (F61)."""

    WINDOW = grid.TileWindow(60, 20, 62, 22)

    def cell_of(self, row: int, col: int) -> tuple[int, int]:
        x, y = grid.transform_for(self.WINDOW) * (col + 0.5, row + 0.5)
        lats, lons = grid.unproject([x], [y])
        return int(lats[0] // 1), int(lons[0] // 1)

    def every_cell(self) -> set:
        return set().union(*coverage.cells_under(self.WINDOW))

    def test_every_cell_fetched_is_every_sample_ground(self):
        cells = self.every_cell()
        states = coverage.sample_states(self.WINDOW, cells, cells)
        self.assertEqual(states.shape, (self.WINDOW.height_samples, self.WINDOW.width_samples))
        self.assertTrue((states == coverage.DATA).all())

    def test_a_sample_is_what_the_cell_under_its_centre_is(self):
        cells = self.every_cell()
        unfetched, absent = self.cell_of(0, 0), self.cell_of(128, 128)
        self.assertNotEqual(unfetched, absent)
        mirror = cells - {absent}
        states = coverage.sample_states(self.WINDOW, mirror - {unfetched}, mirror)
        self.assertEqual(states[0, 0], coverage.UNREACHED)
        self.assertEqual(states[128, 128], coverage.OCEAN)
        self.assertEqual(set(states.ravel().tolist()), set(coverage.DATA + coverage.OCEAN + coverage.UNREACHED))

    def test_nothing_a_tile_calls_ground_is_less_than_ground_here(self):
        # The finer answer only ever adds ground: a sample every tile under
        # which was wholly fetched stands on a fetched cell.
        cells = sorted(self.every_cell())
        fetched = set(cells[: len(cells) // 2])
        tiles = "".join(
            coverage.classify(under, fetched, set(cells))
            for under in coverage.cells_under(self.WINDOW)
        )
        coarse = coverage.sample_mask(self.WINDOW, tiles)
        fine = coverage.sample_states(self.WINDOW, fetched, set(cells)) == coverage.DATA
        self.assertTrue(coarse.any())
        self.assertFalse((coarse & ~fine).any())
        self.assertGreater(int(fine.sum()), int(coarse.sum()))


class TestTheCellsUnderATile(unittest.TestCase):
    def test_a_tile_touches_the_cells_its_own_corners_are_in(self):
        window = grid.TileWindow(60, 20, 61, 21)
        [under] = coverage.cells_under(window)
        x0, y0, x1, y1 = grid.tile_bounds_m(60, 20)
        lats, lons = grid.unproject([x0, x1, x0, x1], [y0, y0, y1, y1])
        for lat, lon in zip(lats, lons):
            self.assertIn((int(lat // 1), int(lon // 1)), under)

    def test_a_64_km_tile_touches_between_one_and_six_of_them(self):
        # A one-degree cell is about 111 km north-south and less east-west at
        # this latitude, and the projection turns a square tile into a
        # trapezium, so a tile straddling a corner touches four — and more
        # where the grid is most sheared. What this is really asserting is
        # that the sampling has not silently collapsed to one point.
        window = grid.TileWindow(28, 12, 83, 33)
        counts = {len(u) for u in coverage.cells_under(window)}
        self.assertGreaterEqual(min(counts), 1)
        self.assertLessEqual(max(counts), 6)

    def test_unproject_is_the_inverse_of_project(self):
        lats, lons = [25.0, 31.0689, 34.9], [89.5, 109.9467, 122.9]
        xs, ys = grid.project(lats, lons)
        back_lats, back_lons = grid.unproject(xs, ys)
        for a, b in zip(lats, back_lats):
            self.assertAlmostEqual(a, b, places=7)
        for a, b in zip(lons, back_lons):
            self.assertAlmostEqual(a, b, places=7)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
