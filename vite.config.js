import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: "es2015",
    outDir: "dist",
    minify: false,
    rollupOptions: {
      output: {
        format: "iife",
        entryFileNames: "index.js",
      },
    },
  },
});