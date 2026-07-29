import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyBoard,
  formatTime,
  getOrGenerateNetworkUid,
  md5,
} from './utils';

describe('shared utilities', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('formats timers and invalid values', () => {
    expect(formatTime(330)).toBe('05:30');
    expect(formatTime(-1)).toBe('--:--');
    expect(formatTime(null)).toBe('--:--');
  });

  it('creates independent rows and falls back for invalid board sizes', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const board = createEmptyBoard(2, 3, 19, 11);

    expect(board).toHaveLength(11);
    expect(board[0]).not.toBe(board[1]);
    expect(warning).toHaveBeenCalledOnce();
  });

  it('generates and reuses a valid browser network id', () => {
    const first = getOrGenerateNetworkUid();
    const second = getOrGenerateNetworkUid();

    expect(first).toBe(second);
    expect(first).toMatch(/^web-[A-Za-z0-9_-]+$/);
    expect(first.length).toBeLessThanOrEqual(64);
  });

  it('hashes known UTF-8 input with MD5', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5('Hex')).toBe('92640bd72988395b326c888614f8937a');
    expect(md5('こんにちは')).toBe('c0e89a293bd36c7a768e4e9d2c5475a8');
  });
});
