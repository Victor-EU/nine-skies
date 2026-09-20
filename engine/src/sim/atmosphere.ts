/**
 * International Standard Atmosphere, plus the piston-engine power lapse.
 *
 * Build plan D-item: the plateau's thin air must be arithmetic, not a scripted
 * event (GDD, "Core mechanics"). Everything the player feels above 3,500 m —
 * the sluggish climb, the wide turns, the dead boost button — comes out of
 * these four functions and nothing else. There is no altitude constant
 * anywhere in the codebase that says "the plateau starts here".
 */

/** ISA sea-level density, kg/m^3. */
export const RHO_0 = 1.225;

/** ISA sea-level pressure, Pa. */
export const P_0 = 101_325;

/** Environmental lapse rate, deg C per 1000 m. */
export const LAPSE_RATE_C_PER_KM = 6.5;

/** Standard gravity, m/s^2. */
export const G = 9.80665;

/**
 * The ISA troposphere model is only defined to the tropopause. Above it the
 * polynomial keeps decreasing and crosses zero at 44,331 m, so we clamp: the
 * aircraft's ceiling is far below this and the balloon's is too.
 */
const TROPOPAUSE_M = 11_000;

/** Lowest point the sim will be asked about: Ayding Lake, Turpan, -154 m. */
const FLOOR_M = -500;

export function clampAltitude(altitudeM: number): number {
  return Math.min(TROPOPAUSE_M, Math.max(FLOOR_M, altitudeM));
}

/**
 * ISA density at a geometric altitude, kg/m^3.
 *
 *   rho(h) = rho0 * (1 - 2.25577e-5 * h) ^ 4.2559
 */
export function densityAt(altitudeM: number): number {
  const h = clampAltitude(altitudeM);
  return RHO_0 * Math.pow(1 - 2.25577e-5 * h, 4.2559);
}

/** Density ratio sigma = rho / rho0. 1.0 at sea level, ~1.02 in Turpan. */
export function densityRatio(altitudeM: number): number {
  return densityAt(altitudeM) / RHO_0;
}

/**
 * Gagg-Farrar power lapse for a normally-aspirated piston engine:
 *
 *   P / P0 = 1.132 * sigma - 0.132
 *
 * This is the whole reason the GDD specifies a piston aircraft rather than a
 * turboprop or a jet. A piston engine genuinely loses 40 % of its power on the
 * Tibetan Plateau, and the player feels exactly that.
 */
export function pistonPowerFraction(altitudeM: number): number {
  const sigma = densityRatio(altitudeM);
  return Math.max(0, 1.132 * sigma - 0.132);
}

/**
 * Boost is gated on air density, never on altitude.
 *
 * sigma >= 0.70 happens to fall at 3,564 m, which is where the GDD's
 * "above 3,500 m the plane climbs slowly" lands. Stating the rule in density
 * means Turpan (sigma 1.02) and Lhasa (sigma 0.69) behave correctly without
 * either being special-cased.
 */
export const BOOST_MIN_SIGMA = 0.7;

export function boostAvailable(altitudeM: number): boolean {
  return densityRatio(altitudeM) >= BOOST_MIN_SIGMA;
}

/** The altitude at which boost cuts out, solved rather than hard-coded. */
export function boostCeilingM(): number {
  // Invert rho(h)/rho0 = BOOST_MIN_SIGMA analytically.
  return (1 - Math.pow(BOOST_MIN_SIGMA, 1 / 4.2559)) / 2.25577e-5;
}

/**
 * Outside air temperature at the aircraft.
 *
 * The ground temperature comes from the climate atlas (CHELSA monthly normal
 * for this lat/lon/month, build plan D8), and only the lapse from ground to
 * aircraft is modelled here. That is what keeps the HUD thermometer agreeing
 * with the discovery card: both read the same atlas cell.
 */
export function outsideAirTemperatureC(
  groundTempC: number,
  groundElevationM: number,
  altitudeM: number,
): number {
  const heightAboveGround = altitudeM - groundElevationM;
  return groundTempC - (LAPSE_RATE_C_PER_KM * heightAboveGround) / 1000;
}

/**
 * Relative humidity proxy from the monthly precipitation normal, 0..1.
 *
 * Drives haze milkiness only; it is a look, not a forecast. Saturates around
 * 200 mm/month, which puts the Sichuan Basin and the southeast coast at the
 * top of the scale and the Taklamakan at the bottom.
 */
export function humidityProxy(monthlyPrecipMm: number): number {
  return Math.min(1, Math.max(0, monthlyPrecipMm / 200));
}
