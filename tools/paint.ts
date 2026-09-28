/**
 * `npm run paint -- <figure> [view] [options]`: the cast's paintings, drawn
 * by OpenAI's image model from the briefs in `content/paintings/`.
 *
 * A brief is one file per figure: what the figure is (`subject`) and how
 * each picture of it is posed (`views`), each view a pose, or a pose and
 * the picture's size when it is not the portrait default. `_style.yaml` wraps every one in
 * the house style, so a prompt is the style's preamble, the subject, the
 * view and the style's rules, in that order. `--dry` prints it and what it
 * would cost, and calls nothing.
 *
 * Pictures land in `.scratch/paint/<figure>/`, which git ignores; the ones
 * the film keeps are copied into the app by hand. Every call is written to
 * `docs/paint-ledger.jsonl` with what it cost, from the response's own
 * token counts, and a call that could take the ledger past the cap is
 * refused before it is sent.
 *
 * The key is `OPENAI_API_KEY`, or the first line of `.keys/openai`, which
 * git ignores. It is sent to api.openai.com and nowhere else, and never
 * printed.
 *
 * A set is a folder of briefs with its own `_style.yaml`: the cast's are
 * `content/paintings/`, the default; the sky's cloud maps (D95) are
 * `content/clouds/`, painted opaque, since a style may say `background:
 * opaque` where the cast's cards are transparent. A set's pictures land in
 * `.scratch/paint/<set>/<figure>/` and its ledger rows are `<set>/<figure>`.
 *
 * Options:
 *   --set <folder under content/>         default paintings
 *   --quality low|medium|high|xhigh|max   default high
 *   --n <1-8>                             pictures from one call, default 1
 *   --size <W>x<H>                        default the view's, else 1024x1536
 *   --model flare|sunburst                default flare; sunburst edits best
 *   --ref <png>                           repeatable: draw from these pictures
 *                                         (the edits endpoint), to keep a
 *                                         figure the same across its views
 *   --dry                                 print the prompt and the estimate only
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse } from "yaml";

/** The whole allowance for the cast's paintings, US dollars (27 September 2026). */
const CAP_USD = 30;

/** gpt-image-2.5's rates, dollars per token (developers.openai.com pricing, 27 September 2026). */
const RATE = { textIn: 5e-6, imageIn: 8e-6, imageOut: 30e-6 };

/** Image output tokens by quality at 1024x1536, from OpenAI's calculator; 1024x1024 costs about a quarter more. */
const OUT_TOKENS: Record<string, number> = { low: 158, medium: 343, high: 1372, xhigh: 2459, max: 5488 };

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, ".scratch/paint");
const LEDGER = join(ROOT, "docs/paint-ledger.jsonl");

interface Style {
  preamble: string;
  rules: string;
  /** What the picture is drawn on: the cast's cards are transparent, a map is opaque. */
  background?: "transparent" | "opaque";
}
type View = string | { pose: string; size?: string };
interface Brief {
  figure: string;
  subject: string;
  views: Record<string, View>;
}
interface Args {
  set: string;
  figure: string;
  view: string | null;
  quality: string;
  n: number;
  size: string | null;
  model: string;
  refs: string[];
  dry: boolean;
}

function fail(message: string): never {
  console.error(`paint: ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const a: Args = { set: "paintings", figure: "", view: null, quality: "high", n: 1, size: null, model: "flare", refs: [], dry: false };
  const free: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    const v = () => argv[++i] ?? fail(`${k} wants a value`);
    if (k === "--set") a.set = v();
    else if (k === "--quality") a.quality = v();
    else if (k === "--n") a.n = Number(v());
    else if (k === "--size") a.size = v();
    else if (k === "--model") a.model = v();
    else if (k === "--ref") a.refs.push(v());
    else if (k === "--dry") a.dry = true;
    else if (k.startsWith("--")) fail(`no option ${k}`);
    else free.push(k);
  }
  a.figure = free[0] ?? fail("which figure? e.g. npm run paint -- wukong scout --dry");
  a.view = free[1] ?? null;
  if (!(a.quality in OUT_TOKENS)) fail(`--quality is one of ${Object.keys(OUT_TOKENS).join(", ")}`);
  if (!Number.isInteger(a.n) || a.n < 1 || a.n > 8) fail("--n is 1 to 8");
  if (a.size !== null && !/^\d+x\d+$/.test(a.size)) fail("--size is WIDTHxHEIGHT");
  if (a.model !== "flare" && a.model !== "sunburst") fail("--model is flare or sunburst");
  for (const r of a.refs) if (!existsSync(r)) fail(`no picture at ${r}`);
  if (!/^[a-z][a-z0-9-]*$/.test(a.set)) fail("--set is a folder name under content/");
  return a;
}

function load<T>(file: string): T {
  if (!existsSync(file)) fail(`no brief at ${file}`);
  return parse(readFileSync(file, "utf8")) as T;
}

function viewOf(brief: Brief, view: string): { pose: string; size: string } {
  const v = brief.views[view] ?? fail(`${brief.figure} has no view ${view}; it has ${Object.keys(brief.views).join(", ")}`);
  return typeof v === "string" ? { pose: v, size: "1024x1536" } : { pose: v.pose, size: v.size ?? "1024x1536" };
}

/** The prompt: the house preamble, the figure, the pose, the house rules. */
function promptFor(style: Style, brief: Brief, pose: string): string {
  return [style.preamble, brief.subject, pose, style.rules].map((s) => s.trim()).join("\n\n");
}

function estimateUsd(a: Args & { size: string }, prompt: string): number {
  const [w, h] = a.size.split("x").map(Number) as [number, number];
  const area = (w * h) / (1024 * 1536);
  const out = OUT_TOKENS[a.quality]! * Math.max(1, area) * 1.3 * a.n;
  const textIn = prompt.length / 3;
  const imageIn = a.refs.length * 3000;
  return out * RATE.imageOut + textIn * RATE.textIn + imageIn * RATE.imageIn;
}

interface LedgerRow {
  at: string;
  figure: string;
  view: string;
  model: string;
  quality: string;
  size: string;
  n: number;
  refs: number;
  usd: number;
  files: string[];
}

function spentUsd(): number {
  if (!existsSync(LEDGER)) return 0;
  return readFileSync(LEDGER, "utf8")
    .split("\n")
    .filter(Boolean)
    .reduce((sum, line) => sum + (JSON.parse(line) as LedgerRow).usd, 0);
}

function key(): string {
  const env = process.env.OPENAI_API_KEY?.trim();
  if (env) return env;
  const file = join(ROOT, ".keys/openai");
  if (existsSync(file)) {
    const k = readFileSync(file, "utf8").split("\n")[0]!.trim();
    if (k) return k;
  }
  return fail("no key: put an OpenAI key on the first line of .keys/openai (git ignores it), or set OPENAI_API_KEY");
}

interface ImageResponse {
  data?: { b64_json?: string; revised_prompt?: string }[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { text_tokens?: number; image_tokens?: number };
  };
  error?: { message?: string };
}

async function call(a: Args & { size: string }, prompt: string, background: string): Promise<ImageResponse> {
  const model = `gpt-image-2.5-${a.model}`;
  const headers = { Authorization: `Bearer ${key()}` };
  const common = { model, prompt, n: a.n, size: a.size, quality: a.quality, background, output_format: "png" };
  let res: Response;
  if (a.refs.length === 0) {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(common),
      signal: AbortSignal.timeout(10 * 60_000),
    });
  } else {
    const form = new FormData();
    for (const [k, v] of Object.entries(common)) form.append(k, String(v));
    for (const r of a.refs) form.append("image[]", new Blob([readFileSync(r)], { type: "image/png" }), basename(r));
    res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers,
      body: form,
      signal: AbortSignal.timeout(10 * 60_000),
    });
  }
  const body = (await res.json()) as ImageResponse;
  if (!res.ok) fail(`OpenAI answered ${res.status}: ${body.error?.message ?? JSON.stringify(body).slice(0, 400)}`);
  return body;
}

function costUsd(r: ImageResponse, fallback: number): number {
  const u = r.usage;
  if (!u?.output_tokens) return fallback;
  const text = u.input_tokens_details?.text_tokens ?? u.input_tokens ?? 0;
  const image = u.input_tokens_details?.image_tokens ?? 0;
  return text * RATE.textIn + image * RATE.imageIn + u.output_tokens * RATE.imageOut;
}

const args = parseArgs(process.argv.slice(2));
const briefs = join(ROOT, "content", args.set);
const style = load<Style>(join(briefs, "_style.yaml"));
const brief = load<Brief>(join(briefs, `${args.figure}.yaml`));
const named = args.set === "paintings" ? args.figure : `${args.set}/${args.figure}`;
const view = args.view ?? Object.keys(brief.views)[0] ?? fail(`${args.figure} has no views`);
const posed = viewOf(brief, view);
const a = { ...args, size: args.size ?? posed.size };
const prompt = promptFor(style, brief, posed.pose);
const estimate = estimateUsd(a, prompt);
const spent = spentUsd();

console.log(prompt);
console.log(
  `\n${named}/${view} · gpt-image-2.5-${a.model} · ${a.quality} · ${a.size} · ${a.n} picture(s)` +
    `${a.refs.length ? ` from ${a.refs.length} reference(s)` : ""} · about $${estimate.toFixed(2)}` +
    ` · spent $${spent.toFixed(2)} of $${CAP_USD}`,
);
if (a.dry) process.exit(0);
if (spent + estimate > CAP_USD) fail(`this could take the spend past the $${CAP_USD} cap; refused`);

const started = Date.now();
const r = await call(a, prompt, style.background ?? "transparent");
const dir = join(OUT, named);
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const files: string[] = [];
(r.data ?? []).forEach((d, i) => {
  if (!d.b64_json) return;
  const file = join(dir, `${view}-${stamp}-${a.quality}-${i + 1}.png`);
  writeFileSync(file, Buffer.from(d.b64_json, "base64"));
  files.push(file.slice(ROOT.length + 1));
});
const usd = costUsd(r, estimate);
const row: LedgerRow = {
  at: new Date().toISOString(),
  figure: named,
  view,
  model: a.model,
  quality: a.quality,
  size: a.size,
  n: a.n,
  refs: a.refs.length,
  usd: Math.round(usd * 1e5) / 1e5,
  files,
};
appendFileSync(LEDGER, JSON.stringify(row) + "\n");
console.log(`\n${files.length} picture(s) in ${((Date.now() - started) / 1000).toFixed(0)} s, $${usd.toFixed(3)}; spent $${(spent + usd).toFixed(2)} of $${CAP_USD}`);
for (const f of files) console.log(`  ${f}`);
