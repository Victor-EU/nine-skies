/**
 * Generate the cutting key pair (D23).
 *
 * The private half goes somewhere gitignored and stays on the machine that
 * builds worlds; the public half is committed beside the sections it attests.
 *
 * It refuses to overwrite either. Replacing a committed public key
 * invalidates every section in the repository at once, which is a thing to do
 * deliberately and then immediately re-cut — not a thing to discover after
 * the fact because a command was run twice.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { generateCutKey, privateKeyPath, publicKeyPath } from "./attest.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const priv = privateKeyPath(root);
const pub = publicKeyPath(join(root, "content", "sections"));

const standing = [priv, pub].filter(existsSync);
if (standing.length > 0) {
  console.error(
    `\nRefusing to overwrite: ${standing.map((p) => relative(root, p)).join(" and ")}\n\n` +
      `  A new pair invalidates every committed section at once. If that is what\n` +
      `  you want, delete both by hand, run this again, then re-cut with\n` +
      `  \`make sections\` — which needs a built world.\n\n` +
      `  If you are setting up a second machine, copy the private half across\n` +
      `  instead; the committed public key is the one this repository trusts.\n`,
  );
  process.exit(1);
}

const { publicPem, privatePem } = generateCutKey();
mkdirSync(dirname(priv), { recursive: true });
writeFileSync(priv, privatePem, { mode: 0o600 });
mkdirSync(dirname(pub), { recursive: true });
writeFileSync(pub, publicPem);

console.log(
  `\n  private  ${relative(root, priv)}  (gitignored — this never leaves the machine)\n` +
    `  public   ${relative(root, pub)}  (commit this)\n\n` +
    `  Now re-cut the sections so they are signed: \`make sections\`\n`,
);
