<script lang="ts">
  import { untrack } from 'svelte';
  import { app, isCustom, removeCustomTheme } from '../lib/app.svelte';
  import { describeLink, levelLabel, pct } from '../lib/display';
  import { showWord } from '../lib/details.svelte';
  import { mastery, weakLinks, wordStatus, wordsToMaster } from '../lib/progress';
  import { go, href } from '../lib/router.svelte';
  import Icon from '../components/Icon.svelte';

  let { theme: themeProp }: { theme: string } = $props();
  // Read once: App remounts this screen whenever the route changes.
  const theme = untrack(() => themeProp);

  const g = app.graph;
  const p = app.save.progress;
  const settings = app.save.settings;
  const t = g.themes.get(theme);
  const words = t ? t.words.filter((w) => g.words.has(w)).map((w) => g.word(w)) : [];
  const m = t ? mastery(g, p, t.id) : 0;
  const left = t ? wordsToMaster(g, p, t.id, settings.goal) : [];
  const weak = t ? weakLinks(g, p, t.id, 3) : [];
  const shares = t
    ? g.themeList
        .filter((x) => x.id !== t.id)
        .map((x) => ({ theme: x, n: x.words.filter((w) => t.words.includes(w)).length }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n)
        .slice(0, 3)
    : [];


  function remove() {
    if (t && confirm(`Remove “${t.jp}”? Your progress on its words stays.`)) {
      removeCustomTheme(t.id);
      go(href.search());
    }
  }
</script>

<main class="screen">
  <header class="topbar">
    <a class="icon-btn edge-left" href={href.home()} aria-label="Back to home"><Icon name="back" /></a>
    <span class="grow"></span>
    {#if t && isCustom(t.id)}
      <button class="icon-btn edge-right" onclick={remove} aria-label="Remove this theme"><Icon name="trash" /></button>
    {/if}
  </header>

  {#if !t}
    <p>This theme does not exist.</p>
  {:else}
    <div class="title">
      <h1 class="jp">{t.jp}</h1>
      <span class="small muted">{t.en} · {t.category ? `${t.category} · ` : ''}avg. {levelLabel(words)} · {words.length} words</span>
    </div>

    <div class="section">
      <div class="bar" role="img" aria-label="{pct(m)} of words solid"><span class="done" style:width="{m * 100}%"></span></div>
      <div class="legend-row small muted">
        <span>{pct(m)} solid</span>
        {#if left.length > 0}
          <span class="accent-text strong">+{left.length} {left.length === 1 ? 'word' : 'words'} to master</span>
        {:else}
          <span class="accent-text strong">Mastered</span>
        {/if}
      </div>
    </div>

    <div class="section">
      <div class="legend tiny muted">
        <span><i class="sw solid"></i>solid</span>
        <span><i class="sw shaky"></i>shaky</span>
        <span><i class="sw unseen"></i>not seen</span>
      </div>
      <div class="words">
        {#each words as w (w.id)}
          {@const st = wordStatus(g, p, w.id)}
          <button class="word-chip jp {st}" aria-label="{w.jp}, {st === 'unseen' ? 'not seen' : st}: details" onclick={() => showWord(w.id)}>{w.jp}</button>
        {/each}
      </div>
    </div>

    {#if weak.length > 0}
      <section class="section">
        <h2>Weakest links</h2>
        {#each weak as l (l.key)}
          {@const d = describeLink(g, l.key)}
          <div class="row-card link">
            <span class="jp strong">{d.from}</span>
            <span class="glyph-chip">{d.glyph}</span>
            <span class="jp strong">{d.to}</span>
            <span class="tiny muted end">{l.stat.ok} of {l.stat.n}</span>
          </div>
        {/each}
      </section>
    {/if}

    {#if shares.length > 0}
      <section class="section">
        <h2>Shares words with</h2>
        <div class="pills">
          {#each shares as s (s.theme.id)}
            <a class="pill" href={href.theme(s.theme.id)}><span class="jp">{s.theme.jp}</span> · {s.n} shared</a>
          {/each}
        </div>
      </section>
    {/if}

    <a class="btn primary block play" href={href.play(t.id)}>Play this theme · {settings.runLength} questions</a>
  {/if}
</main>

<style>
  .grow { flex-grow: 1; }
  .title { display: flex; flex-direction: column; gap: 6px; }
  .title h1 { font-size: 26px; font-weight: 600; }
  .legend-row { display: flex; justify-content: space-between; }
  .strong { font-weight: 500; }
  .legend { display: flex; gap: 14px; }
  .legend span { display: flex; align-items: center; gap: 6px; }
  .sw { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .sw.solid { background: var(--ink); }
  .sw.shaky { border: 1.5px solid var(--shaky); }
  .sw.unseen { border: 1.5px dashed var(--muted); }
  .words { display: flex; flex-wrap: wrap; gap: 8px; }
  .link { gap: 8px; font-size: 15px; }
  .end { margin-left: auto; }
  .pills { display: flex; flex-wrap: wrap; gap: 8px; }
  .pills a { color: var(--ink); text-decoration: none; }
  .play { margin-top: auto; }
</style>
