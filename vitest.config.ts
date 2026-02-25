import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@tracker': resolve(__dirname, 'src/tracker'),
      '@receiver': resolve(__dirname, 'src/receiver'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
});
