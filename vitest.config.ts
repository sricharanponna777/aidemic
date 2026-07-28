import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Mirror the `@/*` -> `src/*` alias from tsconfig so tests resolve imports.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // evals/ holds accuracy suites that call the live model; they self-skip
    // unless RUN_EVALS=1, so collecting them here costs nothing by default.
    include: ['src/**/*.test.ts', 'evals/**/*.test.ts'],
  },
});
