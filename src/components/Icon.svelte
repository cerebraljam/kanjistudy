<script lang="ts">
  let { name }: { name: 'close' | 'back' | 'search' | 'sliders' | 'trash' | 'map' } = $props();
</script>

<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'close'}
    <path d="M6 6l12 12M18 6L6 18" />
  {:else if name === 'back'}
    <path d="M15 5l-7 7 7 7" />
  {:else if name === 'search'}
    <circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" />
  {:else if name === 'sliders'}
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" />
  {:else if name === 'map'}
    <g fill="currentColor" stroke="none"><circle cx="6" cy="7" r="1.6" /><circle cx="10" cy="5" r="1.6" /><circle cx="8.5" cy="10" r="1.6" /><circle cx="16" cy="8" r="1.6" /><circle cx="18.5" cy="12" r="1.6" /><circle cx="14.5" cy="13" r="1.6" /><circle cx="7" cy="16" r="1.6" /><circle cx="11" cy="18.5" r="1.6" /><circle cx="16.5" cy="18" r="1.6" /></g>
  {:else if name === 'trash'}
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" />
  {/if}
</svg>
