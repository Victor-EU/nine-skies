/**
 * `npm run cover`: the cover, drawn by a headless Chrome from
 * tools/cover.html. Two images, at 1280 × 640 and twice that in pixels: the
 * sheet of nine cards, which the site serves as its own preview and the
 * README opens with, and the postcards, for a post. Needs Google Chrome; no
 * server.
 *
 * `npm run cover -- frames [scene[@seconds] ...]`: the cover's own frames,
 * for the scenes whose still does not hold up at a card's size (FRAMES), from
 * the running film (`npm run dev`) into docs/cover/, then `npm run cover`
 * again. Every other card is the film's own still, as signed off (D77); the
 * film's stills are not touched.
 *
 * Chrome's own --screenshot writes the file and then, on this Mac, does not
 * always exit, so the file is what is waited for, and Chrome is stopped.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { formatProblems, loadFilm } from "./film.ts";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL_ = process.env.NS_URL ?? "http://localhost:5173/";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Where on its own rail the cover takes a scene whose film still does not
 * hold up on a card: seconds of flight at the authored speed, and the height
 * over the ground where it is not the rail's own. `scene@seconds+metres` on
 * the command line tries another.
 */
const FRAMES: Record<string, { at: number; aboveGroundM?: number }> = {
  // The film's still is at 20 s, 150 m over the southern peaks, where the
  // granite's photograph, 5.7 m of cliff drawn 60 m to a face on the 30 m
  // grid (F92), shows its blocks. At 8 s the camera is still 800 m up on the
  // way in, the peaks ahead over the cloud, and a face is a few pixels.
  huangshan: { at: 8 },
  // The film's still is at 60 s, past Lhatse, with the range 60-90 km off.
  // The card is the scene's subject: at 136 s the camera is past Rongbuk,
  // over the glacier, with the north face ahead. A viewer reaches it at 1.2
  // times the authored speed. Drawn at the Wall's own exaggeration of three
  // it is a mountain; at the film's six it was a white needle (F97).
  "the-wall": { at: 136 },
};
/** Drawn at 1920 × 1080: a card is 666 pixels wide at twice the cover's size. */
const FRAME_W = 1920;
const FRAME_H = 1080;

/** A headless Chrome of its own, on whatever debugging port is free (see tools/stills.ts). */
async function withChrome<T>(args: string[], use: (profile: string) => Promise<T>): Promise<T> {
  const profile = mkdtempSync(join(tmpdir(), "nine-skies-cover-"));
  const chrome = spawn(
    CHROME,
    ["--headless=new", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", ...args],
    { stdio: "ignore" },
  );
  try {
    return await use(profile);
  } finally {
    chrome.kill("SIGKILL");
    await sleep(300);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

async function drawCover(): Promise<void> {
  const page = pathToFileURL(resolve("tools/cover.html")).href;
  const takes: [string, string][] = [
    ["", "app/public/cover.png"],
    ["#postcards", "docs/cover-postcards.png"],
  ];
  for (const [hash, out] of takes) {
    const file = resolve(out);
    rmSync(file, { force: true });
    const size = await withChrome(
      [
        "--hide-scrollbars",
        "--window-size=1280,640",
        "--force-device-scale-factor=2",
        "--virtual-time-budget=3000",
        `--screenshot=${file}`,
        page + hash,
      ],
      async () => {
        let size = 0;
        for (let waited = 0; waited < 60_000; waited += 250) {
          await sleep(250);
          if (!existsSync(file)) continue;
          const now = statSync(file).size;
          if (now > 0 && now === size) break; // written, and no longer growing
          size = now;
        }
        return size;
      },
    );
    if (size === 0) throw new Error(`chrome did not write ${out}`);
    console.log(`${out}: 2560 × 1280, ${(size / 1e6).toFixed(1)} MB`);
  }
}

async function drawFrames(wanted: string[]): Promise<void> {
  const { film, problems } = loadFilm();
  if (problems.length) throw new Error(formatProblems(problems));
  const takes = (wanted.length ? wanted : Object.keys(FRAMES)).map((w) => {
    const [id, spec] = w.split("@");
    const [at, above] = (spec ?? "").split("+");
    const i = film.scenes.findIndex((s) => s.id === id);
    const frame = spec === undefined ? FRAMES[id!] : { at: Number(at), aboveGroundM: above ? Number(above) : undefined };
    if (i < 0 || !frame || !Number.isFinite(frame.at)) {
      throw new Error(`${w}: give a scene of the film and seconds, or one of ${Object.keys(FRAMES).join(", ")}`);
    }
    return { i, id: id!, seconds: frame.at, aboveGroundM: frame.aboveGroundM ?? null };
  });
  mkdirSync("docs/cover", { recursive: true });

  await withChrome(["--remote-debugging-port=0", `--window-size=${FRAME_W},${FRAME_H}`, "about:blank"], async (profile) => {
    let socketUrl: string | undefined;
    for (let k = 0; k < 600 && !socketUrl; k++) {
      await sleep(200);
      try {
        const port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0];
        const targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
        socketUrl = targets.find((t) => t.type === "page")?.webSocketDebuggerUrl;
      } catch {
        // not listening yet
      }
    }
    if (!socketUrl) throw new Error(`Chrome did not open (${CHROME})`);
    const ws = new WebSocket(socketUrl);
    await new Promise((r) => ws.addEventListener("open", r));
    let id = 0;
    type Reply = { result?: { result?: { value?: unknown }; exceptionDetails?: { text: string } } };
    const waiting = new Map<number, (m: Reply) => void>();
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(String(e.data));
      waiting.get(m.id)?.(m);
      waiting.delete(m.id);
    });
    const send = (method: string, params: object = {}) =>
      new Promise<Reply>((done) => {
        waiting.set(++id, done);
        ws.send(JSON.stringify({ id, method, params }));
      });
    const run = async (expression: string): Promise<unknown> => {
      const m = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (m.result?.exceptionDetails) throw new Error(`${expression.slice(0, 80)}: ${m.result.exceptionDetails.text}`);
      return m.result?.result?.value;
    };
    await send("Emulation.setDeviceMetricsOverride", { width: FRAME_W, height: FRAME_H, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: URL_ });
    let ready = false;
    for (let k = 0; k < 300 && !ready; k++) {
      await sleep(200);
      ready = (await run("typeof window.__ns === 'object' && typeof window.__ns.hold === 'function'").catch(() => false)) === true;
    }
    if (!ready) throw new Error(`the film did not start at ${URL_}: is \`npm run dev\` running?`);
    for (const t of takes) {
      await run(`__ns.hold(${t.i}, ${t.seconds})`);
      // The held camera is placed at this height over the ground every frame, within the scene's band.
      if (t.aboveGroundM !== null) await run(`__ns.pinned().aboveGroundM = ${t.aboveGroundM}`);
      const settled = await run("__ns.settled()");
      // Drawn and read in one task, so the frame read is the one just drawn.
      const url = (await run("(__ns.rig.render(), document.getElementById('view').toDataURL('image/png'))")) as string;
      const png = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
      const out = `docs/cover/${t.id}.png`;
      writeFileSync(out, png);
      const height = t.aboveGroundM === null ? "" : `, ${t.aboveGroundM} m up`;
      console.log(`${out}: ${t.seconds} s${height}, ${FRAME_W} × ${FRAME_H}${settled ? "" : "  (the ground had not settled in 45 s)"}`);
    }
    ws.close();
  });
}

const [mode, ...rest] = process.argv.slice(2);
try {
  if (mode === "frames") await drawFrames(rest);
  else await drawCover();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
