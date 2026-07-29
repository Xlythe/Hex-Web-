
import React, { createContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import {
  Player, GamePhase, Coordinate, CompletedGameEntry,
  PlayerProfile, TimerSettings, WinReason, PlayerControlType, AiDifficulty,
  BoardMatrix, FirstGameMoveDetails, ThemeMode, IgHandlerGameOptions,
  HistoryEntry // Added missing import for HistoryEntry used in GameController.getCompletedGameData
} from '../types';
import { GameOptions } from '../GameOptions';
import { GameController } from '../GameController';
import { ReplayService, ReplaySnapshot } from '../ReplayService';
import { createEmptyBoard } from '../utils';
import { MIN_BOARD_SIZE, MAX_BOARD_SIZE, DEFAULT_BOARD_SIZE, DEFAULT_CHAT_NOTIFICATIONS_ENABLED } from '../Constants'; // Added DEFAULT_CHAT_NOTIFICATIONS_ENABLED
import { useAuth } from '../hooks/useAuth'; // Used to obtain the logged-in user, relevant for online gameplay features.
import { safeStorageJson, safeStorageSet } from '../storage';

/**
 * @interface CurrentDisplayState
 * Represents the consolidated state of the game that UI components should render.
 * This object is derived from either the `GameController` (for live games),
 * the `ReplayService` (for active replays), or default `GameOptions` (before a game starts).
 * It ensures a consistent data structure for the UI, regardless of the underlying game mode.
 */
export interface CurrentDisplayState {
  /** The current visual state of the Hex board. */
  boardMatrix: BoardMatrix;
  /** The player whose turn it currently is. */
  currentPlayerId: Player;
  /** The number of turns taken in the current game or replay step. */
  turnCount: number;
  /** Details about the first move, relevant if the swap rule was used. Null if not applicable. */
  firstGameMoveDetails: FirstGameMoveDetails | null;
  /** True if the initial player roles (Player.ONE playing as "Player 1", Player.TWO as "Player 2") have been swapped. This can happen due to the swap rule or if players chose to swap sides at the start. */
  isPlayerRolesSwapped: boolean;
  /**
   * Indicates if the profile designated as 'Player 1' (e.g., `gameOptions.player1Profile`)
   * was initially assigned to play as Player.ONE (the first player to move, typically Red).
   * This, in conjunction with `isPlayerRolesSwapped`, determines which profile is currently controlling Player.ONE's pieces.
   */
  wasP1ProfileAssignedSideONEatStart: boolean;
  /** Time remaining for the current player's turn, if turn-based timers are active. Null otherwise. */
  currentTurnTimeLeft: number | null;
  /** Time remaining for each player for the entire game, if game-based timers are active. Null otherwise. */
  playerGameTimeLeft: { [key in Player]?: number } | null;
  /** An array of coordinates representing the winning path, if the game is over and a winner is determined. Null otherwise. */
  winningPath: Coordinate[] | null;
  /** The current phase of the game (e.g., PLAYING, GAME_OVER, REPLAY). */
  gamePhase: GamePhase;
  /** The Player (color) who won the game, if applicable. Null otherwise. */
  finalWinnerPlayerColor: Player | null;
  /** The reason for the game ending (e.g., CONNECTED_PATH, TIMEOUT, RESIGNATION). Null if game is ongoing. */
  winReason: WinReason | null;
  /** The profile configured for the player initially designated as "Player 1". */
  configuredPlayer1Profile: PlayerProfile;
  /** The profile configured for the player initially designated as "Player 2". */
  configuredPlayer2Profile: PlayerProfile;
  /** True if a game replay is currently active (i.e., stepping through a past game). */
  isReplayActive: boolean;
  /** Coordinate of the cell that was part of a swap move, if applicable and recent. Used for UI highlighting. */
  swappedCellCoordinate: Coordinate | null;
  /** The current step index in an active replay. -1 if not in replay. */
  currentReplayStep: number;
  /** The total number of steps (moves) in the game being replayed. */
  totalReplaySteps: number;
  /** Timestamp of when the game being replayed was originally played. Null if not in replay. */
  gameBeingReplayedTimestamp: number | null;
  /** Board size of the game being replayed. */
  gameBeingReplayedBoardSize: number;
  /** Timer settings of the game being replayed. */
  gameBeingReplayedTimerSettings: TimerSettings;
  /** Swap rule setting of the game being replayed. */
  gameBeingReplayedSwapRule: boolean;
  /** Indicates if the opponent in the game (or game being replayed) is an AI. */
  isAiOpponent: boolean;
  /** Indicates if the opponent in the game (or game being replayed) is an online player. */
  isOnlineOpponent: boolean;
}

/**
 * @interface GameSessionContextType
 * Defines the shape of the context provided by `GameSessionProvider`.
 * It exposes game options, control functions, current game state, and completed game history
 * to consumer components.
 */
export interface GameSessionContextType {
  /** Current game options (board size, timer, player profiles, etc.). Persisted to localStorage. */
  gameOptions: GameOptions;
  /**
   * Function to update game options. Changes are persisted.
   * @returns The newly updated GameOptions object.
   */
  updateGameOptionsAndSave: (
    newBoardSize: number,
    newTimerSettings: TimerSettings,
    newSwapRuleEnabled: boolean,
    newP1Profile: PlayerProfile,
    newP2Profile: PlayerProfile,
    newThemeMode: ThemeMode,
    newPlayer2LocalName: string, 
    newPlayer2ControlType: PlayerControlType,
    newAiDifficulty: AiDifficulty,
    newChatNotificationsEnabled: boolean // Added 10th argument
  ) => GameOptions;
  /**
   * Instance of the GameController, responsible for managing the logic of an active game.
   * Null if no game is active or before initialization.
   */
  gameController: GameController | null;
  /** The current, derived display state of the game, suitable for UI rendering. */
  currentDisplayState: CurrentDisplayState;
  /** Array of recently completed games, loaded from and saved to localStorage. */
  completedGames: CompletedGameEntry[];
  /** Allows direct setting of completed games, e.g., for clearing history. */
  setCompletedGames: React.Dispatch<React.SetStateAction<CompletedGameEntry[]>>;
  /** Starts a new game based on the current `gameOptions`. Accepts optional server-confirmed options for online games. */
  startGame: (serverConfirmedOptions?: IgHandlerGameOptions) => void;
  /** Undoes the last move in the current game, if possible. */
  undoMove: () => void;
  /**
   * Makes a move on the board at the given coordinates (r, c).
   * This is an async operation, especially if an AI opponent needs to compute its move.
   */
  makeMove: (r: number, c: number) => Promise<void>;
  /** Starts replaying a selected completed game. */
  startReplay: (game: CompletedGameEntry) => void;
  /** Stops the current replay and starts a new game. */
  stopReplayAndNewGame: () => void;
  /** Stops the current replay and returns to the list of completed games. */
  stopReplayAndShowList: () => void;
  /**
   * Retrieves the `PlayerProfile` for the player currently controlling the given `boardSide` (Player.ONE or Player.TWO).
   * Accounts for initial role assignments and any swaps that may have occurred.
   */
  getProfileForBoardSide: (boardSide: Player) => PlayerProfile;
  /** Retrieves the `PlayerProfile` of the participant whose turn it currently is. */
  getCurrentTurnParticipantProfile: () => PlayerProfile;
  /** Controls the visibility of the list/panel showing completed games available for replay. */
  isReplayListVisible: boolean;
  /** Setter for `isReplayListVisible`. */
  setIsReplayListVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * React Context for managing game session state.
 * Provides access to game logic, options, and display state throughout the application.
 */
export const GameSessionContext = createContext<GameSessionContextType | undefined>(undefined);

interface GameSessionProviderProps {
  children: ReactNode;
}

/**
 * @GameSessionProvider
 * Provides the `GameSessionContext` to its children.
 * This component encapsulates the core logic for managing game state, including:
 * - Loading and saving game options.
 * - Initializing and managing `GameController` for live gameplay.
 * - Initializing and managing `ReplayService` for game replays.
 * - Storing and retrieving a list of completed games.
 * - Deriving a `currentDisplayState` suitable for UI consumption from various sources.
 * - Exposing actions (startGame, makeMove, undoMove, replay controls) to the UI.
 */
export const GameSessionProvider: React.FC<GameSessionProviderProps> = ({ children }) => {
  const { loggedInUser } = useAuth(); // Hook to get the current authenticated user details.

  // State for game options, loaded from localStorage or defaults.
  const [gameOptions, setGameOptionsInternal] = useState<GameOptions>(() => GameOptions.load());

  // State for the main game logic controller. Initialized based on gameOptions.
  const [gameController, setGameController] = useState<GameController | null>(null);

  // State for the replay service. Manages playback of completed games.
  const [replayService, setReplayService] = useState<ReplayService | null>(null);

  // A simple state variable that increments to trigger re-renders when GameController's internal state changes.
  // GameController calls a callback provided by this provider to increment `tick`.
  const [tick, setTick] = useState(0);

  // State to hold the current snapshot from the ReplayService.
  const [replaySnapshot, setReplaySnapshot] = useState<ReplaySnapshot | null>(null);

  // State to control visibility of the completed games list for replay.
  const [isReplayListVisible, setIsReplayListVisible] = useState(true);

  // State for storing completed games. Loaded from localStorage and filtered to recent games.
  const [completedGames, setCompletedGames] = useState<CompletedGameEntry[]>(() => {
    try {
      const games = safeStorageJson<CompletedGameEntry[]>('hexCompletedGames', []);
      const thirtyDaysInMillis = 30 * 24 * 60 * 60 * 1000;
      const thirtyDaysAgoTimestamp = Date.now() - thirtyDaysInMillis;
      // Filter games to keep only those from the last 30 days and sort them by most recent first.
      return games
        .filter(game => game.timestamp >= thirtyDaysAgoTimestamp)
        .sort((a, b) => b.timestamp - a.timestamp);
    } catch (e) {
      console.error("Failed to parse completed games from localStorage:", e);
      return []; // Return empty array on error to prevent app crash.
    }
  });

  // Effect to save the `completedGames` list to localStorage whenever it changes.
  // Limits stored games to the latest 20 to prevent localStorage bloat.
  useEffect(() => {
    safeStorageSet('hexCompletedGames', JSON.stringify(completedGames.slice(0, 20)));
  }, [completedGames]);

  // Effect to initialize or re-initialize GameController and ReplayService
  // when gameOptions or loggedInUser change.
  useEffect(() => {
    // Create a new GameController instance with current options and a callback to update `tick`.
    const gc = new GameController(gameOptions, () => setTick(t => t + 1));
    gc.setLoggedInUser(loggedInUser); // Pass logged-in user info to GameController.
    setGameController(gc);

    // Create a new ReplayService instance with a callback to update `replaySnapshot`.
    const rs = new ReplayService((snapshot) => {
      setReplaySnapshot(snapshot);
      // Logic to manage visibility of replay list based on replay state.
      if (snapshot?.isActive === false && snapshot?.gameToReplay) {
        // If replay has finished but a game is still "selected" (showing its final state), hide the list.
        setIsReplayListVisible(false);
      } else if (!snapshot?.gameToReplay) {
        // If no game is selected for replay (e.g., replay stopped completely), show the list.
        setIsReplayListVisible(true);
      }
    });
    setReplayService(rs);

    // Cleanup function: dispose of controller and service instances when component unmounts
    // or when dependencies change, to prevent memory leaks or stale subscriptions.
    return () => {
      gc.dispose();
      rs.dispose();
    };
  }, [gameOptions, loggedInUser]); // Dependencies: re-run if options or user auth status changes.

  // Effect to add a game to `completedGames` list when a game finishes.
  useEffect(() => {
    if (gameController?.gamePhase === GamePhase.GAME_OVER) {
      const completedGameData = gameController.getCompletedGameData();
      // Add to list only if valid data and not already present (handles potential re-renders).
      if (completedGameData && !completedGames.find(g => g.id === completedGameData.id)) {
        setCompletedGames(prevGames =>
          [completedGameData, ...prevGames] // Add new game to the beginning.
            .sort((a, b) => b.timestamp - a.timestamp) // Re-sort to be absolutely sure.
            .slice(0, 20) // Keep only the latest 20.
        );
      }
    }
    // Dependencies: Run when gameController instance changes or its gamePhase becomes GAME_OVER.
    // `completedGames` is intentionally omitted from deps to prevent potential infinite loops if
    // `setCompletedGames` itself caused a condition that re-triggered this effect.
  }, [gameController, gameController?.gamePhase]);

  /**
   * Callback to update and save game options.
   * Uses `useCallback` to memoize the function, preventing unnecessary re-creations if `gameOptions` hasn't changed.
   */
  const updateGameOptionsAndSave = useCallback((
    newBoardSize: number, newTimerSettings: TimerSettings, newSwapRuleEnabled: boolean,
    newP1Profile: PlayerProfile, newP2Profile: PlayerProfile, newThemeMode: ThemeMode,
    newPlayer2LocalName: string, 
    newPlayer2ControlType: PlayerControlType, newAiDifficulty: AiDifficulty,
    newChatNotificationsEnabled: boolean // Added 10th argument
  ): GameOptions => {
    const newOptions = gameOptions.updateAndSave(
      newBoardSize, newTimerSettings, newSwapRuleEnabled, newP1Profile, newP2Profile,
      newThemeMode, newPlayer2LocalName, newPlayer2ControlType, newAiDifficulty,
      newChatNotificationsEnabled // Pass the 10th argument
    );
    setGameOptionsInternal(newOptions); // Update internal state to reflect new options.
    return newOptions;
  }, [gameOptions]); 


  /**
   * Derives the `currentDisplayState` based on whether a replay is active,
   * a live game is in progress, or none (initial state).
   * `useMemo` is used for performance optimization: this complex object is only recomputed
   * if one of its dependencies changes.
   */
  const currentDisplayState = useMemo<CurrentDisplayState>(() => {
    // --- Case 1: Replay is active and a game is being replayed ---
    if (replaySnapshot?.isActive && replaySnapshot.gameToReplay) {
      const gameData = replaySnapshot.gameToReplay; // Alias for readability
      return {
        boardMatrix: replaySnapshot.boardMatrix,
        currentPlayerId: replaySnapshot.currentPlayerId,
        turnCount: replaySnapshot.turnCount,
        firstGameMoveDetails: replaySnapshot.firstGameMoveDetails,
        isPlayerRolesSwapped: replaySnapshot.isPlayerRolesSwapped,
        wasP1ProfileAssignedSideONEatStart: replaySnapshot.wasPlayer1ProfileAssignedToSideONE_atGameStart,
        currentTurnTimeLeft: replaySnapshot.currentTurnTimeLeft,
        playerGameTimeLeft: replaySnapshot.playerGameTimeLeft,
        winningPath: replaySnapshot.winningPath,
        gamePhase: GamePhase.REPLAY, // Explicitly set phase for UI
        finalWinnerPlayerColor: replaySnapshot.finalWinnerPlayerColor,
        winReason: replaySnapshot.winReason,
        configuredPlayer1Profile: gameData.player1Profile,
        configuredPlayer2Profile: gameData.player2Profile,
        isReplayActive: true,
        swappedCellCoordinate: null, // Swapped cell highlight is typically for live games.
        currentReplayStep: replaySnapshot.currentStepIndex,
        totalReplaySteps: replaySnapshot.totalSteps,
        gameBeingReplayedTimestamp: replaySnapshot.gameTimestamp,
        gameBeingReplayedBoardSize: replaySnapshot.gameBoardSize,
        gameBeingReplayedTimerSettings: replaySnapshot.gameTimerSettings,
        gameBeingReplayedSwapRule: gameData.settings.swapRuleEnabled,
        isAiOpponent: gameData.settings.player2ControlType === PlayerControlType.AI,
        isOnlineOpponent: gameData.settings.player2ControlType === PlayerControlType.ONLINE,
      };
    }
    // --- Case 2: Replay is NOT active, but a game *was* being replayed and is now paused/finished (showing final state) ---
    else if (replaySnapshot && !replaySnapshot.isActive && replaySnapshot.gameToReplay) {
      const gameData = replaySnapshot.gameToReplay; // Alias for readability
      return {
        boardMatrix: replaySnapshot.boardMatrix, // Show the board state from the replay service
        currentPlayerId: replaySnapshot.currentPlayerId,
        turnCount: replaySnapshot.turnCount,
        firstGameMoveDetails: replaySnapshot.firstGameMoveDetails,
        isPlayerRolesSwapped: replaySnapshot.isPlayerRolesSwapped,
        wasP1ProfileAssignedSideONEatStart: replaySnapshot.wasPlayer1ProfileAssignedToSideONE_atGameStart,
        currentTurnTimeLeft: replaySnapshot.currentTurnTimeLeft,
        playerGameTimeLeft: replaySnapshot.playerGameTimeLeft,
        winningPath: replaySnapshot.winningPath,
        gamePhase: GamePhase.GAME_OVER, // Game is over, just viewing the result.
        finalWinnerPlayerColor: replaySnapshot.finalWinnerPlayerColor,
        winReason: replaySnapshot.winReason,
        configuredPlayer1Profile: gameData.player1Profile,
        configuredPlayer2Profile: gameData.player2Profile,
        isReplayActive: false, // Replay itself is not actively stepping.
        swappedCellCoordinate: null,
        currentReplayStep: replaySnapshot.currentStepIndex, // Show current/last step.
        totalReplaySteps: replaySnapshot.totalSteps,
        gameBeingReplayedTimestamp: replaySnapshot.gameTimestamp,
        gameBeingReplayedBoardSize: replaySnapshot.gameBoardSize,
        gameBeingReplayedTimerSettings: replaySnapshot.gameTimerSettings,
        gameBeingReplayedSwapRule: gameData.settings.swapRuleEnabled,
        isAiOpponent: gameData.settings.player2ControlType === PlayerControlType.AI,
        isOnlineOpponent: gameData.settings.player2ControlType === PlayerControlType.ONLINE,
      };
    }

    // --- Case 3: Live game is in progress (or ready to start) ---
    if (gameController) {
      return {
        boardMatrix: gameController.boardMatrix,
        currentPlayerId: gameController.currentPlayerId,
        turnCount: gameController.turnCount,
        firstGameMoveDetails: gameController.firstGameMoveDetails,
        isPlayerRolesSwapped: gameController.isPlayerRolesSwapped,
        wasP1ProfileAssignedSideONEatStart: gameController.isPlayer1ProfileAssignedToSideONE_atGameStart,
        currentTurnTimeLeft: gameController.currentTurnTimeLeft,
        playerGameTimeLeft: gameController.playerGameTimeLeft,
        winningPath: gameController.winningPath,
        gamePhase: gameController.gamePhase,
        finalWinnerPlayerColor: gameController.winner,
        winReason: gameController.winReason,
        configuredPlayer1Profile: gameController.playerAgent1.profile,
        configuredPlayer2Profile: gameController.playerAgent2.profile,
        isReplayActive: false,
        swappedCellCoordinate: gameController.swappedCellCoordinate,
        currentReplayStep: -1, // Not in replay.
        totalReplaySteps: 0,
        gameBeingReplayedTimestamp: null,
        gameBeingReplayedBoardSize: gameController.options.boardSize, // Reflects current game settings.
        gameBeingReplayedTimerSettings: gameController.options.timerSettings,
        gameBeingReplayedSwapRule: gameController.options.swapRuleEnabled,
        isAiOpponent: gameController.options.player2ControlType === PlayerControlType.AI,
        isOnlineOpponent: gameController.options.player2ControlType === PlayerControlType.ONLINE,
      };
    }

    // --- Case 4: Fallback / Initial state (before GameController is fully initialized or if error) ---
    // Provides a default state based on current gameOptions.
    return {
      boardMatrix: createEmptyBoard(gameOptions.boardSize, MIN_BOARD_SIZE, MAX_BOARD_SIZE, DEFAULT_BOARD_SIZE),
      currentPlayerId: Player.ONE, turnCount: 0, firstGameMoveDetails: null, isPlayerRolesSwapped: false,
      wasP1ProfileAssignedSideONEatStart: true, // Default assumption before a game starts.
      currentTurnTimeLeft: gameOptions.timerSettings.mode === 'perTurn' ? gameOptions.timerSettings.durationPerTurn : null,
      playerGameTimeLeft: gameOptions.timerSettings.mode === 'perGame' ? { [Player.ONE]: gameOptions.timerSettings.durationPerGame, [Player.TWO]: gameOptions.timerSettings.durationPerGame } : null,
      winningPath: null, gamePhase: GamePhase.PLAYING, // Default to PLAYING, or perhaps a "SETUP" phase.
      finalWinnerPlayerColor: null, winReason: null,
      configuredPlayer1Profile: gameOptions.player1Profile,
      configuredPlayer2Profile: gameOptions.player2Profile,
      isReplayActive: false, swappedCellCoordinate: null, currentReplayStep: -1, totalReplaySteps: 0,
      gameBeingReplayedTimestamp: null,
      gameBeingReplayedBoardSize: gameOptions.boardSize,
      gameBeingReplayedTimerSettings: gameOptions.timerSettings,
      gameBeingReplayedSwapRule: gameOptions.swapRuleEnabled,
      isAiOpponent: gameOptions.player2ControlType === PlayerControlType.AI,
      isOnlineOpponent: gameOptions.player2ControlType === PlayerControlType.ONLINE,
    };
    // Dependencies for useMemo: if any of these change, currentDisplayState is recomputed.
    // `tick` is included because it signals an internal state change in GameController.
  }, [replaySnapshot, gameController, gameOptions, tick]);

  // Memoized game action callbacks, delegating to gameController or replayService.
  const startGame = useCallback((serverConfirmedOptions?: IgHandlerGameOptions) => {
    // If a replay was active or had just finished, ensure it's fully cleared
    if (replayService?.getGameToReplay()) {
        replayService.stopReplay(true, true); // Stop and clear its association with any game
    }
    gameController?.startGame(serverConfirmedOptions);
    setIsReplayListVisible(true); // Typically, show list or main game area after starting
  }, [gameController, replayService, setIsReplayListVisible]);

  const undoMove = useCallback(() => gameController?.undoMove(), [gameController]);
  const makeMove = useCallback(async (r: number, c: number) => gameController?.makeMove(r, c), [gameController]);
  
  const startReplay = useCallback((game: CompletedGameEntry) => {
    replayService?.startReplay(game);
    setIsReplayListVisible(false); // Hide the list when a replay starts.
  }, [replayService, setIsReplayListVisible]);

  const stopReplayAndNewGame = useCallback(() => {
    replayService?.stopReplay(true, true); // clearGameAssociation = true -> gameToReplay = null
    gameController?.startGame();
    setIsReplayListVisible(true);
  }, [replayService, gameController, setIsReplayListVisible]);

  const stopReplayAndShowList = useCallback(() => {
    replayService?.stopReplay(true, true); // clearGameAssociation = true
    setIsReplayListVisible(true);
  }, [replayService, setIsReplayListVisible]);

  /**
   * Core logic to determine which configured profile (P1's or P2's) is currently
   * controlling a given `boardSide` (Player.ONE or Player.TWO pieces).
   * This is memoized as it's a pure function and its inputs might be used frequently.
   *
   * @param boardSide The side of the board (Player.ONE or Player.TWO pieces).
   * @param p1Profile The profile object initially configured as "Player 1".
   * @param p2Profile The profile object initially configured as "Player 2".
   * @param isP1ProfileAssignedSideONEatStart True if p1Profile was initially playing as Player.ONE.
   * @param areRolesSwapped True if the player roles (who controls which color) have been swapped from the initial assignment.
   * @returns The PlayerProfile controlling the specified `boardSide`.
   */
  const getProfileForBoardSideLogic = useCallback((
    boardSide: Player, p1Profile: PlayerProfile, p2Profile: PlayerProfile,
    isP1ProfileAssignedSideONEatStart: boolean, areRolesSwapped: boolean
  ): PlayerProfile => {
    // Determine if the profile initially designated as "Player 1" (`p1Profile`)
    // is *effectively* playing as Player.ONE (the first to move, usually Red).
    // This considers both the initial assignment and any subsequent role swaps.
    const p1ProfileIsEffectivelyPlayerOneSide =
      (isP1ProfileAssignedSideONEatStart && !areRolesSwapped) || // P1 started as ONE and no swap.
      (!isP1ProfileAssignedSideONEatStart && areRolesSwapped);  // P1 started as TWO but roles swapped.

    if (p1ProfileIsEffectivelyPlayerOneSide) {
      // If P1's profile is effectively Player.ONE:
      // - If asking for Player.ONE's side, return p1Profile.
      // - If asking for Player.TWO's side, return p2Profile.
      return boardSide === Player.ONE ? p1Profile : p2Profile;
    } else {
      // If P1's profile is effectively Player.TWO (meaning p2Profile is effectively Player.ONE):
      // - If asking for Player.ONE's side, return p2Profile.
      // - If asking for Player.TWO's side, return p1Profile.
      return boardSide === Player.ONE ? p2Profile : p1Profile;
    }
  }, []);

  /**
   * Public accessor for `getProfileForBoardSideLogic`, choosing the correct source of truth
   * (replay state, live game state, or initial options).
   * Memoized with `useCallback`.
   */
  const getProfileForBoardSide = useCallback((boardSide: Player): PlayerProfile => {
    // If in replay mode (active or viewing final state of a replayed game).
    if (currentDisplayState.isReplayActive || (replaySnapshot && !replaySnapshot.isActive && replaySnapshot.gameToReplay)) {
      return getProfileForBoardSideLogic(
        boardSide, currentDisplayState.configuredPlayer1Profile, currentDisplayState.configuredPlayer2Profile,
        currentDisplayState.wasP1ProfileAssignedSideONEatStart, currentDisplayState.isPlayerRolesSwapped
      );
    }
    // If a live game is active.
    if (gameController) {
      // GameController has its own method to determine this based on its internal state.
      return gameController.getParticipantProfileForBoardSide(boardSide);
    }
    // Fallback: if no game or replay is active, use initial gameOptions.
    // Assumes P1 profile starts as Player.ONE and no swaps initially.
    return getProfileForBoardSideLogic(
      boardSide, gameOptions.player1Profile, gameOptions.player2Profile, true, false
    );
  }, [currentDisplayState, gameController, replaySnapshot, gameOptions, getProfileForBoardSideLogic]);

  /**
   * Gets the profile of the player whose turn it currently is.
   * Memoized with `useCallback`.
   */
  const getCurrentTurnParticipantProfile = useCallback((): PlayerProfile => {
    // Uses the public getProfileForBoardSide with the currentPlayerId from the currentDisplayState.
    return getProfileForBoardSide(currentDisplayState.currentPlayerId);
  }, [getProfileForBoardSide, currentDisplayState.currentPlayerId]);

  // Assemble the context value to be provided to consumers.
  const contextValue: GameSessionContextType = {
    gameOptions,
    updateGameOptionsAndSave,
    gameController,
    currentDisplayState,
    completedGames,
    setCompletedGames,
    startGame,
    undoMove,
    makeMove,
    startReplay,
    stopReplayAndNewGame,
    stopReplayAndShowList,
    getProfileForBoardSide,
    getCurrentTurnParticipantProfile,
    isReplayListVisible,
    setIsReplayListVisible,
  };

  return (
    <GameSessionContext.Provider value={contextValue}>
      {children}
    </GameSessionContext.Provider>
  );
};
