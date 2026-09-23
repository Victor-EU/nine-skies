/**
 * The film's sound at run time (design v2, "Sound"; plan v2, stage 5): the
 * scene's cue, from its lead-in, faded across the cut to the next; and the
 * wind bed under all of it, thinning with altitude - quieter, and losing its
 * body to a high-pass as the camera climbs.
 *
 * The files are licensed or commissioned and listed in `content/sound.yaml`
 * (served as `/sound.json`); a cue with no file is silence, not an error.
 * A browser will not start sound before the viewer does something, so the
 * track wakes on the first key or tap, and the sound button mutes it.
 */
import type { Sound } from "../../content/sound.ts";

/** Seconds a cue takes to fade in at its scene, and out at the cut. */
export const CUE_FADE_S = 1.5;
/** How far the music may drift from the film before it is moved back, seconds. */
export const DRIFT_S = 0.4;

/** The wind bed's level and the high-pass that thins it, at a real altitude. */
export function windAt(altitudeM: number): { gain: number; highPassHz: number } {
  // Full at the sea, a third at 9,000 m: the Himalaya is the thinnest air in the film.
  const t = Math.max(0, Math.min(1, altitudeM / 9000));
  return { gain: 0.5 * (1 - 0.66 * t), highPassHz: 60 + 440 * t * t };
}

/** Whether music playing at `playingS` has to be moved to `filmS`. */
export function needsSeek(playingS: number, filmS: number): boolean {
  return Math.abs(playingS - filmS) > DRIFT_S;
}

export interface SoundFrame {
  /** The playing scene's cue, or null for none (the end card). */
  readonly cue: string | null;
  /** Seconds into the scene, lead-in included: where the cue should be. */
  readonly sceneS: number;
  /** False while the film is paused. */
  readonly playing: boolean;
  /** The camera's real altitude, metres. */
  readonly altitudeM: number;
}

interface Voice {
  readonly el: HTMLAudioElement;
  readonly gain: GainNode;
}

export class SoundTrack {
  private ctx: AudioContext | null = null;
  private music: (Voice & { cue: string }) | null = null;
  private wind: (Voice & { filter: BiquadFilterNode }) | null = null;
  private muted = false;
  private readonly files: Map<string, string>;

  constructor(
    private readonly sound: Sound,
    private readonly baseUrl = "/sound",
  ) {
    this.files = new Map(sound.cues.map((c) => [c.cue, c.file]));
  }

  /** Whether there is anything to play at all. */
  get hasSound(): boolean {
    return this.files.size > 0 || this.sound.wind !== null;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Call from a key or a tap: a browser starts sound only for one. */
  wake(): void {
    if (!this.hasSound) return;
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    const now = this.ctx?.currentTime ?? 0;
    for (const v of [this.music, this.wind]) v?.gain.gain.setTargetAtTime(this.muted ? 0 : this.level(v === this.wind), now, 0.1);
    return this.muted;
  }

  update(f: SoundFrame): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    this.updateMusic(ctx, f);
    this.updateWind(ctx, f);
  }

  private voice(ctx: AudioContext, file: string, loop: boolean): Voice {
    const el = new Audio(`${this.baseUrl}/${file}`);
    el.loop = loop;
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    const gain = ctx.createGain();
    gain.gain.value = 0;
    ctx.createMediaElementSource(el).connect(gain);
    return { el, gain };
  }

  private level(wind: boolean): number {
    return this.muted ? 0 : wind ? this.windGain : 0.8;
  }

  private windGain = 0.5;

  private updateMusic(ctx: AudioContext, f: SoundFrame): void {
    const file = f.cue ? this.files.get(f.cue) : undefined;
    if (this.music && this.music.cue !== f.cue) {
      // The cut: the old cue fades and is let go.
      const old = this.music;
      old.gain.gain.setTargetAtTime(0, ctx.currentTime, CUE_FADE_S / 3);
      setTimeout(() => old.el.pause(), CUE_FADE_S * 1000 * 2);
      this.music = null;
    }
    if (!this.music && f.cue && file) {
      const v = this.voice(ctx, file, false);
      v.gain.connect(ctx.destination);
      v.el.currentTime = f.sceneS;
      this.music = { ...v, cue: f.cue };
      v.gain.gain.setTargetAtTime(this.level(false), ctx.currentTime, CUE_FADE_S / 3);
    }
    const m = this.music;
    if (!m) return;
    if (!f.playing) {
      if (!m.el.paused) m.el.pause();
      return;
    }
    if (needsSeek(m.el.currentTime, f.sceneS) && m.el.readyState >= 1) m.el.currentTime = f.sceneS;
    if (m.el.paused) void m.el.play().catch(() => undefined);
  }

  private updateWind(ctx: AudioContext, f: SoundFrame): void {
    const bed = this.sound.wind;
    if (!bed) return;
    if (!this.wind) {
      const v = this.voice(ctx, bed.file, true);
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      v.gain.connect(filter).connect(ctx.destination);
      this.wind = { ...v, filter };
    }
    const w = this.wind;
    const at = windAt(f.altitudeM);
    this.windGain = at.gain;
    w.gain.gain.setTargetAtTime(this.level(true), ctx.currentTime, 0.5);
    w.filter.frequency.setTargetAtTime(at.highPassHz, ctx.currentTime, 0.5);
    if (!f.playing) {
      if (!w.el.paused) w.el.pause();
    } else if (w.el.paused) void w.el.play().catch(() => undefined);
  }
}
