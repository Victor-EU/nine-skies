/**
 * The HUD's markup against the list that says who each block belongs to.
 *
 * F46 put the prototype's instrumentation behind `O` by nesting it in a
 * `<div hidden>`, and nested in there with it were the map overlay and the
 * narration beat. Both are the player's. With the operator column off, `M`
 * set `#map.hidden = false` and `drawMap` ran every frame into an element
 * that `checkVisibility()` reported as not rendered and that measured 0 x 0 -
 * a 522,000 px2 panel at 1280 x 800 when it was on screen, which is half the
 * screen and larger on its own than the column the key exists to hide. The
 * beat took all four of the things the game says over Expedition 1 with it.
 *
 * Nothing caught that, because "who owns this block" was expressed as where
 * it sits in the document. These tests hold it to a list instead (F47).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OPERATOR_BLOCKS, PLAYER_IDS } from "../../app/src/hudBlocks.js";

const HTML = readFileSync(new URL("../../app/index.html", import.meta.url), "utf8");
const MAIN = readFileSync(new URL("../../app/src/main.ts", import.meta.url), "utf8");

/** Elements that never have a closing tag, so they never open a scope. */
const VOID = new Set(["meta", "link", "br", "img", "input", "hr", "source"]);

interface Element {
  readonly id: string;
  readonly classes: readonly string[];
  /** Ids of every element this one sits inside, outermost first. */
  readonly ancestors: readonly string[];
}

/**
 * Every element in the document that carries an id, with its ancestry.
 *
 * A real parser would be better and there is not one in this suite - the
 * tests run in node, not in a DOM. What this needs is narrow enough to do by
 * hand: nesting, ids and classes, and no scripting.
 */
function parse(html: string): Element[] {
  const found: Element[] = [];
  const stack: { tag: string; id: string }[] = [];
  const token = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  for (let m = token.exec(html); m; m = token.exec(html)) {
    const [whole, closing, opening, attrs = ""] = m;
    if (whole.startsWith("<!--")) continue;
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]!.tag === closing.toLowerCase()) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const tag = opening!.toLowerCase();
    const id = /\bid\s*=\s*"([^"]*)"/.exec(attrs)?.[1] ?? "";
    const classes = (/\bclass\s*=\s*"([^"]*)"/.exec(attrs)?.[1] ?? "").split(/\s+/).filter(Boolean);
    if (id) {
      found.push({
        id,
        classes,
        ancestors: stack.map((s) => s.id).filter(Boolean),
      });
    }
    if (!VOID.has(tag) && !attrs.trimEnd().endsWith("/")) stack.push({ tag, id });
  }
  return found;
}

const elements = parse(HTML);
const byId = new Map(elements.map((e) => [e.id, e]));

describe("the HUD's markup", () => {
  it("parses into the elements the app addresses by id", () => {
    // A sanity check on the scanner above rather than on the HUD: if this
    // fails, every other test here is measuring the parser.
    expect(byId.has("hud")).toBe(true);
    expect(byId.get("alt")?.ancestors).toContain("readouts");
    expect(byId.get("mapCanvas")?.ancestors).toContain("map");
  });

  it("has every id the two lists name", () => {
    for (const id of [...OPERATOR_BLOCKS, ...PLAYER_IDS]) {
      expect(byId.has(id), `#${id} is declared but not in index.html`).toBe(true);
    }
  });

  it("keeps nothing of the player's inside a block that O hides", () => {
    // This is the F46 bug, stated: #map and #beat were inside #operator.
    for (const id of PLAYER_IDS) {
      const inside = byId.get(id)!.ancestors.filter((a) =>
        (OPERATOR_BLOCKS as readonly string[]).includes(a),
      );
      expect(inside, `#${id} is inside ${inside.join(", ")}, which O hides`).toEqual([]);
    }
  });

  it("classifies every block on the HUD as one or the other", () => {
    // A block added tomorrow and left off both lists fails here rather than
    // being silently on screen forever, or silently never.
    const blocks = elements.filter(
      (e) => e.classes.includes("block") || e.classes.includes("map"),
    );
    expect(blocks.length).toBeGreaterThan(4);
    for (const block of blocks) {
      const player = (PLAYER_IDS as readonly string[]).includes(block.id);
      const operator = (OPERATOR_BLOCKS as readonly string[]).includes(block.id);
      expect(
        [player, operator],
        `#${block.id || "(no id)"} is on ${player && operator ? "both lists" : "neither list"}`,
      ).toEqual(player ? [true, false] : [false, true]);
    }
  });

  it("gives the operator exactly the two blocks that were measured", () => {
    // F46 measured the debug column and the generated help block. The key is
    // justified by that measurement and by nothing else, so the list it
    // toggles is the list that was measured.
    expect([...OPERATOR_BLOCKS].sort()).toEqual(["debug", "help"]);
  });
});

describe("what main.ts asks the document for", () => {
  it("names only ids the document has", () => {
    // `el` ends in a non-null assertion, so a renamed id is not a type error
    // and not a runtime error either until the frame that writes to it.
    const asked = new Set(
      [...MAIN.matchAll(/\bel\("([^"]+)"\)/g)].map((m) => m[1]!),
    );
    expect(asked.size).toBeGreaterThan(20);
    const missing = [...asked].filter((id) => !byId.has(id));
    expect(missing).toEqual([]);
  });

  it("writes the clock to the HUD and the sun to the map", () => {
    // The GDD: "The clock shows Beijing time, which is the point; the map
    // overlay adds local solar time beside it." Two places, and the HUD's
    // line is the one that must not also answer the question.
    const clockLine = /el\("clock"\)\.textContent = ([^;]+);/.exec(MAIN)?.[1] ?? "";
    expect(clockLine).toContain("minutesAt");
    expect(clockLine).not.toContain("solarMinutesAt");
    expect(MAIN).toContain("caption:");
    const caption = MAIN.slice(MAIN.indexOf("caption:"));
    expect(caption.slice(0, 400)).toContain("solarMinutesAt");
  });
});
