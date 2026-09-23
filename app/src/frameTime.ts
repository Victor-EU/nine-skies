/**
 * Frame time by wall clock, for the machines that cannot be asked what the
 * GPU spent (plan v2, stage 3; the risk register's phones). Safari has no
 * timer query, so a phone is measured the only way it can be: the time
 * between animation frames, which vsync floors at the display's interval.
 * A phone that holds its refresh rate reads that interval and no less; one
 * that cannot reads what it managed.
 *
 *   /?frametime            a readout in the corner, over the last few seconds
 *   /?frametime&scale=0.75 the same with the scene drawn at three quarters
 */

/** Frames the readout summarises. */
export const FRAME_WINDOW = 240;

export interface FrameTimeSummary {
  readonly frames: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly fps: number;
  /** Frames that took more than one and a half times the median: stutter. */
  readonly slowShare: number;
}

/** What a run of frame intervals says. Null until there are enough to say it. */
export function summarise(intervalsMs: readonly number[]): FrameTimeSummary | null {
  if (intervalsMs.length < 10) return null;
  const sorted = [...intervalsMs].sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  const medianMs = at(0.5);
  const total = intervalsMs.reduce((a, b) => a + b, 0);
  const slow = intervalsMs.filter((ms) => ms > medianMs * 1.5).length;
  return {
    frames: intervalsMs.length,
    medianMs,
    p95Ms: at(0.95),
    fps: (1000 * intervalsMs.length) / total,
    slowShare: slow / intervalsMs.length,
  };
}

export function formatSummary(s: FrameTimeSummary, scale: number, pixels: { w: number; h: number }): string {
  return (
    `${s.medianMs.toFixed(1)} ms median · ${s.p95Ms.toFixed(1)} ms p95 · ${s.fps.toFixed(0)} fps\n` +
    `${(100 * s.slowShare).toFixed(0)} % slow · ${pixels.w}×${pixels.h} × ${scale} · ${s.frames} frames`
  );
}

/** Keeps the last `FRAME_WINDOW` intervals. */
export class FrameClock {
  private readonly intervals: number[] = [];
  private last: number | null = null;

  tick(nowMs: number): void {
    if (this.last !== null) {
      this.intervals.push(nowMs - this.last);
      if (this.intervals.length > FRAME_WINDOW) this.intervals.shift();
    }
    this.last = nowMs;
  }

  /** Forget the history: after a pause, the gap is not a frame. */
  reset(): void {
    this.intervals.length = 0;
    this.last = null;
  }

  summary(): FrameTimeSummary | null {
    return summarise(this.intervals);
  }
}
