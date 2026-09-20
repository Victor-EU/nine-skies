"""Stage 4 and 5 layout tests.

These check orientation and seams, which are the two things that fail silently.
A north-south flip produces a world that looks entirely plausible and is
mirrored; a missing shared edge produces a crack that only shows up in flight.
Both are cheap to test and expensive to find later, so they are tested against
synthetic arrays and run without any elevation data.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    import numpy as np

    HAVE_NUMPY = True
except ImportError:
    HAVE_NUMPY = False

from nineskies import grid  # noqa: E402


@unittest.skipUnless(HAVE_NUMPY, "needs numpy (pipeline/.venv)")
class TestTileCutting(unittest.TestCase):
    def setUp(self) -> None:
        from nineskies import tiles

        self.tiles = tiles
        self.window = grid.TileWindow(4, 7, 7, 9)  # 3 x 2 tiles
        shape = (self.window.height_samples, self.window.width_samples)
        # Elevation that rises northward and eastward, so a flip is visible.
        rows = np.arange(shape[0])[:, None]
        cols = np.arange(shape[1])[None, :]
        north = (shape[0] - 1) - rows  # raster row 0 is the *north* edge
        self.array = (north * 3 + cols).astype("float32")
        self.cut = tiles.cut_tiles(self.array, self.window)

    def test_one_tile_per_window_cell(self) -> None:
        self.assertEqual(self.cut.shape, (6, 65, 65))

    def test_elevation_rises_northward_in_the_output(self) -> None:
        """j runs north. If this flips, the whole country is upside down."""
        for t in range(self.cut.shape[0]):
            self.assertGreater(int(self.cut[t, 64, 0]), int(self.cut[t, 0, 0]))

    def test_elevation_rises_eastward_in_the_output(self) -> None:
        for t in range(self.cut.shape[0]):
            self.assertGreater(int(self.cut[t, 0, 64]), int(self.cut[t, 0, 0]))

    def test_tile_order_is_row_major_with_ty_ascending(self) -> None:
        # Tile 0 is the south-west tile; tile 3 starts the next row north.
        south_west = self.cut[0]
        north_west = self.cut[3]
        self.assertGreater(int(north_west[0, 0]), int(south_west[0, 0]))

    def test_east_west_neighbours_share_their_edge_exactly(self) -> None:
        for row in range(self.window.tiles_y):
            for col in range(self.window.tiles_x - 1):
                left = self.cut[row * self.window.tiles_x + col]
                right = self.cut[row * self.window.tiles_x + col + 1]
                np.testing.assert_array_equal(left[:, 64], right[:, 0])

    def test_north_south_neighbours_share_their_edge_exactly(self) -> None:
        for row in range(self.window.tiles_y - 1):
            for col in range(self.window.tiles_x):
                south = self.cut[row * self.window.tiles_x + col]
                north = self.cut[(row + 1) * self.window.tiles_x + col]
                np.testing.assert_array_equal(south[64, :], north[0, :])

    def test_sample_index_agrees_with_the_cut(self) -> None:
        """The one mapping the engine and the pipeline must share."""
        for t, (ty, tx) in enumerate(
            (ty, tx)
            for ty in range(self.window.ty0, self.window.ty1)
            for tx in range(self.window.tx0, self.window.tx1)
        ):
            for i, j in ((0, 0), (64, 0), (0, 64), (64, 64), (31, 17)):
                row, col = grid.sample_index(self.window, tx, ty, i, j)
                self.assertEqual(int(self.cut[t, j, i]), int(self.array[row, col]))


@unittest.skipUnless(HAVE_NUMPY, "needs numpy (pipeline/.venv)")
class TestHorizonField(unittest.TestCase):
    def setUp(self) -> None:
        from nineskies import tiles

        self.tiles = tiles
        self.window = grid.TileWindow(8, 8, 16, 12)

    def test_field_matches_the_engines_shape(self) -> None:
        width, height = self.tiles.field_shape()
        self.assertEqual(width, grid.WIDTH_CELLS // self.tiles.HORIZON_SAMPLE_KM + 1)
        self.assertEqual(height, grid.HEIGHT_CELLS // self.tiles.HORIZON_SAMPLE_KM + 1)

    def test_flat_ground_stays_flat(self) -> None:
        array = np.full(
            (self.window.height_samples, self.window.width_samples), 1500.0, "float32"
        )
        field = self.tiles.reduce_to_field(array, self.window)
        inside = field[
            self.window.ty0 * 8 + 1 : self.window.ty1 * 8 - 1,
            self.window.tx0 * 8 + 1 : self.window.tx1 * 8 - 1,
        ]
        self.assertTrue(np.all(inside == 1500))

    def test_a_crest_survives_the_reduction(self) -> None:
        """A plain mean would shave this to a tenth of its height."""
        array = np.zeros(
            (self.window.height_samples, self.window.width_samples), "float32"
        )
        array[40, :] = 8000.0  # a one-cell-wide ridge running east-west
        field = self.tiles.reduce_to_field(array, self.window)
        peak = int(field.max())
        mean_only = 8000.0 / 9  # a 9-cell block, one cell of ridge
        self.assertGreater(peak, 4000, "the crest was shaved off")
        self.assertGreater(peak, mean_only * 3)
        self.assertLess(peak, 8000, "a plain maximum would inflate flat ground")

    def test_outside_the_corridor_is_open_sea(self) -> None:
        array = np.full(
            (self.window.height_samples, self.window.width_samples), 4000.0, "float32"
        )
        field = self.tiles.reduce_to_field(array, self.window)
        self.assertEqual(int(field[0, 0]), 0)
        self.assertEqual(int(field[-1, -1]), 0)

    def test_the_bias_is_the_engines_constant(self) -> None:
        self.assertEqual(self.tiles.SILHOUETTE_BIAS, 0.6)
        self.assertEqual(self.tiles.HORIZON_SAMPLE_KM, 8)


if __name__ == "__main__":
    unittest.main()


class TestConstantsMatchTheEngine(unittest.TestCase):
    """The pipeline and the engine must agree, and nothing else enforces it.

    Every doc in this repo promises that the wall you fly at and the wall on
    the map are one artefact. That promise is four numbers shared across a
    language boundary, with no compiler and no import between them — so it is
    checked here by reading the TypeScript.
    """

    @staticmethod
    def ts_const(relative: str, name: str) -> float:
        import re

        root = Path(__file__).resolve().parents[2]
        text = (root / relative).read_text()
        match = re.search(
            rf"export const {name}\s*(?::\s*number)?\s*=\s*([0-9.]+)", text
        )
        if match is None:
            match = re.search(rf"^const {name}\s*=\s*([0-9.]+)", text, re.MULTILINE)
        assert match is not None, f"{name} not found in {relative}"
        return float(match.group(1))

    def test_silhouette_bias(self) -> None:
        from nineskies import tiles

        self.assertEqual(
            tiles.SILHOUETTE_BIAS,
            self.ts_const("engine/src/terrain/horizonField.ts", "SILHOUETTE_BIAS"),
        )

    def test_horizon_sample_spacing(self) -> None:
        from nineskies import tiles

        self.assertEqual(
            tiles.HORIZON_SAMPLE_KM,
            self.ts_const("engine/src/terrain/horizonField.ts", "HORIZON_SAMPLE_KM"),
        )

    def test_tile_size(self) -> None:
        self.assertEqual(
            grid.TILE_KM,
            self.ts_const("engine/src/terrain/syntheticTiles.ts", "TILE_KM"),
        )

    def test_tile_samples(self) -> None:
        self.assertEqual(
            grid.TILE_SAMPLES,
            self.ts_const("engine/src/terrain/tileArray.ts", "TILE_SAMPLES"),
        )

    def test_country_grid_shape(self) -> None:
        """Finding F10's numbers, which the engine now needs for the map."""
        self.assertEqual(
            grid.TILES_X,
            self.ts_const("engine/src/terrain/worldGrid.ts", "COUNTRY_TILES_X"),
        )
        self.assertEqual(
            grid.TILES_Y,
            self.ts_const("engine/src/terrain/worldGrid.ts", "COUNTRY_TILES_Y"),
        )
