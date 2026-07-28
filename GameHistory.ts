
import { MoveRecord } from './MoveRecord';

/**
 * @class GameHistory
 * @description Manages a stack of game states (`MoveRecord` instances) to support undo functionality.
 * It ensures that all stored game states are deep-cloned to prevent unintended mutations,
 * maintaining the integrity of the historical record. This class is crucial for allowing players
 * to revert to previous game states.
 */
export class GameHistory {
  /**
   * @private
   * @property historyStack
   * @description An array of `MoveRecord` objects representing the sequence of game states.
   * Each element is a snapshot of the game at a particular point, allowing for undo operations.
   * This stack is managed internally and populated with deep-cloned records.
   */
  private historyStack: MoveRecord[] = [];

  /**
   * @method addMove
   * @description Adds a new game state (a `MoveRecord`) to the history stack.
   * The provided record is deep-cloned before being stored to ensure that subsequent
   * modifications to the original object (e.g., in GameController) do not affect
   * the historical state. This is vital for reliable undo operations.
   * @param {MoveRecord} record - The game state record to add.
   */
  public addMove(record: MoveRecord): void {
    // Deep clone the record to prevent mutations of the stored history state.
    // This ensures that objects like boardMatrix, firstGameMove, playerGameTimeLeft, and winningPath
    // within the stored record are independent copies.
    const clonedRecord: MoveRecord = {
      ...record,
      boardMatrix: record.boardMatrix.map(row => [...row]),
      firstGameMove: record.firstGameMove ? { ...record.firstGameMove, coord: { ...record.firstGameMove.coord } } : null,
      playerGameTimeLeft: record.playerGameTimeLeft ? { ...record.playerGameTimeLeft } : null,
      winningPath: record.winningPath ? record.winningPath.map(coord => ({...coord})) : null, // Ensure coordinates in path are also cloned
    };
    this.historyStack.push(clonedRecord);
  }

  /**
   * @method undoLastMove
   * @description Removes and returns the most recently added game state from the history stack.
   * This method is used to revert the game to its previous state.
   * @returns {MoveRecord | undefined} The `MoveRecord` of the state to revert to, or `undefined` if the history is empty.
   * The returned record is a deep copy of the state that was stored.
   */
  public undoLastMove(): MoveRecord | undefined {
    const record = this.historyStack.pop();
    if (!record) return undefined;
    // Return a deep copy of the popped record, although since it's removed from the stack,
    // direct mutation by the caller wouldn't affect other history states.
    // However, consistency with getPreviousState and getFullHistory is good practice.
    return {
      ...record,
      boardMatrix: record.boardMatrix.map(row => [...row]),
      firstGameMove: record.firstGameMove ? { ...record.firstGameMove, coord: { ...record.firstGameMove.coord } } : null,
      playerGameTimeLeft: record.playerGameTimeLeft ? { ...record.playerGameTimeLeft } : null,
      winningPath: record.winningPath ? record.winningPath.map(coord => ({...coord})) : null,
    };
  }

  /**
   * @method getPreviousState
   * @description Returns a deep copy of the most recently added game state without removing it from the history stack.
   * This is useful for peeking at the state that an undo operation would revert to.
   * @returns {MoveRecord | undefined} A deep copy of the last `MoveRecord` in the stack, or `undefined` if the history is empty.
   */
  public getPreviousState(): MoveRecord | undefined {
    if (this.historyStack.length === 0) return undefined;
    const record = this.historyStack[this.historyStack.length - 1];
    // Return a deep copy to prevent external mutation of the peeked state affecting the internal history.
    return {
      ...record,
      boardMatrix: record.boardMatrix.map(row => [...row]),
      firstGameMove: record.firstGameMove ? { ...record.firstGameMove, coord: { ...record.firstGameMove.coord } } : null,
      playerGameTimeLeft: record.playerGameTimeLeft ? { ...record.playerGameTimeLeft } : null,
      winningPath: record.winningPath ? record.winningPath.map(coord => ({...coord})) : null,
    };
  }
  
  /**
   * @method clear
   * @description Empties the history stack. This is typically called when a new game starts
   * or the current game is reset.
   */
  public clear(): void {
    this.historyStack = [];
  }

  /**
   * @method getStackLength
   * @description Returns the number of game states currently stored in the history stack.
   * @returns {number} The current size of the history stack.
   */
  public getStackLength(): number {
    return this.historyStack.length;
  }

  /**
   * @method getFullHistory
   * @description Returns a deep copy of the entire history stack.
   * Each `MoveRecord` within the returned array is also a deep copy.
   * This is primarily used for saving completed game data, ensuring that the
   * game's historical record is fully preserved without risk of external mutation.
   * @returns {ReadonlyArray<MoveRecord>} A read-only array containing deep copies of all `MoveRecord`s.
   */
  public getFullHistory(): ReadonlyArray<MoveRecord> {
    // Return a deep copy of the history stack and its records to ensure immutability
    // when the history is accessed, for example, for saving to completed game entries.
    return this.historyStack.map(record => ({
        ...record,
        boardMatrix: record.boardMatrix.map(row => [...row]),
        firstGameMove: record.firstGameMove ? { ...record.firstGameMove, coord: { ...record.firstGameMove.coord } } : null,
        playerGameTimeLeft: record.playerGameTimeLeft ? { ...record.playerGameTimeLeft } : null,
        winningPath: record.winningPath ? record.winningPath.map(coord => ({...coord})) : null,
    }));
  }
}
