import { afterEach, describe, expect, it, vi } from 'vitest';

import { AiPlayer, ANDROID_BOT_ROSTER } from './AiPlayer';
import { AiPlayerBee } from './AiPlayerBee';
import { AiDifficulty, BoardMatrix, Coordinate, Player } from './types';

const createBoard = (size: number): BoardMatrix =>
  Array.from({ length: size }, () => Array<Player | null>(size).fill(null));

const playAndroidReferenceLine = (
  difficulty: AiDifficulty,
  opponentMoves: Coordinate[],
): Coordinate[] => {
  const board = createBoard(5);
  const bot = new AiPlayer(difficulty, difficulty);
  const replies: Coordinate[] = [];

  for (const opponentMove of opponentMoves) {
    expect(board[opponentMove.r][opponentMove.c]).toBeNull();
    board[opponentMove.r][opponentMove.c] = Player.ONE;
    const reply = bot.getMove(board, Player.TWO);
    expect(reply).not.toBeNull();
    expect(board[reply!.r][reply!.c]).toBeNull();
    board[reply!.r][reply!.c] = Player.TWO;
    replies.push(reply!);
  }

  return replies;
};

describe('Android bot parity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps distinct positions apart when the legacy 32-bit cache key collides', () => {
    const empty = Array.from({ length: 7 }, () => Array<number>(7).fill(0));
    const collision = empty.map(row => [...row]);
    let difference = 2 ** 32;
    for (let row = 5; row >= 1; row--) {
      for (let column = 5; column >= 1; column--) {
        collision[row][column] = difference % 3;
        difference = Math.floor(difference / 3);
      }
    }
    expect(difference).toBe(0);

    const legacyHash = (pieces: number[][]) => {
      let hash = 5;
      for (let row = 1; row <= 5; row++) {
        for (let column = 1; column <= 5; column++) {
          hash = (Math.imul(hash, 3) + pieces[row][column]) | 0;
        }
      }
      return hash;
    };
    expect(legacyHash(collision)).toBe(legacyHash(empty));

    const bot = new AiPlayerBee(2, 5) as unknown as {
      pieces: number[][];
      piecesHash: () => string;
    };
    bot.pieces = empty;
    const emptyKey = bot.piecesHash();
    bot.pieces = collision;
    expect(bot.piecesHash()).not.toBe(emptyKey);
  });

  it('offers the same four bots with the same search parameters', () => {
    expect(ANDROID_BOT_ROSTER).toEqual([
      {
        difficulty: AiDifficulty.EASY,
        algorithm: 'GameAI',
        maxDepth: null,
        beamSize: null,
      },
      {
        difficulty: AiDifficulty.MEDIUM,
        algorithm: 'BeeAI',
        maxDepth: 2,
        beamSize: 5,
      },
      {
        difficulty: AiDifficulty.HARD,
        algorithm: 'BeeAI',
        maxDepth: 3,
        beamSize: 4,
      },
      {
        difficulty: AiDifficulty.TREE,
        algorithm: 'TreeAI',
        maxDepth: null,
        beamSize: null,
      },
    ]);
  });

  it.each([AiDifficulty.EASY, AiDifficulty.MEDIUM, AiDifficulty.HARD])(
    '%s opens and replies to a corner in the center like Android',
    difficulty => {
      const opening = new AiPlayer(difficulty, difficulty).getMove(
        createBoard(5),
        Player.ONE,
      );
      expect(opening).toEqual({ r: 2, c: 2 });

      const board = createBoard(5);
      board[0][0] = Player.ONE;
      const reply = new AiPlayer(difficulty, difficulty).getMove(
        board,
        Player.TWO,
      );
      expect(reply).toEqual({ r: 2, c: 2 });
    },
  );

  it('matches Android Medium and Hard across a divergent reference line', () => {
    const opponentMoves = [
      { r: 2, c: 2 },
      { r: 0, c: 0 },
      { r: 4, c: 4 },
      { r: 4, c: 0 },
    ];

    expect(playAndroidReferenceLine(AiDifficulty.MEDIUM, opponentMoves)).toEqual([
      { r: 3, c: 0 },
      { r: 1, c: 4 },
      { r: 2, c: 1 },
      { r: 3, c: 2 },
    ]);
    expect(playAndroidReferenceLine(AiDifficulty.HARD, opponentMoves)).toEqual([
      { r: 3, c: 0 },
      { r: 2, c: 3 },
      { r: 1, c: 3 },
      { r: 4, c: 2 },
    ]);
  });

  it('matches the deterministic branches of Android Easy', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.5);
    const board = createBoard(5);
    const bot = new AiPlayer(AiDifficulty.EASY, 'easy');

    board[2][2] = Player.ONE;
    const firstReply = bot.getMove(board, Player.TWO);
    expect(firstReply).toEqual({ r: 2, c: 3 });
    board[firstReply!.r][firstReply!.c] = Player.TWO;

    board[4][4] = Player.ONE;
    expect(bot.getMove(board, Player.TWO)).toEqual({ r: 1, c: 3 });
  });
});
