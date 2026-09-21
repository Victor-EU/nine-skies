/**
 * Which of the HUD's elements are the player's, and which two are the
 * prototype's (F47).
 *
 * F46 measured the debug column and the generated help block at 92 % of the
 * HUD's ink, none of it in the GDD's HUD paragraph, and put them behind `O`.
 * It did that by wrapping them in a `<div hidden>` - and a wrapper hides
 * whatever is inside it rather than whatever was measured. Nested in there
 * with them were the map overlay and the narration beat, so with the operator
 * column off `M` opened a 522,000 px2 map into a box with no geometry, and
 * all four of the things the game says over Expedition 1 were written to a
 * node the player has no way to see.
 *
 * Membership is therefore a list rather than a containment, and the list is
 * checked against `index.html` by `test/hud/blocks.test.ts`: every id here
 * has to exist, and no player-facing id may sit inside an operator block.
 * That test is the one that fails on the bug above.
 */

/**
 * The two blocks `O` toggles. Both are the prototype's own instrumentation:
 * frame cost, the streamed window, the pacing condition, the profile, and the
 * help block generated from the binding table.
 */
export const OPERATOR_BLOCKS = ["debug", "help"] as const;

/**
 * What the player must be able to see with the operator column off, each
 * with the sentence of the GDD that puts it there.
 *
 * `readouts` - "Minimal, always on: altitude above sea level, ground
 *               elevation, temperature, humidity, air density as a small bar."
 * `clock`    - "Time on the HUD. The clock shows Beijing time, which is the
 *               point" - the solar time goes on the map, below.
 * `mode`     - cruise/low/boost and whether boost is available, which is the
 *               density lockout the GDD's plateau is built on.
 * `messages` - the column the two of those share, so neither can be placed
 *               on top of the other.
 * `beat`     - "Narration beats trigger by location, not by timer."
 * `challenge`- a challenge's objectives and its deadline. Hidden until one is
 *               flown; a challenge whose objectives are off screen cannot be
 *               played at all.
 * `map`      - "a return-to-map button is always one press away", and the
 *               opening flight "ends with the map overlay opening once by
 *               itself so the player knows M exists".
 */
export const PLAYER_IDS = [
  "readouts",
  "clock",
  "mode",
  "messages",
  "beat",
  "challenge",
  "map",
] as const;

export type OperatorBlock = (typeof OPERATOR_BLOCKS)[number];
