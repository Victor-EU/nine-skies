/**
 * Comfort settings for the chase camera.
 *
 * The GDD asks for three - a horizon-locked camera option, a field-of-view
 * slider and camera smoothing - because chase-camera flight is a known
 * motion-sickness trigger, and the critical path says do them early: they are
 * cheap, and sickness found at G2 is a redesign. Two are here. The third is
 * not, and the measurement that removed it is worth more than the setting
 * would have been (F35).
 *
 * **Horizon lock was not the option, it was the behaviour.** The chase camera
 * placed itself from heading alone and never rolled, so the horizon has always
 * been locked and there was nothing to unlock. That is also why F33 could not
 * find the roll lag: the model banks to 58.7 degrees at full stick and none of
 * it reached the screen. So the work is the *unlocked* camera, and
 * `bankFollow: 0` is the comfort setting that gives back what the prototype
 * already did.
 *
 * **Camera smoothing is absent because it cannot help here.** A first-order
 * lag has unity gain at DC, so it delays a sustained motion without reducing
 * it, and every quantity this rig reads is either already lagged by the flight
 * model or a ramp. Flown over the real Sea to Sky ground, a lag of tau 0.25 s
 * on the camera's altitude changed the peak vertical acceleration by less than
 * a factor of two and in one of three policies made it *worse*. The jolt it
 * was meant to absorb is not the camera's: `step()` assigns
 * `groundElevationM + 25` outright when the aircraft meets terrain, and at
 * cruise the aircraft out-climbs a gradient of 0.0030 while the steepest
 * kilometre of that route is 0.628 - two hundred times more - so the clamp
 * lifts the aeroplane up to 20.8 m in a single frame and does it on *every*
 * frame for seconds at a time in the mountains. A camera that filtered that
 * out would be inside the hill. It is a flight-model question, and it is open.
 */

/**
 * Vertical field of view, degrees.
 *
 * The one comfort setting with a mechanism behind it that this rig can act on:
 * peripheral optical flow is what drives vection, and the field of view is
 * what decides how much of it there is. It is free, too - nothing in the scene
 * is frustum-culled. `Terrain.update` makes a circular disc of tiles resident
 * around the aircraft and the impostor is a ring, so neither reads the camera
 * at all and the field of view cannot move the frame budget.
 *
 * A cycle rather than the GDD's slider, because the prototype's other settings
 * are cycles and because a G1 participant can say "the second one" and an
 * operator can write it down. The shipped build gets the slider.
 */
export const FOV_CANDIDATES = [50, 62, 75, 90] as const;

/**
 * How much of the wing's bank reaches the horizon.
 *
 * 0.35 is a default and not a finding, in the sense F33 used for the stick's
 * pitch sign. It is picked to put the roll where the cohort can see it while
 * holding the peak horizon roll rate to 13.3 deg/s rather than the 37.9 deg/s
 * a 1:1 camera reaches at full stick, and the steady tilt to 20.5 degrees
 * rather than 58.7. Whether it is right is a G1 question; the two ends of the
 * cycle are the honest extremes, `0` being the horizon lock the GDD asks for
 * and `1` being the wing.
 */
export const BANK_FOLLOW_CANDIDATES = [0, 0.35, 1] as const;

export interface ComfortSettings {
  /** Vertical field of view, degrees. */
  fovDeg: number;
  /** 0 = the horizon never tilts. 1 = the camera rolls with the wing. */
  bankFollow: number;
}

export const DEFAULT_COMFORT: ComfortSettings = {
  fovDeg: 62,
  bankFollow: 0.35,
};

/**
 * The horizon roll to draw, radians. Positive is right wing down.
 *
 * A pure function of the bank and the setting, and that is what keeps it out
 * of the way of D25: `placeAt` stays a function of where the aircraft is, with
 * the roll handed in beside the heading rather than remembered. A capture
 * passes zero and measures the level frame it has always measured.
 */
export function cameraRollRad(bankRad: number, comfort: ComfortSettings): number {
  return bankRad * comfort.bankFollow;
}

/** "horizon locked" / "eased 0.35" / "with the wing" - for the HUD and the help. */
export function bankFollowLabel(bankFollow: number): string {
  if (bankFollow <= 0) return "horizon locked";
  if (bankFollow >= 1) return "with the wing";
  return `eased ${bankFollow}`;
}
