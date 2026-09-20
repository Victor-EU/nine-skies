/**
 * The committed route section (D21).
 *
 * A derived file checked in beside its source is only safe if it can be
 * caught being stale, so most of this suite is about catching it. The two
 * world-gated tests at the bottom are the ones that need the data: that a
 * freshly cut section is the one already committed, and that a corridor
 * refuses to cut a route that leaves it.
 *
 * D23 added a third thing to catch — a file whose route is untouched and
 * whose ground has been edited — and it is checked here twice over. Against
 * a throwaway key pair, which tests the mechanism, and against the key the
 * repository actually committed, which tests this file.
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { loadCorridor, type Corridor } from "../../tools/corridor.ts";
import { loadExpedition } from "../../tools/expedition.ts";
import {
  cutSection,
  readSection,
  renderSection,
  verifySection,
  attestation,
  SECTION_VERSION,
  type RouteSection,
} from "../../tools/section.ts";
import {
  committedSigner,
  committedVerifier,
  generateCutKey,
  privateKeyPath,
  signerFrom,
  verifierFrom,
  type Signer,
} from "../../tools/attest.ts";
import type { Expedition } from "../../content/schema.ts";

const SECTIONS = "content/sections";
const built = existsSync("dist-world/sea-to-sky/manifest.json");

const seaToSky = (): Expedition => loadExpedition("content/expeditions/sea-to-sky.yaml");
const committed = (): RouteSection => readSection(SECTIONS, "sea-to-sky")!;
/** The repository's own key — the one CI checks the committed file against. */
const trusted = committedVerifier();

/**
 * A key pair belonging to nobody, for the tests that are about signing rather
 * than about this repository's section. Generated per call so no test can
 * pass because an earlier one left something behind.
 */
const throwaway = () => {
  const { publicPem, privatePem } = generateCutKey();
  return { sign: signerFrom(privatePem), verify: verifierFrom(publicPem) };
};

describe("the section committed for Expedition 1", () => {
  it("describes the route that is authored today", () => {
    // If this fails, someone edited the YAML and did not re-cut. It is the
    // cheapest test in the repo and it is the one that makes the rest of the
    // committed ground trustworthy.
    expect(verifySection(committed(), seaToSky(), trusted)).toBeNull();
  });

  it("carries the build it came from", () => {
    const section = committed();
    expect(section.version).toBe(SECTION_VERSION);
    expect(section.cutFrom.resolutionM).toBe(1000);
    expect(section.cutFrom.heightsSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("holds one station per kilometre of route, plus the end", () => {
    const section = committed();
    expect(section.groundM).toHaveLength(Math.ceil(section.lengthKm) + 1);
    // Sea to Sky is 2,931 km of China and none of it is below the Turpan
    // depression or above Everest; a section full of zeroes would mean the
    // route had been cut from a corridor that does not cover it.
    expect(Math.min(...section.groundM)).toBeGreaterThan(-200);
    expect(Math.max(...section.groundM)).toBeGreaterThan(4000);
  });

  it("survives the round trip through its own file format", () => {
    // Every number the gate prints depends on the decimals coming back
    // exactly as they went in: whole metres move Expedition 1's arrival by
    // 3.2 m, which is the difference between 1,588 and 1,584 in the report.
    const section = committed();
    const reparsed = JSON.parse(renderSection(section)) as RouteSection;
    expect(reparsed.groundM).toEqual(section.groundM);
    expect(reparsed.lengthKm).toBe(section.lengthKm);
  });
});

describe("a section that no longer describes its route", () => {
  const withRoute = (mutate: (e: Expedition) => Expedition): string | null =>
    verifySection(committed(), mutate(seaToSky()), trusted);

  it("names the waypoint that moved", () => {
    const moved = withRoute((e) => ({
      ...e,
      route: e.route.map((p, i) => (i === 1 ? { ...p, lon: 114.9 } : p)),
    }));
    expect(moved).toMatch(/waypoint 1 \(wuhan\) has moved/);
  });

  it("catches a waypoint being added or removed", () => {
    expect(withRoute((e) => ({ ...e, route: e.route.slice(0, 3) }))).toMatch(
      /route has 3 waypoints, section was cut from 5/,
    );
  });

  it("catches the route being handed to the wrong expedition", () => {
    expect(withRoute((e) => ({ ...e, id: "silk-road" }))).toMatch(/section is for sea-to-sky/);
  });

  it("catches a format it cannot read", () => {
    const future = { ...committed(), version: SECTION_VERSION + 1 };
    expect(verifySection(future, seaToSky(), trusted)).toMatch(/this build reads v/);
  });

  it("catches ground that has lost stations", () => {
    // Signed, deliberately. Since D23 a truncated file fails on its signature
    // long before anyone counts its stations, so this check has stopped being
    // about tampering and is now about the cutter: a `profileAlong` that ever
    // returned the wrong number of samples would sign the mismatch and this
    // is what would notice.
    const { sign, verify } = throwaway();
    const { signature, ...unsigned } = committed();
    const short = { ...unsigned, groundM: unsigned.groundM.slice(0, -3) };
    expect(
      verifySection({ ...short, signature: sign(attestation(short)) }, seaToSky(), verify),
    ).toMatch(/stations for a .* route/);
  });
});

describe("a corridor that does not match its own manifest", () => {
  it("cuts nothing, because the stamp would be a wish", () => {
    // Until D23 the SHA a section carries was copied out of the manifest, so
    // it recorded what the build *said* it had written rather than what was
    // on disk. Nothing in the repository had ever compared the two.
    const manifest = {
      corridor: "sea-to-sky",
      resolutionM: 1000,
      window: { tx0: 0, ty0: 0, tx1: 99, ty1: 99 },
      anchors: {},
      start: { eastM: 0, northM: 0, altitudeM: 0, headingRad: 0 },
      heights: { tiles: 1, sha256: "a".repeat(64) },
    };
    const lying: Corridor = {
      manifest,
      heightsSha256: "b".repeat(64),
      groundAt: () => 100,
      covers: () => true,
    };
    const result = cutSection(seaToSky(), lying, throwaway().sign);
    expect("problem" in result).toBe(true);
    if (!("problem" in result)) return;
    expect(result.problem).toMatch(/does not match its own manifest/);
    expect(result.problem).toMatch(/make world CORRIDOR=sea-to-sky/);
  });
});

describe("a section whose ground has been edited", () => {
  /** The committed section, re-signed by a key that is nobody's. */
  const resigned = () => {
    const { sign, verify } = throwaway();
    const { signature, ...unsigned } = committed();
    return { verify, section: { ...unsigned, signature: sign(attestation(unsigned)) } };
  };

  it("is refused, naming the only legitimate way to change it", () => {
    // The check D21 could not do. Before D23 this file was flown: the route
    // it describes is untouched, the legs still recompute, the station count
    // is right, and 2,366 km of clearance had been quietly lowered by 40 m.
    const { verify, section } = resigned();
    const edited = { ...section, groundM: section.groundM.map((m, i) => (i === 2366 ? m - 40 : m)) };
    expect(verifySection(edited, seaToSky(), verify)).toMatch(/signature does not match/);
    expect(verifySection(edited, seaToSky(), verify)).toMatch(/content:sections/);
  });

  it("is refused for a single decimetre, not just for a mountain", () => {
    const { verify, section } = resigned();
    const nudged = { ...section, groundM: section.groundM.map((m, i) => (i === 0 ? m + 0.1 : m)) };
    expect(verifySection(nudged, seaToSky(), verify)).toMatch(/signature does not match/);
  });

  it("verifies through a reformat, because the signature covers values", () => {
    // Reindenting a JSON file is something tooling does on its own. If that
    // broke the signature, the first response to a failure would be to
    // re-cut, and re-cutting a file nobody had actually tampered with is how
    // a check earns a reputation for crying wolf.
    const { verify, section } = resigned();
    const reparsed = JSON.parse(JSON.stringify(section, null, 8)) as RouteSection;
    expect(verifySection(reparsed, seaToSky(), verify)).toBeNull();
  });
});

describe("a section the repository has no reason to trust", () => {
  it("is refused when it was signed with a different key", () => {
    const { sign } = throwaway();
    const { verify } = throwaway();
    const { signature, ...unsigned } = committed();
    const foreign = { ...unsigned, signature: sign(attestation(unsigned)) };
    expect(verifySection(foreign, seaToSky(), verify)).toMatch(/signature does not match/);
  });

  it("is refused when it carries no signature at all", () => {
    const { verify } = throwaway();
    expect(verifySection({ ...committed(), signature: "" }, seaToSky(), verify)).toMatch(
      /unsigned/,
    );
  });

  it("is refused when no public key is committed, rather than waved through", () => {
    // The failure mode this guards is deletion: if a missing key meant "skip
    // the signature check", removing one file would turn the attestation off
    // everywhere and nothing would say so.
    expect(verifySection(committed(), seaToSky(), null)).toMatch(/no cutting key committed/);
  });

  it("is the committed file, checked against the committed key", () => {
    // The one in this suite that is not about the mechanism. It is the gate:
    // if content/sections/sea-to-sky.json has been touched by anything other
    // than a cut, CI stops here.
    expect(trusted).not.toBeNull();
    expect(verifySection(committed(), seaToSky(), trusted)).toBeNull();
  });
});

const signable = built && existsSync(privateKeyPath());

describe.skipIf(!signable)("cutting one from a built world", () => {
  // The real key, because this block asserts byte-identity with the file that
  // is committed and the signature is part of it. Ed25519 is deterministic,
  // so the same cut signed with the same key is the same bytes.
  //
  // Lazy, and not as a style preference: `describe.skipIf` evaluates suite
  // bodies at collection even when the guard is false, so reading the key
  // here eagerly fails this whole file on the one machine that is guaranteed
  // not to have one, which is CI.
  const sign = (...args: Parameters<Signer>) => committedSigner()(...args);

  it("reproduces the file that is already committed", () => {
    // `make world` ends by re-cutting, so a corridor rebuild that changed the
    // ground would change this file. That it does not is what lets the
    // committed copy stand in for 9.8 MB of heightfield.
    const result = cutSection(seaToSky(), loadCorridor("dist-world/sea-to-sky")!, sign);
    expect("section" in result).toBe(true);
    if (!("section" in result)) return;
    expect(renderSection(result.section)).toBe(renderSection(committed()));
  }, 30_000);

  it("refuses to cut a route that leaves the corridor", () => {
    // Outside its window the reader answers zero, which is sea level. A
    // section cut that way would put the route over calm water and pass
    // every check in the repo, which is the one failure a gate must not have.
    const north: Expedition = {
      ...seaToSky(),
      route: [seaToSky().route[0]!, { id: "harbin", name: "Harbin", lat: 45.8, lon: 126.53, speed: "cruise" }],
    };
    const result = cutSection(north, loadCorridor("dist-world/sea-to-sky")!, sign);
    expect("problem" in result).toBe(true);
    if (!("problem" in result)) return;
    expect(result.problem).toMatch(/leaves corridor sea-to-sky at km \d+/);
    expect(result.problem).toMatch(/sea level/);
  }, 30_000);
});
