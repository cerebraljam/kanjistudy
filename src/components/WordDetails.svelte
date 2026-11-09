<script lang="ts">
  // Word details: meaning, example, links, and for Japanese each kanji with its readings and the
  // other words written with it, colored by how well they are known. Opened by tapping a word
  // already answered (trail, card, Theme page, map). Phones: a bottom sheet that closes on any tap
  // outside it, and offers Continue during a run. Wide screens: a side panel that stays open.
  import { app, AREA_THEME, setAreaTheme, study } from '../lib/app.svelte';
  import { closeDetails, details, kanjiIn, loadKanji, showWord, splitKun, wordsWith, type KanjiInfo } from '../lib/details.svelte';
  import { levelName, readingText } from '../lib/display';
  import { toRomaji } from '../lib/kana';
  import { wordStatus, type WordStatus } from '../lib/progress';
  import { go, href } from '../lib/router.svelte';
  import { Q_META, type EdgeType, type WordId } from '../lib/types';
  import Icon from './Icon.svelte';

  const MAX_CHIPS = 18;
  const PLAY_MAX = 30;

  let panel = $state<HTMLElement>();
  let kanji = $state<Map<string, KanjiInfo> | null>(null);
  let kanjiError = $state('');

  $effect(() => {
    const wide = matchMedia('(min-width: 1000px)');
    details.docked = wide.matches;
    const on = (e: MediaQueryListEvent) => (details.docked = e.matches);
    wide.addEventListener('change', on);
    return () => wide.removeEventListener('change', on);
  });

  const g = $derived(app.graph);
  const s = $derived(app.save.settings);
  const w = $derived(details.word ? (g.words.get(details.word) ?? null) : null);
  const asking = $derived(details.asking ? (g.words.get(details.asking) ?? null) : null);
  // Never the answer to the question on screen: the asked word, and its kanji, stay hidden.
  const masked = $derived(!!w && details.asking === w.id);
  const secret = (k: string) => !!asking && asking.jp.includes(k);

  $effect(() => {
    if (w && study === 'ja' && !kanji && !kanjiError) {
      loadKanji()
        .then((m) => (kanji = m))
        .catch((e) => (kanjiError = `Kanji readings could not load (${(e as Error).message}).`));
    }
  });

  const status = (id: WordId): WordStatus => wordStatus(g, app.save.progress, id);
  const STATUS: Record<WordStatus, string> = { solid: 'solid', shaky: 'learning', unseen: 'not seen yet' };
  const join = (xs: string[]) => xs.join(xs[0] && /[a-z]/i.test(xs[0]) ? ', ' : '、');

  const ORDER: EdgeType[] = ['syn', 'ant', 'rel'];
  const links = $derived(
    w
      ? ORDER.map((type) => ({ type, ids: g.neighbors(w.id).filter((n) => n.type === type).map((n) => n.to) })).filter((l) => l.ids.length)
      : [],
  );
  const sets = $derived(w && study === 'ja' ? kanjiIn(w.jp).map((k) => ({ k, all: wordsWith(g, k) })) : []);

  const on = (r: string) => (s.katakana ? r : toRomaji(r).toUpperCase());
  const kun = (r: string) => (s.hiragana ? r : toRomaji(r));

  // The map's one slot for a run of chosen words: replaced each time, never piling up in the lists.
  function playKanji(k: string) {
    setAreaTheme(wordsWith(g, k).slice(0, PLAY_MAX), `${k}の言葉`, `Words with ${k}`);
    closeDetails();
    go(href.play(AREA_THEME));
  }

  function proceed() {
    const next = details.next;
    closeDetails();
    next?.();
  }

  // The sheet closes on any tap outside it; the tap still does what it was for.
  function outside(e: PointerEvent) {
    if (w && !details.docked && panel && !panel.contains(e.target as Node)) closeDetails();
  }
</script>

<svelte:document onpointerdown={outside} />
<svelte:window onkeydown={(e) => e.key === 'Escape' && w && closeDetails()} />

{#if w}
  <aside class="details" class:docked={details.docked} bind:this={panel} aria-label="Word details">
    <div class="top">
      {#if !details.docked}<button class="handle" aria-label="Close details" onclick={closeDetails}></button>{/if}
      <button class="icon-btn close" aria-label="Close details" onclick={closeDetails}><Icon name="close" /></button>
    </div>
    <div class="body">
      {#if masked}
        <p class="muted small">Answer the question first: this word's details come back right after.</p>
      {:else}
        <header class="head">
          <span class="big jp">{w.jp}</span>
          {#if w.kana && w.kana !== w.jp}<span class="reading jp">{readingText(w.kana, s)}</span>{/if}
          <span class="tiny muted">{STATUS[status(w.id)]}{w.jlpt !== undefined ? ` · ${levelName(w.jlpt)}` : ''}</span>
        </header>
        <p class="meaning" class:jp={study === 'en'}>{join(w.en)}</p>
        {#if w.ex}
          <div class="ex">
            <p class:jp={study === 'ja'}>{w.ex.jp}</p>
            <p class="small muted" class:jp={study === 'en'}>{w.ex.en}</p>
          </div>
        {/if}

        {#each links as l (l.type)}
          <div class="links">
            <span class="glyph-chip" title={Q_META[l.type].label}>{Q_META[l.type].glyph}</span>
            <div class="chips">
              {#each l.ids.slice(0, MAX_CHIPS) as id (id)}
                {@render chip(id)}
              {/each}
            </div>
          </div>
        {/each}

        {#each sets as set (set.k)}
          {@const info = kanji?.get(set.k)}
          {@const others = set.all.filter((id) => id !== w.id)}
          <section class="kanji">
            <div class="khead">
              <span class="kbig jp">{set.k}</span>
              <div class="kinfo">
                {#if secret(set.k)}
                  <span class="muted small">Readings after you answer.</span>
                {:else if info}
                  <span class="strong">{info.en.join(', ')}</span>
                  {#if info.on.length}<span class="small"><span class="tag">On</span> <span class="jp">{info.on.map(on).join('、')}</span></span>{/if}
                  {#if info.kun.length}
                    <span class="small"><span class="tag">Kun</span>
                      {#each info.kun as r, i (r)}{@const [stem, oku] = splitKun(kun(r))}<span class="jp">{i ? '、' : ''}{stem}{#if oku}<span class="oku">{oku}</span>{/if}</span>{/each}
                    </span>
                  {/if}
                  <span class="tiny muted">{info.strokes} strokes</span>
                {:else if kanjiError}
                  <span class="tiny muted">{kanjiError}</span>
                {/if}
              </div>
            </div>
            {#if others.length}
              <div class="chips">
                {#each others.slice(0, MAX_CHIPS) as id (id)}{@render chip(id)}{/each}
                {#if others.length > MAX_CHIPS}<span class="tiny muted more">+{others.length - MAX_CHIPS} more</span>{/if}
              </div>
            {/if}
            {#if set.all.length >= 4}
              <button class="btn small" onclick={() => playKanji(set.k)}>Play {Math.min(set.all.length, PLAY_MAX)} words with <span class="jp">{set.k}</span></button>
            {/if}
          </section>
        {/each}
      {/if}
    </div>
    {#if details.next && !details.docked}
      <div class="foot"><button class="btn primary block" onclick={proceed}>Continue</button></div>
    {/if}
  </aside>
{/if}

{#snippet chip(id: WordId)}
  {@const x = g.word(id)}
  {@const st = status(id)}
  {#if id === details.asking}
    <!-- The word being asked about: no shortcut to its details, and in English its spelling is the answer. -->
    <span class="word-chip jp {st}" aria-label="the word being asked about">{study === 'en' ? '…' : x.jp}</span>
  {:else}
    <button class="word-chip jp {st}" aria-label="{x.jp}, {STATUS[st]}: details" onclick={() => showWord(id)}>{x.jp}</button>
  {/if}
{/snippet}

<style>
  .details {
    position: fixed; z-index: 40; left: 0; right: 0; bottom: 0; max-height: 72dvh;
    display: flex; flex-direction: column; background: var(--bg); color: var(--ink);
    border-top: 1px solid var(--line-strong); border-radius: 20px 20px 0 0;
    box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.18);
    max-width: 560px; margin: 0 auto;
  }
  .details.docked {
    left: auto; top: 0; right: 0; bottom: 0; width: 360px; max-height: none; max-width: none; margin: 0;
    border-top: 0; border-left: 1px solid var(--line-strong); border-radius: 0; box-shadow: none;
  }
  .top { position: relative; display: flex; justify-content: center; align-items: center; min-height: 28px; padding-top: 6px; }
  .handle { width: 44px; height: 5px; border-radius: 3px; background: var(--line-strong); border: 0; padding: 0; cursor: pointer; }
  .close { position: absolute; right: 8px; top: 2px; }
  .docked .top { min-height: 52px; }
  .body { overflow-y: auto; padding: 4px 20px 20px; display: flex; flex-direction: column; gap: 14px; }
  .head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 12px; padding-right: 40px; }
  .big { font-size: 34px; font-weight: 600; line-height: 1.2; }
  .reading { font-size: 18px; color: var(--muted); }
  .head .tiny { flex-basis: 100%; }
  .meaning { font-size: 16px; }
  .ex { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 12px; background: var(--soft); }
  .ex p { margin: 0; }
  .links { display: flex; gap: 10px; align-items: flex-start; }
  .links .glyph-chip { margin-top: 7px; flex-shrink: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .chips .word-chip { font-size: 14px; min-height: 32px; padding: 4px 9px; }
  .more { padding: 0 4px; }
  .kanji { display: flex; flex-direction: column; gap: 10px; padding-top: 14px; border-top: 1px solid var(--line); }
  .khead { display: flex; gap: 14px; align-items: flex-start; }
  .kbig { font-size: 44px; line-height: 1; padding: 4px 10px 8px; border-radius: 12px; background: var(--soft); }
  .kinfo { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .strong { font-weight: 600; }
  .tag { display: inline-block; min-width: 30px; font-size: 11px; font-weight: 600; color: var(--muted); }
  .oku { color: var(--muted); }
  /* A hint of the look's accent: it starts a run, unlike the word chips around it. */
  .kanji .btn { align-self: flex-start; border-color: color-mix(in srgb, var(--accent) 55%, var(--line-strong)); }
  .foot { padding: 10px 20px max(14px, env(safe-area-inset-bottom)); border-top: 1px solid var(--line); }
</style>
