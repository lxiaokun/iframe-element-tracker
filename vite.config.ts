import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@tracker': resolve(__dirname, 'src/tracker'),
      '@receiver': resolve(__dirname, 'src/receiver'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        host: resolve(__dirname, 'demo/host.html'),
        inner: resolve(__dirname, 'demo/inner.html'),
      },
    },
  },
  server: {
    port: 3000,
  },
});
