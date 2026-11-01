<script lang="ts">
  // A Japanese word, with furigana (or romaji) above it when given.
  // The furigana line is always reserved, so the word never shifts when it appears or disappears.
  // `size` is in px, or any CSS length (the play screen scales its word with the screen height).
  let { text, ruby = null, size = 22, weight = 500 }: { text: string; ruby?: string | null; size?: number | string; weight?: number } = $props();
</script>

<ruby class="jp" style:font-size={typeof size === 'number' ? `${size}px` : size} style:font-weight={weight}>{text}<rt class:empty={!ruby} aria-hidden={!ruby}>{ruby || ' '}</rt></ruby>

<style>
  ruby { line-height: 1.15; }
  rt { font-size: max(11px, 0.32em); font-weight: 400; color: var(--muted); padding-bottom: 0.15em; }
  rt.empty { visibility: hidden; }
</style>
