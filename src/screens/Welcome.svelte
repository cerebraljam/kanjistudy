<script lang="ts">
  import SaveNotice from '../components/SaveNotice.svelte';
  // First visit: pick a look. Tapping a card switches the whole page to it, so the choice is seen
  // before it is made. Until then the page follows the device's light or dark setting.
  import { app, save } from '../lib/app.svelte';
  import { applyLook, deviceLook, LOOKS } from '../lib/look';
  import type { Look } from '../lib/storage';
  import LookPicker from '../components/LookPicker.svelte';

  const device = deviceLook();
  let picked = $state<Look>(device);

  function pick(l: Look) {
    picked = l;
    applyLook(l);
  }

  function start() {
    app.save.settings.look = picked;
    save();
  }
</script>

<main class="screen">
  <div class="head">
    <span class="brand jp">言葉の鎖</span>
    <h1>Pick a look</h1>
    <p class="muted">Tap one to try it. You can change it any time in Settings.</p>
  </div>

  <SaveNotice />

  <LookPicker value={picked} {device} onpick={pick} />

  <div class="foot">
    <button class="btn primary block" onclick={start}>Start with {LOOKS.find((l) => l.id === picked)?.name}</button>
    <p class="small muted center">Saved on this device only.</p>
  </div>
</main>

<style>
  .head { display: flex; flex-direction: column; gap: 8px; padding-top: 20px; }
  .brand { font-size: 15px; font-weight: 700; color: var(--muted); }
  h1 { font-size: 28px; font-weight: 700; }
  .head p { font-size: 15px; line-height: 1.5; }
  .foot { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
  .center { text-align: center; }
</style>
