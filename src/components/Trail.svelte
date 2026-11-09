<script lang="ts">
  // The last answers as a chain: word —glyph→ answer, forking when the pick was wrong.
  import type { Answered } from '../lib/session';
  import type { Graph } from '../lib/graph';
  import { showWord } from '../lib/details.svelte';
  import { isMove, Q_META } from '../lib/types';

  /** `secret`: the answer to the question on screen (a reading, or an English spelling), shown as … until it is answered. */
  let { entries, graph, secret = null }: { entries: Answered[]; graph: Graph; secret?: string | null } = $props();
  const mask = (text: string) => (secret ? text.replaceAll(secret, '…') : text);
</script>

<div class="trail" aria-live="polite">
  {#if entries.length === 0}
    <p class="hint small muted">Your chain builds here. Each answer becomes the next word.</p>
  {/if}
  {#each entries as e (e)}
    {@const right = e.question.options.find((o) => o.correct)!}
    <!-- Each word in the trail opens its details. Options of 意 questions are words too (their
         meanings shown); options of 読 questions are readings, not words. -->
    {@const rightWord = isMove(e.question.q) ? right.id : e.question.word}
    {@const pickedWord = e.question.q === 'read' ? null : e.picked.id}
    <div class="step">
      <button class="from jp" onclick={() => showWord(e.question.word)}>{mask(graph.word(e.question.word).jp)}</button>
      <span class="arrow" aria-hidden="true">
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M0 5h12M9 2l3 3-3 3" /></svg>
        <span class="glyph-chip">{Q_META[e.question.q].glyph}</span>
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M0 5h12M9 2l3 3-3 3" /></svg>
      </span>
      <span class="sr-only">{Q_META[e.question.q].label}:</span>
      <span class="ends" class:fork={!e.correct}>
        {#if !e.correct}
          {#if pickedWord && graph.words.has(pickedWord)}
            <button class="wrong" onclick={() => showWord(pickedWord)}><s>{mask(e.picked.label)}</s> <span class="tiny">{mask(e.picked.gloss)}</span><span class="sr-only"> (wrong)</span></button>
          {:else}
            <span class="wrong"><s>{mask(e.picked.label)}</s> <span class="tiny">{mask(e.picked.gloss)}</span><span class="sr-only"> (wrong)</span></span>
          {/if}
        {/if}
        <button class="right" onclick={() => showWord(rightWord)}>{mask(right.label)}</button>
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
  /* Buttons that look like the trail's text: :where() keeps this below the rules that follow. */
  :where(button.from, button.right, button.wrong) { all: unset; cursor: pointer; text-align: left; }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
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
