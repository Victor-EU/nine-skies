/**
 * What the cast is made of (D91). A figure never picks a material: it asks
 * its skin for one by role and colour, so the whole cast changes its
 * substance in one file. The first skin is the festival lantern, silk over a
 * bamboo frame lit from inside, chosen 26 September 2026 over ink and
 * lacquer: it glows in the evening scenes, and it reads as a made thing
 * over photographed ground rather than an animal in it.
 *
 * Materials are cached per role and colour, so a figure of a thousand parts
 * costs a dozen materials, and a skin swap touches every part through the
 * figure's own `setSkin`.
 */
import { Color, MeshBasicMaterial, MeshPhysicalMaterial, Vector2, type DataTexture, type Material } from "three";
import { scaleNormalTexture, silkRibTexture } from "./parts.js";

/** What a part is, so a skin can dress it: scales, silk, a horn, a mane, a cloud... */
export type Role = "scale" | "belly" | "silk" | "skin" | "horn" | "mane" | "cloud" | "flame" | "eye" | "iron" | "gold";

export interface Skin {
  readonly name: string;
  material(role: Role, colour: number): Material;
  dispose(): void;
}

export function lanternSkin(): Skin {
  const cache = new Map<string, Material>();
  let scales: DataTexture | null = null;
  let ribs: DataTexture | null = null;
  const scaleMap = () => (scales ??= scaleNormalTexture());
  const ribMap = () => (ribs ??= silkRibTexture());
  const glow = (colour: number, strength: number) => ({ emissive: new Color(colour).offsetHSL(0.02, 0.1, 0.1), emissiveIntensity: strength });
  const make = (role: Role, colour: number): Material => {
    switch (role) {
      case "scale":
        return new MeshPhysicalMaterial({ color: colour, map: ribMap(), ...glow(colour, 0.55), roughness: 0.8, transparent: true, opacity: 0.93, normalMap: scaleMap(), normalScale: new Vector2(0.35, 0.35) });
      case "belly":
      case "silk":
        return new MeshPhysicalMaterial({ color: colour, map: ribMap(), ...glow(colour, 0.5), roughness: 0.85, transparent: true, opacity: 0.93 });
      case "skin":
        return new MeshPhysicalMaterial({ color: colour, ...glow(colour, 0.3), roughness: 0.8 });
      case "horn":
      case "gold":
        return new MeshPhysicalMaterial({ color: colour, ...glow(colour, 0.35), roughness: 0.7, transparent: true, opacity: 0.95 });
      case "mane":
        return new MeshPhysicalMaterial({ color: colour, ...glow(colour, 0.6), roughness: 0.9, transparent: true, opacity: 0.85 });
      case "cloud":
        return new MeshPhysicalMaterial({ color: colour, emissive: new Color(0xffe0b0), emissiveIntensity: 0.55, roughness: 0.9, transparent: true, opacity: 0.92 });
      case "flame":
        return new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.85 });
      case "iron":
        return new MeshPhysicalMaterial({ color: colour, roughness: 0.5 });
      case "eye":
        return new MeshPhysicalMaterial({ color: colour, roughness: 0.1, clearcoat: 1 });
    }
  };
  return {
    name: "lantern",
    material(role, colour) {
      const key = `${role}:${colour}`;
      let m = cache.get(key);
      if (!m) {
        m = make(role, colour);
        cache.set(key, m);
      }
      return m;
    },
    dispose() {
      for (const m of cache.values()) m.dispose();
      cache.clear();
      scales?.dispose();
      ribs?.dispose();
    },
  };
}

/** The skins by name; the film's is the lantern. */
export const SKINS: Readonly<Record<string, () => Skin>> = { lantern: lanternSkin };
export const DEFAULT_SKIN = "lantern";
