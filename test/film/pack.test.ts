/** A scene pack carries its files unchanged and refuses to be read as anything else. */
import { describe, expect, it } from "vitest";
import { readPack, writePack } from "../../engine/src/film/pack.js";

const bytes = (...v: number[]) => new Uint8Array(v);

describe("a scene pack", () => {
  it("gives back every file byte for byte, and the hero after them", () => {
    const packed = writePack(
      "karst",
      "abc",
      [
        { name: "00aa", bytes: bytes(1, 2, 3) },
        { name: "00bb", bytes: bytes(4) },
      ],
      { dir: "hero-30m", area: "guilin", heights: bytes(9, 9), water: bytes(7) },
    );
    const pack = readPack(packed);
    expect(pack.header.scene).toBe("karst");
    expect(pack.header.heightsSha256).toBe("abc");
    expect(pack.header.files.map((e) => [e.name, [...pack.file(e)]])).toEqual([
      ["00aa", [1, 2, 3]],
      ["00bb", [4]],
    ]);
    const hero = pack.header.hero!;
    expect([hero.dir, hero.area, [...pack.file(hero.heights)], [...pack.file(hero.water!)]]).toEqual(["hero-30m", "guilin", [9, 9], [7]]);
  });

  it("carries a scene without a hero", () => {
    const pack = readPack(writePack("loess", "abc", [{ name: "00aa", bytes: bytes(5) }], null));
    expect(pack.header.hero).toBeNull();
  });

  it("refuses what is not a pack, and a pack cut short", () => {
    expect(() => readPack(bytes(1, 2, 3, 4, 5, 6, 7, 8))).toThrow(/not a scene pack/);
    const whole = writePack("loess", "abc", [{ name: "00aa", bytes: bytes(5, 6, 7) }], null);
    expect(() => readPack(whole.subarray(0, whole.length - 1))).toThrow(/runs past the end/);
  });
});
