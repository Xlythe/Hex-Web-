import { CompletedGameEntry, GamePhase, Player, BoardMatrix, Coordinate, PlayerProfile, FirstGameMoveDetails, HistoryEntry, TimerMode, WinReason, TimerSettings } from './types';
import { REPLAY_STEP_DELAY_MS } from './Constants';
import { createEmptyBoard } from './utils';
import { MIN_BOARD_SIZE, MAX_BOARD_SIZE, DEFAULT_BOARD_SIZE } from './Constants';

/**
 * @interface ReplaySnapshot
 * @description Represents a snapshot of the game state during a replay.
 * This structure is provided to the UI to render the board and game information at a specific step
 * of a replayed game. It combines data from the `CompletedGameEntry` (overall game details)
 * and a specific `HistoryEntry` (state at a particular move).
 */
export interface ReplaySnapshot {
  /** @property boardMatrix - The state of the board at the current replay step. */
  boardMatrix: BoardMatrix;
  /** @property currentPlayerId - The player side (Player.ONE or Player.TWO) whose turn it was/is in this historical state. */
  currentPlayerId: Player;
  /** @property turnCount - The turn number at this replay step. */
  turnCount: number;
  /** @property firstGameMoveDetails - Details of the first move if it occurred by this step. */
  firstGameMoveDetails: FirstGameMoveDetails | null;
  /** @property isPlayerRolesSwapped - True if player roles were swapped by this step in the original game's history. */
  isPlayerRolesSwapped: boolean;
  /** @property wasPlayer1ProfileAssignedToSideONE_atGameStart - From the `CompletedGameEntry`, indicates if the configured "Player 1" profile started on the Player.ONE side. Crucial for interpreting player identities during replay. */
  wasPlayer1ProfileAssignedToSideONE_atGameStart: boolean;

  /** @property currentTurnTimeLeft - Time left for the current turn at this step, if applicable. */
  currentTurnTimeLeft: number | null;
  /** @property playerGameTimeLeft - Game time left for each player side at this step, if applicable. */
  playerGameTimeLeft: { [key in Player]?: number } | null;
  /** @property winningPath - The winning path, if the game concluded at or before this step with this path. During active replay, this shows the path from the history entry. When replay is finished, it shows the final game winning path. */
  winningPath: Coordinate[] | null;
  
  /** @property gamePhase - Current phase of the replay (REPLAY while playing, GAME_OVER when finished/stopped). */
  gamePhase: GamePhase;
  /** @property finalWinnerPlayerColor - The player side (Player.ONE or Player.TWO) that ultimately won the replayed game. */
  finalWinnerPlayerColor: Player | null;
  /** @property winReason - The reason for the game's conclusion (e.g., 'connection', 'timeout'). */
  winReason: WinReason | null;

  /** @property player1Profile - The profile of the player configured as "Player 1" for the replayed game. */
  player1Profile: PlayerProfile; 
  /** @property player2Profile - The profile of the player configured as "Player 2" for the replayed game. */
  player2Profile: PlayerProfile; 
  
  /** @property currentStepIndex - The index of the current `HistoryEntry` being displayed from the `CompletedGameEntry`. -1 if before the first step. */
  currentStepIndex: number;
  /** @property totalSteps - The total number of `HistoryEntry` items in the replayed game. */
  totalSteps: number;
  /** @property isActive - True if the replay is currently auto-playing. False if paused, stopped, or finished. */
  isActive: boolean;
  /** @property gameTimestamp - The timestamp when the original game concluded. */
  gameTimestamp: number;
  /** @property gameBoardSize - The board size of the original game. */
  gameBoardSize: number;
  /** @property gameTimerSettings - Timer settings of the original game, including increment. */
  gameTimerSettings: TimerSettings;
  /** @property gameToReplay - A reference to the full `CompletedGameEntry` being replayed. Null if no replay is active or selected. */
  gameToReplay: CompletedGameEntry | null; 
}

/**
 * @class ReplayService
 * @description Manages the playback of completed Hex games.
 * It loads a `CompletedGameEntry`, steps through its `history` array,
 * and provides `ReplaySnapshot` updates to a callback function (typically for UI rendering).
 * Handles auto-play with delays, stopping, and providing consistent state information.
 */
export class ReplayService {
  /** @private The full data of the game currently being replayed. */
  private gameToReplay: CompletedGameEntry | null = null;
  /** @private The index of the current history entry being displayed. -1 indicates before the first move (initial board). */
  private currentStepIndex: number = -1; 
  /** @private Stores the ID of the `setTimeout` used for scheduling the next replay step. */
  private replayIntervalId: number | null = null;
  /** @private Internal flag indicating if the replay is actively auto-playing. */
  private _isActive: boolean = false; 

  /** @private Callback function invoked with a new `ReplaySnapshot` whenever the replay state updates. */
  private onUpdateCallback: (snapshot: ReplaySnapshot | null) => void;

  /**
   * @constructor
   * @param onUpdate - A callback function that will receive `ReplaySnapshot` updates.
   */
  constructor(onUpdate: (snapshot: ReplaySnapshot | null) => void) {
    this.onUpdateCallback = onUpdate;
  }

  /**
   * @method startReplay
   * @description Begins replaying the provided completed game.
   * It stops any ongoing replay, initializes state for the new game,
   * sends an initial snapshot, and schedules the first step of the replay.
   * @param {CompletedGameEntry} game - The game data to replay.
   */
  public startReplay(game: CompletedGameEntry): void {
    this.stopReplayInternal(false); // Stop any current replay without immediate notification
    
    this.gameToReplay = game;
    // History records the state before each move, so completed games normally
    // begin with an empty-board entry followed by the first placed stone. Do not
    // make the player watch that redundant empty state: begin at the first
    // history entry that represents a move.
    const firstMoveIndex = game.history.findIndex(entry =>
      entry.turnCount > 0 || entry.boardMatrix.some(row => row.some(cell => cell !== null))
    );
    this.currentStepIndex = firstMoveIndex >= 0
      ? firstMoveIndex
      : (game.history.length > 0 ? 0 : -1);
    this._isActive = true;

    const initialSnapshot = this.createSnapshot();
    this.onUpdateCallback(initialSnapshot); 
    
    this.scheduleNextStep();
  }

  /**
   * @method stopReplay
   * @description Stops the currently active replay.
   * @param {boolean} [notify=true] - If true, an update snapshot is sent to reflect the stopped state.
   * @param {boolean} [clearGameAssociation=false] - If true, the service will also clear its reference
   * to the `gameToReplay`, effectively ending the replay session. If false, the replay is paused
   * and can be potentially resumed or stepped through manually (though resume isn't explicitly implemented here).
   */
  public stopReplay(notify: boolean = true, clearGameAssociation: boolean = false): void {
    this.stopReplayInternal(notify, clearGameAssociation);
  }

  /**
   * @private
   * @method stopReplayInternal
   * @description Internal logic to stop the replay, clear timers, and optionally update state.
   * @param {boolean} notify - Whether to send an update snapshot.
   * @param {boolean} [clearGameAssociation=false] - Whether to clear the `gameToReplay` reference.
   */
  private stopReplayInternal(notify: boolean, clearGameAssociation: boolean = false): void {
    if (this.replayIntervalId) clearTimeout(this.replayIntervalId);
    this.replayIntervalId = null;
    
    this._isActive = false; // Mark replay as inactive

    if (clearGameAssociation) {
        this.gameToReplay = null; // Dissociate from the game
        this.currentStepIndex = -1;
    }

    if (notify) {
        const snapshot = this.createSnapshot(); // Create a snapshot reflecting the new (inactive) state
        this.onUpdateCallback(snapshot);
    }
  }

  /**
   * @private
   * @method scheduleNextStep
   * @description Schedules the `playNextStep` method to be called after a delay.
   * The delay is `REPLAY_STEP_DELAY_MS`; `startReplay` has already skipped any
   * redundant empty-board entry.
   */
  private scheduleNextStep(): void {
    if (!this._isActive || !this.gameToReplay) {
      return; // Do nothing if replay is not active or no game is loaded
    }
    
    if (this.currentStepIndex >= this.gameToReplay.history.length - 1 && this.gameToReplay.history.length > 0) {
      // If at the last step, playNextStep will handle stopping the active replay.
    }

    if (this.replayIntervalId) clearTimeout(this.replayIntervalId); // Clear existing timer
    
    this.replayIntervalId = setTimeout(() => {
      this.playNextStep();
    }, REPLAY_STEP_DELAY_MS) as unknown as number;
  }

  /**
   * @private
   * @method playNextStep
   * @description Advances the replay to the next history entry.
   * It increments `currentStepIndex`, creates a new snapshot, sends an update,
   * and schedules the subsequent step if the replay is still active and not at the end.
   * If the end of history is reached, it marks the replay as inactive.
   */
  private playNextStep(): void {
    if (!this.gameToReplay) { // Should not happen if scheduleNextStep guards properly
      this.stopReplayInternal(true);
      return;
    }

    this.currentStepIndex++; // Advance to the next history entry

    if (this.currentStepIndex >= this.gameToReplay.history.length) {
      // Reached the end of history
      this._isActive = false; 
      if (this.gameToReplay.history.length > 0) {
        this.currentStepIndex = this.gameToReplay.history.length - 1; // Set index to the last valid step
      } else {
        this.currentStepIndex = -1; // No history, reset index
      }
      const finalSnapshot = this.createSnapshot(); 
      this.onUpdateCallback(finalSnapshot); // Send final state snapshot
      return; // Stop further scheduling
    }
    
    const snapshot = this.createSnapshot(); // Create snapshot for the current step
    this.onUpdateCallback(snapshot);

    if (this._isActive) { // If still active (i.e., not manually stopped mid-cycle)
        this.scheduleNextStep(); // Schedule the next step
    }
  }

  /**
   * @property isActive
   * @description Public getter to check if the replay is currently auto-playing.
   * @returns {boolean} True if active, false otherwise.
   */
  public get isActive(): boolean {
    return this._isActive; 
  }
  
  /**
   * @method getGameToReplay
   * @description Returns the `CompletedGameEntry` currently being replayed, or null if none.
   * @returns {CompletedGameEntry | null} The active game entry or null.
   */
  public getGameToReplay(): CompletedGameEntry | null {
      return this.gameToReplay;
  }

  /**
   * @private
   * @method createSnapshot
   * @description Constructs a `ReplaySnapshot` based on the current replay state.
   * If `currentStepIndex` is -1 (before first move), it shows an initial empty board state.
   * Otherwise, it uses data from `this.gameToReplay` and the `HistoryEntry` at `currentStepIndex`.
   * It determines the `gamePhase` for the snapshot (REPLAY or GAME_OVER).
   * The `winningPath` displayed is contextual: from the history entry during active replay,
   * or the game's final winning path if the replay is finished and on the last step.
   * @returns {ReplaySnapshot | null} A snapshot of the current replay state, or null if no game is loaded.
   */
  private createSnapshot(): ReplaySnapshot | null {
    if (!this.gameToReplay) return null; // If gameToReplay was cleared (e.g. by stopReplay with clearGameAssociation)

    const history = this.gameToReplay.history;
    const gameData = this.gameToReplay;
    let currentHistoryEntry: HistoryEntry | undefined = undefined;

    // Get the current history entry if the index is valid
    if (this.currentStepIndex >= 0 && this.currentStepIndex < history.length) {
      currentHistoryEntry = history[this.currentStepIndex];
    }

    // Initialize snapshot properties with defaults or from currentHistoryEntry
    let board: BoardMatrix;
    let cPlayerId: Player; // Current player side from history
    let tCount: number;
    let fGameMove: FirstGameMoveDetails | null;
    let rolesSwappedFromHistory: boolean; // isPlayerRolesSwapped from the specific history entry
    let cTurnTime: number | null;
    let pGameTime: { [key in Player]?: number } | null;
    // let wPath: Coordinate[] | null; // This will be handled more contextually below

    if (currentHistoryEntry) {
        // Populate from the current history entry
        board = currentHistoryEntry.boardMatrix;
        cPlayerId = currentHistoryEntry.currentPlayer; 
        tCount = currentHistoryEntry.turnCount;
        fGameMove = currentHistoryEntry.firstGameMove;
        rolesSwappedFromHistory = currentHistoryEntry.isPlayerRolesSwapped;
        cTurnTime = currentHistoryEntry.currentTurnTimeLeft;
        pGameTime = currentHistoryEntry.playerGameTimeLeft;
        // wPath = currentHistoryEntry.winningPath; // Initial assignment from history
    } else { 
        // No current history entry (e.g., currentStepIndex is -1, showing state before first move)
        board = createEmptyBoard(gameData.settings.boardSize, MIN_BOARD_SIZE, MAX_BOARD_SIZE, DEFAULT_BOARD_SIZE);
        const firstHistEntryIfAvailable = history.length > 0 ? history[0] : null;
        // Default to Player.ONE or first history entry's player if showing pre-game state
        cPlayerId = firstHistEntryIfAvailable ? firstHistEntryIfAvailable.currentPlayer : Player.ONE; 
        rolesSwappedFromHistory = firstHistEntryIfAvailable ? firstHistEntryIfAvailable.isPlayerRolesSwapped : false;
        tCount = 0;
        fGameMove = null;
        const timerSettings = gameData.settings.timerSettings;
        cTurnTime = timerSettings.mode === 'perTurn' ? timerSettings.durationPerTurn : null;
        pGameTime = timerSettings.mode === 'perGame' && timerSettings.durationPerGame ? {
            [Player.ONE]: timerSettings.durationPerGame,
            [Player.TWO]: timerSettings.durationPerGame
        } : null;
        // wPath = null;
    }
    
    const gamePhaseSnapshot = this._isActive ? GamePhase.REPLAY : GamePhase.GAME_OVER;
    
    // Determine which winning path to display:
    // - If replay is over AND on the last actual step, show the game's final winning path.
    // - Otherwise, show the winning path from the current history entry (if any).
    const isLastActualStepInHistory = this.currentStepIndex === history.length - 1 && history.length > 0;
    const displayWinningPath = (isLastActualStepInHistory && !this._isActive) 
                               ? gameData.finalWinningPath 
                               : (currentHistoryEntry?.winningPath || null);


    return {
      boardMatrix: board,
      currentPlayerId: cPlayerId,
      turnCount: tCount,
      firstGameMoveDetails: fGameMove,
      isPlayerRolesSwapped: rolesSwappedFromHistory, // This is from the specific history entry
      wasPlayer1ProfileAssignedToSideONE_atGameStart: gameData.wasPlayer1ProfileAssignedToSideONE_atGameStart, // This is from the CompletedGameEntry
      currentTurnTimeLeft: cTurnTime,
      playerGameTimeLeft: pGameTime,
      winningPath: displayWinningPath, 
      
      gamePhase: gamePhaseSnapshot,
      finalWinnerPlayerColor: gameData.finalWinnerPlayerColor, // Winner from the original game data
      winReason: gameData.winReason,  // Win reason from the original game data

      // These are the player profiles AS CONFIGURED for the game being replayed
      player1Profile: gameData.player1Profile, 
      player2Profile: gameData.player2Profile, 
      
      currentStepIndex: this.currentStepIndex,
      totalSteps: history.length, // Total number of history entries available
      isActive: this._isActive, 
      gameTimestamp: gameData.timestamp, // Timestamp of the original game's end
      gameBoardSize: gameData.settings.boardSize, // Board size of the original game
      gameTimerSettings: gameData.settings.timerSettings, // Timer settings of the original game
      gameToReplay: this.gameToReplay, // Reference to the game entry
    };
  }
  
  /**
   * @method dispose
   * @description Cleans up resources used by the service, primarily stopping any active replay and clearing timers.
   */
  public dispose() {
      this.stopReplayInternal(false); // Stop replay without notification, clear timers
  }
}
