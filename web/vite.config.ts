import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(configDir, ".");
const projectDir = path.resolve(configDir, "..");

export default defineConfig({
  root: rootDir,
  base: "/",
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
  // markdown-it-mathjax3 鐨勬祻瑙堝櫒浜х墿鍚《灞?await锛?
  // dev 棰勬瀯寤猴紙optimizeDeps锛変笌婧愮爜杞崲锛坋sbuild.target锛夐兘瑕佹斁瀹藉埌 es2022
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

