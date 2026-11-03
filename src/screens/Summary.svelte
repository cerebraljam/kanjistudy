<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { describeLink, pct } from '../lib/display';
  import { mastery, wordsToMaster } from '../lib/progress';
  import { levelFor } from '../lib/levels';
  import { href } from '../lib/router.svelte';

  const g = app.graph;
  const run = app.save.runs.at(-1) ?? null;
  const t = run ? g.themes.get(run.theme) : undefined;
  const goal = app.save.settings.goal;

  const minutes = run ? Math.floor(run.ms / 60000) : 0;
  const seconds = run ? Math.round((run.ms % 60000) / 1000) : 0;
  const delta = run ? Math.round((run.after - run.before) * 100) : 0;
  // Level before and after the run (older saved runs have no counts).
  const lvBefore = run?.solidBefore !== undefined ? levelFor(run.solidBefore).level : null;
  const lvAfter = run?.solidAfter !== undefined ? levelFor(run.solidAfter) : null;
  const gained = run?.solidBefore !== undefined && run.solidAfter !== undefined ? run.solidAfter - run.solidBefore : null;

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

    {#if run.results}
      <div class="run-strip" role="img" aria-label="{run.right} of {run.asked} right">
        {#each run.results as ok, i (i)}<span class:ok></span>{/each}
      </div>
    {/if}

    {#if lvAfter && lvBefore !== null && lvAfter.level > lvBefore}
      <div class="level-up">
        <span class="lv-badge">Lv {lvAfter.level}</span>
        <span><b>Level up!</b> <span class="muted">Lv {lvBefore} → {lvAfter.level}</span></span>
      </div>
    {:else if lvAfter && lvAfter.toNext > 0}
      <p class="small muted">Lv {lvAfter.level} · {lvAfter.toNext} {lvAfter.toNext === 1 ? 'word' : 'words'} to Lv {lvAfter.level + 1}</p>
    {/if}

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
      {#if gained !== null}
        <div class="tile"><span class="num gain-num">+{Math.max(0, gained)}</span><span class="tiny muted">words solid</span></div>
      {:else}
        <div class="tile"><span class="num">{run.right}/{run.asked}</span><span class="tiny muted">right</span></div>
      {/if}
      <div class="tile"><span class="num">{run.learned.length}</span><span class="tiny muted">new {run.learned.length === 1 ? 'word' : 'words'}</span></div>
      <div class="tile"><span class="num chain-num">{run.longest}</span><span class="tiny muted">longest chain</span></div>
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
  .run-strip { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 3px; }
  .run-strip span { height: 8px; border-radius: 3px; background: var(--wrong); }
  .run-strip span.ok { background: var(--right); }
  .level-up { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: var(--radius); background: var(--accent-soft); }
  .lv-badge { padding: 6px 10px; border-radius: 10px; background: var(--accent); color: var(--bg); font-weight: 700; }
  .gain-num { color: var(--right); }
  :global([data-look='arcade']) .tile { background: var(--soft); box-shadow: 0 4px 0 var(--tile-edge); text-align: center; align-items: center; }
  :global([data-look='arcade']) .num { font-weight: 800; font-size: 28px; }
  :global([data-look='arcade']) .chain-num { color: var(--accent); }
  :global([data-look='arcade']) .lv-badge { color: var(--on-primary); box-shadow: 0 3px 0 var(--primary-edge); font-weight: 800; }
  :global([data-look='arcade']) .bar .done { background: var(--right); }
  .actions { margin-top: auto; display: grid; grid-template-columns: 1fr 2fr; gap: 10px; }
</style>
