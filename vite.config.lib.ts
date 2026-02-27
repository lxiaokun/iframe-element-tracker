import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        tracker: resolve(__dirname, 'src/tracker/index.ts'),
        receiver: resolve(__dirname, 'src/receiver/index.ts'),
        'overlay-positioner': resolve(__dirname, 'src/overlay-positioner/index.ts'),
      },
      formats: ['es', 'cjs'],
    },
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        exports: 'named',
      },
    },
  },
  plugins: [dts({ tsconfigPath: './tsconfig.build.json' })],
});
