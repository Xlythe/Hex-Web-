import { describe, expect, it } from 'vitest';
import {
  createUndoCommandParams,
  decodeHexMove,
  encodeHexMove,
  IGGC_POLL_INTERVAL_MS,
  isValidServerName,
  parseLegacyUndoEvent,
  parseRestartSessionId,
} from './igGameCenterProtocol';

describe('legacy Android igGameCenter protocol', () => {
  it('encodes and decodes the Android A1-style Hex coordinates', () => {
    expect(encodeHexMove({ r: 0, c: 0 }, 11)).toBe('A1');
    expect(encodeHexMove({ r: 6, c: 2 }, 11)).toBe('C7');
    expect(encodeHexMove({ r: 18, c: 18 }, 19)).toBe('S19');
    expect(decodeHexMove('c7', 11)).toEqual({
      kind: 'place',
      coordinate: { r: 6, c: 2 },
    });
    expect(decodeHexMove('SWAP', 11)).toEqual({ kind: 'swap' });
  });

  it('rejects malformed or out-of-board moves', () => {
    expect(decodeHexMove('0-1', 11)).toBeNull();
    expect(decodeHexMove('A0', 11)).toBeNull();
    expect(decodeHexMove('L1', 11)).toBeNull();
    expect(() => encodeHexMove({ r: 11, c: 0 }, 11)).toThrow(RangeError);
  });

  it('uses the original UNDO command fields', () => {
    expect(createUndoCommandParams('ASK', 12)).toEqual({
      type: 'ASK',
      move_ind: '12',
    });
    expect(createUndoCommandParams('ACCEPT')).toEqual({ type: 'ACCEPT' });
    expect(createUndoCommandParams('DENY')).toEqual({ type: 'DENY' });
    expect(createUndoCommandParams('FORBID')).toEqual({ type: 'FORBID' });
    expect(() => createUndoCommandParams('ASK')).toThrow(RangeError);
  });

  it('parses the original UNDOASK, UNDODONE, and RESTART events', () => {
    expect(parseLegacyUndoEvent({
      eid: '19',
      stamp: 1,
      uid: '7',
      type: 'UNDOASK',
      data: '12',
    })).toEqual({ kind: 'request', moveIndex: 12, requesterUid: '7' });
    expect(parseLegacyUndoEvent({
      eid: '20',
      stamp: 2,
      uid: '8',
      type: 'UNDODONE',
      data: '12',
    })).toEqual({ kind: 'completed', moveIndex: 12, requesterUid: '8' });
    expect(parseRestartSessionId({
      eid: '21',
      stamp: 3,
      uid: '7',
      type: 'RESTART',
      data: '9876',
    })).toBe('9876');
  });

  it('uses a conservative keep-alive interval and validates server routing', () => {
    expect(IGGC_POLL_INTERVAL_MS).toBe(15_000);
    expect(isValidServerName('gc1')).toBe(true);
    expect(isValidServerName('../other')).toBe(false);
    expect(isValidServerName('gc1.example.com')).toBe(false);
  });
});
