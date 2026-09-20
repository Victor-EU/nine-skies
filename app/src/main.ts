import { Color, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { Terrain } from "../../engine/src/terrain/terrain.js";
import {
  standInGroundTempC,
  standInPrecipMm,
  standInRegionWeights,
} from "../../engine/src/terrain/syntheticTiles.js";
import { SPIKE_REGIONS } from "../../engine/src/terrain/terrainMaterial.js";
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
import { densityRatio } from "../../engine/src/sim/atmosphere.js";
import { createProbe } from "./probe.js";
import { Input } from "../../engine/src/input/input.js";
import { helpLines, type Action } from "../../engine/src/input/bindings.js";
import type { PadSnapshot } from "../../engine/src/input/gamepad.js";
import { captureFrameCost, frameCostTable } from "./frameCost.js";
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

const MONTH = 11; // late autumn: thick Sichuan fog, clear plateau (GDD, Sea to Sky)

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
const camera = new PerspectiveCamera(62, 1, 1, 1);

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
const START = world?.manifest.start ?? {
  eastM: 120_000,
  northM: 1_500_000,
  altitudeM: 1200,
  headingRad: Math.PI / 2,
};
const flight = createFlightState({ ...START });

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
    case "reset":
      Object.assign(flight, createFlightState({ ...START, headingRad: Math.PI / 2 }));
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

const skyHigh = new Color(0.16, 0.34, 0.68);
const sky = new Color();
const regionHaze = new Color();
const regionSun = new Color();

/**
 * Blend the region atmosphere table at the aircraft (build plan D12).
 *
 * Not D14 - that blends nine sets by per-pixel region weight. This is three
 * sets blended once per frame, which is what it takes for the basin to read
 * as milk and the plateau as glass. With one global density the horizon band
 * makes every region look the same, and the plateau's clean air is the first
 * thing the GDD promises about it.
 *
 * The invariant worth keeping: the haze colour and the clear colour are the
 * same value, so terrain fading into the distance lands exactly on the sky
 * rather than near it.
 */
function blendAtmosphere(inlandKm: number, groundM: number, thin: number): number {
  const w = standInRegionWeights(inlandKm, groundM);
  regionHaze.setRGB(0, 0, 0);
  regionSun.setRGB(0, 0, 0);
  let density = 0;
  for (let i = 0; i < SPIKE_REGIONS.length; i++) {
    const r = SPIKE_REGIONS[i]!;
    regionHaze.r += r.hazeColor.r * w[i]!;
    regionHaze.g += r.hazeColor.g * w[i]!;
    regionHaze.b += r.hazeColor.b * w[i]!;
    regionSun.r += r.sunColor.r * w[i]!;
    regionSun.g += r.sunColor.g * w[i]!;
    regionSun.b += r.sunColor.b * w[i]!;
    density += r.hazeDensity * w[i]!;
  }
  sky.copy(regionHaze).lerp(skyHigh, thin);
  return density;
}

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
        placeAt: (s) => placeAt(s.eastM, s.northM, s.altitudeM, s.headingRad),
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
 * Everything here is a function of position, altitude and heading alone - no
 * dt, no input, no wall clock - which is also what makes a capture repeatable.
 */
function placeAt(eastM: number, northM: number, altitudeM: number, headingRad: number): void {
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
  const thin = Math.min(1, Math.max(0, (1 - densityRatio(altitudeM)) / 0.45));
  const density = blendAtmosphere(
    eastM / 1000,
    terrain.groundElevationM(eastM, northM) ?? 0,
    thin,
  );
  renderer.setClearColor(sky, 1);
  // The region table and the scale height are real quantities; the shaders
  // integrate in world units. Convert here, once, for both materials.
  const hazeDensityWorld = hazeDensityPerWorldUnit(density, scale);
  const hazeFalloffWorld = hazeFalloffPerWorldUnit(HAZE_SCALE_HEIGHT_M, scale);
  for (const m of [terrain.material, ring.material]) {
    (m.uniforms.uHazeColor!.value as Color).copy(sky);
    (m.uniforms.uSunColor!.value as Color).copy(regionSun);
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
    groundTempC: standInGroundTempC(northKm, groundM, MONTH),
    monthlyPrecipMm: standInPrecipMm(inlandKm, northKm, MONTH),
    windEastMs: 0,
    windNorthMs: 0,
  };

  step(flight, input, env, dt, LIGHT_PISTON, pacing);
  const tm = telemetry(flight, env, input, LIGHT_PISTON, pacing);

  placeAt(flight.eastM, flight.northM, flight.altitudeM, flight.headingRad);
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
        ` · ${world!.manifest.corridor} ${minutesForKm(routeKm, "cruise", pacing).toFixed(1)} min nominal`
      : "") +
    (grounded ? " ◂ no single speed above 73 flies Expedition 1" : "");
  pace.classList.toggle("warn", grounded);

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
  // Both axes, always, and the product they make. An operator's notes on a
  // G1 session are worthless if they record only one of the two.
  el("scaleText").textContent =
    `1:${scale.horizontalCompression} · A ${+apparentExaggeration(scale).toFixed(2)}` +
    ` (${+scale.verticalExaggeration.toFixed(3)}x vertical)`;

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
