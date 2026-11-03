<script lang="ts">
  // The three looks as cards, each with a small preview drawn in its own colors.
  // Used on the first visit and in Settings.
  import { LOOKS } from '../lib/look';
  import type { Look } from '../lib/storage';

  let { value, device, onpick }: { value: Look; device: Look; onpick: (l: Look) => void } = $props();
</script>

<div class="looks" role="radiogroup" aria-label="Look">
  {#each LOOKS as l (l.id)}
    <button class="look" role="radio" aria-checked={value === l.id} onclick={() => onpick(l.id)}>
      <!-- The preview carries its own look, whatever the page's. -->
      <span class="mini" data-mini={l.id} aria-hidden="true">
        <span class="mini-word">改札</span>
        <span class="mini-tiles"><span></span><span class="ok"></span><span></span><span></span></span>
      </span>
      <span class="text">
        <span class="name-line">
          <span class="name">{l.name}</span>
          {#if l.id === device}<span class="device">Matches your device</span>{/if}
        </span>
        <span class="desc">{l.desc}</span>
      </span>
      <span class="radio" aria-hidden="true">
        {#if value === l.id}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        {/if}
      </span>
    </button>
  {/each}
</div>

<style>
  .looks { display: flex; flex-direction: column; gap: 12px; }
  .look {
    display: flex; align-items: center; gap: 14px; padding: 12px; min-height: 112px; text-align: left;
    border-radius: 18px; border: 2px solid transparent; background: var(--soft); color: var(--ink); cursor: pointer;
  }
  .look[aria-checked='true'] { border-color: var(--accent); }
  .text { flex-grow: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .name-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .name { font-size: 17px; font-weight: 700; }
  .device { font-size: 11px; font-weight: 600; padding: 3px 7px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-ink); }
  .desc { font-size: 14px; line-height: 1.45; color: var(--muted); }
  .radio {
    width: 24px; height: 24px; flex-shrink: 0; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid var(--line-strong); color: var(--on-primary);
  }
  .look[aria-checked='true'] .radio { border-color: var(--accent); background: var(--accent); color: var(--bg); }

  /* Mini previews, fixed colors per look. */
  .mini {
    width: 88px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; padding: 8px;
    border-radius: 12px; background: var(--m-bg); border: 1px solid var(--m-line);
  }
  .mini-word {
    font-family: var(--m-jp); font-size: 21px; font-weight: 700; text-align: center; padding: 5px 0;
    border-radius: 8px; color: var(--m-card-ink); background: var(--m-card); box-shadow: var(--m-card-edge);
  }
  .mini-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; }
  .mini-tiles span { height: 17px; border-radius: 5px; background: var(--m-tile); border: 1.5px solid var(--m-tile-line); box-shadow: var(--m-tile-edge); }
  .mini-tiles .ok { background: var(--m-ok-bg); border-color: var(--m-ok); }
  [data-mini='paper'] {
    --m-bg: #ffffff; --m-line: #e6e6e2; --m-card: transparent; --m-card-ink: #16181d; --m-card-edge: none;
    --m-tile: #ffffff; --m-tile-line: #d4d4cf; --m-tile-edge: none; --m-ok: #1a7f45; --m-ok-bg: #eaf5ee; --m-jp: 'Noto Sans JP', sans-serif;
  }
  [data-mini='night'] {
    --m-bg: #15171c; --m-line: #2a2e36; --m-card: transparent; --m-card-ink: #e7e8eb; --m-card-edge: none;
    --m-tile: #1a1d23; --m-tile-line: #3b404a; --m-tile-edge: none; --m-ok: #5cc98f; --m-ok-bg: #16291f; --m-jp: 'Noto Sans JP', sans-serif;
  }
  [data-mini='arcade'] {
    --m-bg: #1e1b45; --m-line: #38337a; --m-card: #fff5e1; --m-card-ink: #1e1b45; --m-card-edge: 0 3px 0 #141133;
    --m-tile: #2f2a6e; --m-tile-line: #4a44a0; --m-tile-edge: 0 2px 0 #141133; --m-ok: #62e6a6; --m-ok-bg: #1f4a45; --m-jp: 'M PLUS Rounded 1c', sans-serif;
  }
</style>
