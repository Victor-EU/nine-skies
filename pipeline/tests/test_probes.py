"""Probe harness tests. Run without GDAL or any elevation data."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nineskies.probes import (  # noqa: E402
    AREA_PROBES,
    MONOTONIC_PROBES,
    POINT_PROBES,
    probes_for,
    run_point_probes,
)


class TestPhaseSplit(unittest.TestCase):
    def test_corridor_build_can_only_reach_two_probes(self):
        # The build plan's phase 0 gate. Promising six here would make the gate
        # unpassable and hide a real failure behind a scheduling error.
        self.assertEqual(len(probes_for("corridor")), 2)

    def test_full_build_reaches_all_six(self):
        self.assertEqual(len(probes_for("full")), 6)


class TestPointProbes(unittest.TestCase):
    def truth(self, lat, lon):
        for p in POINT_PROBES:
            if abs(p.lat - lat) < 1e-6 and abs(p.lon - lon) < 1e-6:
                return p.expected_m
        raise AssertionError("probe asked for an unexpected coordinate")

    def test_a_correct_pipeline_passes(self):
        self.assertEqual(run_point_probes(self.truth), [])

    def test_a_vertical_datum_error_fails(self):
        # Every point 60 m high: the classic geoid-vs-ellipsoid mistake.
        failures = run_point_probes(lambda la, lo: self.truth(la, lo) + 60)
        self.assertEqual(len(failures), len(POINT_PROBES))
        self.assertIn("Lhasa", failures[0])

    def test_a_sign_flip_on_turpan_fails(self):
        def sampler(la, lo):
            m = self.truth(la, lo)
            return abs(m)  # loses the depression

        failures = run_point_probes(sampler)
        self.assertTrue(any("Ayding" in f for f in failures))

    def test_summit_tolerance_absorbs_resampling_but_not_a_real_error(self):
        everest = next(p for p in POINT_PROBES if "Everest" in p.name)
        self.assertIsNone(everest.check(everest.expected_m - 35))  # 1 km clipping
        self.assertIsNotNone(everest.check(everest.expected_m - 300))  # wrong


class TestMonotonicProbe(unittest.TestCase):
    def setUp(self):
        self.yangtze = MONOTONIC_PROBES[0]

    def test_a_descending_river_passes(self):
        profile = [5100, 3200, 1800, 200, 60, 20, 3]
        self.assertIsNone(self.yangtze.check(profile))

    def test_a_river_that_runs_uphill_fails(self):
        # What 1 km resampling does to a meander if stage 3 is skipped.
        profile = [5100, 3200, 1800, 220, 240, 20, 3]
        problem = self.yangtze.check(profile)
        self.assertIsNotNone(problem)
        self.assertIn("uphill", problem)

    def test_a_flat_reach_is_allowed(self):
        # Reservoirs and the lower delta are legitimately flat.
        self.assertIsNone(self.yangtze.check([100, 100, 100, 50, 50, 3, 3]))

    def test_waypoints_run_from_source_to_mouth(self):
        first, last = self.yangtze.waypoints[0], self.yangtze.waypoints[-1]
        self.assertGreater(first[1], 90)      # headwaters on the plateau
        self.assertGreater(last[1], 121)      # mouth at Shanghai
        self.assertGreater(last[1], first[1])  # west to east


class TestAreaProbe(unittest.TestCase):
    def test_equal_area_projection_passes(self):
        self.assertIsNone(AREA_PROBES[0].check(57.0))
        self.assertIsNone(AREA_PROBES[0].check(56.3))

    def test_a_mercator_style_distortion_fails(self):
        # Inflating the north inflates the west; this is the probe that would
        # catch shipping the wrong projection.
        self.assertIsNotNone(AREA_PROBES[0].check(62.0))

    def test_line_endpoints_are_heihe_and_tengchong(self):
        probe = AREA_PROBES[0]
        self.assertAlmostEqual(probe.north_end[0], 50.25, places=1)
        self.assertAlmostEqual(probe.south_end[0], 25.02, places=1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
