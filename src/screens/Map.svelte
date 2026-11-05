<script lang="ts">
  // Every word at a fixed place (related words close together), colored by progress.
  // Two zoom levels only: tap a spot to zoom in on it, tap it again (or Zoom out) to come back,
  // tap elsewhere to move there. Dragging pans the close-up; there is no pinch or wheel zoom.
  import { onDestroy, onMount } from 'svelte';
  import { app, AREA_THEME, loadMap, save, setAreaTheme } from '../lib/app.svelte';
  import { levelFor } from '../lib/levels';
  import { mastery, wordStatus, type WordStatus } from '../lib/progress';
  import { go, href } from '../lib/router.svelte';
  import { CATEGORIES } from '../lib/types';
  import { areaLabel, clampCenter, nearest, wordLabel, ZOOM, type MapLabels, type WordMap } from '../lib/wordmap';
  import Icon from '../components/Icon.svelte';

  const g = app.graph;
  const p = app.save.progress;
  const goal = app.save.settings.goal;

  let map = $state<WordMap | null>(null);
  let error = $state('');
  let status: WordStatus[] = [];
  const STATES: WordStatus[] = ['unseen', 'shaky', 'solid'];

  // Totals, and solid words per JLPT level.
  const all = [...g.words.values()];
  const counts = { unseen: 0, shaky: 0, solid: 0 };
  const byLevel = new Map<number, { total: number; solid: number; shaky: number }>();
  for (const w of all) {
    const s = wordStatus(g, p, w.id);
    counts[s]++;
    const l = byLevel.get(w.jlpt ?? 0) ?? { total: 0, solid: 0, shaky: 0 };
    l.total++;
    if (s === 'solid') l.solid++;
    if (s === 'shaky') l.shaky++;
    byLevel.set(w.jlpt ?? 0, l);
  }
  const levels = [5, 4, 3, 2, 1, 0].map((l) => ({ name: l ? `N${l}` : 'Other', ...byLevel.get(l)! })).filter((l) => l.total);
  const lv = levelFor(counts.solid);
  const pctOf = (n: number) => (all.length ? (n / all.length) * 100 : 0);

  const labels = $derived(app.save.settings.mapLabels);
  function setLabels(m: MapLabels) {
    app.save.settings.mapLabels = m;
    save();
  }

  // ---- view: scale 1 (everything) or ZOOM (close-up), center in map coordinates ----
  let canvas: HTMLCanvasElement | undefined = $state();
  let box: HTMLDivElement | undefined = $state();
  let size = 0;
  const view = { s: 1, cx: 0.5, cy: 0.5 };
  let target = { s: 1, cx: 0.5, cy: 0.5 };
  let zoomed = $state(false);
  let selected = $state<{ x: number; y: number; words: number[] } | null>(null);
  const INNER = 0.94; // the map fills 94% of the box, leaving room for edge labels

  const toScreen = (u: number, c: number) => size / 2 + (u - c) * view.s * size * INNER;
  const toMap = (px: number, c: number) => c + (px - size / 2) / (view.s * size * INNER);

  function select(x: number, y: number) {
    if (!map) return;
    selected = { x, y, words: nearest(map, x, y, 40) };
  }

  function zoomTo(x: number, y: number) {
    target = { s: ZOOM, cx: clampCenter(x, ZOOM), cy: clampCenter(y, ZOOM) };
    zoomed = true;
    animate();
  }

  function zoomOut() {
    target = { s: 1, cx: 0.5, cy: 0.5 };
    zoomed = false;
    selected = null;
    animate();
  }

  let raf = 0;
  function animate() {
    cancelAnimationFrame(raf);
    const from = { ...view };
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 260);
      const e = 1 - (1 - t) ** 3;
      view.s = from.s + (target.s - from.s) * e;
      view.cx = from.cx + (target.cx - from.cx) * e;
      view.cy = from.cy + (target.cy - from.cy) * e;
      draw();
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  // ---- pointer: a short tap selects, anything that moves is a drag (pans when zoomed) ----
  let down: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
  function local(e: PointerEvent) {
    const r = canvas!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function onpointerdown(e: PointerEvent) {
    const l = local(e);
    down = { ...l, cx: view.cx, cy: view.cy, moved: false };
    canvas!.setPointerCapture(e.pointerId);
  }
  function onpointermove(e: PointerEvent) {
    if (!down) return;
    const l = local(e);
    if (Math.hypot(l.x - down.x, l.y - down.y) > 6) down.moved = true;
    if (down.moved && zoomed) {
      const k = view.s * size * INNER;
      view.cx = target.cx = clampCenter(down.cx - (l.x - down.x) / k, view.s);
      view.cy = target.cy = clampCenter(down.cy - (l.y - down.y) / k, view.s);
      draw();
    }
  }
  function onpointerup(e: PointerEvent) {
    if (!down) return;
    const wasDrag = down.moved;
    down = null;
    if (wasDrag) return;
    const l = local(e);
    const x = toMap(l.x, view.cx);
    const y = toMap(l.y, view.cy);
    if (!zoomed) {
      select(x, y);
      zoomTo(x, y);
    } else if (selected && Math.hypot(toScreen(selected.x, view.cx) - l.x, toScreen(selected.y, view.cy) - l.y) < 30) {
      zoomOut();
    } else {
      select(x, y);
      zoomTo(x, y);
    }
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (zoomed) zoomOut();
    else go(href.home());
  }

  // ---- drawing ----
  function css(name: string) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function draw() {
    if (!canvas || !map || !size) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = { unseen: css('--map-unseen'), shaky: css('--map-learning'), solid: css('--map-solid') };
    const bg = css('--bg');
    const ink = css('--ink');
    const accent = css('--accent');
    const jpFont = css('--jp');
    const uiFont = css('--ui');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    const r = Math.max(1, (size / 400) * (1.05 + (view.s - 1) * 0.4));
    const m = map;
    for (const st of STATES) {
      ctx.fillStyle = colors[st];
      ctx.beginPath();
      for (let i = 0; i < m.ids.length; i++) {
        if (status[i] !== st) continue;
        const x = toScreen(m.x[i], view.cx);
        const y = toScreen(m.y[i], view.cy);
        if (x < -4 || y < -4 || x > size + 4 || y > size + 4) continue;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    if (selected) {
      const far = selected.words[selected.words.length - 1];
      const rad = Math.max(18, Math.hypot(toScreen(m.x[far], view.cx) - toScreen(selected.x, view.cx), toScreen(m.y[far], view.cy) - toScreen(selected.y, view.cy)));
      ctx.beginPath();
      ctx.arc(toScreen(selected.x, view.cx), toScreen(selected.y, view.cy), rad, 0, Math.PI * 2);
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.strokeStyle = accent;
      ctx.stroke();
    }

    // Labels: area names zoomed out; words near the center when zoomed in. Never overlapping.
    const placed: [number, number, number, number][] = [];
    const label = (text: string, jp: boolean, x: number, y: number, color: string, px: number, weight: number) => {
      ctx.font = `${weight} ${px}px ${jp ? jpFont : uiFont}`;
      const w = ctx.measureText(text).width;
      const box: [number, number, number, number] = [x - w / 2 - 3, y - px / 2 - 2, x + w / 2 + 3, y + px / 2 + 2];
      if (box[0] < 0 || box[2] > size || box[1] < 0 || box[3] > size) return false;
      if (placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) return false;
      placed.push(box);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = bg;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      return true;
    };
    if (view.s < 2) {
      for (const a of m.areas) {
        const t = g.themes.get(a.theme);
        const l = areaLabel(a, !!t && mastery(g, p, a.theme) >= goal, labels);
        label(l.text, l.jp, toScreen(a.fx, view.cx), toScreen(a.fy, view.cy), ink, size < 420 ? 11 : 13, 700);
      }
    } else {
      // Every visible word is a candidate, nearest the center first: labels fill the view outward.
      const color = { unseen: css('--muted'), shaky: colors.shaky, solid: colors.solid };
      const half = 0.5 / (view.s * INNER);
      const seen: { i: number; d: number }[] = [];
      for (let i = 0; i < m.ids.length; i++) {
        const dx = m.x[i] - view.cx;
        const dy = m.y[i] - view.cy;
        if (Math.abs(dx) < half && Math.abs(dy) < half) seen.push({ i, d: dx * dx + dy * dy });
      }
      seen.sort((a, b) => a.d - b.d);
      const max = Math.round((size * size) / 3000);
      let shown = 0;
      for (const { i } of seen) {
        const x = toScreen(m.x[i], view.cx);
        const y = toScreen(m.y[i], view.cy) - r - 8;
        const l = wordLabel(g, m.ids[i], status[i], labels);
        if (label(l.text, l.jp, x, y, color[status[i]], l.jp ? 13 : 11, l.jp ? 600 : 500) && ++shown >= max) break;
      }
    }
  }

  function resize() {
    if (!canvas || !box) return;
    size = box.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = canvas.style.height = `${size}px`;
    draw();
  }

  let ro: ResizeObserver | undefined;
  onMount(() => {
    loadMap()
      .then((m) => {
        status = m.ids.map((id) => wordStatus(g, p, id));
        map = m;
        queueMicrotask(resize);
      })
      .catch((e) => (error = `The map could not be loaded (${(e as Error).message}).`));
    ro = new ResizeObserver(resize);
    if (box) ro.observe(box);
  });
  onDestroy(() => {
    ro?.disconnect();
    cancelAnimationFrame(raf);
  });
  // Redraw when the label language changes.
  $effect(() => {
    labels;
    draw();
  });

  // ---- the selected area ----
  const area = $derived.by(() => {
    if (!selected || !map) return null;
    const ids = selected.words.map((i) => map!.ids[i]);
    const tally = new Map<string, number>();
    for (const w of ids) for (const t of g.themesOf(w)) if (t !== AREA_THEME && g.themeList.some((x) => x.id === t)) tally.set(t, (tally.get(t) ?? 0) + 1);
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => g.themes.get(t)!);
    const words = selected.words.map((i) => ({ id: map!.ids[i], status: status[i] }));
    return {
      ids,
      top,
      solid: words.filter((w) => w.status === 'solid').length,
      chips: words.slice(0, 14).map((w) => ({ ...w, ...wordLabel(g, w.id, w.status, labels) })),
    };
  });

  function playArea() {
    if (!area) return;
    const name = area.top[0];
    setAreaTheme(area.ids, name ? `${name.jp}のあたり` : '地図のあたり', name ? `Around ${name.en}` : 'Map area');
    go(href.play(AREA_THEME));
  }
</script>

<svelte:window {onkeydown} />

<main class="screen map-screen">
  <header class="topbar">
    <a class="icon-btn edge-left" href={href.home()} aria-label="Back to home"><Icon name="back" /></a>
    <h1>Your vocabulary</h1>
    <span class="lv">Lv {lv.level}</span>
  </header>

  <section class="totals" aria-label="Words by status">
    <div class="tbar" aria-hidden="true">
      <span class="solid" style:width="{pctOf(counts.solid)}%"></span>
      <span class="shaky" style:width="{pctOf(counts.shaky)}%"></span>
    </div>
    <div class="legend small">
      <span><i class="dot solid"></i><b>{counts.solid.toLocaleString()}</b> solid</span>
      <span><i class="dot shaky"></i><b>{counts.shaky.toLocaleString()}</b> learning</span>
      <span><i class="dot unseen"></i><b>{counts.unseen.toLocaleString()}</b> not yet</span>
    </div>
  </section>

  <div class="segmented" role="group" aria-label="Map labels">
    <button aria-pressed={labels === 'en'} onclick={() => setLabels('en')}>English</button>
    <button aria-pressed={labels === 'mix'} onclick={() => setLabels('mix')}>Mix</button>
    <button aria-pressed={labels === 'jp'} onclick={() => setLabels('jp')} class="jp">日本語</button>
  </div>

  <div class="map-box" bind:this={box}>
    {#if error}
      <p class="small muted center" role="alert">{error}</p>
    {:else if !map}
      <p class="small muted center">Placing {all.length.toLocaleString()} words…</p>
    {/if}
    <canvas
      bind:this={canvas}
      aria-label="Map of {all.length} words placed by topic: {counts.solid} solid, {counts.shaky} learning"
      {onpointerdown}
      {onpointermove}
      {onpointerup}
      onpointercancel={() => (down = null)}
    ></canvas>
    {#if zoomed}
      <button class="btn small zoom-out" onclick={zoomOut}>Zoom out</button>
    {/if}
  </div>
  {#if !zoomed}<p class="tiny muted center">Tap anywhere to see what lives there.</p>{/if}

  {#if area}
    <section class="sheet" aria-live="polite">
      <div class="sheet-head">
        <span class="title">
          <span class="jp">{area.top.map((t) => t.jp).join(' · ')}</span>
          <span class="en">{area.top.map((t) => t.en).join(' · ')}</span>
        </span>
        <span class="small muted">{area.solid} of {area.ids.length} solid</span>
      </div>
      <div class="chips">
        {#each area.chips as c (c.id)}<span class="chip {c.status}" class:jp={c.jp}>{c.text}</span>{/each}
      </div>
      <div class="actions">
        {#if area.top[0]}<a class="btn small" href={href.theme(area.top[0].id)}>Open <span class="jp">{area.top[0].jp}</span></a>{/if}
        <button class="btn small primary" onclick={playArea}>Play this area</button>
      </div>
    </section>
  {:else}
    <section class="sheet">
      <h2 class="label">By JLPT level</h2>
      <table class="levels">
        <tbody>
          {#each levels as l (l.name)}
            <tr>
              <th scope="row">{l.name}</th>
              <td class="lbar-cell">
                <div class="tbar thin" aria-hidden="true">
                  <span class="solid" style:width="{(l.solid / l.total) * 100}%"></span>
                  <span class="shaky" style:width="{(l.shaky / l.total) * 100}%"></span>
                </div>
              </td>
              <td class="num"><b>{Math.round((l.solid / l.total) * 100)}%</b> · {l.solid.toLocaleString()} / {l.total.toLocaleString()}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="tiny muted">{CATEGORIES.length} areas of life, {g.themeList.length} themes, {all.length.toLocaleString()} words.</p>
    </section>
  {/if}
</main>

<style>
  /* The map wants room: wider than the other screens on a big display. */
  .map-screen { max-width: 760px; gap: 14px; }
  .topbar h1 { flex-grow: 1; }
  .lv { padding: 6px 10px; border-radius: 10px; font-size: 13px; font-weight: 700; background: var(--accent-soft); color: var(--accent-ink); }
  :global([data-look='arcade']) .lv { background: var(--accent); color: var(--on-primary); box-shadow: 0 3px 0 var(--primary-edge); }

  .totals { display: flex; flex-direction: column; gap: 8px; }
  .tbar { height: 8px; border-radius: 4px; display: flex; overflow: hidden; background: var(--map-unseen); }
  .tbar.thin { height: 6px; border-radius: 3px; }
  .tbar .solid { background: var(--map-solid); }
  .tbar .shaky { background: var(--map-learning); }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; color: var(--muted); }
  .legend span { display: inline-flex; align-items: center; gap: 5px; }
  .legend b { color: var(--ink); font-weight: 600; }
  .dot { width: 8px; height: 8px; border-radius: 4px; display: inline-block; }
  .dot.solid { background: var(--map-solid); }
  .dot.shaky { background: var(--map-learning); }
  .dot.unseen { background: var(--map-unseen-strong); }

  /* Square, as large as the width allows while leaving room for the sheet. */
  .map-box {
    position: relative; width: min(100%, calc(100dvh - 330px)); min-width: min(100%, 300px); aspect-ratio: 1;
    align-self: center; border-radius: 16px; overflow: hidden; border: 1px solid var(--line); background: var(--bg);
  }
  .map-box > p { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  canvas { display: block; touch-action: none; cursor: pointer; }
  .zoom-out { position: absolute; top: 10px; right: 10px; background: var(--bg); }
  .center { text-align: center; }

  .sheet { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 18px; background: var(--soft); }
  :global([data-look='arcade']) .sheet { box-shadow: 0 4px 0 var(--tile-edge); }
  .sheet-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .title { font-size: 17px; font-weight: 700; display: flex; flex-direction: column; gap: 2px; }
  .title .en { font-size: 13px; font-weight: 400; color: var(--muted); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { padding: 4px 9px; border-radius: 8px; font-size: 13px; background: var(--bg); color: var(--muted); }
  .chip.jp { font-size: 14px; }
  .chip.solid { background: var(--right-bg); color: var(--map-solid); }
  .chip.shaky { color: var(--map-learning); }
  .actions { display: grid; grid-template-columns: 1fr 1.4fr; gap: 10px; }

  .levels { width: 100%; border-collapse: collapse; font-size: 14px; }
  .levels tr + tr { border-top: 1px solid var(--line); }
  .levels th { text-align: left; font-weight: 600; padding: 7px 0; width: 56px; }
  .lbar-cell { padding: 7px 12px 7px 0; width: 100%; }
  .num { text-align: right; white-space: nowrap; color: var(--muted); font-variant-numeric: tabular-nums; }
  .num b { color: var(--ink); }
</style>
