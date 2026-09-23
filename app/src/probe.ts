import { PerspectiveCamera, type Camera, type Scene, type WebGLRenderer } from "three";
import type { HorizonRing } from "../../engine/src/terrain/horizonRing.js";

/**
 * Framebuffer probes for the prototype (dev builds only).
 *
 * These exist because of prototype finding F9. A whole class of rendering
 * defect - a colour space mismatch, a band that draws behind what it should
 * cover, a silhouette wound the wrong way and culled entirely - is invisible
 * to the test suite, invisible in a scaled screenshot, and obvious the moment
 * you read the pixels. CI has no GPU, so the pixels have to be readable by
 * hand, and a tool in the repo beats the same twenty lines retyped into a
 * console at three in the morning.
 *
 * Caveat that costs an hour if you forget it: `readPixels` must run in the
 * same task as the `render` that filled the buffer, and the page has to be
 * compositing at all. Driven from a `requestAnimationFrame` callback both hold;
 * driven from an idle console in a hidden tab, neither does and every probe
 * comes back black.
 */

export interface ColumnSample {
  /** Fraction down the screen, 0 at the top. */
  at: number;
  rgb: [number, number, number];
}

export interface HorizonAB {
  /** Scanlines the impostor changes. */
  rows: number;
  /** Those scanlines as a vertical angle, degrees. */
  degrees: number;
  /** Largest channel-sum difference, out of 765. Below ~20 is invisible. */
  contrast: number;
  band: [number, number, number] | null;
  sky: [number, number, number] | null;
  hazeDensity: number;
}

export function createProbe(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  ring: HorizonRing,
  /** How a frame is drawn: through the look's passes, so the pixels read are the pixels shown. */
  render: () => void = () => renderer.render(scene, camera),
) {
  /** The live vertical field of view, or the prototype's if this is not one. */
  const fovDeg = (): number => (camera instanceof PerspectiveCamera ? camera.fov : 62);

  const readColumn = (): { px: Uint8Array; height: number } => {
    const gl = renderer.getContext();
    const { width, height } = renderer.domElement;
    render();
    const px = new Uint8Array(4 * height);
    gl.readPixels(
      Math.floor(width / 2),
      0,
      1,
      height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      px,
    );
    return { px, height };
  };

  // readPixels is bottom-up; everything a human says about a screen is not.
  const rgbAt = (px: Uint8Array, height: number, row: number): [number, number, number] => {
    const i = height - 1 - row;
    return [px[i * 4]!, px[i * 4 + 1]!, px[i * 4 + 2]!];
  };

  return {
    /** A vertical slice down the middle of the frame, for reading gradients. */
    column(steps = 16): ColumnSample[] {
      const { px, height } = readColumn();
      const out: ColumnSample[] = [];
      for (let i = 0; i <= steps; i++) {
        const at = i / steps;
        out.push({
          at: +at.toFixed(3),
          rgb: rgbAt(px, height, Math.min(height - 1, Math.round(at * height))),
        });
      }
      return out;
    },

    /**
     * What the horizon impostor is actually worth here: draw the frame with
     * and without it and compare. `contrast` is the number that matters -
     * angular height means nothing if the air has eaten it (finding F1).
     */
    horizonAB(): HorizonAB {
      const was = ring.mesh.visible;
      ring.mesh.visible = true;
      const on = readColumn();
      ring.mesh.visible = false;
      const off = readColumn();
      ring.mesh.visible = was;

      const { height } = on;
      let rows = 0;
      let contrast = 0;
      let first = -1;
      let last = -1;
      for (let i = 0; i < height; i++) {
        const d =
          Math.abs(on.px[i * 4]! - off.px[i * 4]!) +
          Math.abs(on.px[i * 4 + 1]! - off.px[i * 4 + 1]!) +
          Math.abs(on.px[i * 4 + 2]! - off.px[i * 4 + 2]!);
        if (d > contrast) contrast = d;
        if (d > 4) {
          rows++;
          if (first < 0) first = i;
          last = i;
        }
      }
      const mid = first < 0 ? -1 : height - 1 - Math.floor((first + last) / 2);
      return {
        rows,
        // Read off the camera, never written down. It was written down - 62,
        // the value the prototype was built with - until the comfort pass made
        // the field of view a setting, at which point a constant here would
        // have gone on reporting degrees for a frustum nobody was looking
        // through (F35). Assumes a level camera: the column read is vertical,
        // so a rolled one crosses the band at an angle and reads it 1/cos
        // thicker. Probe with the horizon locked, or divide it out.
        degrees: +((rows / height) * fovDeg()).toFixed(2),
        contrast,
        band: mid < 0 ? null : rgbAt(on.px, height, mid),
        sky: mid < 0 ? null : rgbAt(off.px, height, mid),
        hazeDensity: ring.material.uniforms.uHazeDensity!.value as number,
      };
    },
  };
}
