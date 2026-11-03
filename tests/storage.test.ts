import { describe, expect, it } from 'vitest';
import { defaultSettings, freshSave, importSave, load, migrate, persist, SCHEMA, STORAGE_KEY, type Store } from '../src/lib/storage';

const memory = (init: Record<string, string> = {}): Store & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
};

describe('storage', () => {
  it('round-trips a save', () => {
    const s = freshSave();
    s.progress.links['m:x'] = { box: 3, n: 2, ok: 2, last: 5 };
    const store = memory();
    persist(s, store);
    expect(load(store).progress.links['m:x'].box).toBe(3);
  });

  it('fills in settings added after the save was made', () => {
    const old = { schema: SCHEMA, progress: { links: {}, step: 0, best: {} }, settings: { hiragana: false }, runs: [] };
    const s = migrate(old);
    expect(s.settings.hiragana).toBe(false);
    expect(s.settings.goal).toBe(defaultSettings().goal);
  });

  it('keeps an unreadable save aside instead of deleting it', () => {
    const store = memory({ [STORAGE_KEY]: '{not json' });
    const s = load(store);
    expect(s.progress.links).toEqual({});
    const aside = Object.keys(store.data).filter((k) => k.startsWith(`${STORAGE_KEY}.unreadable.`));
    expect(aside).toHaveLength(1);
    expect(store.data[aside[0]]).toBe('{not json');
  });

  it('refuses a backup from a newer version', () => {
    expect(() => importSave(JSON.stringify({ schema: SCHEMA + 1 }))).toThrow(/newer version/);
  });
});

describe('look', () => {
  it('is unset for saves made before looks existed, so the first-visit picker shows once', () => {
    const old = { schema: 1, progress: { links: {}, step: 0, best: {} }, settings: { goal: 0.9 }, runs: [] };
    const s = migrate(old);
    expect(s.settings.look).toBeNull();
    expect(s.settings.goal).toBe(0.9);
  });

  it('keeps a chosen look', () => {
    const s = migrate({ schema: 1, settings: { look: 'arcade' } });
    expect(s.settings.look).toBe('arcade');
  });
});
