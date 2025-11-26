import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: 'examples',
  build: {
    outDir: '../build',
    emptyOutDir: true,
    minify: true,
    lib: {
      entry: path.resolve(__dirname, 'src/TilemapRenderer.ts'),
      name: 'TilemapRenderer',
      fileName: (format) => `tilemap-renderer${format === "es" ? ".module" : ""}.min.js`,
      formats: ['es', 'umd']
    },
    rollupOptions: {
      output: {
        globals: {}
      },
    },
  },
  server: {
    port: 5173,
  },
});
