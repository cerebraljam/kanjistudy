<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { levelLabel, pct } from '../lib/display';
  import { mastery, wordStatus, wordsToMaster } from '../lib/progress';
  import { href } from '../lib/router.svelte';
  import { CATEGORIES, type Theme } from '../lib/types';
  import Icon from '../components/Icon.svelte';

  const g = app.graph;
  const p = app.save.progress;
  const goal = app.save.settings.goal;
  const runLength = app.save.settings.runLength;

  const level = (t: Theme) => levelLabel(t.words.map((w) => g.word(w)));
  const stats = g.themeList.map((t) => ({
    theme: t,
    mastery: mastery(g, p, t.id),
    left: wordsToMaster(g, p, t.id, goal).length,
    best: p.best[t.id] ?? 0,
    started: t.words.some((w) => wordStatus(g, p, w) !== 'unseen'),
  }));

  const solidWords = [...g.words.keys()].filter((w) => wordStatus(g, p, w) === 'solid').length;
  const mastered = stats.filter((s) => s.left === 0);

  // Continue the last theme; on a first visit, suggest the easiest one.
  const avgLevel = (t: Theme) => t.words.reduce((a, w) => a + (g.word(w).jlpt ?? 1), 0) / t.words.length;
  const last = stats.find((s) => s.theme.id === app.save.lastTheme && s.left > 0);
  const easiest = [...stats].filter((s) => s.left > 0).sort((a, b) => avgLevel(b.theme) - avgLevel(a.theme))[0];
  const current = last ?? easiest;

  // Started themes, closest to mastered first.
  const almost = stats
    .filter((s) => s !== current && s.left > 0 && s.started)
    .sort((a, b) => a.left - b.left || b.mastery - a.mastery)
    .slice(0, 3);
  // New ground: the easiest theme not started yet in each category, so the list shows variety
  // instead of several parts of one theme (N5の名詞 1, 2, 4).
  const family = (t: Theme) => t.id.replace(/-\d+$/, '');
  const startedFamilies = new Set(stats.filter((s) => s.started || s === current).map((s) => family(s.theme)));
  const fresh = CATEGORIES.map((c) =>
    stats
      .filter((s) => s !== current && s.left > 0 && !s.started && s.theme.category === c.id && !startedFamilies.has(family(s.theme)))
      .sort((a, b) => avgLevel(b.theme) - avgLevel(a.theme) || b.theme.words.length - a.theme.words.length)[0],
  )
    .filter((s) => s !== undefined)
    .sort((a, b) => avgLevel(b.theme) - avgLevel(a.theme));
  const categoryName = (id?: string) => CATEGORIES.find((c) => c.id === id)?.en ?? '';
  const slipping = stats.filter((s) => s.best - s.mastery >= 0.1 && s !== current).slice(0, 2);
  const minutes = Math.max(1, Math.round((runLength * 6) / 60));
</script>

<main class="screen">
  <header class="topbar">
    <div class="brand">
      <h1 class="jp">言葉の鎖</h1>
      <span class="small muted">{solidWords} words solid · {mastered.length} {mastered.length === 1 ? 'theme' : 'themes'} mastered</span>
    </div>
    <a class="icon-btn" href={href.search()} aria-label="Find a theme"><Icon name="search" /></a>
    <a class="icon-btn edge-right" href={href.settings()} aria-label="Settings"><Icon name="sliders" /></a>
  </header>

  {#if current}
    <a class="continue" href={href.play(current.theme.id)}>
      <span class="small dim">{last ? 'Continue' : 'Start here'}</span>
      <span class="line">
        <span class="name jp">{current.theme.jp}</span>
        <span class="small dim">{level(current.theme)} · {pct(current.mastery)}</span>
      </span>
      <span class="track"><span style:width="{current.mastery * 100}%"></span></span>
      <span class="line small">
        <span>{runLength} questions · about {minutes} min</span>
        <span class="go">Play</span>
      </span>
    </a>
  {/if}

  {#if almost.length > 0}
    <section class="section">
      <div class="section-head">
        <h2>Almost there</h2>
        <span class="tiny muted">fewest words left first</span>
      </div>
      {#each almost as s (s.theme.id)}
        <a class="row-card" href={href.theme(s.theme.id)}>
          <span class="grow">
            <span class="title"><span class="jp">{s.theme.jp}</span> <span class="en">{s.theme.en}</span></span>
            <span class="small accent-text">+{s.left} {s.left === 1 ? 'word' : 'words'} to master</span>
          </span>
          <span class="tiny muted">{level(s.theme)}</span>
        </a>
      {/each}
    </section>
  {/if}

  {#if fresh.length > 0}
    <section class="section">
      <div class="section-head">
        <h2>{almost.length > 0 ? 'Something new' : 'Good places to start'}</h2>
        <span class="tiny muted">easiest in each area</span>
      </div>
      {#each fresh as s (s.theme.id)}
        <a class="row-card" href={href.theme(s.theme.id)}>
          <span class="grow">
            <span class="title"><span class="jp">{s.theme.jp}</span> <span class="en">{s.theme.en}</span></span>
            <span class="small muted">{categoryName(s.theme.category)} · {s.theme.words.length} words</span>
          </span>
          <span class="tiny muted">{level(s.theme)}</span>
        </a>
      {/each}
    </section>
  {/if}

  {#if slipping.length > 0}
    <section class="section">
      <h2>Slipping</h2>
      {#each slipping as s (s.theme.id)}
        <a class="row-card" href={href.theme(s.theme.id)}>
          <span class="grow">
            <span class="title"><span class="jp">{s.theme.jp}</span> <span class="en">{s.theme.en}</span></span>
            <span class="small shaky-text">was {pct(s.best)}, now {pct(s.mastery)}</span>
          </span>
          <span class="tiny muted">{level(s.theme)}</span>
        </a>
      {/each}
    </section>
  {/if}

  <section class="section bottom">
    {#if mastered.length > 0}
      <h2>Mastered</h2>
      <div class="pills">
        {#each mastered as s (s.theme.id)}
          <a class="pill jp" href={href.theme(s.theme.id)}>{s.theme.jp}</a>
        {/each}
      </div>
    {/if}
    <a class="more" href={href.search()}>Find or build a theme</a>
  </section>
</main>

<style>
  .brand { flex-grow: 1; display: flex; flex-direction: column; gap: 2px; padding-top: 8px; }
  .brand h1 { font-size: 22px; }
  .continue {
    display: flex; flex-direction: column; gap: 14px; padding: 18px;
    border-radius: 18px; background: var(--ink); color: #fff; text-decoration: none;
  }
  .continue:hover { color: #fff; background: #2a2d35; }
  .dim { color: #c9cbd1; }
  .line { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .name { font-size: 20px; font-weight: 600; }
  .track { height: 6px; border-radius: 3px; background: #3a3d45; display: flex; overflow: hidden; }
  .track span { background: #fff; }
  .go { font-weight: 600; }
  .bottom { margin-top: auto; }
  .pills { display: flex; flex-wrap: wrap; gap: 8px; }
  .pills a { color: var(--ink); text-decoration: none; }
  .more { font-size: 14px; font-weight: 500; padding: 12px 0; text-decoration: none; }
</style>
