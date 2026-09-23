import { cpSync, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { formatProblems, loadFilm, writeRail, type RecordedKey } from "../tools/film.ts";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * Serve the film at /film.json, read from `content/scenes/` and held to the
 * content gate on every request in dev and once at build. One reader, so the
 * film the shell plays is the film `npm run content:validate` checked.
 */
function publishedFilm(): Plugin {
  const scenesDir = resolve(__dirname, "..", "content", "scenes");
  const read = () => loadFilm(scenesDir);
  return {
    name: "nine-skies-film",
    configureServer(server) {
      server.middlewares.use("/film.json", (_request, response) => {
        const { film, problems } = read();
        if (problems.length > 0) console.error(`film problems:\n${formatProblems(problems)}`);
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(film));
      });
      const body = (request: import("node:http").IncomingMessage): Promise<Buffer> =>
        new Promise((resolve, reject) => {
          const chunks: Buffer[] = [];
          request.on("data", (c: Buffer) => chunks.push(c));
          request.on("end", () => resolve(Buffer.concat(chunks)));
          request.on("error", reject);
        });
      // A still from the running film, into docs/stills/ (plan v2, D77).
      server.middlewares.use("/still", (request, response) => {
        if (request.method !== "POST") return void response.end();
        const name = new URLSearchParams((request.url ?? "").split("?")[1] ?? "").get("name") ?? "";
        if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
          response.statusCode = 400;
          return void response.end("name must be a slug");
        }
        void body(request).then((png) => {
          const dir = resolve(__dirname, "..", "docs", "stills");
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, `${name}.png`), png);
          response.end(`docs/stills/${name}.png ${png.length} bytes`);
        });
      });
      // A rail recorded in the app, into its scene file (D83).
      server.middlewares.use("/record", (request, response) => {
        if (request.method !== "POST") return void response.end();
        void body(request).then((raw) => {
          try {
            const { id, keys } = JSON.parse(raw.toString("utf8")) as { id: string; keys: RecordedKey[] };
            response.end(writeRail(id, keys, resolve(__dirname, "..", "content", "scenes")));
          } catch (error) {
            response.statusCode = 400;
            response.end((error as Error).message);
          }
        });
      });
    },
    generateBundle() {
      const { film, problems } = read();
      if (problems.length > 0) throw new Error(`film problems:\n${formatProblems(problems)}`);
      this.emitFile({ type: "asset", fileName: "film.json", source: JSON.stringify(film) });
    },
  };
}

/**
 * Serve the pipeline's output at /world.
 *
 * `dist-world/` is generated, gitignored and outside the app root, so it does
 * not belong in `public/`. This middleware is the dev-time stand-in for what
 * stage 11 will do properly: content-hashed, Brotli-compressed, immutable.
 */
function publishedWorld(): Plugin {
  const root = resolve(__dirname, "..", "dist-world");
  const types: Record<string, string> = {
    ".json": "application/json",
    ".bin": "application/octet-stream",
  };
  return {
    name: "nine-skies-published-world",
    configureServer(server) {
      server.middlewares.use("/world", (request, response, next) => {
        const url = (request.url ?? "/").split("?")[0]!;
        const path = join(root, normalize(url));
        if (!path.startsWith(root)) {
          response.statusCode = 403;
          response.end("outside dist-world");
          return;
        }
        let stats;
        try {
          stats = statSync(path);
        } catch {
          next();
          return;
        }
        if (!stats.isFile()) {
          next();
          return;
        }
        response.setHeader(
          "Content-Type",
          types[extname(path)] ?? "application/octet-stream",
        );
        response.setHeader("Content-Length", String(stats.size));
        response.end(readFileSync(path));
      });
    },
  };
}

/**
 * Serve the scene packs at /packs, and put `dist-film/` - the packs and the
 * few world files read before them - into the build (plan v2, stage 4).
 *
 * The index of what each pack holds is committed under `public/packs/`; the
 * packs themselves are cut by `make scenes` from a world that is not in the
 * repository, so a build without them is refused rather than shipped hollow.
 */
function publishedPacks(): Plugin {
  const root = resolve(__dirname, "..", "dist-film");
  let outDir = "";
  return {
    name: "nine-skies-scene-packs",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use("/packs", (request, response, next) => {
        const url = (request.url ?? "/").split("?")[0]!;
        if (!url.endsWith(".bin")) return next();
        const path = join(root, "packs", normalize(url));
        if (!path.startsWith(join(root, "packs"))) return next();
        try {
          const bytes = readFileSync(path);
          response.setHeader("Content-Type", "application/octet-stream");
          response.setHeader("Content-Length", String(bytes.length));
          response.end(bytes);
        } catch {
          next();
        }
      });
    },
    closeBundle() {
      if (!existsSync(join(root, "packs"))) {
        throw new Error("no scene packs in dist-film/: `make scenes` cuts them from the built world");
      }
      cpSync(root, outDir, { recursive: true });
    },
  };
}

export default defineConfig({
  root: ".",
  plugins: [publishedWorld(), publishedPacks(), publishedFilm()],
  // The engine lives outside the app root and would otherwise get its own
  // copy of three next to the pre-bundled one the shell imports.
  resolve: { dedupe: ["three"] },
  server: {
    // Honour PORT when a harness assigns one (the Claude Code preview does),
    // otherwise the usual 5173. Without this Vite silently auto-increments
    // past a busy 5173 and the harness points a tab at a port nothing is
    // listening on.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    // The app imports engine sources from outside its own root.
    fs: { allow: [".."] },
  },
  build: { target: "es2022", outDir: "dist" },
});
