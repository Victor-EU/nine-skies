/**
 * Where the sun is, and what time it is by it. (Workstream D, the HUD row:
 * *Beijing clock + local solar time in the overlay*.)
 *
 * This exists because of one fact of Chinese geography that the GDD leans on
 * and nothing in the build had expressed: **China keeps one time zone across
 * sixty-two degrees of longitude.** Beijing time is the meridian at 120 E, so
 * a clock that reads 12:00 in Shanghai reads 12:00 in Kashgar, where the sun
 * will not be overhead for another three hours. That is not a curiosity to
 * put on a card - it is the same lesson as the air getting thin, arriving
 * through a different sense, and it costs two numbers on the HUD.
 *
 * The astronomy is NOAA's solar position algorithm, which is a few hundred
 * metres of accuracy on sunrise and far better than anything a game needs.
 * Kept in real time and real degrees: the world is compressed horizontally
 * and the sun is not, so nothing here knows about the scale.
 */

/** Beijing time is UTC+8, whose meridian is 120 E. The only one China has. */
export const BEIJING_MERIDIAN_DEG = 120;
export const BEIJING_UTC_OFFSET_H = 8;

/** Minutes of arc the Earth turns in a minute of time, as degrees per minute. */
const DEG_PER_MINUTE = 0.25;

/**
 * Mean solar time at a longitude, relative to the clock on the wall.
 *
 * Positive east of the meridian: Shanghai at 121.47 E runs 5.9 minutes ahead
 * of Beijing time, Lhasa at 91.10 E runs 115.6 minutes behind. This is the
 * whole of the single-time-zone effect and it needs no date.
 */
export function meridianOffsetMinutes(lonDeg: number): number {
  return (lonDeg - BEIJING_MERIDIAN_DEG) / DEG_PER_MINUTE;
}

/** Day of the year, 1-365, for a month and a day. Ignores leap years. */
const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export function dayOfYear(month: number, day = 15): number {
  return MONTH_STARTS[Math.min(11, Math.max(0, month - 1))]! + day;
}

/** NOAA's fractional year, radians. */
function fractionalYear(dayOfYearN: number, hour: number): number {
  return ((2 * Math.PI) / 365) * (dayOfYearN - 1 + (hour - 12) / 24);
}

/**
 * The equation of time, minutes.
 *
 * The sun is not a good clock: it runs up to 16 minutes fast in early
 * November and 14 minutes slow in February, because the Earth's orbit is an
 * ellipse and its axis is tilted. Small next to a country's worth of
 * longitude, and included because leaving it out would make solar noon wrong
 * by a quarter of an hour in exactly the month Expedition 1 is flown in.
 */
export function equationOfTimeMinutes(dayOfYearN: number, hour = 12): number {
  const g = fractionalYear(dayOfYearN, hour);
  return (
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g))
  );
}

/** Solar declination, radians. */
export function declinationRad(dayOfYearN: number, hour = 12): number {
  const g = fractionalYear(dayOfYearN, hour);
  return (
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g)
  );
}

/**
 * Apparent solar time at a place, in minutes after midnight.
 *
 * The number a sundial would show: the clock, shifted by how far the place is
 * from the time zone's meridian, and corrected by the equation of time. Wraps
 * into 0..1440, so flying far enough west before dawn reads as the previous
 * evening rather than as a negative hour.
 */
export function solarTimeMinutes(
  clockMinutes: number,
  lonDeg: number,
  dayOfYearN: number,
): number {
  const t =
    clockMinutes +
    meridianOffsetMinutes(lonDeg) +
    equationOfTimeMinutes(dayOfYearN, clockMinutes / 60);
  return ((t % 1440) + 1440) % 1440;
}

export interface SunPosition {
  /** Degrees above the horizon; negative is below it. */
  readonly elevationDeg: number;
  /** Degrees clockwise from north. */
  readonly azimuthDeg: number;
}

/**
 * The sun in the sky over a place, at a clock time.
 *
 * Geometric, with no refraction correction: at the horizon that is worth
 * about half a degree, which matters for the minute sunrise is announced and
 * not for anything drawn.
 */
export function sunPosition(
  clockMinutes: number,
  latDeg: number,
  lonDeg: number,
  dayOfYearN: number,
): SunPosition {
  const lat = (latDeg * Math.PI) / 180;
  const dec = declinationRad(dayOfYearN, clockMinutes / 60);
  // The hour angle is zero at solar noon and grows 15 degrees an hour.
  const hourAngle = ((solarTimeMinutes(clockMinutes, lonDeg, dayOfYearN) / 4 - 180) * Math.PI) / 180;
  const cosZenith =
    Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle);
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZenith)));
  const elevationDeg = 90 - (zenith * 180) / Math.PI;
  // From north, clockwise, so the sun is due south (180) at noon anywhere in
  // China and rises in the southeast in November rather than the northeast.
  const denom = Math.cos(lat) * Math.sin(zenith);
  const cosAz =
    denom === 0 ? -1 : (Math.sin(dec) - Math.sin(lat) * Math.cos(zenith)) / denom;
  let azimuthDeg = (Math.acos(Math.min(1, Math.max(-1, cosAz))) * 180) / Math.PI;
  if (hourAngle > 0) azimuthDeg = 360 - azimuthDeg;
  return { elevationDeg, azimuthDeg };
}

/** `07:23`, from minutes after midnight. */
export function clockString(minutes: number): string {
  const m = Math.round(((minutes % 1440) + 1440) % 1440);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * How fast the world's clock runs against the session's.
 *
 * Nothing in this build had a clock, and the moment one exists the rate is a
 * question with two defensible answers 24 times apart (F41).
 *
 * **1x** — the world's clock is the player's. An expedition happens inside a
 * single part of a single day, and the authored `start_hour` names which one.
 *
 * **Aircraft time** — the world's clock is the aeroplane's. Horizontal
 * distance is compressed by a large gain (see THE ASYMMETRY in `scale.ts`),
 * and a clock that ignored it would have the aircraft crossing China between
 * breakfast and the end of breakfast. Measured over Expedition 1, flying
 * 2,931 real kilometres at the true airspeed the aircraft actually has takes
 * **14.6 hours, 23.8x the session** - and it is not a constant, because true
 * airspeed rises as the air thins.
 *
 * The default is 1x, which is the choice that changes nothing: it makes
 * `start_hour` mean "the hour this expedition is flown at", and every number
 * the route gate prints stays a number about a flight in daylight. What it
 * costs is that time of day stops being something a flight *passes through*,
 * which is phase 3's business and where the decision belongs.
 */
export const DEFAULT_TIME_RATE = 1;

/** Measured over Expedition 1's flown track, averaged (F41). Not constant. */
export const AIRCRAFT_TIME_RATE = 23.8;

export const TIME_RATE_CANDIDATES = [1, 8, 24] as const;

/**
 * The world's clock during one flight.
 *
 * Minutes after midnight, Beijing time, which is the only one China has. It
 * wraps, because at any rate above about 24x an expedition can cross
 * midnight and a clock that read 26:10 would be wrong in a way a player
 * notices immediately.
 */
export class WorldClock {
  constructor(
    /** The authored start, minutes after midnight. */
    readonly startMinutes: number,
    /** Day of the year, from the expedition's authored month. */
    readonly dayOfYearN: number,
    readonly rate: number = DEFAULT_TIME_RATE,
  ) {}

  /** The clock after this many seconds of flying. */
  minutesAt(sessionSeconds: number): number {
    return this.startMinutes + (sessionSeconds / 60) * this.rate;
  }

  /** What a sundial under the aircraft reads, minutes after midnight. */
  solarMinutesAt(sessionSeconds: number, lonDeg: number): number {
    return solarTimeMinutes(this.minutesAt(sessionSeconds), lonDeg, this.dayOfYearN);
  }

  sunAt(sessionSeconds: number, latDeg: number, lonDeg: number): SunPosition {
    return sunPosition(this.minutesAt(sessionSeconds), latDeg, lonDeg, this.dayOfYearN);
  }
}
