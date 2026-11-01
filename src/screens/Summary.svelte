<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { describeLink, pct } from '../lib/display';
  import { mastery, wordsToMaster } from '../lib/progress';
  import { href } from '../lib/router.svelte';

  const g = app.graph;
  const run = app.save.runs.at(-1) ?? null;
  const t = run ? g.themes.get(run.theme) : undefined;
  const goal = app.save.settings.goal;

  const minutes = run ? Math.floor(run.ms / 60000) : 0;
  const seconds = run ? Math.round((run.ms % 60000) / 1000) : 0;
  const delta = run ? Math.round((run.after - run.before) * 100) : 0;

  // Neighboring themes (sharing words) that are now closest to mastered.
  const nearby = $derived.by(() => {
    if (!t) return [];
    const words = new Set(t.words);
    return g.themeList
      .filter((x) => x.id !== t.id)
      .map((x) => ({ theme: x, shared: x.words.filter((w) => words.has(w)), left: wordsToMaster(g, app.save.progress, x.id, goal).length }))
      .filter((x) => x.shared.length > 0 && x.left > 0 && x.left <= 5)
      .sort((a, b) => a.left - b.left)
      .slice(0, 1);
  });
</script>

<main class="screen">
  {#if !run || !t}
    <p>No run yet.</p>
    <a class="btn" href={href.home()}>Home</a>
  {:else}
    <div class="head">
      <span class="small muted">Run complete · {minutes > 0 ? `${minutes} min ` : ''}{seconds} s</span>
      <h1 class="jp">{t.jp}</h1>
      <p class="delta" class:up={delta > 0}>
        {#if delta > 0}Up {delta}% this run{:else if delta < 0}Down {-delta}% this run{:else}No change in solid words yet — keep going{/if}
      </p>
    </div>

    <div class="section">
      <div class="bar" role="img" aria-label="Mastery {pct(run.after)}, was {pct(run.before)}">
        <span class="done" style:width="{Math.min(run.before, run.after) * 100}%"></span>
        <span class="gain" style:width="{Math.max(0, run.after - run.before) * 100}%"></span>
      </div>
      <div class="bar-legend small muted">
        <span>{pct(mastery(g, app.save.progress, t.id))} of words solid</span>
        <span>Mastered at {pct(goal)}</span>
      </div>
    </div>

    <div class="tiles">
      <div class="tile"><span class="num">{run.right}/{run.asked}</span><span class="tiny muted">right</span></div>
      <div class="tile"><span class="num">{run.learned.length}</span><span class="tiny muted">new {run.learned.length === 1 ? 'word' : 'words'}</span></div>
      <div class="tile"><span class="num">{run.longest}</span><span class="tiny muted">longest chain</span></div>
    </div>

    {#if run.missed.length > 0}
      <section class="section">
        <h2>Links to strengthen</h2>
        {#each run.missed.slice(0, 4) as key (key)}
          {@const l = describeLink(g, key)}
          {@const st = app.save.progress.links[key]}
          <div class="row-card link">
            <span class="jp strong">{l.from}</span>
            <span class="glyph-chip">{l.glyph}</span>
            <span class="jp strong">{l.to}</span>
            {#if st}<span class="tiny muted end">{st.ok} of {st.n} right</span>{/if}
          </div>
        {/each}
      </section>
    {/if}

    {#if nearby.length > 0}
      {@const n = nearby[0]}
      <section class="section">
        <h2>Now within reach</h2>
        <a class="row-card reach" href={href.theme(n.theme.id)}>
          <span class="grow">
            <span class="title"><span class="jp">{n.theme.jp}</span> <span class="en">{n.theme.en}</span></span>
            <span class="small accent-text">+{n.left} {n.left === 1 ? 'word' : 'words'} to master — shares <span class="jp">{n.shared.slice(0, 3).map((w) => g.word(w).jp).join('、')}</span></span>
          </span>
        </a>
      </section>
    {/if}

    <div class="actions">
      <a class="btn" href={href.home()}>Home</a>
      <a class="btn primary" href={href.play(t.id)}>Another run</a>
    </div>
  {/if}
</main>

<style>
  .head { display: flex; flex-direction: column; gap: 6px; padding-top: 12px; }
  h1 { font-size: 26px; font-weight: 600; line-height: 1.25; }
  .delta { font-size: 17px; color: var(--muted); }
  .delta.up { color: var(--accent); font-weight: 600; }
  .bar-legend { display: flex; justify-content: space-between; }
  .tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .tile { background: var(--soft); border-radius: var(--radius); padding: 14px; display: flex; flex-direction: column; gap: 4px; }
  .num { font-size: 24px; font-weight: 600; }
  .link { gap: 8px; font-size: 15px; }
  .strong { font-weight: 500; }
  .end { margin-left: auto; }
  .reach { background: var(--accent-soft); border-color: transparent; }
  .actions { margin-top: auto; display: grid; grid-template-columns: 1fr 2fr; gap: 10px; }
</style>
