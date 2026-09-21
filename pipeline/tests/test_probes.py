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

from nineskies import places  # noqa: E402
from nineskies.probes import (  # noqa: E402
    AREA_PROBES,
    FLATNESS_PROBES,
    MONOTONIC_PROBES,
    POINT_PROBES,
    deferred_on,
    probes_for,
    run_point_probes,
    runnable_on,
)

EVEREST = next(p for p in POINT_PROBES if "Everest" in p.name)


class TestAProbeThatCannotRead(unittest.TestCase):
    """A probe whose subject is not on this raster must not report a verdict.

    The hero grid is not one artefact but a handful of small ones, and every
    hero probe is run against every area. NaN compares false against every
    threshold a check can set, so the moment a second area existed *monotonic
    non-increasing* came back `pass` having read nothing at all: the Tiger
    Leaping Gorge probe ran against the Three Gorges, 1,200 km away, and the
    report said it passed. One area had hidden it (F52). This is F44's rule --
    a flight that reads no ground fails rather than printing `done` -- one
    artefact along.
    """

    GORGE = MONOTONIC_PROBES[-1]

    class Raster:
        """The sampler surface `probe.run` uses, over a rule about lat/lon."""

        resolution_m = 90.0
        #: `monotonic_sensitivity` prints coverage as a share of the raster.
        array = type("Cells", (), {"size": 591_745})()

        def __init__(self, covers):
            self.covers = covers

        def elevation_m(self, lat, lon):
            return 500.0 - lat if self.covers(lat, lon) else float("nan")

        def channel_m(self, lat, lon, radius_km):
            return self.elevation_m(lat, lon)

        def relief_m(self, lat, lon, radius_km):
            return 0.0 if self.covers(lat, lon) else float("nan")

        def disc_stats(self, lat, lon, radius_km):
            return self.elevation_m(lat, lon), 0.0

        def walk(self, waypoints, stride_km, radius_km=0.0):
            return [self.channel_m(lat, lon, radius_km) for lat, lon in waypoints]

    @classmethod
    def nowhere(cls):
        return cls.Raster(lambda lat, lon: False)

    @classmethod
    def everywhere(cls):
        return cls.Raster(lambda lat, lon: True)

    @classmethod
    def half(cls):
        """On the raster at the first waypoint and off it at the second."""
        return cls.Raster(lambda lat, lon: lon <= 100.0)

    def test_the_check_itself_cannot_catch_this(self):
        # Stated rather than assumed, because it is the reason the filter is
        # in the runner and not in `check`: a list of NaNs is non-increasing
        # as far as any comparison can tell.
        nan = float("nan")
        self.assertIsNone(self.GORGE.check([nan, nan]))

    @unittest.skipUnless(HAVE_RASTERIO, "probe.py imports the sampler")
    def test_a_probe_that_reads_nothing_is_not_runnable_here(self):
        from nineskies import probe

        readable, missing, total = probe.on_this_artefact(self.nowhere(), self.GORGE)
        self.assertFalse(readable)
        self.assertEqual((missing, total), (2, 2))

    @unittest.skipUnless(HAVE_RASTERIO, "probe.py imports the sampler")
    def test_a_probe_that_reads_everything_is(self):
        from nineskies import probe

        readable, missing, _ = probe.on_this_artefact(self.everywhere(), self.GORGE)
        self.assertTrue(readable)
        self.assertEqual(missing, 0)

    @unittest.skipUnless(HAVE_RASTERIO, "probe.py imports the sampler")
    def test_half_on_the_artefact_is_a_failure_rather_than_a_skip(self):
        # Worse than all off: the check would return a verdict on the half it
        # can see, which is a green light for a raster cut too small.
        from nineskies import probe

        readable, missing, total = probe.on_this_artefact(self.half(), self.GORGE)
        self.assertFalse(readable)
        self.assertEqual((missing, total), (1, 2))

    @unittest.skipUnless(HAVE_RASTERIO, "probe.py imports the sampler")
    def test_the_runner_lists_it_instead_of_passing_it(self):
        from nineskies import probe

        failures, lines = probe.run(self.nowhere(), "corridor", "hero")
        report = "\n".join(lines)
        self.assertEqual(failures, [])
        self.assertIn("Not on this artefact", report)
        self.assertNotIn("monotonic non-increasing", report)

    @unittest.skipUnless(HAVE_RASTERIO, "probe.py imports the sampler")
    def test_the_runner_fails_a_probe_it_can_only_half_read(self):
        from nineskies import probe

        failures, _ = probe.run(self.half(), "corridor", "hero")
        self.assertTrue(
            any("off the edge of this artefact" in f for f in failures), failures
        )

    @unittest.skipUnless(HAVE_RASTERIO, "probe.py imports the sampler")
    def test_what_a_probe_reads_is_asked_of_the_probe(self):
        # A point probe reads one coordinate and a chord reads its waypoints;
        # getting this wrong would make the filter decide on the wrong ground.
        from nineskies import probe

        self.assertEqual(probe.reads(self.GORGE), tuple(self.GORGE.waypoints))
        self.assertEqual(probe.reads(EVEREST), ((EVEREST.lat, EVEREST.lon),))


class TestPhaseSplit(unittest.TestCase):
    def test_corridor_build_can_only_reach_two_probes(self):
        # The build plan's phase 0 gate: two probes readable from a corridor
        # build. Promising more here would make the gate unpassable and hide
        # a real failure behind a scheduling error. The gorge probe has
        # corridor data and is not one of them — it cannot be read from the
        # 1 km grid at all, which is what `runnable_on` is for (F49).
        self.assertEqual(len(runnable_on("corridor")), 2)
        self.assertEqual(len(probes_for("corridor")), 3)

    def test_full_build_reaches_all_seven(self):
        # Six in the build plan's table plus the gorge, which is a seventh
        # because F49 found the failure the sixth was written to catch and
        # could not see.
        self.assertEqual(len(probes_for("full")), 7)

    def test_the_country_grid_cannot_reach_everest(self):
        # F12: at 1 km the summit moves 153 m with grid phase alone, so the
        # probe is unpassable at any tolerance. It must be deferred to the
        # hero grid, not run and failed, and not dropped without a word.
        names = [p.name for p in runnable_on("full")]
        self.assertNotIn("Everest summit", names)
        self.assertIn("Everest summit", [p.name for p in deferred_on("full")])

    def test_the_hero_grid_is_where_the_1_km_grid_cannot_reach(self):
        # Both for the same reason, six weeks apart: a 1 km cell containing
        # the feature is mostly not the feature. Everest reads 235-388 m low
        # (F12); the gorge reads 377 m high and turns the river uphill (F49).
        self.assertEqual(
            [p.name for p in runnable_on("full", "hero")],
            ["Everest summit", "Jinsha through Tiger Leaping Gorge"],
        )

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


class TestNamedPlaces(unittest.TestCase):
    """One coordinate per place, and the coordinate that was not (F49)."""

    @unittest.skipUnless(HAVE_RASTERIO, "needs numpy and rasterio")
    def test_the_anchors_are_the_places(self):
        # The manifest's anchors used to be their own literal table. Two
        # tables of the same coordinates is how one of them drifts 71 km.
        from nineskies.tiles import ANCHORS

        self.assertEqual(ANCHORS, places.anchors())
        self.assertTrue(ANCHORS)

    def test_the_probe_waypoints_that_are_places_come_from_the_table(self):
        yangtze = MONOTONIC_PROBES[0]
        for place_id in ("tiger-leaping-gorge", "chongqing", "yichang",
                         "wuhan", "shanghai"):
            self.assertIn(places.at(place_id), yangtze.waypoints, place_id)

    def test_no_place_is_defined_twice(self):
        ids = [p.id for p in places.PLACES]
        self.assertEqual(len(ids), len(set(ids)))
        for place in places.PLACES:
            self.assertTrue(place.source, place.id)

    def test_the_gorge_is_no_longer_seventy_one_kilometres_from_the_gorge(self):
        # The bug, stated. 26.87 N, 100.75 E was the anchor, the probe
        # waypoint and a row of the committed projection table; it is a
        # highland 721 m above the river it was named for.
        stale = (26.87, 100.75)
        self.assertNotIn(stale, [(p.lat, p.lon) for p in places.PLACES])
        for probe in MONOTONIC_PROBES:
            self.assertNotIn(stale, probe.waypoints, probe.name)
        gorge = places.BY_ID["tiger-leaping-gorge"]
        self.assertEqual(gorge.landform, "gorge")

    def test_the_gorge_is_no_longer_on_the_wall_above_the_gorge(self):
        # The second fault at the same coordinate, and the subtler one. F49
        # moved this place 71 km to the right *place*; it landed 1,260 m up
        # the cliff, and the probe kept reading the river only because a 2 km
        # channel search reached down to it (F50).
        wall = (27.18, 100.13)
        self.assertNotIn(wall, [(p.lat, p.lon) for p in places.PLACES])
        for probe in MONOTONIC_PROBES:
            self.assertNotIn(wall, probe.waypoints, probe.name)

    def test_both_waypoints_of_the_gorge_probe_promise_to_be_on_the_water(self):
        gorge = [p for p in MONOTONIC_PROBES if "Tiger Leaping" in p.name][0]
        for lat, lon in gorge.waypoints:
            place = [p for p in places.PLACES if (p.lat, p.lon) == (lat, lon)][0]
            self.assertTrue(
                place.on_channel,
                f"{place.id} is a waypoint of a river probe but does not "
                f"promise to be on the river, so nothing checks that it is",
            )

    def test_a_place_that_is_not_a_river_makes_no_such_promise(self):
        # The flag has to mean something, which means it has to be absent
        # somewhere. A city on a river bank is not a channel coordinate.
        self.assertFalse(places.BY_ID["shanghai"].on_channel)
        self.assertEqual(
            {p.id for p in places.on_channel()},
            {"shigu", "tiger-leaping-gorge", "qutang-gorge", "wu-gorge",
             "xiling-gorge"},
        )


class TestProbesReadTheOneTable(unittest.TestCase):
    """F49 moved the waypoint lists onto `places.py` and left the point
    probes carrying their own coordinates -- Lhasa's, written out twice and
    identically in two files, which is the exact duplication F49 was about
    surviving the fix for it (F50)."""

    def test_no_probe_declares_its_own_coordinates(self):
        import dataclasses

        from nineskies.probes import FlatnessProbe as F, PointProbe as P

        for cls in (P, F):
            fields = {f.name for f in dataclasses.fields(cls)}
            self.assertNotIn("lat", fields, f"{cls.__name__} stores its own lat")
            self.assertNotIn("lon", fields, f"{cls.__name__} stores its own lon")
            self.assertIn("place", fields)

    def test_every_probe_names_a_place_that_exists(self):
        for probe in (*POINT_PROBES, *FLATNESS_PROBES):
            self.assertIn(probe.place, places.BY_ID, probe.name)
        for probe in AREA_PROBES:
            self.assertIn(probe.north_place, places.BY_ID, probe.name)
            self.assertIn(probe.south_place, places.BY_ID, probe.name)

    def test_a_probe_reads_the_table_rather_than_a_copy_of_it(self):
        lhasa = [p for p in POINT_PROBES if p.place == "lhasa"][0]
        self.assertEqual((lhasa.lat, lhasa.lon), places.at("lhasa"))

    def test_the_probes_own_places_are_not_teleport_targets(self):
        # `anchor` is what keeps "somewhere to measure" apart from "somewhere
        # to be sent". Adding five probe subjects must not have added five
        # places an operator can jump to.
        for place_id in ("everest", "ayding-lake", "qinghai-lake", "heihe", "tengchong"):
            self.assertFalse(places.BY_ID[place_id].anchor, place_id)
        # Stated as the rule rather than as a count, so that siting a place an
        # operator *should* be able to jump to does not read as a regression.
        self.assertEqual(
            {p.id for p in places.PLACES if not p.anchor},
            {"everest", "ayding-lake", "qinghai-lake", "heihe", "tengchong"},
        )
        self.assertEqual(len(places.anchors()), len(places.PLACES) - 5)


class TestTheGorgeProbe(unittest.TestCase):
    """The failure the Yangtze probe was written to catch and cannot see."""

    def setUp(self):
        self.gorge = next(
            p for p in MONOTONIC_PROBES if "Tiger Leaping" in p.name
        )

    def test_it_is_two_points_on_one_river(self):
        self.assertEqual(
            list(self.gorge.waypoints),
            [places.at("shigu"), places.at("tiger-leaping-gorge")],
        )

    def test_it_is_deferred_rather_than_failed(self):
        # F12's rule: a probe that cannot pass on an artefact belongs on the
        # artefact it can pass on, listed as deferred so it is never quietly
        # absent. At 90 m this reads -28 m and passes.
        self.assertEqual(self.gorge.grid, "hero")
        self.assertEqual(self.gorge.phase, "corridor")
        self.assertNotIn(self.gorge, runnable_on("corridor"))
        self.assertIn(self.gorge, deferred_on("corridor"))

    def test_the_1_km_reading_would_fail_it(self):
        # What the built corridor actually reads at the two waypoints. This
        # is the assertion that stops the finding being only prose.
        self.assertIsNotNone(self.gorge.check([1826.0, 2152.0]))
        # ...and the source's own 30 m, and the 90 m stage 6 would cut.
        self.assertIsNone(self.gorge.check([1816.0, 1775.0]))
        self.assertIsNone(self.gorge.check([1816.0, 1788.0]))


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

        # The sampler reads its own cell size now rather than the frozen
        # country constant, so the stub has to have one. That is the whole
        # of F50's unit fix: a radius was cells wearing the name of
        # kilometres, and the two agreed on exactly one artefact.
        Stub.resolution_m = grid.RESOLUTION_M
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


@unittest.skipUnless(HAVE_RASTERIO, "needs numpy and rasterio")
class TestTheChannelCheck(unittest.TestCase):
    """The column F50 added, and the tolerance it is read against.

    A guard that has never fired is not a guard, so these reproduce the
    fault: a waypoint 1,260 m up a gorge wall, which relief could not see
    because a gorge floor and the cliff over it sit in the same 20 km box.
    """

    def tolerance(self, resolution_m):
        from nineskies.probe import channel_tolerance_m

        return channel_tolerance_m(resolution_m)

    def test_it_scales_with_the_cell_because_the_floor_does(self):
        # A cell wider than the water is mostly not water, so the honest
        # reading grows with the grid even though the ground has not moved.
        self.assertLess(self.tolerance(30), self.tolerance(90))
        self.assertLess(self.tolerance(90), self.tolerance(1000))

    def test_it_passes_every_honest_reading_measured(self):
        # The gorge waypoint, on the water, at three resolutions (F50).
        for resolution_m, above_m in ((30, 46), (90, 71), (1000, 186)):
            self.assertLess(
                above_m,
                self.tolerance(resolution_m),
                f"an honest {resolution_m} m reading would fail the check",
            )

    def test_it_catches_the_fault_it_exists_for_at_every_resolution(self):
        # 1,260 m up the wall, which passed relief, landform and the probe.
        for resolution_m in (30, 90, 1000):
            self.assertGreater(1260, self.tolerance(resolution_m))

    def test_the_honest_readings_and_the_fault_are_not_close(self):
        # The check is only worth having if there is daylight between them.
        self.assertGreater(1260 / self.tolerance(1000), 3.0)

    def test_a_place_on_a_cliff_fails_the_run(self):
        from nineskies import probe as probe_module

        class Stub:
            resolution_m = 90.0

            def elevation_m(self, lat, lon):
                # Everything sits on the floor except the gorge, which is up
                # the wall by F50's own 1,260 m.
                return 3036.0 if lat == places.BY_ID["tiger-leaping-gorge"].lat else 1817.0

            def channel_m(self, lat, lon, radius_km):
                return 1776.0

            def relief_m(self, lat, lon, radius_km):
                return 3801.0

        failures, lines = probe_module.named_places(Stub())
        self.assertTrue(failures, "a waypoint on a cliff passed the check")
        self.assertIn("Tiger Leaping Gorge", failures[0])
        self.assertIn("off the water", "\n".join(lines))

    def test_the_same_places_on_the_water_pass(self):
        from nineskies import probe as probe_module

        class Stub:
            resolution_m = 90.0

            def elevation_m(self, lat, lon):
                return 1817.0

            def channel_m(self, lat, lon, radius_km):
                return 1776.0

            def relief_m(self, lat, lon, radius_km):
                return 3801.0

        failures, lines = probe_module.named_places(Stub())
        self.assertEqual(failures, [])
        self.assertIn("on the water", "\n".join(lines))


class TestTheSamplerKnowsItsOwnCellSize(unittest.TestCase):
    """F50's unit fault: a radius in cells wearing the name of kilometres.

    `grid.RESOLUTION_M` is a frozen 1,000, so on the country grid the two
    numbers are the same and nothing showed. On stage 6's 90 m grid a "2 km"
    search reached 180 m.
    """

    @unittest.skipUnless(HAVE_RASTERIO, "needs numpy and rasterio")
    def test_the_radius_is_metres_of_ground_at_any_cell_size(self):
        from nineskies.sample import GridSampler

        class Stub:
            def __init__(self, resolution_m):
                self.resolution_m = resolution_m

        for resolution_m, expected in ((1000, 2), (90, 23), (30, 67)):
            reach = GridSampler._reach(Stub(resolution_m), 2000)
            self.assertEqual(reach, expected, f"{resolution_m} m cells")
            self.assertAlmostEqual(reach * resolution_m, 2000, delta=resolution_m)

    def test_the_source_still_names_the_constant_it_stopped_using(self):
        # The docstring explains the fault; if the code goes back to the
        # frozen constant this is what notices.
        source = (
            Path(__file__).resolve().parents[1] / "nineskies/sample.py"
        ).read_text()
        self.assertNotIn("radius_km * 1000 / grid.RESOLUTION_M", source)
        self.assertIn("self.resolution_m", source)
