"""Stage 6 — the hero grid. Runs without GDAL or any elevation data."""

import math
import sys
import tempfile
import unittest
from pathlib import Path

try:
    import numpy as np

    HAVE_NUMPY = True
except ImportError:  # pragma: no cover - a bare interpreter
    HAVE_NUMPY = False

try:
    import rasterio  # noqa: F401

    HAVE_RASTERIO = True
except ImportError:  # pragma: no cover - a bare interpreter
    HAVE_RASTERIO = False

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nineskies import grid, hero, places  # noqa: E402


class TestTheGeometry(unittest.TestCase):
    """Arithmetic only — these must pass on an interpreter with no GDAL,
    which is why `hero.py` imports numpy and rasterio inside the functions
    that cut rather than at the top. The lattice is the half most worth
    having a test for and the half that needs nothing to run."""

    def test_a_tile_is_the_country_tiles_shape_at_a_finer_cell(self):
        # Same 128 cells and same shared edge sample, so the engine's
        # heightmap reader needs no second convention and the north-south
        # flip has one place to be got wrong rather than two.
        self.assertEqual(hero.TILE_SAMPLES, hero.TILE_CELLS + 1)
        self.assertEqual(hero.TILE_SAMPLES, 129)
        self.assertEqual(hero.TILE_M, 11_520)
        self.assertEqual(grid.TILE_SAMPLES, grid.TILE_CELLS + 1)

    def test_the_hero_grid_does_not_nest_in_the_country_grid(self):
        """The build plan's open question, answered as a fact rather than a
        preference: at 90 m there is no nesting to be had at any tile size,
        because gcd(90, 64000) is 10. The module docstring says so; this is
        the check that it stays true if anyone edits the constants."""
        self.assertNotEqual(grid.TILE_KM * 1000 % hero.TILE_M, 0)
        self.assertNotEqual(grid.RESOLUTION_M % hero.RESOLUTION_M, 0)
        self.assertEqual(math.gcd(hero.RESOLUTION_M, grid.TILE_KM * 1000), 10)
        # ...and no tile of 90 m cells would fix it either.
        self.assertNotEqual((grid.TILE_KM * 1000) % hero.RESOLUTION_M, 0)

    def test_what_makes_a_non_nesting_grid_safe_is_the_skirt(self):
        # Shared with engine/src/terrain/terrain.ts, where the ring is
        # `SKIRT_DEPTH_M * verticalExaggeration` deep and is commented "Skirts
        # must out-reach the worst height disagreement between LODs". It is a
        # contract between the two halves rather than a rendering constant:
        # `cut` refuses to publish an area whose rim disagrees by more, so if
        # the engine ever lowers this the cutter has to hear about it.
        source = (
            Path(__file__).resolve().parents[2]
            / "engine/src/terrain/terrain.ts"
        ).read_text()
        self.assertIn(f"export const SKIRT_DEPTH_M = {hero.SKIRT_DEPTH_M};", source)
        self.assertIn("skirtDepth: SKIRT_DEPTH_M *", source)

    def test_a_hero_tile_knows_which_country_tiles_it_sits_on(self):
        for hx, hy in ((0, 0), (256, 89), (259, 94), (17, 23)):
            under = hero.country_tiles_under(hx, hy)
            self.assertIn(len(under), (1, 2, 4), f"{hx},{hy} -> {under}")
            west = grid.ORIGIN_X_M + hx * hero.TILE_M
            south = grid.ORIGIN_Y_M + hy * hero.TILE_M
            step = grid.TILE_KM * 1000
            self.assertIn(
                (
                    math.floor((west - grid.ORIGIN_X_M) / step),
                    math.floor((south - grid.ORIGIN_Y_M) / step),
                ),
                under,
            )

    def test_the_lattice_shares_the_country_grids_origin(self):
        # The one thing the two grids do share, and the reason both are
        # indexed from the same corner.
        west, south, _, _ = hero.HeroArea("x", "x", 0, 0, 1, 1).bounds_m()
        self.assertEqual((west, south), (grid.ORIGIN_X_M, grid.ORIGIN_Y_M))


class TestTheAreas(unittest.TestCase):
    @unittest.skipUnless(HAVE_RASTERIO, "needs PROJ")
    def test_every_area_contains_the_places_it_is_named_for(self):
        for area in hero.AREAS:
            self.assertTrue(area.holds, f"{area.id} holds nothing")
            west, south, east, north = area.bounds_m()
            for place_id in area.holds:
                place = places.BY_ID[place_id]
                xs, ys = grid.project([place.lat], [place.lon])
                self.assertTrue(
                    west <= xs[0] <= east and south <= ys[0] <= north,
                    f"{area.id} does not contain {place_id}",
                )

    def test_the_gorge_area_holds_both_waypoints_of_the_probe_it_exists_for(self):
        area = hero.BY_ID["tiger-leaping-gorge"]
        self.assertEqual(set(area.holds), {"shigu", "tiger-leaping-gorge"})

    def test_an_unsited_area_is_named_rather_than_invented(self):
        """An area the plan names with no coordinate anything has checked is
        listed with what siting it needs, rather than invented. Writing one
        from memory is exactly what cost F49 and F50. The Three Gorges left
        this list by being measured off the source instead (F52), and the two
        that remain are not waiting on a coordinate at all -- Guilin wants a
        fetch, Zhangjiajie a source that resolves what it is named for."""
        unsited = {a for a, _, _ in hero.UNSITED}
        # Guilin left this list with design v2: sited on two places and cut
        # at the source's own 30 m, which is stage 0's question to answer.
        self.assertEqual(unsited, {"zhangjiajie"})
        for area_id in unsited:
            self.assertNotIn(area_id, hero.BY_ID)
        for _, name, why in hero.UNSITED:
            self.assertTrue(name and why)

    def test_the_plans_five_areas_are_all_accounted_for(self):
        named = {a.id for a in hero.AREAS} | {a for a, _, _ in hero.UNSITED}
        self.assertEqual(
            named,
            {"guilin", "zhangjiajie", "three-gorges", "everest",
             "tiger-leaping-gorge", "taklamakan"},
        )

    def test_an_area_is_a_whole_number_of_tiles(self):
        for area in hero.AREAS:
            self.assertEqual(area.count, area.tiles_x * area.tiles_y)
            self.assertEqual(area.width_samples, area.tiles_x * 128 + 1)
            self.assertEqual(area.height_samples, area.tiles_y * 128 + 1)

    @unittest.skipUnless(HAVE_RASTERIO, "needs PROJ")
    def test_sizing_an_area_around_places_contains_them(self):
        hx0, hy0, tx, ty = hero.area_around(("shigu", "tiger-leaping-gorge"))
        area = hero.HeroArea("t", "t", hx0, hy0, tx, ty,
                             holds=("shigu", "tiger-leaping-gorge"))
        west, south, east, north = area.bounds_m()
        for place_id in area.holds:
            place = places.BY_ID[place_id]
            xs, ys = grid.project([place.lat], [place.lon])
            self.assertTrue(west <= xs[0] <= east and south <= ys[0] <= north)


@unittest.skipUnless(HAVE_RASTERIO, "needs PROJ")
class TestTheSourceBox(unittest.TestCase):
    def test_the_box_covers_the_whole_boundary_not_just_the_corners(self):
        """Albers is conic, so a projected rectangle has curved edges in
        lat/lon: its extreme latitude is in the middle of an edge, not at a
        corner. A four-corner box would miss a source cell and the area
        would be cut over a hole."""
        for area in hero.AREAS:
            box = hero.source_box(area)
            lats, lons = hero.boundary_lonlat(area, per_edge=64)
            self.assertLessEqual(box.south, min(lats))
            self.assertGreaterEqual(box.north, max(lats))
            self.assertLessEqual(box.west, min(lons))
            self.assertGreaterEqual(box.east, max(lons))

    def test_everest_is_outside_the_corridor_that_is_built(self):
        # Which is why its probe is deferred twice over: to a phase and to a
        # grid. Recorded so the two reasons do not get confused.
        box = hero.source_box(hero.BY_ID["everest"])
        self.assertLess(box.west, grid.SEA_TO_SKY.west)


@unittest.skipUnless(HAVE_NUMPY, "needs numpy")
class TestCuttingTiles(unittest.TestCase):
    """The layout, which is the country tiler's layout at a finer cell.

    The first version of this fixture encoded `row * 1000 + col`, which on a
    2 x 2 area runs to 256,000 and is clipped to 32,767 by the Int16 cast --
    so the shared-edge test passed by comparing a saturated constant to
    itself. Row and column are separate arrays now, and `test_the_fixture_is
    _not_saturated` is here so that cannot come back.
    """

    def area(self):
        return hero.HeroArea("t", "t", 0, 0, 2, 2)

    def rows(self, area):
        """Value = raster row index. Row 0 is the area's north edge."""
        h, w = area.height_samples, area.width_samples
        return np.arange(h)[:, None] * np.ones((1, w))

    def cols(self, area):
        h, w = area.height_samples, area.width_samples
        return np.ones((h, 1)) * np.arange(w)[None, :]

    def test_the_fixture_is_not_saturated(self):
        area = self.area()
        for array in (self.rows(area), self.cols(area)):
            cut = hero.cut_tiles(array, area)
            self.assertLess(int(cut.max()), 32767)
            self.assertGreater(len(np.unique(cut)), 100)

    def test_j_runs_north_so_tile_row_zero_is_the_south_edge(self):
        area = self.area()
        cut = hero.cut_tiles(self.rows(area), area)
        self.assertEqual(cut.shape, (4, 129, 129))
        south_row = area.height_samples - 1          # the array's last row
        self.assertEqual(int(cut[0][0][0]), south_row)
        self.assertEqual(int(cut[0][128][0]), south_row - 128)

    def test_neighbours_share_their_edge_exactly(self):
        area = self.area()
        for array in (self.rows(area), self.cols(area)):
            cut = hero.cut_tiles(array, area)
            west, east = cut[0], cut[1]          # same row, i ascending
            np.testing.assert_array_equal(west[:, 128], east[:, 0])
            south, north = cut[0], cut[2]        # same column, j ascending
            np.testing.assert_array_equal(south[128, :], north[0, :])

    def test_the_order_is_the_country_tilers_order(self):
        area = self.area()
        by_col = hero.cut_tiles(self.cols(area), area)
        by_row = hero.cut_tiles(self.rows(area), area)
        # tile-row-major, j ascending then i ascending.
        self.assertGreater(int(by_col[1][0][0]), int(by_col[0][0][0]))
        self.assertLess(int(by_row[2][0][0]), int(by_row[0][0][0]))


    def test_water_lies_on_the_samples_its_heights_do(self):
        # Four bytes a sample, cut by the same function the heights are (F73).
        area = self.area()
        rows = self.rows(area)
        layer = np.stack([rows, self.cols(area), rows, rows], axis=-1).astype("int32")
        cut = hero.cut_layer(layer, area)
        self.assertEqual(cut.shape, (4, 129, 129, 4))
        np.testing.assert_array_equal(cut[..., 0], hero.cut_tiles(rows, area))
        np.testing.assert_array_equal(cut[..., 1], hero.cut_tiles(self.cols(area), area))


class TestWhatMakeHeroCuts(unittest.TestCase):
    def test_an_area_whose_publishing_is_undecided_is_cut_only_when_named(self):
        # Guilin is cut at 30 m into a lattice the engine's index cannot
        # carry (design v2, stage 0), so cells on disk must not be enough to
        # publish it (F73). Everest is published since the film wants it.
        self.assertFalse(hero.BY_ID["guilin"].published)
        self.assertTrue(hero.BY_ID["everest"].published)
        with tempfile.TemporaryDirectory() as raw:
            source = Path(raw)
            for area in hero.AREAS:
                for name in hero.missing_cells(area, source):
                    (source / f"{name}.tif").write_bytes(b"")
            ready = [a.id for a in hero.ready(source)]
        self.assertEqual(ready, ["tiger-leaping-gorge", "three-gorges", "everest", "taklamakan"])


class TestTheBias(unittest.TestCase):
    @unittest.skipUnless(HAVE_RASTERIO, "needs rasterio")
    def test_it_is_measured_here_rather_than_inherited_from_stage_two(self):
        """Two probes read this grid and pull opposite ways: the gorge wants
        the valley floor left alone, a summit wants the ridge kept. The
        country grid's 0.25 sits at the very edge of the window where both
        pass, so this is its own number (F50)."""
        from nineskies.mosaic import DEFAULT_BIAS

        self.assertNotEqual(hero.SILHOUETTE_BIAS, DEFAULT_BIAS)
        self.assertGreaterEqual(hero.SILHOUETTE_BIAS, 0.25)
        self.assertLessEqual(hero.SILHOUETTE_BIAS, 0.45)


if __name__ == "__main__":
    unittest.main()


class TestTheIndexTheEngineReads(unittest.TestCase):
    """`hero/index.json` is the only thing that tells the engine an area
    exists. It is a file rather than a line in the corridor manifest because
    that manifest is hashed into every route section's signature (D23), so an
    area appearing must not change what a section verifies against (F51)."""

    def _written(self, tmp: Path) -> dict:
        import json

        area = hero.AREAS[0]
        manifest = {
            "window": {
                "hx0": area.hx0,
                "hy0": area.hy0,
                "hx1": area.hx1,
                "hy1": area.hy1,
            },
            "heights": {"bytes": 12345},
        }
        (tmp / f"{area.id}.json").write_text(json.dumps(manifest))
        return json.loads(hero.write_index(tmp).read_text())

    def test_it_lists_what_is_on_disk_rather_than_what_is_defined(self):
        import json
        import tempfile

        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            index = self._written(tmp)
            self.assertEqual([a["id"] for a in index["areas"]], [hero.AREAS[0].id])
            # A second area defined in the module but never cut is not
            # advertised: the engine would fetch a file that is not there.
            self.assertGreater(len(hero.AREAS), 1)

            # Rebuilt from the directory, so cutting one area later does not
            # clobber the entry for one cut before it.
            second = hero.AREAS[1]
            (tmp / f"{second.id}.json").write_text(
                json.dumps(
                    {
                        "window": {
                            "hx0": second.hx0,
                            "hy0": second.hy0,
                            "hx1": second.hx1,
                            "hy1": second.hy1,
                        },
                        "heights": {"bytes": 1},
                    }
                )
            )
            again = json.loads(hero.write_index(tmp).read_text())
            self.assertEqual(
                sorted(a["id"] for a in again["areas"]),
                sorted([hero.AREAS[0].id, second.id]),
            )

    def test_it_states_the_lattice_the_engine_has_to_agree_with(self):
        import tempfile

        with tempfile.TemporaryDirectory() as raw:
            index = self._written(Path(raw))
        self.assertEqual(index["resolutionM"], hero.RESOLUTION_M)
        self.assertEqual(index["tileM"], hero.TILE_M)
        self.assertEqual(index["tileSamples"], hero.TILE_SAMPLES)
        self.assertEqual(index["origin"]["originXM"], grid.ORIGIN_X_M)
        self.assertEqual(index["origin"]["originYM"], grid.ORIGIN_Y_M)

    def test_the_engine_declares_the_fields_this_writes(self):
        """The seam between the two languages, checked the same way the skirt
        is: nothing imports across it, so the test reads the other side. A
        field renamed here and not there loads as `undefined` and the lattice
        silently becomes NaN metres wide.

        Matched as `name:` rather than as a bare substring, because the first
        version of this passed a rename of `tileM` to `tileMetres` -- the old
        name is a prefix of the new one and `in` cannot tell them apart."""
        import re
        import tempfile

        with tempfile.TemporaryDirectory() as raw:
            index = self._written(Path(raw))
        source = (
            Path(__file__).resolve().parents[2]
            / "engine/src/terrain/heroSource.ts"
        ).read_text()
        declared = source[source.index("interface HeroIndex") :]
        declared = declared[: declared.index("}")]
        for field in index:
            self.assertRegex(declared, rf"\b{re.escape(field)}\??:", f"HeroIndex: {field}")
        entry = source[source.index("interface HeroAreaEntry") :]
        entry = entry[: entry.index("}")]
        for field in index["areas"][0]:
            self.assertRegex(entry, rf"\b{re.escape(field)}\??:", f"HeroAreaEntry: {field}")
