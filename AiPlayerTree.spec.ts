import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiPlayerTree } from './AiPlayerTree';
import { GameController } from './GameController';
import { GameOptions } from './GameOptions';
import { AiDifficulty, BoardMatrix, Player, PlayerControlType } from './types';

const empty = (size: number): BoardMatrix => Array.from(
  { length: size }, () => Array(size).fill(null),
);
const move = (board: BoardMatrix, player: Player, canSwap = false) => {
  const legal = board.flatMap((row, r) => row.flatMap((cell, c) => cell === null ? [{ r, c }] : []));
  return new AiPlayerTree(300, 42).getMove(board, player, legal, canSwap);
};

describe('Tree bot', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens centrally and finds immediate connections on both axes', () => {
    expect(move(empty(5), Player.ONE)).toEqual({ r: 2, c: 2 });
    const red = empty(3);
    red[0][0] = Player.ONE;
    red[0][1] = Player.ONE;
    expect(move(red, Player.ONE)).toEqual({ r: 0, c: 2 });
    expect(move(red, Player.TWO)).toEqual({ r: 0, c: 2 });
    const blue = empty(3);
    blue[0][0] = Player.TWO;
    blue[1][0] = Player.TWO;
    expect(move(blue, Player.TWO)).toEqual({ r: 2, c: 0 });
  });

  it('does not mutate the board and returns legal pie-rule choices', () => {
    const board = empty(5);
    board[0][1] = Player.ONE;
    const result = move(board, Player.TWO, true);
    expect(result).not.toBeNull();
    expect(result).toEqual(move(board, Player.TWO, true));
    expect(result && (board[result.r][result.c] === null || result.r === 0 && result.c === 1)).toBe(true);
    expect(board[0][1]).toBe(Player.ONE);
    expect(board.flat().filter(cell => cell !== null)).toHaveLength(1);
  });

  it('plays a legal move or transpose swap through the game controller', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const options = new GameOptions(5);
    options.player2ControlType = PlayerControlType.AI;
    options.aiDifficulty = AiDifficulty.TREE;
    options.swapRuleEnabled = true;
    const game = new GameController(options, () => undefined, false);
    game.startGame();
    await game.makeMove(0, 1);
    expect(game.turnCount).toBe(1);
    await vi.advanceTimersByTimeAsync(800);
    expect(game.turnCount).toBe(2);
    expect(game.boardMatrix.flat().filter(cell => cell === Player.TWO)).toHaveLength(1);
  });
});
