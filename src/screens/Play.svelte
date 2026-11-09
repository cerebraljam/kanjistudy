<script lang="ts">
  import { onDestroy, tick as settled, untrack } from 'svelte';
  import { app, save, study } from '../lib/app.svelte';
  import { toRomaji, typeKana } from '../lib/kana';
  import { diffChars, levelLabel, linkReason, readingText, romajiUnder, rubyFor } from '../lib/display';
  import { wordStatus } from '../lib/progress';
  import { href, replace } from '../lib/router.svelte';
  import { Session, type Answered, type Option } from '../lib/session';
  import { closeDetails, details, showWord } from '../lib/details.svelte';
  import { isMove, Q_META } from '../lib/types';
  import Icon from '../components/Icon.svelte';
  import Trail from '../components/Trail.svelte';
  import WordText from '../components/WordText.svelte';

  let { theme: themeProp }: { theme: string } = $props();
  // Read once: App remounts this screen whenever the route changes.
  const theme = untrack(() => themeProp);

  const g = app.graph;
  const settings = app.save.settings;
  const t = g.themes.get(theme);
  const session = t ? new Session(g, app.save.progress, theme, { length: settings.runLength, rng: Math.random }) : null;
  if (t) {
    app.save.lastTheme = theme;
    save();
  }

  // The session is plain TS; bump `tick` after each change so the view re-reads it.
  let tick = $state(0);
  let answered = $state<Answered | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** A right answer waits instead of moving on while the details sheet is open. */
  let held = $state(false);
  onDestroy(() => {
    clearTimeout(timer);
    details.asking = null;
    details.next = null;
  });

  const view = $derived.by(() => {
    tick;
    if (!session || !session.question) return null;
    const q = session.question;
    const w = g.word(q.word);
    const status = wordStatus(g, app.save.progress, q.word);
    const done = session.history.length;
    return {
      q,
      word: w,
      // A spelling question shows the meaning: the word itself would be the answer.
      text: q.q === 'read' && w.spell && !answered ? w.en[0] : w.jp,
      ruby: answered ? null : rubyFor(w, status, settings, q.q === 'read'),
      reveal: answered ? [w.kana ? readingText(w.kana, settings) : '', w.en.slice(0, 2).join(/[a-z]/i.test(w.en[0]) ? ', ' : '、')].filter(Boolean).join(' · ') : '',
      meta: Q_META[q.q],
      trail: session.history.slice(-2),
      count: `${Math.min(done, session.length)} / ${session.length}`,
      pct: Math.min(1, done / session.length),
      chain: session.chain,
      results: session.history.map((h) => h.correct),
      rolling: session.rolling,
      wordSize: fit(w.jp, 60),
      // Hard mode: readings and spellings are typed.
      typing: settings.typeAnswers && q.q === 'read',
    };
  });

  // ---- typed answers ----
  let typed = $state('');
  let field = $state<HTMLInputElement>();
  // Each typed question starts empty, with the keyboard up.
  $effect(() => {
    if (view?.typing && !answered) {
      view.q;
      typed = '';
      settled().then(() => field?.focus());
    }
  });

  /** Romaji become kana as they are typed (like a Japanese keyboard), when the player reads hiragana. */
  function onType(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    if ((e as InputEvent).isComposing || study !== 'ja' || !settings.hiragana) {
      typed = input.value;
      return;
    }
    const { kana, pending } = typeKana(input.value);
    typed = input.value = kana + pending;
  }

  function submitTyped(e: SubmitEvent) {
    e.preventDefault();
    if (!session || answered) return;
    settle(session.answerTyped(typed));
  }

  /** What was typed, against the right answer, with the differences marked. */
  // In romaji for a player who does not read hiragana (the id keeps what was typed, the label its kana).
  const typedDiff = $derived.by(() => {
    if (!answered || answered.correct || !answered.picked.id.startsWith('typed:')) return null;
    const raw = answered.picked.id.slice('typed:'.length).trim().toLowerCase();
    const right = answered.question.options.find((o) => o.correct)!.label;
    if (study === 'ja' && !settings.hiragana) return diffChars(raw, toRomaji(right));
    return diffChars(answered.picked.label === '—' ? '' : answered.picked.label, right);
  });

  /** Font size for the word on the card: long English words get smaller, to fit a phone's width. */
  function fit(text: string, max: number) {
    const n = text.length;
    if (/[a-z]/i.test(text)) return `min(${n > 11 ? 28 : n > 8 ? 34 : n > 5 ? 42 : 52}px, 8dvh, ${Math.round(150 / Math.max(6, n))}vw)`;
    return `min(${n > 4 ? 44 : n > 3 ? 50 : max}px, 8dvh)`;
  }

  function optionRuby(o: Option) {
    if (!view || !isMove(view.q.q) || answered) return null;
    const w = g.words.get(o.id);
    return w ? rubyFor(w, wordStatus(g, app.save.progress, w.id), settings) : null;
  }

  function optionState(o: Option) {
    if (!answered) return '';
    if (o.correct) return 'right';
    return o.id === answered.picked.id ? 'wrong' : 'dim';
  }

  function pick(o: Option) {
    if (!session || answered) return;
    settle(session.answer(o.id));
  }

  function settle(a: Answered) {
    if (!session) return;
    answered = a;
    save();
    tick++;
    // A docked panel follows the run: the word the chain moved to, or the word just checked.
    if (details.docked && details.word) details.word = isMove(answered.question.q) ? answered.question.options.find((x) => x.correct)!.id : answered.question.word;
    if (answered.correct && settings.autoAdvance) {
      timer = setTimeout(() => {
        if (details.word && !details.docked) held = true;
        else next();
      }, 700);
    }
  }

  function next() {
    clearTimeout(timer);
    if (!session) return;
    if (!details.docked) closeDetails();
    held = false;
    answered = null;
    session.next();
    if (session.done) {
      app.save.runs.push(session.summary());
      save();
      replace(href.summary());
      return;
    }
    tick++;
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || !view) return;
    // Typing an answer: digits and Enter belong to the text field until it is answered.
    if (!answered && (e.target as HTMLElement)?.tagName === 'INPUT') return;
    const n = Number(e.key);
    if (!answered && n >= 1 && n <= view.q.options.length) {
      e.preventDefault();
      pick(view.q.options[n - 1]);
    } else if (answered && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      next();
    }
  }

  const nextLabel = $derived(
    answered && isMove(answered.question.q) ? `Continue from ${answered.question.options.find((o) => o.correct)!.label}` : 'Continue',
  );
  const peekWord = $derived(answered?.peek ? g.word(answered.peek) : null);
  // The details panel never answers the question on screen, and offers Continue while one waits.
  $effect(() => {
    details.asking = view && !answered ? view.q.word : null;
    details.next = answered ? next : null;
  });
  /** Why the right answer of a 関/同 question is linked to the word asked about. */
  const reason = $derived(
    answered && isMove(answered.question.q) ? linkReason(g, answered.question.word, answered.question.options.find((o) => o.correct)!.id, theme) : null,
  );
</script>

<svelte:window {onkeydown} />

{#if !t || !session || !view}
  <main class="screen">
    <p>This theme does not exist anymore.</p>
    <a class="btn" href={href.home()}>Home</a>
  </main>
{:else}
  <main class="screen play">
    <header class="head">
      <a class="icon-btn edge-left" href={href.home()} aria-label="End run"><Icon name="close" /></a>
      <div class="progress">
        <div class="meta small muted">
          <span>{t.jp} · {levelLabel(t.words.map((w) => g.word(w)))}</span>
          <span>{view.count}</span>
        </div>
        <div class="bar thin" role="progressbar" aria-valuenow={Math.round(view.pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Run progress">
          <span class="done" style:width="{view.pct * 100}%"></span>
        </div>
        <!-- Arcade's stage bar: one segment per question, green or red once answered. -->
        <div class="segments" aria-hidden="true" style:grid-template-columns="repeat({session.length}, minmax(0, 1fr))">
          {#each Array.from({ length: session.length }) as _, i}
            <span class:right={view.results[i] === true} class:wrong={view.results[i] === false} class:now={i === view.results.length}></span>
          {/each}
        </div>
      </div>
      <div class="chain small" class:hot={view.rolling} title="Right answers in a row">連鎖 <span class="x">×</span>{view.chain}</div>
    </header>

    <Trail entries={view.trail} graph={g} secret={view.q.q === 'read' && !answered ? (view.word.spell ? view.word.jp : (view.word.kana ?? null)) : null} />

    {#if peekWord && answered}
      <!-- A missed word the player had never seen: show it, then check it right away. -->
      <section class="stage peek" aria-label="New word">
        <div class="word-block">
          <span class="new-tag">New word</span>
          <button class="word-btn" aria-label="Details of {peekWord.jp}" onclick={() => showWord(peekWord.id)}>
            <WordText text={peekWord.jp} size={/[a-z]/i.test(peekWord.jp) ? fit(peekWord.jp, 56) : 56} />
          </button>
          {#if peekWord.kana && peekWord.kana !== peekWord.jp}
            <div class="peek-reading jp">{readingText(peekWord.kana, settings)}</div>
          {/if}
          <div class="peek-meaning muted">{peekWord.en.join(/[a-z]/i.test(peekWord.en[0]) ? ', ' : '、')}</div>
        </div>
        {#if isMove(answered.question.q) || peekWord.ex}
          <div class="peek-card">
            {#if isMove(answered.question.q)}
              {@const from = g.word(answered.question.word)}
              <div class="peek-link">
                <span class="glyph">{Q_META[answered.question.q].glyph}</span>
                <span>{Q_META[answered.question.q].label} to <b class="jp">{from.jp}</b> {from.en[0]}</span>
              </div>
              {#if reason}<p class="small muted">{reason}</p>{/if}
            {/if}
            {#if peekWord.ex}
              <p class="jp ex">{peekWord.ex.jp}</p>
              <p class="small muted">{peekWord.ex.en}</p>
            {/if}
          </div>
        {/if}
      </section>
      <footer class="foot">
        <button class="btn primary block" onclick={next}>Got it — quick check next</button>
      </footer>
    {:else}
      <section class="stage">
        <div class="word-block">
          {#if view.q.jump}<span class="tiny muted">New chain</span>{/if}
          <div class="card">
            <span class="seal" aria-hidden="true">{view.meta.glyph}</span>
            {#if answered}
              <!-- Answered: the word opens its details (never before, they would give the answer). -->
              <button class="word-btn" aria-label="Details of {view.word.jp}" onclick={() => showWord(view.word.id)}>
                <WordText text={view.text} ruby={view.ruby} size={view.text === view.word.jp ? view.wordSize : 'min(44px, 8dvh)'} />
              </button>
            {:else}
              <WordText text={view.text} ruby={view.ruby} size={view.text === view.word.jp ? view.wordSize : 'min(44px, 8dvh)'} />
            {/if}
            <div class="reveal small muted">{view.reveal}</div>
          </div>
        </div>
        <div class="prompt">
          <span class="glyph" aria-hidden="true">{view.meta.glyph}</span>
          <span>{view.typing ? (study === 'ja' ? 'Type the reading' : 'Type the word') : view.meta.prompt}</span>
        </div>
        <!-- Rebuilt for every question: a reused button would keep the last tap's touch/hover state,
             and the same word can be the right answer twice in a row (関 to it, then 意 on it). -->
        {#key view.q}
        {#if view.typing}
          <form class="typed" onsubmit={submitTyped}>
            <input
              bind:this={field}
              value={typed}
              oninput={onType}
              class="answer"
              class:latin={study === 'en' || !settings.hiragana}
              class:right={answered?.correct}
              class:wrong={answered && !answered.correct}
              disabled={!!answered}
              lang={study === 'en' ? 'en' : 'ja'}
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              enterkeyhint="done"
              aria-label={study === 'ja' ? 'Reading, in romaji or kana' : 'Spelling'}
              placeholder={study === 'en' ? 'Spelling' : settings.hiragana ? 'Romaji or kana' : 'Romaji'}
            />
            {#if !answered}
              <button class="btn primary">{typed.trim() ? 'Check' : 'Show answer'}</button>
            {:else if typedDiff}
              <div class="diff" aria-label="Your answer, then the right one">
                <span class="tiny muted">You typed</span>
                <span class="line" class:jp={study === 'ja'}>{#each typedDiff.typed as c, i (i)}<span class:miss={!c.ok}>{c.ch}</span>{:else}<span class="muted">nothing</span>{/each}</span>
                <span class="tiny muted">Right</span>
                <span class="line" class:jp={study === 'ja'}>{#each typedDiff.right as c, i (i)}<span class:fix={!c.ok}>{c.ch}</span>{/each}</span>
              </div>
            {/if}
          </form>
        {:else}
        <div class="options" class:six={view.q.options.length > 4}>
          {#each view.q.options as o, i (o.id)}
            {@const ruby = optionRuby(o)}
            {@const ro = romajiUnder(o.label, settings)}
            <button
              class="option {optionState(o)}"
              class:latin={/[a-z]/i.test(o.label)}
              class:word={view.q.q !== 'mean'}
              disabled={!!answered}
              aria-label={answered ? `${o.label}, ${o.gloss}${o.correct ? ', correct' : o.id === answered.picked.id ? ', your answer, wrong' : ''}` : undefined}
              onclick={() => pick(o)}
            >
              <span class="key" aria-hidden="true">{i + 1}</span>
              {#if /[a-z]/i.test(o.label)}
                <span class="label">{o.label}</span>
              {:else}
                <!-- Ruby never wraps: long labels (Japanese meanings) get smaller to stay inside the button. -->
                <WordText text={o.label} {ruby} size={o.label.length > 9 ? 14 : o.label.length > 6 ? 16 : o.label.length > 4 ? 18 : 22} />
              {/if}
              <!-- Always present, so the button keeps its size when the gloss appears. -->
              <span class="sub" class:empty={!answered && !ro}>{answered ? o.gloss : ro || '\u00a0'}</span>
            </button>
          {/each}
        </div>
        {/if}
        {/key}
      </section>
      <footer class="foot">
        {#if answered && (!answered.correct || !settings.autoAdvance || held)}
          {#if reason && !peekWord}<p class="small muted center reason">{reason}</p>{/if}
          <button class="btn primary block" onclick={next}>{nextLabel}</button>
        {:else if answered?.settled}
          <p class="center"><span class="chip gain">+1 solid · <span class="jp">{g.word(answered.settled).jp}</span></span></p>
        {:else if !answered && view.rolling}
          <p class="center"><span class="chip roll">On a roll · known words count faster</span></p>
        {:else if !answered && view.typing}
          <p class="small muted center">Enter to check. Right answers move on by themselves.</p>
        {:else if !answered}
          <p class="small muted center">Pick one. Right answers move on by themselves.</p>
        {/if}
      </footer>
    {/if}
  </main>
{/if}

<style>
  .play { gap: 0; padding-top: 12px; }
  .head { display: flex; align-items: center; gap: 12px; padding-bottom: 8px; }
  .progress { flex-grow: 1; display: flex; flex-direction: column; gap: 6px; }
  .meta { display: flex; justify-content: space-between; }
  .chain { min-width: 52px; text-align: right; font-weight: 600; color: var(--accent); font-family: var(--jp); }
  .chain .x { display: none; }
  .segments { display: none; gap: 3px; }
  .segments span { height: 8px; border-radius: 3px; background: var(--line); }
  .segments .right { background: var(--right); }
  .segments .wrong { background: var(--wrong); }
  .segments .now { background: var(--accent); }
  .typed { display: flex; flex-direction: column; gap: 10px; }
  .answer {
    height: clamp(56px, 9dvh, 72px); padding: 0 16px; border-radius: var(--radius); font-size: 26px; text-align: center;
    border: var(--tile-border) solid var(--line-strong); background: var(--tile); color: var(--ink); font-family: var(--jp);
  }
  .answer.latin { font-family: inherit; letter-spacing: 0.02em; }
  .answer:focus { outline: none; border-color: var(--accent); }
  .answer.right { border-color: var(--right); background: var(--right-bg); color: var(--right); }
  .answer.wrong { border-color: var(--wrong); background: var(--wrong-bg); color: var(--wrong); text-decoration: line-through; }
  .diff { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; align-items: baseline; padding: 4px 4px 0; }
  .diff .line { font-size: 22px; letter-spacing: 0.04em; }
  .diff .miss { color: var(--wrong); text-decoration: underline; text-underline-offset: 4px; }
  .diff .fix { color: var(--right); font-weight: 700; text-decoration: underline; text-underline-offset: 4px; }
  .word-btn { all: unset; cursor: pointer; border-radius: 12px; }
  .word-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
  .card { display: flex; flex-direction: column; align-items: center; gap: 10px; position: relative; }
  .seal { display: none; }
  .chip { display: inline-block; padding: 7px 14px; border-radius: 999px; font-size: 14px; font-weight: 600; }
  .chip.gain { background: var(--right-bg); color: var(--right); }
  .chip.roll { background: var(--accent-soft); color: var(--accent-ink); font-size: 13px; }

  /* Arcade: stage bar, combo badge, the word on a cream card with a seal, keys for answers. */
  :global([data-look='arcade']) .play .bar.thin { display: none; }
  :global([data-look='arcade']) .segments { display: grid; }
  :global([data-look='arcade']) .chain {
    display: flex; align-items: center; justify-content: center; gap: 1px; min-width: 60px; padding: 6px 10px;
    border-radius: 999px; background: var(--accent); color: var(--on-primary); font-weight: 800; font-size: 14px;
    box-shadow: 0 3px 0 var(--primary-edge);
  }
  :global([data-look='arcade']) .chain .x { display: inline; margin-left: 4px; }
  :global([data-look='arcade']) .chain.hot { background: #ffd27f; }
  :global([data-look='arcade']) .card {
    width: 100%; padding: clamp(14px, 3dvh, 26px) 20px clamp(10px, 2dvh, 18px); border-radius: 22px;
    background: var(--card); color: var(--card-ink); box-shadow: 0 6px 0 var(--tile-edge);
  }
  :global([data-look='arcade']) .card .reveal { color: var(--card-muted); }
  :global([data-look='arcade']) .card :global(rt) { color: var(--card-muted); }
  :global([data-look='arcade']) .seal {
    display: flex; position: absolute; top: 12px; right: 12px; width: 30px; height: 30px; border-radius: 6px;
    align-items: center; justify-content: center; transform: rotate(-6deg);
    background: var(--seal); color: var(--card); font-family: var(--jp); font-weight: 800; font-size: 17px;
  }
  :global([data-look='arcade']) .chip { font-weight: 800; }

  /* Sizes follow the screen height, so six options fit on a short screen (a tablet in landscape) without scrolling. */
  .stage { flex-grow: 1; display: flex; flex-direction: column; gap: clamp(10px, 2.4dvh, 20px); padding: clamp(6px, 2dvh, 16px) 0; }
  .word-block { flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; min-height: clamp(90px, 20dvh, 180px); text-align: center; }
  .reveal { min-height: 20px; }
  .prompt { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 500; }

  .options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  /* Fixed height: answering adds a gloss line, and nothing on screen should move when it does. */
  .option {
    position: relative; height: clamp(64px, 11dvh, 92px); padding: 8px 10px; overflow: hidden;
    border-radius: var(--radius); border: var(--tile-border) solid var(--line-strong); background: var(--tile);
    box-shadow: 0 var(--tile-lift) 0 var(--tile-edge); transition: transform 80ms, box-shadow 80ms;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    text-align: center; cursor: pointer;
  }
  .options.six .option { height: clamp(58px, 9.5dvh, 84px); }
  /* Short and wide (a tablet in landscape): use the width, six options in three columns. */
  @media (max-height: 700px) {
    .options { gap: 8px; }
    .foot { padding-top: 4px; }
  }
  @media (max-height: 700px) and (min-width: 700px) {
    .play { max-width: 640px; }
    .options.six { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  /* Only with a real mouse: on touch screens :hover sticks to the last button tapped. */
  @media (hover: hover) and (pointer: fine) {
    .option:hover:not(:disabled) { border-color: var(--ink); }
  }
  .option:disabled { cursor: default; }
  /* Arcade keys go down when pressed. */
  :global([data-look='arcade']) .option:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 2px 0 var(--tile-edge); }
  :global([data-look='arcade']) .option .label { font-weight: 700; }
  .option .label { font-size: 16px; font-weight: 500; }
  /* English words as answers (studying English): words, not glosses. */
  .option.word .label { font-size: 19px; color: inherit; }
  .option .sub {
    font-size: 12px; line-height: 1.3; color: var(--muted); max-width: 100%;
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .option .sub.empty { visibility: hidden; }
  .option.right { border-color: var(--right); background: var(--right-bg); color: var(--right); }
  .option.right .sub { color: var(--right); }
  .option.wrong { border-color: var(--wrong); background: var(--wrong-bg); color: var(--wrong); }
  .option.wrong .sub { color: var(--wrong); }
  .option.wrong :global(.jp), .option.wrong .label { text-decoration: line-through; }
  .option.dim { border-color: var(--line); color: var(--muted); }

  .foot { min-height: clamp(56px, 9dvh, 76px); display: flex; flex-direction: column; align-items: stretch; justify-content: center; gap: 6px; padding-top: 12px; }
  .reason { margin: 0; }
  .center { width: 100%; text-align: center; }

  .peek .word-block { gap: 8px; }
  .new-tag { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
  .peek-reading { font-size: 20px; }
  .peek-meaning { font-size: 17px; }
  .peek-card { border: 1px solid var(--line); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  .peek-link { display: flex; align-items: center; gap: 10px; font-size: 15px; }
  .peek-link b { font-weight: 600; }
  .ex { font-size: 15px; line-height: 1.6; }
</style>
