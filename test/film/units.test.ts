/** Figures in the film's text carry imperial beside metric, as precisely as the metric is written. */
import { describe, expect, it } from "vitest";
import { bareFigures, figuresAsWords, showFigure, showUnits } from "../../content/units.ts";

describe("figures in two systems", () => {
  it("gives heights in feet, distances in miles and heat in Fahrenheit", () => {
    expect(showFigure("8,849", "m")).toBe("8,849 m (29,032 ft)");
    expect(showFigure("4718", "m")).toBe("4,718 m (15,479 ft)");
    expect(showFigure("190", "km")).toBe("190 km (120 mi)");
    expect(showFigure("47", "°C")).toBe("47 °C (117 °F)");
    expect(showFigure("-154", "m")).toBe("-154 m (-505 ft)");
  });

  it("converts an exact figure exactly, and keeps a round one round, never coarser than two figures", () => {
    expect(showFigure("1800", "m")).toBe("1,800 m (5,900 ft)");
    expect(showFigure("3000", "m")).toBe("3,000 m (9,800 ft)");
    expect(showFigure("113", "m")).toBe("113 m (371 ft)");
    expect(showFigure("1000", "km")).toBe("1,000 km (620 mi)");
  });

  it("shows every marked figure in a line, and finds the ones left unmarked", () => {
    expect(showUnits("The peaks stand at {1800 m}; the cloud lies at {1200 m}.")).toBe(
      "The peaks stand at 1,800 m (5,900 ft); the cloud lies at 1,200 m (3,900 ft).",
    );
    expect(bareFigures("Everest, {8849 m}, and 4,718 metres, 20 km and 47 °C.")).toEqual(["4,718 metres", "20 km", "47 °C"]);
    expect(bareFigures("Rising four millimetres a year, in 2026.")).toEqual([]);
  });

  it("counts a figure and its conversion as one word", () => {
    const shown = showUnits("Tiger Leaping Gorge: {360 m} wide, {3000 m} deep.");
    expect(figuresAsWords(shown)).toBe("Tiger Leaping Gorge: # wide, # deep.");
  });
});
