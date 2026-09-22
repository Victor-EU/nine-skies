/**
 * The committed ground patch (D39).
 *
 * The section suite is mostly about catching a derived file being stale, and
 * so is half of this one. The other half is the thing a section never had to
 * prove: that the artefact and the world it came from *fly the same*. A
 * section holds every number the check will read, so covering the route is the
 * whole guarantee. A patch holds a few hundred cells more than the flight
 * touches, and which ones it touches is decided by the flight.
 *
 * Which is why the interesting group here is *a patch with a hole in it*. Five
 * per cent of the file deleted leaves the challenge completing in the same
 * 68.93 seconds and reporting a *safer* flight than the real one, and that is
 * the case the whole decision is built around (F44).
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { corridorCache, loadCorridor, type GroundField } from "../../tools/corridor.ts";
import { flownCourse, courseFor, loadChallenge, specFrom } from "../../tools/challenge.ts";
import { checkChallenge } from "../../tools/challengeCheck.ts";
import { flyChallenge, type ChallengeFlight } from "../../engine/src/challenge/fly.ts";
import type { SpeedMode } from "../../engine/src/sim/scale.ts";
import {
  attestation,
  cellCount,
  cutPatch,
  marginKmFor,
  maxPatchDriftM,
  patchGround,
  patchSampler,
  readPatch,
  renderPatch,
  swathRows,
  verifyPatch,
  PATCH_DRIFT_TOLERANCE_M,
  PATCH_VERSION,
  type GroundPatch,
} from "../../tools/patch.ts";
import {
  committedSigner,
  committedVerifier,
  generateCutKey,
  privateKeyPath,
  signerFrom,
  verifierFrom,
} from "../../tools/attest.ts";
import type { Challenge } from "../../content/schema.ts";

const PATCHES = "content/patches";
const built = existsSync("dist-world/sea-to-sky/manifest.json");
/** Only the machine that cuts has the private half, so re-cutting is gated. */
const hasKey = existsSync(privateKeyPath());

const highAirfield = (): Challenge => loadChallenge("content/challenges/high-airfield.yaml");
const committed = (): GroundPatch => readPatch(PATCHES, "high-airfield")!;
const trusted = committedVerifier();

const throwaway = () => {
  const { publicPem, privatePem } = generateCutKey();
  return { sign: signerFrom(privatePem), verify: verifierFrom(publicPem) };
};

/** Fly a challenge over any ground at all, exactly as the gate does. */
const fly = (c: Challenge, field: GroundField): ChallengeFlight =>
  flyChallenge(specFrom(c), courseFor(c), c.speed as SpeedMode, {
    groundAt: (e, n) => (field.covers(e, n) ? field.groundAt(e, n) : null),
  });

describe("the patch committed for the high airfield", () => {
  it("describes the challenge that is authored today", () => {
    expect(verifyPatch(committed(), highAirfield(), trusted)).toBeNull();
  });

  it("carries the build it came from", () => {
    const patch = committed();
    expect(patch.version).toBe(PATCH_VERSION);
    expect(patch.cutFrom.resolutionM).toBe(1000);
    expect(patch.cutFrom.heightsSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(patch.cutFrom.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(patch.cutFrom.conditionedSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is as wide as the aeroplane's own turn and no wider", () => {
    // The margin is derived from the challenge, which is what lets a machine
    // with no world notice that a changed speed invalidated the ground.
    expect(committed().marginKm).toBe(marginKmFor(highAirfield()));
    // 9 km at `low` and 5,400 m. If this ever drops to nothing the patch has
    // stopped being insurance and the flight is one rounding from the edge.
    expect(committed().marginKm).toBeGreaterThan(4);
  });

  it("holds whole metres, because there is nothing to round", () => {
    // The distinction from a route section, which keeps decimetres because it
    // stores interpolated answers. These are the numbers the pipeline wrote.
    for (const row of committed().rows)
      for (const m of row.m) expect(Number.isInteger(m)).toBe(true);
  });

  it("is a few thousand cells rather than a corridor", () => {
    // 1,726 against the corridor's 4.88 M lattice samples and its 9.8 MB.
    const cells = cellCount(committed());
    expect(cells).toBeGreaterThan(500);
    expect(cells).toBeLessThan(20_000);
  });

  it("flies the challenge with no world in the room", () => {
    const report = checkChallenge(highAirfield(), () => null, PATCHES);
    expect(report.groundSource).toBe("patch");
    expect(report.patchIssue).toBeNull();
    expect(report.flight!.state).toBe("done");
    expect(report.flight!.framesWithoutGround).toBe(0);
    // Every place the challenge names has ground under it, to the decimetre.
    for (const g of report.ground) expect(g.groundM).not.toBeNull();
  });
});

describe("a challenge with neither a world nor a patch", () => {
  it("is a failure and not a pass", () => {
    const empty = mkdtempSync(join(tmpdir(), "nineskies-patches-"));
    const report = checkChallenge(highAirfield(), () => null, empty);
    expect(report.flight).toBeNull();
    expect(report.groundSource).toBeNull();
    expect(report.skipReason).toMatch(/no ground to fly it over/);
    expect(report.skipReason).toMatch(/make world/);
  });
});

describe("a patch that no longer describes its challenge", () => {
  const moved = (edit: (c: Challenge) => Challenge): string | null =>
    verifyPatch(committed(), edit(structuredClone(highAirfield())), trusted);

  it("names the place that moved", () => {
    const why = moved((c) => {
      c.objectives[1]!.lat = 29.5;
      return c;
    });
    expect(why).toMatch(/low-pass centre has moved to 29.5/);
  });

  it("notices a changed speed, because the margin moves with it", () => {
    const why = moved((c) => ({ ...c, speed: "cruise" }));
    expect(why).toMatch(/km of ground either side of its course/);
    expect(why).toMatch(/speed or its starting height/);
  });

  it("notices a changed starting height for the same reason", () => {
    expect(moved((c) => ({ ...c, start: { ...c.start, altitude_m: 1500 } }))).toMatch(
      /speed or its starting height/,
    );
  });

  it("notices an objective that has been added", () => {
    const why = moved((c) => {
      c.objectives = [c.objectives[0]!];
      return c;
    });
    expect(why).toMatch(/names 2 places, patch was cut from 3/);
  });

  it("is refused when its ground has been edited", () => {
    // The check D21 could not do, one level down: a plausible number nudged to
    // make a clearance pass. Signed with a key that is nobody's so the
    // mechanism is tested rather than this repository's file.
    const { sign, verify } = throwaway();
    const { signature: _, ...unsigned } = committed();
    const honest = { ...unsigned, signature: sign(attestation(unsigned)) };
    expect(verifyPatch(honest, highAirfield(), verify)).toBeNull();

    const rows = structuredClone(honest.rows) as Array<{ j: number; i0: number; m: number[] }>;
    rows[0]!.m[0] = rows[0]!.m[0]! - 1;
    expect(verifyPatch({ ...honest, rows }, highAirfield(), verify)).toMatch(
      /signature does not match the file/,
    );
  });

  it("is refused when there is no key to attest it with", () => {
    expect(verifyPatch(committed(), highAirfield(), null)).toMatch(/no cutting key committed/);
  });

  it("is refused when it was cut by an older build", () => {
    expect(verifyPatch({ ...committed(), version: 0 }, highAirfield(), trusted)).toMatch(
      /patch format v0/,
    );
  });
});

describe("the edge of a patch", () => {
  it("reads as nothing rather than as sea level", () => {
    const field = patchGround(committed());
    const inside = flownCourse(highAirfield())[1]!;
    expect(field.covers(inside.eastM, inside.northM)).toBe(true);
    // A thousand kilometres north of anything the challenge names. The whole
    // point of `covers` is that this is not answered with a zero (F42).
    expect(field.covers(inside.eastM, inside.northM + 1_000_000)).toBe(false);
  });
});

describe("a patch with a hole in it", () => {
  /**
   * The finding, executable, and it needs no world: a patch is a lattice and
   * a row of one can be deleted.
   *
   * Row 1314 is one kilometre of northing out of twenty-three, ninety cells
   * out of 1,726. It is what a rebuilt window or a badly resolved merge leaves
   * behind, and it is far less damage than anyone would go looking for.
   */
  const withoutRow = (j: number): GroundPatch => {
    const source = committed();
    return { ...source, rows: source.rows.filter((r) => r.j !== j) };
  };

  it("reports a completed challenge and a safer flight than the real one", () => {
    const whole = fly(highAirfield(), patchGround(committed()));
    const holed = fly(highAirfield(), patchGround(withoutRow(1314)));

    // Same state, same time, both objectives met. Nothing in any of that is
    // different from the flight over the whole world.
    expect(holed.state).toBe("done");
    expect(holed.seconds).toBe(whole.seconds);
    expect(holed.outcomes.every((o) => o.state === "met")).toBe(true);

    // And the number an author would actually read is not merely wrong, it is
    // wrong in the reassuring direction: the lowest pass the flight measured
    // was over ground it did not have, so the low pass looks like it cleared
    // by 170 m when the real flight clears by 45.
    expect(whole.minAglM).toBeLessThan(50);
    expect(holed.minAglM).toBeGreaterThan(150);

    // The one field that tells the truth, and the reason it exists (F44).
    expect(whole.framesWithoutGround).toBe(0);
    expect(holed.framesWithoutGround).toBeGreaterThan(1000);
  });

  it("is refused by the same count the cutter and the gate both read", () => {
    // Which makes the invisible failure a loud one in both places: the cutter
    // will not write this patch, and CI will not pass it.
    expect(fly(highAirfield(), patchGround(withoutRow(1314))).framesWithoutGround).toBeGreaterThan(0);
    expect(fly(highAirfield(), patchGround(withoutRow(1315))).framesWithoutGround).toBeGreaterThan(0);
  });

  it("is the small hole that is dangerous, not the large one", () => {
    // Trimmed to a tenth of its width everywhere, the aeroplane runs out of
    // ground immediately and the flight never completes. A patch that is
    // obviously broken needs no guard; this one is why there is a guard.
    const source = committed();
    const slivers = source.rows
      .map((r) => ({ ...r, i0: r.i0 + 30, m: r.m.slice(30, 40) }))
      .filter((r) => r.m.length > 0);
    const flight = fly(highAirfield(), patchGround({ ...source, rows: slivers }));
    expect(flight.state).toBe("flying");
    expect(flight.ranOutOfCourse).toBe(true);
  });

  it("still holds enough ground to fly on half a kilometre either side", () => {
    // What the margin actually needs, measured rather than assumed. The patch
    // commits nine kilometres; this is the number it is nine times.
    const { rows } = swathRows(
      { sampleAtKm: patchSampler(committed()) },
      flownCourse(highAirfield()),
      500,
    );
    const thin = fly(highAirfield(), patchGround({ ...committed(), rows }));
    const whole = fly(highAirfield(), patchGround(committed()));
    expect(thin.framesWithoutGround).toBe(0);
    expect(thin.seconds).toBe(whole.seconds);
    expect(thin.minAglM).toBe(whole.minAglM);
    // And the cost of the margin, which is the trade this decision made.
    expect(cellCount({ ...committed(), rows })).toBeLessThan(cellCount(committed()) / 5);
  });
});

describe.skipIf(!built)("cut against the world it came from", () => {
  const corridor = () => loadCorridor("dist-world/sea-to-sky")!;

  it("holds exactly the world's own numbers", () => {
    // Zero, not a tolerance. A patch is a subset of the lattice rather than a
    // resampling of it, so there is no rounding for a tolerance to cover.
    expect(maxPatchDriftM(committed(), corridor())).toBe(PATCH_DRIFT_TOLERANCE_M);
  });

  it("interpolates exactly as the corridor does, at every point a flight reads", () => {
    const c = highAirfield();
    const world = corridor();
    const field = patchGround(committed());
    let worst = 0;
    let compared = 0;
    flyChallenge(specFrom(c), courseFor(c), c.speed as SpeedMode, {
      groundAt: (e, n) => {
        if (world.covers(e, n) && field.covers(e, n)) {
          worst = Math.max(worst, Math.abs(world.groundAt(e, n) - field.groundAt(e, n)));
          compared++;
        }
        return world.covers(e, n) ? world.groundAt(e, n) : null;
      },
    });
    expect(compared).toBeGreaterThan(1000);
    expect(worst).toBe(0);
  });

  it("flies the same flight the world does, to the millisecond", () => {
    const c = highAirfield();
    const a = fly(c, corridor());
    const b = fly(c, patchGround(committed()));
    expect(b.state).toBe(a.state);
    expect(b.seconds).toBe(a.seconds);
    expect(b.minAglM).toBe(a.minAglM);
    expect(b.bounces).toBe(a.bounces);
    expect(b.framesWithoutGround).toBe(0);
  });

  it.skipIf(!hasKey)("re-cuts to the file that is committed", () => {
    // The whole point of a committed artefact: the bytes a rebuild produces
    // are the bytes in the repository, or the repository is stale.
    const result = cutPatch(highAirfield(), corridor(), committedSigner());
    expect("patch" in result).toBe(true);
    if (!("patch" in result)) return;
    expect(renderPatch(result.patch)).toBe(renderPatch(committed()));
  });

  it("refuses to cut a challenge the world has no ground under", () => {
    const c = structuredClone(highAirfield());
    // Turpan, a thousand kilometres north of the corridor.
    c.objectives[1]!.lat = 42.68;
    c.objectives[1]!.lon = 89.26;
    const result = cutPatch(c, corridor(), throwaway().sign);
    expect("problem" in result).toBe(true);
    if (!("problem" in result)) return;
    expect(result.problem).toMatch(/no ground under low-pass centre/);
    expect(result.problem).toMatch(/sea level/);
  });

  it("reads the lattice the same way the interpolator does", () => {
    // The claim underneath everything above: `sampleAtKm` is `groundAt` with
    // no fraction left over, so a patch of the first reproduces the second.
    const world = corridor();
    for (const row of committed().rows)
      for (let k = 0; k < row.m.length; k++)
        expect(world.groundAt((row.i0 + k) * 1000, row.j * 1000)).toBe(row.m[k]);
  });

  it("prefers the world and still checks the patch against it", () => {
    const report = checkChallenge(highAirfield(), corridorCache("dist-world"), PATCHES);
    expect(report.groundSource).toBe("world");
    expect(report.patchIssue).toBeNull();
  });
});


