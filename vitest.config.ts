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
    // scripts/ is in here for the register parsers: their failure mode is a
    // silent zero-row harvest (a BOM in the header, a blank row above it), which
    // is exactly the kind of thing only a test notices.
    include: ['src/**/*.test.ts', 'evals/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
