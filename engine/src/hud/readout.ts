/**
 * How coarsely each HUD number is shown, and how often it is allowed to move.
 *
 * The GDD's HUD paragraph is one sentence long and the second half of it is
 * the requirement: *"Numbers are there to confirm what the player already
 * feels, not to be read first."* A number that cannot be read confirms
 * nothing, and none of these could (F46). Flown down the authored route at
 * sixty frames a second, the six readouts changed what they said like this:
 *
 * | readout | metric mean /s | worst second | imperial mean /s | worst second |
 * | --- | --- | --- | --- | --- |
 * | ALT | 2.5 | 6 | 8.2 | 19 |
 * | GND | 27.2 | **60** | 36.2 | **60** |
 * | TEMP | 0.2 | 1 | 0.3 | 1 |
 * | HUM | 0.0 | 1 | 0.0 | 1 |
 * | AIR | 0.0 | 1 | 0.0 | 1 |
 * | CLIMB | 0.2 | 15 | 2.3 | **61** |
 *
 * Sixty in a second is every frame. The altimeter was over the HUD's own
 * two-a-second ceiling in 43 % of the flight's seconds in metres and **97 %
 * in feet** - the imperial toggle F45 built is the thing that makes it
 * unreadable, because a foot is a third of a metre and the digit turns over
 * three times as often for the same aeroplane.
 *
 * Two mechanisms, because there are two questions.
 *
 * **How often may it change?** `HUD_HOLD_S` - the answer F45 already gave for
 * the one boolean on this HUD, and never applied to the numbers beside it.
 * The hold is what bounds the rate, and it is the half that survives a player
 * on the stick: everything below was measured off an autopilot, and a hand
 * flying the same route is jumpier than that, not smoother.
 *
 * **How much may it change by?** The step. Between two updates the quantity
 * moves by `rate x HUD_HOLD_S`, so anything finer than that turns over at
 * every single update and carries nothing a reader can use. The step is that
 * distance at the 95th percentile of the route's own measured rate, rounded
 * up the same 1-2-5 ladder the map's scale bar picks from - so the number
 * moves by about one step per update rather than several.
 *
 * | readout | rate p95 | x hold | step | built before |
 * | --- | --- | --- | --- | --- |
 * | altitude | 5.08 m/s | 2.54 m | **5 m** | 1 m |
 * | ground | 536 m/s | 268 m | **10 m**, clamped | 1 m |
 * | temperature | 0.03 C/s | 0.015 C | 0.1 C | 0.1 C |
 * | humidity | 0.02 %/s | 0.01 % | 1 % | 1 % |
 * | density | 0.00 /s | 0.000 | 0.01 | 0.01 |
 * | climb | 0.03 (m/s)/s | 0.015 m/s | 0.1 m/s | 0.1 m/s |
 *
 * Three rows were already coarser than the rule asks and are left alone. One
 * is clamped, and it is the interesting one.
 *
 * **Ground elevation is the readout the compression defeats.** Its rate is
 * not set by the aeroplane, it is set by how fast the world goes underneath:
 * at 130 km/min the aircraft crosses a kilometre of the 1 km grid every 0.46
 * s, and the corridor steps 33 m between adjacent kilometres at the median
 * and 639 m at its worst. The rule's own answer is a **500 m** step, which
 * cannot show Turpan's -154 m - the GDD's "this is a hole" row is written
 * against exactly that number. So this one is clamped to the median step
 * instead, and the honest statement is the one the clamp admits: twice a
 * second GND is a true reading of the ground under the aircraft, and in the
 * mountains consecutive readings differ by hundreds of metres because the
 * ground under a 1:8 aircraft really is moving at up to 1.9 km/s.
 *
 * **Imperial follows metric rather than being measured again.** F45's line is
 * that the toggle changes the units and not the reading; a step measured
 * separately in each system would make it change how precisely the world is
 * known, which is a different claim about the world. So the metric step comes
 * from the measurement and the imperial one is the smallest ladder step that
 * is not finer - 5 m becomes 20 ft rather than the 10 ft its own measurement
 * would have given.
 *
 * What is deliberately *not* here is a smoother. A held sample is the true
 * value at the moment it was taken; an average is a number the world never
 * had, and the ground under a wing is exactly where that matters.
 */
import { Steady, HUD_HOLD_S } from "./steady.js";
import { FEET_PER_METRE, ladderAtLeast, type UnitSystem } from "./units.js";

export type ReadoutName =
  | "altitude"
  | "ground"
  | "temperature"
  | "humidity"
  | "density"
  | "climb";

/**
 * The measured steps, in metres, degrees Celsius, metres per second and the
 * two dimensionless rows. Everything else is derived from these.
 */
export const METRIC_STEPS: Readonly<Record<ReadoutName, number>> = {
  altitude: 5,
  // Clamped: the rule's 500 m cannot show a hole (see above).
  ground: 10,
  temperature: 0.1,
  humidity: 1,
  density: 0.01,
  climb: 0.1,
};

/** Metric to the unit the imperial HUD shows the same quantity in. */
const TO_IMPERIAL: Readonly<Record<ReadoutName, number>> = {
  altitude: FEET_PER_METRE,
  ground: FEET_PER_METRE,
  temperature: 1.8,
  humidity: 1,
  density: 1,
  climb: FEET_PER_METRE * 60,
};

/** Dimensionless rows read the same in both systems and are not laddered. */
const DIMENSIONLESS: ReadonlySet<ReadoutName> = new Set(["humidity", "density"]);

/** How coarsely a readout is shown, in the units it is shown in. */
export function readoutStep(name: ReadoutName, units: UnitSystem): number {
  const metric = METRIC_STEPS[name];
  if (units === "metric" || DIMENSIONLESS.has(name)) return metric;
  return ladderAtLeast(metric * TO_IMPERIAL[name]);
}

/** The value rounded to a step, with no negative zero to print. */
export function quantise(value: number, step: number): number {
  const n = Math.round(value / step) * step;
  return n === 0 ? 0 : n;
}

/** Decimal places a step needs, so 0.2 prints one and 20 prints none. */
export function stepDecimals(step: number): number {
  return Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
}

/** A quantised value as the HUD writes it, thousands separator and all. */
export function formatStep(value: number, step: number): string {
  return quantise(value, step).toLocaleString(undefined, {
    minimumFractionDigits: stepDecimals(step),
    maximumFractionDigits: stepDecimals(step),
  });
}

/**
 * One readout: quantised to its step, then held to the HUD's own rate.
 *
 * The order matters. Holding first and rounding afterwards would show a
 * number that is stale *and* still churning in its last digit; rounding first
 * means the hold has something to be still about.
 */
export class SteadyReadout extends Steady<number> {
  private started = false;

  constructor(readonly step: number, holdS: number = HUD_HOLD_S) {
    super(Number.NaN, holdS);
  }

  override update(value: number, nowS: number): number {
    const q = quantise(value, this.step);
    // The first frame has nothing to hold steady yet, and waiting out a hold
    // would leave a dash on screen for the first half second of every flight.
    if (!this.started) {
      this.started = true;
      this.seed(q, nowS);
      return q;
    }
    return super.update(q, nowS);
  }

  /** What the HUD writes, which is the held value at its own precision. */
  text(): string {
    return this.started ? formatStep(this.value, this.step) : "—";
  }
}

/**
 * The six readouts for one unit system.
 *
 * Rebuilt rather than retuned when the player toggles units, because a toggle
 * is a change they asked for and should land on the next frame rather than
 * wait out a hold.
 */
export function createReadouts(units: UnitSystem): Record<ReadoutName, SteadyReadout> {
  const make = (name: ReadoutName) => new SteadyReadout(readoutStep(name, units));
  return {
    altitude: make("altitude"),
    ground: make("ground"),
    temperature: make("temperature"),
    humidity: make("humidity"),
    density: make("density"),
    climb: make("climb"),
  };
}
