/**
 * Figures in the film's text, in metric and in the units an American reader
 * measures in: heights in feet, distances in miles, heat in Fahrenheit. The
 * scene files mark each figure - `{1800 m}`, `{190 km}`, `{47 °C}` - and it
 * is shown as "1,800 m (5,900 ft)". The imperial figure is as precise as
 * the metric one: 8,849 m is 29,032 ft, and "about 1,800" is about 5,900.
 */

const TOKEN = /\{\s*(-?[\d,]+(?:\.\d+)?)\s*(m|km|°C)\s*\}/g;
/** A metric figure written without its braces: the reader in feet would get nothing. */
const BARE = /\d[\d,]*(?:\.\d+)?\s*(?:metres|meters|kilometres|kilometers|km|m|°C)(?![\w(])/;
/** A figure as shown, which the word count reads as one word. */
const SHOWN = /-?[\d,]+(?:\.\d+)? (?:m|km|°C) \(-?[\d,]+(?:\.\d+)? (?:ft|mi|°F)\)/g;

const M_TO_FT = 1 / 0.3048;
const KM_TO_MI = 1 / 1.609344;

function significant(digits: string): number {
  const d = digits.replace(/[-,.]/g, "").replace(/^0+/, "");
  const trimmed = digits.includes(".") ? d : d.replace(/0+$/, "");
  return Math.max(1, trimmed.length);
}

function round(value: number, sig: number): number {
  if (value === 0) return 0;
  const p = 10 ** (Math.floor(Math.log10(Math.abs(value))) + 1 - sig);
  return Math.round(value / p) * p;
}

const format = (n: number): string => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

/** One figure as shown: the metric as written, then its imperial. */
export function showFigure(written: string, unit: "m" | "km" | "°C"): string {
  const value = Number(written.replace(/,/g, ""));
  const metric = `${format(value)} ${unit}`;
  if (unit === "°C") return `${metric} (${format(Math.round(value * 1.8 + 32))} °F)`;
  const converted = value * (unit === "m" ? M_TO_FT : KM_TO_MI);
  // A figure written to the unit (8,849) is exact and converts to the whole
  // foot; a round one (1,800) is about that much and keeps its precision,
  // never coarser than two figures.
  const exact = /[1-9]$/.test(written.split(".")[0]!) || written.includes(".");
  const shown = exact ? Math.round(converted) : round(converted, Math.max(2, significant(written)));
  return `${metric} (${format(shown)} ${unit === "m" ? "ft" : "mi"})`;
}

/** Text with every marked figure shown in both units. */
export function showUnits(text: string): string {
  return text.replace(TOKEN, (_m, n: string, unit: "m" | "km" | "°C") => showFigure(n, unit));
}

/** Metric figures written without their braces, which the gate refuses. */
export function bareFigures(text: string): string[] {
  const withoutTokens = text.replace(TOKEN, " ");
  const out: string[] = [];
  const re = new RegExp(BARE.source, "g");
  for (const m of withoutTokens.matchAll(re)) out.push(m[0]);
  return out;
}

/** The text as the word count reads it: a figure and its conversion are one word. */
export function figuresAsWords(shown: string): string {
  return shown.replace(SHOWN, "#");
}
