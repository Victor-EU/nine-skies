/**
 * The film's shell (design v2).
 *
 * One canvas, the terrain that version 1 built, and the four things the
 * design puts on top of it: a title card, a caption line, an auto badge and
 * a player bar. The clock is `film/timeline.ts`, the camera is
 * `film/rail.ts` on the scene's rail with `film/altitude.ts` holding its
 * height, and the four inputs come through `input/`. Nothing here is an
 * aircraft.
 */
import { Color, PerspectiveCamera, Scene as ThreeScene, Vector3, WebGLRenderer } from "three";
import { Terrain, VIEW_RADIUS_TILES } from "../../engine/src/terrain/terrain.js";
import { HorizonField, buildSyntheticHorizonField } from "../../engine/src/terrain/horizonField.js";
import { DEFAULT_HAZE_DENSITY_PER_M, HAZE_SCALE_HEIGHT_M } from "../../engine/src/terrain/palette.js";
import { SyntheticTileSource, loadWorld, type LoadedWorld } from "../../engine/src/terrain/tileSource.js";
import { loadHeroCover, type HeroCover } from "../../engine/src/terrain/heroSource.js";
import { HorizonScheduler } from "../../engine/src/terrain/horizon.js";
import { HorizonRing } from "../../engine/src/terrain/horizonRing.js";
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
import { Timeline, type TimelinePosition } from "../../engine/src/film/timeline.js";
import { FILM_VERSION, buildRail, railAtKm, type BuiltRail, type Film, type Scene } from "../../engine/src/film/scene.js";
import { RailFlight, type RailState } from "../../engine/src/film/rail.js";
import { AltitudeController } from "../../engine/src/film/altitude.js";
import { captureFrameCost, frameCostTable, BUDGET_FOV_DEG } from "./frameCost.js";
import { createProbe } from "./probe.js";
import { chooseWorld } from "./worldChoice.js";

/** Seconds a caption stays on screen. */
const CAPTION_SHOW_S = 6;
/** The camera looks this far down from level, degrees. */
const PITCH_DOWN_DEG = 6;

const el = (id: string) => document.getElementById(id)!;
const canvas = document.getElementById("view") as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new ThreeScene();
const camera = new PerspectiveCamera(BUDGET_FOV_DEG, 1, 1, 1);
const scale = DEFAULT_SCALE;

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

// ---- The world ------------------------------------------------------------

const worldName = chooseWorld(location.search);
let world: LoadedWorld | null = null;
try {
  world = await loadWorld(`/world/${worldName}`);
} catch (error) {
  console.error("published world failed to load; flying the stand-in", error);
}
let hero: HeroCover | null = null;
if (world) {
  try {
    hero = await loadHeroCover(`/world/${worldName}`);
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
  hero,
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

// ---- The clock and the scene on screen ------------------------------------

const timeline = new Timeline(film?.scenes.length ?? 0);
let current = -1;
let rail: BuiltRail | null = null;
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
    el("end").hidden = true;
  });
  chapters.appendChild(b);
}
el("play").addEventListener("click", () => {
  timeline.paused = !timeline.paused;
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
  rail = buildRail(s.rail);
  flight = new RailFlight(rail, { corridorRad: (s.corridorDeg * Math.PI) / 180 });
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

function resize(): void {
  if (suspended) return;
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

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

  if (!film) {
    // Nothing to fly: hold a view of whatever world there is.
    placeAt(world?.manifest.start.eastM ?? 120_000, world?.manifest.start.northM ?? 1_500_000, 3000, -Math.PI / 2, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    return;
  }

  const pos = timeline.advance(dt);
  if (pos.scene !== current) startScene(pos.scene);
  const s = film.scenes[current]!;
  const intent = input.poll(connectedPad());

  if (pos.phase === "lead-in") {
    // The title over the first frame of the rail, which also streams the
    // ground the flight is about to need.
    const start = railAtKm(rail!, 0);
    const alt = altitude.update(0, start.eastM, start.northM, start.headingRad, start.aboveGroundM, s.band, groundAt);
    placeAt(start.eastM, start.northM, alt, start.headingRad, 0);
    el("title").hidden = false;
    el("caption").textContent = "";
  } else if (pos.phase === "flight") {
    el("title").hidden = true;
    const active = !timeline.paused;
    const state = flight!.update(
      active
        ? { speed: intent.speed, heading: intent.heading, auto: intent.actions.includes("auto") }
        : { speed: 0, heading: 0, auto: false },
      active ? dt : 0,
    );
    lastState = state;
    const alt = altitude.update(active ? dt : 0, state.eastM, state.northM, state.headingRad, state.aboveGroundM, s.band, groundAt);
    placeAt(state.eastM, state.northM, alt, state.headingRad, state.bankRad);
    el("caption").textContent = captionAt(s, pos.flightS);
    el("auto").classList.toggle("on", state.auto);
  } else {
    el("title").hidden = true;
    el("end").hidden = false;
    if (lastState) {
      const alt = altitude.current ?? 0;
      placeAt(lastState.eastM, lastState.northM, alt, lastState.headingRad, 0);
    }
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
    timeline,
    flight: () => flight,
    state: () => lastState,
    jumpTo: (i: number) => timeline.jumpTo(i),
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
