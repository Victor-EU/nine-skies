/**
 * World scale - the single source of truth for compression and exaggeration.
 *
 * Build plan D6: these are live values, never baked into data, because the
 * 1:5 / 1:8 / 1:12 decision is a playtest at gate G1 and a playtest needs a
 * toggle.
 *
 * THE ASYMMETRY
 * -------------
 * This is about the simulation, not the picture. The sim works in real metres
 * throughout; `verticalExaggeration` below is a rendering scale and changes
 * none of what follows.
 *
 * The aircraft's climb rate is real: 7.1 m/s down low, 2.1 m/s on the plateau,
 * zero at 6,200 m. Its ground speed is multiplied by a large gain so the
 * country crosses in under an hour. So a metre of altitude costs roughly forty
 * times what a metre of distance costs - 42 at the default pacing, and 26 to
 * 61 across the candidates, which is why pacing is a design question.
 *
 * That is not a fudge to work around the compression - it is the GDD's thesis
 * expressed as a constant. Distance is cheap, altitude is expensive, and the
 * player learns it in the controls before they read it on a card. Compressing
 * the vertical to match would make the plateau climb take fifteen seconds and
 * the game would have nothing left to say.
 */

export interface WorldScale {
  /** Horizontal compression. 8 means the world is built at 1/8 real size. */
  horizontalCompression: number;
  /**
   * Vertical scale, rendering only - the sim uses real metres. Above 1 it
   * exaggerates, below 1 it flattens; horizontal compression already
   * exaggerates relief on its own, so the useful range is below 1.
   *
   * Rarely the right thing to set directly. Terrain shape depends on the
   * product of the two fields, not on either alone, so prefer `scaleFor`.
   */
  verticalExaggeration: number;
}

/**
 * Apparent exaggeration, `A` - the only quantity terrain shape depends on.
 *
 * The angle of a mesh facet between two samples `dx` apart is
 * `atan(A * dh / dx)`: compression and exaggeration enter the picture only as
 * their product, and neither is visible alone (F14). This is the number the
 * eye is answering questions about.
 */
export function apparentExaggeration(scale: WorldScale): number {
  return scale.horizontalCompression * scale.verticalExaggeration;
}

/**
 * Build a scale from the two questions G1 asks *separately*: how much world is
 * on screen, and how dramatic the relief on it looks.
 *
 * Going through here rather than writing `verticalExaggeration` by hand is
 * what keeps the two apart. Change compression with `apparent` held and the
 * terrain is the same shape, framed wider or tighter; change `apparent` and
 * the framing is untouched.
 */
export function scaleFor(horizontalCompression: number, apparent: number): WorldScale {
  return { horizontalCompression, verticalExaggeration: apparent / horizontalCompression };
}

/**
 * Compression is the GDD's; it is decided at gate G1.
 *
 * The drama is not the GDD's 1.5x vertical any more. That value was tuned
 * against the stand-in world, which turned out to be ~15x smoother than China
 * (F13), and measuring it over real elevation showed it puts a third of the
 * flown route past 60 degrees and a ninth of it past 75 -- spikes, not
 * mountains (F14). At 1:8, A = 6 means 0.75x vertical, and ridgelines and
 * valley floors are legible again.
 *
 * Both arguments are candidates the A/B offers, so the cohort starts on a
 * setting the toggles can return to. A default off the grid would be a fourth
 * condition nobody chose and nobody could get back to.
 */
export const DEFAULT_SCALE: WorldScale = scaleFor(8, 6);

/**
 * The G1 A/B, first axis: **drama**. Compression held, `A` swept.
 *
 * This is the axis the old single toggle was really moving, by accident, and
 * it deserves to be asked on purpose. Measured over the flown Shanghai-Lhasa
 * route: at A = 4 the route reads as moorland (3 % of it past 60 degrees), at
 * 6 as mountains (13.6 %), at 9 as something close to the old 1:8 x 1.5
 * (~28 %). Beyond 9 the reduction's own noise is what is being magnified.
 */
export const DRAMA_CANDIDATES = [4, 6, 9] as const;

/**
 * The G1 A/B, second axis: **compression**. `A` held, exaggeration moving
 * inversely - 1:5 x 1.20, 1:8 x 0.75, 1:12 x 0.50 at A = 6.
 *
 * Terrain shape is then identical across the three and only the framing
 * changes, which is the question the GDD meant to ask. Asked the old way, with
 * exaggeration pinned, these three swept A from 7.5 to 18 and the cohort would
 * have ranked drama while believing it was ranking scale.
 */
export const COMPRESSION_CANDIDATES = [5, 8, 12] as const;

/**
 * Chase camera framing, in **real** metres - every one of them divided by the
 * compression (`toWorldH`) and none of them by the exaggeration.
 *
 * Why that is the right axis even for the two vertical offsets: the render
 * transform from real space is `diag(1/c, A/c, 1/c)`, which is the fixed
 * distortion `diag(1, A, 1)` with a uniform `1/c` on top. Hold A and scale
 * every camera distance by that same `1/c` and the three compression
 * candidates produce the *identical image* - so the A/B compares worlds and
 * nothing else. A camera offset in raw world units would not: 95 units above
 * the aircraft is 79 real metres at 1:5 and 190 at 1:12, and the cohort would
 * have been ranking camera heights alongside compressions without being told.
 *
 * The near and far planes are real for the same reason, and for one more: held
 * in world units they would hand the candidates different depth precision, so
 * a compression could win or lose the ranking on z-fighting.
 *
 * At 1:8 these are the 260 / 95 / 10 world units the prototype was flown with,
 * unchanged; what moves is the other two candidates.
 */
export const CAMERA_BACK_REAL_M = 2_080;
export const CAMERA_UP_REAL_M = 760;
/** The chase camera looks a little ahead of the aircraft and a little above. */
export const CAMERA_AIM_UP_REAL_M = 80;
export const CAMERA_AIM_AHEAD = 1.6;
export const CAMERA_NEAR_REAL_M = 160;
/** The impostor ring reaches 1,200 km (F1); this clears it with room over. */
export const CAMERA_FAR_REAL_M = 3_200_000;

export type SpeedMode = "low" | "cruise" | "boost";

/**
 * Indicated airspeed per mode, m/s. Real numbers for a light piston single:
 * a little above stall, a normal cruise, and the top of the green arc.
 */
export const MODE_IAS_MS: Record<SpeedMode, number> = {
  low: 38,
  cruise: 52,
  boost: 70,
};

/**
 * What each mode is worth relative to cruise. The GDD's own relationships:
 * low is about a third of cruise and is for a few minutes in a gorge, boost
 * doubles it. Fixed, so the pacing question below moves one number.
 */
export const MODE_SPEED_RATIO: Record<SpeedMode, number> = {
  low: 1 / 3,
  cruise: 1,
  boost: 2,
};

/**
 * How much real ground a minute of cruise buys. The game's pacing knob, and
 * the *only* thing that sets how long a route takes - compression does not
 * (F15), which is why this is a parameter and 1:8 is a constant.
 *
 * It is not merely a clock. The gain below is what makes distance cheap while
 * altitude stays real, so moving it moves the exchange rate between the two:
 * a full-power climb gains 5.3 real metres per kilometre of ground at 80, and
 * 2.2 at 190. That is the GDD's thesis with a dial on it, so the pacing
 * question is a design question in a way the compression question never was.
 */
export interface Pacing {
  /** Real kilometres of ground per minute at cruise. */
  cruiseKmPerMin: number;
}

export const DEFAULT_PACING: Pacing = { cruiseKmPerMin: 130 };

/**
 * The G2 pacing A/B. Sea to Sky is 3,219.7 real km along its waypoints, so
 * these put it at 40.2, 24.8 and 16.9 minutes - the 40 / 25 / 17 spread the
 * GDD asked to compare, and which it mistakenly attributed to compression.
 * The GDD's own working bounds are 25 minutes as the ceiling for a narrated
 * trip and 15 as the floor below which the plateau stops feeling vast, so the
 * candidates sit one either side of the current value and inside both bounds.
 */
export const CRUISE_CANDIDATES = [80, 130, 190] as const;

/**
 * The fastest cruise at which Expedition 1's climb budget still closes, real
 * km/min. Above this the aircraft arrives below the plateau rim flying flat
 * out from Shanghai, because reaching 4,500 m costs **18.6 minutes of flying
 * whatever the pacing** - altitude is not compressed, see THE ASYMMETRY - and
 * the faster cruise is, the less of China is left when the climb is done.
 *
 * On the straight line to Lhasa, 2,874 km, which is the worst case: a player
 * who flies direct has less ground to climb over than one who follows the
 * waypoints. The published route's 3,220 km would put it at 151 and F3's
 * 2,980 km at 140, so this is the conservative one of the three (F16).
 *
 * `test/sim/flight.test.ts` re-measures it through the sim, so it cannot go
 * stale behind a tuning change to the aircraft. Note how little room is left
 * at the shipped 130: the rim is cleared by 84 metres.
 *
 * **This is not the binding constraint, and was never the tightest one.** It
 * compares one altitude at the destination against the plateau rim, and the
 * route crosses ground a kilometre higher than Lhasa a hundred and thirty
 * kilometres short of it. See `TERRAIN_LIMITED_CRUISE_KM_PER_MIN` and F17.
 */
export const CLIMB_LIMITED_CRUISE_KM_PER_MIN = 135;

/**
 * The fastest single cruise speed at which Expedition 1 clears the ground it
 * crosses, real km/min.
 *
 * The same climb budget, asked the question that actually decides whether the
 * expedition can be flown: not "how high is the aircraft when it arrives" but
 * "is it ever lower than the terrain". Flown at cruise from end to end, Sea
 * to Sky as authored - Shanghai, Wuhan, Chongqing, Chengdu, Lhasa - clears at
 * 73 km/min and not at 74. At the shipped 130 the aircraft is 321 m inside a
 * ridge west of Chengdu after twelve minutes, 63 % of the way (F17, F18).
 *
 * 73 km/min is a 32-minute trip, so there is no single speed that both flies
 * the route and fits the GDD's fifteen-to-thirty-five minute band. That is
 * what the authored per-leg profile is for: `low / low / cruise / cruise`
 * crosses the same ground in 35.5 minutes with 333 m to spare, by buying the
 * climb over the eastern plain where there is nothing in the way.
 *
 * Measured in `test/route/seaToSkyClearance.test.ts` against the built
 * corridor and the authored route. That suite skips where no corridor is
 * built, so this constant is the one place the number survives a fresh
 * checkout.
 */
export const TERRAIN_LIMITED_CRUISE_KM_PER_MIN = 73;

/** Ground covered per minute in a mode, real kilometres. */
export function groundKmPerMin(mode: SpeedMode, pacing: Pacing = DEFAULT_PACING): number {
  return pacing.cruiseKmPerMin * MODE_SPEED_RATIO[mode];
}

/** The default pacing as a table. Derived, so it cannot drift from it. */
export const MODE_GROUND_KM_PER_MIN: Record<SpeedMode, number> = {
  low: groundKmPerMin("low"),
  cruise: groundKmPerMin("cruise"),
  boost: groundKmPerMin("boost"),
};

/**
 * Horizontal gain: real ground metres travelled per metre of true airspeed.
 *
 * Applied to the horizontal axes only. Note that because true airspeed rises
 * with altitude at constant indicated airspeed, ground speed rises too - about
 * 163 km/min over the plateau against 130 at the coast. The plateau is crossed
 * quickly and climbed slowly, which is exactly what it is like.
 */
export function groundGain(mode: SpeedMode, pacing: Pacing = DEFAULT_PACING): number {
  const groundMs = (groundKmPerMin(mode, pacing) * 1000) / 60;
  return groundMs / MODE_IAS_MS[mode];
}

/** Real metres -> rendered world units, horizontal. */
export function toWorldH(realM: number, scale: WorldScale): number {
  return realM / scale.horizontalCompression;
}

/** Real metres -> rendered world units, vertical. */
export function toWorldV(realM: number, scale: WorldScale): number {
  return realM * scale.verticalExaggeration;
}

/**
 * Haze, authored per real metre and converted here.
 *
 * The shader integrates optical depth along the *world* sight line, so a
 * density held in world units makes the air thinner the harder the world is
 * compressed: the same real hundred kilometres is 20,000 world units at 1:5
 * and 8,333 at 1:12, and 1:12 would look two and a half times clearer for no
 * reason a player could name. That is a lie about the atmosphere - which the
 * GDD sells as the thing that distinguishes the basin from the plateau - and
 * a confound in the one comparison G1 exists to make.
 */
export function hazeDensityPerWorldUnit(perRealM: number, scale: WorldScale): number {
  return perRealM * scale.horizontalCompression;
}

/**
 * The same argument vertically. The shader's height falloff reads world `y`,
 * which carries the exaggeration, so a falloff in world units means the air's
 * real scale height moves whenever the drama toggle does. It moved once
 * already, unnoticed: dropping the exaggeration from 1.5 to 0.75 doubled the
 * real scale height from 6 km to 12 km without anybody touching the air.
 */
export function hazeFalloffPerWorldUnit(scaleHeightRealM: number, scale: WorldScale): number {
  return 1 / (scaleHeightRealM * scale.verticalExaggeration);
}

/**
 * Minutes to fly a real distance at a mode's sea-level ground speed.
 * Used by the expedition tooling to check a route fits its time budget.
 */
export function minutesForKm(
  realKm: number,
  mode: SpeedMode,
  pacing: Pacing = DEFAULT_PACING,
): number {
  return realKm / groundKmPerMin(mode, pacing);
}
