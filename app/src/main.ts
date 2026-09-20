import { Color, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { Terrain } from "../../engine/src/terrain/terrain.js";
import {
  standInGroundTempC,
  standInPrecipMm,
  standInRegionWeights,
} from "../../engine/src/terrain/syntheticTiles.js";
import { SPIKE_REGIONS } from "../../engine/src/terrain/terrainMaterial.js";
import { buildSyntheticHorizonField } from "../../engine/src/terrain/horizonField.js";
import { HorizonScheduler } from "../../engine/src/terrain/horizon.js";
import { HorizonRing } from "../../engine/src/terrain/horizonRing.js";
import {
  createFlightState,
  step,
  telemetry,
  type Environment,
  type FlightInput,
} from "../../engine/src/sim/flight.js";
import { createProbe } from "./probe.js";
import {
  COMPRESSION_CANDIDATES,
  DEFAULT_SCALE,
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
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new Scene();
const camera = new PerspectiveCamera(62, 1, 20, 400_000);

let scale: WorldScale = { ...DEFAULT_SCALE };
let compressionIndex = COMPRESSION_CANDIDATES.indexOf(8 as never);

const terrain = new Terrain({ scale, viewRadiusTiles: 6, layers: 256 });
for (const mesh of terrain.meshes) scene.add(mesh);

/**
 * The horizon impostor (build plan D15, prototype finding F1).
 *
 * The tile cache reaches 384 km; from the Sichuan Basin the plateau wall is
 * 564 km ahead. Without this the wall is simply not in the world, and G1's
 * playtest would be asking players about a moment that never rendered.
 *
 * The field is generated here because the stand-in world is a function. In
 * production it is a ~150 kB fetch that the pipeline built once.
 */
const fieldT0 = performance.now();
const horizonField = buildSyntheticHorizonField();
const fieldMs = performance.now() - fieldT0;
const horizon = new HorizonScheduler(horizonField);
const ring = new HorizonRing(horizon.front, {
  hazeColor: new Color(0.72, 0.79, 0.86),
  sunColor: new Color(1.0, 0.97, 0.92),
  // The same sun the terrain uses, so the two agree about where the light is.
  sunDirection: new Vector3(0.45, 0.72, 0.53).normalize(),
  hazeDensity: 2.2e-5,
  hazeHeightFalloff: 1 / 9000,
});
scene.add(ring.mesh);

// Start on the coast, pointed inland, at the altitude the GDD opens on.
const START = { eastM: 120_000, northM: 1_500_000, altitudeM: 1200 };
const flight = createFlightState({ ...START, headingRad: Math.PI / 2 });

const input: FlightInput = { pitch: 0, roll: 0, mode: "cruise" };
const keys = new Set<string>();

addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === "1") input.mode = "low";
  if (k === "2") input.mode = "cruise";
  if (k === "3") input.mode = "boost";
  if (k === "c") cycleCompression();
  // The A/B for F1 itself: with the impostor off, the plateau is not drawn.
  if (k === "h") ring.mesh.visible = !ring.mesh.visible;
  if (k === "r") Object.assign(flight, createFlightState({ ...START, headingRad: Math.PI / 2 }));
  if (["w", "a", "s", "d", "1", "2", "3", "c", "h", "r"].includes(k)) e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

/**
 * The G1 A/B toggle. Compression is a live uniform (build plan D6) precisely
 * so a playtester can be flipped between 1:5, 1:8 and 1:12 mid-flight without
 * rebuilding the world.
 */
function cycleCompression(): void {
  compressionIndex = (compressionIndex + 1) % COMPRESSION_CANDIDATES.length;
  scale = {
    ...scale,
    horizontalCompression: COMPRESSION_CANDIDATES[compressionIndex]!,
  };
  terrain.setScale(scale);
  // The profile is stored in real kilometres, so a scale change is a rebuild
  // of the vertices and never another march.
  ring.rebuild(scale);
  camera.far = 400_000 / (scale.horizontalCompression / 8);
  camera.updateProjectionMatrix();
}

function resize(): void {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

const el = (id: string) => document.getElementById(id)!;
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
    /** Jump to a distance inland, in km. */
    goTo(inlandKm: number, northKm: number, altitudeM: number) {
      flight.eastM = inlandKm * 1000;
      flight.northM = northKm * 1000;
      flight.altitudeM = altitudeM;
      flight.verticalRateMs = 0;
    },
  };
}

let last = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;
let fpsShown = 0;

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  input.pitch = (keys.has("w") ? 1 : 0) - (keys.has("s") ? 1 : 0);
  input.roll = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0);

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

  step(flight, input, env, dt);
  const tm = telemetry(flight, env, input);

  const cameraWorld = terrain.update(flight.eastM, flight.northM, flight.altitudeM);

  // Horizon after the terrain, so it sees this frame's rebase.
  if (horizon.update(flight.eastM, flight.northM, flight.altitudeM)) ring.rebuild(scale);
  ring.update(
    terrain.toWorld(horizon.front.eastM, horizon.front.northM, horizon.front.altitudeM),
    cameraWorld,
  );

  // Chase camera: behind and above, looking a little ahead of the aircraft.
  const fwd = new Vector3(Math.sin(flight.headingRad), 0, Math.cos(flight.headingRad));
  const back = 260 * (8 / scale.horizontalCompression);
  camera.position.copy(cameraWorld).addScaledVector(fwd, -back).add(new Vector3(0, 95, 0));
  camera.lookAt(cameraWorld.clone().addScaledVector(fwd, back * 1.6).add(new Vector3(0, 10, 0)));

  // Sky deepens as the air thins - the GDD's first visual cue for altitude -
  // over whatever the region underneath is doing.
  const thin = Math.min(1, Math.max(0, (1 - tm.densityRatio) / 0.45));
  const density = blendAtmosphere(inlandKm, groundM, thin);
  renderer.setClearColor(sky, 1);
  for (const m of [terrain.material, ring.material]) {
    (m.uniforms.uHazeColor!.value as Color).copy(sky);
    (m.uniforms.uSunColor!.value as Color).copy(regionSun);
    m.uniforms.uHazeDensity!.value = density;
  }

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
  el("ground").textContent = `${((tm.groundSpeedMs * 60) / 1000).toFixed(0)} km/min · max climb ${tm.maxClimbRateMs.toFixed(1)} m/s`;

  el("fps").textContent = `${fpsShown.toFixed(0)} fps`;
  el("draws").textContent = `${terrain.stats.drawCalls} draws · ${terrain.stats.instances} tiles`;
  el("tris").textContent = `${(terrain.stats.triangles / 1000).toFixed(0)}k tris · ${terrain.stats.resident} resident`;
  el("horizon").textContent =
    `horizon ${ring.mesh.visible ? "on" : "OFF"} · ${ring.triangleCount / 1000}k tris · ` +
    `${horizon.lastSliceMs.toFixed(2)} ms${horizon.marching ? " ◂ marching" : ""}`;
  el("scaleText").textContent = `1:${scale.horizontalCompression} · ${scale.verticalExaggeration}x vertical`;

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
