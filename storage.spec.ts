import { describe, expect, it, vi } from 'vitest';
import {
  safeStorageGet,
  safeStorageJson,
  safeStorageRemove,
  safeStorageSet,
  type StorageSubset,
} from './storage';

describe('resilient browser storage', () => {
  it('round-trips values and JSON', () => {
    const values = new Map<string, string>();
    const storage: StorageSubset = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
      removeItem: key => void values.delete(key),
    };

    expect(safeStorageSet('settings', '{"theme":"dark"}', storage)).toBe(true);
    expect(safeStorageGet('settings', storage)).toBe('{"theme":"dark"}');
    expect(safeStorageJson('settings', {}, storage)).toEqual({ theme: 'dark' });
    expect(safeStorageRemove('settings', storage)).toBe(true);
  });

  it('survives disabled or quota-exhausted storage', () => {
    const denied: StorageSubset = {
      getItem: vi.fn(() => { throw new DOMException('denied'); }),
      setItem: vi.fn(() => { throw new DOMException('quota'); }),
      removeItem: vi.fn(() => { throw new DOMException('denied'); }),
    };

    expect(safeStorageGet('session', denied)).toBeNull();
    expect(safeStorageSet('session', 'secret', denied)).toBe(false);
    expect(safeStorageRemove('session', denied)).toBe(false);
    expect(safeStorageJson('settings', { safe: true }, denied)).toEqual({ safe: true });
  });

  it('falls back on corrupt JSON', () => {
    const corrupt: StorageSubset = {
      getItem: () => '{',
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(safeStorageJson('games', [], corrupt)).toEqual([]);
  });
});
