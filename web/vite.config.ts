import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(configDir, ".");
const projectDir = path.resolve(configDir, "..");

export default defineConfig({
  root: rootDir,
  base: "/md/",
  resolve: {
    alias: {
      "@core": path.join(projectDir, "src"),
    },
  },
  server: {
    fs: {
      allow: [projectDir],
    },
    port: 5173,
    open: false,
  },
  // markdown-it-mathjax3 的浏览器产物含顶层 await，
  // dev 预构建（optimizeDeps）与源码转换（esbuild.target）都要放宽到 es2022
  esbuild: {
    target: "es2022",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2022",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
});
