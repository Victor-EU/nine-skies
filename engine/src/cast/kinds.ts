/**
 * The figures the cast can name (D91). A scene file says `figure: dragon`;
 * this list is what the content gate holds that name to, so the gate needs
 * no geometry code and runs where the film's other checks run. Every kind
 * here has a builder in `figures/`, and the cast tests hold the two lists
 * to each other.
 */
export const FIGURE_KINDS = [
  "dragon",
  "nezha",
  "wukong",
  "pilgrims",
  "xiwangmu",
  "cranes",
  "qilin",
  "phoenix",
  "tiger",
  "turtle",
  "magpie",
  "peng",
  "yaoji",
  "jingwei",
  "carp",
  "niumowang",
  "baxian",
  "elephant",
  "egrets",
  "sanduo",
  "guanyin",
  "lungta",
  "miyolangsangma",
  "laozi",
] as const;

export type FigureKind = (typeof FIGURE_KINDS)[number];

export function isFigureKind(name: string): name is FigureKind {
  return (FIGURE_KINDS as readonly string[]).includes(name);
}

/**
 * The figures of living faiths drawn without a body (decided 27 September
 * 2026): the Naxi god of the snow mountain, the Tibetan wind horse, the
 * goddess of Chomolungma. The film draws none of them as a body: each is
 * its mount, its standard or the thing its faith itself makes, the way
 * early Buddhist art showed the Buddha by an empty seat, a wheel or a pair
 * of footprints. The cast tests hold each to it: no part of theirs is
 * skin. Guanyin was drawn by her empty seat too, until the user asked for
 * her in her body, as the novel and the temples show her, and Laozi in
 * his, as the painters show him leaving the pass (D97, 29 September 2026).
 */
export const LIVING_FAITHS: readonly FigureKind[] = ["sanduo", "lungta", "miyolangsangma"];
