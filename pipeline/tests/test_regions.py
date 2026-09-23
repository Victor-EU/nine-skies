"""What the ground draws of the nine regions (F66).

No elevation data. The instruments are checked against the brute-force
morphology they stand in for, and the one piece of geography this module
carries -- Expedition 1's waypoints -- against the route section it has to
agree with.
"""

import json
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nineskies import regions  # noqa: E402

try:  # the suite still runs where PROJ is not installed
    import rasterio  # noqa: F401

    HAVE_RASTERIO = True
except ImportError:  # pragma: no cover - a bare interpreter
    HAVE_RASTERIO = False

ROOT = Path(__file__).resolve().parents[2]


def by_hand_erode(mask, r):
    """Four-connected erosion one step at a time, the edge counted as outside."""
    m = mask.copy()
    for _ in range(r):
        padded = np.pad(m, 1, constant_values=False)
        m = (
            padded[1:-1, 1:-1]
            & padded[:-2, 1:-1]
            & padded[2:, 1:-1]
            & padded[1:-1, :-2]
            & padded[1:-1, 2:]
        )
    return m


def by_hand_dilate(mask, r):
    m = mask.copy()
    for _ in range(r):
        padded = np.pad(m, 1, constant_values=False)
        m = (
            padded[1:-1, 1:-1]
            | padded[:-2, 1:-1]
            | padded[2:, 1:-1]
            | padded[1:-1, :-2]
            | padded[1:-1, 2:]
        )
    return m


def dumbbell(corridor_width=1):
    """Two 9 x 9 blocks joined by a corridor five cells long."""
    ground = np.zeros((11, 25), dtype=bool)
    ground[1:10, 1:10] = True
    ground[1:10, 15:24] = True
    mid = 5 - corridor_width // 2
    ground[mid : mid + corridor_width, 10:15] = True
    return ground


class TestTheMorphologyIsTheMorphology(unittest.TestCase):
    """An opening is a threshold on a distance here, which is only right if the
    distance is the one a four-connected erosion measures."""

    MASKS = [np.random.default_rng(seed).random((23, 31)) < 0.7 for seed in range(4)]

    def test_erosion_is_a_threshold_on_the_distance(self):
        for k, mask in enumerate(self.MASKS):
            for r in (1, 2, 3):
                with self.subTest(mask=k, r=r):
                    np.testing.assert_array_equal(regions.erode(mask, r), by_hand_erode(mask, r))

    def test_dilation_is_too_and_the_edge_grows_nothing(self):
        for k, mask in enumerate(self.MASKS):
            for r in (1, 2, 3):
                with self.subTest(mask=k, r=r):
                    np.testing.assert_array_equal(
                        regions.dilate(mask, r), by_hand_dilate(mask, r)
                    )
        self.assertFalse(regions.dilate(np.zeros((5, 5), dtype=bool), 2).any())

    def test_the_distance_is_city_block(self):
        d = regions.distance(np.ones((7, 7), dtype=bool))
        self.assertEqual(d[3, 3], 4)  # three cells in, and the edge is one more
        self.assertEqual(d[0, 0], 1)
        self.assertEqual(regions.distance(np.zeros((3, 3), dtype=bool)).max(), 0)

    def test_smoothing_cuts_a_spur_and_closes_a_valley(self):
        # The two things that make a raw threshold cross a route many times:
        # a ridge standing out of the plateau, and a valley cut into it.
        ground = np.zeros((25, 25), dtype=bool)
        ground[3:20, 3:20] = True
        ground[11, 20:23] = True  # a spur three cells long
        ground[3:20, 11] = False  # a valley one cell wide, right through
        smoothed = regions.smooth(ground, 1)
        self.assertFalse(smoothed[11, 22])
        self.assertTrue(smoothed[11, 11])
        path = [(11, c) for c in range(25)]
        self.assertEqual(regions.crossings(ground, path), 4)
        self.assertEqual(regions.crossings(smoothed, path), 2)


class TestPieces(unittest.TestCase):
    def test_diagonal_cells_are_not_joined(self):
        mask = np.eye(4, dtype=bool)
        self.assertEqual(int(regions.component(mask, (0, 0)).sum()), 1)
        self.assertEqual(regions.label(mask)[1], 4)

    def test_labels_are_numbered_in_row_order(self):
        mask = np.zeros((4, 6), dtype=bool)
        mask[2:, 0] = True  # starts on row 2
        mask[0, 4:] = True  # starts on row 0
        labels, count = regions.label(mask)
        self.assertEqual(count, 2)
        self.assertEqual(labels[0, 4], 1)
        self.assertEqual(labels[3, 0], 2)

    def test_a_corridor_narrower_than_the_cut_parts_the_ground(self):
        ground = dumbbell(corridor_width=1)
        self.assertEqual(len(regions.pieces(ground, 0, min_cells=10)), 1)
        parts = regions.pieces(ground, 1, min_cells=10, core_cells=1)
        self.assertEqual(len(parts), 2)
        for part in parts:
            # Each is given back its own block whole, corners and all, which
            # an opening alone would shave -- and the corridor is shared out.
            self.assertGreaterEqual(int(part.cells.sum()), 81)
        self.assertEqual(sum(int(p.cells.sum()) for p in parts), int(ground.sum()))

    def test_the_pieces_divide_the_ground_rather_than_overlap(self):
        ground = dumbbell(corridor_width=1)
        whole = np.zeros(ground.shape, dtype=int)
        for part in regions.pieces(ground, 1, min_cells=10, core_cells=1):
            h, w = part.cells.shape
            whole[part.top : part.top + h, part.left : part.left + w] += part.cells
        self.assertEqual(whole.max(), 1)
        np.testing.assert_array_equal(whole.astype(bool), ground)

    def test_a_lowland_the_cut_consumes_whole_is_no_piece(self):
        ground = np.zeros((12, 12), dtype=bool)
        ground[1:11, 1:11] = True
        ground[0, :] = True  # a strip one cell wide along the top
        parts = regions.pieces(ground, 6, min_cells=1, core_cells=1)
        self.assertEqual(parts, [])

    def test_a_corridor_as_wide_as_the_cut_does_not(self):
        # Three cells wide survives an erosion of one, so the cut has to be
        # wider than the corridor before the two ends part.
        ground = dumbbell(corridor_width=3)
        self.assertEqual(len(regions.pieces(ground, 1, min_cells=10, core_cells=1)), 1)
        self.assertEqual(len(regions.pieces(ground, 2, min_cells=10, core_cells=1)), 2)

    def test_the_pieces_come_largest_first_and_crumbs_are_left_out(self):
        ground = np.zeros((20, 20), dtype=bool)
        ground[1:4, 1:4] = True  # 9
        ground[8:18, 8:18] = True  # 100
        ground[0, 19] = True  # a crumb
        parts = regions.pieces(ground, 0, min_cells=5)
        self.assertEqual([int(p.cells.sum()) for p in parts], [100, 9])
        self.assertEqual((parts[0].top, parts[0].left), (8, 8))


class TestCrossings(unittest.TestCase):
    def test_each_way_in_or_out_counts_once(self):
        mask = np.zeros((1, 10), dtype=bool)
        mask[0, 2:4] = True
        mask[0, 6:9] = True
        path = [(0, c) for c in range(10)]
        self.assertEqual(regions.crossings(mask, path), 4)
        self.assertEqual(regions.crossings(np.ones((1, 10), dtype=bool), path), 0)


class TestTheRouteIsTheSectionsRoute(unittest.TestCase):
    """EXPEDITION_1 is a second list of the route's names, so it is held to the
    committed section rather than trusted (D46)."""

    SECTION = json.loads((ROOT / "content" / "sections" / "sea-to-sky.json").read_text())

    def test_the_same_places_in_the_same_order(self):
        self.assertEqual(
            tuple(w["id"] for w in self.SECTION["waypoints"]), regions.EXPEDITION_1
        )

    def test_at_the_same_coordinates(self):
        from nineskies import places

        for w in self.SECTION["waypoints"]:
            with self.subTest(w["id"]):
                place = places.BY_ID[w["id"]]
                self.assertEqual((place.lat, place.lon), (w["lat"], w["lon"]))

    @unittest.skipUnless(HAVE_RASTERIO, "needs rasterio for the projection")
    def test_walked_a_kilometre_at_a_time_it_is_as_long_as_the_section(self):
        from affine import Affine

        # A grid big enough to hold the whole route, a kilometre to the cell.
        transform = Affine(1000.0, 0.0, -4_000_000.0, 0.0, -1000.0, 6_000_000.0)
        walked = regions.route_cells(transform, (6_000, 8_000))
        self.assertAlmostEqual(walked[-1][0], self.SECTION["lengthKm"], delta=1.0)
        steps = [b - a for (a, _), (b, _) in zip(walked, walked[1:])]
        self.assertLessEqual(max(steps), 1.0)
        self.assertEqual(walked[0][0], 0.0)


class TestTheStepsCoverEveryHeight(unittest.TestCase):
    def test_the_bands_meet_and_run_from_the_bottom_to_the_top(self):
        for (_, hi, _), (lo, _, _) in zip(regions.STEPS, regions.STEPS[1:]):
            self.assertEqual(hi, lo)
        self.assertLess(regions.STEPS[0][0], -500.0)  # Turpan is -154 m
        self.assertGreater(regions.STEPS[-1][1], 9_000.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
