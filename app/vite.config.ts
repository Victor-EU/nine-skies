import { readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { formatProblems, loadFilm } from "../tools/film.ts";

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

export default defineConfig({
  root: ".",
  plugins: [publishedWorld(), publishedFilm()],
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
