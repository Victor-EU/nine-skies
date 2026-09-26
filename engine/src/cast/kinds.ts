/**
 * The figures the cast can name (D91). A scene file says `figure: dragon`;
 * this list is what the content gate holds that name to, so the gate needs
 * no geometry code and runs where the film's other checks run. Every kind
 * here has a builder in `figures/`, and the cast tests hold the two lists
 * to each other.
 */
export const FIGURE_KINDS = ["dragon"] as const;

export type FigureKind = (typeof FIGURE_KINDS)[number];

export function isFigureKind(name: string): name is FigureKind {
  return (FIGURE_KINDS as readonly string[]).includes(name);
}
