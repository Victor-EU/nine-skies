"""Which land is China's, and which side of the line it is on (F65).

No GDAL and no elevation data. The projection is a stub in most of these:
where the stub *is* the graticule, a line straight in the plane and a line
straight in degrees have to be the same line, and that is the check that the
two branches of `line_x` are one construction rather than two.
"""

import math
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
    from nineskies import boundary, shapefile


class Transform:
    """The two rows of an affine that `centres` reads, north-up."""

    def __init__(self, a=1000.0, e=-1000.0, c=0.0, f=0.0, b=0.0, d=0.0):
        self.a, self.b, self.c = a, b, c
        self.d, self.e, self.f = d, e, f


def flat(lats, lons):
    """A stub projection that *is* the graticule: 1000 m to the degree."""
    return [lon * 1000.0 for lon in lons], [lat * 1000.0 for lat in lats]


def shape(record, ring=((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0))):
    return shapefile.Shape(
        kind="polygon", parts=(np.asarray(ring, dtype="float64"),), record=record
    )


@unittest.skipUnless(HAVE_NUMPY, "the boundary module is numpy arithmetic")
class TestWhichPolygonIsChina(unittest.TestCase):
    """The one choice under the probe that is not arithmetic.

    Both readings come out of the same file's own columns, so this checks the
    predicates against rows spelled the way Natural Earth spells them -- and
    against the rows that must *not* match, which is where a predicate on a
    free-text column goes wrong.
    """

    FILE = None

    def setUp(self):
        self.FILE = [
            shape({"NAME": "China", "SOVEREIGNT": "China", "FCLASS_CN": ""}),
            shape({"NAME": "Hong Kong", "SOVEREIGNT": "China", "FCLASS_CN": "Admin-1 region"}),
            shape({"NAME": "Macao", "SOVEREIGNT": "China", "FCLASS_CN": "Admin-1 region"}),
            shape(
                {
                    "NAME": "Taiwan",
                    "SOVEREIGNT": "Taiwan",
                    "FCLASS_CN": "Admin-1 states provinces",
                }
            ),
            shape({"NAME": "Mongolia", "SOVEREIGNT": "Mongolia", "FCLASS_CN": ""}),
            shape({"NAME": "Kosovo", "SOVEREIGNT": "Kosovo", "FCLASS_CN": "Unrecognized"}),
        ]

    def names(self, view):
        return [self.FILE[i].record["NAME"] for i in boundary.features(self.FILE, view)]

    def test_the_de_facto_view_is_the_three_features_whose_sovereign_is_china(self):
        self.assertEqual(self.names(boundary.ADMINISTERED), ["China", "Hong Kong", "Macao"])

    def test_the_other_view_adds_taiwan_and_only_taiwan(self):
        self.assertEqual(
            self.names(boundary.WITH_TAIWAN), ["China", "Hong Kong", "Macao", "Taiwan"]
        )

    def test_a_feature_china_does_not_recognise_is_not_a_feature_of_china(self):
        # `Unrecognized` fills the same column as `Admin-1 region`, and a
        # predicate that tested for a non-empty FCLASS_CN would annex Kosovo.
        self.assertNotIn("Kosovo", self.names(boundary.WITH_TAIWAN))
        self.assertNotIn("Mongolia", self.names(boundary.WITH_TAIWAN))

    def test_both_views_carry_their_own_evidence(self):
        for view in boundary.VIEWS:
            with self.subTest(view.id):
                self.assertTrue(view.why.strip())
                self.assertIs(boundary.BY_ID[view.id], view)

    def test_a_view_that_matches_nothing_refuses_rather_than_burning_nothing(self):
        # An empty mask counts zero cells on both sides of the line, and 0/0
        # would be the probe reporting nan rather than reporting a fault.
        nobody = boundary.View(id="nobody", name="nobody", keep=lambda r: False, why="—")
        with self.assertRaises(LookupError):
            boundary.mask(self.FILE, Transform(), (4, 4), nobody, project=flat)


@unittest.skipUnless(HAVE_NUMPY, "the boundary module is numpy arithmetic")
class TestWhereTheLineRuns(unittest.TestCase):
    """Three planes, one construction.

    The line's ends are the probe's: north-east to south-west. Under the stub
    projection a degree is a kilometre and nothing is curved, so `albers` and
    `graticule` must agree exactly -- if they do not, the two branches are
    computing different lines and the report's spread is meaningless.
    """

    NORTH = (50.0, 127.0)
    SOUTH = (25.0, 98.0)
    #: A grid of tenth-degree cells whose rows run 54 N down to 18 N and whose
    #: columns run 70 E to 140 E, so the line's ends are inside it and both
    #: tails are not.
    GRID = Transform(a=100.0, e=-100.0, c=70_000.0, f=54_000.0)
    SHAPE = (360, 700)

    def line(self, plane):
        return boundary.line_x(
            self.GRID, self.SHAPE, self.NORTH, self.SOUTH, plane, project=flat
        )

    def test_a_plane_this_module_does_not_know_is_refused(self):
        with self.assertRaises(ValueError):
            self.line("mercator")

    def test_a_rotated_grid_is_refused_rather_than_read_row_by_row(self):
        with self.assertRaises(ValueError):
            boundary.centres(Transform(b=5.0), (4, 4))

    def test_straight_in_the_plane_and_straight_in_degrees_agree_when_they_are(self):
        np.testing.assert_allclose(self.line("albers"), self.line("graticule"), atol=1e-6)

    def test_the_shortest_path_over_the_globe_is_not_straight_in_degrees(self):
        # The fact the report prints all three planes for. A stub metre is a
        # thousandth of a degree here, so this is three and a half degrees of
        # longitude between the two lines -- about 300 km of ground at these
        # latitudes, and hundreds of thousands of square kilometres changing
        # sides (F65).
        apart = np.abs(self.line("geodesic") - self.line("graticule")).max()
        self.assertGreater(apart, 3_000.0)

    def test_the_line_passes_through_its_own_two_ends(self):
        for plane in boundary.PLANES:
            with self.subTest(plane):
                x = self.line(plane)
                _, y = boundary.centres(self.GRID, self.SHAPE)
                for lat, lon in (self.NORTH, self.SOUTH):
                    row = int(np.argmin(np.abs(y - lat * 1000.0)))
                    self.assertAlmostEqual(x[row] / 1000.0, lon, delta=0.12)

    def test_it_is_extended_past_both_ends_rather_than_clamped(self):
        # China reaches 18 N and 53.6 N and the line's ends are 25 and 50.25,
        # so both tails are extrapolation. A clamped tail would stand the line
        # vertically and put Hainan and Mohe on the wrong side of it.
        for plane in boundary.PLANES:
            with self.subTest(plane):
                x = self.line(plane)
                self.assertTrue(np.all(np.diff(x) < 0))  # north-east to south-west

    def test_west_is_the_smaller_x(self):
        west = boundary.west_of(
            self.GRID, self.SHAPE, self.NORTH, self.SOUTH, "albers", project=flat
        )
        x, _ = boundary.centres(self.GRID, self.SHAPE)
        line = self.line("albers")
        row = self.SHAPE[0] // 2
        col_west = int(np.searchsorted(x, line[row]) - 2)
        self.assertTrue(west[row, col_west])
        self.assertFalse(west[row, col_west + 3])


@unittest.skipUnless(HAVE_NUMPY, "the boundary module is numpy arithmetic")
class TestAreaTwoWays(unittest.TestCase):
    """The two checks a ratio cannot make, against arithmetic that is known."""

    def test_the_plane_measures_the_polygon_it_is_given(self):
        # One degree square, a kilometre to the degree: one square kilometre.
        self.assertAlmostEqual(boundary.planar_km2([shape({})], [0], project=flat), 1.0, places=9)

    def test_the_sphere_measures_the_zone_the_ring_encloses(self):
        # R² * dlon * (sin lat2 - sin lat1), which is the closed form for a
        # ring of two meridians and two parallels.
        expected = (
            boundary.AUTHALIC_R_M ** 2
            * math.radians(1.0)
            * (math.sin(math.radians(1.0)) - math.sin(0.0))
            / 1e6
        )
        self.assertAlmostEqual(boundary.sphere_km2([shape({})], [0]), expected, places=3)

    def test_a_hole_subtracts_itself(self):
        # A shapefile writes a hole with the opposite handedness, so the
        # signed areas cancel; a reader that took the absolute value per ring
        # would count an island's water as land.
        outer = np.asarray([(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)])
        hole = np.asarray([(2.0, 2.0), (2.0, 4.0), (4.0, 4.0), (4.0, 2.0)])
        both = shapefile.Shape(kind="polygon", parts=(outer, hole), record={})
        self.assertAlmostEqual(
            boundary.planar_km2([both], [0], project=flat), 100.0 - 4.0, places=6
        )

    def test_the_published_figures_are_named_rather_than_anonymous(self):
        self.assertIn("China", boundary.PUBLISHED_KM2)
        self.assertGreater(boundary.PUBLISHED_KM2["China"], 9_000_000)


@unittest.skipUnless(HAVE_NUMPY, "the boundary module is numpy arithmetic")
class TestCountingTwoSides(unittest.TestCase):
    def test_it_counts_the_mask_and_not_the_grid(self):
        inside = np.zeros((4, 4), dtype=bool)
        inside[1:3, :] = True
        west = np.zeros((4, 4), dtype=bool)
        west[:, :1] = True
        split = boundary.split(inside, west, "administered", "albers")
        self.assertEqual((split.cells, split.west, split.east), (8, 2, 6))
        self.assertAlmostEqual(split.west_pct, 25.0)
        self.assertAlmostEqual(split.km2(1.0), 8.0)

    def test_a_division_of_the_wrong_shape_is_refused(self):
        with self.assertRaises(ValueError):
            boundary.split(
                np.ones((4, 4), dtype=bool), np.ones((4, 5), dtype=bool), "a", "albers"
            )

    def test_an_empty_mask_says_nan_rather_than_dividing_by_zero(self):
        split = boundary.split(
            np.zeros((4, 4), dtype=bool), np.zeros((4, 4), dtype=bool), "a", "albers"
        )
        self.assertTrue(math.isnan(split.west_pct))


if __name__ == "__main__":
    unittest.main(verbosity=2)
