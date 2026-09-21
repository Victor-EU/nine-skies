/**
 * A value the screen is allowed to show: it changes no faster than a reader
 * can read (F45, F46).
 *
 * The comfort row asks for no strobing, and the build very nearly had it for
 * free - both input sources edge-detect, so a held key or a held pad button
 * fires once however long it is held. What is left is the other way a screen
 * flashes: a state derived by comparing a continuous quantity against a
 * threshold, which chatters at the frame rate whenever the quantity sits on
 * the threshold.
 *
 * It does sit there. The density bar changes colour at sigma 0.70, which is
 * 3,564 m, and an aeroplane holding altitude at the boost ceiling - which is
 * exactly what a player testing boost does - pins the value to the line. Flown
 * with a relay on the threshold the bar changes colour 508 times in two
 * minutes, and in its worst second **sixteen times: eight full flashes**,
 * against WCAG 2.3.1's limit of three. The aeroplane moves seven centimetres
 * while it happens.
 *
 * The fix is not hysteresis on the threshold. Boost's lockout is meant to
 * come out of the density formula rather than out of a pair of altitudes
 * (workstream C), and a second threshold would make "above 3,500 m" into two
 * numbers. What is rate-limited is the *showing* of it: a change is committed
 * immediately if the value has been still, and otherwise waits its turn. A
 * genuine transition is never delayed by more than `holdS`; chatter is
 * flattened to one change per `holdS` and cannot flash at all.
 *
 * It also makes a guarantee the HUD was relying on by coincidence. The bar's
 * colour and the sentence "air too thin for boost" are one fact shown twice;
 * passing both through one of these means they cannot disagree, whatever the
 * altitude is doing.
 *
 * **The numbers beside it were not held, and that was the larger half.** F45
 * rate-limited the one boolean on this HUD and left six readouts next to it
 * changing up to sixty times a second (F46). The hold is the same argument
 * either way, so it is the same class: `readout.ts` quantises and then holds
 * with this.
 */

/** Half a second: two changes a second at the very most, from any input. */
export const HUD_HOLD_S = 0.5;

/**
 * What the screen shows for a value that may be moving faster than it reads.
 *
 * Generic over the value because the argument is: a change is worth showing
 * once per `holdS` and no oftener, and that is true of a flag, a quantised
 * number and anything else compared with `!==`.
 */
export class Steady<T> {
  private shown: T;
  private changedAtS = -Infinity;

  constructor(initial: T, readonly holdS: number = HUD_HOLD_S) {
    this.shown = initial;
  }

  /** What the screen should show for `value` at `nowS`. */
  update(value: T, nowS: number): T {
    if (value !== this.shown && nowS - this.changedAtS >= this.holdS) {
      this.shown = value;
      this.changedAtS = nowS;
    }
    return this.shown;
  }

  /** What it is showing, without advancing anything. */
  get value(): T {
    return this.shown;
  }

  /**
   * Show `value` now and start the hold from here.
   *
   * For the first frame only, where there is nothing to hold steady yet and
   * waiting would leave a dash on screen for half a second.
   */
  protected seed(value: T, nowS: number): void {
    this.shown = value;
    this.changedAtS = nowS;
  }
}

/** The boolean case: a state the HUD shows, held steady. */
export class SteadyFlag extends Steady<boolean> {}
