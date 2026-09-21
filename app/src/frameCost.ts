import { Vector2 } from "three";
import type { Mesh, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import type { Terrain } from "../../engine/src/terrain/terrain.js";
import type { HorizonRing } from "../../engine/src/terrain/horizonRing.js";
import {
  GOOD_FIT_R2,
  gpuTimer,
  linearity,
  lowest,
  type Linearity,
} from "../../engine/src/gfx/gpuTimer.js";

/**
 * What the frame actually costs, per pass, on this machine (workstream B).
 *
 * The build plan's frame budget is seven lines of milliseconds against a
 * 33.3 ms total, and until now nothing in the repository measured a
 * millisecond. The HUD counts frames, which vsync caps, so the prototype's
 * recorded "65-120 fps" is consistent with terrain spending 1 ms of its 8 ms
 * and with it spending 7.9 ms. The risk register's trip-wire - *displaced grid
 * under 4 ms at L0* - is a number of exactly the kind that counter cannot see.
 *
 * Four decisions worth knowing before reading any number this produces:
 *
 *  - **It renders at exactly 1920x1080.** The budget is written for 1080p and
 *    this display is Retina; left alone the drawing buffer is 3024x1964 and
 *    every fragment cost is inflated by 2.9x against a budget it never agreed
 *    to. The size is forced for the capture and restored after.
 *  - **Passes are separated by visibility, not by a second scene.** Each
 *    variant renders the same world from the same camera with some of it
 *    switched off, so the difference between two variants is the thing that
 *    was switched off and nothing else.
 *  - **`clear` is a variant.** `render` costs something with an empty scene -
 *    clear, state, present - and that cost belongs to neither terrain nor the
 *    horizon. It is measured rather than assumed to be zero.
 *  - **The instrument is checked before it is believed.** See `linearity`.
 *
 * What is not in these numbers: the HUD, which is DOM and never touches the
 * GPU queue, and the CPU side of the frame, which the budget gives its own
 * 4 ms line and which a GPU timer cannot see.
 */

/** The resolution the budget table is written for. */
export const BUDGET_WIDTH = 1920;
export const BUDGET_HEIGHT = 1080;

/**
 * The field of view every capture is taken through - the prototype's own, and
 * the middle of the comfort cycle (F35). Held here rather than imported from
 * the comfort settings on purpose: this is a reference the budget is written
 * against, and it must not move when a default moves.
 */
export const BUDGET_FOV_DEG = 62;

/**
 * How many times each variant is timed. The reported cost is the cheapest of
 * them - see `lowest`, which is also where the number 20 is argued for.
 */
const DEFAULT_SAMPLES = 20;

/**
 * The areas the instrument check sweeps, as a fraction of the budget frame.
 *
 * Pixels rather than repeated passes: see `linearity`. The largest is above
 * 1080p on purpose, so the fit is not an extrapolation at the one size every
 * reported number is taken at.
 */
const INSTRUMENT_SCALES = [0.25, 0.5, 0.75, 1, 1.333] as const;

/** Give up waiting for tile generation to settle after this many frames. */
const MAX_SETTLE_FRAMES = 180;

export interface CaptureStation {
  readonly id: string;
  readonly km: number;
  readonly eastM: number;
  readonly northM: number;
  readonly altitudeM: number;
  readonly headingRad: number;
  readonly groundM: number;
  readonly why: string;
}

export interface StationCost {
  readonly station: CaptureStation;
  readonly drawCalls: number;
  readonly instances: number;
  readonly triangles: number;
  readonly resident: number;
  readonly missing: number;
  /** GPU milliseconds per variant, as drawn: the cheapest of `samples`. */
  readonly ms: Readonly<Record<string, number>>;
  /** Instances in each LOD bucket, nearest first. */
  readonly perLod: readonly number[];
  /**
   * What each of those buckets is. Four LODs of the country grid, and four
   * more of the hero grid when 90 m cover is flying (F51) - the totals above
   * hide which lattice the triangles came from, and they do not cost the same.
   */
  readonly bucketLabels: readonly string[];
}

export interface FrameCostReport {
  readonly renderer: string;
  readonly vendor: string;
  /**
   * The drawing buffer every timing above was taken at - read back from the
   * renderer when the capture finished, never the size it asked for. A report
   * that states its intention rather than its measurement is how a capture
   * comes to claim 1080p numbers taken at something else.
   */
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
  /** What the window was running at while this was taken. */
  readonly frameRateHz: number;
  readonly samples: number;
  readonly expedition: string;
  /** Null for a whole capture; the ids asked for when it was a subset. */
  readonly only: readonly string[] | null;
  readonly takenAt: string;
  /** The instrument check. A capture with a poor fit is not evidence. */
  readonly instrument: Linearity | null;
  readonly stations: readonly StationCost[];
}

export interface FrameCostOptions {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly terrain: Terrain;
  readonly ring: HorizonRing;
  /**
   * Put the world and the camera where a frame at this station would put them.
   * Supplied by the caller rather than rebuilt here, so that a capture is of
   * the frame the game draws and not of a second arrangement that resembles
   * it.
   */
  readonly placeAt: (station: CaptureStation) => void;
  /**
   * Stop the host's own animation loop for the duration, returning the
   * function that starts it again.
   *
   * Not optional, because a capture that does not own the frame measures
   * nothing. See the note on `suspended` in `main.ts`.
   */
  readonly suspend: () => () => void;
  readonly stationsUrl?: string | undefined;
  /**
   * Capture at a resolution other than the budget's.
   *
   * The budget is written for 1080p and the floor device is a Retina Mac,
   * which does not draw 1080p at any setting the game currently asks for -
   * so the two have to be measured against each other rather than assumed
   * equal. A capture taken here says so in its own header.
   */
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  /**
   * Capture only these station ids, in the fixture's own order.
   *
   * A whole capture is seven stations and takes the better part of a minute;
   * a question about resolution, or about one pass, does not need seven. The
   * subset goes in the report so a partial capture cannot be mistaken for a
   * full one later.
   */
  readonly only?: readonly string[] | undefined;
  readonly samples?: number | undefined;
}

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** Below this, a capture is not slow, it is a different activity. */
export const MIN_FRAME_RATE_HZ = 20;

/**
 * How long a whole capture may take before it gives up.
 *
 * The frame-rate checks are a diagnosis and this is the backstop. They only
 * look between stations, and a station that would take six seconds takes ten
 * minutes at 1.5 Hz — so the diagnosis can be quite slow to arrive, and it
 * only covers one of the reasons a capture can stop making progress. A
 * deadline covers all of them, including the ones nobody has thought of, and
 * the cost of being wrong about it is re-running a measurement rather than
 * losing an afternoon to something that looks like a hang.
 */
export const DEADLINE_MS = 5 * 60_000;

/**
 * Whether frames are arriving fast enough to measure with, and why not.
 *
 * Split out from the capture so the rule has a test. The capture around it
 * cannot have one - it needs a GPU, a window and a world - which is exactly
 * the circumstance in which a guard quietly stops guarding.
 */
export function tooSlowToMeasure(frameRateHz: number): string | null {
  if (frameRateHz >= MIN_FRAME_RATE_HZ) return null;
  const secondsPerStation = Math.round((60 / Math.max(frameRateHz, 0.01)) * 40);
  return (
    `animation frames are arriving at ${frameRateHz.toFixed(1)} Hz, so this ` +
    `capture would take about ${secondsPerStation} seconds per station instead ` +
    `of six; bring the window to the front and run it again`
  );
}

/** Animation frames a second, measured over a handful of them. */
async function measureFrameRate(frames = 10): Promise<number> {
  await nextFrame();
  const started = performance.now();
  for (let i = 0; i < frames; i++) await nextFrame();
  return (frames * 1000) / (performance.now() - started);
}

function rendererName(gl: WebGL2RenderingContext): { vendor: string; renderer: string } {
  const dbg = gl.getExtension("WEBGL_debug_renderer_info") as
    | { UNMASKED_VENDOR_WEBGL: number; UNMASKED_RENDERER_WEBGL: number }
    | null;
  return dbg
    ? {
        vendor: String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)),
        renderer: String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)),
      }
    : { vendor: String(gl.getParameter(gl.VENDOR)), renderer: String(gl.getParameter(gl.RENDERER)) };
}

/**
 * Wait until the terrain has finished streaming tiles in.
 *
 * Tile generation is spread across frames on purpose, so the first frame after
 * a jump draws a world that is still arriving. Timing that frame measures the
 * upload, not the draw.
 */
async function settle(terrain: Terrain, draw: () => void): Promise<void> {
  let quiet = 0;
  for (let frame = 0; frame < MAX_SETTLE_FRAMES && quiet < 3; frame++) {
    draw();
    quiet = terrain.stats.generatedThisFrame === 0 ? quiet + 1 : 0;
    await nextFrame();
  }
}

export async function captureFrameCost(options: FrameCostOptions): Promise<FrameCostReport> {
  // Refuse rather than crawl. Every timing here waits on an animation frame,
  // and a browser throttles those to about one a second when it decides the
  // page is not being looked at: the capture that takes forty seconds in
  // front takes the better part of an hour behind, with the game's own loop
  // suspended the whole time. The first run to hit this looked exactly like a
  // hang.
  //
  // The rate is measured rather than read off `document.hidden`, which is not
  // the same question and in this shell is not even a good proxy for it - it
  // reported `hidden` throughout several captures that were running at 98 Hz.
  // What matters is whether frames are arriving, so that is what is asked.
  const frameRateHz = await measureFrameRate();
  const tooSlow = tooSlowToMeasure(frameRateHz);
  if (tooSlow) throw new Error(tooSlow);
  const resume = options.suspend();
  // The field of view is pinned for the same reason as the resolution, and for
  // one weaker one. Nothing in the scene is frustum-culled today - the terrain
  // is a circular disc of tiles around the aircraft and the impostor is a ring
  // - so a wider camera cannot cost more, and this is belt and braces rather
  // than a correction. It means a comfort setting can never quietly make two
  // captures incomparable (F35, D25). It sits out here rather than beside the
  // canvas size because `resume` puts the canvas back and knows nothing about
  // this, so an aborted capture would otherwise keep the player's camera.
  const beforeFov = options.camera.fov;
  options.camera.fov = BUDGET_FOV_DEG;
  try {
    return await capture(options, frameRateHz);
  } finally {
    // However it ended, give the frame back. Without this a capture that
    // throws leaves the game suspended at whatever resolution it was using,
    // with no way out but a reload, and the error that caused it is then the
    // least of the operator's problems.
    options.camera.fov = beforeFov;
    options.camera.updateProjectionMatrix();
    resume();
  }
}

async function capture(
  options: FrameCostOptions,
  frameRateHz: number,
): Promise<FrameCostReport> {
  const { renderer, scene, camera, terrain, ring, placeAt } = options;
  const samples = options.samples ?? DEFAULT_SAMPLES;
  const gl = renderer.getContext() as WebGL2RenderingContext;

  const response = await fetch(options.stationsUrl ?? "/capture-stations.json");
  if (!response.ok) throw new Error(`no capture stations: ${response.status}`);
  const fixture = (await response.json()) as {
    expedition: string;
    stations: CaptureStation[];
  };
  const wanted = options.only;
  const chosen = wanted ? fixture.stations.filter((s) => wanted.includes(s.id)) : fixture.stations;
  if (chosen.length === 0) {
    throw new Error(
      `no station matches ${JSON.stringify(wanted)}; the fixture has ` +
        fixture.stations.map((s) => s.id).join(", "),
    );
  }

  // Measure at the resolution the budget is written for, then put the canvas
  // back exactly as it was.
  const before = renderer.getSize(new Vector2());
  const beforePixelRatio = renderer.getPixelRatio();
  const beforeAspect = camera.aspect;
  const setSize = (w: number, h: number): void => {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const width = options.width ?? BUDGET_WIDTH;
  const height = options.height ?? BUDGET_HEIGHT;
  const budgetMegapixels = (width * height) / 1e6;
  renderer.setPixelRatio(1);
  setSize(width, height);

  const draw = (): void => renderer.render(scene, camera);
  const timer = gpuTimer(gl);
  if (!timer) {
    throw new Error(
      "EXT_disjoint_timer_query_webgl2 is not available; this browser cannot " +
        "be asked what the GPU spent, and a wall-clock number here would be vsync",
    );
  }

  const meshes = terrain.meshes as Mesh[];
  const showOnly = (visible: (index: number) => boolean, ringVisible: boolean): void => {
    meshes.forEach((mesh, i) => (mesh.visible = visible(i) && terrain.stats.perLod[i]! > 0));
    ring.mesh.visible = ringVisible;
  };

  const deadline = performance.now() + DEADLINE_MS;
  const timeVariant = async (label: string): Promise<number> => {
    if (performance.now() > deadline) {
      throw new Error(
        `this capture has been running for ${(DEADLINE_MS / 60_000).toFixed(0)} minutes ` +
          `and is still on "${label}" at station ${stations.length + 1} of ` +
          `${chosen.length}; something is stopping it making progress`,
      );
    }
    return (await lowest(timer, draw, samples)) ?? Number.NaN;
  };

  let instrument: Linearity | null = null;
  const stations: StationCost[] = [];

  for (const station of chosen) {
    // Again at every station, not only at the start. A window can go to the
    // back halfway through - this one reliably does, about thirty seconds in -
    // and a capture that began at ninety-eight frames a second and continued
    // at one is indistinguishable from a hang. Saying where it got to turns
    // twenty silent minutes into a sentence.
    const tooSlowNow = tooSlowToMeasure(await measureFrameRate());
    if (tooSlowNow) {
      throw new Error(
        `${tooSlowNow} — stopped at station "${station.id}", ` +
          `${stations.length} of ${chosen.length} taken`,
      );
    }
    placeAt(station);
    showOnly(() => true, true);
    await settle(terrain, draw);

    const perLod = [...terrain.stats.perLod];
    const { drawCalls, instances, triangles, resident, missing } = terrain.stats;

    // Check the instrument once the world is real and loaded, not on an empty
    // scene where there is no work to scale.
    instrument ??= await (async () => {
      const fit = await linearity(
        timer,
        (megapixels) => {
          const scale = Math.sqrt(megapixels / budgetMegapixels);
          setSize(Math.round(width * scale), Math.round(height * scale));
          draw();
        },
        INSTRUMENT_SCALES.map((f) => budgetMegapixels * f),
        samples,
        "megapixels",
      );
      setSize(width, height);
      return fit;
    })();

    const ms: Record<string, number> = {};
    showOnly(() => false, false);
    ms["clear"] = await timeVariant("clear");
    showOnly(() => true, false);
    ms["terrain"] = await timeVariant("terrain");
    showOnly(() => false, true);
    ms["horizon"] = await timeVariant("horizon");
    for (let lod = 0; lod < meshes.length; lod++) {
      if (perLod[lod]! === 0) continue;
      showOnly((i) => i === lod, false);
      const label = terrain.stats.bucketLabels[lod] ?? `l${lod}`;
      ms[`terrain.${label}`] = await timeVariant(`terrain.${label}`);
    }
    showOnly(() => true, true);
    ms["all"] = await timeVariant("all");

    stations.push({
      station,
      drawCalls,
      instances,
      triangles,
      resident,
      missing,
      ms,
      perLod,
      bucketLabels: [...terrain.stats.bucketLabels],
    });
  }

  const drewAt = renderer.getSize(new Vector2());
  renderer.setPixelRatio(beforePixelRatio);
  renderer.setSize(before.x, before.y, false);
  camera.aspect = beforeAspect;
  camera.updateProjectionMatrix();

  const names = rendererName(gl);
  return {
    ...names,
    width: drewAt.x,
    height: drewAt.y,
    devicePixelRatio,
    frameRateHz,
    samples,
    expedition: fixture.expedition,
    only: wanted ? [...wanted] : null,
    takenAt: new Date().toISOString(),
    instrument,
    stations,
  };
}

/** The budget table's terrain line, milliseconds (build plan, workstream B). */
export const TERRAIN_BUDGET_MS = 8;

/** The risk register's trip-wire for D3: displaced grid under 4 ms at L0. */
export const L0_TRIPWIRE_MS = 4;

/** The whole frame, at 30 fps. */
export const FRAME_BUDGET_MS = 1000 / 30;

const pad = (v: string | number, width: number): string => String(v).padStart(width);
const ms = (v: number | undefined): string =>
  v === undefined || Number.isNaN(v) ? "    -" : pad(v.toFixed(2), 5);

/**
 * How small a difference this capture can see, in milliseconds.
 *
 * `clear` is the same work at every station - an empty scene at a fixed
 * resolution - so any spread in it is the instrument, not the world. Anything
 * narrower than that spread has not been measured, however confident the
 * decimal places look, and a pass that comes out slightly negative is saying
 * exactly this and should be read as such rather than as a defect.
 */
export function resolutionMs(report: FrameCostReport): number {
  const clears = report.stations
    .map((s) => s.ms["clear"])
    .filter((v): v is number => v !== undefined && !Number.isNaN(v));
  if (clears.length < 2) return Number.NaN;
  return Math.max(...clears) - Math.min(...clears);
}

/** The report as something a person can read in a console. */
export function frameCostTable(report: FrameCostReport): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  ${report.renderer}`);
  const offBudget = report.width !== BUDGET_WIDTH || report.height !== BUDGET_HEIGHT;
  lines.push(
    `  ${report.width}x${report.height}${offBudget ? " ⚠ NOT THE BUDGET'S RESOLUTION" : ""}` +
      ` · lowest of ${report.samples} · ` +
      `${report.expedition}${report.only ? ` · ONLY ${report.only.join(", ")}` : ""} · ` +
      `${report.frameRateHz.toFixed(0)} Hz · ${report.takenAt}`,
  );
  const fit = report.instrument;
  lines.push(
    fit
      ? `  instrument: ${fit.msPerUnit.toFixed(3)} ms per ${fit.unit.replace(/s$/, "")} + ` +
        `${fit.overheadMs.toFixed(3)} ms per pass, r² ${fit.r2.toFixed(4)} over ` +
        `${fit.points.map((p) => p.load.toFixed(2)).join(", ")} ${fit.unit}` +
        (fit.r2 < GOOD_FIT_R2 ? "  ⚠ POOR FIT — these numbers are not measurements" : "")
      : "  instrument: NOT CHECKED — the linearity probe did not resolve",
  );
  lines.push("");
  // The bucket names come from the terrain rather than being spelled here,
  // because how many there are depends on whether hero cover was flying.
  const buckets = report.stations[0]?.bucketLabels ?? ["L0", "L1", "L2", "L3"];
  lines.push(
    `  station        km    alt   tiles   ${buckets.join("/")}` +
      `        tris  clear terrain horizon   all`,
  );
  for (const s of report.stations) {
    const net = (key: string): number => (s.ms[key] ?? Number.NaN) - (s.ms["clear"] ?? 0);
    lines.push(
      `  ${s.station.id.padEnd(12)}${pad(s.station.km.toFixed(0), 5)}` +
        `${pad(s.station.altitudeM, 7)}${pad(s.instances, 8)}   ` +
        `${s.perLod.map((n) => pad(n, 3)).join("/")}` +
        `${pad(`${Math.round(s.triangles / 1000)}k`, 12)}` +
        ` ${ms(s.ms["clear"])}  ${ms(net("terrain"))}  ${ms(net("horizon"))} ${ms(s.ms["all"])}`,
    );
  }
  lines.push("");
  const floor = resolutionMs(report);
  lines.push(
    `  terrain budget ${TERRAIN_BUDGET_MS.toFixed(2)} ms · whole frame ` +
      `${FRAME_BUDGET_MS.toFixed(2)} ms · ` +
      (Number.isNaN(floor)
        ? // The spread of one number is undefined, not zero: a one-station
          // capture cannot say what it resolved, only that it did not check.
          `resolution NOT MEASURED (one station — the spread of \`clear\` needs two)`
        : `resolution ±${floor.toFixed(2)} ms ` +
          `(the spread of \`clear\`, which is the same work at every station)`),
  );
  lines.push("");
  lines.push("  the D3 trip-wire — displaced grid at L0, against 4 ms");
  for (const s of report.stations) {
    const l0 = s.ms[`terrain.${s.bucketLabels[0] ?? "L0"}`];
    if (l0 === undefined) continue;
    const net = l0 - (s.ms["clear"] ?? 0);
    lines.push(
      `  ${s.station.id.padEnd(12)} ${pad(s.perLod[0] ?? 0, 3)} instances · ` +
        `${ms(net)} ms · ${net <= L0_TRIPWIRE_MS ? "under" : "OVER"} the trip-wire`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
