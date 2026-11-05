import { describe, expect, it } from 'vitest';
import { defaultSettings, freshSave, importSave, load, loadStudy, migrate, persist, persistStudy, recoverable, saveKey, SCHEMA, STORAGE_KEY, type Store } from '../src/lib/storage';

const memory = (init: Record<string, string> = {}): Store & { data: Record<string, string> } => {
  const data = { ...init };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => { data[k] = v; },
    get length() { return Object.keys(data).length; },
    key: (i) => Object.keys(data)[i] ?? null,
  };
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

const withProgress = () => {
  const s = freshSave();
  s.progress.links['m:x'] = { box: 3, n: 2, ok: 2, last: 5 };
  return s;
};

describe('keeping progress safe', () => {

  it('offers an unreadable-then-fixed or set-aside copy for restoring', () => {
    const store = memory({ [`${STORAGE_KEY}.unreadable.1`]: JSON.stringify(withProgress()), [`${STORAGE_KEY}.unreadable.2`]: '{broken' });
    const r = recoverable(store);
    expect(r).toHaveLength(1);
    expect(r[0].links).toBe(1);
  });

  it('copies an older-schema save before upgrading it', () => {
    const old = JSON.stringify({ ...withProgress(), schema: 0 });
    const store = memory({ [STORAGE_KEY]: old });
    try { load(store); } catch { /* no migration from 0 yet: the copy must exist anyway */ }
    expect(store.data[`${STORAGE_KEY}.schema0`]).toBe(old);
  });

  it('survives storage that throws, on read and on write', () => {
    const broken: Store = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(load(broken).progress.links).toEqual({});
    expect(persist(freshSave(), broken)).toBe(false);
  });

  it('remembers when the last backup was taken', () => {
    const s = migrate({ ...withProgress(), backupAt: 123 });
    expect(s.backupAt).toBe(123);
    expect(migrate({ schema: SCHEMA }).backupAt).toBeNull();
  });
});

describe('one save per language studied', () => {
  it('keeps English progress apart from Japanese progress', () => {
    const store = memory({});
    expect(loadStudy(store)).toBe('ja');
    persist(withProgress(), store, saveKey('ja'));
    persist(freshSave(), store, saveKey('en'));
    persistStudy('en', store);
    expect(loadStudy(store)).toBe('en');
    expect(Object.keys(load(store, saveKey('en')).progress.links)).toHaveLength(0);
    expect(Object.keys(load(store, saveKey('ja')).progress.links).length).toBeGreaterThan(0);
  });

  it('never offers one language\'s copies to the other', () => {
    const store = memory({ [`${STORAGE_KEY}.unreadable.1`]: JSON.stringify(withProgress()) });
    expect(recoverable(store, saveKey('en'))).toHaveLength(0);
    expect(recoverable(store, saveKey('ja'))).toHaveLength(1);
  });
});
