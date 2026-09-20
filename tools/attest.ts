/**
 * The signature over a committed route section (D23).
 *
 * A section is derived data living next to its source, and D21 gave it every
 * staleness check a machine with no world can run: the waypoints it was cut
 * from, the leg lengths, the station count. All of those ask whether the file
 * still describes *this route*. None of them asks where its 2,932 elevations
 * came from, and that question has no answer CI can compute, because
 * re-deriving one number of it needs 14 GB of rasters.
 *
 * So the file is asked to carry the answer. `cutSections` signs what it cut;
 * the public half is committed beside the sections; every reader verifies.
 * The claim this supports is exactly one sentence long:
 *
 *   These elevations came out of a corridor cut on a machine holding the
 *   cutting key.
 *
 * It is worth being blunt about what that is not. It is not proof the
 * corridor was built from real rasters -- that is what the golden probes are
 * for, and one of them now runs against this file. It does not stop the key
 * holder doing as they like. And because the public key is committed in the
 * same repository, an attacker who can write to the repository can swap both.
 *
 * What it does buy is that **the only way to change the ground under a route
 * is to cut it from a world again**. A hand-edited array -- a number nudged
 * to make a clearance test pass, a merge resolved badly across 229 lines of
 * digits, a plausible-looking patch from anywhere at all -- stops being a
 * silent pass and becomes a failed gate. That was the last thing in the
 * repository taken on trust (F24, F25), and one person authoring routes is
 * exactly the situation in which nobody would have noticed.
 */
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Signs the canonical form of a cut. */
export type Signer = (attestation: string) => string;
/** Answers whether a signature belongs to this attestation. */
export type Verifier = (attestation: string, signature: string) => boolean;

/** The public half, committed beside the sections it attests. */
export const PUBLIC_KEY_FILE = "cutter.pub";

/**
 * Where the private half lives: never in the repository, and never found by
 * accident. `NINESKIES_CUT_KEY` wins so a machine can keep it on a volume
 * that is not the working copy.
 */
export function privateKeyPath(root: string = REPO): string {
  return process.env.NINESKIES_CUT_KEY ?? join(root, ".keys", "cutter.key");
}

export function publicKeyPath(sectionRoot: string): string {
  return join(sectionRoot, PUBLIC_KEY_FILE);
}

export function generateCutKey(): { publicPem: string; privatePem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicPem: publicKey as string, privatePem: privateKey as string };
}

export function signerFrom(privatePem: string): Signer {
  return (attestation) =>
    sign(null, Buffer.from(attestation, "utf8"), privatePem).toString("base64");
}

export function verifierFrom(publicPem: string): Verifier {
  return (attestation, signature) => {
    // A malformed signature is a failed verification, not a crash: the
    // caller's job is to report a bad section, and it cannot do that from
    // inside an exception thrown by a base64 decoder.
    try {
      return verify(
        null,
        Buffer.from(attestation, "utf8"),
        publicPem,
        Buffer.from(signature, "base64"),
      );
    } catch {
      return false;
    }
  };
}

/**
 * The repository's own verifier, or null when no public key is committed.
 *
 * Resolved from this file rather than from whichever directory the sections
 * being checked happen to live in. The key is the repository's trust anchor,
 * in the same way `pipeline/reference/albers.json` is: a section written to a
 * temporary directory is still this repository's section, and a caller that
 * could point verification at a different key by pointing it at a different
 * folder would not be verifying anything.
 */
export function committedVerifier(): Verifier | null {
  const path = publicKeyPath(join(REPO, "content", "sections"));
  if (!existsSync(path)) return null;
  return verifierFrom(readFileSync(path, "utf8"));
}

/**
 * The repository's own signer.
 *
 * Throws rather than returning null, and the message is the remedy: a machine
 * that can cut a section but cannot sign it must not quietly write an
 * unsigned one, because the next reader would report a file it cannot attest
 * and blame the wrong thing.
 */
export function committedSigner(root: string = REPO): Signer {
  const path = privateKeyPath(root);
  if (!existsSync(path))
    throw new Error(
      `no cutting key at ${path}. A section is signed by the machine that cut ` +
        `it (D23), so cutting needs one: \`make cut-key\` generates a pair and ` +
        `writes the public half to content/sections/${PUBLIC_KEY_FILE}. If this ` +
        `repository already has a public key committed, do not generate a new ` +
        `pair — copy the private half from the machine that did.`,
    );
  return signerFrom(readFileSync(path, "utf8"));
}
