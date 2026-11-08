import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps every asset path relative, so the build works from any sub-path
// (GitHub Pages project sites, static hosts, or a file opened from disk via a local server).
// Two pages: the CAN atlas (index.html) and the dealership service console concept (service-tool.html).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        tool: resolve(__dirname, 'service-tool.html'),
      },
    },
  },
});
