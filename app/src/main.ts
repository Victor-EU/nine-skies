import { Color, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { Terrain } from "../../engine/src/terrain/terrain.js";
import {
  standInGroundTempC,
  standInPrecipMm,
} from "../../engine/src/terrain/syntheticTiles.js";
import {
  HorizonField,
  buildSyntheticHorizonField,
} from "../../engine/src/terrain/horizonField.js";
import {
  DEFAULT_HAZE_DENSITY_PER_M,
  HAZE_SCALE_HEIGHT_M,
} from "../../engine/src/terrain/palette.js";
import {
  SyntheticTileSource,
  loadWorld,
  type LoadedWorld,
} from "../../engine/src/terrain/tileSource.js";
import { HorizonScheduler } from "../../engine/src/terrain/horizon.js";
import { HorizonRing } from "../../engine/src/terrain/horizonRing.js";
import {
  createFlightState,
  step,
  telemetry,
  type Environment,
  type FlightInput,
} from "../../engine/src/sim/flight.js";
import { LIGHT_PISTON, climbRecoveryRatio } from "../../engine/src/sim/aircraft.js";
import { createProbe } from "./probe.js";
import { Input } from "../../engine/src/input/input.js";
import { helpLines, type Action } from "../../engine/src/input/bindings.js";
import type { PadSnapshot } from "../../engine/src/input/gamepad.js";
import { captureFrameCost, frameCostTable } from "./frameCost.js";
import { Aerial } from "../../engine/src/gfx/aerial.js";
import {
  BUNDLE_VERSION,
  ExpeditionRun,
  cappedPacing,
  type ExpeditionBundle,
} from "../../engine/src/expedition/runner.js";
import { CardQueue } from "../../engine/src/discovery/queue.js";
import { Atlas } from "../../engine/src/journal/atlas.js";
import {
  DEFAULT_TIME_RATE,
  WorldClock,
  clockString,
  dayOfYear,
} from "../../engine/src/sim/solar.js";
import { unprojectAlbers } from "../../engine/src/terrain/worldGrid.js";
import { spreadsToOpen } from "../../engine/src/journal/spread.js";
import { TriggerField } from "../../engine/src/discovery/triggers.js";
import { pointAtKm } from "../../engine/src/expedition/path.js";
import {
  planFingerprint,
  resumeRun,
  roomAt,
} from "../../engine/src/expedition/resume.js";
import {
  emptyProfile,
  runFor,
  withRun,
  type Profile,
} from "../../engine/src/save/profile.js";
import { Autosave } from "../../engine/src/save/autosave.js";
import { openProfiles } from "./profiles.js";
import {
  BANK_FOLLOW_CANDIDATES,
  DEFAULT_COMFORT,
  FOV_CANDIDATES,
  bankFollowLabel,
  cameraRollRad,
  type ComfortSettings,
} from "../../engine/src/gfx/comfort.js";
import {
  CAMERA_AIM_AHEAD,
  CAMERA_AIM_UP_REAL_M,
  CAMERA_BACK_REAL_M,
  CAMERA_FAR_REAL_M,
  CAMERA_NEAR_REAL_M,
  CAMERA_UP_REAL_M,
  COMPRESSION_CANDIDATES,
  CRUISE_CANDIDATES,
  DEFAULT_PACING,
  DEFAULT_SCALE,
  DRAMA_CANDIDATES,
  TERRAIN_LIMITED_CRUISE_KM_PER_MIN,
  apparentExaggeration,
  hazeDensityPerWorldUnit,
  hazeFalloffPerWorldUnit,
  minutesForKm,
  scaleFor,
  toWorldH,
  type Pacing,
  type WorldScale,
} from "../../engine/src/sim/scale.js";

/**
 * Prototype shell for gate G1.
 *
 * One question: does flying over real terrain, with real air, feel like
 * anything? Everything here exists to put that question in front of a player
 * and let them answer it - the compression A/B toggle most of all.
 */

/**
 * The month free flight is flown in, when no expedition names one.
 *
 * This used to be the only month there was, with Expedition 1's own value
 * copied into the comment beside it — a constant and a content file holding
 * the same number with nothing keeping them equal. The plan carries its
 * month now and the expedition's wins (F41); this is the fallback.
 */
const FREE_FLIGHT_MONTH = 11; // late autumn: thick Sichuan fog, clear plateau
/** And the hour, Beijing time. Mid-morning: the sun is up everywhere. */
const FREE_FLIGHT_HOUR = 10;

const canvas = document.getElementById("view") as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
/**
 * How many device pixels the renderer draws per CSS pixel.
 *
 * Unexamined until the floor device was decided, and now the most expensive
 * single line in the file. The frame budget is written for 1080p - 2.07
 * megapixels - and the floor is a Retina Mac, where this line means a
 * fullscreen frame is 3,024 x 1,964, or 5.94 megapixels. Nearly three times
 * the pixels the budget was costed against, and fragment cost is close to
 * linear in them (F30).
 *
 * Capping it lower is the obvious lever and is deliberately not pulled:
 * measured at 5.94 megapixels the whole current frame is 2.13 ms of 33.3, and
 * the pass a cap would shrink is the 1.70 ms empty-frame clear, not the
 * terrain, which did not move between 2.07 and 5.94 megapixels. A cap at 1.5
 * buys about a millisecond and costs every edge (D27, F34). Look again when
 * the atmosphere lands - that is the full-screen pass the pixels land on.
 * The measurement is one command: `__ns.frameCost(20, [3024, 1964], ["wall-rim"])`.
 */
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new Scene();
// The clip planes are real distances divided by the compression, so they are
// set by `applyScale` once the terrain exists rather than written here.
const camera = new PerspectiveCamera(DEFAULT_COMFORT.fovDeg, 1, 1, 1);

let scale: WorldScale = { ...DEFAULT_SCALE };
// Widening lookup: the candidate lists are `as const` so the tests can assert
// membership, which leaves `indexOf` refusing a plain number without it.
const indexIn = (candidates: readonly number[], value: number) => candidates.indexOf(value);
// A test asserts the default is on the grid, so neither of these is -1.
let compressionIndex = indexIn(COMPRESSION_CANDIDATES, DEFAULT_SCALE.horizontalCompression);
let dramaIndex = indexIn(DRAMA_CANDIDATES, apparentExaggeration(DEFAULT_SCALE));

/**
 * The pacing A/B - how long a route takes.
 *
 * Trip length is set by cruise speed and by nothing else, which is why this
 * exists and why the compression toggle turned out not to answer it (F15).
 * Formally a G2 question, because twelve minutes of a twenty-five-minute
 * route is not enough of one to judge, but the toggle belongs here: the
 * prototype is where a whole leg gets flown.
 */
let pacing: Pacing = { ...DEFAULT_PACING };
let cruiseIndex = indexIn(CRUISE_CANDIDATES, DEFAULT_PACING.cruiseKmPerMin);

/**
 * The comfort settings - on the critical path's "can start early and should"
 * list, because they are cheap and sickness found at G2 is a redesign.
 *
 * Two of the GDD's three. The horizon lock turned out to be the behaviour
 * rather than an option, so what is here is the camera that banks; camera
 * smoothing is not here at all, and F35 says why in numbers (D28).
 */
let comfort: ComfortSettings = { ...DEFAULT_COMFORT };
let fovIndex = indexIn(FOV_CANDIDATES, DEFAULT_COMFORT.fovDeg);
let bankIndex = indexIn(BANK_FOLLOW_CANDIDATES, DEFAULT_COMFORT.bankFollow);

/**
 * Real elevation if the pipeline has published a corridor, otherwise the
 * stand-in world (workstream A stages 4 and 5).
 *
 * No fallback inside a corridor build: past its edge the world simply stops
 * rather than handing back fiction, because a seam between real China and a
 * plausible invention is the one thing a playtest must never be shown.
 */
const standIn = new SyntheticTileSource();
let world: LoadedWorld | null = null;
const worldT0 = performance.now();
try {
  world = await loadWorld("/world/sea-to-sky");
} catch (error) {
  console.error("published world failed to load; flying the stand-in", error);
}
const worldMs = performance.now() - worldT0;

const terrain = new Terrain({
  scale,
  viewRadiusTiles: 6,
  layers: 256,
  source: world?.source ?? standIn,
});
for (const mesh of terrain.meshes) scene.add(mesh);

/**
 * The horizon impostor (build plan D15, prototype finding F1).
 *
 * The tile cache reaches 384 km; from the Sichuan Basin the plateau wall is
 * 564 km ahead. Without this the wall is simply not in the world, and G1's
 * playtest would be asking players about a moment that never rendered.
 *
 * The field is generated here only when the stand-in world is flying. A
 * published corridor ships it pre-reduced, from the same 1 km grid the tiles
 * came from - one artefact, so the wall you fly at and the wall on the map
 * cannot disagree.
 */
const fieldT0 = performance.now();
const horizonField = world
  ? HorizonField.fromData(
      world.horizon,
      world.manifest.horizon.width,
      world.manifest.horizon.height,
      world.manifest.horizon.sampleKm,
    )
  : buildSyntheticHorizonField();
const fieldMs = performance.now() - fieldT0;
const horizon = new HorizonScheduler(horizonField);
const ring = new HorizonRing(horizon.front, {
  hazeColor: new Color(0.72, 0.79, 0.86),
  sunColor: new Color(1.0, 0.97, 0.92),
  // The same sun the terrain uses, so the two agree about where the light is.
  sunDirection: new Vector3(0.45, 0.72, 0.53).normalize(),
  // Both per real metre, converted for the scale in flight - the frame loop
  // rewrites them every frame anyway, but a first frame drawn in the wrong
  // units is still a wrong first frame.
  hazeDensity: hazeDensityPerWorldUnit(DEFAULT_HAZE_DENSITY_PER_M, DEFAULT_SCALE),
  hazeHeightFalloff: hazeFalloffPerWorldUnit(HAZE_SCALE_HEIGHT_M, DEFAULT_SCALE),
});
scene.add(ring.mesh);

// Push the starting scale through terrain, ring and camera by the same path a
// toggle takes, so the boot state cannot drift from a toggled one.
applyScale();

// Start on the coast, pointed inland, at the altitude the GDD opens on. A
// published corridor carries its own start - Shanghai, aimed at Lhasa - because
// only the pipeline knows where Shanghai is in grid metres.
/**
 * The authored expedition under the aircraft, if there is one (F38).
 *
 * `npm run content:expeditions` cuts the same legs the content gate flies
 * into `app/public/expeditions.json`, and this reads them. Nothing here
 * re-derives a route: a runtime that measured its own legs could disagree
 * with the check that passed, which is the one thing a bundle must not do.
 *
 * Absent - a stand-in world, a missing bundle, a bundle from a different
 * shape of this file - means free flight, which is what every G1 session is
 * anyway. The expedition is instrumentation for now: the runner reports
 * progress, the leg and the beats, and the HUD prints them. What plays a beat
 * to a player rather than to an operator is the journal, and that is phase 2.
 */
async function loadBundle(): Promise<ExpeditionBundle> {
  const empty: ExpeditionBundle = {
    version: BUNDLE_VERSION,
    expeditions: [],
    cards: [],
    atlas: { regions: [], entries: [], spreads: [] },
  };
  try {
    const response = await fetch("/expeditions.json");
    if (!response.ok) return empty;
    const bundle = (await response.json()) as ExpeditionBundle;
    return bundle.version === BUNDLE_VERSION ? bundle : empty;
  } catch {
    return empty;
  }
}

const bundle = await loadBundle();
const plan = bundle.expeditions.find((p) => p.id === world?.manifest.corridor) ?? null;
const run = plan ? new ExpeditionRun(plan) : null;
const planPrint = plan ? planFingerprint(plan) : "";
/**
 * The world's clock (F41).
 *
 * The month and the start hour are the expedition's, and free flight gets
 * the fallbacks. The rate is 1x: a session and the world agree on how long a
 * minute is, so `start_hour` names the hour an expedition is flown at rather
 * than an hour it begins and leaves behind. What that costs, and what the
 * alternative costs, is measured in F41 and is a design decision rather than
 * an engineering one.
 */
const month = plan?.month ?? FREE_FLIGHT_MONTH;
const clock = new WorldClock(
  (plan?.startHour ?? FREE_FLIGHT_HOUR) * 60,
  dayOfYear(month),
  DEFAULT_TIME_RATE,
);
/** The card catchments, which belong to free flight as much as to a route. */
const cardName = new Map(bundle.cards.map((c) => [c.id, c.name]));
const discoveries = new TriggerField(bundle.cards);

/**
 * The profile, read before anything is placed (workstream D, D33).
 *
 * One profile in the prototype and three in the schema: choosing between them
 * is a menu, and the menu is phase 2. `__ns.newProfile()` is the operator's
 * way of starting clean before a session, which is the only reason this
 * prototype needs more than one.
 */
const store = await openProfiles();
const PROFILE_ID = "default";
let profile: Profile =
  (await store.read(PROFILE_ID)) ?? emptyProfile(PROFILE_ID, "Profile 1");
discoveries.restore(profile.seen);
/**
 * The journal's side of the same set (F40).
 *
 * `discoveries` knows which catchments have been entered; the atlas knows
 * what those entries are, which region each is filed under, and the twelve
 * comparison spreads, which have no catchment because they are unlocked by
 * what the player has done rather than by where they are. Both read the one
 * seen set the profile holds, and the atlas is what writes it back, because
 * it is the superset: a spread is an entry too.
 */
const atlas = new Atlas(bundle.atlas.regions, bundle.atlas.entries, profile.seen);
const spreadName = new Map(bundle.atlas.spreads.map((s) => [s.id, s.name]));
/** Expeditions this profile has arrived at, which is one of the two unlocks. */
const finished = new Set(profile.runs.filter((r) => r.arrived).map((r) => r.expeditionId));
const resumed = plan ? resumeRun(plan, runFor(profile, plan.id), planPrint) : { kind: "start" as const };
const autosave = new Autosave();
/** The single-card queue from F37, holding beats and cards alike. */
const beatQueue = new CardQueue();

/**
 * Write the profile. Three things and nothing else: where the aircraft is,
 * what the player has been told, and what they have found.
 */
async function persist(): Promise<void> {
  const next: Profile = {
    ...profile,
    savedAtMs: Date.now(),
    seen: atlas.seen,
    position: {
      eastM: flight.eastM,
      northM: flight.northM,
      altitudeM: flight.altitudeM,
      headingRad: flight.headingRad,
    },
    flying: flyingExpedition && plan ? plan.id : null,
  };
  profile =
    run && plan
      ? withRun(next, {
          expeditionId: plan.id,
          fingerprint: planPrint,
          ...run.snapshot(),
          arrived: run.arrived,
        })
      : next;
  await store.write(profile);
}
const beatName = new Map((plan?.beats ?? []).map((b) => [b.id, b.name ?? b.id]));

const START = world?.manifest.start ?? {
  eastM: 120_000,
  northM: 1_500_000,
  altitudeM: 1200,
  headingRad: Math.PI / 2,
};
/**
 * Where the aircraft starts: where the player left it, or the world's own
 * start. Resuming a position rather than a beat is D33, and F39 is the
 * measurement - Expedition 1's beats are up to 13.5 minutes apart, so "resume
 * at the last beat" can hand back a third of the trip.
 */
const flight = createFlightState(
  profile.position
    ? {
        eastM: profile.position.eastM,
        northM: profile.position.northM,
        altitudeM: profile.position.altitudeM,
        headingRad: profile.position.headingRad,
      }
    : { ...START },
);
if (run) {
  // A route that has been re-authored since the save keeps the beats - those
  // are places the player was told about - and drops the kilometre, which is
  // measured along waypoints that have moved.
  if (resumed.kind === "resume") run.restore({ km: resumed.km, beats: resumed.beats });
  else if (resumed.kind === "moved") run.restore({ km: 0, beats: resumed.beats });
}
/**
 * Cards the aircraft has just met, wherever they came from.
 *
 * One path, because there are two sets to keep in step now: the trigger field
 * knows a catchment has been entered so it does not fire twice, and the atlas
 * knows it has been *collected*. Those used to be the same set, and the
 * profile was written from the first of them. Making the journal the writer
 * is what showed they had drifted apart (F40).
 */
function collect(ids: readonly string[]): void {
  if (ids.length > 0) beatQueue.offer(ids);
  for (const id of ids) atlas.see(id);
}

/**
 * The teleport verb, in all three coordinates at once (D30, D32).
 *
 * A jump is not a flight: the route may not be rejoined by sweeping the line
 * between where the player was and where they now are, and neither may the
 * card catchments - a 2,900 km jump collects ten of ten in a measured case
 * against none for a jump (F37). Both engines have had `moveTo` for that
 * since F38; what they had not had is every caller using it. `goTo` and
 * `goToAnchor` - the operator's drop-a-participant-here controls, which is
 * where a teleport actually happens in a playtest - assigned the position
 * straight onto the flight state, so the next frame's `advance` swept the
 * whole jump. And the three callers that did use it threw away what it
 * returned, so a player set down inside a catchment was told nothing and
 * collected nothing (F40).
 */
function landed(): void {
  run?.moveTo(flight.eastM, flight.northM);
  collect(discoveries.moveTo(flight.eastM, flight.northM));
}

landed();
/**
 * Whether the authored expedition is being flown, rather than merely tracked.
 *
 * Off unless the profile says the player was flying it, and G1 never turns it
 * on: a G1 session is free flight over the corridor, with the drama toggle in
 * the operator's hands. What the flag buys when it is on is the two things
 * that make the route the checked one - the leg's own speed mode and the
 * pacing cap (D31) - and those are exactly the two a free-flight session must
 * not have taken away from it.
 */
let flyingExpedition = plan !== null && profile.flying === plan.id;

const el = (id: string) => document.getElementById(id)!;

const input: FlightInput = { pitch: 0, roll: 0, mode: "cruise" };

/**
 * Keyboard and gamepad behind one table (workstream D, "from day one"). The
 * browser events feed the keyboard source; the pad is polled in the frame,
 * because the Gamepad API has no events for sticks or buttons. Which device is
 * saying what is the source's business, and the frame asks for one intent.
 */
const player = new Input();
addEventListener("keydown", (e) => {
  // Bound keys are ours and the page never sees them; everything else - the
  // dev tools shortcut, reload - goes through untouched.
  if (player.keyboard.keyDown(e.key.toLowerCase())) e.preventDefault();
});
addEventListener("keyup", (e) => player.keyboard.keyUp(e.key.toLowerCase()));
// A key held when the window loses focus never sends its keyup here.
addEventListener("blur", () => player.keyboard.releaseAll());
let padId: string | null = null;
addEventListener("gamepadconnected", (e) => (padId = e.gamepad.id));
addEventListener("gamepaddisconnected", () => (padId = null));

/** The first connected pad, or none. Chrome hands back a sparse array. */
function connectedPad(): PadSnapshot | null {
  if (typeof navigator.getGamepads !== "function") return null;
  for (const p of navigator.getGamepads()) if (p?.connected) return p;
  return null;
}

/** What a press does. The table says which press; this says what. */
function act(action: Action): void {
  switch (action) {
    case "low":
    case "cruise":
    case "boost":
      input.mode = action;
      break;
    case "cycleCompression":
      cycleCompression();
      break;
    case "cycleDrama":
      cycleDrama();
      break;
    case "cyclePacing":
      cyclePacing();
      break;
    case "toggleHorizon":
      // The A/B for F1 itself: with the impostor off, the plateau is not drawn.
      ring.mesh.visible = !ring.mesh.visible;
      break;
    case "cycleFov":
      fovIndex = (fovIndex + 1) % FOV_CANDIDATES.length;
      comfort = { ...comfort, fovDeg: FOV_CANDIDATES[fovIndex]! };
      camera.fov = comfort.fovDeg;
      camera.updateProjectionMatrix();
      break;
    case "cycleBankFollow":
      bankIndex = (bankIndex + 1) % BANK_FOLLOW_CANDIDATES.length;
      // Nothing to rebuild: `placeAt` reads the roll every frame, and at 0 it
      // sets the level up-vector rather than leaving the last one on.
      comfort = { ...comfort, bankFollow: BANK_FOLLOW_CANDIDATES[bankIndex]! };
      break;
    case "toggleExpedition":
      flyingExpedition = run !== null && !flyingExpedition;
      // Starting is not flying here from the start: the expedition picks up
      // where the aircraft already is, which is what an operator dropping a
      // participant at km 900 needs (F28), and what a resume is.
      if (flyingExpedition) run?.moveTo(flight.eastM, flight.northM);
      break;
    case "reset":
      Object.assign(flight, createFlightState({ ...START, headingRad: Math.PI / 2 }));
      // The aircraft did not fly here, so neither did the expedition or the
      // card catchments: the teleport seam, in both coordinates (F37, F38).
      landed();
      break;
  }
}

// The help block is the table, so it cannot name a key the handler does not
// have. Notes are the operator's, and stay in the table with the binding.
el("help").innerHTML = helpLines()
  .map(
    (l) =>
      `<b>${l.keys}</b>${l.pad ? ` <span class="pad">${l.pad}</span>` : ""} ${l.label}` +
      (l.note ? ` <i>(${l.note})</i>` : ""),
  )
  .join("<br />") +
  `<br /><i>&ldquo;1 s down = N s up&rdquo; is the climb the air still gives against the descent it always gives (F19)</i>`;

/**
 * The G1 A/B, both axes (build plan D6, finding F14).
 *
 * Scale is a live uniform precisely so a playtester can be flipped mid-flight
 * without rebuilding the world - but there are two things to flip, not one,
 * and welding them together is what F14 caught. The state here is the pair of
 * answers, `(compression, drama)`; the vertical exaggeration the renderer
 * wants is derived from them and never set directly.
 */
function applyScale(): void {
  scale = scaleFor(COMPRESSION_CANDIDATES[compressionIndex]!, DRAMA_CANDIDATES[dramaIndex]!);
  terrain.setScale(scale);
  // The profile is stored in real kilometres, so a scale change is a rebuild
  // of the vertices and never another march.
  ring.rebuild(scale);
  // Real distances, divided by the compression. The aircraft is the same real
  // size in all three candidates, so it is framed identically in all three -
  // the A/B compares worlds rather than cameras, and every candidate gets the
  // same depth precision.
  camera.near = toWorldH(CAMERA_NEAR_REAL_M, scale);
  camera.far = toWorldH(CAMERA_FAR_REAL_M, scale);
  camera.updateProjectionMatrix();
}

/** How much world is on screen. Terrain shape does not move. */
function cycleCompression(): void {
  compressionIndex = (compressionIndex + 1) % COMPRESSION_CANDIDATES.length;
  applyScale();
}

/** How dramatic the relief looks. The framing does not move. */
function cycleDrama(): void {
  dramaIndex = (dramaIndex + 1) % DRAMA_CANDIDATES.length;
  applyScale();
}

/**
 * How long the route takes. Nothing to rebuild: the sim reads the pacing on
 * the next step, and the world is not involved - which is the whole point of
 * the distinction F15 drew.
 */
function cyclePacing(): void {
  cruiseIndex = (cruiseIndex + 1) % CRUISE_CANDIDATES.length;
  pacing = { cruiseKmPerMin: CRUISE_CANDIDATES[cruiseIndex]! };
}

/**
 * Set while a measurement owns the frame.
 *
 * The frame-cost capture places the camera itself, switches parts of the scene
 * off one at a time and asks the GPU what each part cost. If the animation
 * loop keeps running underneath it, every one of those is undone before the
 * query resolves: `terrain.update` restores each bucket's visibility, the
 * camera goes back to the aircraft, and what gets timed is the ordinary frame
 * with extra steps. The first capture taken without this reported 6 ms to
 * clear an empty screen and a negative cost for drawing terrain, which is how
 * it was found.
 */
let suspended = false;

function resize(): void {
  // A measurement owns the canvas as well as the frame. Without this, a window
  // resized during a frame-cost capture silently moves every remaining station
  // off 1080p while the report goes on claiming 1080p - which is the one kind
  // of wrong this whole exercise is about.
  if (suspended) return;
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

// A tab being closed gets one more write. IndexedDB may not finish it -
// nothing on this path is guaranteed to - which is the other half of why the
// interval is fifteen seconds rather than a minute.
addEventListener("pagehide", () => void persist());

/**
 * Which world is actually on screen. Worth a permanent HUD line rather than a
 * console message: every screenshot and every playtest note should say whether
 * the terrain in it was measured or invented.
 */
const worldLabel = world
  ? `${world.manifest.corridor} · ${world.manifest.heights.tiles} real tiles ` +
    `(${(world.manifest.heights.bytes / 1e6).toFixed(1)} MB in ${worldMs.toFixed(0)} ms)`
  : `stand-in world · no published corridor (${worldMs.toFixed(0)} ms)`;
/**
 * The corridor's own flown length, for the pacing readout. Anchors arrive in
 * route order - Shanghai first, Lhasa last, as `ANCHORS` in `tiles.py` lists
 * them - so this is the route rather than the straight line, which is 345 km
 * shorter and would quietly flatter every pacing candidate.
 */
const routeKm = (() => {
  const points = Object.values(world?.manifest.anchors ?? {});
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    km += Math.hypot(b.eastM - a.eastM, b.northM - a.northM) / 1000;
  }
  return km;
})();

/**
 * The air, blended at the aircraft once a frame (D12). It used to be written
 * out here; it is in the engine now so the two numbers G1 is partly scored on
 * can be measured, which they had never been (F36).
 */
const air = new Aerial();

/**
 * Dev hook. Playtest operators need to drop a player onto the plateau without
 * flying there first, and G1's A/B needs to be drivable from outside. Stripped
 * from production builds.
 */
if (import.meta.env.DEV) {
  (globalThis as Record<string, unknown>).__ns = {
    flight,
    terrain,
    getScale: () => scale,
    /**
     * Set either A/B axis by value. G1 randomises the order each participant
     * sees them in, which a cycle key cannot do - so the operator's script
     * drives these, and the keys are for the operator's own hands.
     */
    setCompression(compression: number): boolean {
      const i = indexIn(COMPRESSION_CANDIDATES, compression);
      if (i < 0) return false;
      compressionIndex = i;
      applyScale();
      return true;
    },
    setDrama(apparent: number): boolean {
      const i = indexIn(DRAMA_CANDIDATES, apparent);
      if (i < 0) return false;
      dramaIndex = i;
      applyScale();
      return true;
    },
    getPacing: () => pacing,
    /**
     * Put the aircraft at a kilometre of the loaded expedition, facing along
     * it - the operator's way of starting a session partway, which G1's own
     * protocol asks for (F28 prices a session from km 900). A jump, not a
     * flight: the expedition is told so, and the beats behind it are marked
     * heard rather than played (F38).
     */
    jumpToKm(km: number, altitudeM?: number): boolean {
      if (!run || !plan) return false;
      const at = pointAtKm(run.path, km);
      // Never below the floor. Dropping a participant at km 1,500 at the
      // altitude the aircraft happened to have is F28's own hazard - 1,200 m
      // in front of the Hengduan is a crash twenty minutes later, and the
      // route's floor there is 5,554 m. An operator who wants the altitude a
      // whole expedition would have here has it printed by
      // `npm run content:sessions`, and can pass it.
      const floorM = roomAt(plan, km, 0)?.floorM ?? 0;
      Object.assign(
        flight,
        createFlightState({
          eastM: at.eastM,
          northM: at.northM,
          altitudeM: altitudeM ?? Math.max(flight.altitudeM, floorM),
          headingRad: at.headingRad,
        }),
      );
      landed();
      return true;
    },
    getRun: () => (run ? { ...run.snapshot(), plan: run.plan.id } : null),
    /** Write now, and say how long the write took. The autosave question. */
    async save(): Promise<number> {
      const t0 = performance.now();
      await persist();
      return performance.now() - t0;
    },
    getProfile: () => profile,
    /**
     * Start a clean profile, which is what an operator does between
     * participants. The schema holds three; choosing between them is a menu,
     * and the menu is phase 2.
     */
    async newProfile(name = "Profile 1"): Promise<void> {
      profile = emptyProfile(PROFILE_ID, name);
      discoveries.forget();
      await store.write(profile);
    },
    setCruise(kmPerMin: number): boolean {
      const i = indexIn(CRUISE_CANDIDATES, kmPerMin);
      if (i < 0) return false;
      cruiseIndex = i;
      pacing = { cruiseKmPerMin: CRUISE_CANDIDATES[i]! };
      return true;
    },
    horizon,
    ring,
    fieldMs,
    renderer,
    scene,
    camera,
    /**
     * Framebuffer probes. Call from a rAF callback, not from an idle console:
     *   requestAnimationFrame(() => console.log(__ns.probe.horizonAB()))
     */
    probe: createProbe(renderer, scene, camera, ring),
    /**
     * Ask the GPU what a frame costs, per pass, at 1080p, at every station on
     * the route - the frame budget's own units. From the console:
     *   __ns.frameCost().then((r) => console.log(__ns.frameCostTable(r)))
     */
    /**
     * Take the frame for a measurement of your own, and give it back with the
     * returned function. The same seam `frameCost` uses - exposed because any
     * hand measurement needs it for the same reason: with the loop running,
     * the camera moves between one timing and the next.
     */
    suspend: () => {
      suspended = true;
      return () => {
        suspended = false;
        resize();
      };
    },
    frameCost: (samples?: number, size?: [number, number], only?: string[]) =>
      captureFrameCost({
        renderer,
        scene,
        camera,
        terrain,
        ring,
        // Level, whatever the player has the camera set to. A rolled frame is
        // not a cheaper or dearer frame, but it is a different one, and a
        // capture is only worth taking if it compares to the last (D25).
        placeAt: (s) => placeAt(s.eastM, s.northM, s.altitudeM, s.headingRad, 0),
        ...(size ? { width: size[0], height: size[1] } : {}),
        ...(only ? { only } : {}),
        suspend: () => {
          suspended = true;
          return () => {
            suspended = false;
            // The capture puts back the size it found. If the window changed
            // while it was ignoring resize events, that size is stale, so the
            // window gets the last word.
            resize();
          };
        },
        samples,
      }),
    frameCostTable,
    world,
    /** The fiction, kept reachable so the two worlds can be compared. */
    standIn,
    /** Jump to a distance inland, in km. */
    goTo(inlandKm: number, northKm: number, altitudeM: number) {
      flight.eastM = inlandKm * 1000;
      flight.northM = northKm * 1000;
      flight.altitudeM = altitudeM;
      flight.verticalRateMs = 0;
      landed();
    },
    /**
     * Drop onto a named place from the manifest - "lhasa", "chongqing",
     * "tiger-leaping-gorge". The whole point of publishing anchors is that a
     * playtest operator never has to know a grid coordinate.
     */
    goToAnchor(name: string, clearanceM = 900): boolean {
      const anchor = world?.manifest.anchors[name];
      if (!anchor) return false;
      flight.eastM = anchor.eastM;
      flight.northM = anchor.northM;
      const ground = terrain.groundElevationM(anchor.eastM, anchor.northM) ?? 0;
      flight.altitudeM = ground + clearanceM;
      flight.verticalRateMs = 0;
      landed();
      return true;
    },
  };
}

/**
 * Put the world and the camera where a frame at this point would put them.
 *
 * Lifted out of the frame so that the frame-cost capture measures the picture
 * the game draws rather than a second arrangement that resembles it. A pass
 * budget taken against a near-copy of the camera rig is a measurement of the
 * copy, and nothing would ever show that it had drifted.
 *
 * Everything here is a function of position, altitude, heading and roll alone
 * - no dt, no input, no wall clock - which is also what makes a capture
 * repeatable. The roll arrived with the comfort pass and did not cost that:
 * it is handed in beside the heading rather than remembered, so a capture
 * passes zero and measures the level frame it always measured (F35).
 */
function placeAt(
  eastM: number,
  northM: number,
  altitudeM: number,
  headingRad: number,
  rollRad: number,
): void {
  const cameraWorld = terrain.update(eastM, northM, altitudeM);

  // Horizon after the terrain, so it sees this frame's rebase.
  if (horizon.update(eastM, northM, altitudeM)) ring.rebuild(scale);
  ring.update(
    terrain.toWorld(horizon.front.eastM, horizon.front.northM, horizon.front.altitudeM),
    cameraWorld,
  );

  // Chase camera: behind and above, looking a little ahead of the aircraft.
  // Every offset goes through `toWorldH`, including the two vertical ones -
  // see the note on the constants. That is what makes the compression A/B a
  // comparison of worlds rather than of camera rigs.
  const fwd = new Vector3(Math.sin(headingRad), 0, Math.cos(headingRad));
  const back = toWorldH(CAMERA_BACK_REAL_M, scale);
  const up = toWorldH(CAMERA_UP_REAL_M, scale);
  camera.position.copy(cameraWorld).addScaledVector(fwd, -back).add(new Vector3(0, up, 0));
  // The horizon roll, which `lookAt` reads off `camera.up`. Set every frame
  // including at zero, so turning the horizon lock back on levels the camera
  // rather than leaving the last tilt baked into the basis.
  camera.up.set(0, 1, 0);
  if (rollRad !== 0) camera.up.applyAxisAngle(fwd, -rollRad);
  camera.lookAt(
    cameraWorld
      .clone()
      .addScaledVector(fwd, back * CAMERA_AIM_AHEAD)
      .add(new Vector3(0, toWorldH(CAMERA_AIM_UP_REAL_M, scale), 0)),
  );

  // Sky deepens as the air thins - the GDD's first visual cue for altitude -
  // over whatever the region underneath is doing. The ground is read back from
  // the terrain rather than passed in, so the haze is keyed to the elevation
  // that is actually on screen.
  air.update(eastM / 1000, terrain.groundElevationM(eastM, northM) ?? 0, altitudeM);
  renderer.setClearColor(air.sky, 1);
  // The region table and the scale height are real quantities; the shaders
  // integrate in world units. Convert here, once, for both materials.
  const hazeDensityWorld = hazeDensityPerWorldUnit(air.hazeDensityPerM, scale);
  const hazeFalloffWorld = hazeFalloffPerWorldUnit(HAZE_SCALE_HEIGHT_M, scale);
  for (const m of [terrain.material, ring.material]) {
    (m.uniforms.uHazeColor!.value as Color).copy(air.sky);
    (m.uniforms.uSunColor!.value as Color).copy(air.sun);
    m.uniforms.uHazeDensity!.value = hazeDensityWorld;
    m.uniforms.uHazeHeightFalloff!.value = hazeFalloffWorld;
  }
}

let last = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;
let fpsShown = 0;

function frame(now: number): void {
  if (suspended) {
    // Swallow the gap, so the aircraft does not leap forward on resume.
    last = now;
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  const intent = player.poll(connectedPad());
  input.pitch = intent.pitch;
  input.roll = intent.roll;
  for (const action of intent.actions) act(action);

  // Environment under the aircraft. Ground elevation is read back from the
  // same Int16 buffer the GPU is drawing, so HUD and picture always agree.
  const groundM = terrain.groundElevationM(flight.eastM, flight.northM) ?? 0;
  const inlandKm = flight.eastM / 1000;
  const northKm = flight.northM / 1000;
  const env: Environment = {
    groundElevationM: groundM,
    groundTempC: standInGroundTempC(northKm, groundM, month),
    monthlyPrecipMm: standInPrecipMm(inlandKm, northKm, month),
    windEastMs: 0,
    windNorthMs: 0,
  };

  // An expedition is flown at or below the pacing its route was checked at
  // (D31). Faster is not a preference, it is a different flight: at 190 this
  // route is 210 m inside the Nyainqentanglha, and at 160 it can no longer
  // get down onto Lhasa (F38). Free flight keeps all three candidates.
  const flown = plan && flyingExpedition ? cappedPacing(plan, pacing) : pacing;
  step(flight, input, env, dt, LIGHT_PISTON, flown);
  const tm = telemetry(flight, env, input, LIGHT_PISTON, flown);

  const progress = run?.advance(flight.eastM, flight.northM) ?? null;
  // Card catchments are swept whether or not a route is being flown: free
  // flight is where most of them are met (F37).
  const found = discoveries.advance(flight.eastM, flight.northM);
  collect(found);
  // The leg's authored speed, which is the other half of what makes this the
  // route the content gate flew: `low / low / cruise / cruise` is not a
  // suggestion, it is the profile that clears the ground (F18).
  // `approach` included: it is the one mode that changes the compression
  // rather than the airspeed, and it is the only thing measured that gets
  // this aeroplane down into Lhasa (D26, F31).
  if (progress && flyingExpedition) input.mode = progress.mode;
  // Tracking still crosses beats and marks them heard, and that is not a leak:
  // starting an expedition partway marks everything behind the aircraft heard
  // anyway, because it is a jump rather than a flight.
  if (progress && flyingExpedition && progress.beats.length > 0) beatQueue.offer(progress.beats);
  // An arrival is the first of the GDD's two unlocks for a comparison spread;
  // finding the last card in both of a spread's regions is the other. Both
  // are checked here because both change on the same frames, and a spread
  // opens once: after that it is a journal page like any other entry (F40).
  if (progress?.arrived && plan) finished.add(plan.id);
  for (const spread of spreadsToOpen(bundle.atlas.spreads, atlas, finished)) {
    atlas.see(spread.id);
    beatQueue.offer([spread.id]);
  }
  const beat = beatQueue.update(now / 1000);

  // Every fifteen seconds, and whenever the player has just been told
  // something - so the last thing said is never ahead of the last thing
  // written down. The write is asynchronous and unawaited on purpose: the
  // frame must not wait on storage, and a write lost to a hard quit costs the
  // interval, which is what the interval is for (D33, F39).
  const toldSomething = found.length > 0 || (progress?.beats.length ?? 0) > 0;
  if (autosave.due(now / 1000, toldSomething ? "beat" : "tick")) void persist();

  placeAt(
    flight.eastM,
    flight.northM,
    flight.altitudeM,
    flight.headingRad,
    cameraRollRad(flight.bankRad, comfort),
  );
  renderer.render(scene, camera);

  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    fpsShown = fpsFrames / fpsAccum;
    fpsAccum = 0;
    fpsFrames = 0;
  }

  el("alt").textContent = Math.round(flight.altitudeM).toLocaleString();
  el("gnd").textContent = Math.round(groundM).toLocaleString();
  el("temp").textContent = tm.outsideAirTempC.toFixed(1);
  el("hum").textContent = Math.round(tm.humidity * 100).toString();
  el("climb").textContent = flight.verticalRateMs.toFixed(1);

  const bar = el("densityBar");
  bar.style.width = `${Math.round(tm.densityRatio * 100)}%`;
  bar.classList.toggle("thin", tm.densityRatio < 0.7);
  el("densityText").textContent = tm.densityRatio.toFixed(2);

  el("mode").textContent = flight.mode.toUpperCase();
  const boost = el("boostState");
  boost.textContent = tm.boostAvailable ? "boost ready" : "air too thin for boost";
  boost.classList.toggle("dead", !tm.boostAvailable);
  // The price of altitude, beside the climb rate that sets it. Descent is
  // gravity-assisted and unchanged by height; climb is power-limited and has
  // lost most of itself by plateau cruise, so a second of looking down costs
  // four seconds at the coast and two dozen over Tibet (F19). It is the
  // density bar's consequence, which the bar itself cannot show.
  const recovery = climbRecoveryRatio(LIGHT_PISTON, flight.altitudeM);
  el("ground").textContent =
    `${((tm.groundSpeedMs * 60) / 1000).toFixed(0)} km/min · max climb ${tm.maxClimbRateMs.toFixed(1)} m/s` +
    ` · 1 s down = ${Number.isFinite(recovery) ? `${recovery.toFixed(0)} s` : "∞"} up`;

  // The pacing condition, and what it means for the route being flown. An
  // operator logging a G2 session needs the trip length, not the speed - and
  // needs telling when the condition on screen is one Expedition 1 cannot be
  // completed in, because that is not visible from the cockpit until the
  // aircraft is inside a mountain thirteen minutes later.
  //
  // The test is terrain clearance, not arrival altitude. F16 warned above 135
  // because that is where the aircraft stops arriving over the plateau rim;
  // F17 found the tighter constraint a thousand kilometres earlier, and the
  // shipped 130 fails it. Warning on the looser one left the default
  // condition unmarked, which is the one case a warning had to cover.
  //
  // All three candidates trip it, and that is the point rather than a bug in
  // the warning: no single cruise speed flies Expedition 1, which is why the
  // expedition is authored as a per-leg profile instead (F18). A free-flight
  // HUD has no route, so the most it can say is which of those two worlds
  // the pacing on screen belongs to.
  const grounded = pacing.cruiseKmPerMin > TERRAIN_LIMITED_CRUISE_KM_PER_MIN;
  const pace = el("pace");
  pace.textContent =
    `cruise ${pacing.cruiseKmPerMin} km/min` +
    (routeKm > 0
      ? // Nominal: distance over cruise speed. Say so, because it is about a
        // fifth long - ground speed is pinned to indicated airspeed and true
        // airspeed rises with altitude, so a climbing aircraft covers the
        // route faster than the arithmetic (F17). An operator who writes
        // this number down for a G2 session would be five minutes out.
        // Nominal at the pacing actually flown, not the one selected: with an
        // expedition loaded those differ, and the minutes are the half an
        // operator writes down.
        ` · ${world!.manifest.corridor} ${minutesForKm(routeKm, "cruise", flown).toFixed(1)} min nominal`
      : "") +
    (grounded ? " ◂ no single speed above 73 flies Expedition 1" : "") +
    // With a route loaded the HUD is no longer guessing: the cap is the
    // pacing that route's clearance and arrival were actually checked at.
    (plan && flown.cruiseKmPerMin !== pacing.cruiseKmPerMin
      ? ` ◂ held at ${flown.cruiseKmPerMin} for ${plan.id}`
      : "");
  pace.classList.toggle("warn", grounded);

  // Where the expedition has got to, and how far the aircraft is from the
  // line every route-indexed number is about. A kilometre off it the ground
  // underneath is already outside the margin the route keeps (F38), so the
  // distance is printed beside the kilometre rather than left implied.
  const expedition = el("expedition");
  const room = progress && plan ? roomAt(plan, progress.km, flight.altitudeM) : null;
  if (progress && plan) {
    const off = progress.crossTrackM / 1000;
    expedition.textContent =
      `${plan.id} ${flyingExpedition ? "flying" : "tracking"} · ` +
      `km ${progress.km.toFixed(0)} of ${(progress.km + progress.remainingKm).toFixed(0)} · ` +
      `${progress.leg} (${progress.mode})` +
      (progress.onRoute ? ` · ${off.toFixed(1)} km off` : ` · ${off.toFixed(0)} km off the route`) +
      // The altitude floor, live, which is F19's hand-off budget asked at the
      // kilometre the aircraft is actually on rather than offline about the
      // whole route (D18, F39).
      (room
        ? room.ok
          ? ` · ${(room.marginM / 1000).toFixed(1)} km of room`
          : ` · ${Math.round(-room.marginM).toLocaleString()} m below the floor`
        : "") +
      (progress.arrived ? " · arrived" : "");
    expedition.classList.toggle("warn", !progress.onRoute || room?.ok === false);
  } else {
    expedition.textContent = "free flight · no expedition bundle for this world";
  }

  // Which profile is being written, and whether it is being kept at all - a
  // private window has no storage and the game must say so rather than
  // quietly throwing an evening away.
  el("profile").textContent =
    `${profile.name}${store.kept ? "" : " · not kept: this browser refused storage"} · ` +
    `saved ${autosave.sinceS(now / 1000).toFixed(0)} s ago` +
    (resumed.kind === "resume" && resumed.km > 0 ? ` · resumed at km ${resumed.km.toFixed(0)}` : "") +
    (resumed.kind === "moved" ? " · route changed since the save: kilometre dropped" : "");

  // The beat itself, held by the same single-card queue the discovery cards
  // will use (F37). Placeholder presentation on purpose: what a beat looks
  // like to a player is the journal's question, not this prototype's.
  el("beat").textContent = beat.showing
    ? (beatName.get(beat.showing) ??
      cardName.get(beat.showing) ??
      spreadName.get(beat.showing) ??
      beat.showing)
    : "";

  // The journal, as far as it goes: counts over the two sets, and the empty
  // regions left visible because hiding them would hide the shape of the game
  // (F40). The reader itself is phase 2.
  const regions = atlas.counts().filter((r) => r.total > 0);
  el("journal").textContent =
    `journal ${atlas.seenCount} of ${atlas.total} · ` +
    `${regions.filter((r) => atlas.complete(r.region)).length} of ${bundle.atlas.regions.length} ` +
    `region(s) complete · ` +
    `${bundle.atlas.spreads.filter((s) => atlas.has(s.id)).length} of ` +
    `${bundle.atlas.spreads.length} spread(s) opened`;

  // The clock, and the thing it is there to teach: China keeps one time zone
  // across sixty-two degrees of longitude, so flying west moves the sun
  // backwards against a clock that does not move at all. Shanghai to Lhasa is
  // two hours and two minutes of it (F41).
  const { latDeg, lonDeg } = unprojectAlbers(flight.eastM, flight.northM);
  const sessionS = now / 1000;
  const sun = clock.sunAt(sessionS, latDeg, lonDeg);
  el("clock").textContent =
    `${clockString(clock.minutesAt(sessionS))} Beijing · ` +
    `${clockString(clock.solarMinutesAt(sessionS, lonDeg))} by the sun · ` +
    `sun ${sun.elevationDeg >= 0 ? "" : "−"}${Math.abs(sun.elevationDeg).toFixed(0)}°` +
    `${sun.elevationDeg < 0 ? " below" : ""}`;

  el("fps").textContent = `${fpsShown.toFixed(0)} fps`;
  el("draws").textContent =
    `${terrain.stats.drawCalls} draws · ${terrain.stats.instances} tiles` +
    // Non-zero means the view is reaching past the built corridor's edge.
    (terrain.stats.missing > 0 ? ` · ${terrain.stats.missing} off-world` : "");
  el("tris").textContent = `${(terrain.stats.triangles / 1000).toFixed(0)}k tris · ${terrain.stats.resident} resident`;
  el("horizon").textContent =
    `horizon ${ring.mesh.visible ? "on" : "OFF"} · ${ring.triangleCount / 1000}k tris · ` +
    `${horizon.lastSliceMs.toFixed(2)} ms${horizon.marching ? " ◂ marching" : ""}`;
  el("world").textContent = worldLabel;
  // What the participant is holding. A G1 note that says "found the climb
  // hard" means something different on a stick than on a key.
  el("device").textContent =
    player.lastDevice === "gamepad" ? `gamepad · ${padId ?? "connected"}` : "keyboard";
  // What the camera is doing, beside what the player is holding, and for the
  // same reason: a G1 note that says "felt sick after ten minutes" means
  // something different with the horizon locked than with it on the wing.
  // The bank is here too because it is the cue F33 found the cohort could not
  // see, and with the camera locked it is still the only place it shows.
  el("comfort").textContent =
    `fov ${comfort.fovDeg}° · ${bankFollowLabel(comfort.bankFollow)} · ` +
    `bank ${((flight.bankRad * 180) / Math.PI).toFixed(0)}°`;
  // Both axes, always, and the product they make. An operator's notes on a
  // G1 session are worthless if they record only one of the two.
  el("scaleText").textContent =
    `1:${scale.horizontalCompression} · A ${+apparentExaggeration(scale).toFixed(2)}` +
    ` (${+scale.verticalExaggeration.toFixed(3)}x vertical)`;

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
