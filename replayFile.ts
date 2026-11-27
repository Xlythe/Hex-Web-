import { ALLOWED_INCREMENT_SECONDS, DEFAULT_TIMER_SETTINGS } from './Constants';
import { BoardMatrix, CompletedGameEntry, HistoryEntry, Player, PlayerProfile, WinReason } from './types';
import { createEmptyBoard } from './utils';
import { winningPath } from './winningPath';

interface Move { x: number; y: number; team: Player; swap: boolean; moveNumber: number; time: number }
export interface Replay {
  formatVersion?: number;
  gameOptions: { gridSize: number; swap: boolean; timer: { type: number; totalTime: number; additionalTime: number } };
  moveList: { moveList: Move[] };
  currentPlayer: Player;
  moveNumber: number;
  gameStart: number;
  gameEnd: number;
  player1: { name: string; color: number; type: string };
  player2: Replay['player1'];
  result?: { winner: Player | null; reason: WinReason | null };
}

export const MAX_REPLAY_BYTES = 1024 * 1024;

function check(condition: unknown): asserts condition {
  if (!condition) throw new Error('Invalid or incomplete Hex replay.');
}

function profile(player: Replay['player1']): PlayerProfile {
  check(typeof player?.name === 'string' && Number.isInteger(player.color));
  return { name: player.name, color: '#' + (player.color & 0xffffff).toString(16).padStart(6, '0') };
}

type BoardMove = Pick<Move, 'x' | 'y' | 'team' | 'swap'>;

export function historyFromMoves(size: number, moves: BoardMove[], allowSwap: boolean): HistoryEntry[] {
  const board = createEmptyBoard(size, 3, 30, 11);
  const history: HistoryEntry[] = [];
  let path: HistoryEntry['winningPath'] = null;
  const snapshot = (count: number) => history.push({
    boardMatrix: board.map(row => [...row]), turnCount: count, currentPlayer: count % 2 ? Player.TWO : Player.ONE,
    firstGameMove: count ? { coord: { r: moves[0].y, c: moves[0].x }, player: Player.ONE } : null,
    currentTurnTimeLeft: null, playerGameTimeLeft: null, winningPath: path, isPlayerRolesSwapped: false,
  });
  snapshot(0);
  moves.forEach(({ x, y, team, swap }, index) => {
    check(!path && Number.isInteger(x) && x >= 0 && x < size && Number.isInteger(y) && y >= 0 && y < size);
    check(team === (index % 2 ? Player.TWO : Player.ONE));
    if (swap) {
      const first = moves[0];
      check(index === 1 && allowSwap && x === first.y && y === first.x);
      board[first.y][first.x] = null;
    }
    check(board[y][x] === null);
    board[y][x] = team;
    path = winningPath(board, team);
    snapshot(index + 1);
  });
  return history;
}

export function serverHistory(size: number, notation: string): HistoryEntry[] {
  const moves: BoardMove[] = [];
  for (const coordinate of notation.split(',').filter(Boolean)) {
    const team = moves.length % 2 ? Player.TWO : Player.ONE;
    if (coordinate === 'SWAP') {
      check(moves.length === 1);
      moves.push({ x: moves[0].y, y: moves[0].x, team, swap: true });
    } else {
      check(/^[A-S](?:[1-9]|1[0-9])$/.test(coordinate));
      moves.push({ x: coordinate.charCodeAt(0) - 65, y: Number(coordinate.slice(1)) - 1, team, swap: false });
    }
  }
  return historyFromMoves(size, moves, true);
}

export function readReplay(text: string): CompletedGameEntry {
  check(text.length <= MAX_REPLAY_BYTES);
  const file: Replay = JSON.parse(text);
  if (file?.formatVersion !== undefined && file.formatVersion !== 1) throw new Error('Unsupported Hex replay version.');
  const size = file?.gameOptions?.gridSize;
  check(Number.isInteger(size) && size >= 3 && size <= 30);
  const moves = file.moveList?.moveList;
  check(Array.isArray(moves) && moves.length <= size * size + 1);
  check(Number.isSafeInteger(file.gameStart) && Number.isSafeInteger(file.gameEnd));
  const history = historyFromMoves(size, moves, file.gameOptions.swap);
  const path = history[history.length - 1].winningPath;
  const timer = file.gameOptions.timer;
  check(timer && [0, 1, 2].includes(timer.type) && Number.isFinite(timer.totalTime) && timer.totalTime >= 0);
  const timerSettings = { ...DEFAULT_TIMER_SETTINGS };
  timerSettings.mode = timer.type === 0 ? 'off' : timer.type === 1 ? 'perTurn' : 'perGame';
  if (timer.type === 1) timerSettings.durationPerTurn = timer.totalTime / 1000;
  if (timer.type === 2) timerSettings.durationPerGame = timer.totalTime / 1000;
  check(Number.isFinite(timer.additionalTime) && timer.additionalTime >= 0);
  timerSettings.incrementSeconds = ALLOWED_INCREMENT_SECONDS.find(seconds => seconds === timer.additionalTime / 1000);
  if (file.result) {
    check([null, 1, 2].includes(file.result.winner) && (file.result.reason === null || Object.values(WinReason).includes(file.result.reason)));
  }
  const end = file.gameEnd || file.gameStart;
  return {
    id: crypto.randomUUID(), sourceReplay: text, timestamp: end, durationSeconds: Math.max(0, Math.round((end - file.gameStart) / 1000)),
    player1Profile: profile(file.player1), player2Profile: profile(file.player2),
    settings: { boardSize: size, swapRuleEnabled: file.gameOptions.swap, timerSettings },
    wasPlayer1ProfileAssignedToSideONE_atGameStart: true, wasPlayerRolesSwappedAtGameEnd: false,
    finalWinnerPlayerColor: path ? moves[moves.length - 1].team : file.result?.winner ?? null,
    winReason: path ? WinReason.CONNECTION : file.result?.reason ?? null, finalWinningPath: path, history,
  };
}

export function writeReplay(game: CompletedGameEntry): string {
  if (game.sourceReplay) return game.sourceReplay;
  const { boardSize: size, timerSettings: timer, swapRuleEnabled: swap } = game.settings;
  const moves: Move[] = [];
  let board: BoardMatrix = createEmptyBoard(size, 3, 30, 11);
  for (const state of game.history) {
    const next = state.boardMatrix;
    const team = moves.length % 2 ? Player.TWO : Player.ONE;
    let placed: { x: number; y: number } | undefined;
    let removed = false;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (board[y][x] === next[y][x]) continue;
      if (board[y][x] !== null) {
        check(!removed && moves.length === 1 && x === moves[0].x && y === moves[0].y);
        removed = true;
      }
      if (next[y][x] !== null) {
        check(!placed && next[y][x] === team);
        placed = { x, y };
      }
    }
    if (placed) {
      check(!removed || (swap && placed.x === moves[0].y && placed.y === moves[0].x));
      moves.push({ ...placed, team, swap: removed, moveNumber: moves.length + 1, time: 0 });
    } else check(!removed);
    check(state.turnCount === moves.length);
    board = next;
  }
  const asPlayer = (p: PlayerProfile) => ({ name: p.name, color: parseInt(p.color.slice(1), 16) | 0xff000000, type: 'Human' });
  const { player1Profile: p1, player2Profile: p2, wasPlayer1ProfileAssignedToSideONE_atGameStart: forward } = game;
  const file: Replay = {
    formatVersion: 1, moveList: { moveList: moves }, moveNumber: moves.length + 1,
    currentPlayer: moves.length % 2 ? Player.TWO : Player.ONE,
    gameStart: game.timestamp - game.durationSeconds * 1000, gameEnd: game.timestamp,
    player1: asPlayer(forward ? p1 : p2), player2: asPlayer(forward ? p2 : p1),
    gameOptions: { gridSize: size, swap, timer: { type: timer.mode === 'off' ? 0 : timer.mode === 'perTurn' ? 1 : 2,
      totalTime: (timer.mode === 'perTurn' ? timer.durationPerTurn : timer.durationPerGame) * 1000,
      additionalTime: (timer.incrementSeconds || 0) * 1000 } },
    result: { winner: game.finalWinnerPlayerColor, reason: game.winReason },
  };
  return JSON.stringify(file);
}
