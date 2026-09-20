import { TILE_KM } from "./syntheticTiles.js";
import { HORIZON_SAMPLE_KM } from "./horizonField.js";

/**
 * The country grid the pipeline cuts (workstream A stage 2, finding F10).
 *
 * Albers Equal Area Conic, CM 105 E, standard parallels 25 N and 47 N, 1 km
 * cells, 64 km tiles, origin at the south-west corner of tile (0, 0). Tile
 * indices reach the content hash and the save file, so these are frozen
 * constants rather than anything derived at runtime.
 *
 * They are duplicated in `pipeline/nineskies/grid.py`, which owns the
 * projection. Nothing imports across that boundary, so
 * `pipeline/tests/test_tiles.py` reads this file and fails if the two drift.
 */
export const COUNTRY_TILES_X = 105;
export const COUNTRY_TILES_Y = 69;

export const COUNTRY_EAST_KM = COUNTRY_TILES_X * TILE_KM;
export const COUNTRY_NORTH_KM = COUNTRY_TILES_Y * TILE_KM;

/** Samples in the country-wide horizon field, and its size on the wire. */
export const HORIZON_FIELD_WIDTH =
  Math.ceil(COUNTRY_EAST_KM / HORIZON_SAMPLE_KM) + 1;
export const HORIZON_FIELD_HEIGHT =
  Math.ceil(COUNTRY_NORTH_KM / HORIZON_SAMPLE_KM) + 1;
export const HORIZON_FIELD_BYTES =
  HORIZON_FIELD_WIDTH * HORIZON_FIELD_HEIGHT * 2;
