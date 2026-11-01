import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Changes whenever the dataset changes, so browsers fetch the new file instead of a cached one.
const dataFile = 'public/data/dataset.json';
const dataVersion = existsSync(dataFile) ? createHash('sha256').update(readFileSync(dataFile)).digest('hex').slice(0, 12) : 'none';

// base './' keeps asset paths relative, so the build works from any GitHub Pages subpath.
export default defineConfig({
  base: './',
  plugins: [svelte()],
  define: { __DATA_VERSION__: JSON.stringify(dataVersion) },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
