import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
          "ocr-worker": resolve("src/main/ocr-worker.ts"),
        },
      },
    },
  },
  preload: {},
  renderer: {
    plugins: [react()],
    build: { minify: "esbuild", reportCompressedSize: true },
  },
});
