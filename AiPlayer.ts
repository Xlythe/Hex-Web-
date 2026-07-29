
import { BoardMatrix, Coordinate, Player, AiDifficulty } from './types';
import { AiPlayerEasy } from './AiPlayerEasy';
import { AiPlayerBee } from './AiPlayerBee';

/**
 * @interface AiStrategy
 * @description Defines the common interface for different AI difficulty strategies.
 */
interface AiStrategy {
  getMove(boardMatrix: BoardMatrix, playerSide: Player, emptyCells: Coordinate[]): Coordinate | null;
}

export interface AndroidBotDefinition {
  difficulty: AiDifficulty;
  algorithm: 'GameAI' | 'BeeAI';
  maxDepth: number | null;
  beamSize: number | null;
}

/**
 * Parameters extracted from Android's production AiTypes factory.
 */
export const ANDROID_BOT_ROSTER: readonly AndroidBotDefinition[] = [
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
] as const;

/**
 * @class AiPlayer
 * @description Represents an AI opponent for the Hex game.
 * It dispatches move generation to a specific strategy class (Easy, Medium, Hard)
 * based on the configured difficulty.
 */
export class AiPlayer {
  private strategy: AiStrategy;
  private name: string;
  // private difficulty: AiDifficulty; // Kept for potential future reference or logging

  constructor(difficulty: AiDifficulty, name: string) {
    this.name = name;
    // this.difficulty = difficulty;

    switch (difficulty) {
      case AiDifficulty.EASY:
        this.strategy = new AiPlayerEasy();
        break;
      case AiDifficulty.MEDIUM:
        this.strategy = new AiPlayerBee(2, 5);
        break;
      case AiDifficulty.HARD:
        this.strategy = new AiPlayerBee(3, 4);
        break;
      default:
        console.warn(`Unknown AI difficulty: ${difficulty}. Defaulting to Easy.`);
        this.strategy = new AiPlayerEasy();
    }
  }

  /**
   * @method getMove
   * @description Determines the AI's next move based on the current board state and player side.
   * It first gets all empty cells and then delegates to the selected AI strategy.
   * @param {BoardMatrix} boardMatrix - The current state of the game board.
   * @param {Player} playerSide - The player side (Player.ONE or Player.TWO) for which the AI is making a move.
   * @returns {Coordinate | null} The coordinate of the AI's chosen move, or null if no move is possible (e.g., board full).
   */
  public getMove(boardMatrix: BoardMatrix, playerSide: Player): Coordinate | null {
    const emptyCells = this.getEmptyCells(boardMatrix);
    if (emptyCells.length === 0) {
      return null;
    }
    return this.strategy.getMove(boardMatrix, playerSide, emptyCells);
  }

  /**
   * @private
   * @method getEmptyCells
   * @description Finds all empty cells on the board.
   * @param {BoardMatrix} boardMatrix - The current game board.
   * @returns {Coordinate[]} An array of coordinates representing empty cells.
   */
  private getEmptyCells(boardMatrix: BoardMatrix): Coordinate[] {
    const emptyCells: Coordinate[] = [];
    for (let r = 0; r < boardMatrix.length; r++) {
      for (let c = 0; c < boardMatrix[r].length; c++) {
        if (boardMatrix[r][c] === null) {
          emptyCells.push({ r, c });
        }
      }
    }
    return emptyCells;
  }

  /**
   * @method getName
   * @description Returns the name of the AI player.
   * @returns {string} The AI's name.
   */
  public getName(): string {
    return this.name;
  }
}
