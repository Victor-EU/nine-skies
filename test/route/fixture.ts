/**
 * The ground Expedition 1's finding suites fly over.
 *
 * Resolved exactly the way the content gate resolves it, through the same
 * `resolveGround`, so a suite and the gate cannot end up quoting different
 * metres for the same route: a world where one is built, and otherwise the
 * section committed beside the route (D21).
 *
 * That is what took these suites off the skip list. F17 to F23 are the
 * findings this repository is built on and they are asserted here to the
 * metre; until the section existed, none of those assertions ran anywhere
 * except on the one machine that had 14 GB of source rasters on it.
 *
 * Not a `.test.ts`, so vitest does not collect it.
 */
import { flyableFrom, loadExpedition, type FlyableExpedition } from "../../tools/expedition.ts";
import { resolveGround } from "../../tools/ground.ts";

export const SEA_TO_SKY_PATH = "content/expeditions/sea-to-sky.yaml";

export const seaToSkyGround = resolveGround(
  loadExpedition(SEA_TO_SKY_PATH),
  "dist-world",
  "content/sections",
);

/** False only if both the world and the committed section are missing. */
export const hasGround = seaToSkyGround.groundM !== null;

let cached: FlyableExpedition | null = null;
/** Built on first use: `skipIf` still runs a skipped suite's body to collect it. */
export function sea(): FlyableExpedition {
  if (cached === null)
    cached = flyableFrom(loadExpedition(SEA_TO_SKY_PATH), seaToSkyGround.groundM!);
  return cached;
}
