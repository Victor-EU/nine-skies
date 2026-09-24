/**
 * `npm run stills [scene ...]`: the stills (D77), taken by a headless Chrome
 * from the running dev server, for when no browser window can be kept in
 * front.
 *
 * A still is one frame drawn after the scene is held, and a tab that is
 * hidden or in the background draws no frames in between: its terrain
 * lands but its sky is never brought to the scene's hour, and the still
 * comes out grey (F87, F89). A headless Chrome's page is visible and draws
 * at full rate on the machine's own GPU; its stills match a front window's
 * to about a level in 255. Needs `npm run dev` and Google Chrome.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatProblems, loadFilm } from "./film.ts";

/** Seconds into its flight each still is held at, where it is not sixty. */
const HELD_AT_S: Record<string, number> = { huangshan: 20, "grassland-to-heaven-lake": 108 };
const URL_ = process.env.NS_URL ?? "http://localhost:5173/";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;

const { film, problems } = loadFilm();
if (problems.length) {
  console.error(formatProblems(problems));
  process.exit(1);
}
const wanted = process.argv.slice(2);
const takes = film.scenes
  .map((s, i) => ({ i, id: s.id, name: `${String(i + 1).padStart(2, "0")}-${s.id}`, at: HELD_AT_S[s.id] ?? 60 }))
  .filter((t) => wanted.length === 0 || wanted.includes(t.id));
if (takes.length === 0) {
  console.error(`no scene ${wanted.join(", ")}; the film's are ${film.scenes.map((s) => s.id).join(", ")}`);
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), "nine-skies-stills-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--window-size=1280,720",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

try {
  let socketUrl: string | undefined;
  for (let k = 0; k < 50 && !socketUrl; k++) {
    await sleep(200);
    try {
      const targets = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
      socketUrl = targets.find((t) => t.type === "page")?.webSocketDebuggerUrl;
    } catch {
      // not listening yet
    }
  }
  if (!socketUrl) throw new Error(`Chrome did not open (${CHROME})`);
  const ws = new WebSocket(socketUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const waiting = new Map<number, (m: { result?: { result?: { value?: unknown }; exceptionDetails?: { text: string } } }) => void>();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(String(e.data));
    waiting.get(m.id)?.(m);
    waiting.delete(m.id);
  });
  const send = (method: string, params: object = {}) =>
    new Promise<Parameters<NonNullable<ReturnType<typeof waiting.get>>>[0]>((resolve) => {
      waiting.set(++id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const run = async (expression: string): Promise<unknown> => {
    const m = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (m.result?.exceptionDetails) throw new Error(`${expression}: ${m.result.exceptionDetails.text}`);
    return m.result?.result?.value;
  };
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL_ });
  let ready = false;
  for (let k = 0; k < 300 && !ready; k++) {
    await sleep(200);
    ready = (await run("typeof window.__ns === 'object' && typeof window.__ns.hold === 'function'").catch(() => false)) === true;
  }
  if (!ready) throw new Error(`the film did not start at ${URL_}: is \`npm run dev\` running?`);
  for (const t of takes) {
    await run(`__ns.hold(${t.i}, ${t.at})`);
    const settled = await run("__ns.settled()");
    const saved = await run(`__ns.still(${JSON.stringify(t.name)}, 1280, 720)`);
    console.log(`${saved}${settled ? "" : "  (the ground had not settled in 45 s)"}`);
  }
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
