/**
 * `npm run host-packs [-- --url]`: the scene packs to the Telbase project's
 * storage bucket (Cloudflare R2), for a host that will not take them
 * (Telbase caps a deploy at 100 MB and Vercel a file at 100 MB; the packs
 * are a gigabyte, the largest 239 MB). The bucket is private: the site
 * fetches each pack through its one function, `/api/pack`
 * (`tools/telbase/api/pack.mjs`), which sends the request on to R2 with a
 * link signed for it. The site is built with `VITE_PACKS_URL` set to that
 * function and carries everything but the packs (`make telbase`).
 *
 * The packs go under a folder named for the pack index they were cut for,
 * so each set is written once and kept for good: packs cut again land in a
 * new folder, and a site built for the old index still finds the old ones.
 * A pack already there at its size is not sent again.
 *
 * The bucket's keys come from the Telbase CLI, for the project the
 * repository is linked to (`.telbase/`, written by the first deploy, whose
 * one service is `dist-site/`), each time this runs: `npx telbase`, or the
 * CLI `TELBASE` names. They are never written down or printed: the secret
 * goes to curl on its standard input and to R2 as a signature.
 *
 * `--url` prints the base to build with, and needs no keys.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const INDEX = join(ROOT, "app/public/packs/index.json");
const PACKS = join(ROOT, "dist-film");
/** The Telbase CLI: `npx telbase`, or the one `TELBASE` names. */
const TELBASE = process.env.TELBASE ? [process.env.TELBASE] : ["npx", "--yes", "telbase"];
/** The site's function that signs a pack's link (`tools/telbase/api/pack.mjs`). */
const FUNCTION = "/api/pack?key=";

function fail(message: string): never {
  console.error(`host-packs: ${message}`);
  process.exit(1);
}

interface Keys {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly endpoint: string;
  readonly bucketName: string;
}

/** The bucket's keys from the Telbase CLI, wherever in its answer they are. */
function readKeys(): Keys {
  if (!existsSync(join(ROOT, ".telbase"))) fail("the repository is not linked to a Telbase project yet: `make telbase` deploys it first");
  const [cli, ...pre] = TELBASE;
  const got = spawnSync(cli!, [...pre, "storage", "credentials", "--show", "--json"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (got.status !== 0) fail(`telbase storage credentials failed (exit ${got.status}); has the project storage? \`telbase storage create\``);
  let answer: unknown;
  try {
    answer = JSON.parse(got.stdout);
  } catch {
    fail("telbase storage credentials did not answer in JSON");
  }
  const found = new Map<string, string>();
  const walk = (x: unknown): void => {
    if (!x || typeof x !== "object") return;
    for (const [k, v] of Object.entries(x)) {
      if (typeof v === "string") found.set(k.replace(/_/g, "").toLowerCase(), v);
      else walk(v);
    }
  };
  walk(answer);
  const pick = (...names: string[]): string => {
    for (const n of names) {
      const v = found.get(n.toLowerCase());
      if (v) return v;
    }
    return fail(`telbase storage credentials gave no ${names[0]}`);
  };
  return {
    accessKeyId: pick("accessKeyId", "r2AccessKeyId"),
    secretAccessKey: pick("secretAccessKey", "r2SecretAccessKey"),
    endpoint: pick("endpoint", "r2Endpoint"),
    bucketName: pick("bucketName", "bucket", "r2BucketName"),
  };
}

/** curl signed for R2 with the keys on its standard input, never its command line. */
function curl(keys: Keys, args: readonly string[], capture: boolean): { status: number | null; out: string } {
  const run = spawnSync("curl", ["--silent", "--show-error", "--aws-sigv4", "aws:amz:auto:s3", "--config", "-", ...args], {
    input: `user = "${keys.accessKeyId}:${keys.secretAccessKey}"\n`,
    encoding: "utf8",
    stdio: ["pipe", capture ? "pipe" : "inherit", "inherit"],
  });
  return { status: run.status, out: run.stdout ?? "" };
}

const indexBytes = readFileSync(INDEX);
const index = JSON.parse(indexBytes.toString("utf8")) as { scenes: { id: string; file: string; bytes: number }[] };
const folder = createHash("sha256").update(indexBytes).digest("hex").slice(0, 12);

if (process.argv.includes("--url")) {
  console.log(`${FUNCTION}${folder}`);
  process.exit(0);
}

for (const scene of index.scenes) {
  const path = join(PACKS, scene.file);
  if (!existsSync(path)) fail(`no ${scene.file} in dist-film/: make scenes`);
  if (statSync(path).size !== scene.bytes) fail(`${scene.file} is not the pack the committed index names (${scene.bytes} bytes): make scenes`);
}

const keys = readKeys();
const bucketUrl = `${keys.endpoint.replace(/\/+$/, "")}/${keys.bucketName}/${folder}`;
let sent = 0;
for (const scene of index.scenes) {
  const url = `${bucketUrl}/${scene.file}`;
  const head = curl(keys, ["--head", url], true);
  const length = /^content-length:\s*(\d+)/im.exec(head.out)?.[1];
  if (/^HTTP\/\S+ 200/m.test(head.out) && Number(length) === scene.bytes) {
    console.error(`${scene.file}: there already`);
    continue;
  }
  console.error(`${scene.file}: sending ${(scene.bytes / 1e6).toFixed(0)} MB`);
  const put = curl(
    keys,
    [
      "--fail-with-body",
      "-H", "x-amz-content-sha256: UNSIGNED-PAYLOAD",
      "-H", "Content-Type: application/octet-stream",
      "-H", "Cache-Control: public, max-age=31536000, immutable",
      "-T", join(PACKS, scene.file),
      url,
    ],
    false,
  );
  if (put.status !== 0) fail(`${scene.file} was not sent (curl exit ${put.status})`);
  sent += scene.bytes;
}
console.error(`${(sent / 1e6).toFixed(0)} MB sent; the packs are in ${keys.bucketName}/${folder}, served through ${FUNCTION}${folder}`);
