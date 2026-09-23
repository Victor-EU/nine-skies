/**
 * Stage 5's credits criterion: the page renders the notices verbatim from
 * NOTICE.md. The two Copernicus notices and the EOX mosaic's credit are
 * what redistribution requires, so they are checked word for word in the
 * page's text.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { QUESTION, markdownToHtml, renderCredits } from "../../content/credits.ts";

const notice = readFileSync("NOTICE.md", "utf8");
const text = (html: string) =>
  html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ");

/** The file's quoted notices, each joined into one line as a reader sees it. */
const quoted = notice
  .split(/\n\s*\n/)
  .filter((b) => b.trim().startsWith(">"))
  .map((b) => b.split("\n").map((l) => l.replace(/^>\s?/, "").trim()).join(" "));

describe("the credits page", () => {
  const page = text(renderCredits(notice, { cues: [], wind: null }));

  it("carries both Copernicus notices and the mosaic's credit word for word", () => {
    expect(quoted).toHaveLength(3);
    expect(quoted[0]).toMatch(/^produced using Copernicus WorldDEM-30 © DLR/);
    expect(quoted[2]).toMatch(/^EOxCloudless https:\/\/cloudless\.eox\.at by EOX IT Services GmbH \(Contains modified Copernicus Sentinel data 2016\)/);
    for (const q of quoted) expect(page).toContain(q);
  });

  it("carries every paragraph of the notices file, and asks the question", () => {
    for (const block of notice.split(/\n\s*\n/).slice(1)) {
      const words = block.replace(/^#+\s+/, "").replace(/^>\s?/gm, "").replace(/[`*<>]/g, "").replace(/\s+/g, " ").trim();
      expect(page.replace(/[`*<>]/g, "")).toContain(words.slice(0, 60));
    }
    expect(page).toContain(QUESTION);
  });

  it("credits each piece of sound with its licence and source", () => {
    const one = { file: "a.m4a", title: "River", author: "Someone", licence: "CC BY 4.0", source: "https://example.org/river" };
    const html = renderCredits(notice, { cues: [{ ...one, cue: "cue-02" }], wind: { ...one, title: "Wind" } }, new Map([["cue-02", "The Three Gorges"]]));
    expect(text(html)).toContain("The Three Gorges: River by Someone, CC BY 4.0, https://example.org/river");
    expect(text(html)).toContain("Wind: Wind by Someone");
  });

  it("escapes what it renders", () => {
    expect(markdownToHtml("a <b> & `c<d>`")).toBe("<p>a &lt;b&gt; &amp; <code>c&lt;d&gt;</code></p>");
    expect(markdownToHtml("<https://x.org/a>")).toBe('<p><a href="https://x.org/a">https://x.org/a</a></p>');
  });
});
