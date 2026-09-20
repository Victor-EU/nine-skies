/**
 * What a profile is, and what survives quitting. (Workstream D, progression.)
 *
 * The GDD asks for two things that are not the same: *the game saves position
 * continuously; quitting mid-air is fine*, and *quitting mid-expedition saves
 * at the last beat and resumes there*. Measured against Expedition 1 those
 * differ by a third of the trip. Its beats - the authored waypoints - are
 * 13.5, 13.4, 1.6 and 8.2 minutes apart, so a player who stops at minute 13.4
 * is put back at Shanghai, having flown 679 km that no longer happened. An
 * autosave every fifteen seconds costs a quarter of a minute instead,
 * whatever the speed mode, because it is a clock and not a distance (F39).
 *
 * So a save holds a position, and the beats already heard are held beside it
 * rather than instead of it (D33). Resuming at the last beat remains
 * available - the beat kilometres are in the plan - and it is a narrative
 * choice rather than the only thing the save layer can offer.
 *
 * Three things are saved and nothing else is: where the aircraft is, what the
 * player has been told, and what they have found. Settings are a fourth, and
 * belong to the install rather than to the profile, which is why they are not
 * here.
 */

/** Bumped when a shape below changes. A profile from the future is refused. */
export const SAVE_VERSION = 1;

/** Up to three local profiles, so a household can share one install (GDD). */
export const MAX_PROFILES = 3;

export interface PositionSave {
  readonly eastM: number;
  readonly northM: number;
  readonly altitudeM: number;
  readonly headingRad: number;
}

export interface RunSave {
  readonly expeditionId: string;
  /**
   * The route the kilometre below was measured along.
   *
   * A saved kilometre is meaningless if the waypoints have moved since: km
   * 1,500 of a re-routed Sea to Sky is somewhere else entirely, and resuming
   * there would put the aircraft over ground nobody checked. The same
   * argument a route section makes about its own elevations (D21), one level
   * up.
   */
  readonly fingerprint: string;
  readonly km: number;
  /** Beat ids already heard, in no particular order. */
  readonly beats: readonly string[];
  readonly arrived: boolean;
}

export interface Profile {
  readonly version: number;
  readonly id: string;
  readonly name: string;
  readonly savedAtMs: number;
  /** Discovery cards met, which is the whole of that system's state (F37). */
  readonly seen: readonly string[];
  readonly runs: readonly RunSave[];
  readonly position: PositionSave | null;
  /** The expedition being flown, if one was. */
  readonly flying: string | null;
}

export function emptyProfile(id: string, name: string): Profile {
  return {
    version: SAVE_VERSION,
    id,
    name,
    savedAtMs: 0,
    seen: [],
    runs: [],
    position: null,
    flying: null,
  };
}

/**
 * A stable name for a route's geometry and pacing.
 *
 * Deliberately not a cryptographic hash: nothing here is defended against an
 * author, only against a route quietly changing under a save. FNV-1a over the
 * numbers that decide what a kilometre means - the waypoints, the leg ends
 * and their modes, and the pacing the route was checked at.
 */
export function fingerprint(parts: readonly (string | number)[]): string {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const text = typeof part === "number" ? part.toFixed(3) : part;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 0x2c; // a separator, so ["ab","c"] and ["a","bc"] differ
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function runFor(profile: Profile, expeditionId: string): RunSave | null {
  return profile.runs.find((r) => r.expeditionId === expeditionId) ?? null;
}

export function withRun(profile: Profile, run: RunSave): Profile {
  return {
    ...profile,
    runs: [...profile.runs.filter((r) => r.expeditionId !== run.expeditionId), run],
  };
}

/**
 * Read a profile out of storage, or refuse it.
 *
 * Refusing is the point. A save is the one file in this game written by a
 * previous version of it, and the failure it must not have is the quiet one:
 * a shape that half-loads and puts the player somewhere nobody checked. So a
 * profile is either this version's shape, something an explicit migration
 * knows how to bring forward, or nothing at all.
 */
export function readProfile(raw: unknown): Profile | null {
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as Partial<Profile>;
  if (candidate.version !== SAVE_VERSION) return null;
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string") return null;

  const seen = Array.isArray(candidate.seen)
    ? candidate.seen.filter((s): s is string => typeof s === "string")
    : [];
  const runs = Array.isArray(candidate.runs)
    ? candidate.runs.filter(
        (r): r is RunSave =>
          typeof r === "object" &&
          r !== null &&
          typeof (r as RunSave).expeditionId === "string" &&
          typeof (r as RunSave).fingerprint === "string" &&
          Number.isFinite((r as RunSave).km) &&
          Array.isArray((r as RunSave).beats),
      )
    : [];
  const position =
    typeof candidate.position === "object" &&
    candidate.position !== null &&
    Number.isFinite(candidate.position.eastM) &&
    Number.isFinite(candidate.position.northM) &&
    Number.isFinite(candidate.position.altitudeM) &&
    Number.isFinite(candidate.position.headingRad)
      ? candidate.position
      : null;

  return {
    version: SAVE_VERSION,
    id: candidate.id,
    name: candidate.name,
    savedAtMs: Number.isFinite(candidate.savedAtMs) ? candidate.savedAtMs! : 0,
    seen,
    runs,
    position,
    flying: typeof candidate.flying === "string" ? candidate.flying : null,
  };
}
