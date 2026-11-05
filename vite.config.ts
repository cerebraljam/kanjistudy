import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Changes whenever the dataset changes, so browsers fetch the new file instead of a cached one.
const dataFile = 'public/data/dataset.json';
const fileVersion = (f: string) => (existsSync(f) ? createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 12) : 'none');
const dataVersion = fileVersion(dataFile);
const mapVersion = fileVersion('public/data/map.json');

// base './' keeps asset paths relative, so the build works from any GitHub Pages subpath.
export default defineConfig({
  base: './',
  plugins: [svelte()],
  define: { __DATA_VERSION__: JSON.stringify(dataVersion), __MAP_VERSION__: JSON.stringify(mapVersion) },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
