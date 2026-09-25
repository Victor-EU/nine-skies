/**
 * The country's ground along the rails, finer than its tiles (F94, F95).
 *
 * Each 64 km country tile is split `NEAR_SPLIT` ways a side into 16 km
 * sub-tiles, and the sub-tiles along each rail are cut again: their relief
 * at 31.25 m (`relief.ts`) and their colour at 10 m (`colour.ts`). Each is
 * held in a pool over the sub-tiles nearest the camera (`fineColour.ts`),
 * and a country tile's instance carries, for each pool, the layer of each
 * of its sixteen sub-tiles: a row of four to a float, south to north, six
 * bits apiece from the west (`terrain.ts`).
 *
 * It imports nothing: the colour reads it, and the country tile's size
 * (`syntheticTiles.ts`) imports the colour's arrays, a circle in which one
 * side's constants would be read before they are set. The tests hold the
 * sub-tiles to the tile.
 */

/** Sub-tiles a country tile holds each way: the shader reads four to a row. */
export const NEAR_SPLIT = 4;
/** A sub-tile's side, real metres: a quarter of the country tile's 64 km. */
export const NEAR_TILE_M = 16_000;
/** The bits a layer takes in its instance's row: layers + 1 must fit, and four of them a float's 24. */
export const NEAR_LAYER_BITS = 6;
