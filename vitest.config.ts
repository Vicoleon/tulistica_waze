import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  // Server-side tests do not need CSS processing — pinning the config search
  // to this directory prevents picking up parent-folder postcss configs.
  css: {
    postcss: {
      plugins: [],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  // Skip ancestor postcss.config.js lookup — server-only tests don't need CSS pipeline.
  css: {
    postcss: { plugins: [] },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    css: false,
  },
});
