<script lang="ts">
  // Shown at the top of Home and the first-visit screen when something is wrong with the save:
  // earlier progress was found set aside, or the browser is refusing to save.
  import { app, replaceSave, rescue } from '../lib/app.svelte';

  let restored = $state(false);
  const offer = $derived(rescue && !restored && Object.keys(app.save.progress.links).length === 0 ? rescue : null);

  function restore() {
    if (!offer) return;
    replaceSave(offer.save);
    restored = true;
  }
</script>

{#if offer}
  <div class="notice" role="alert">
    <p><b>Earlier progress found.</b> This browser kept a copy of a save it could not open ({offer.links} links learned).</p>
    <button class="btn small primary" onclick={restore}>Restore it</button>
  </div>
{:else if app.saveFailed}
  <div class="notice warn" role="alert">
    <p><b>Progress is not being saved.</b> This browser refuses to store it (a private window, or site data blocked). Download a backup in Settings before closing.</p>
  </div>
{/if}

<style>
  .notice { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: var(--radius); background: var(--accent-soft); font-size: 14px; line-height: 1.45; }
  .notice.warn { background: var(--wrong-bg); color: var(--ink); }
  .notice .btn { align-self: flex-start; }
</style>
