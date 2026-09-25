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
import { Terrain, VIEW_RADIUS_TILES, reliefGain } from "../../engine/src/terrain/terrain.js";
import { HorizonField, buildSyntheticHorizonField } from "../../engine/src/terrain/horizonField.js";
import { DEFAULT_HAZE_DENSITY_PER_M, HAZE_SCALE_HEIGHT_M } from "../../engine/src/terrain/palette.js";
import { LookRig } from "../../engine/src/look/look.js";
import { SyntheticTileSource, loadWorld, type LoadedWorld } from "../../engine/src/terrain/tileSource.js";
import { StreamingTileSource } from "../../engine/src/terrain/tileStream.js";
import { ColourSource, loadColourIndex, withoutFine } from "../../engine/src/terrain/colour.js";
import { RockFaces, loadRockIndex } from "../../engine/src/terrain/rock.js";
import { ReliefSource, loadReliefIndex } from "../../engine/src/terrain/relief.js";
import { loadHeroCovers, type HeroCover } from "../../engine/src/terrain/heroSource.js";
import { HorizonScheduler } from "../../engine/src/terrain/horizon.js";
import { HorizonRing } from "../../engine/src/terrain/horizonRing.js";
import { COUNTRY_EAST_KM, COUNTRY_NORTH_KM, projectAlbers, unprojectAlbers } from "../../engine/src/terrain/worldGrid.js";
import { TILE_KM } from "../../engine/src/terrain/syntheticTiles.js";
import { Input } from "../../engine/src/input/input.js";
import { boundKeys, helpCaps } from "../../engine/src/input/bindings.js";
import type { PadSnapshot } from "../../engine/src/input/gamepad.js";
import {
  CAMERA_FAR_REAL_M,
  CAMERA_NEAR_REAL_M,
  DEFAULT_SCALE,
  apparentExaggeration,
  hazeDensityPerWorldUnit,
  hazeFalloffPerWorldUnit,
  scaleFor,
  toWorldH,
  type WorldScale,
} from "../../engine/src/sim/scale.js";
import { LEAD_IN_S, SCENE_S, Timeline, type TimelinePosition } from "../../engine/src/film/timeline.js";
import { FILM_VERSION, buildRail, railAtKm, type BuiltRail, type Film, type Scene } from "../../engine/src/film/scene.js";
import { RailFlight, type RailState } from "../../engine/src/film/rail.js";
import { AltitudeController } from "../../engine/src/film/altitude.js";
import { captureFrameCost, frameCostTable, quietFrame, BUDGET_FOV_DEG } from "./frameCost.js";
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
/** The world's scale: the film's, or the scene's own exaggeration (`useSceneScale`). */
let scale: WorldScale = DEFAULT_SCALE;
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
// `?without=fine,near,rock,relief` flies without those layers, the shader's
// code for them and all, so what each costs a frame can be measured by its
// absence (F96): the hero tiles' 10 m colour (F91), the country's along the
// rails (F95), the walls' rock (F92), the relief (F93, F94).
const without = new Set((query.get("without") ?? "").split(",").filter(Boolean));
// The ground's colour (F87): the satellite mosaic cut onto every tile the
// film can see. Its files come with the scene packs; without packs, one at a time.
const loadedColour = world ? await loadColourIndex(`/world/${worldName}/colour/index.json`) : null;
const colourIndex = loadedColour && withoutFine(loadedColour, without);
const colour = colourIndex
  ? new ColourSource(colourIndex, `/world/${worldName}/colour/files`, packs?.fetchTile)
  : null;
// The walls' rock (F92): photographed faces, one loaded for each scene's palette.
const rockIndex = world && !without.has("rock") ? await loadRockIndex(`/world/${worldName}/rock/index.json`) : null;
const rock = rockIndex ? new RockFaces(rockIndex, `/world/${worldName}/rock`) : null;
// The ground's relief below its grid (F93), from the source's 30 m, lighting the tiles nearest the camera.
const reliefIndex = world && !without.has("relief") ? await loadReliefIndex(`/world/${worldName}/relief/index.json`) : null;
const relief = reliefIndex ? new ReliefSource(reliefIndex, `/world/${worldName}/relief/files`, packs?.fetchTile) : null;
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
  colour,
  rock,
  relief,
});
for (const mesh of terrain.meshes) scene.add(mesh);
if (packed) packs.attach(streamed.index, heroes, colourIndex, reliefIndex);

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
const leadIn = new LeadInMap(horizonField, mapBounds);
const leadCanvas = document.getElementById("leadMap") as HTMLCanvasElement;
const endCanvas = document.getElementById("endMap") as HTMLCanvasElement;
for (const c of [leadCanvas, endCanvas])
  c.style.setProperty("--map-aspect", String((mapBounds.eastM1 - mapBounds.eastM0) / (mapBounds.northM1 - mapBounds.northM0)));

/** Size a map's pixels to its box on screen, sharp on any display; returns device pixels per CSS pixel. */
function fitCanvas(c: HTMLCanvasElement): number {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const w = Math.round(c.clientWidth * ratio);
  const h = Math.round(c.clientHeight * ratio);
  if (w > 0 && h > 0 && (c.width !== w || c.height !== h)) {
    c.width = w;
    c.height = h;
  }
  return ratio;
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

// The keys, as keycaps, derived from the binding table like every other help.
el("hint").innerHTML = helpCaps()
  .map(
    (h) =>
      `<span>${h.caps.map((pair) => pair.map((k) => `<kbd>${k}</kbd>`).join("")).join('<span class="or">/</span>')}<em>${h.label}</em></span>`,
  )
  .join("");

// ---- The furniture steps aside ----------------------------------------------
//
// In flight, three seconds after the pointer last moved, the bar, the keys
// and a quiet auto badge fade, and the pointer with them: what is left is the
// picture and its caption. Any movement brings them back. The flight keys do
// not, so steering is not interrupted by the bar it has no use for.

const IDLE_MS = 3000;
let activeAt = performance.now();
const wake = (): void => {
  activeAt = performance.now();
};
for (const type of ["pointermove", "pointerdown", "wheel", "touchstart"] as const) addEventListener(type, wake, { passive: true });
const flightKeys = boundKeys();
addEventListener("keydown", (e) => {
  if (!flightKeys.has(e.key.toLowerCase())) wake();
});
const bar = el("bar");
const filmEl = el("film");
function setIdle(idle: boolean): void {
  filmEl.classList.toggle("idle", idle);
  document.body.classList.toggle("idle", idle);
}

// ---- Icons and full screen -------------------------------------------------

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6L18.8 12z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 5h3.8v14H6.5zM13.7 5h3.8v14h-3.8z"/></svg>',
  replay:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5V1.8L7.4 5.9 12 10V7.3a5.2 5.2 0 1 1-5.2 5.2H4a8 8 0 1 0 8-8z"/></svg>',
  sound:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 9h3.8L12 5v14l-4.7-4H3.5z"/><path d="M15.4 8.6a4.8 4.8 0 0 1 0 6.8M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  muted:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 9h3.8L12 5v14l-4.7-4H3.5z"/><path d="M15.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  full:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  window:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
el("sound").innerHTML = ICON.sound;

const fullButton = el("full");
const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void; webkitFullscreenEnabled?: boolean };
const canFull = document.fullscreenEnabled || doc.webkitFullscreenEnabled === true;
fullButton.hidden = !canFull;
function toggleFullScreen(): void {
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (document.fullscreenElement ?? doc.webkitFullscreenElement) void (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
  else void (root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.());
}
function drawFullButton(): void {
  const full = Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement);
  fullButton.innerHTML = full ? ICON.window : ICON.full;
  fullButton.setAttribute("aria-label", full ? "Leave full screen" : "Full screen");
  fullButton.title = full ? "Leave full screen (F)" : "Full screen (F)";
}
drawFullButton();
fullButton.addEventListener("click", toggleFullScreen);
for (const type of ["fullscreenchange", "webkitfullscreenchange"]) document.addEventListener(type, drawFullButton);

/** Phones play in landscape; in portrait the clock waits with the viewer. */
const portrait = matchMedia("(pointer: coarse) and (orientation: portrait)");

// ---- The clock and the scene on screen ------------------------------------

const timeline = new Timeline(film?.scenes.length ?? 0);
// A chapter named in the address starts the film there: a shared link, a
// reload, the way back from the credits. With none, it starts at the start.
const namedChapter = (): number => {
  const id = decodeURIComponent(location.hash.slice(1));
  return id ? (film?.scenes.findIndex((s) => s.id === id) ?? -1) : -1;
};
if (namedChapter() > 0) timeline.jumpTo(namedChapter());
addEventListener("hashchange", () => {
  const i = namedChapter();
  if (i >= 0 && i !== current) playChapter(i);
});
let current = -1;
let flight: RailFlight | null = null;
const altitude = new AltitudeController();
let lastState: RailState | null = null;

/** Go to chapter `i`, from its lead-in, and play. */
function playChapter(i: number): void {
  timeline.jumpTo(i);
  timeline.paused = false;
  pinned = null;
}

const chapters = el("chapters");
for (const [i, s] of (film?.scenes ?? []).entries()) {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.name = `${i + 1}. ${s.title.en}`;
  b.setAttribute("aria-label", `Chapter ${i + 1}: ${s.title.en}`);
  const track = document.createElement("span");
  track.className = "track";
  track.appendChild(document.createElement("i"));
  b.appendChild(track);
  b.addEventListener("click", () => playChapter(i));
  chapters.appendChild(b);
}
// The end card lists them again, for the one the viewer wants to see twice.
const endChapters = el("endChapters");
for (const [i, s] of (film?.scenes ?? []).entries()) {
  const li = document.createElement("li");
  const b = document.createElement("button");
  b.type = "button";
  b.innerHTML = `<b>${i + 1}</b>`;
  b.append(s.title.en);
  b.addEventListener("click", () => playChapter(i));
  li.appendChild(b);
  endChapters.appendChild(li);
}
function togglePlay(): void {
  if (timeline.ended) {
    playChapter(0);
    return;
  }
  timeline.paused = !timeline.paused;
  pinned = null;
}
el("play").addEventListener("click", togglePlay);
el("again").addEventListener("click", () => {
  timeline.restart();
  timeline.paused = false;
});
// A browser starts sound only for something the viewer does.
for (const type of ["pointerdown", "keydown"] as const) addEventListener(type, () => soundTrack.wake());
function toggleMute(): void {
  if (!soundTrack.hasSound) return;
  const button = el("sound");
  const muted = soundTrack.toggleMute();
  button.classList.toggle("off", muted);
  button.innerHTML = muted ? ICON.muted : ICON.sound;
  button.setAttribute("aria-label", muted ? "Sound on" : "Mute");
  button.title = muted ? "Sound on (M)" : "Mute (M)";
}
if (soundTrack.hasSound) {
  el("sound").hidden = false;
  el("sound").addEventListener("click", toggleMute);
}
// A button clicked with the pointer lets go of the focus, or the next Space -
// auto - would press it again and restart the chapter it names.
filmEl.addEventListener("click", (e) => {
  const b = (e.target as Element).closest("button");
  if (b && e.detail > 0) b.blur();
});
// The player's own keys, beside the four flight inputs and never among them:
// P pauses, F fills the screen, M mutes, and 1 to 9 go to a chapter.
addEventListener("keydown", (e) => {
  if (recorder || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "p") togglePlay();
  else if (k === "f" && canFull) toggleFullScreen();
  else if (k === "m") toggleMute();
  else if (/^[1-9]$/.test(k) && Number(k) <= (film?.scenes.length ?? 0)) playChapter(Number(k) - 1);
  else return;
  e.preventDefault();
});

const groundAt = (eastM: number, northM: number): number | null => terrain.groundElevationM(eastM, northM);

/**
 * Draw the relief at a scene's own exaggeration, the film's six unless it
 * says otherwise (F97): the terrain, the horizon and the look, everything
 * that puts real metres into world units. The camera's altitude is real
 * metres throughout, so nothing it flies changes.
 */
function useSceneScale(s: Scene | null): void {
  const next = scaleFor(DEFAULT_SCALE.horizontalCompression, s?.exaggeration ?? apparentExaggeration(DEFAULT_SCALE));
  if (next.verticalExaggeration === scale.verticalExaggeration) return;
  scale = next;
  terrain.setScale(scale);
  ring.rebuild(scale);
  rig.setScale(scale);
}

function startScene(i: number): void {
  const s = film!.scenes[i]!;
  // The address says which chapter is on, so a reload or a shared link comes back to it.
  if (!recorder) history.replaceState(null, "", i === 0 ? location.pathname + location.search : `#${s.id}`);
  current = i;
  flight = new RailFlight(rails[i]!, { corridorRad: (s.corridorDeg * Math.PI) / 180 });
  altitude.reset();
  lastState = null;
  lastFlightS = null;
  useSceneScale(s);
  rig.setScene(s);
  if (packed) packs.play(i);
  el("titleZh").textContent = s.title.zh;
  el("titlePinyin").textContent = s.title.pinyin;
  el("titleEn").textContent = s.title.en;
  el("titleLine").textContent = s.line;
  showCaption("");
  document.title = `Nine Skies — ${s.title.en}`;
}

function captionAt(s: Scene, flightS: number): string {
  for (const c of s.captions) if (flightS >= c.at && flightS < c.at + CAPTION_SHOW_S) return c.text;
  return "";
}

/** A caption fades in and out; its words stay while it fades. */
let captionShown = "";
function showCaption(text: string): void {
  if (text === captionShown) return;
  const c = el("caption");
  if (text) c.textContent = text;
  c.classList.toggle("on", text !== "");
  captionShown = text;
}

const mmss = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

let barDrawn = { time: "", play: "", scene: -2, phase: "" };
function drawBar(pos: TimelinePosition): void {
  const name = film && pos.phase !== "end" ? film.scenes[pos.scene]!.title.en : "";
  const clock = `${mmss(pos.filmS)} / ${mmss(timeline.totalS)}`;
  const time = `${name}|${clock}`;
  if (time !== barDrawn.time) {
    const b = document.createElement("b");
    b.textContent = name;
    el("time").replaceChildren(...(name ? [b] : []), clock);
  }
  const play = pos.phase === "end" ? "replay" : timeline.paused ? "play" : "pause";
  if (play !== barDrawn.play) {
    const button = el("play");
    button.innerHTML = ICON[play];
    const label = { replay: "Watch again", play: "Play", pause: "Pause" }[play];
    button.setAttribute("aria-label", label);
    button.title = `${label} (P)`;
  }
  if (pos.scene !== barDrawn.scene || pos.phase !== barDrawn.phase) {
    for (const [i, b] of Array.from(chapters.children).entries()) {
      b.classList.toggle("done", i < pos.scene || pos.phase === "end");
      b.classList.toggle("now", i === pos.scene && pos.phase !== "end");
      if (i !== pos.scene) (b.querySelector("i") as HTMLElement).style.width = "0";
    }
  }
  const fill = chapters.children[pos.scene]?.querySelector("i") as HTMLElement | undefined;
  if (fill) fill.style.width = pos.phase === "end" ? "0" : `${(pos.t / SCENE_S) * 100}%`;
  barDrawn = { time, play, scene: pos.scene, phase: pos.phase };
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
  terrain.uploadColour(renderer);
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

/** 0 to 1, eased at both ends. */
const smooth = (x: number): number => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
/** Seconds the picture takes to dip to dark at a cut, and to come back. */
const DIP_OUT_S = 0.9;
const DIP_IN_S = 0.9;
/** Where a lead-in waits when its scene's ground has not come: its last moment, the jump drawn. */
const HOLD_AT_S = LEAD_IN_S - 0.4;

const curtain = el("curtain");
const bufferEl = el("buffer");
let curtainDrawn = -1;
function setCurtain(opacity: number): void {
  const o = Math.round(opacity * 100) / 100;
  if (o === curtainDrawn) return;
  curtain.style.opacity = String(o);
  curtainDrawn = o;
}
const shown = (id: string, on: boolean): void => {
  el(id).classList.toggle("on", on);
};
let bufferWords = "";
let speedSeen = 1;
let speedChangedAt = -Infinity;
let endShownAt: number | null = null;
let firstFrame = true;

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

  if (firstFrame) {
    // The name steps aside once there is a picture to hand over to.
    firstFrame = false;
    el("loading").classList.add("gone");
  }
  if (recorder) {
    setCurtain(0);
    recordFrame(dt);
    rig.render();
    requestAnimationFrame(frame);
    return;
  }
  if (pinned) {
    setCurtain(0);
    shown("title", false);
    showCaption("");
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
    setCurtain(0);
    // Nothing to fly: hold a view of whatever world there is.
    placeAt(world?.manifest.start.eastM ?? 120_000, world?.manifest.start.northM ?? 1_500_000, 3000, -Math.PI / 2, 0);
    rig.render();
    requestAnimationFrame(frame);
    return;
  }

  const held = timeline.paused || portrait.matches;
  // The ground before the flight: a lead-in holds its last moment until its
  // scene's pack is in, as a video waits for its buffer. The scene's two
  // minutes are untouched; the clock only stops.
  const before = timeline.at();
  const waiting = packed && before.phase === "lead-in" && before.scene === current && !packs.isSettled(current);
  const pos = timeline.advance(held ? 0 : waiting ? Math.max(0, Math.min(dt, HOLD_AT_S - before.t)) : dt);
  if (pos.scene !== current) startScene(pos.scene);
  const holding = waiting && pos.t >= HOLD_AT_S - 1e-6;
  bufferEl.classList.toggle("on", holding);
  if (holding) {
    const got = packs.progress(current);
    const words = `Loading the ground · ${Math.round(got * 100)}%`;
    if (words !== bufferWords) {
      (bufferEl.querySelector(".words") as HTMLElement).textContent = words;
      (bufferEl.querySelector("i") as HTMLElement).style.width = `${got * 100}%`;
      bufferWords = words;
    }
  }
  filmEl.classList.toggle("between", pos.phase !== "flight");
  setIdle(pos.phase === "flight" && !timeline.paused && now - activeAt > IDLE_MS && !bar.matches(":hover"));
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
    setCurtain(1 - smooth(pos.t / DIP_IN_S));
    shown("title", true);
    shown("end", false);
    endShownAt = null;
    showCaption("");
    leadIn.draw(leadCanvas.getContext("2d")!, {
      rails,
      next: current,
      progress: pos.t / (LEAD_IN_S * 0.7),
      ratio: fitCanvas(leadCanvas),
      timeS: now / 1000,
    });
  } else if (pos.phase === "flight") {
    setCurtain(smooth((pos.t - (SCENE_S - DIP_OUT_S)) / DIP_OUT_S));
    shown("title", false);
    shown("end", false);
    endShownAt = null;
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
    showCaption(captionAt(s, pos.flightS));
    el("auto").classList.toggle("on", state.auto);
    // The speed, while the viewer is changing it and for a moment after; the
    // badge is quiet while the rail flies itself.
    if (Math.abs(state.speedMul - speedSeen) > 1e-4) {
      speedSeen = state.speedMul;
      speedChangedAt = now;
      el("speed").textContent = `${state.speedMul.toFixed(1)}×`;
    }
    const speaking = now - speedChangedAt < 2000;
    el("speed").classList.toggle("on", speaking);
    el("auto").parentElement!.classList.toggle("calm", state.auto && !speaking);
  } else {
    shown("title", false);
    showCaption("");
    if (endShownAt === null) {
      endShownAt = now;
      shown("end", true);
      // Over: the address no longer names a chapter, so coming back starts it again.
      history.replaceState(null, "", location.pathname + location.search);
    }
    // The last frame comes back from the dark behind the whole route.
    setCurtain(1 - smooth((now - endShownAt) / 1500));
    leadIn.draw(endCanvas.getContext("2d")!, { rails, next: rails.length, progress: 1, ratio: fitCanvas(endCanvas), timeS: now / 1000 });
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
     * Resolves once the ground in view has landed whole - heights, water and
     * colour - and stayed so for two seconds, or after `limitMs` with false.
     * A still taken before this is of whatever had arrived (F81, F87).
     */
    async settled(limitMs = 45_000): Promise<boolean> {
      const start = performance.now();
      let quietSince: number | null = null;
      while (performance.now() - start < limitMs) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (quietFrame(terrain.stats)) quietSince ??= performance.now();
        else quietSince = null;
        if (quietSince !== null && performance.now() - quietSince >= 2000) return true;
      }
      return false;
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
        useSceneScale(film?.scenes[i] ?? null);
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
    /** The ground's colour (F87): `__ns.colour.stats`, `__ns.colour.decodes`. */
    colour,
    /** The ground's relief (F93): `__ns.relief.stats`; `__ns.reliefGain(k)` scales its slope live. */
    relief,
    reliefGain: (k: number) => {
      for (const m of terrain.lookMaterials) if (m.uniforms.uReliefGain) m.uniforms.uReliefGain.value = reliefGain(scale) * k;
    },
    /** Grade the mosaic live: `__ns.imagery([gain, saturation, rock share, snow share], [r, g, b])`. */
    imagery: (v: [number, number, number, number], tint?: [number, number, number]) => {
      for (const m of terrain.lookMaterials) {
        m.uniforms.uImagery?.value.set(...v);
        if (tint) m.uniforms.uImageryTint?.value.set(...tint);
      }
    },
    sound: soundTrack,
  };
}
