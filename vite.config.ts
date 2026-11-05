import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Changes whenever the dataset changes, so browsers fetch the new file instead of a cached one.
const fileVersion = (f: string) => (existsSync(f) ? createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 12) : 'none');
// One dataset per language studied: dataset.json (Japanese), dataset-en.json (English).
const versions = (name: string) => ({ ja: fileVersion(`public/data/${name}.json`), en: fileVersion(`public/data/${name}-en.json`) });

// base './' keeps asset paths relative, so the build works from any GitHub Pages subpath.
export default defineConfig({
  base: './',
  plugins: [svelte()],
  define: { __DATA_VERSION__: JSON.stringify(versions('dataset')), __MAP_VERSION__: JSON.stringify(versions('map')) },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
