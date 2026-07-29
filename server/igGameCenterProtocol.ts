import type { Coordinate, IgGameEvent } from '../types';

/**
 * The last production Android client encoded Hex coordinates as a column
 * letter followed by a one-based row number (for example, C7).
 */
const HEX_COLUMNS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const IGGC_POLL_INTERVAL_MS = 15_000;

/** Remaining delay required before another poll may begin. */
export const nextPollDelayMs = (
  nowMillis: number,
  lastPollStartedMillis: number,
  intervalMillis: number = IGGC_POLL_INTERVAL_MS,
): number => {
  if (lastPollStartedMillis <= 0) return 0;
  return Math.max(0, intervalMillis - (nowMillis - lastPollStartedMillis));
};

export type HexWireMove =
  | { kind: 'place'; coordinate: Coordinate }
  | { kind: 'swap' };

export type UndoCommandType = 'ASK' | 'ACCEPT' | 'DENY' | 'FORBID';

export interface LegacyUndoEvent {
  kind: 'request' | 'completed';
  moveIndex: number | null;
  requesterUid: string;
}

const assertBoardSize = (boardSize: number): void => {
  if (!Number.isInteger(boardSize) || boardSize < 1 || boardSize > HEX_COLUMNS.length) {
    throw new RangeError(`Unsupported Hex board size: ${boardSize}`);
  }
};

export const encodeHexMove = (coordinate: Coordinate, boardSize: number): string => {
  assertBoardSize(boardSize);
  const { r: row, c: column } = coordinate;
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(column) ||
    row < 0 ||
    column < 0 ||
    row >= boardSize ||
    column >= boardSize
  ) {
    throw new RangeError(`Hex coordinate is outside a ${boardSize}x${boardSize} board`);
  }
  return `${HEX_COLUMNS[column]}${row + 1}`;
};

export const decodeHexMove = (value: string, boardSize: number): HexWireMove | null => {
  assertBoardSize(boardSize);
  const normalized = value.trim().toUpperCase();
  if (normalized === 'SWAP') return { kind: 'swap' };

  const match = /^([A-Z])([1-9][0-9]*)$/.exec(normalized);
  if (!match) return null;

  const column = HEX_COLUMNS.indexOf(match[1]);
  const row = Number.parseInt(match[2], 10) - 1;
  if (column < 0 || column >= boardSize || row < 0 || row >= boardSize) return null;
  return { kind: 'place', coordinate: { r: row, c: column } };
};

export const createUndoCommandParams = (
  type: UndoCommandType,
  moveIndex?: number,
): Record<string, string> => {
  if (type !== 'ASK') return { type };
  if (!Number.isInteger(moveIndex) || (moveIndex as number) < 0) {
    throw new RangeError('An undo request requires a non-negative move index');
  }
  return { type, move_ind: String(moveIndex) };
};

export const parseLegacyUndoEvent = (event: IgGameEvent): LegacyUndoEvent | null => {
  if (event.type !== 'UNDOASK' && event.type !== 'UNDODONE') return null;
  const parsedIndex = event.data === undefined ? Number.NaN : Number.parseInt(event.data, 10);
  return {
    kind: event.type === 'UNDOASK' ? 'request' : 'completed',
    moveIndex: Number.isNaN(parsedIndex) ? null : parsedIndex,
    requesterUid: event.uid,
  };
};

export const parseRestartSessionId = (event: IgGameEvent): string | null => {
    if (event.type !== 'RESTART') return null;
    const sid = event.data?.trim();
    return sid ? sid : null;
};

export const isClaimQuitResponse = (
  command: string | undefined,
  events: IgGameEvent[] | undefined,
): boolean => command?.toUpperCase() === 'END'
  && events?.some(event =>
    event.type.toUpperCase() === 'ENDGAME'
    && event.data?.toUpperCase().includes('CLAIMQUIT')
  ) === true;

export const isValidServerName = (serverName: string): boolean =>
  /^[a-z0-9][a-z0-9-]{0,62}$/i.test(serverName);
