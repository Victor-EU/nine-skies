/**
 * Metric by default, imperial by toggle - and a line about which numbers move.
 *
 * The comfort row asks for both. What it does not say, and what had to be
 * decided, is *which* numbers a toggle touches, because this HUD carries two
 * kinds (F45):
 *
 *   - **What the world is doing where the player is.** Altitude, the ground
 *     under it, the air temperature, the climb rate, a distance on the map.
 *     These are readings, a player compares them to their own experience, and
 *     they are what the toggle is for.
 *   - **What the operator has set the build to.** The pacing cycle's
 *     80 / 130 / 190 km/min, the trip length in minutes, the warning that no
 *     speed above 73 flies Expedition 1. These are not measurements of a
 *     world; they are the numbers F16 to F19 are written in, and a G1 or G2
 *     operator reads them against those findings. Converting them would mean
 *     a session log that cannot be compared with the plan that scheduled it.
 *
 * So the toggle moves the first kind and leaves the second. The line is
 * drawn at "is this about the world, or about the build".
 *
 * **Imperial here is the domestic one** - feet, miles, Fahrenheit, feet per
 * minute - and not aviation's feet, knots and nautical miles. The cohort is
 * people with no flight-sim experience (G1), so knots would be a third system
 * neither half of the audience reads. That is a default rather than a
 * finding, in the sense F33 used the word: if this game later wants a cockpit
 * that reads like a cockpit, it is one table.
 */

export type UnitSystem = "metric" | "imperial";

export const UNIT_SYSTEMS: readonly UnitSystem[] = ["metric", "imperial"];

/** International foot, exactly 0.3048 m. */
export const FEET_PER_METRE = 1 / 0.3048;
/** International mile, exactly 1609.344 m. */
export const MILES_PER_KM = 1000 / 1609.344;

export function unitsLabel(units: UnitSystem): string {
  return units === "metric" ? "metric" : "imperial";
}

export function altitudeUnit(units: UnitSystem): string {
  return units === "metric" ? "m" : "ft";
}

export function temperatureUnit(units: UnitSystem): string {
  return units === "metric" ? "°C" : "°F";
}

export function climbUnit(units: UnitSystem): string {
  return units === "metric" ? "m/s" : "ft/min";
}

export function distanceUnit(units: UnitSystem): string {
  return units === "metric" ? "km" : "mi";
}

/** A height above sea level, rounded the way the HUD shows it. */
export function altitudeValue(metres: number, units: UnitSystem): number {
  return units === "metric" ? Math.round(metres) : Math.round(metres * FEET_PER_METRE);
}

export function temperatureValue(celsius: number, units: UnitSystem): number {
  return units === "metric" ? celsius : celsius * 1.8 + 32;
}

/**
 * Vertical speed. Metres per second reads in ones; feet per minute reads in
 * hundreds, which is why every altimeter that uses feet also uses minutes.
 */
export function climbValue(metresPerSecond: number, units: UnitSystem): number {
  return units === "metric" ? metresPerSecond : metresPerSecond * FEET_PER_METRE * 60;
}

export function distanceValue(km: number, units: UnitSystem): number {
  return units === "metric" ? km : km * MILES_PER_KM;
}

export function formatAltitude(metres: number, units: UnitSystem): string {
  return `${altitudeValue(metres, units).toLocaleString()} ${altitudeUnit(units)}`;
}

export function formatTemperature(celsius: number, units: UnitSystem): string {
  return `${temperatureValue(celsius, units).toFixed(1)} ${temperatureUnit(units)}`;
}

export function formatClimb(metresPerSecond: number, units: UnitSystem): string {
  const v = climbValue(metresPerSecond, units);
  return `${units === "metric" ? v.toFixed(1) : Math.round(v).toLocaleString()} ${climbUnit(units)}`;
}

export function formatDistance(km: number, units: UnitSystem): string {
  const v = distanceValue(km, units);
  const shown = v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(v >= 10 ? 0 : 1);
  return `${shown} ${distanceUnit(units)}`;
}

/**
 * The 1-2-5 ladder, which is the only set of steps a reader has a round
 * number for. One ladder, two directions: a scale bar wants the longest step
 * that still fits, and a readout wants the shortest step that is still
 * legible (F46).
 */
const LADDER = [1, 2, 5] as const;
const DECADES = [0.001, 0.01, 0.1, 1, 10, 100, 1000, 10_000] as const;

/** The largest 1-2-5 step no bigger than `budget`. */
export function ladderAtMost(budget: number): number {
  let best = DECADES[0]! * LADDER[0]!;
  for (const decade of DECADES)
    for (const step of LADDER) if (decade * step <= budget) best = decade * step;
  return best;
}

/** The smallest 1-2-5 step no smaller than `floor`. */
export function ladderAtLeast(floor: number): number {
  for (const decade of DECADES)
    for (const step of LADDER) if (decade * step >= floor) return decade * step;
  return DECADES[DECADES.length - 1]! * LADDER[LADDER.length - 1]!;
}

/**
 * A scale bar the reader's own system has a round number for.
 *
 * Chosen rather than fixed, because 500 km is 311 miles and a bar labelled
 * 311 is not a scale bar. The rule is the usual one: the longest 1-2-5 step
 * that fits in a quarter of the widget.
 */
export function scaleBar(
  kmPerPx: number,
  widthPx: number,
  units: UnitSystem,
): { km: number; label: string } {
  const perPx = units === "metric" ? kmPerPx : distanceValue(kmPerPx, units);
  const best = ladderAtMost(perPx * widthPx * 0.25);
  return {
    km: units === "metric" ? best : best / MILES_PER_KM,
    label: `${best.toLocaleString()} ${distanceUnit(units)}`,
  };
}
