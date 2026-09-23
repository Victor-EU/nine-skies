/**
 * The film's shell (design v2).
 *
 * One canvas, the terrain that version 1 built, and the four things the
 * design puts on top of it: a title card over the lead-in map, a caption
 * line, an auto badge and a player bar. The clock is `film/timeline.ts`, the
 * camera is `film/rail.ts` on the scene's rail with `film/altitude.ts`
 * holding its height, and the four inputs come through `input/`. Nothing
 * here is an aircraft.
 *
 * Two dev-only modes ride along: `?record=<scene-id>` flies free and writes
 * a rail into the scene file (D83), and `__ns.still(name)` saves the frame
 * to `docs/stills/` (D77).
 */
import { PerspectiveCamera, Scene as ThreeScene, Vector2, Vector3, WebGLRenderer } from "three";
import { Terrain, VIEW_RADIUS_TILES } from "../../engine/src/terrain/terrain.js";
import { HorizonField, buildSyntheticHorizonField } from "../../engine/src/terrain/horizonField.js";
import { DEFAULT_HAZE_DENSITY_PER_M, HAZE_SCALE_HEIGHT_M } from "../../engine/src/terrain/palette.js";
import { LookRig } from "../../engine/src/look/look.js";
import { SyntheticTileSource, loadWorld, type LoadedWorld } from "../../engine/src/terrain/tileSource.js";
import { StreamingTileSource } from "../../engine/src/terrain/tileStream.js";
import { loadHeroCovers, type HeroCover } from "../../engine/src/terrain/heroSource.js";
import { WorldCoverage } from "../../engine/src/terrain/coverage.js";
import { HorizonScheduler } from "../../engine/src/terrain/horizon.js";
import { HorizonRing } from "../../engine/src/terrain/horizonRing.js";
import { COUNTRY_EAST_KM, COUNTRY_NORTH_KM, projectAlbers, unprojectAlbers } from "../../engine/src/terrain/worldGrid.js";
import { TILE_KM } from "../../engine/src/terrain/syntheticTiles.js";
import { Input } from "../../engine/src/input/input.js";
import { helpLines } from "../../engine/src/input/bindings.js";
import type { PadSnapshot } from "../../engine/src/input/gamepad.js";
import {
  CAMERA_FAR_REAL_M,
  CAMERA_NEAR_REAL_M,
  DEFAULT_SCALE,
  hazeDensityPerWorldUnit,
  hazeFalloffPerWorldUnit,
  toWorldH,
} from "../../engine/src/sim/scale.js";
import { LEAD_IN_S, Timeline, type TimelinePosition } from "../../engine/src/film/timeline.js";
import { FILM_VERSION, buildRail, railAtKm, type BuiltRail, type Film, type Scene } from "../../engine/src/film/scene.js";
import { RailFlight, type RailState } from "../../engine/src/film/rail.js";
import { AltitudeController } from "../../engine/src/film/altitude.js";
import { captureFrameCost, frameCostTable, BUDGET_FOV_DEG } from "./frameCost.js";
import { FrameClock, formatSummary } from "./frameTime.js";
import { ScenePacks, loadPackIndex } from "./packs.js";
import { SoundTrack } from "./sound.js";
import { NO_SOUND, type Sound } from "../../content/sound.ts";
import { createProbe } from "./probe.js";
import { chooseWorld } from "./worldChoice.js";
import { LeadInMap } from "./leadIn.js";

/** Seconds a caption stays on screen. */
const CAPTION_SHOW_S = 6;

const el = (id: string) => document.getElementById(id)!;
const canvas = document.getElementById("view") as HTMLCanvasElement;
// No canvas antialiasing: the look's scene target is multisampled instead.
const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new ThreeScene();
const camera = new PerspectiveCamera(BUDGET_FOV_DEG, 1, 1, 1);
const scale = DEFAULT_SCALE;
const query = new URLSearchParams(location.search);

function notice(html: string | null): void {
  const n = el("notice");
  n.hidden = html === null;
  n.innerHTML = html ?? "";
}

// ---- The film -------------------------------------------------------------

async function loadFilm(): Promise<Film | null> {
  try {
    const response = await fetch("/film.json");
    if (!response.ok) return null;
    const film = (await response.json()) as Film;
    return film.version === FILM_VERSION && film.scenes.length > 0 ? film : null;
  } catch {
    return null;
  }
}

const film = await loadFilm();

// The sound (stage 5): licensed cues and the wind bed, from /sound.json.
async function loadSound(): Promise<Sound> {
  try {
    const response = await fetch("/sound.json");
    return response.ok ? ((await response.json()) as Sound) : NO_SOUND;
  } catch {
    return NO_SOUND;
  }
}
const soundTrack = new SoundTrack(await loadSound());
if (!film) notice("No film to play: <code>content/scenes/</code> holds no valid scene.");
/** Every scene's rail on the grid, built once: the map draws them all. */
const rails: BuiltRail[] = (film?.scenes ?? []).map((s) => buildRail(s.rail));

// ---- The world ------------------------------------------------------------

const worldName = chooseWorld(location.search);
// The scene packs (stage 4): where the terrain's tiles and the hero areas
// come from, a scene at a time. Without them every tile is its own fetch.
const packIndex = await loadPackIndex("/packs/index.json");
const packs = packIndex && packIndex.world === worldName ? new ScenePacks(packIndex, "", `/world/${worldName}`) : null;
let world: LoadedWorld | null = null;
try {
  world = await loadWorld(`/world/${worldName}`, null, packs?.fetchTile);
} catch (error) {
  console.error("published world failed to load; flying the stand-in", error);
}
const streamed = world?.source instanceof StreamingTileSource ? world.source : null;
const packed = packs !== null && streamed !== null;
let heroes: HeroCover[] = [];
if (world) {
  try {
    // With packs, the areas are announced now and their heights come with their scenes.
    heroes = await loadHeroCovers(`/world/${worldName}`, { heights: !packed });
  } catch (error) {
    console.error("hero cover failed to load; flying the country grid alone", error);
  }
}
if (!world && film)
  notice(
    `No built world at <code>dist-world/${worldName}</code>: flying the stand-in. ` +
      "<code>make world CORRIDOR=china</code> builds the real one.",
  );

const terrain = new Terrain({
  scale,
  viewRadiusTiles: VIEW_RADIUS_TILES,
  layers: 256,
  source: world?.source ?? new SyntheticTileSource(),
  heroes,
});
for (const mesh of terrain.meshes) scene.add(mesh);
if (packed) packs.attach(streamed.index, heroes);

const horizonField = world
  ? HorizonField.fromData(
      world.horizon,
      world.manifest.horizon.width,
      world.manifest.horizon.height,
      world.manifest.horizon.sampleKm,
    )
  : buildSyntheticHorizonField();
const horizon = new HorizonScheduler(horizonField);
const ring = new HorizonRing(horizon.front, {
  hazeDensity: hazeDensityPerWorldUnit(DEFAULT_HAZE_DENSITY_PER_M, scale),
  hazeHeightFalloff: hazeFalloffPerWorldUnit(HAZE_SCALE_HEIGHT_M, scale),
});
scene.add(ring.mesh);
terrain.setScale(scale);
ring.rebuild(scale);
camera.near = toWorldH(CAMERA_NEAR_REAL_M, scale);
camera.far = toWorldH(CAMERA_FAR_REAL_M, scale);
camera.updateProjectionMatrix();

// The look (stage 3): sun, sky, shadow, clouds, water light and the grade,
// over the terrain. A phone gets a smaller shadow map.
const rig = new LookRig({
  renderer,
  scene,
  camera,
  terrain,
  ring,
  scale,
  shadowResolution: matchMedia("(pointer: coarse)").matches ? 1024 : 2048,
});

// The levers for a slow machine, and the phone's measurement (F83):
// ?scale=0.75 draws the scene at three quarters and stretches it, ?msaa=4
// multisamples instead of FXAA, ?frametime reads the frame by wall clock.
{
  const renderScale = Number(query.get("scale"));
  if (renderScale > 0) rig.post.renderScale = renderScale;
  const msaa = query.get("msaa");
  if (msaa !== null && Number.isFinite(Number(msaa))) rig.post.samples = Number(msaa);
}
const frameClock = query.has("frametime") ? new FrameClock() : null;
let frameClockShownAt = 0;
function showFrameTime(now: number): void {
  if (!frameClock) return;
  frameClock.tick(now);
  if (now - frameClockShownAt < 500) return;
  frameClockShownAt = now;
  const summary = frameClock.summary();
  const size = renderer.getDrawingBufferSize(new Vector2());
  const box = el("frametime");
  box.hidden = false;
  box.textContent = summary
    ? formatSummary(summary, rig.post.renderScale, { w: size.x, h: size.y })
    : "measuring…";
}

// The lead-in map: the built window with a tile of margin, or the whole
// country grid when there is no world.
const mapBounds = world
  ? {
      eastM0: (world.manifest.window.tx0 - 1) * TILE_KM * 1000,
      northM0: (world.manifest.window.ty0 - 1) * TILE_KM * 1000,
      eastM1: (world.manifest.window.tx1 + 2) * TILE_KM * 1000,
      northM1: (world.manifest.window.ty1 + 2) * TILE_KM * 1000,
    }
  : { eastM0: 0, northM0: 0, eastM1: COUNTRY_EAST_KM * 1000, northM1: COUNTRY_NORTH_KM * 1000 };
const leadIn = new LeadInMap(horizonField, mapBounds, world ? WorldCoverage.from(world.manifest) : null);
const leadCanvas = document.getElementById("leadMap") as HTMLCanvasElement;
const endCanvas = document.getElementById("endMap") as HTMLCanvasElement;
for (const c of [leadCanvas, endCanvas]) {
  const aspect = (mapBounds.eastM1 - mapBounds.eastM0) / (mapBounds.northM1 - mapBounds.northM0);
  c.width = 900;
  c.height = Math.round(900 / aspect);
}

// ---- Input ----------------------------------------------------------------

const input = new Input();
addEventListener("keydown", (e) => {
  if (input.keyboard.keyDown(e.key.toLowerCase())) e.preventDefault();
});
addEventListener("keyup", (e) => input.keyboard.keyUp(e.key.toLowerCase()));
addEventListener("blur", () => input.keyboard.releaseAll());

function connectedPad(): PadSnapshot | null {
  if (typeof navigator.getGamepads !== "function") return null;
  for (const p of navigator.getGamepads()) if (p?.connected) return p;
  return null;
}

// Touch and mouse: a drag across the canvas is direction, held as long as the
// finger is off centre from where it landed. Released, the heading is zero and
// auto's idle timer starts.
let dragStartX: number | null = null;
canvas.addEventListener("pointerdown", (e) => {
  dragStartX = e.clientX;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (dragStartX === null) return;
  const dx = (e.clientX - dragStartX) / Math.max(120, innerWidth * 0.2);
  input.touch.set({ heading: Math.max(-1, Math.min(1, dx)) });
});
const endDrag = (): void => {
  dragStartX = null;
  input.touch.set({ heading: 0 });
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
for (const [id, speed] of [
  ["faster", 1],
  ["slower", -1],
] as const) {
  const b = el(id);
  b.addEventListener("pointerdown", () => input.touch.set({ speed }));
  for (const ev of ["pointerup", "pointercancel", "pointerleave"])
    b.addEventListener(ev, () => input.touch.set({ speed: 0 }));
}
el("auto").addEventListener("click", () => input.touch.press("auto"));

el("hint").textContent = helpLines()
  .map((l) => `${l.keys} ${l.label}`)
  .join("   ·   ");

/** Phones play in landscape; in portrait the clock waits with the viewer. */
const portrait = matchMedia("(pointer: coarse) and (orientation: portrait)");

// ---- The clock and the scene on screen ------------------------------------

const timeline = new Timeline(film?.scenes.length ?? 0);
let current = -1;
let flight: RailFlight | null = null;
const altitude = new AltitudeController();
let lastState: RailState | null = null;

const chapters = el("chapters");
for (const [i, s] of (film?.scenes ?? []).entries()) {
  const b = document.createElement("button");
  b.type = "button";
  b.title = `${i + 1}. ${s.title.en}`;
  b.textContent = s.title.en;
  b.appendChild(document.createElement("i"));
  b.addEventListener("click", () => {
    timeline.jumpTo(i);
    timeline.paused = false;
    pinned = null;
    el("end").hidden = true;
  });
  chapters.appendChild(b);
}
el("play").addEventListener("click", () => {
  timeline.paused = !timeline.paused;
  pinned = null;
});
el("again").addEventListener("click", () => {
  timeline.restart();
  timeline.paused = false;
  el("end").hidden = true;
});
// A browser starts sound only for something the viewer does.
for (const type of ["pointerdown", "keydown"] as const) addEventListener(type, () => soundTrack.wake());
if (soundTrack.hasSound) {
  const button = el("sound");
  button.hidden = false;
  button.addEventListener("click", () => {
    const muted = soundTrack.toggleMute();
    button.classList.toggle("off", muted);
    button.setAttribute("aria-label", muted ? "sound on" : "mute");
  });
}

const groundAt = (eastM: number, northM: number): number | null => terrain.groundElevationM(eastM, northM);

function startScene(i: number): void {
  const s = film!.scenes[i]!;
  current = i;
  flight = new RailFlight(rails[i]!, { corridorRad: (s.corridorDeg * Math.PI) / 180 });
  altitude.reset();
  lastState = null;
  lastFlightS = null;
  rig.setScene(s);
  if (packed) packs.play(i);
  el("titleZh").textContent = s.title.zh;
  el("titlePinyin").textContent = s.title.pinyin;
  el("titleEn").textContent = s.title.en;
  el("titleLine").textContent = s.line;
  el("caption").textContent = "";
  document.title = `Nine Skies — ${s.title.en}`;
}

function captionAt(s: Scene, flightS: number): string {
  for (const c of s.captions) if (flightS >= c.at && flightS < c.at + CAPTION_SHOW_S) return c.text;
  return "";
}

const mmss = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

function drawBar(pos: TimelinePosition): void {
  el("time").textContent = `${mmss(pos.filmS)} / ${mmss(timeline.totalS)}`;
  el("play").textContent = timeline.paused ? "▶" : "❚❚";
  el("play").setAttribute("aria-label", timeline.paused ? "play" : "pause");
  for (const [i, b] of Array.from(chapters.children).entries()) {
    b.classList.toggle("done", i < pos.scene || pos.phase === "end");
    b.classList.toggle("now", i === pos.scene && pos.phase !== "end");
    const fill = b.firstElementChild as HTMLElement | null;
    if (fill) fill.style.width = i === pos.scene ? `${(pos.t / 120) * 100}%` : "0";
  }
}

// ---- Placing the camera ---------------------------------------------------

/**
 * Put the world and the camera where a frame at this point would put them.
 * A function of position, altitude, heading and roll alone, so the frame-cost
 * capture measures the picture the film draws and not an arrangement that
 * resembles it.
 */
function placeAt(
  eastM: number,
  northM: number,
  altitudeM: number,
  headingRad: number,
  rollRad: number,
  clockMinutes = clockNow(),
  pitchDeg = film?.scenes[Math.max(0, current)]?.pitchDeg ?? 6,
): void {
  const eye = terrain.update(eastM, northM, altitudeM);
  if (horizon.update(eastM, northM, altitudeM)) ring.rebuild(scale);
  ring.update(terrain.toWorld(horizon.front.eastM, horizon.front.northM, horizon.front.altitudeM), eye);

  const fwd = new Vector3(Math.sin(headingRad), 0, Math.cos(headingRad));
  camera.position.copy(eye);
  camera.up.set(0, 1, 0);
  if (rollRad !== 0) camera.up.applyAxisAngle(fwd, -rollRad);
  const reach = toWorldH(10_000, scale);
  const pitch = (pitchDeg * Math.PI) / 180;
  camera.lookAt(eye.clone().addScaledVector(fwd, reach * Math.cos(pitch)).add(new Vector3(0, -reach * Math.sin(pitch), 0)));

  const { latDeg, lonDeg } = unprojectAlbers(eastM, northM);
  rig.frame({
    eastM,
    northM,
    altitudeM,
    headingRad,
    eye,
    groundM: terrain.groundElevationM(eastM, northM) ?? 0,
    latDeg,
    lonDeg,
    clockMinutes,
    month: film?.scenes[Math.max(0, current)]?.month ?? 6,
    timeS: performance.now() / 1000,
  });
}

/**
 * The film's clock, Beijing time: the scene's hour plus the flight so far at
 * 1x, so two minutes move the sun half a degree. With no scene, midday.
 */
function clockNow(): number {
  const s = film?.scenes[Math.max(0, current)];
  if (!s) return 12 * 60;
  return s.hour * 60 + (lastFlightS ?? 0) / 60;
}
let lastFlightS: number | null = null;

/** Set while a measurement owns the frame; see `frameCost.ts`. */
let suspended = false;
/** A hand-placed camera for a still (`__ns.look`), held until the clock moves again. */
/**
 * A held camera. With `aboveGroundM` set, its height is taken again from the
 * ground every frame, so a hold made before a hero grid's tiles arrived
 * settles onto the ground that is finally drawn (the 1 km surface stands
 * hundreds of metres over the 90 m one, F51).
 */
let pinned: {
  eastM: number;
  northM: number;
  altitudeM: number;
  aboveGroundM: number | null;
  headingRad: number;
  clockMinutes: number;
  pitchDeg: number;
} | null = null;

function resize(): void {
  if (suspended) return;
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

// ---- The recorder, dev only (D83) -----------------------------------------

interface Recorder {
  readonly id: string;
  eastM: number;
  northM: number;
  headingRad: number;
  kmPerMin: number;
  aboveGroundM: number;
  keys: { lat: number; lon: number; above_ground_m: number; speed: number }[];
  status: string;
}

const recorder: Recorder | null = (() => {
  const id = query.get("record");
  if (!id || !import.meta.env.DEV) return null;
  const known = film?.scenes.findIndex((s) => s.id === id) ?? -1;
  const start = known >= 0 ? railAtKm(rails[known]!, 0) : null;
  const scene = known >= 0 ? film!.scenes[known]! : null;
  return {
    id,
    eastM: start?.eastM ?? world?.manifest.start.eastM ?? 120_000,
    northM: start?.northM ?? world?.manifest.start.northM ?? 1_500_000,
    headingRad: start?.headingRad ?? -Math.PI / 2,
    kmPerMin: scene?.rail[0]?.kmPerMin ?? 90,
    aboveGroundM: scene?.rail[0]?.aboveGroundM ?? 300,
    keys: [],
    status: known >= 0 ? `over ${id}'s rail start` : `new scene ${id}, from the world start`,
  };
})();

if (recorder) {
  el("recorder").hidden = false;
  el("bar").hidden = true;
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "k") {
      const { latDeg, lonDeg } = unprojectAlbers(recorder.eastM, recorder.northM);
      recorder.keys.push({ lat: latDeg, lon: lonDeg, above_ground_m: recorder.aboveGroundM, speed: recorder.kmPerMin });
      recorder.status = `key ${recorder.keys.length} dropped`;
    } else if (k === "j") {
      recorder.keys.pop();
      recorder.status = `${recorder.keys.length} key(s)`;
    } else if (k === "enter") {
      void fetch(`/record`, { method: "POST", body: JSON.stringify({ id: recorder.id, keys: recorder.keys }) })
        .then((r) => r.text())
        .then((t) => (recorder.status = `wrote ${t}`))
        .catch((err: Error) => (recorder.status = `refused: ${err.message}`));
    }
  });
}

/** One frame of free flight: the four inputs plus Q and E for height. */
function recordFrame(dt: number): void {
  const r = recorder!;
  const intent = input.poll(connectedPad());
  const held = (key: string) => keysDown.has(key);
  r.headingRad += intent.heading * 0.5 * dt;
  if (intent.speed !== 0) r.kmPerMin *= Math.exp((intent.speed * Math.LN2 * dt) / 1.5);
  if (held("q")) r.aboveGroundM = Math.max(50, r.aboveGroundM - 300 * dt);
  if (held("e")) r.aboveGroundM = Math.min(5000, r.aboveGroundM + 300 * dt);
  const ms = (r.kmPerMin * 1000) / 60;
  r.eastM += Math.sin(r.headingRad) * ms * dt;
  r.northM += Math.cos(r.headingRad) * ms * dt;
  const s = film?.scenes[current] ?? null;
  const band = s?.band ?? { minM: 50, maxM: 6000 };
  const alt = altitude.update(dt, r.eastM, r.northM, r.headingRad, r.aboveGroundM, band, groundAt, s?.lookAheadKm);
  placeAt(r.eastM, r.northM, alt, r.headingRad, 0);
  const { latDeg, lonDeg } = unprojectAlbers(r.eastM, r.northM);
  el("recorder").textContent =
    `RECORDING ${r.id}\n` +
    `lat ${latDeg.toFixed(4)}  lon ${lonDeg.toFixed(4)}  heading ${(((r.headingRad * 180) / Math.PI + 360) % 360).toFixed(0)}°\n` +
    `speed ${r.kmPerMin.toFixed(0)} km/min  above ${r.aboveGroundM.toFixed(0)} m  ground ${(groundAt(r.eastM, r.northM) ?? 0).toFixed(0)} m\n` +
    `${r.keys.length} key(s) · A/D turn · W/S speed · Q/E height · K drop · J undo · Enter write\n` +
    r.status;
}
/** Keys held right now, for the two the recorder adds outside the binding table. */
const keysDown = new Set<string>();
addEventListener("keydown", (e) => keysDown.add(e.key.toLowerCase()));
addEventListener("keyup", (e) => keysDown.delete(e.key.toLowerCase()));
addEventListener("blur", () => keysDown.clear());

// ---- The frame ------------------------------------------------------------

let last = performance.now();

function frame(now: number): void {
  if (suspended) {
    last = now;
    frameClock?.reset();
    requestAnimationFrame(frame);
    return;
  }
  showFrameTime(now);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (recorder) {
    recordFrame(dt);
    rig.render();
    requestAnimationFrame(frame);
    return;
  }
  if (pinned) {
    el("title").hidden = true;
    el("caption").textContent = "";
    if (pinned.aboveGroundM !== null) {
      const scene = film?.scenes[Math.max(0, current)];
      const band = scene?.band ?? { minM: 50, maxM: 6000 };
      // Placed afresh, not eased: a zero step would hold the first frame's guess.
      altitude.reset();
      pinned.altitudeM = altitude.update(0, pinned.eastM, pinned.northM, pinned.headingRad, pinned.aboveGroundM, band, groundAt, scene?.lookAheadKm);
    }
    placeAt(pinned.eastM, pinned.northM, pinned.altitudeM, pinned.headingRad, 0, pinned.clockMinutes, pinned.pitchDeg);
    rig.render();
    requestAnimationFrame(frame);
    return;
  }

  if (!film) {
    // Nothing to fly: hold a view of whatever world there is.
    placeAt(world?.manifest.start.eastM ?? 120_000, world?.manifest.start.northM ?? 1_500_000, 3000, -Math.PI / 2, 0);
    rig.render();
    requestAnimationFrame(frame);
    return;
  }

  const held = timeline.paused || portrait.matches;
  const pos = timeline.advance(held ? 0 : dt);
  if (pos.scene !== current) startScene(pos.scene);
  const s = film.scenes[current]!;
  const intent = input.poll(connectedPad());
  soundTrack.update({
    cue: pos.phase === "end" ? null : s.music,
    sceneS: pos.t,
    playing: !held && pos.phase !== "end",
    altitudeM: altitude.current ?? 0,
  });

  if (pos.phase === "lead-in") {
    // The map and the title over the first frame of the rail, which also
    // streams the ground the flight is about to need.
    const start = railAtKm(rails[current]!, 0);
    const alt = altitude.update(0, start.eastM, start.northM, start.headingRad, start.aboveGroundM, s.band, groundAt, s.lookAheadKm);
    placeAt(start.eastM, start.northM, alt, start.headingRad, 0, clockNow(), start.pitchDeg);
    el("title").hidden = false;
    el("caption").textContent = "";
    leadIn.draw(leadCanvas.getContext("2d")!, { rails, next: current, progress: pos.t / (LEAD_IN_S * 0.7) });
  } else if (pos.phase === "flight") {
    el("title").hidden = true;
    const state = flight!.update(
      held
        ? { speed: 0, heading: 0, auto: false }
        : { speed: intent.speed, heading: intent.heading, auto: intent.actions.includes("auto") },
      held ? 0 : dt,
    );
    lastState = state;
    lastFlightS = pos.flightS;
    const alt = altitude.update(held ? 0 : dt, state.eastM, state.northM, state.headingRad, state.aboveGroundM, s.band, groundAt, s.lookAheadKm);
    placeAt(state.eastM, state.northM, alt, state.headingRad, state.bankRad, clockNow(), state.pitchDeg);
    el("caption").textContent = captionAt(s, pos.flightS);
    el("auto").classList.toggle("on", state.auto);
  } else {
    el("title").hidden = true;
    if (el("end").hidden) {
      el("end").hidden = false;
      leadIn.draw(endCanvas.getContext("2d")!, { rails, next: rails.length, progress: 1 });
    }
    if (lastState) placeAt(lastState.eastM, lastState.northM, altitude.current ?? 0, lastState.headingRad, 0);
  }
  drawBar(pos);
  rig.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- Dev hooks ------------------------------------------------------------

if (import.meta.env.DEV) {
  (globalThis as Record<string, unknown>).__ns = {
    renderer,
    scene,
    camera,
    terrain,
    ring,
    horizon,
    world,
    film,
    rails,
    timeline,
    recorder,
    flight: () => flight,
    state: () => lastState,
    pinned: () => pinned,
    altitude,
    jumpTo: (i: number) => {
      pinned = null;
      return timeline.jumpTo(i);
    },
    rig,
    /**
     * Place the camera by hand for a still: latitude, longitude, metres
     * above the ground, heading in degrees, and the hour if not the scene's.
     * Pauses the clock.
     */
    look(lat: number, lon: number, aboveGroundM: number, headingDeg: number, hour?: number): void {
      timeline.paused = true;
      const p = projectAlbers(lat, lon);
      const h = (headingDeg * Math.PI) / 180;
      const clock = hour === undefined ? clockNow() : hour * 60;
      // Placed twice: once to stream the ground, then at the ground's own height.
      placeAt(p.eastM, p.northM, aboveGroundM + (groundAt(p.eastM, p.northM) ?? 0), h, 0, clock);
      const ground = groundAt(p.eastM, p.northM) ?? 0;
      pinned = {
        eastM: p.eastM,
        northM: p.northM,
        altitudeM: ground + aboveGroundM,
        aboveGroundM: null,
        headingRad: h,
        clockMinutes: clock,
        pitchDeg: film?.scenes[Math.max(0, current)]?.pitchDeg ?? 6,
      };
    },
    /**
     * Hold scene `i` at `flightS` seconds into its flight, on the rail in
     * auto, for a still that any build can take again (D77). An `hour`
     * overrides the scene's, to try a light before it is written down.
     */
    hold(i: number, flightS: number, hour?: number): void {
      timeline.jumpTo(i);
      timeline.advance(LEAD_IN_S + flightS);
      timeline.paused = true;
      if (i !== current) startScene(i);
      lastFlightS = flightS;
      const rail = rails[i]!;
      // The rail's own clock: authored speed from the start.
      let km = 0;
      let left = flightS;
      for (let k = 0; k + 1 < rail.keys.length && left > 0; k++) {
        const segKm = (rail.path.cumM[k + 1]! - rail.path.cumM[k]!) / 1000;
        const segS = (segKm / rail.keys[k]!.kmPerMin) * 60;
        const take = Math.min(segS, left);
        km += (take / 60) * rail.keys[k]!.kmPerMin;
        left -= take;
      }
      const fix = railAtKm(rail, km);
      const s = film!.scenes[i]!;
      altitude.reset();
      const alt = altitude.update(0, fix.eastM, fix.northM, fix.headingRad, fix.aboveGroundM, s.band, groundAt, s.lookAheadKm);
      pinned = {
        eastM: fix.eastM,
        northM: fix.northM,
        altitudeM: alt,
        aboveGroundM: fix.aboveGroundM,
        headingRad: fix.headingRad,
        clockMinutes: hour === undefined ? clockNow() : hour * 60,
        pitchDeg: fix.pitchDeg,
      };
    },
    /**
     * Save the frame as drawn to docs/stills/<name>.png: at the canvas's own
     * size, or at a size given, drawn once at that size and put back.
     */
    async still(name: string, width?: number, height?: number): Promise<string> {
      const ratio = renderer.getPixelRatio();
      if (width && height) {
        renderer.setPixelRatio(1);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
      rig.render();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (width && height) {
        renderer.setPixelRatio(ratio);
        resize();
      }
      if (!blob) throw new Error("no frame to save");
      const r = await fetch(`/still?name=${encodeURIComponent(name)}`, { method: "POST", body: blob });
      return r.text();
    },
    probe: createProbe(renderer, scene, camera, ring, () => rig.render()),
    suspend: () => {
      suspended = true;
      return () => {
        suspended = false;
        resize();
      };
    },
    /**
     * Ask the GPU what a frame costs, per pass, at the committed stations:
     *   __ns.frameCost().then((r) => console.log(__ns.frameCostTable(r)))
     */
    frameCost: (samples?: number, size?: [number, number], only?: string[]) => {
      // Each station is drawn as its own scene draws it - the look, the sun
      // at that second, the camera's pitch - and not as whatever scene was
      // playing when the capture began: pitch alone decides how much of the
      // frame is ground (F82). The scene that was playing is put back after.
      const playing = current;
      let drawnAs = playing;
      const asScene = (i: number): void => {
        if (i === drawnAs) return;
        current = i;
        rig.setScene(film?.scenes[i] ?? null);
        drawnAs = i;
      };
      return captureFrameCost({
        renderer,
        scene,
        camera,
        terrain,
        ring,
        placeAt: (st) => {
          const i = film?.scenes.findIndex((s) => s.id === st.id) ?? -1;
          const s = film?.scenes[i];
          if (!s) return placeAt(st.eastM, st.northM, st.altitudeM, st.headingRad, 0);
          asScene(i);
          const flightS = st.flightS ?? 0;
          placeAt(st.eastM, st.northM, st.altitudeM, st.headingRad, 0, s.hour * 60 + flightS / 60, railAtKm(rails[i]!, st.km).pitchDeg);
        },
        render: () => rig.render(),
        passes: rig.passes,
        ...(size ? { width: size[0], height: size[1] } : {}),
        ...(only ? { only } : {}),
        suspend: () => {
          suspended = true;
          return () => {
            asScene(playing);
            suspended = false;
            resize();
          };
        },
        samples,
      });
    },
    frameCostTable,
    /** The scene packs: `__ns.packs.stats.misses` is tiles fetched outside them. */
    packs,
    sound: soundTrack,
  };
}
