<script lang="ts">
  // The last answers as a chain: word —glyph→ answer, forking when the pick was wrong.
  import type { Answered } from '../lib/session';
  import type { Graph } from '../lib/graph';
  import { Q_META } from '../lib/types';

  let { entries, graph }: { entries: Answered[]; graph: Graph } = $props();
</script>

<div class="trail" aria-live="polite">
  {#if entries.length === 0}
    <p class="hint small muted">Your chain builds here. Each answer becomes the next word.</p>
  {/if}
  {#each entries as e (e)}
    {@const right = e.question.options.find((o) => o.correct)!}
    <div class="step">
      <span class="from jp">{graph.word(e.question.word).jp}</span>
      <span class="arrow" aria-hidden="true">
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M0 5h12M9 2l3 3-3 3" /></svg>
        <span class="glyph-chip">{Q_META[e.question.q].glyph}</span>
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M0 5h12M9 2l3 3-3 3" /></svg>
      </span>
      <span class="sr-only">{Q_META[e.question.q].label}:</span>
      <span class="ends" class:fork={!e.correct}>
        {#if !e.correct}
          <span class="wrong"><s>{e.picked.label}</s> <span class="tiny">{e.picked.gloss}</span><span class="sr-only"> (wrong)</span></span>
        {/if}
        <span class="right">{right.label}</span>
      </span>
    </div>
  {/each}
</div>

<style>
  .trail {
    height: 132px; padding-top: 10px; border-bottom: 1px solid var(--line);
    display: flex; flex-direction: column; justify-content: flex-end; gap: 10px; overflow: hidden;
  }
  .hint { margin-bottom: 14px; }
  .step { display: flex; align-items: flex-start; gap: 8px; font-size: 15px; padding-bottom: 10px; }
  .from { font-weight: 500; padding-top: 2px; white-space: nowrap; }
  .arrow { display: flex; align-items: center; gap: 4px; color: var(--muted); padding-top: 3px; }
  .ends { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .ends.fork { border-left: 1.5px solid var(--line-strong); padding-left: 10px; }
  .wrong { color: var(--wrong); padding-top: 2px; }
  .right { color: var(--right); font-weight: 500; padding-top: 2px; }
  /* Arcade: chain links as small pills. */
  :global([data-look='arcade']) .from { padding: 1px 8px; border-radius: 8px; background: var(--soft); font-weight: 700; }
  :global([data-look='arcade']) .right { padding: 1px 8px; border-radius: 8px; background: var(--right-bg); font-weight: 700; align-self: flex-start; }
  /* Short screens (a tablet in landscape) keep only the latest step, leaving room for the options. */
  @media (max-height: 760px) {
    .trail { height: 84px; }
    .step:not(:last-child) { display: none; }
  }
</style>
