/**
 * Up out of the cloud sea and down into it again (D93): a monument that
 * comes and goes on its own timing. From under its place it swims up along
 * its bearing, nose high, to stand where its cue put it; after a while it
 * noses over and dives, a little further on, and is gone. Seen from the
 * side, a porpoise's arc. The layer finds the ground under the place; the
 * cloud deck and the rock take the figure in and give it back by being
 * there, drawn over it.
 *
 * The visit's dwell is the stand. A named visit stands for its line.
 */
import { glanceAt, registerMotion, smooth } from "../motion.js";

/** Seconds it grows from nothing at each end, well under whatever hides it there. */
const EDGE_S = 1.2;
/** How far under its place it starts and ends, beyond its height over the ground, as a share of its length. */
const UNDER = 0.35;

registerMotion("surface", (ctx) => {
  const { cue, visit, temperament, rng } = ctx;
  const place = cue.at;
  const span = visit.untilS - visit.fromS;
  const [a, b] = visit.dwell ?? [visit.fromS + 0.3 * span, visit.untilS - 0.3 * span];
  const depth = (place?.aboveGroundM ?? 0) + UNDER * cue.sizeM;
  const travel = cue.sizeM * rng.range(0.5, 0.9);
  const bearing = (cue.facingDeg * Math.PI) / 180;
  const maxPitch = (temperament.maxPitchDeg * Math.PI) / 180;
  const phase = rng.range(0, Math.PI * 2);
  // Keys: the second, how far along its bearing, how high against its place.
  const T = [visit.fromS, a, b, visit.untilS];
  const S = [-0.5, -0.1, 0.1, 0.5].map((k) => k * travel);
  const H = [-depth, 0, 0, -depth];
  // Tangents: each act's own chord at its ends, the stand's slow chord through it, so it slows onto the level and leaves it without a stop.
  const chord = (v: readonly number[], i: number, j: number): number => (v[j]! - v[i]!) / (T[j]! - T[i]! || 1);
  const tan = (v: readonly number[]): number[] => [chord(v, 0, 1), chord(v, 1, 2), chord(v, 1, 2), chord(v, 2, 3)];
  const MS = tan(S);
  const MH = [chord(H, 0, 1), 0, 0, chord(H, 2, 3)];
  const world = { lat: 0, lon: 0, aboveGroundM: 0, eastM: 0, northM: 0 };
  const hermite = (v: readonly number[], m: readonly number[], k: number, u: number, h: number): [number, number] => {
    const u2 = u * u;
    const u3 = u2 * u;
    const p = (2 * u3 - 3 * u2 + 1) * v[k]! + (u3 - 2 * u2 + u) * h * m[k]! + (-2 * u3 + 3 * u2) * v[k + 1]! + (u3 - u2) * h * m[k + 1]!;
    const d = ((6 * u2 - 6 * u) * v[k]! + (3 * u2 - 4 * u + 1) * h * m[k]! + (-6 * u2 + 6 * u) * v[k + 1]! + (3 * u2 - 2 * u) * h * m[k + 1]!) / h;
    return [p, d];
  };
  return {
    pose(flightS, _view, out) {
      if (!place || flightS < visit.fromS || flightS > visit.untilS) return false;
      const k = flightS < a ? 0 : flightS < b ? 1 : 2;
      const h = T[k + 1]! - T[k]! || 1;
      const u = Math.min(1, Math.max(0, (flightS - T[k]!) / h));
      const [along, alongRate] = hermite(S, MS, k, u, h);
      const [up, upRate] = hermite(H, MH, k, u, h);
      world.lat = place.lat;
      world.lon = place.lon;
      world.aboveGroundM = place.aboveGroundM + up;
      world.eastM = along * Math.sin(bearing);
      world.northM = along * Math.cos(bearing);
      out.space = "world";
      out.world = world;
      out.yaw = bearing + 0.1 * Math.sin(flightS * 0.25 + phase);
      out.pitch = Math.max(-maxPitch, Math.min(maxPitch, Math.atan2(upRate, Math.abs(alongRate))));
      out.bank = 0;
      out.presence = smooth(Math.min((flightS - visit.fromS) / EDGE_S, (visit.untilS - flightS) / EDGE_S));
      glanceAt(flightS, visit, out);
      return true;
    },
  };
});
