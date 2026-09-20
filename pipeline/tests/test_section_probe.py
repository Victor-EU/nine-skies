"""A golden probe against a committed route section, with no world.

The probes exist to say that the pipeline's output is real ground and not
merely self-consistent ground: named places whose elevation is published
somewhere that is not us. Until now every one of them needed a built grid to
read, so they ran on one machine and CI took their result on trust.

A section is 2,932 of those elevations committed to the repository (D21), and
where an expedition's route passes through a place a probe knows about, the
probe can be run against the file instead. It is a thin check by design --
one station out of 2,932 for Sea to Sky -- and it is the only check in the
repository that asks whether a committed elevation is *true* rather than
whether it is unaltered. The signature (D23) covers the other 2,931 numbers,
and covers them only in the sense of saying where they came from.

Widening it is not a matter of writing more cases: it needs more places whose
elevation is published independently and whose coordinates a route happens to
pass through. The route touches five cities and the probe table knows one of
them.
"""

from __future__ import annotations

import json
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nineskies import probes  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SECTIONS = ROOT / "content" / "sections"

#: How near a waypoint must be to a probe to be that probe's station, degrees.
#: A tenth of a degree is about 11 km north-south, comfortably inside the
#: rounding that put the waypoint's own coordinates in the authored file, and
#: far too tight to match the wrong city.
NEAR_DEG = 0.1


def sections() -> list[dict]:
    return [json.loads(p.read_text()) for p in sorted(SECTIONS.glob("*.json"))]


def station_of(section: dict, index: int) -> int:
    """The one-kilometre station nearest waypoint `index`."""
    return 0 if index == 0 else round(section["legEndKm"][index - 1])


def probe_stations(section: dict) -> list[tuple[probes.PointProbe, int]]:
    """Every point probe this route flies over, with the station it lands on."""
    found = []
    for probe in probes.POINT_PROBES:
        for i, wp in enumerate(section["waypoints"]):
            if abs(wp["lat"] - probe.lat) <= NEAR_DEG and abs(wp["lon"] - probe.lon) <= NEAR_DEG:
                found.append((probe, station_of(section, i)))
                break
    return found


class SectionProbeTest(unittest.TestCase):
    def test_sections_are_present_and_shaped(self) -> None:
        """A missing or ragged section would make every check below vacuous."""
        found = sections()
        self.assertTrue(found, f"no committed sections under {SECTIONS}")
        for section in found:
            with self.subTest(section["expedition"]):
                ground = section["groundM"]
                self.assertEqual(len(section["waypoints"]), len(section["legEndKm"]) + 1)
                self.assertEqual(len(ground), math.ceil(section["lengthKm"]) + 1)
                self.assertTrue(all(isinstance(m, (int, float)) for m in ground))

    def test_every_route_meets_at_least_one_probe(self) -> None:
        """If a route stops passing a known place, this file stops checking it.

        Asserted rather than skipped, because a check that quietly reduces to
        nothing when the content changes is the failure mode D21 and D22 were
        both written against.
        """
        for section in sections():
            with self.subTest(section["expedition"]):
                self.assertTrue(
                    probe_stations(section),
                    f"{section['expedition']} passes no probe in probes.POINT_PROBES; "
                    "either the route moved or a probe needs adding",
                )

    def test_committed_ground_agrees_with_the_published_elevation(self) -> None:
        """The check itself: an encyclopaedia against a file in the repository."""
        for section in sections():
            for probe, station in probe_stations(section):
                with self.subTest(f"{section['expedition']} @ {probe.name}"):
                    problem = probe.check(section["groundM"][station])
                    self.assertIsNone(problem, problem)


if __name__ == "__main__":
    unittest.main()
