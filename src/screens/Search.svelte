<script lang="ts">
  import { addCustomTheme, app } from '../lib/app.svelte';
  import { levelLabel, pct } from '../lib/display';
  import { mastery, wordStatus, wordsToMaster } from '../lib/progress';
  import { go, href } from '../lib/router.svelte';
  import { buildFromSearch, customThemeId, importList, searchThemes } from '../lib/search';
  import { CATEGORIES, type Theme } from '../lib/types';
  import Icon from '../components/Icon.svelte';

  let query = $state('');
  let pasted = $state('');
  let listName = $state('');
  let importing = $state(false);
  let importNote = $state('');

  const g = $derived(app.graph);
  const p = app.save.progress;
  const goal = app.save.settings.goal;

  const hits = $derived(searchThemes(g, query).slice(0, 4));
  const built = $derived(query.trim() ? buildFromSearch(g, query) : []);
  const builtKnown = $derived(built.filter((w) => wordStatus(g, p, w) === 'solid').length);
  const custom = $derived(app.save.customThemes);

  const taken = (id: string) => g.themes.has(id);

  // Ready-made themes by category; within one, the ones you have progress in first.
  let category = $state(CATEGORIES[0].id);
  const inCategory = $derived(
    g.themeList
      .filter((t) => !custom.some((c) => c.id === t.id) && (t.category ?? '暮らし') === category)
      .map((t) => ({ t, m: mastery(g, p, t.id), lv: t.words.reduce((a, w) => a + (g.word(w).jlpt ?? 1), 0) / t.words.length }))
      .sort((a, b) => b.m - a.m || b.lv - a.lv),
  );
  const count = (c: string) => g.themeList.filter((t) => (t.category ?? '暮らし') === c && !custom.some((x) => x.id === t.id)).length;

  function playSearch() {
    const name = query.trim();
    const id = customThemeId(name, taken);
    addCustomTheme({ id, jp: name, en: 'From your search', words: built });
    go(href.play(id));
  }

  function doImport() {
    const r = importList(g, pasted);
    if (r.words.length < 5) {
      importNote = `Only ${r.words.length} of those words are in the dictionary. A list needs at least 5.`;
      return;
    }
    const name = listName.trim() || 'My list';
    const id = customThemeId(name, taken);
    addCustomTheme({ id, jp: name, en: `Imported · ${r.words.length} words`, words: r.words });
    importNote = r.unmatched.length
      ? `${r.words.length} words matched. Not in the dictionary: ${r.unmatched.slice(0, 8).join('、')}${r.unmatched.length > 8 ? '…' : ''}`
      : `All ${r.words.length} words matched.`;
    pasted = '';
    listName = '';
    importing = false;
  }

  async function readFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) pasted = await f.text();
  }
</script>

<main class="screen">
  <header class="topbar">
    <a class="icon-btn edge-left" href={href.home()} aria-label="Back to home"><Icon name="back" /></a>
    <h1>Themes</h1>
  </header>

  <div class="field">
    <label for="q" class="label">What do you want to talk about?</label>
    <div class="search">
      <Icon name="search" />
      <!-- svelte-ignore a11y_autofocus -->
      <input id="q" type="search" bind:value={query} placeholder="software, train, restaurant…" autocomplete="off" autofocus />
    </div>
  </div>

  {#if query.trim()}
    {#if hits.length > 0}
      <section class="section">
        <h2>Ready-made themes</h2>
        {#each hits as h (h.theme.id)}
          {@const left = wordsToMaster(g, p, h.theme.id, goal).length}
          <a class="row-card" href={href.theme(h.theme.id)}>
            <span class="grow">
              <span class="title"><span class="jp">{h.theme.jp}</span> <span class="en">{h.theme.en}</span></span>
              <span class="small muted">{h.theme.words.length} words · {pct(mastery(g, p, h.theme.id))} solid{left ? ` · +${left} to master` : ''}</span>
            </span>
            <span class="tiny muted">{levelLabel(h.theme.words.map((w) => g.word(w)))}</span>
          </a>
        {/each}
      </section>
    {/if}

    {#if built.length >= 5}
      <section class="build">
        <div>
          <div class="strong">Make a theme from your search</div>
          <div class="small muted">{built.length} words close to “{query.trim()}” · you know {builtKnown}</div>
        </div>
        <div class="chips">
          {#each built.slice(0, 10) as w (w)}<span class="chip jp">{g.word(w).jp}</span>{/each}
          {#if built.length > 10}<span class="chip more muted">+{built.length - 10}</span>{/if}
        </div>
        <button class="btn primary small" onclick={playSearch}>Play as a new theme</button>
      </section>
    {:else if hits.length === 0}
      <p class="small muted">Nothing close to “{query.trim()}” yet. Try an English word, like “ticket” or “bug”.</p>
    {/if}
  {:else}
    <section class="section">
      <h2>All themes</h2>
      <div class="tabs" role="tablist" aria-label="Theme categories">
        {#each CATEGORIES.filter((c) => count(c.id) > 0) as c (c.id)}
          <button role="tab" aria-selected={category === c.id} onclick={() => (category = c.id)}>
            <span class="jp">{c.id}</span> <span class="tiny">{c.en} · {count(c.id)}</span>
          </button>
        {/each}
      </div>
      {#each inCategory as { t, m } (t.id)}
        <a class="row-card" href={href.theme(t.id)}>
          <span class="grow">
            <span class="title"><span class="jp">{t.jp}</span> <span class="en">{t.en}</span></span>
            <span class="small muted">{t.words.length} words · {pct(m)} solid</span>
          </span>
          <span class="tiny muted">{levelLabel(t.words.map((w) => g.word(w)))}</span>
        </a>
      {/each}
    </section>
  {/if}

  <section class="section">
    <h2>My lists</h2>
    {#each custom as c (c.id)}
      <a class="row-card" href={href.theme(c.id)}>
        <span class="grow">
          <span class="title jp">{c.jp}</span>
          <span class="small muted">{c.en} · only on this device</span>
        </span>
      </a>
    {/each}
    {#if importing}
      <div class="import">
        <label class="label" for="list-name">Name</label>
        <input id="list-name" class="text" bind:value={listName} placeholder="My list" />
        <label class="label" for="list-words">Words — one per line, or separated by commas</label>
        <textarea id="list-words" class="text jp" rows="5" bind:value={pasted} placeholder="脆弱性&#10;不具合&#10;障害"></textarea>
        <label class="file small">
          <input type="file" accept=".csv,.txt,.tsv,text/plain,text/csv" onchange={readFile} />
          Or choose a CSV or text file
        </label>
        <div class="row">
          <button class="btn small" onclick={() => (importing = false)}>Cancel</button>
          <button class="btn primary small" disabled={!pasted.trim()} onclick={doImport}>Import</button>
        </div>
      </div>
    {:else}
      <button class="btn small dashed" onclick={() => { importing = true; importNote = ''; }}>Import a word list</button>
    {/if}
    {#if importNote}<p class="small muted" role="status">{importNote}</p>{/if}
  </section>
</main>

<style>
  .field { display: flex; flex-direction: column; gap: 6px; }
  .search {
    display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 14px;
    border-radius: var(--radius); border: 1.5px solid var(--ink); color: var(--muted);
  }
  .search:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
  .search input { flex-grow: 1; border: 0; outline: none; font: inherit; font-size: 16px; color: var(--ink); background: transparent; min-width: 0; }
  .build { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 16px; background: var(--soft); }
  .strong { font-size: 15px; font-weight: 600; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { font-size: 14px; padding: 5px 9px; border-radius: 8px; background: var(--bg); }
  .chip.more { background: none; }
  .dashed { border-style: dashed; }
  .import { display: flex; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid var(--line); border-radius: var(--radius); }
  .text { font: inherit; font-size: 16px; padding: 10px 12px; border-radius: 10px; border: 1.5px solid var(--line-strong); resize: vertical; }
  .file { display: flex; flex-direction: column; gap: 6px; color: var(--muted); }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; }
  .tabs { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
  .tabs button {
    flex-shrink: 0; height: 40px; padding: 0 12px; border-radius: 999px;
    border: 1.5px solid var(--line-strong); background: var(--bg); cursor: pointer; white-space: nowrap;
  }
  .tabs button[aria-selected='true'] { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
</style>
