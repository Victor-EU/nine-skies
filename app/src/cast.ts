/**
 * The cast's switch (D91): off unless the viewer asks, and nothing of it is
 * fetched until they do. Asked by the bar's button, the key J, `?cast` in
 * the address so a shared link carries it, or a choice remembered in this
 * browser. On, the layer's code arrives as its own chunk and the current
 * scene's figures are built; off again, they are freed.
 *
 * The shell holds the layer through `current`, and calls it at the two
 * points the film has: a scene starting, and a frame after the look.
 */
import type { CastLayer, CastLayerOptions } from "../../engine/src/cast/cast.js";

const STORAGE_KEY = "nineskies.cast";

export interface CastSwitchOptions {
  readonly button: HTMLButtonElement;
  /** Whether the film has any cast to show; the button hides otherwise. */
  readonly hasCast: boolean;
  readonly layerOptions: () => CastLayerOptions;
  /** Called with the layer once it is up, or null when it is gone. */
  readonly onChange: (layer: CastLayer | null) => void;
}

/**
 * The viewing's seed (D92): `?castseed=` in the address plays a viewing
 * again, a still or a probe the same way twice; otherwise a new one each
 * time the page opens, so the cast is never quite where it was.
 */
export function seedAtStart(search: string, draw: () => number = () => Math.floor(Math.random() * 4294967296)): number {
  const given = new URLSearchParams(search).get("castseed");
  const v = given === null || given.trim() === "" ? NaN : Number(given);
  return Number.isInteger(v) && v >= 0 ? v >>> 0 : draw() >>> 0;
}

/** The viewer's choice as the page opened: the address first, then this browser's memory. */
export function wantedAtStart(search: string, stored: string | null): boolean {
  const params = new URLSearchParams(search);
  if (params.has("cast")) return params.get("cast") !== "off";
  return stored === "on";
}

export class CastSwitch {
  current: CastLayer | null = null;
  /** One seed for the page: switching the cast off and on again plays the same viewing. */
  readonly seed = seedAtStart(location.search);
  private wanted = false;
  private loading: Promise<void> | null = null;

  constructor(private readonly options: CastSwitchOptions) {
    options.button.hidden = !options.hasCast;
    options.button.addEventListener("click", () => this.toggle());
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (options.hasCast && wantedAtStart(location.search, stored)) void this.set(true);
    this.show();
  }

  get on(): boolean {
    return this.wanted;
  }

  toggle(): void {
    void this.set(!this.wanted);
  }

  async set(on: boolean): Promise<void> {
    if (on === this.wanted) return;
    this.wanted = on;
    try {
      localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {
      // A private window: the choice lasts the page.
    }
    this.show();
    if (on) {
      if (this.loading) return;
      this.loading = (async () => {
        // The layer, its figures and their motions, only now (vite splits them into their own chunks).
        const [{ CastLayer }] = await Promise.all([import("../../engine/src/cast/cast.js"), import("../../engine/src/cast/figures/index.js"), import("../../engine/src/cast/motions/index.js")]);
        this.loading = null;
        if (!this.wanted) return;
        this.current = new CastLayer({ ...this.options.layerOptions(), seed: this.seed });
        this.options.onChange(this.current);
      })();
      await this.loading;
    } else if (this.current) {
      this.current.dispose();
      this.current = null;
      this.options.onChange(null);
    }
  }

  private show(): void {
    const b = this.options.button;
    b.setAttribute("aria-pressed", String(this.wanted));
    b.classList.toggle("off", !this.wanted);
    b.title = `${this.wanted ? "Hide" : "Show"} the cast (J)`;
    b.setAttribute("aria-label", b.title);
  }
}
