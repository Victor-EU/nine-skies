import {
  DataArrayTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  UnsignedByteType,
  type WebGLRenderer,
} from "three";
import { COLOUR_SAMPLES, type ColourImage } from "./colour.js";

/**
 * The ground's colour on the GPU (F87): one sRGB layer beside each height
 * layer, mipmapped, filled as each tile's image is decoded.
 *
 * Unlike the heights, nothing here keeps a copy on the CPU. A layer is a
 * quarter of a megabyte, so the country's 256 would be 68 MB of JavaScript
 * heap held only to be uploaded; instead each decoded image goes straight to
 * `texSubImage3D` and is let go. That is also why the upload is the engine's
 * own GL call rather than three's: three uploads an array texture from one
 * typed array the size of the whole array.
 *
 * A layer's colour is drawn only once it is uploaded for the tile now in the
 * layer (`held`), so a layer that changes tile needs no clearing, and a
 * tile's ground is never held back for its colour: it flies in the palette
 * until the image lands.
 */

const ASKED = 0;
const NONE = 1;
const QUEUED = 2;
const HELD = 3;

/**
 * Images uploaded in one frame at most. A pack lands a scene's ~140 tiles at
 * once; twelve a frame paints them in within a dozen frames rather than
 * stalling one.
 */
export const COLOUR_UPLOADS_PER_FRAME = 12;

/** How the images reach the GPU: the renderer's context in the app, a record in tests. */
export interface ColourUploader {
  upload(layer: number, image: ColourImage): void;
  /** After a frame's uploads: the mip chain, which the GPU builds for every layer. */
  mipmap(): void;
}

export class ColourLayers {
  readonly texture: DataArrayTexture;
  private readonly state: Uint8Array;
  private readonly queued = new Map<number, ColourImage>();
  /** Layers uploaded, over the life of the array. */
  uploaded = 0;
  /** Layers uploaded by the last flush. */
  lastUploads = 0;

  constructor(
    readonly layers: number,
    readonly samples: number = COLOUR_SAMPLES,
    /** Data rather than colour, read as stored: the relief's normals (F93). */
    readonly linear = false,
  ) {
    this.state = new Uint8Array(layers);
    this.texture = new DataArrayTexture(null, samples, samples, layers);
    this.texture.format = RGBAFormat;
    this.texture.type = UnsignedByteType;
    // Stored as the mosaic's sRGB and read as linear light, filtered after
    // the conversion, as it should be.
    this.texture.internalFormat = linear ? "RGBA8" : "SRGB8_ALPHA8";
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.generateMipmaps = true;
    // Ground is seen at a grazing angle; without this the far half of the
    // frame is the smallest mip.
    this.texture.anisotropy = 8;
    // Allocate, and upload nothing: the layers arrive one image at a time.
    this.texture.source.dataReady = false;
    this.texture.needsUpdate = true;
  }

  /** A layer has taken a new tile: its colour is to be asked for again. */
  reset(layer: number): void {
    this.state[layer] = ASKED;
    const stale = this.queued.get(layer);
    if (stale) {
      stale.close();
      this.queued.delete(layer);
    }
  }

  /** Whether this layer's tile still wants its colour asked for. */
  wanted(layer: number): boolean {
    return this.state[layer] === ASKED;
  }

  /** Whether the layer holds its tile's colour, which is what draws it. */
  held(layer: number): boolean {
    return this.state[layer] === HELD;
  }

  /** The tile has no colour: it keeps the palette. */
  none(layer: number): void {
    this.state[layer] = NONE;
  }

  queue(layer: number, image: ColourImage): void {
    if (image.width !== this.samples || image.height !== this.samples) {
      image.close();
      throw new Error(`a ${image.width} x ${image.height} colour image for ${this.samples}-sample layers`);
    }
    this.queued.get(layer)?.close();
    this.queued.set(layer, image);
    this.state[layer] = QUEUED;
  }

  /** Images waiting for the GPU. */
  get pending(): number {
    return this.queued.size;
  }

  /** Send up to `COLOUR_UPLOADS_PER_FRAME` queued images, then rebuild the mips. */
  flush(uploader: ColourUploader, budget = COLOUR_UPLOADS_PER_FRAME): void {
    this.lastUploads = 0;
    for (const [layer, image] of this.queued) {
      if (this.lastUploads >= budget) break;
      uploader.upload(layer, image);
      image.close();
      this.queued.delete(layer);
      this.state[layer] = HELD;
      this.lastUploads++;
    }
    if (this.lastUploads > 0) {
      uploader.mipmap();
      this.uploaded += this.lastUploads;
    }
  }
}

/** The uploader for a renderer: its context, through three's own texture state. */
export function rendererUploader(renderer: WebGLRenderer, texture: DataArrayTexture): ColourUploader {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const handle = (): WebGLTexture => {
    const props = () => renderer.properties.get(texture) as { __webglTexture?: WebGLTexture };
    if (!props().__webglTexture) renderer.initTexture(texture);
    return props().__webglTexture!;
  };
  const bind = (): void => {
    renderer.state.bindTexture(gl.TEXTURE_2D_ARRAY, handle());
  };
  return {
    upload(layer, image) {
      bind();
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      const { width, height } = image;
      if (image.source instanceof Uint8Array) {
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, width, height, 1, gl.RGBA, gl.UNSIGNED_BYTE, image.source);
      } else {
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, width, height, 1, gl.RGBA, gl.UNSIGNED_BYTE, image.source);
      }
    },
    mipmap() {
      bind();
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      renderer.state.unbindTexture();
    },
  };
}
