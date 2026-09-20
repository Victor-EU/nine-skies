import { readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

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
  plugins: [publishedWorld()],
  server: {
    port: 5173,
    // The app imports engine sources from outside its own root.
    fs: { allow: [".."] },
  },
  build: { target: "es2022", outDir: "dist" },
});
