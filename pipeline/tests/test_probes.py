"""Probe harness tests. Run without GDAL or any elevation data."""

import sys
import unittest
from pathlib import Path

try:
    import numpy  # noqa: F401
    import rasterio  # noqa: F401

    HAVE_RASTERIO = True
except ImportError:  # pragma: no cover - a bare interpreter
    HAVE_RASTERIO = False

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nineskies.probes import (  # noqa: E402
    AREA_PROBES,
    MONOTONIC_PROBES,
    POINT_PROBES,
    deferred_on,
    probes_for,
    run_point_probes,
    runnable_on,
)

EVEREST = next(p for p in POINT_PROBES if "Everest" in p.name)


class TestPhaseSplit(unittest.TestCase):
    def test_corridor_build_can_only_reach_two_probes(self):
        # The build plan's phase 0 gate. Promising six here would make the gate
        # unpassable and hide a real failure behind a scheduling error.
        self.assertEqual(len(probes_for("corridor")), 2)

    def test_full_build_reaches_all_six(self):
        self.assertEqual(len(probes_for("full")), 6)

    def test_the_country_grid_cannot_reach_everest(self):
        # F12: at 1 km the summit moves 153 m with grid phase alone, so the
        # probe is unpassable at any tolerance. It must be deferred to the
        # hero grid, not run and failed, and not dropped without a word.
        names = [p.name for p in runnable_on("full")]
        self.assertNotIn("Everest summit", names)
        self.assertIn("Everest summit", [p.name for p in deferred_on("full")])

    def test_the_hero_grid_reaches_exactly_everest(self):
        self.assertEqual([p.name for p in runnable_on("full", "hero")],
                         ["Everest summit"])

    def test_no_probe_is_lost_between_the_two_grids(self):
        for phase in ("corridor", "full"):
            total = len(runnable_on(phase)) + len(deferred_on(phase))
            self.assertEqual(total, len(probes_for(phase)), phase)


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
        country = [p for p in POINT_PROBES if p.grid == "country"]
        failures = run_point_probes(lambda la, lo: self.truth(la, lo) + 60)
        self.assertEqual(len(failures), len(country))
        self.assertIn("Lhasa", failures[0])

        # ...including on the hero grid, where 60 m is well outside 25 m.
        hero = run_point_probes(
            lambda la, lo: self.truth(la, lo) + 60, grid="hero"
        )
        self.assertEqual(len(hero), 1)
        self.assertIn("Everest", hero[0])

    def test_a_sign_flip_on_turpan_fails(self):
        def sampler(la, lo):
            m = self.truth(la, lo)
            return abs(m)  # loses the depression

        failures = run_point_probes(sampler)
        self.assertTrue(any("Ayding" in f for f in failures))

    def test_the_summit_probe_is_measured_against_the_source_not_the_survey(self):
        # The whole point of F12. Expecting the survey height means expecting
        # the radar to be something it is not, and the probe fails forever
        # while looking like our bug.
        self.assertAlmostEqual(EVEREST.expected_m, 8737.8, places=1)
        self.assertAlmostEqual(EVEREST.published_m, 8848.86, places=2)
        self.assertGreater(EVEREST.published_m - EVEREST.expected_m, 100)
        self.assertEqual(EVEREST.grid, "hero")

    def test_summit_tolerance_absorbs_the_hero_grid_but_not_a_real_error(self):
        # Measured: 90 m reduction costs 9.1 m, grid phase another 8.4 m.
        self.assertIsNone(EVEREST.check(EVEREST.expected_m - 9.1))
        self.assertIsNone(EVEREST.check(EVEREST.expected_m - 17.5))
        # Sampling the 1 km grid by mistake reads 235-388 m low.
        self.assertIsNotNone(EVEREST.check(8503.3))
        self.assertIsNotNone(EVEREST.check(8350.0))
        # And the survey height itself is now out of tolerance, which is the
        # correct behaviour: if we ever read 8,849 m the source changed.
        self.assertIsNotNone(EVEREST.check(EVEREST.published_m))


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


class TestWhatTheMonotonicProbeCannotSee(unittest.TestCase):
    """The probe's own limits, asserted so a pass is never read as more.

    F48 measured this against the built corridor: the probe passes at the
    spacing it is written at, would fail at every finer spacing because the
    polyline is a chord rather than a centreline, and passes at every channel
    search radius including none. What follows states those limits here, in
    the suite that runs without any elevation at all, so they cannot quietly
    stop being true.
    """

    def setUp(self):
        self.yangtze = MONOTONIC_PROBES[0]

    def test_a_clipped_meander_between_two_waypoints_is_invisible(self):
        # The exact failure stage 3 exists to prevent. Between Chongqing and
        # Yichang the true profile climbs 500 m and comes back down; the probe
        # is handed one number per waypoint and never sees it.
        true_profile = [5100, 3200, 1800, 200, 700, 210, 60, 20, 3]
        self.assertTrue(
            any(
                true_profile[i + 1] > true_profile[i]
                for i in range(len(true_profile) - 1)
            ),
            "the fixture must actually run uphill somewhere",
        )
        at_waypoints = [5100, 3200, 1800, 200, 60, 20, 3]
        self.assertEqual(len(at_waypoints), len(self.yangtze.waypoints))
        self.assertIsNone(self.yangtze.check(at_waypoints))

    def test_the_probe_declares_that_it_may_not_be_densified(self):
        # None is the honest setting for a chord: walked finely it measures
        # the ground under a straight line, which the river is not in. Stage 3
        # turns this into a number, and that is the day the probe becomes the
        # check it has always claimed to be.
        self.assertIsNone(self.yangtze.stride_km)
        self.assertIn("meander", self.yangtze.note)

    def test_the_source_note_does_not_claim_a_stage_that_has_not_run(self):
        # It used to read "monotonicity enforced in stage 3". There is no
        # stage 3 in the Makefile, in `nineskies/`, or in any built artefact,
        # so that sentence was provenance for a number that had none.
        self.assertNotIn("stage 3", self.yangtze.source)
        self.assertIn("no centreline data", self.yangtze.source)


@unittest.skipUnless(HAVE_RASTERIO, "needs numpy and rasterio (pipeline/.venv)")
class TestWalkingAPolyline(unittest.TestCase):
    """The stepping `probe.py` re-walks a chord with.

    Driven through a stub rather than a raster: what is being tested is that
    the spacing is real kilometres in the projected plane and that both ends
    are included, not that GeoTIFFs can be opened.
    """

    def walker(self, pixels):
        from nineskies import grid
        from nineskies.sample import GridSampler

        class Stub:
            def to_pixel(self, lat, lon):
                return pixels[int(lat)]

            def elevation_at(self, col, row):
                return col

            def channel_at(self, col, row, radius_km):
                return col - radius_km

        stub = Stub()
        self.resolution_m = grid.RESOLUTION_M
        return GridSampler.walk.__get__(stub, Stub)

    def test_the_spacing_is_kilometres_of_ground(self):
        # Two points 100 cells apart on a 1 km grid, walked at 25 km: four
        # steps and the far end, so five samples.
        walk = self.walker([(0.0, 0.0), (100.0, 0.0)])
        self.assertEqual(self.resolution_m, 1000)
        self.assertEqual(walk([(0, 0), (1, 0)], 25.0), [0.0, 25.0, 50.0, 75.0, 100.0])

    def test_both_ends_are_sampled(self):
        walk = self.walker([(0.0, 0.0), (10.0, 0.0)])
        out = walk([(0, 0), (1, 0)], 10.0)
        self.assertEqual(out[0], 0.0)
        self.assertEqual(out[-1], 10.0)

    def test_a_radius_switches_to_the_channel_reader(self):
        walk = self.walker([(0.0, 0.0), (10.0, 0.0)])
        self.assertEqual(walk([(0, 0), (1, 0)], 10.0, 2.0), [-2.0, 8.0])

    def test_a_stride_longer_than_the_leg_still_takes_one_step(self):
        # 500 km between waypoints 100 km apart must not collapse to nothing.
        walk = self.walker([(0.0, 0.0), (100.0, 0.0)])
        self.assertEqual(walk([(0, 0), (1, 0)], 500.0), [0.0, 100.0])


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
