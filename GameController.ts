
import {
  Player, CellState, BoardMatrix, GamePhase, Coordinate, TimerSettings, WinReason,
  PlayerProfile, FirstGameMoveDetails, CompletedGameEntry, HistoryEntry, PlayerControlType, AiDifficulty, LoggedInUser,
  IgHandlerGameOptions, AllowedIncrementSecondsType, IgPlayerInfo, IgSessionInfo, PlayerStat
} from './types'; // Essential data structures and enumerations defining the game's model.
import { GameOptions } from './GameOptions'; // Configuration settings for a game session.
import { GameParticipant } from './GameParticipant'; // Represents a player in the game, linking a profile to a board side.
import { MoveRecord } from './MoveRecord'; // Structure for storing game state snapshots for history/undo.
import { GameHistory } from './GameHistory'; // Manages the stack of game states for undo functionality.
import { AiPlayer } from './AiPlayer'; // Facade for interacting with different AI difficulty levels.
import { OnlinePlayer } from './OnlinePlayer';
import { createEmptyBoard } from './utils'; // Utility function for board initialization.
import {
  MIN_BOARD_SIZE, MAX_BOARD_SIZE, DEFAULT_BOARD_SIZE, AI_NAME, ONLINE_OPPONENT_NAME,
  DEFAULT_PLAYER_1_PROFILE_BASE, DEFAULT_PLAYER_2_PROFILE_BASE, DEBUG
} from './Constants'; // Game-wide constant values.
import { encodeHexMove } from './server/igGameCenterProtocol';
import type { IgCommandHandlerSuccessResponse } from './types';

/**
 * Artificial delay (in milliseconds) introduced before the AI makes its move.
 * This provides a more natural user experience, simulating "thinking" time.
 */
const AI_THINKING_DELAY_MS = 750;

/**
 * @class GameController
 * @description Manages the core logic, state, and rules of the Hex game.
 * This class acts as the central orchestrator for a game session. It handles:
 * - Initialization of the game based on provided options.
 * - Tracking the current state of the board, players, and game phase.
 * - Processing player moves, including validation and application.
 * - Invoking AI opponent logic if a player is AI-controlled.
 * - Implementing game rules such as the swap rule.
 * - Detecting wins and finding a shortest connection with breadth-first search.
 * - Managing game timers (per turn or per game).
 * - Maintaining a history of moves for undo functionality.
 * - Randomizing which player profile starts on which side (Player.ONE or Player.TWO).
 * - Notifying external listeners (e.g., UI) of state changes via a callback.
 */
export class GameController {
  // --- Game Configuration & Participants ---
  /** Immutable game options set at the start of the game. */
  public options: GameOptions;
  /** Represents the participant using Player Profile 1. */
  public playerAgent1: GameParticipant;
  /** Represents the participant using Player Profile 2. */
  public playerAgent2: GameParticipant;
  /** Instance of the AI player logic, null if no AI is active. */
  private aiPlayer: AiPlayer | null = null;
  /** Instance of the Online player logic, null if P2 is not Online. */
  public onlineOpponent: OnlinePlayer | null = null;

  // --- Core Game State ---
  /** The 2D array representing the Hex board; `null` for empty, `Player.ONE` or `Player.TWO` for occupied. */
  public boardMatrix: BoardMatrix;
  /** The `Player` (Player.ONE or Player.TWO) whose turn it is currently. */
  public currentPlayerId: Player;
  /** Current phase of the game (e.g., PLAYING, GAME_OVER). */
  public gamePhase: GamePhase;
  /** The `Player` who won the game, or `null` if no winner or game ongoing. */
  public winner: Player | null;
  /** Reason for the game ending (e.g., 'connection', 'timeout'). */
  public winReason: WinReason | null;
  /** Array of coordinates forming the winning path, if applicable. */
  public winningPath: Coordinate[] | null;

  // --- Turn & Swap Rule State ---
  /** Total number of moves made in the game. */
  public turnCount: number;
  /** Details of the very first move, crucial for the swap rule. */
  public firstGameMoveDetails: FirstGameMoveDetails | null;
  /** Flag indicating if the player roles (who controls Player.ONE vs Player.TWO pieces) have been swapped due to the swap rule. */
  public isPlayerRolesSwapped: boolean;
  /**
   * Stores the coordinate of the cell involved in a swap action temporarily.
   * Used to provide visual feedback to the user that a swap has occurred.
   * It's typically set for a short duration and then cleared.
   */
  public swappedCellCoordinate: Coordinate | null;

  // --- Timer State ---
  /** Time remaining for the current turn (if per-turn timer is active), in seconds. */
  public currentTurnTimeLeft: number | null;
  /** Time remaining for each player for the entire game (if per-game timer is active), in seconds. */
  public playerGameTimeLeft: { [key in Player]?: number } | null;
  /** Interval ID for the active game timer, used for clearing. */
  private activeTimerIntervalId: number | null = null;
  /** Timeout ID for the AI's "thinking" delay, used for clearing. */
  private aiMoveTimeoutId: number | null = null;

  // --- History & Metadata ---
  /** Manages the history of moves for undo functionality. */
  public gameHistory: GameHistory;
  /** Timestamp (ms since epoch) when the game started. */
  private gameStartTime: number | null = null;
  /** Unique identifier for the current game session. */
  private gameId: string | null = null;

  // --- Player Side Assignment ---
  /**
   * Tracks if Player Profile 1 was initially assigned to control Player.ONE pieces.
   * Player sides can be randomized at game start. This, along with `isPlayerRolesSwapped`,
   * determines which profile is currently controlling which color of pieces.
   */
  private _isPlayer1ProfileAssignedToSideONE_atGameStart: boolean;

  // --- AI State ---
  /** Internal flag indicating if the AI is currently processing its move. */
  private _isAiCurrentlyThinking: boolean = false;

  // --- Online Play State ---
  /** Stores the logged-in user details if available, for online interactions. */
  private loggedInUser: LoggedInUser | null = null;
  private onlineLocalSeat: Player | null = null;
  /** EID of the last server-confirmed move made by the local player. Used for Online Undo. */
  public lastLocalPlayerMoveServerEid: string | null = null;
  /** EID of the last move event processed from the server, regardless of who made it. Used for Online Undo context. */
  public lastProcessedMoveServerEid: string | null = null;


  // --- UI Update Callback ---
  /** Callback function to notify an external listener (e.g., UI) of game state updates. */
  private onUpdateCallback: () => void;

  /**
   * Constructs a new GameController instance.
   * Initializes the game state based on the provided options and sets up player agents.
   * @param options The game options defining settings like board size, timer, AI difficulty, etc.
   * @param onUpdate A callback function that will be invoked whenever the game state changes,
   *                 allowing the UI or other listeners to react and update.
   * @param initializeGame If true (default), calls startGame(). If false, only initializes internal state, game needs to be started explicitly.
   */
  constructor(options: GameOptions, onUpdate: () => void, initializeGame: boolean = true) {
    this.options = options;

    this.playerAgent1 = new GameParticipant(Player.ONE, options.player1Profile || { ...DEFAULT_PLAYER_1_PROFILE_BASE });
    this.playerAgent2 = new GameParticipant(Player.TWO, options.player2Profile || { ...DEFAULT_PLAYER_2_PROFILE_BASE });
    
    if (this.options.player2ControlType === PlayerControlType.AI) {
      this.aiPlayer = new AiPlayer(this.options.aiDifficulty, AI_NAME);
      this.playerAgent2.profile.name = AI_NAME;
      this.onlineOpponent = null;
    } else if (this.options.player2ControlType === PlayerControlType.ONLINE) {
      this.onlineOpponent = new OnlinePlayer(ONLINE_OPPONENT_NAME); // Name can be updated from server later
      this.playerAgent2.profile.name = ONLINE_OPPONENT_NAME;
      this.aiPlayer = null;
    } else {
      this.aiPlayer = null;
      this.onlineOpponent = null;
    }

    this.onUpdateCallback = onUpdate;
    this.gameHistory = new GameHistory();
    
    this.boardMatrix = createEmptyBoard(this.options.boardSize, MIN_BOARD_SIZE, MAX_BOARD_SIZE, DEFAULT_BOARD_SIZE); // Init with empty board
    this.currentPlayerId = Player.ONE;
    // Set initial gamePhase based on online status; can be overridden by startGame
    this.gamePhase = this.options.player2ControlType === PlayerControlType.ONLINE ? GamePhase.WAITING_ROOM : GamePhase.PLAYING;
    this.winner = null;
    this.winReason = null;
    this.winningPath = null;
    this.turnCount = 0;
    this.firstGameMoveDetails = null;
    this.isPlayerRolesSwapped = false;
    this.swappedCellCoordinate = null;
    this.currentTurnTimeLeft = null;
    this.playerGameTimeLeft = null;
    this._isPlayer1ProfileAssignedToSideONE_atGameStart = true; // Default, randomized in startGame
    this.lastLocalPlayerMoveServerEid = null;
    this.lastProcessedMoveServerEid = null;

    if (initializeGame) {
        this.startGame();
    } else {
        this.notifyUpdate(); // Initial update if game not auto-started
    }
  }

  public setLoggedInUser(user: LoggedInUser | null): void {
    this.loggedInUser = user;
    this.notifyUpdate();
  }

  public setOnlineLocalSeat(seat: Player): void {
    if (this.onlineLocalSeat === seat && this.playerAgent1.profile.name === this.loggedInUser?.name) return;
    this.onlineLocalSeat = seat;
    this._isPlayer1ProfileAssignedToSideONE_atGameStart = seat === Player.ONE;
    if (this.loggedInUser) this.playerAgent1.profile.name = this.loggedInUser.name;
    this.notifyUpdate();
  }
  
  public get isPlayer1ProfileAssignedToSideONE_atGameStart(): boolean {
    return this._isPlayer1ProfileAssignedToSideONE_atGameStart;
  }

  public isAiTurn(): boolean {
    if (!this.aiPlayer || this.options.player2ControlType === PlayerControlType.ONLINE || this.gamePhase !== GamePhase.PLAYING || !!this.winner || !!this.swappedCellCoordinate) {
      return false;
    }
    const p2IsEffectivelySideONE =
      (!this._isPlayer1ProfileAssignedToSideONE_atGameStart && !this.isPlayerRolesSwapped) ||
      (this._isPlayer1ProfileAssignedToSideONE_atGameStart && this.isPlayerRolesSwapped);
    const aiControlledSide = p2IsEffectivelySideONE ? Player.ONE : Player.TWO;
    return this.currentPlayerId === aiControlledSide;
  }

  public get isAiCurrentlyThinking(): boolean {
    return this._isAiCurrentlyThinking;
  }

  private setAiThinking(isThinking: boolean): void {
    if (this._isAiCurrentlyThinking !== isThinking) {
      this._isAiCurrentlyThinking = isThinking;
      this.notifyUpdate();
    }
  }

  public startGame(serverConfirmedOptions?: IgHandlerGameOptions): void {
    if (this.activeTimerIntervalId) clearInterval(this.activeTimerIntervalId);
    this.activeTimerIntervalId = null;
    if (this.aiMoveTimeoutId) clearTimeout(this.aiMoveTimeoutId);
    this.aiMoveTimeoutId = null;
    this.setAiThinking(false);

    let currentBoardSize = this.options.boardSize;
    const currentTimerSettings = { ...this.options.timerSettings };

    if (this.options.player2ControlType === PlayerControlType.ONLINE && serverConfirmedOptions) {
        // For online games, prioritize server-confirmed options
        if (serverConfirmedOptions.boardSize) {
            currentBoardSize = serverConfirmedOptions.boardSize;
            this.options.boardSize = currentBoardSize; 
        }
        if (serverConfirmedOptions.timerTotal !== undefined) {
            currentTimerSettings.mode = serverConfirmedOptions.timerTotal > 0 ? 'perGame' : 'off';
            currentTimerSettings.durationPerGame = serverConfirmedOptions.timerTotal;
        }
        if (serverConfirmedOptions.timerInc !== undefined) {
            currentTimerSettings.incrementSeconds = serverConfirmedOptions.timerInc as AllowedIncrementSecondsType;
        }
        this.options.timerSettings = currentTimerSettings; 
        this.options.swapRuleEnabled = true; // Online games typically enforce swap rule
    }


    this.boardMatrix = createEmptyBoard(currentBoardSize, MIN_BOARD_SIZE, MAX_BOARD_SIZE, DEFAULT_BOARD_SIZE);
    this._isPlayer1ProfileAssignedToSideONE_atGameStart = this.options.player2ControlType === PlayerControlType.ONLINE && this.onlineLocalSeat !== null
      ? this.onlineLocalSeat === Player.ONE
      : Math.random() < 0.5;
    
    this.currentPlayerId = Player.ONE;
    this.gamePhase = GamePhase.PLAYING; 
    this.winner = null;
    this.winReason = null;
    this.winningPath = null;
    this.turnCount = 0;
    this.firstGameMoveDetails = null;
    this.isPlayerRolesSwapped = false;
    this.swappedCellCoordinate = null;
    this.gameHistory.clear();
    this.gameStartTime = Date.now();
    this.gameId = `${this.gameStartTime}-${Math.random().toString(36).substring(2, 9)}`;
    this.lastLocalPlayerMoveServerEid = null;
    this.lastProcessedMoveServerEid = null;

    this.playerAgent1 = new GameParticipant(Player.ONE, this.options.player1Profile);
    this.playerAgent2 = new GameParticipant(Player.TWO, this.options.player2Profile);
    
    if (this.options.player2ControlType === PlayerControlType.AI) {
      this.aiPlayer = new AiPlayer(this.options.aiDifficulty, AI_NAME);
      this.playerAgent2.profile.name = AI_NAME;
      if (this.onlineOpponent) this.onlineOpponent = null; // Ensure onlineOpponent is null if AI
    } else if (this.options.player2ControlType === PlayerControlType.ONLINE) {
      this.onlineOpponent = this.onlineOpponent || new OnlinePlayer(ONLINE_OPPONENT_NAME);
      // The onlineOpponent's name might be updated by server info later
      this.playerAgent2.profile.name = this.onlineOpponent.getName();
      if (this.loggedInUser) this.playerAgent1.profile.name = this.loggedInUser.name;
      if (this.aiPlayer) this.aiPlayer = null; // Ensure aiPlayer is null if Online
    } else { // Human
      if (this.aiPlayer) this.aiPlayer = null;
      if (this.onlineOpponent) this.onlineOpponent = null;
    }
    
    const timer = currentTimerSettings; 
    if (timer.mode === 'perTurn') {
      this.currentTurnTimeLeft = timer.durationPerTurn;
      this.playerGameTimeLeft = null;
    } else if (timer.mode === 'perGame' && timer.durationPerGame) {
      this.playerGameTimeLeft = {
        [Player.ONE]: timer.durationPerGame,
        [Player.TWO]: timer.durationPerGame,
      };
      this.currentTurnTimeLeft = null;
    } else {
      this.currentTurnTimeLeft = null;
      this.playerGameTimeLeft = null;
    }

    this.startTimerIfNeeded();
    this.checkAndTriggerAiMove();
    this.notifyUpdate();
  }

  public notifyUpdate(): void {
    this.onUpdateCallback();
  }

  public async makeMove(row: number, col: number): Promise<void> {
    if (this.options.player2ControlType === PlayerControlType.ONLINE && this.onlineOpponent?.sid && this.currentPlayerId !== this.getEffectiveLocalPlayerSide()) {
      if (DEBUG) console.log("GameController: Online game - Waiting for opponent's move.");
      return;
    }
    if (this.gamePhase !== GamePhase.PLAYING || !!this.winner || !!this.swappedCellCoordinate || this.isAiCurrentlyThinking) return;

    if (this.options.swapRuleEnabled && this.turnCount === 1 && this.firstGameMoveDetails &&
        this.currentPlayerId !== this.firstGameMoveDetails.player && 
        this.firstGameMoveDetails.coord.r === row && this.firstGameMoveDetails.coord.c === col) {
      const currentBoardSideProfile = this.getParticipantProfileForBoardSide(this.currentPlayerId);
      const isCurrentPlayerHumanOrPotentiallyLocalOnlineController = !(this.options.player2ControlType === PlayerControlType.AI && currentBoardSideProfile.name === AI_NAME);
      if (isCurrentPlayerHumanOrPotentiallyLocalOnlineController) {
        await this.executeSwap(); return;
      }
    }

    if (row < 0 || row >= this.options.boardSize || col < 0 || col >= this.options.boardSize || this.boardMatrix[row][col] !== null) {
        return;
    }
    if (this.options.player2ControlType === PlayerControlType.ONLINE) {
      const accepted = await this.sendOnlineMove(encodeHexMove({ r: row, c: col }, this.options.boardSize));
      if (!accepted) return;
    }
    this.processValidMove(row, col);
  }

  private async sendOnlineMove(move: string): Promise<boolean> {
    if (!this.onlineOpponent?.sid || !this.loggedInUser) return false;
    try {
      const response = await this.onlineOpponent.sendCommand('MOVE', this.loggedInUser, { move });
      if (response.error) {
        if (DEBUG) console.error('Server rejected MOVE:', response.message);
        return false;
      }
      const moveEvent = (response as IgCommandHandlerSuccessResponse).eventList
        ?.filter(event => event.type === 'MOVE' && event.uid === this.loggedInUser?.uid)
        .at(-1);
      if (moveEvent) {
        this.lastLocalPlayerMoveServerEid = moveEvent.eid;
        this.lastProcessedMoveServerEid = moveEvent.eid;
      }
      return true;
    } catch (error) {
      if (DEBUG) console.error('Failed to send MOVE:', error);
      return false;
    }
  }

  public getEffectiveLocalPlayerSide(): Player | null {
      if (!this.loggedInUser) return null; // No local player if not logged in
      if (this.options.player2ControlType === PlayerControlType.ONLINE) return this.onlineLocalSeat;
      if (this.playerAgent1.profile.name === this.loggedInUser.name) { // If P1 config matches logged in user
        return this._isPlayer1ProfileAssignedToSideONE_atGameStart ? 
               (this.isPlayerRolesSwapped ? Player.TWO : Player.ONE) : 
               (this.isPlayerRolesSwapped ? Player.ONE : Player.TWO);
      } else if (this.playerAgent2.profile.name === this.loggedInUser.name) { // If P2 config matches logged in user
        return !this._isPlayer1ProfileAssignedToSideONE_atGameStart ? 
               (this.isPlayerRolesSwapped ? Player.TWO : Player.ONE) : 
               (this.isPlayerRolesSwapped ? Player.ONE : Player.TWO);
      }
      return null; // Logged in user is not one of the configured players
  }
  
  private processValidMove(row: number, col: number): void {
    this.recordCurrentStateForUndo();
    const newBoard = this.boardMatrix.map(r => [...r]);
    newBoard[row][col] = this.currentPlayerId;
    this.boardMatrix = newBoard;

    if (this.turnCount === 0) {
      this.firstGameMoveDetails = { coord: { r: row, c: col }, player: this.currentPlayerId };
    }
    this.turnCount++;

    if (this.options.timerSettings.mode === 'perGame' &&
        (this.options.player2ControlType === PlayerControlType.ONLINE || this.options.player2ControlType === PlayerControlType.HUMAN || this.options.player2ControlType === PlayerControlType.AI) &&
        (this.options.timerSettings.incrementSeconds ?? 0) > 0 &&
        this.playerGameTimeLeft && this.playerGameTimeLeft[this.currentPlayerId] !== undefined) {
      // Apply increment only if it's NOT AI's turn or if AI is not the current player control type
      if (this.options.player2ControlType !== PlayerControlType.AI || !this.isAiTurn()) {
         (this.playerGameTimeLeft[this.currentPlayerId] as number) += (this.options.timerSettings.incrementSeconds as number);
      }
    }

    const winCheckPath = this.checkForWin(this.currentPlayerId);
    if (winCheckPath) {
      this.endGame(this.currentPlayerId, WinReason.CONNECTION, winCheckPath);
    } else {
      this.currentPlayerId = this.currentPlayerId === Player.ONE ? Player.TWO : Player.ONE;
      if (this.options.timerSettings.mode === 'perTurn') {
        this.currentTurnTimeLeft = this.options.timerSettings.durationPerTurn;
      }
      this.startTimerIfNeeded(); // This will now pause if it's AI's turn
      if (this.options.player2ControlType === PlayerControlType.ONLINE) {
        // Online: Wait for server move, OnlinePlayManager will handle setting turn
      } else {
        this.checkAndTriggerAiMove();
      }
    }
    this.notifyUpdate();
  }

  public applyOpponentMove(row: number, col: number): void {
    // This method assumes it's currently the opponent's turn in the game state.
    // The currentPlayerId should reflect the opponent.
    if (this.gamePhase !== GamePhase.PLAYING || !!this.winner) {
        if (DEBUG) console.warn("GameController: applyOpponentMove called in invalid state.", { phase: this.gamePhase, winner: this.winner });
        return;
    }
    if (row < 0 || row >= this.options.boardSize || col < 0 || col >= this.options.boardSize || this.boardMatrix[row][col] !== null) {
        if (DEBUG) console.warn("GameController: applyOpponentMove received invalid coords or cell not empty.", { row, col, cell: this.boardMatrix[row]?.[col] });
        return; // Invalid move
    }

    // Do NOT record for local undo history for opponent online moves; server is truth.
    const newBoard = this.boardMatrix.map(r => [...r]);
    newBoard[row][col] = this.currentPlayerId; // currentPlayerId is opponent's ID here when this is called
    this.boardMatrix = newBoard;
    this.turnCount++;

    if (this.options.timerSettings.mode === 'perGame' &&
        this.options.player2ControlType === PlayerControlType.ONLINE &&
        (this.options.timerSettings.incrementSeconds ?? 0) > 0 &&
        this.playerGameTimeLeft && this.playerGameTimeLeft[this.currentPlayerId] !== undefined) {
        // Apply increment for the opponent (currentPlayerId) who just moved
        (this.playerGameTimeLeft[this.currentPlayerId] as number) += (this.options.timerSettings.incrementSeconds as number);
    }

    const winCheckPath = this.checkForWin(this.currentPlayerId); // Check if opponent won
    if (winCheckPath) {
        this.endGame(this.currentPlayerId, WinReason.CONNECTION, winCheckPath);
    } else {
        this.currentPlayerId = this.currentPlayerId === Player.ONE ? Player.TWO : Player.ONE; // Switch turn to local player
        if (this.options.timerSettings.mode === 'perTurn' && this.currentTurnTimeLeft !== null) {
            this.currentTurnTimeLeft = this.options.timerSettings.durationPerTurn; // Reset local player's turn timer
        }
        this.startTimerIfNeeded(); // Start local player's timer
    }
    this.notifyUpdate();
  }

  public setPlayerGameTime(player: Player, timeLeft: number): void {
    if (this.options.timerSettings.mode === 'perGame' && this.playerGameTimeLeft) {
        // Only update if the new time is significantly different, or to prevent local timer from running too far ahead/behind
        // For simplicity, always update if the value changes or if it's a sync from server.
        if (this.playerGameTimeLeft[player] !== timeLeft) {
            this.playerGameTimeLeft[player] = timeLeft;
            if (this.gamePhase === GamePhase.PLAYING) { // Only notify if game is active and timer is running
                this.notifyUpdate();
            }
        }
    }
  }
  
  private checkAndTriggerAiMove(): void {
    if (this.options.player2ControlType === PlayerControlType.ONLINE) return;
    if (this.isAiTurn() && !this.isAiCurrentlyThinking) {
      this.setAiThinking(true);
      // Stop timer for AI's turn before the delay
      if (this.activeTimerIntervalId) clearInterval(this.activeTimerIntervalId);
      this.activeTimerIntervalId = null;
      this.notifyUpdate(); // Update UI to reflect timer potentially stopping

      this.aiMoveTimeoutId = setTimeout(() => {
        if (!this.isAiTurn()) { this.setAiThinking(false); return; } // Check again after delay
        const aiControlledSide = this.currentPlayerId;
        const aiCanSwap = this.options.swapRuleEnabled && this.turnCount === 1
          && this.firstGameMoveDetails !== null
          && aiControlledSide !== this.firstGameMoveDetails.player;
        const move = this.aiPlayer!.getMove(this.boardMatrix, aiControlledSide, aiCanSwap);
        this.setAiThinking(false); // AI finished thinking
        if (move && aiCanSwap && this.firstGameMoveDetails
            && move.r === this.firstGameMoveDetails.coord.r
            && move.c === this.firstGameMoveDetails.coord.c) {
          void this.executeSwap();
          return;
        }
        if (move && this.boardMatrix[move.r][move.c] === null) this.processValidMove(move.r, move.c);
        else if (move && DEBUG) console.warn("AI chose invalid cell:", move);
        else if (DEBUG) console.warn("AI no move.");
        // After AI's move, processValidMove will call startTimerIfNeeded, which will start it for human
      }, AI_THINKING_DELAY_MS) as unknown as number;
    }
  }

  private async executeSwap(): Promise<void> {
    if (!this.firstGameMoveDetails) return;
    const playerInitiatingSwapDecision = this.currentPlayerId;
    if (
      this.options.player2ControlType === PlayerControlType.ONLINE
      && playerInitiatingSwapDecision === this.getEffectiveLocalPlayerSide()
      && !(await this.sendOnlineMove('SWAP'))
    ) {
      return;
    }
    this.recordCurrentStateForUndo();
    const { r, c } = this.firstGameMoveDetails.coord;
    const newBoard = this.boardMatrix.map(row => [...row]);
    newBoard[r][c] = null;
    newBoard[c][r] = playerInitiatingSwapDecision;
    this.boardMatrix = newBoard;
    this.turnCount++;
    this.currentPlayerId = this.firstGameMoveDetails.player;
    this.swappedCellCoordinate = { r: c, c: r };
    
    if (this.options.timerSettings.mode === 'perTurn') this.currentTurnTimeLeft = this.options.timerSettings.durationPerTurn;
    this.startTimerIfNeeded(); // This will correctly handle AI or Human turn post-swap
    this.notifyUpdate();
    setTimeout(() => {
        this.swappedCellCoordinate = null;
        if (this.options.player2ControlType !== PlayerControlType.ONLINE) this.checkAndTriggerAiMove();
        // If online, OnlinePlayManager will handle opponent's turn or next local player's turn based on server
        this.notifyUpdate();
    }, 1500);
  }

  public applyOpponentSwap(): void {
    if (
      this.options.player2ControlType === PlayerControlType.ONLINE
      && this.currentPlayerId !== this.getEffectiveLocalPlayerSide()
    ) {
      void this.executeSwap();
    }
  }

  private recordCurrentStateForUndo(): void {
    const record: MoveRecord = {
      boardMatrix: this.boardMatrix.map(r => [...r]), currentPlayer: this.currentPlayerId,
      turnCount: this.turnCount,
      firstGameMove: this.firstGameMoveDetails ? { ...this.firstGameMoveDetails, coord: {...this.firstGameMoveDetails.coord} } : null,
      isPlayerRolesSwapped: this.isPlayerRolesSwapped, currentTurnTimeLeft: this.currentTurnTimeLeft,
      playerGameTimeLeft: this.playerGameTimeLeft ? JSON.parse(JSON.stringify(this.playerGameTimeLeft)) : null,
      winningPath: this.winningPath ? [...this.winningPath] : null,
    };
    this.gameHistory.addMove(record);
  }

  public canUndo(): boolean {
    if (this.options.player2ControlType === PlayerControlType.ONLINE) return false; // Use online undo mechanism
    if (this._isAiCurrentlyThinking) return false;
    if (this.options.player2ControlType === PlayerControlType.AI && this.isAiTurn()) return false;
    return this.gameHistory.getStackLength() > 0 && this.gamePhase === GamePhase.PLAYING && !this.winner && !this.swappedCellCoordinate;
  }

  public canReset(): boolean {
    return this.gamePhase === GamePhase.PLAYING && !this.swappedCellCoordinate && this.gameHistory.getStackLength() > 0 && !this.isAiCurrentlyThinking;
  }

  public undoMove(): void { // This is for local/AI undo
    if (!this.canUndo()) return;
    if (this.activeTimerIntervalId) clearInterval(this.activeTimerIntervalId); this.activeTimerIntervalId = null;
    if (this.aiMoveTimeoutId) clearTimeout(this.aiMoveTimeoutId); this.aiMoveTimeoutId = null; this.setAiThinking(false);

    const restoreStateFromRecord = (prevState: MoveRecord) => {
        this.boardMatrix = prevState.boardMatrix.map(row => [...row]); // Ensure deep copy
        this.currentPlayerId = prevState.currentPlayer;
        this.turnCount = prevState.turnCount; 
        this.firstGameMoveDetails = prevState.firstGameMove ? {...prevState.firstGameMove, coord: {...prevState.firstGameMove.coord}} : null;
        this.isPlayerRolesSwapped = prevState.isPlayerRolesSwapped; 
        this.currentTurnTimeLeft = prevState.currentTurnTimeLeft;
        this.playerGameTimeLeft = prevState.playerGameTimeLeft ? JSON.parse(JSON.stringify(prevState.playerGameTimeLeft)) : null;
        this.winner = null; this.winReason = null; this.winningPath = null; this.gamePhase = GamePhase.PLAYING;
        this.swappedCellCoordinate = null; // Ensure this is reset
        this.lastLocalPlayerMoveServerEid = null; // Online EIDs are irrelevant for local undo
        this.lastProcessedMoveServerEid = null;
    };
    let undoPerformedSuccessfully = false; const firstPrevState = this.gameHistory.undoLastMove();
    if (firstPrevState) { restoreStateFromRecord(firstPrevState); undoPerformedSuccessfully = true;
      if (this.options.player2ControlType === PlayerControlType.AI && this.gameHistory.getStackLength() > 0 && this.isAiTurn()) { // If AI was about to move, undo its "thought process" start essentially
        const secondPrevState = this.gameHistory.undoLastMove(); // This would be the human's move
        if (secondPrevState) restoreStateFromRecord(secondPrevState);
      }
    }
    if (undoPerformedSuccessfully) { this.startTimerIfNeeded();
      if (this.options.player2ControlType !== PlayerControlType.ONLINE) this.checkAndTriggerAiMove();
      this.notifyUpdate();
    }
  }
  
  private getNeighbors(r: number, c: number): Coordinate[] {
    const potentialNeighborCoords: Array<[number, number]> = [
      [r, c - 1], [r, c + 1], [r - 1, c], [r - 1, c + 1], [r + 1, c], [r + 1, c - 1],
    ];
    const neighbors: Coordinate[] = [];
    for (const [nr, nc] of potentialNeighborCoords) {
      if (nr >= 0 && nr < this.options.boardSize && nc >= 0 && nc < this.options.boardSize) {
        neighbors.push({ r: nr, c: nc });
      }
    }
    return neighbors;
  }

  public checkForWin(playerSide: Player): Coordinate[] | null {
    const size = this.options.boardSize;
    if (size === 0) return null;
    const visited = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
    const parent = Array.from({ length: size }, () => Array<Coordinate | null>(size).fill(null));
    const queue: Coordinate[] = [];
    for (let index = 0; index < size; index++) {
      const start = playerSide === Player.ONE ? { r: index, c: 0 } : { r: 0, c: index };
      if (this.boardMatrix[start.r][start.c] === playerSide) {
        visited[start.r][start.c] = true;
        queue.push(start);
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head];
      if ((playerSide === Player.ONE && cell.c === size - 1) ||
          (playerSide === Player.TWO && cell.r === size - 1)) {
        const path: Coordinate[] = [];
        let current: Coordinate | null = cell;
        while (current) {
          path.push(current);
          current = parent[current.r][current.c];
        }
        return path.reverse();
      }
      for (const neighbor of this.getNeighbors(cell.r, cell.c)) {
        if (!visited[neighbor.r][neighbor.c] && this.boardMatrix[neighbor.r][neighbor.c] === playerSide) {
          visited[neighbor.r][neighbor.c] = true;
          parent[neighbor.r][neighbor.c] = cell;
          queue.push(neighbor);
        }
      }
    }
    return null;
  }

  public endGame(wonPlayerSide: Player | null, reason: WinReason | null, path: Coordinate[] | null): void {
    if (this.gamePhase === GamePhase.GAME_OVER && this.winner === wonPlayerSide && this.winReason === reason) {
        if (DEBUG) console.log("GameController: endGame called but game already over with same result. Skipping.");
        return; // Avoid re-processing if game already ended with the same outcome
    }
    this.gamePhase = GamePhase.GAME_OVER;
    if (this.activeTimerIntervalId) clearInterval(this.activeTimerIntervalId); this.activeTimerIntervalId = null;
    if (this.aiMoveTimeoutId) clearTimeout(this.aiMoveTimeoutId); this.aiMoveTimeoutId = null; this.setAiThinking(false);
    this.winner = wonPlayerSide; this.winReason = reason; this.winningPath = path;
    this.notifyUpdate();
  }
  
  public getCompletedGameData(): CompletedGameEntry | null {
    if (this.gamePhase !== GamePhase.GAME_OVER || !this.gameStartTime || !this.gameId) return null;
    const duration = (Date.now() - this.gameStartTime) / 1000;
    const finalHistory: HistoryEntry[] = this.gameHistory.getFullHistory().map(mr => ({
        ...mr, boardMatrix: mr.boardMatrix.map(r => [...r]),
        firstGameMove: mr.firstGameMove ? { ...mr.firstGameMove, coord: {...mr.firstGameMove.coord} } : null,
        playerGameTimeLeft: mr.playerGameTimeLeft ? JSON.parse(JSON.stringify(mr.playerGameTimeLeft)) : null,
        winningPath: mr.winningPath ? [...mr.winningPath] : null,
    }));
    const finalBoardStateRecord: HistoryEntry = {
      boardMatrix: this.boardMatrix.map(r => [...r]), currentPlayer: this.currentPlayerId, turnCount: this.turnCount,
      firstGameMove: this.firstGameMoveDetails ? { ...this.firstGameMoveDetails, coord: {...this.firstGameMoveDetails.coord} } : null,
      isPlayerRolesSwapped: this.isPlayerRolesSwapped, currentTurnTimeLeft: this.currentTurnTimeLeft,
      playerGameTimeLeft: this.playerGameTimeLeft ? JSON.parse(JSON.stringify(this.playerGameTimeLeft)) : null,
      winningPath: this.winningPath ? [...this.winningPath] : null,
    };
    finalHistory.push(finalBoardStateRecord);
    const gameSettings: CompletedGameEntry['settings'] = {
        boardSize: this.options.boardSize, timerSettings: { ...this.options.timerSettings, incrementSeconds: this.options.timerSettings.incrementSeconds ?? 0 },
        swapRuleEnabled: this.options.swapRuleEnabled, player2ControlType: this.options.player2ControlType,
    };
    if(this.options.player2ControlType === PlayerControlType.AI) gameSettings.aiDifficulty = this.options.aiDifficulty;
    return {
      id: this.gameId, timestamp: Date.now(), durationSeconds: Math.round(duration), settings: gameSettings,
      player1Profile: { ...this.playerAgent1.profile }, player2Profile: { ...this.playerAgent2.profile },
      wasPlayer1ProfileAssignedToSideONE_atGameStart: this._isPlayer1ProfileAssignedToSideONE_atGameStart,
      finalWinnerPlayerColor: this.winner, winReason: this.winReason, finalWinningPath: this.winningPath ? [...this.winningPath] : null,
      wasPlayerRolesSwappedAtGameEnd: this.isPlayerRolesSwapped, history: finalHistory,
    };
  }

  private startTimerIfNeeded(): void {
    if (this.activeTimerIntervalId) clearInterval(this.activeTimerIntervalId); this.activeTimerIntervalId = null;
    
    // Timer should not run if:
    // 1. Game is not in PLAYING phase.
    // 2. There's already a winner.
    // 3. Timer mode is 'off'.
    // 4. AI is currently thinking.
    // 5. It's an online game and it's the opponent's turn.
    // 6. It's an AI game AND it's the AI's turn.
    const isOnlineGameAndOpponentsTurn = this.options.player2ControlType === PlayerControlType.ONLINE && this.onlineOpponent?.sid && this.currentPlayerId !== this.getEffectiveLocalPlayerSide();
    const isAiGameAndAIsTurn = this.options.player2ControlType === PlayerControlType.AI && this.isAiTurn();

    if (this.gamePhase !== GamePhase.PLAYING || !!this.winner || this.options.timerSettings.mode === 'off' || this.isAiCurrentlyThinking || isOnlineGameAndOpponentsTurn || isAiGameAndAIsTurn) {
        return;
    }

    this.activeTimerIntervalId = setInterval(() => {
      // Re-check conditions inside interval in case state changes rapidly
      const isStillOnlineGameAndOpponentsTurn = this.options.player2ControlType === PlayerControlType.ONLINE && this.onlineOpponent?.sid && this.currentPlayerId !== this.getEffectiveLocalPlayerSide();
      const isStillAiGameAndAIsTurn = this.options.player2ControlType === PlayerControlType.AI && this.isAiTurn();

      if (this.gamePhase !== GamePhase.PLAYING || !!this.winner || this.isAiCurrentlyThinking || isStillOnlineGameAndOpponentsTurn || isStillAiGameAndAIsTurn) {
        if (this.activeTimerIntervalId) clearInterval(this.activeTimerIntervalId); this.activeTimerIntervalId = null; return;
      }
      let changed = false;
      if (this.options.timerSettings.mode === 'perTurn' && this.currentTurnTimeLeft !== null) {
        this.currentTurnTimeLeft--; if (this.currentTurnTimeLeft <= 0) { this.currentTurnTimeLeft = 0;
          const timeoutWinnerSide = this.currentPlayerId === Player.ONE ? Player.TWO : Player.ONE;
          this.endGame(timeoutWinnerSide, WinReason.TIMEOUT, null);
        } changed = true;
      } else if (this.options.timerSettings.mode === 'perGame' && this.playerGameTimeLeft) {
        const currentPlayerSideKey = this.currentPlayerId;
        if (this.playerGameTimeLeft[currentPlayerSideKey] !== undefined) {
             (this.playerGameTimeLeft[currentPlayerSideKey] as number) -=1;
             if (this.playerGameTimeLeft[currentPlayerSideKey]! <= 0) { this.playerGameTimeLeft[currentPlayerSideKey] = 0;
                const timeoutWinnerSide = currentPlayerSideKey === Player.ONE ? Player.TWO : Player.ONE;
                this.endGame(timeoutWinnerSide, WinReason.TIMEOUT, null);
             } changed = true;
        }
      }
      if (changed && this.gamePhase === GamePhase.PLAYING) this.notifyUpdate();
    }, 1000) as unknown as number;
  }
  
  public getParticipantProfileForBoardSide(boardSide: Player): PlayerProfile {
    const p1ProfileIsEffectivelyPlayerOneSide =
      (this._isPlayer1ProfileAssignedToSideONE_atGameStart && !this.isPlayerRolesSwapped) ||
      (!this._isPlayer1ProfileAssignedToSideONE_atGameStart && this.isPlayerRolesSwapped);
    if (p1ProfileIsEffectivelyPlayerOneSide) return boardSide === Player.ONE ? this.playerAgent1.profile : this.playerAgent2.profile;
    else return boardSide === Player.ONE ? this.playerAgent2.profile : this.playerAgent1.profile;
  }

  public getCurrentParticipantProfile(): PlayerProfile {
      return this.getParticipantProfileForBoardSide(this.currentPlayerId);
  }

  public setOnlineGameSession(sid: string, server: string): void {
    if (this.options.player2ControlType === PlayerControlType.ONLINE && this.onlineOpponent) {
      this.onlineOpponent.setSessionInfo(sid, server);
      this.gamePhase = GamePhase.WAITING_ROOM;
      this.lastLocalPlayerMoveServerEid = null;
      this.lastProcessedMoveServerEid = null;
      this.notifyUpdate();
    }
  }

 public clearOnlineGameSession(): void {
    if (this.onlineOpponent) {
      this.onlineLocalSeat = null;
      this.onlineOpponent.clearSessionInfo();
      this.lastLocalPlayerMoveServerEid = null;
      this.lastProcessedMoveServerEid = null;

      // If game was active (not just in waiting room), reset to a clean state for the current options
      // This assumes this.options still reflects the user's desire to play Online if no explicit change.
      if (this.gamePhase !== GamePhase.WAITING_ROOM && this.options.player2ControlType === PlayerControlType.ONLINE) {
          this.boardMatrix = createEmptyBoard(this.options.boardSize, MIN_BOARD_SIZE, MAX_BOARD_SIZE, DEFAULT_BOARD_SIZE);
          this.currentPlayerId = Player.ONE;
          this.gamePhase = GamePhase.PLAYING; // Set to PLAYING but no session ID means UI shows buttons
          this.winner = null;
          this.winReason = null;
          this.winningPath = null;
          this.turnCount = 0;
          this.firstGameMoveDetails = null;
          // Keep isPlayerRolesSwapped & _isPlayer1ProfileAssignedToSideONE_atGameStart as they relate to player config.
          this.swappedCellCoordinate = null;
          this.gameHistory.clear();

          // Reset timers according to current GameOptions for an Online game context
          const timer = this.options.timerSettings;
          if (timer.mode === 'perGame' && timer.durationPerGame) {
              this.playerGameTimeLeft = {
                  [Player.ONE]: timer.durationPerGame,
                  [Player.TWO]: timer.durationPerGame,
              };
              this.currentTurnTimeLeft = null;
          } else { // 'off' or invalid for online context.
              this.currentTurnTimeLeft = null;
              this.playerGameTimeLeft = null;
          }
          if (this.activeTimerIntervalId) clearInterval(this.activeTimerIntervalId);
          this.activeTimerIntervalId = null;
      } else if (this.gamePhase === GamePhase.WAITING_ROOM) {
          // If was in waiting room, simply reset phase
          this.gamePhase = GamePhase.PLAYING; // Or a more neutral "pre-game" state
      }
      this.notifyUpdate();
    }
  }
  
  /**
   * Reinitializes the game state from data received from the server, typically after an online event like UNDO.
   * @param boardString The board state as a flat string.
   * @param playerList The list of players from the server, used to determine active player and timers.
   * @param sessionInfo Session information from the server, can also indicate active player or game status.
   */
  public reinitializeFromOnlineState(
    boardString: string,
    playerList: IgPlayerInfo[],
    sessionInfo: IgSessionInfo
  ): void {
    if (this.options.player2ControlType !== PlayerControlType.ONLINE) return;

    // Parse boardString into boardMatrix
    const newBoardMatrix: BoardMatrix = [];
    for (let i = 0; i < this.options.boardSize; i++) {
      const row: CellState[] = [];
      for (let j = 0; j < this.options.boardSize; j++) {
        const char = boardString[i * this.options.boardSize + j];
        row.push(char === '1' ? Player.ONE : char === '2' ? Player.TWO : null);
      }
      newBoardMatrix.push(row);
    }
    this.boardMatrix = newBoardMatrix;

    // Determine current player
    let activePlayerFound = false;
    let activePlayerUidFromServer: string | undefined = sessionInfo.activePlayer; // Prefer sessionInfo's activePlayer

    if (!activePlayerUidFromServer) { // Fallback to playerList if sessionInfo doesn't specify
        const activePlayerInfoFromList = playerList.find(p => p.active === '1');
        if (activePlayerInfoFromList) activePlayerUidFromServer = activePlayerInfoFromList.uid;
    }

    if (activePlayerUidFromServer) {
        const activePlayerDetail = playerList.find(p => p.uid === activePlayerUidFromServer);
        if (activePlayerDetail && activePlayerDetail.place && (activePlayerDetail.place === '1' || activePlayerDetail.place === '2')) {
             this.currentPlayerId = activePlayerDetail.place === '1' ? Player.ONE : Player.TWO;
             activePlayerFound = true;
        }
    }
    
    if (!activePlayerFound) {
      if (DEBUG) console.warn("reinitializeFromOnlineState: Could not determine active player from server data. Defaulting to P1.");
      this.currentPlayerId = Player.ONE; 
    }
    
    // Turn count can be complex to sync perfectly after an undo without specific server data for it.
    // For now, we accept it might be out of sync with a simple linear undo.
    // A simple heuristic: count non-null cells. This is an approximation.
    let moveCount = 0;
    this.boardMatrix.forEach(row => row.forEach(cell => { if (cell !== null) moveCount++; }));
    this.turnCount = moveCount;

    // Update timers based on server data
    if (this.options.timerSettings.mode === 'perGame' && this.playerGameTimeLeft) {
        playerList.forEach(pInfo => {
            if (pInfo.timerLeft !== undefined) {
                const playerSideToUpdate = pInfo.place === '1' ? Player.ONE : Player.TWO;
                if (this.playerGameTimeLeft && (pInfo.place === '1' || pInfo.place === '2')) {
                     this.playerGameTimeLeft[playerSideToUpdate] = pInfo.timerLeft;
                }
            }
        });
    } else if (this.options.timerSettings.mode === 'perTurn') {
        this.currentTurnTimeLeft = this.options.timerSettings.durationPerTurn; // Reset turn timer
    }
    
    this.winner = null;
    this.winReason = null;
    this.winningPath = null;
    this.gamePhase = sessionInfo.status === 'ACTIVE' ? GamePhase.PLAYING : (sessionInfo.status === 'FINISHED' ? GamePhase.GAME_OVER : GamePhase.WAITING_ROOM);
    this.swappedCellCoordinate = null;
    
    // Crucial: Clear local game history as it's now potentially invalid. Server is source of truth.
    this.gameHistory.clear();
    
    // firstGameMoveDetails and isPlayerRolesSwapped should NOT be reset by a simple undo unless it's the first move.
    // The server's board state reflects the game state after the undo.
    // These properties are about the *history* of how the game reached this state, which an undo doesn't erase.
    // Exception: if the undo reverts the *very first* move, then firstGameMoveDetails should be null.
    if (this.turnCount === 0) {
        this.firstGameMoveDetails = null;
        // isPlayerRolesSwapped would also be false if turnCount is 0.
    }
    // If the undo reverted a swap action (i.e., turn count goes back to 1 and swap was just made),
    // isPlayerRolesSwapped should revert. This specific scenario needs careful handling if implemented fully.
    // For now, assume server state is king and these values are stable unless it's very early game.

    // After an undo, the last server-confirmed move EIDs might need to be considered invalidated or reset,
    // depending on how the server handles EIDs post-undo. For now, clear them.
    this.lastLocalPlayerMoveServerEid = null;
    this.lastProcessedMoveServerEid = null; // This should be updated by the EID of the UNDO event or the new board state event itself.

    this.startTimerIfNeeded(); // Restart timers based on new state
    this.notifyUpdate();
    if (DEBUG) console.log("GameController: Reinitialized state from server after online event (e.g., undo). Current player:", this.currentPlayerId);
  }


  public dispose(): void {
    if (this.activeTimerIntervalId) clearInterval(this.activeTimerIntervalId); this.activeTimerIntervalId = null;
    if (this.aiMoveTimeoutId) clearTimeout(this.aiMoveTimeoutId); this.aiMoveTimeoutId = null; this.setAiThinking(false);
    if (DEBUG) console.log("GameController disposed.");
  }
}
