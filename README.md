# 言葉の鎖 · Kanji Study

Learn Japanese words by theme, as chains of linked words. Runs entirely in the browser; progress is kept in localStorage. See [PROJECT.md](PROJECT.md) for the idea.

## Commands

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests, dataset checks, simulated learners
npm run simulate   # simulated learners only; set SHOW_SIM=1 and add --silent=false for the tables
npm run check      # type-check
npm run build      # static site in dist/ (relative paths, works from a GitHub Pages subpath)
```

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` type-checks, tests, builds and publishes `dist/` on every push to `main` (or by hand from the Actions tab).

1. Create the GitHub repo and push `main`.
2. In the repo: **Settings → Pages → Source: GitHub Actions**.
3. The site appears at `https://<user>.github.io/<repo>/`.

The dataset is **not** built in CI (the pipeline needs a GPU and ~1.5 GB of downloads). Run `npm run data` locally and commit `public/data/dataset.json`; the app's cache-buster changes with the file, so browsers pick up the new data.

## Layout

- `src/lib/session.ts`: one run: picks questions, builds options, scores answers, moves the chain.
- `src/lib/progress.ts`: link strength boxes, word status, theme mastery, "+N words to master".
- `src/lib/graph.ts`: index over the dataset; which links each theme is scored on.
- `src/lib/storage.ts`: versioned save with migrations, backup export/import.
- `src/lib/validate.ts`: dataset checks, run by the tests.
- `src/lib/search.ts`: theme search and word-list import (no model, plain matching).
- `src/data/sample.json`: hand-made sample data (70 words, 7 themes), in the format the data pipeline will produce.
- `src/screens/`: one Svelte component per screen; hash routes in `src/lib/router.svelte.ts`.

The application is currently deployed in `https://cerebraljam.github.io/kanjistudy`