/**
 * The credits page (plan v2, stage 5): the question the project asks, the
 * notices `NOTICE.md` carries, rendered from it rather than retyped, and
 * the sound's credits from `content/sound.yaml`. Built into
 * `app/credits.html` at build time and in dev; `test/film/credits.test.ts`
 * holds it to the notices word for word.
 */
import type { Sound, SoundCredit } from "./sound.ts";

/** The question, as the design document asks it. */
export const QUESTION =
  "Can eighteen minutes over real ground give someone who has never been to China a true picture of what it looks like?";

/** Where answers go once the repository is public (stage 6); null until then. */
export const DISCUSSIONS_URL: string | null = null;

const escape = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Inline Markdown: `code`, *emphasis*, **strong**, <autolinks> and [links](url). */
function inline(text: string): string {
  const parts: string[] = [];
  const pattern = /`([^`]+)`|<(https?:\/\/[^>\s]+)>|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    parts.push(escape(text.slice(last, m.index)));
    if (m[1] !== undefined) parts.push(`<code>${escape(m[1])}</code>`);
    else if (m[2] !== undefined) parts.push(`<a href="${escape(m[2])}">${escape(m[2])}</a>`);
    else if (m[3] !== undefined) parts.push(`<a href="${escape(m[4]!)}">${escape(m[3])}</a>`);
    else if (m[5] !== undefined) parts.push(`<strong>${escape(m[5])}</strong>`);
    else parts.push(`<em>${escape(m[6]!)}</em>`);
    last = m.index + m[0].length;
  }
  parts.push(escape(text.slice(last)));
  return parts.join("");
}

/**
 * The Markdown `NOTICE.md` is written in: headings, paragraphs, block
 * quotes and bullet lists, each a run of lines up to a blank one.
 */
export function markdownToHtml(md: string): string {
  const out: string[] = [];
  const blocks = md.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;
    const heading = /^(#{1,3})\s+(.*)$/.exec(lines[0]!);
    if (heading && lines.length === 1) {
      // The page has its own h1; the file's headings sit one level under it.
      const level = Math.min(heading[1]!.length + 1, 4);
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
    } else if (lines.every((l) => l.startsWith(">"))) {
      out.push(`<blockquote><p>${inline(lines.map((l) => l.replace(/^>\s?/, "")).join(" "))}</p></blockquote>`);
    } else if (lines.every((l) => /^\s*[-*]\s/.test(l) || /^\s{2,}\S/.test(l))) {
      const items: string[] = [];
      for (const l of lines) {
        if (/^\s*[-*]\s/.test(l)) items.push(l.replace(/^\s*[-*]\s/, ""));
        else items[items.length - 1] += ` ${l.trim()}`;
      }
      out.push(`<ul>${items.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`);
    } else {
      out.push(`<p>${inline(lines.map((l) => l.trim()).join(" "))}</p>`);
    }
  }
  return out.join("\n");
}

function creditLine(role: string, c: SoundCredit): string {
  return (
    `<li><strong>${escape(role)}</strong>: <em>${escape(c.title)}</em> by ${escape(c.author)}, ` +
    `${escape(c.licence)}, <a href="${escape(c.source)}">${escape(c.source)}</a></li>`
  );
}

/** The page's body: the question, the sound, then the notices whole. */
export function renderCredits(notice: string, sound: Sound, sceneTitles: ReadonlyMap<string, string> = new Map()): string {
  const answer = DISCUSSIONS_URL
    ? `<p>The answer is collected in public: <a href="${escape(DISCUSSIONS_URL)}">tell us yours</a>.</p>`
    : "<p>The answer is collected in public, in the project's repository, after launch.</p>";
  const cues = sound.cues.map((c) => creditLine(sceneTitles.get(c.cue) ?? c.cue, c));
  if (sound.wind) cues.push(creditLine("Wind", sound.wind));
  const music = cues.length > 0 ? `<ul>${cues.join("")}</ul>` : "<p>No sound is licensed yet.</p>";
  // The file's own first heading is the page's title, which the page already has.
  const body = notice.replace(/^#\s+Notices\s*\n/, "");
  return [
    `<section class="question"><h2>The question</h2><p class="ask"><em>${escape(QUESTION)}</em></p>${answer}</section>`,
    `<section class="sound"><h2>Sound credits</h2>${music}</section>`,
    `<section class="notices"><h2>Sources and notices</h2>${markdownToHtml(body)}</section>`,
  ].join("\n");
}
