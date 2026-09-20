/**
 * What a playtest session actually contains (build plan, G1 and G2).
 *
 * A gate protocol is written in minutes and a route is authored in
 * kilometres, and nothing in this repository had ever converted between them.
 * `steepestRise` named the question in its own docstring — where the wall
 * falls "is the single fact that decides whether a route, or a twelve minute
 * playtest session, contains the thing the game is about" — and then nobody
 * asked it of a protocol. Twelve minutes of Expedition 1 ends 17.3 minutes
 * before the wall (F28).
 *
 * A session is not a slice of the expedition's track. A player dropped in
 * partway starts wherever the operator puts them, and dropping them at
 * 1,200 m in front of the Hengduan is not a shorter Expedition 1, it is an
 * unflyable one. So a session is flown: the route from that kilometre, the
 * ground under it, and by default the altitude the full expedition would
 * have there — which is what makes it a *sample* of the expedition rather
 * than a different flight that happens to share its waypoints.
 */
import { densityRatio } from "../engine/src/sim/atmosphere.ts";
import {
  flyRoute,
  groundFrom,
  routeFrom,
  steepestRise,
  type Escarpment,
  type GroundProfile,
  type Route,
  type TrackSample,
} from "../engine/src/sim/route.ts";

export interface Session {
  readonly startKm: number;
  readonly endKm: number;
  readonly minutes: number;
  readonly startAltitudeM: number;
  readonly endAltitudeM: number;
  readonly climbM: number;
  /** Ground directly below at each end — the "does anything explain it" pair. */
  readonly groundStartM: number;
  readonly groundEndM: number;
  /** Minute of the session at which the escarpment's rim is crossed, or null. */
  readonly rimAtMinute: number | null;
  /** Thinnest air the session reaches, as a density ratio. */
  readonly lowestSigma: number;
  /** False when the session flies into the ground, which a protocol must know. */
  readonly clears: boolean;
}

export interface SessionOptions {
  readonly minutes: number;
  readonly startKm: number;
  /** Defaults to the altitude the whole expedition has at `startKm`. */
  readonly startAltitudeM?: number;
  readonly escarpment?: Escarpment;
}

/** One sample per kilometre of the whole expedition, flown once. */
export function trackOf(
  route: Route,
  ground: GroundProfile,
  startAltitudeM: number,
): readonly TrackSample[] {
  return flyRoute(route, ground, { startAltitudeM, track: true }).track;
}

const at = (track: readonly TrackSample[], km: number): TrackSample =>
  track.find((s) => s.km >= km) ?? track[track.length - 1]!;

/**
 * Fly `minutes` from `startKm` and report what the player saw.
 *
 * The session is cut by time and not by distance, which is the whole point:
 * the back half of this route goes past nearly three times faster than the
 * front half, because true airspeed rises as the air thins. A protocol that
 * reasons in kilometres is reasoning about a different session on the
 * plateau than it is on the plain.
 */
export function session(
  route: Route,
  ground: GroundProfile,
  whole: readonly TrackSample[],
  options: SessionOptions,
): Session {
  const { minutes, startKm } = options;
  const startAltitudeM = options.startAltitudeM ?? at(whole, startKm).altitudeM;
  const flight = flyRoute(routeFrom(route, startKm), groundFrom(ground, startKm), {
    startAltitudeM,
    track: true,
  });

  const limit = minutes * 60;
  const inSession = flight.track.filter((s) => s.seconds <= limit);
  const last = inSession[inSession.length - 1] ?? flight.track[0]!;
  const rim = (options.escarpment ?? steepestRise(profileOf(ground, whole.length))).rimKm;
  const crossed = inSession.find((s) => s.km + startKm >= rim);

  return {
    startKm,
    endKm: startKm + last.km,
    minutes: Math.min(minutes, flight.minutes),
    startAltitudeM,
    endAltitudeM: last.altitudeM,
    climbM: last.altitudeM - startAltitudeM,
    groundStartM: ground(startKm),
    groundEndM: ground(startKm + last.km),
    rimAtMinute: crossed ? crossed.seconds / 60 : null,
    lowestSigma: Math.min(...inSession.map((s) => densityRatio(s.altitudeM))),
    clears: flight.contact === null || flight.contact.km > last.km,
  };
}

/** The ground profile as an array, which `steepestRise` wants. */
export function profileOf(ground: GroundProfile, stations: number): number[] {
  return Array.from({ length: stations }, (_, km) => ground(km));
}

/**
 * Every start kilometre whose session of this length contains the wall.
 *
 * Returned as a range rather than a single answer because a protocol has to
 * choose where in the session the reveal should fall, and that is a design
 * decision with a cohort attached: a rim crossed in the first minute is a
 * session about the plateau, and one crossed in the last is a session about
 * getting there.
 */
export function startsContainingRim(
  route: Route,
  ground: GroundProfile,
  whole: readonly TrackSample[],
  minutes: number,
  strideKm = 25,
): Session[] {
  const escarpment = steepestRise(profileOf(ground, whole.length));
  const found: Session[] = [];
  for (let startKm = 0; startKm <= escarpment.rimKm; startKm += strideKm) {
    const s = session(route, ground, whole, { minutes, startKm, escarpment });
    if (s.rimAtMinute !== null) found.push(s);
  }
  return found;
}
