<script lang="ts">
  import { app, loadData } from './lib/app.svelte';
  import { router } from './lib/router.svelte';
  import Home from './screens/Home.svelte';
  import Play from './screens/Play.svelte';
  import Search from './screens/Search.svelte';
  import Settings from './screens/Settings.svelte';
  import Summary from './screens/Summary.svelte';
  import Theme from './screens/Theme.svelte';
  import Welcome from './screens/Welcome.svelte';
  import WordMap from './screens/Map.svelte';
  import { applyLook } from './lib/look';
  import { closeDetails, details } from './lib/details.svelte';
  import WordDetails from './components/WordDetails.svelte';

  $effect(() => {
    document.documentElement.dataset.palette = app.save.settings.palette;
  });
  $effect(() => {
    // Until a look is picked, Welcome previews looks itself; afterwards the saved one applies.
    if (app.save.settings.look) applyLook(app.save.settings.look);
  });
  loadData();

  const r = $derived(router.route);
  // Re-create a screen whenever the route changes, so each run and each visit starts fresh.
  const key = $derived(JSON.stringify(r) + (r.name === 'play' ? Math.random() : ''));
  // A new screen closes the details sheet (a docked panel stays).
  $effect(() => {
    key;
    if (!details.docked) closeDetails();
  });
</script>

{#if app.error}
  <main class="screen"><p role="alert">{app.error}</p></main>
{:else if !app.ready}
  <main class="screen loading" aria-busy="true"><span class="jp">言葉の鎖</span><span class="small muted">Loading words…</span></main>
{:else if !app.save.settings.look}
  <Welcome />
{:else}
{#key key}
  {#if r.name === 'play'}
    <Play theme={r.theme} />
  {:else if r.name === 'theme'}
    <Theme theme={r.theme} />
  {:else if r.name === 'summary'}
    <Summary />
  {:else if r.name === 'search'}
    <Search />
  {:else if r.name === 'settings'}
    <Settings />
  {:else if r.name === 'map'}
    <WordMap />
  {:else}
    <Home />
  {/if}
{/key}
<WordDetails />
{/if}

<style>
  .loading { align-items: center; justify-content: center; gap: 8px; }
  .loading .jp { font-size: 22px; font-weight: 600; }
</style>
