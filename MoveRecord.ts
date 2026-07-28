
import { BoardMatrix, Player, FirstGameMoveDetails, Coordinate } from './types';

/**
 * @interface MoveRecord
 * @description Defines the structure for a single historical game state snapshot.
 * This interface is used by `GameHistory` to store all necessary information
 * to revert the game to a previous state, supporting undo functionality.
 * Each `MoveRecord` captures the complete game situation at a specific point in time.
 */
export interface MoveRecord {
  /**
   * @property boardMatrix
   * @description A 2D array representing the state of each cell on the board at this point in history.
   */
  boardMatrix: BoardMatrix;
  /**
   * @property currentPlayer
   * @description The `Player` (ONE or TWO) whose turn it *was* just before this state was recorded,
   * or, alternatively, whose turn it *is* in this captured state.
   */
  currentPlayer: Player;
  /**
   * @property turnCount
   * @description The total number of moves made in the game up to this state.
   */
  turnCount: number;
  /**
   * @property firstGameMove
   * @description Details of the very first move made in the game (coordinate and player side),
   * if it has occurred by this state. Null otherwise. Crucial for the swap rule.
   */
  firstGameMove: FirstGameMoveDetails | null; 
  /**
   * @property isPlayerRolesSwapped
   * @description A boolean indicating whether the player roles (assignment of configured profiles
   * to board sides) were swapped due to the swap rule by this point in the game.
   */
  isPlayerRolesSwapped: boolean;
  /**
   * @property currentTurnTimeLeft
   * @description The time remaining (in seconds) for the `currentPlayer`'s turn, if the 'perTurn' timer mode was active.
   * Null if timer mode was 'off' or 'perGame'.
   */
  currentTurnTimeLeft: number | null;
  /**
   * @property playerGameTimeLeft
   * @description An object mapping each `Player` side to their remaining game time (in seconds),
   * if the 'perGame' timer mode was active. Null if timer mode was 'off' or 'perTurn'.
   */
  playerGameTimeLeft: { [key in Player]?: number } | null;
  /**
   * @property winningPath
   * @description An array of `Coordinate` objects representing the sequence of cells forming a winning connection,
   * if this game state resulted in a win. Null otherwise or if the game was still ongoing.
   */
  winningPath: Coordinate[] | null; // Path if this state was a winning one
}