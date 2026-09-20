import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: {
    port: 5173,
    // The app imports engine sources from outside its own root.
    fs: { allow: [".."] },
  },
  build: { target: "es2022", outDir: "dist" },
});
