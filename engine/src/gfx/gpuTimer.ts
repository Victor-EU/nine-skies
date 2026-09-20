/**
 * GPU timing for the frame budget (build plan, workstream B).
 *
 * The HUD's fps counter cannot answer the question the budget table asks. It
 * is wall clock, it is capped by vsync, and it reports one number for the
 * whole frame. "65-120 fps" is compatible with terrain costing 1 ms of its
 * 8 ms budget and with it costing 7.9 ms, and those are different projects.
 * `EXT_disjoint_timer_query_webgl2` asks the GPU what it actually spent.
 *
 * Three things make this instrument easy to misread, so they are handled here
 * rather than at every call site:
 *
 *  - **The result is not ready when the draw returns.** The CPU is ahead of
 *    the GPU by a frame or more, so a query has to be polled across frames.
 *  - **A disjoint invalidates every query in flight.** The driver preempted,
 *    changed clock, or lost context; whatever it reports is meaningless and
 *    must be thrown away rather than averaged in. Reading `GPU_DISJOINT_EXT`
 *    clears it, so it is read once before the query and once after.
 *  - **Only one `TIME_ELAPSED_EXT` query may be active at a time.** Nesting
 *    scopes is not available; passes are timed one after another.
 *
 * What it still cannot tell you: how the frame would cost on a different GPU.
 * Every number out of here is a property of the machine that produced it, and
 * a capture that does not name that machine is not evidence of anything.
 */

/** Nanoseconds to milliseconds. */
const NS_PER_MS = 1e6;

/** How many frames to wait for a result before giving up on it. */
const MAX_WAIT_FRAMES = 240;

export interface GpuTimer {
  /**
   * Run `draw` and return what the GPU spent on it, in milliseconds, or
   * `null` if the result was disjoint or never arrived. Null means "no
   * measurement", never "zero".
   */
  time(draw: () => void): Promise<number | null>;
}

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * A timer, or `null` where the extension is absent.
 *
 * Absence is normal and not a failure: browsers gate this extension, and a
 * machine without it can still run everything else. A caller that treats null
 * as an error will refuse to run on hardware that is merely being careful.
 */
export function gpuTimer(gl: WebGL2RenderingContext): GpuTimer | null {
  const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2") as
    | { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }
    | null;
  if (!ext) return null;

  return {
    async time(draw: () => void): Promise<number | null> {
      const query = gl.createQuery();
      if (!query) return null;
      // Draw where the game draws - inside an animation frame - so the work
      // being timed sits in the same place in the browser's schedule that it
      // will sit in when a player is flying.
      await nextFrame();
      // Clear any disjoint that happened before we started; otherwise this
      // query inherits the blame for the last one.
      gl.getParameter(ext.GPU_DISJOINT_EXT);
      gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      draw();
      gl.endQuery(ext.TIME_ELAPSED_EXT);

      for (let waited = 0; waited < MAX_WAIT_FRAMES; waited++) {
        await nextFrame();
        if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) continue;
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
        const ns = disjoint
          ? null
          : (gl.getQueryParameter(query, gl.QUERY_RESULT) as number);
        gl.deleteQuery(query);
        return ns === null ? null : ns / NS_PER_MS;
      }
      gl.deleteQuery(query);
      return null;
    },
  };
}

export interface Linearity {
  /** What the load axis counts - "megapixels", "draws". */
  readonly unit: string;
  /** Milliseconds per unit of load: the slope of the fit. */
  readonly msPerUnit: number;
  /**
   * Milliseconds the first draw costs over and above the slope - the render
   * pass's own fixed cost, which on a multisampled default framebuffer
   * includes the resolve and the hand-off to the compositor.
   */
  readonly overheadMs: number;
  /** How well the fit holds. Below ~0.99 the timer is not measuring work. */
  readonly r2: number;
  readonly points: readonly { readonly load: number; readonly ms: number }[];
}

/**
 * How well the fit has to hold before the readings count as measurements.
 *
 * Not 0.99. Measured on this machine, a clean sweep fits at about 0.98 and the
 * residual is the noise floor rather than a defect in the timer; a timer that
 * reports a constant - the failure this exists to catch - scores 0. The
 * threshold only has to separate those two, and setting it where a good run
 * fails means it will be ignored, which is worse than not having it.
 */
export const GOOD_FIT_R2 = 0.95;

/**
 * Check the instrument before trusting its readings.
 *
 * A timer query can come back quantised, clamped, or rounded to a tick the
 * browser considers safe to expose, and every one of those failures looks
 * like a plausible millisecond count. The one thing a real timer must do is
 * scale: twice the work must cost about twice as much.
 *
 * What counts as "twice the work" is not obvious, and the first version of
 * this got it wrong. Drawing the same full-screen pass twice is *not* twice
 * the work on a tile-based deferred GPU - consecutive passes that begin by
 * clearing let the hardware skip storing the one before, so sixteen passes
 * came back at under three times the cost of one and the timer was blamed for
 * it. Pixels are the honest axis: a pass over four times the area does four
 * times the fragment work on any architecture. The caller supplies the load
 * and the draw, so the axis is its choice and the fit is this function's.
 *
 * The fit carries an intercept rather than being forced through the origin. A
 * render pass costs something before it has shaded anything, and a
 * through-the-origin fit reports that as a failed instrument instead of as
 * the number it is.
 */
export async function linearity(
  timer: GpuTimer,
  draw: (load: number) => void,
  loads: readonly number[],
  samples: number,
  unit = "draws",
): Promise<Linearity | null> {
  const points: { load: number; ms: number }[] = [];
  for (const load of loads) {
    const ms = await lowest(timer, () => draw(load), samples);
    if (ms === null) return null;
    points.push({ load, ms });
  }

  const n = points.length;
  const meanX = points.reduce((a, p) => a + p.load, 0) / n;
  const meanY = points.reduce((a, p) => a + p.ms, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of points) {
    sxy += (p.load - meanX) * (p.ms - meanY);
    sxx += (p.load - meanX) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  let ssTot = 0;
  for (const p of points) {
    ssRes += (p.ms - (intercept + slope * p.load)) ** 2;
    ssTot += (p.ms - meanY) ** 2;
  }
  return {
    unit,
    msPerUnit: slope,
    overheadMs: intercept,
    r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot,
    points,
  };
}

/**
 * The cheapest of `samples` timings of the same work, or null if none landed.
 *
 * The minimum, not the mean or the median, and the choice matters more than it
 * looks. Everything that can go wrong during a measurement - the compositor
 * taking the GPU, another tab, a clock change, this machine deciding to do
 * something else - makes a reading longer. Nothing makes one shorter than the
 * work takes. So the sample distribution is the true cost plus a
 * one-sided tail, and its floor is the estimate; its middle is an average of
 * how busy the machine was.
 *
 * Measured here: the median of fifteen timings of an *empty* 1080p frame came
 * back at 3.5 ms, which is a tenth of the whole frame budget spent drawing
 * nothing. The minimum of the same fifteen was 0.50 ms.
 */
export async function lowest(
  timer: GpuTimer,
  draw: () => void,
  samples: number,
): Promise<number | null> {
  let best: number | null = null;
  for (let i = 0; i < samples; i++) {
    const ms = await timer.time(draw);
    if (ms !== null && (best === null || ms < best)) best = ms;
  }
  return best;
}

/** The middle value, or the mean of the middle two. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
