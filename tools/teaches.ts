/**
 * Whether a route delivers the lesson its own file claims (G2).
 *
 * Every expedition declares one: `teaches: The three steps, and why the west
 * is sparse`. The schema checks that the field is not empty — "say what it
 * teaches, or it is a flight not an expedition" — and nothing has ever
 * checked whether the flight does it. G2's first pass criterion is that seven
 * of ten players sketch that lesson back: an east-to-west profile with three
 * steps, west higher, the plateau drawn as a flat top rather than a peak. A
 * cohort can only sketch what the route showed them.
 *
 * Two measurements, because those are the two halves of the claim.
 *
 * **Time over each step**, not distance over each step. A player sketching
 * from memory weights by how long they were somewhere, and this route's
 * airspeed rises by nearly three times as the air thins (F28), so the
 * kilometre shares and the minute shares are different numbers and only one
 * of them is the one a sketch is drawn from.
 *
 * **Flatness**, because "a flat top rather than a peak" is a claim about
 * shape and shape is measurable. Not a term of art: the longest run of
 * profile staying within a tolerance of its own start, the standard
 * deviation, and the number of times the ground reverses by more than half a
 * kilometre. A section that scores worse than the eastern plain on all three
 * is not going to be drawn as a flat top by anybody.
 */
import { steepestRise, type Escarpment, type GroundProfile, type TrackSample } from "../engine/src/sim/route.ts";
import { profileOf } from "./session.ts";

/** China's three steps, as the GDD states them, by the ground's own height. */
export const STEPS: readonly { readonly name: string; readonly belowM: number }[] = [
  { name: "third step (< 500 m)", belowM: 500 },
  { name: "second step (500–2,000 m)", belowM: 2_000 },
  { name: "first step (> 2,000 m)", belowM: Infinity },
];

export interface StepShare {
  readonly name: string;
  readonly minutes: number;
  /** Fraction of the flight, 0 to 1. */
  readonly share: number;
}

export function stepMinutes(
  track: readonly TrackSample[],
  ground: GroundProfile,
): StepShare[] {
  const minutes = STEPS.map(() => 0);
  let previous = 0;
  for (const sample of track) {
    const dt = (sample.seconds - previous) / 60;
    previous = sample.seconds;
    const height = ground(sample.km);
    const step = STEPS.findIndex((s) => height < s.belowM);
    if (step >= 0) minutes[step]! += dt;
  }
  const total = minutes.reduce((a, b) => a + b, 0) || 1;
  return STEPS.map((s, i) => ({
    name: s.name,
    minutes: minutes[i]!,
    share: minutes[i]! / total,
  }));
}

export interface Flatness {
  /** Longest stretch staying within `toleranceM` of wherever it began, km. */
  readonly longestFlatKm: number;
  readonly sdM: number;
  /** Times the ground reversed by more than `reversalM` across the section. */
  readonly reversals: number;
  readonly lowM: number;
  readonly highM: number;
}

export function flatness(
  profileM: readonly number[],
  fromKm: number,
  toKm: number,
  toleranceM = 250,
  reversalM = 500,
): Flatness {
  const w = profileM.slice(fromKm, toKm + 1);
  const mean = w.reduce((a, b) => a + b, 0) / w.length;
  const sdM = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / w.length);

  // Every start, deliberately. Skipping to the end of a run found from `i`
  // looks safe and is not: a run beginning inside it is measured against its
  // own first sample, so a slow drift can carry it further than the one that
  // contained it. The skip cost this section 7 km of its true answer.
  let longestFlatKm = 0;
  for (let i = 0; i < w.length; i++) {
    let j = i;
    while (j < w.length && Math.abs(w[j]! - w[i]!) <= toleranceM) j++;
    longestFlatKm = Math.max(longestFlatKm, j - i);
  }

  let reversals = 0;
  let last = w[0] ?? 0;
  for (const h of w)
    if (Math.abs(h - last) >= reversalM) {
      reversals++;
      last = h;
    }

  return { longestFlatKm, sdM, reversals, lowM: Math.min(...w), highM: Math.max(...w) };
}

export interface Section {
  readonly name: string;
  readonly fromKm: number;
  readonly toKm: number;
  readonly flatness: Flatness;
}

export interface Lesson {
  readonly teaches: string;
  readonly minutes: number;
  readonly steps: readonly StepShare[];
  readonly wall: Escarpment;
  readonly sections: readonly Section[];
  /** The section a cohort would call flat, by measurement rather than by name. */
  readonly flattest: Section;
}

/**
 * What this route actually shows, cut at its own wall.
 *
 * The sections are derived rather than authored: everything before the wall's
 * foot, the wall, and everything after its rim. Naming them by hand would
 * beg the question — the point is to find out whether the part *called* the
 * plateau behaves like one.
 */
export function lessonOf(
  teaches: string,
  track: readonly TrackSample[],
  ground: GroundProfile,
): Lesson {
  const profileM = profileOf(ground, track.length);
  const wall = steepestRise(profileM);
  const end = profileM.length - 1;
  const sections: Section[] = [
    { name: "before the wall", fromKm: 0, toKm: wall.footKm, flatness: flatness(profileM, 0, wall.footKm) },
    { name: "the wall", fromKm: wall.footKm, toKm: wall.rimKm, flatness: flatness(profileM, wall.footKm, wall.rimKm) },
    { name: "beyond the rim", fromKm: wall.rimKm, toKm: end, flatness: flatness(profileM, wall.rimKm, end) },
  ];
  return {
    teaches,
    minutes: track[track.length - 1]!.seconds / 60,
    steps: stepMinutes(track, ground),
    wall,
    sections,
    flattest: sections.reduce((a, b) =>
      b.flatness.longestFlatKm > a.flatness.longestFlatKm ? b : a,
    ),
  };
}
