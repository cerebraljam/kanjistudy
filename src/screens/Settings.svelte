<script lang="ts">
  import { app, dataset, replaceSave, save } from '../lib/app.svelte';
  import { rubyFor } from '../lib/display';
  import { wordStatus } from '../lib/progress';
  import { href } from '../lib/router.svelte';
  import { exportSave, importSave, type Furigana } from '../lib/storage';
  import { deviceLook } from '../lib/look';
  import Icon from '../components/Icon.svelte';
  import LookPicker from '../components/LookPicker.svelte';
  import WordText from '../components/WordText.svelte';

  const s = $derived(app.save.settings);
  const g = app.graph;

  function set<K extends keyof typeof app.save.settings>(k: K, v: (typeof app.save.settings)[K]) {
    app.save.settings[k] = v;
    save();
  }

  const FURIGANA: { id: Furigana; label: string; help: string }[] = [
    { id: 'auto', label: 'Auto', help: 'Shown on new and shaky words, hidden once a word is solid.' },
    { id: 'always', label: 'Always', help: 'Shown on every kanji word, except on reading questions.' },
    { id: 'never', label: 'Never', help: 'Kanji only. You still see the reading after you answer.' },
  ];
  const GOALS = [0.8, 0.9, 0.95];
  const LENGTHS = [10, 20, 30];

  // Preview with real words: one solid-looking, one shaky, one katakana.
  const sample = ['shuusei', 'kaisatsu', 'bagu', 'kippu'].filter((id) => g.words.has(id));
  const previewWord = g.words.get('fuguai');
  const preview = $derived(
    sample.map((id) => {
      const w = g.word(id);
      const status = id === 'shuusei' ? 'solid' : wordStatus(g, app.save.progress, id);
      return { w, ruby: rubyFor(w, status, s) };
    }),
  );

  const note = $derived(
    !s.hiragana && !s.katakana
      ? 'Romaji above kanji and katakana words.'
      : !s.hiragana
        ? 'Hiragana off: furigana switch to romaji.'
        : !s.katakana
          ? 'Katakana off: katakana words get hiragana above.'
          : 'Furigana in hiragana.',
  );

  let backupNote = $state('');

  function download() {
    const blob = new Blob([exportSave($state.snapshot(app.save) as any)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kanjistudy-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    backupNote = 'Backup downloaded.';
  }

  async function restore(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const next = importSave(await f.text());
      const n = Object.keys(next.progress.links).length;
      if (!confirm(`Replace your progress on this device with this backup (${n} links, ${next.runs.length} runs)?`)) return;
      replaceSave(next);
      backupNote = 'Backup restored.';
    } catch (err) {
      backupNote = `That file is not a backup: ${(err as Error).message}`;
    }
  }
</script>

<main class="screen">
  <header class="topbar">
    <a class="icon-btn edge-left" href={href.home()} aria-label="Back to home"><Icon name="back" /></a>
    <h1>Settings</h1>
  </header>

  <section class="section">
    <h2 class="label">Look</h2>
    <LookPicker value={s.look ?? deviceLook()} device={deviceLook()} onpick={(l) => set('look', l)} />
  </section>

  <section class="section">
    <h2 class="label">I can read</h2>
    <div class="setting-row">
      <span class="grow"><span class="name">Hiragana</span><span class="small muted jp">あいうえお かきくけこ</span></span>
      <button class="switch" role="switch" aria-checked={s.hiragana} aria-label="I can read hiragana" onclick={() => set('hiragana', !s.hiragana)}></button>
    </div>
    <div class="setting-row">
      <span class="grow"><span class="name">Katakana</span><span class="small muted jp">アイウエオ カキクケコ</span></span>
      <button class="switch" role="switch" aria-checked={s.katakana} aria-label="I can read katakana" onclick={() => set('katakana', !s.katakana)}></button>
    </div>
  </section>

  <section class="section">
    <h2 class="label" id="furi">Furigana over kanji</h2>
    <div class="segmented" role="group" aria-labelledby="furi">
      {#each FURIGANA as f (f.id)}
        <button aria-pressed={s.furigana === f.id} onclick={() => set('furigana', f.id)}>{f.label}</button>
      {/each}
    </div>
    <p class="small muted">{FURIGANA.find((f) => f.id === s.furigana)?.help}</p>
  </section>

  {#if previewWord}
    <section class="preview" aria-label="Preview">
      <span class="tiny muted strong">Preview</span>
      <div class="pw">
        <WordText text={previewWord.jp} ruby={rubyFor(previewWord, 'shaky', s)} size={40} />
      </div>
      <div class="opts">
        {#each preview as o (o.w.id)}
          <span class="opt"><WordText text={o.w.jp} ruby={o.ruby} size={18} /></span>
        {/each}
      </div>
      <p class="tiny muted">{note} Reading questions never show furigana.</p>
    </section>
  {/if}

  <section class="section">
    <h2 class="label" id="goal">A theme is mastered when</h2>
    <div class="segmented" role="group" aria-labelledby="goal">
      {#each GOALS as v (v)}
        <button aria-pressed={s.goal === v} onclick={() => set('goal', v)}>{Math.round(v * 100)}% solid</button>
      {/each}
    </div>
  </section>

  <section class="section">
    <h2 class="label" id="len">Questions per run</h2>
    <div class="segmented" role="group" aria-labelledby="len">
      {#each LENGTHS as v (v)}
        <button aria-pressed={s.runLength === v} onclick={() => set('runLength', v)}>{v} · ~{Math.max(1, Math.round((v * 6) / 60))} min</button>
      {/each}
    </div>
    <div class="setting-row">
      <span class="grow"><span class="name">Move on after a right answer</span><span class="small muted">Off: always tap Continue</span></span>
      <button class="switch" role="switch" aria-checked={s.autoAdvance} aria-label="Move on after a right answer" onclick={() => set('autoAdvance', !s.autoAdvance)}></button>
    </div>
    <div class="setting-row">
      <span class="grow"><span class="name">Right and wrong colors</span><span class="small muted">Blue and orange are easier to tell apart for color blindness</span></span>
    </div>
    <div class="segmented" role="group" aria-label="Right and wrong colors">
      <button aria-pressed={s.palette === 'green-red'} onclick={() => set('palette', 'green-red')}>Green / red</button>
      <button aria-pressed={s.palette === 'blue-orange'} onclick={() => set('palette', 'blue-orange')}>Blue / orange</button>
    </div>
  </section>

  <section class="section">
    <h2 class="label">Backup</h2>
    <p class="small muted">Progress lives in this browser. Download a backup now and then, or to move to another device.</p>
    <div class="row">
      <button class="btn small" onclick={download}>Download backup</button>
      <label class="btn small file">
        Restore…
        <input class="sr-only" type="file" accept="application/json,.json" onchange={restore} />
      </label>
    </div>
    {#if backupNote}<p class="small muted" role="status">{backupNote}</p>{/if}
  </section>

  <section class="section credits">
    <h2 class="label">Credits</h2>
    <p class="small muted">
      Words and meanings: <a href="https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project">JMdict</a>
      by the Electronic Dictionary Research and Development Group, used under
      <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>{dataset.source ? ` (${dataset.source})` : ''}.
      JLPT levels: Jonathan Waller's <a href="http://www.tanos.co.uk/jlpt/">JLPT resources</a> (CC BY), matched to JMdict by
      <a href="https://github.com/stephenmk/yomitan-jlpt-vocab">yomitan-jlpt-vocab</a>.
      Example sentences: <a href="https://tatoeba.org">Tatoeba</a> (CC BY 2.0 FR).
      Word frequencies: <a href="https://github.com/rspeer/wordfreq">wordfreq</a>.
      Related-word links: <a href="https://fasttext.cc/docs/en/crawl-vectors.html">fastText</a> word vectors (CC BY-SA 3.0).
    </p>
  </section>
</main>

<style>
  .preview { display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 16px; background: var(--soft); }
  .strong { font-weight: 600; }
  .pw { display: flex; justify-content: center; padding: 4px 0; }
  .opts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .opt { min-height: 52px; border-radius: 12px; border: 1.5px solid var(--line-strong); background: var(--bg); display: flex; align-items: center; justify-content: center; padding: 6px; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .file { cursor: pointer; }
  .file:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
