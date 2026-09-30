/**
 * `/api/pack?key=<folder>/packs/<scene>.bin`: a scene pack, from the
 * project's Telbase storage bucket (Cloudflare R2), which is private. The
 * site is built with its packs' base at `/api/pack?key=<folder>` (`npm run
 * host-packs -- --url`), so each pack the film asks for comes here, and is
 * sent on to R2 with a link signed for it: the bytes go from R2 to the
 * viewer, never through this function.
 *
 * The link is signed as of the start of the day (UTC) for two days, so it
 * is the same link all day, and the browser's cache and the CDN's keep the
 * pack (uploaded `immutable`) across a viewer's visits. Only a pack's key
 * is signed for, nothing else in the bucket.
 *
 * Telbase gives a project with storage its keys as R2_ENDPOINT,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME. Node's own
 * crypto signs (AWS Signature Version 4, as S3 takes it), so the site has
 * no package.json and deploys as a static site with this one function
 * beside it (`make telbase`).
 */
import { createHash, createHmac } from "node:crypto";

/** A pack's key: the pack index's folder, then the pack's own file. */
export const KEY = /^[0-9a-f]{12}\/packs\/[a-z0-9-]+\.bin$/;
/** How long a link holds from the start of its day, seconds. */
const EXPIRES_S = 2 * 24 * 3600;

const encode = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (key, s) => createHmac("sha256", key).update(s).digest();
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/**
 * A GET link signed with Signature Version 4 in its query (S3's presigned
 * URL): `host` and `path` as sent, `path` already encoded; `at` the moment
 * it is signed as of.
 */
export function presign({ host, path, region, accessKeyId, secretAccessKey, at, expiresS }) {
  const stamp = at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = stamp.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const params = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${accessKeyId}/${scope}`],
    ["X-Amz-Date", stamp],
    ["X-Amz-Expires", String(expiresS)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const query = params
    .map(([k, v]) => `${encode(k)}=${encode(v)}`)
    .sort()
    .join("&");
  const request = ["GET", path, query, `host:${host}`, "", "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256(request)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), "s3"), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return `https://${host}${path}?${query}&X-Amz-Signature=${signature}`;
}

/** The start of the day `now` is in, UTC. */
export function dayOf(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export default function handler(req, res) {
  const key = new URL(req.url, "http://pack").searchParams.get("key") ?? "";
  if (!KEY.test(key)) {
    res.statusCode = 404;
    return res.end("no such pack");
  }
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    res.statusCode = 500;
    return res.end("the project's storage is not set up");
  }
  const host = new URL(R2_ENDPOINT).host;
  const path = `/${encode(R2_BUCKET_NAME)}/${key.split("/").map(encode).join("/")}`;
  const url = presign({ host, path, region: "auto", accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, at: dayOf(new Date()), expiresS: EXPIRES_S });
  res.statusCode = 302;
  res.setHeader("Location", url);
  // An hour: well inside the day the link is signed for and the one after.
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.end();
}
