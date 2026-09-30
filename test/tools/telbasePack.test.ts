/**
 * The Telbase site's one function (`tools/telbase/api/pack.mjs`): it sends a
 * scene pack's request on to the private storage bucket with a link signed
 * for that pack alone, the same link all day.
 */
import { describe, expect, it } from "vitest";

interface Reply {
  statusCode: number;
  setHeader(k: string, v: string): void;
  end(body?: string): void;
}
interface PackModule {
  default(req: { url: string }, res: Reply): void;
  presign(o: { host: string; path: string; region: string; accessKeyId: string; secretAccessKey: string; at: Date; expiresS: number }): string;
  dayOf(now: Date): Date;
}
/** Plain JavaScript, as the site deploys it; typed here. */
const where = "../../tools/telbase/api/pack.mjs";
const { default: handler, dayOf, presign } = (await import(where)) as PackModule;

/** The function's reply to a request for `url`, with the project's storage keys in its environment. */
function reply(url: string): { status: number; headers: Record<string, string>; body: string } {
  const out = { status: 200, headers: {} as Record<string, string>, body: "" };
  const res = {
    set statusCode(s: number) {
      out.status = s;
    },
    setHeader: (k: string, v: string) => (out.headers[k.toLowerCase()] = v),
    end: (b = "") => (out.body = b),
  };
  handler({ url }, res);
  return out;
}

describe("the pack function", () => {
  it("signs as S3 signs a link in its query (AWS's own worked example)", () => {
    const url = presign({
      host: "examplebucket.s3.amazonaws.com",
      path: "/test.txt",
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      at: new Date(Date.UTC(2013, 4, 24)),
      expiresS: 86400,
    });
    expect(url).toBe(
      "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
  });

  it("sends a pack on to the bucket, the same link all day, and nothing but a pack", () => {
    const env = { R2_ENDPOINT: "https://acct.r2.cloudflarestorage.com", R2_ACCESS_KEY_ID: "id", R2_SECRET_ACCESS_KEY: "secret", R2_BUCKET_NAME: "nine-skies" };
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try {
      const r = reply("/api/pack?key=0123456789ab/packs/huangshan.bin");
      expect(r.status).toBe(302);
      expect(r.headers.location).toMatch(/^https:\/\/acct\.r2\.cloudflarestorage\.com\/nine-skies\/0123456789ab\/packs\/huangshan\.bin\?X-Amz-Algorithm=AWS4-HMAC-SHA256&/);
      expect(r.headers.location).toContain("X-Amz-Expires=172800");
      expect(r.headers.location).toMatch(/X-Amz-Date=\d{8}T000000Z/);
      expect(reply("/api/pack?key=0123456789ab/packs/huangshan.bin").headers.location).toBe(r.headers.location);
      for (const key of ["", "secrets.txt", "0123456789ab/packs/../x.bin", "0123456789ab/world/index.json"]) expect(reply(`/api/pack?key=${encodeURIComponent(key)}`).status, key).toBe(404);
      expect(dayOf(new Date(Date.UTC(2026, 8, 30, 23, 59))).toISOString()).toBe("2026-09-30T00:00:00.000Z");
    } finally {
      process.env = saved;
    }
  });
});
