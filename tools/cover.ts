/**
 * `npm run cover`: the cover, drawn by a headless Chrome from
 * tools/cover.html over the stills in docs/stills/. Two images, at
 * 1280 × 640 and twice that in pixels: the sheet of nine cards, which the
 * site serves as its own preview and the README opens with, and the
 * postcards, for a post. Needs the stills and Google Chrome; no server.
 *
 * Chrome's own --screenshot writes the file and then, on this Mac, does not
 * always exit, so the file is what is waited for, and Chrome is stopped.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const page = pathToFileURL(resolve("tools/cover.html")).href;
const takes: [string, string][] = [
  ["", "app/public/cover.png"],
  ["#postcards", "docs/cover-postcards.png"],
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (const [hash, out] of takes) {
  const file = resolve(out);
  rmSync(file, { force: true });
  const profile = mkdtempSync(join(tmpdir(), "nine-skies-cover-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--window-size=1280,640",
      "--force-device-scale-factor=2",
      "--virtual-time-budget=3000",
      `--screenshot=${file}`,
      page + hash,
    ],
    { stdio: "ignore" },
  );
  let size = 0;
  for (let waited = 0; waited < 60_000; waited += 250) {
    await sleep(250);
    if (!existsSync(file)) continue;
    const now = statSync(file).size;
    if (now > 0 && now === size) break; // written, and no longer growing
    size = now;
  }
  chrome.kill("SIGKILL");
  rmSync(profile, { recursive: true, force: true });
  if (size === 0) {
    console.error(`chrome did not write ${out}`);
    process.exit(1);
  }
  console.log(`${out}: 2560 × 1280, ${(size / 1e6).toFixed(1)} MB`);
}
