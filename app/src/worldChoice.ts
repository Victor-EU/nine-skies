/**
 * Which built world the film flies.
 *
 * The country, unless the query string names another: `?world=sea-to-sky`
 * flies the phase 0 corridor, which has the two hero grids the country
 * build does not carry yet. A world's name becomes part of a URL path, so
 * anything but a plain slug is refused rather than escaped.
 */
export const DEFAULT_WORLD = "china";

const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function chooseWorld(search: string): string {
  const world = new URLSearchParams(search).get("world");
  return world !== null && NAME.test(world) ? world : DEFAULT_WORLD;
}
