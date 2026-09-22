"""Mapped rivers against a grid's own, on ground small enough to know (F60).

A 40 x 60 km slope draining west, with four pits sunk into it. One is crossed
by a river, one has a river end in it, one lies under a lake, and one is left
alone, so each verdict the corridor report prints is held here where its
answer is known. The lines are written in projected metres and the lake's
"projection" is the identity, because what is under test is the arithmetic
between a line and a basin, not PROJ.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from affine import Affine  # noqa: E402

from nineskies import hydro, rivers, shapefile  # noqa: E402

HEIGHT, WIDTH = 40, 60
TRANSFORM = Affine(1000.0, 0.0, 0.0, 0.0, -1000.0, HEIGHT * 1000.0)


def centre(row: float, col: float) -> tuple[float, float]:
    return col * 1000.0 + 500.0, HEIGHT * 1000.0 - row * 1000.0 - 500.0


def line(name: str, points: list[tuple[float, float]]) -> rivers.Line:
    """A line through cell centres given as (row, col)."""
    xy = [centre(r, c) for r, c in points]
    return rivers.Line(
        feature=0,
        name=name,
        x=np.array([p[0] for p in xy]),
        y=np.array([p[1] for p in xy]),
    )


def identity(lats: list[float], lons: list[float]) -> tuple[list[float], list[float]]:
    return lons, lats


PITS = {
    "crossed": (slice(5, 10), slice(10, 20)),
    "ends": (slice(20, 25), slice(10, 15)),
    "lake": (slice(20, 25), slice(30, 35)),
    "alone": (slice(30, 35), slice(45, 50)),
}


def ground(fetched: np.ndarray | None = None) -> rivers.Grid:
    heights = 100.0 + 0.1 * np.arange(WIDTH, dtype="float32")[None, :].repeat(HEIGHT, axis=0)
    for rows, cols in PITS.values():
        heights[rows, cols] = 80.0
    if fetched is None:
        fetched = np.ones((HEIGHT, WIDTH), dtype=bool)
    return rivers.Grid(heights=heights.astype("float32"), transform=TRANSFORM, fetched=fetched)


def labelled(g: rivers.Grid) -> tuple[np.ndarray, dict[str, int]]:
    labels, _ = hydro.basins(g.heights, hydro.flood(g.heights))
    return labels, {name: int(labels[rows.start, cols.start]) for name, (rows, cols) in PITS.items()}


THROUGH = line("Through", [(7, 5), (7, 25)])
INTO = line("Into", [(22, 2), (22, 12)])


class TestWalking(unittest.TestCase):
    def test_no_step_is_longer_than_asked_and_every_vertex_is_kept(self) -> None:
        x, y = rivers.walk(np.array([0.0, 1000.0, 1000.0]), np.array([0.0, 0.0, 600.0]), 250.0)
        self.assertLessEqual(float(np.hypot(np.diff(x), np.diff(y)).max()), 250.0 + 1e-9)
        for vertex in ((0.0, 0.0), (1000.0, 0.0), (1000.0, 600.0)):
            self.assertTrue(any(np.isclose(x, vertex[0]) & np.isclose(y, vertex[1])))

    def test_a_point_off_the_grid_is_no_cell(self) -> None:
        g = ground()
        cells = g.cells(np.array([500.0, -1.0, 500.0]), np.array([39_500.0, 39_500.0, 40_001.0]))
        self.assertEqual(list(cells), [0, -1, -1])

    def test_distance_to_a_line_is_to_its_segments_not_its_vertices(self) -> None:
        segment = rivers.Line(0, "s", np.array([0.0, 1000.0]), np.array([0.0, 0.0]))
        self.assertAlmostEqual(rivers.distance_to_lines(500.0, 300.0, [segment]), 300.0)
        self.assertAlmostEqual(rivers.distance_to_lines(1300.0, 400.0, [segment]), 500.0)


class TestCrossings(unittest.TestCase):
    def test_a_line_through_a_basin_crosses_its_rim_twice(self) -> None:
        self.assertEqual(rivers.crossings(np.array([0, 0, 1, 1, 1, 1, 0, 0]), 2), {1: 2})

    def test_a_line_that_ends_inside_crosses_once(self) -> None:
        """The last run counts however short: the line has gone in."""
        self.assertEqual(rivers.crossings(np.array([0, 0, 0, 0, 1]), 2), {1: 1})

    def test_a_line_tracing_the_rim_is_not_crossing_it(self) -> None:
        along = np.array([0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0])
        self.assertEqual(rivers.crossings(along, 2), {1: 2})
        self.assertEqual(rivers.crossings(along, 1), {1: 4})

    def test_two_basins_back_to_back_are_each_crossed(self) -> None:
        self.assertEqual(rivers.crossings(np.array([0, 0, 2, 2, 2, 1, 1, 1, 0]), 2), {2: 2, 1: 2})


class TestMouths(unittest.TestCase):
    def test_a_system_ends_at_its_lowest_free_end(self) -> None:
        g = ground()
        [mouth] = rivers.mouths([INTO], g)
        self.assertEqual(divmod(mouth, WIDTH), (22, 12))

    def test_a_tributary_that_stops_short_of_its_river_is_part_of_it(self) -> None:
        """Natural Earth stops some tributaries short of the line they join."""
        g = ground()
        tributary = line("Tributary", [(1, 15), (6.2, 15)])  # 800 m short of THROUGH
        self.assertEqual(len(rivers.mouths([THROUGH, tributary], g)), 1)
        self.assertEqual(len(rivers.mouths([THROUGH, tributary], g, join_m=500.0)), 2)

    def test_a_system_reaching_unfetched_ground_has_no_mouth(self) -> None:
        fetched = np.ones((HEIGHT, WIDTH), dtype=bool)
        fetched[:, :4] = False
        self.assertEqual(rivers.mouths([INTO], ground(fetched)), [])


class TestVerdicts(unittest.TestCase):
    def verdicts(self, g: rivers.Grid, lake: bool = True) -> dict[str, rivers.Verdict]:
        labels, pits = labelled(g)
        lakes = np.zeros((HEIGHT, WIDTH), dtype="int32")
        if lake:
            ring = np.array([[30.0, 25.0], [30.0, 20.0], [35.0, 20.0], [35.0, 25.0], [30.0, 25.0]])
            outer = np.column_stack([ring[:, 0] * 1000.0, HEIGHT * 1000.0 - ring[:, 1] * 1000.0])
            lakes = rivers.lakes_raster(
                [shapefile.Shape("polygon", (outer,), {})], g, project=identity
            )
        lines = [THROUGH, INTO]
        said = rivers.verdicts(
            labels, list(pits.values()), lines, lakes, ["A Lake"], g,
            ends_at=rivers.mouths(lines, g),
        )
        return {name: said[label] for name, label in pits.items()}

    def test_each_pit_gets_the_answer_its_map_gives(self) -> None:
        said = self.verdicts(ground())
        self.assertEqual(said["crossed"].says, rivers.CROSSED)
        self.assertEqual(said["crossed"].rivers, ("Through",))
        self.assertEqual(said["ends"].says, rivers.ENDS)
        self.assertEqual(said["lake"].says, rivers.LAKE)
        self.assertEqual(said["lake"].lakes, ("A Lake",))
        self.assertEqual(said["alone"].says, rivers.SILENT)

    def test_without_a_mouth_a_river_that_goes_in_has_only_gone_in(self) -> None:
        fetched = np.ones((HEIGHT, WIDTH), dtype=bool)
        fetched[:, :4] = False
        self.assertEqual(self.verdicts(ground(fetched))["ends"].says, rivers.ONCE)

    def test_a_lake_s_hole_is_not_lake(self) -> None:
        g = ground()
        # Clockwise outside, anticlockwise inside: the shapefile's own rule.
        outer = np.array([[30.5, 29.5], [30.5, 39.5], [40.5, 39.5], [40.5, 29.5], [30.5, 29.5]]) * 1000.0
        hole = np.array([[33.5, 32.5], [37.5, 32.5], [37.5, 36.5], [33.5, 36.5], [33.5, 32.5]]) * 1000.0
        raster = rivers.lakes_raster([shapefile.Shape("polygon", (outer, hole), {})], g, project=identity)
        row = lambda y: int(HEIGHT - y)  # noqa: E731
        self.assertEqual(raster[row(38), 31], 1)
        self.assertEqual(raster[row(35), 35], 0)


class TestChannelOffsets(unittest.TestCase):
    def test_a_line_two_cells_off_a_channel_is_two_kilometres_off(self) -> None:
        g = ground()
        acc = np.ones((HEIGHT, WIDTH))
        acc[:, 30] = 5000
        near = line("Near", [(5, 32), (35, 32)])
        far = line("Far", [(5, 50), (35, 50)])
        offsets = rivers.channel_offsets([near, far], acc, g, threshold_km2=1000, search=15)
        np.testing.assert_allclose(offsets["Near"], 2.0)
        self.assertTrue(np.isinf(offsets["Far"]).all())

    def test_only_fetched_ground_is_measured(self) -> None:
        fetched = np.ones((HEIGHT, WIDTH), dtype=bool)
        fetched[20:, :] = False
        acc = np.ones((HEIGHT, WIDTH))
        acc[:, 30] = 5000
        near = line("Near", [(5, 32), (35, 32)])
        every = rivers.channel_offsets([near], acc, ground(), threshold_km2=1000)["Near"]
        some = rivers.channel_offsets([near], acc, ground(fetched), threshold_km2=1000)["Near"]
        self.assertLess(len(some), len(every))


if __name__ == "__main__":
    unittest.main()
