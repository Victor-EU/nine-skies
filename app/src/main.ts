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
import { Color, PerspectiveCamera, Scene as ThreeScene, Vector3, WebGLRenderer } from "three";
import { Terrain, VIEW_RADIUS_TILES } from "../../engine/src/terrain/terrain.js";
import { HorizonField, buildSyntheticHorizonField } from "../../engine/src/terrain/horizonField.js";
import { DEFAULT_HAZE_DENSITY_PER_M, HAZE_SCALE_HEIGHT_M } from "../../engine/src/terrain/palette.js";
import { SyntheticTileSource, loadWorld, type LoadedWorld } from "../../engine/src/terrain/tileSource.js";
import { loadHeroCovers, type HeroCover } from "../../engine/src/terrain/heroSource.js";
import { WorldCoverage } from "../../engine/src/terrain/coverage.js";
import { HorizonScheduler } from "../../engine/src/terrain/horizon.js";
import { HorizonRing } from "../../engine/src/terrain/horizonRing.js";
import { COUNTRY_EAST_KM, COUNTRY_NORTH_KM, projectAlbers, unprojectAlbers } from "../../engine/src/terrain/worldGrid.js";
import { TILE_KM } from "../../engine/src/terrain/syntheticTiles.js";
import { Aerial } from "../../engine/src/gfx/aerial.js";
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
import { createProbe } from "./probe.js";
import { chooseWorld } from "./worldChoice.js";
import { LeadInMap } from "./leadIn.js";

/** Seconds a caption stays on screen. */
const CAPTION_SHOW_S = 6;
/** The camera looks this far down from level, degrees. */
const PITCH_DOWN_DEG = 6;

const el = (id: string) => document.getElementById(id)!;
const canvas = document.getElementById("view") as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
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
if (!film) notice("No film to play: <code>content/scenes/</code> holds no valid scene.");
/** Every scene's rail on the grid, built once: the map draws them all. */
const rails: BuiltRail[] = (film?.scenes ?? []).map((s) => buildRail(s.rail));

// ---- The world ------------------------------------------------------------

const worldName = chooseWorld(location.search);
let world: LoadedWorld | null = null;
try {
  world = await loadWorld(`/world/${worldName}`);
} catch (error) {
  console.error("published world failed to load; flying the stand-in", error);
}
let heroes: HeroCover[] = [];
if (world) {
  try {
    heroes = await loadHeroCovers(`/world/${worldName}`);
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
  hazeColor: new Color(0.72, 0.79, 0.86),
  sunColor: new Color(1.0, 0.97, 0.92),
  sunDirection: new Vector3(0.45, 0.72, 0.53).normalize(),
  hazeDensity: hazeDensityPerWorldUnit(DEFAULT_HAZE_DENSITY_PER_M, scale),
  hazeHeightFalloff: hazeFalloffPerWorldUnit(HAZE_SCALE_HEIGHT_M, scale),
});
scene.add(ring.mesh);
terrain.setScale(scale);
ring.rebuild(scale);
camera.near = toWorldH(CAMERA_NEAR_REAL_M, scale);
camera.far = toWorldH(CAMERA_FAR_REAL_M, scale);
camera.updateProjectionMatrix();

const air = new Aerial();

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

const groundAt = (eastM: number, northM: number): number | null => terrain.groundElevationM(eastM, northM);

function startScene(i: number): void {
  const s = film!.scenes[i]!;
  current = i;
  flight = new RailFlight(rails[i]!, { corridorRad: (s.corridorDeg * Math.PI) / 180 });
  altitude.reset();
  lastState = null;
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
function placeAt(eastM: number, northM: number, altitudeM: number, headingRad: number, rollRad: number): void {
  const eye = terrain.update(eastM, northM, altitudeM);
  if (horizon.update(eastM, northM, altitudeM)) ring.rebuild(scale);
  ring.update(terrain.toWorld(horizon.front.eastM, horizon.front.northM, horizon.front.altitudeM), eye);

  const fwd = new Vector3(Math.sin(headingRad), 0, Math.cos(headingRad));
  camera.position.copy(eye);
  camera.up.set(0, 1, 0);
  if (rollRad !== 0) camera.up.applyAxisAngle(fwd, -rollRad);
  const reach = toWorldH(10_000, scale);
  const pitch = (PITCH_DOWN_DEG * Math.PI) / 180;
  camera.lookAt(eye.clone().addScaledVector(fwd, reach * Math.cos(pitch)).add(new Vector3(0, -reach * Math.sin(pitch), 0)));

  air.update(eastM / 1000, terrain.groundElevationM(eastM, northM) ?? 0, altitudeM);
  renderer.setClearColor(air.sky, 1);
  const hazeDensityWorld = hazeDensityPerWorldUnit(air.hazeDensityPerM, scale);
  const hazeFalloffWorld = hazeFalloffPerWorldUnit(HAZE_SCALE_HEIGHT_M, scale);
  for (const m of [...terrain.materials, ring.material]) {
    (m.uniforms.uHazeColor!.value as Color).copy(air.sky);
    (m.uniforms.uSunColor!.value as Color).copy(air.sun);
    m.uniforms.uHazeDensity!.value = hazeDensityWorld;
    m.uniforms.uHazeHeightFalloff!.value = hazeFalloffWorld;
  }
}

/** Set while a measurement owns the frame; see `frameCost.ts`. */
let suspended = false;
/** A hand-placed camera for a still (`__ns.look`), held until the clock moves again. */
let pinned: { eastM: number; northM: number; altitudeM: number; headingRad: number } | null = null;

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
  const alt = altitude.update(dt, r.eastM, r.northM, r.headingRad, r.aboveGroundM, band, groundAt);
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
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (recorder) {
    recordFrame(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    return;
  }
  if (pinned) {
    el("title").hidden = true;
    el("caption").textContent = "";
    placeAt(pinned.eastM, pinned.northM, pinned.altitudeM, pinned.headingRad, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    return;
  }

  if (!film) {
    // Nothing to fly: hold a view of whatever world there is.
    placeAt(world?.manifest.start.eastM ?? 120_000, world?.manifest.start.northM ?? 1_500_000, 3000, -Math.PI / 2, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    return;
  }

  const held = timeline.paused || portrait.matches;
  const pos = timeline.advance(held ? 0 : dt);
  if (pos.scene !== current) startScene(pos.scene);
  const s = film.scenes[current]!;
  const intent = input.poll(connectedPad());

  if (pos.phase === "lead-in") {
    // The map and the title over the first frame of the rail, which also
    // streams the ground the flight is about to need.
    const start = railAtKm(rails[current]!, 0);
    const alt = altitude.update(0, start.eastM, start.northM, start.headingRad, start.aboveGroundM, s.band, groundAt);
    placeAt(start.eastM, start.northM, alt, start.headingRad, 0);
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
    const alt = altitude.update(held ? 0 : dt, state.eastM, state.northM, state.headingRad, state.aboveGroundM, s.band, groundAt);
    placeAt(state.eastM, state.northM, alt, state.headingRad, state.bankRad);
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
  renderer.render(scene, camera);
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
    jumpTo: (i: number) => {
      pinned = null;
      return timeline.jumpTo(i);
    },
    /**
     * Place the camera by hand for a still: latitude, longitude, metres
     * above the ground, heading in degrees. Pauses the clock.
     */
    look(lat: number, lon: number, aboveGroundM: number, headingDeg: number): void {
      timeline.paused = true;
      const p = projectAlbers(lat, lon);
      const h = (headingDeg * Math.PI) / 180;
      // Placed twice: once to stream the ground, then at the ground's own height.
      placeAt(p.eastM, p.northM, aboveGroundM + (groundAt(p.eastM, p.northM) ?? 0), h, 0);
      const ground = groundAt(p.eastM, p.northM) ?? 0;
      pinned = { eastM: p.eastM, northM: p.northM, altitudeM: ground + aboveGroundM, headingRad: h };
    },
    /** Save the frame as drawn to docs/stills/<name>.png, at the canvas's own size. */
    async still(name: string): Promise<string> {
      renderer.render(scene, camera);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("no frame to save");
      const r = await fetch(`/still?name=${encodeURIComponent(name)}`, { method: "POST", body: blob });
      return r.text();
    },
    probe: createProbe(renderer, scene, camera, ring),
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
    frameCost: (samples?: number, size?: [number, number], only?: string[]) =>
      captureFrameCost({
        renderer,
        scene,
        camera,
        terrain,
        ring,
        placeAt: (st) => placeAt(st.eastM, st.northM, st.altitudeM, st.headingRad, 0),
        ...(size ? { width: size[0], height: size[1] } : {}),
        ...(only ? { only } : {}),
        suspend: () => {
          suspended = true;
          return () => {
            suspended = false;
            resize();
          };
        },
        samples,
      }),
    frameCostTable,
  };
}
