/**
 * The sightlines beside the scenes (F133): when each monument is behind the
 * ground, worked out from the built world, read into each scene's `behind`,
 * and a problem when they were worked out for a rail or a place the scene
 * no longer has.
 */
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { placeKey } from "../../engine/src/cast/sight.js";
import { loadFilm, railDigest, type Sightlines } from "../../tools/film.ts";

const HUANGSHAN = "content/scenes/01-huangshan.yaml";
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Huangshan alone in a folder of its own, with these sightlines beside it, or none. */
function huangshanWith(lines: ((digest: string, places: string[]) => Sightlines) | null) {
  const dir = mkdtempSync(join(tmpdir(), "ns-sightlines-"));
  dirs.push(dir);
  copyFileSync(HUANGSHAN, join(dir, "01-huangshan.yaml"));
  const bare = loadFilm(dir, {}, { sightlines: false }).film.scenes[0]!;
  const places = bare.cast.flatMap((c) => (c.role === "monument" && c.at ? [placeKey(c.at)] : []));
  if (lines) writeFileSync(join(dir, "sightlines.json"), JSON.stringify(lines(railDigest(bare), places)));
  const loaded = loadFilm(dir);
  return { scene: loaded.film.scenes[0]!, problems: loaded.problems.filter((p) => /sightline/.test(p.message)), places };
}

describe("the sightlines", () => {
  it("are current for every scene of the film, and give Huangshan's kings their spans behind the ground", () => {
    const { film, problems } = loadFilm();
    expect(problems.filter((p) => /sightline/.test(p.message))).toEqual([]);
    const huangshan = film.scenes.find((s) => s.id === "huangshan")!;
    for (const c of huangshan.cast.filter((c) => c.role === "monument")) expect(huangshan.behind?.[placeKey(c.at!)], c.variant!).toBeDefined();
  });

  it("are read into the scene when worked out for its rail and places", () => {
    const { scene, problems, places } = huangshanWith((rail, places) => ({ scenes: { huangshan: { rail, places: Object.fromEntries(places.map((k) => [k, [[1, 2]]])) } } }));
    expect(problems).toEqual([]);
    expect(Object.keys(scene.behind!).sort()).toEqual([...places].sort());
  });

  it("are a problem when missing, worked out for another rail, or missing a place", () => {
    expect(huangshanWith(null).problems[0]?.message).toMatch(/no sightlines/);
    const moved = huangshanWith((_, places) => ({ scenes: { huangshan: { rail: "another", places: Object.fromEntries(places.map((k) => [k, []])) } } }));
    expect(moved.problems[0]?.message).toMatch(/rail has changed/);
    expect(moved.scene.behind).toBeUndefined();
    const short = huangshanWith((rail, places) => ({ scenes: { huangshan: { rail, places: Object.fromEntries(places.slice(1).map((k) => [k, []])) } } }));
    expect(short.problems[0]?.message).toContain(short.places[0]!);
  });
});
