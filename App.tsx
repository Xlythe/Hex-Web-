
import React, { useState, useEffect, useCallback, useRef } from 'react';

// Core Types
import {
  Player, GamePhase, ThemeMode, Coordinate, CompletedGameEntry, PlayerProfile,
  WinReason, PlayerControlType, AiDifficulty, AllowedIncrementSecondsType,
  IgUserRegistrationError, TimerSettings, TimerMode,
  UndoRequestState, OpponentUndoRequestDetails, RematchOfferState, OpponentRematchOfferDetails
} from './types';

// Component Imports
import Board from './components/Board';
import HelpModal from './components/HelpModal';
import { SettingsModal } from './components/SettingsModal';
import ReplayHistoryList from './components/ReplayHistoryList';
import ConfirmationModal from './components/ConfirmationModal';
import { SignupModal } from './components/SignupModal';
import { LoginModal } from './components/LoginModal';
import ProfileModal from './components/ProfileModal';
import LobbyScreen from './components/LobbyScreen';
import ChatWindow from './components/ChatWindow';
import WaitingRoomScreen from './components/WaitingRoomScreen';
import CreateGameModal from './components/CreateGameModal';
import OnlineUndoRequestModal from './components/OnlineUndoRequestModal';
import OnlineRematchOfferModal from './components/OnlineRematchOfferModal';

// Icon Imports
import { UndoIcon } from './icons/UndoIcon';
import { ResetIcon } from './icons/ResetIcon';
import { ForfeitIcon } from './icons/ForfeitIcon';
import { ClaimLossIcon } from './icons/ClaimLossIcon';
import { HelpIcon } from './icons/HelpIcon';
import { SettingsIcon } from './icons/SettingsIcon';
import { ProfileIcon } from './icons/ProfileIcon';
import { MusicNoteIcon } from './icons/MusicNoteIcon';

// Utilities & Constants
import { formatTime } from './utils';
import {
  COLOR_PALETTE, MIN_BOARD_SIZE, MAX_BOARD_SIZE,
  MIN_TIMER_DURATION_PER_TURN, MAX_TIMER_DURATION_PER_TURN,
  MIN_TIMER_DURATION_PER_GAME, MAX_TIMER_DURATION_PER_GAME,
  AI_NAME, ONLINE_OPPONENT_NAME,
  ALLOWED_ONLINE_GAME_DURATIONS_SECONDS, ALLOWED_INCREMENT_SECONDS,
  DEFAULT_ONLINE_GAME_DURATION_SECONDS, DEFAULT_ONLINE_TIMER_INCREMENT_SECONDS,
  ALLOWED_ONLINE_SIZES, DEFAULT_ONLINE_BOARD_SIZE,
} from './Constants';

// Contexts & Hooks
import { AuthManagerProvider, AuthResult } from './contexts/AuthManager';
import { GameSessionProvider } from './contexts/GameSessionProvider';
import { OnlinePlayManagerProvider } from './contexts/OnlinePlayManager';
import { useAuth } from './hooks/useAuth';
import { useGameSession } from './hooks/useGameSession';
import { useOnlinePlay } from './hooks/useOnlinePlay';
import { useBackgroundMusic } from './hooks/useBackgroundMusic';
import { useSoundEffects } from './hooks/useSoundEffects';

// Logic & Engine Types
import { GameController } from './GameController';
import { CurrentDisplayState as DisplayState } from './contexts/GameSessionProvider';

// Some browsers expose the Screen Orientation methods at runtime without
// advertising them in every version of their DOM type definitions.
type OrientationLockType = "any" | "natural" | "landscape" | "portrait" | "portrait-primary" | "portrait-secondary" | "landscape-primary" | "landscape-secondary";
type ExtendedScreenOrientation = ScreenOrientation & {
  lock?(orientation: OrientationLockType): Promise<void>;
  unlock?(): void;
};

// Helper Component: StatusDisplay
// Displays game status messages, replay mode, AI thinking, etc.
// ================================================================================================
interface StatusDisplayProps {
  currentDisplayState: DisplayState;
  gameController: GameController | null;
  getProfileForBoardSide: (player: Player) => PlayerProfile;
  getCurrentTurnParticipantProfile: () => PlayerProfile;
  isInWaitingRoom: boolean;
  onlineGameStatusMessage: string | null;
  rematchOfferState: RematchOfferState;
  undoRequestState: UndoRequestState;
  isAiCurrentlyPlaying: boolean;
}

const StatusDisplay: React.FC<StatusDisplayProps> = ({
  currentDisplayState, gameController, getProfileForBoardSide, getCurrentTurnParticipantProfile,
  isInWaitingRoom, onlineGameStatusMessage, rematchOfferState, undoRequestState, isAiCurrentlyPlaying
}) => {
  let content: React.ReactNode = <p className="h-6"></p>; // Default empty space for consistent height

  if (currentDisplayState.isReplayActive) {
    content = <p className="h-6 font-semibold text-yellow-500 dark:text-theme-link-dark">Replay Mode</p>;
  } else if (isInWaitingRoom) {
    content = <p className="text-xs italic h-6 font-semibold text-yellow-500 dark:text-theme-link-dark">Waiting Room: {onlineGameStatusMessage || "Waiting for players..."}</p>;
  } else if (onlineGameStatusMessage && (rematchOfferState === RematchOfferState.IDLE || rematchOfferState === RematchOfferState.ACCEPTED_AWAITING_NEW_GAME)) {
    // Prioritize general online game status if no specific rematch/undo action is prominent
    content = <p className="text-xs italic h-6 font-semibold text-yellow-500 dark:text-theme-link-dark">{onlineGameStatusMessage}</p>;
  } else if (rematchOfferState !== RematchOfferState.IDLE && rematchOfferState !== RematchOfferState.OFFER_RECEIVED) {
    // Handle specific rematch states (excluding IDLE and OFFER_RECEIVED which are handled by modals)
    switch (rematchOfferState) {
      case RematchOfferState.OFFER_SENT: content = <p className="text-xs italic h-6 font-semibold text-yellow-500 dark:text-theme-link-dark">Rematch offer sent. Waiting for opponent.</p>; break;
      case RematchOfferState.DECLINED_BY_OPPONENT: content = <p className="text-xs italic h-6 font-semibold text-red-500 dark:text-red-400">Opponent declined rematch.</p>; break;
      case RematchOfferState.DECLINED_BY_LOCAL: content = <p className="text-xs italic h-6 font-semibold text-red-500 dark:text-red-400">You declined the rematch.</p>; break;
      case RematchOfferState.CANCELLED_BY_LOCAL: content = <p className="text-xs italic h-6 font-semibold text-gray-500 dark:text-gray-400">Rematch offer cancelled.</p>; break;
      case RematchOfferState.CANCELLED_BY_OPPONENT: content = <p className="text-xs italic h-6 font-semibold text-gray-500 dark:text-gray-400">Opponent cancelled rematch offer.</p>; break;
      case RematchOfferState.ACCEPTED_AWAITING_NEW_GAME: content = <p className="text-xs italic h-6 font-semibold text-green-500 dark:text-green-400">Rematch accepted! Starting new game...</p>; break;
      case RematchOfferState.ERROR: content = <p className="text-xs italic h-6 font-semibold text-red-500 dark:text-red-400">Error in rematch process.</p>; break;
    }
  } else if (undoRequestState && undoRequestState !== UndoRequestState.IDLE && undoRequestState !== UndoRequestState.REQUEST_RECEIVED) {
    // Handle specific undo states (excluding IDLE and REQUEST_RECEIVED which are handled by modals)
    switch (undoRequestState) {
      case UndoRequestState.REQUEST_SENT: content = <p className="text-xs italic h-6 font-semibold text-yellow-500 dark:text-theme-link-dark">Undo request sent. Waiting for opponent.</p>; break;
      case UndoRequestState.ACCEPTED_AWAITING_SERVER: content = <p className="text-xs italic h-6 font-semibold text-green-500 dark:text-green-400">Undo accepted! Board will update shortly.</p>; break;
      case UndoRequestState.DENIED: content = <p className="text-xs italic h-6 font-semibold text-red-500 dark:text-red-400">Undo request denied.</p>; break;
    }
  } else if (currentDisplayState.gamePhase === GamePhase.GAME_OVER && currentDisplayState.finalWinnerPlayerColor) {
    const winnerProfile = getProfileForBoardSide(currentDisplayState.finalWinnerPlayerColor);
    let reasonText = '';
    if (currentDisplayState.winReason === WinReason.TIMEOUT) reasonText = '(Timeout)';
    else if (currentDisplayState.winReason === WinReason.CLAIMED) reasonText = '(Claimed)';
    else if (currentDisplayState.winReason === WinReason.FORFEIT) {
      const localPlayerSide = gameController?.getEffectiveLocalPlayerSide();
      reasonText = (localPlayerSide && currentDisplayState.finalWinnerPlayerColor !== localPlayerSide) ? '(You Forfeited)' : '(Opponent Forfeited)';
    }
    content = (<p className={`h-6 font-bold`} style={{ color: winnerProfile.color }}> {winnerProfile.name} Wins! {reasonText} </p>);
  } else if (currentDisplayState.gamePhase === GamePhase.GAME_OVER && !currentDisplayState.finalWinnerPlayerColor && currentDisplayState.winReason === WinReason.FORFEIT) {
    // This case occurs if the local player forfeits an online game before it properly starts or has an opponent.
    content = <p className="text-xs italic h-6 font-semibold text-red-500 dark:text-red-400">You forfeited the game.</p>;
  } else if (currentDisplayState.swappedCellCoordinate && currentDisplayState.isPlayerRolesSwapped && currentDisplayState.gamePhase === GamePhase.PLAYING) {
    content = <p className="text-xs italic h-6 font-semibold text-yellow-500 dark:text-theme-link-dark">Player roles have been swapped!</p>;
  } else if (currentDisplayState.isPlayerRolesSwapped && currentDisplayState.gamePhase === GamePhase.PLAYING && currentDisplayState.turnCount >= 1 && !currentDisplayState.swappedCellCoordinate) {
    content = <p className="text-xs italic h-6 font-semibold text-theme-text-subtle">Player roles are swapped. {getCurrentTurnParticipantProfile().name} can place 2nd piece OR take black's first move.</p>;
  } else if (isAiCurrentlyPlaying) {
    content = <p className="text-xs italic h-6 font-semibold text-yellow-500 dark:text-theme-link-dark">{AI_NAME} is thinking...</p>;
  }

  return <div className="text-sm text-theme-text-subtle mb-2 text-center space-y-1 min-h-[24px]">{content}</div>;
};


// Helper Component: TimerDisplay
// Displays game timers (per turn or per game).
// ================================================================================================
interface TimerDisplayProps {
  currentDisplayState: DisplayState;
  gameController: GameController | null;
  gameOptions: ReturnType<typeof useGameSession>['gameOptions'];
  getProfileForBoardSide: (player: Player) => PlayerProfile;
  getCurrentTurnParticipantProfile: () => PlayerProfile;
  isInWaitingRoom: boolean;
  isAiCurrentlyPlaying: boolean;
}

const TimerDisplay: React.FC<TimerDisplayProps> = ({
  currentDisplayState, gameController, gameOptions, getProfileForBoardSide,
  getCurrentTurnParticipantProfile, isInWaitingRoom, isAiCurrentlyPlaying,
}) => {
  if (!gameController) return <div className="mt-1 mb-2 h-8"></div>; // Placeholder for consistent layout

  const timerSettingsToUse: TimerSettings = currentDisplayState.isReplayActive && currentDisplayState.gameBeingReplayedTimerSettings
    ? currentDisplayState.gameBeingReplayedTimerSettings
    : gameController.options.timerSettings;

  const shouldHideTimer = timerSettingsToUse.mode === 'off' ||
    (currentDisplayState.gamePhase === GamePhase.GAME_OVER && !currentDisplayState.isReplayActive) ||
    isInWaitingRoom ||
    (currentDisplayState.isAiOpponent && isAiCurrentlyPlaying);

  if (shouldHideTimer) {
    return <div className="mt-1 mb-2 h-8"></div>; // Placeholder for consistent layout
  }

  const p1SideProf = getProfileForBoardSide(Player.ONE);
  const p2SideProf = getProfileForBoardSide(Player.TWO);
  const currentTurnProf = getCurrentTurnParticipantProfile();
  let displayContent: React.ReactNode = null;

  if (timerSettingsToUse.mode === 'perTurn' && currentDisplayState.currentTurnTimeLeft !== null) {
    displayContent = (
      <div className="text-lg">
        Turn Time (<span style={{ color: currentTurnProf.color, fontWeight: 'normal' }}>{currentTurnProf.name}</span>):{' '}
        <span className={`font-mono font-semibold`} style={{ color: currentTurnProf.color }}>
          {formatTime(currentDisplayState.currentTurnTimeLeft)}
        </span>
      </div>
    );
  } else if (timerSettingsToUse.mode === 'perGame' && currentDisplayState.playerGameTimeLeft) {
    const p1Time = currentDisplayState.playerGameTimeLeft[Player.ONE];
    const p2Time = currentDisplayState.playerGameTimeLeft[Player.TWO];
    const incrementSeconds = timerSettingsToUse.incrementSeconds ?? 0;
    const isOnlineOrHumanVsHuman = gameOptions.player2ControlType === PlayerControlType.ONLINE || gameOptions.player2ControlType === PlayerControlType.HUMAN;
    const incrementText = incrementSeconds > 0 && isOnlineOrHumanVsHuman ? ` +${incrementSeconds}s/move` : '';

    displayContent = (
      <div className="flex flex-col items-center justify-center text-lg">
        <div className="flex justify-center space-x-4">
          <div>
            <span style={{ color: p1SideProf.color }} className="font-semibold">{p1SideProf.name}: </span>
            <span className="font-mono">{formatTime(p1Time)}</span>
          </div>
          <div>
            <span style={{ color: p2SideProf.color }} className="font-semibold">{p2SideProf.name}: </span>
            <span className="font-mono">{formatTime(p2Time)}</span>
          </div>
        </div>
        {incrementText && <span className="text-xs font-mono">{incrementText}</span>}
      </div>
    );
  }

  return displayContent ? (
    <div className="mt-1 mb-2 text-center text-theme-text-primary dark:text-theme-icon-dark h-8" aria-live="polite">
      {displayContent}
    </div>
  ) : <div className="mt-1 mb-2 h-8"></div>; // Placeholder for consistent layout
};

// Helper Component: GameControlButtons
// Renders Undo, Reset, Forfeit, Claim Loss buttons based on game state.
// ================================================================================================
interface GameControlButtonsProps {
  showMainControls: boolean;
  isOnlineGameActive: boolean;
  canUndoLocally: boolean;
  canResetGame: boolean;
  canRequestOnlineUndo: boolean;
  isOnlineActionLoading: boolean;
  onLocalUndo: () => void;
  onRequestNewGameOrReset: () => void;
  onRequestOnlineUndo: () => void;
  onForfeitGame: () => void;
  canClaimOpponentLoss: boolean;
  onClaimOpponentLoss: () => void;
}
const GameControlButtons: React.FC<GameControlButtonsProps> = ({
  showMainControls, isOnlineGameActive, canUndoLocally, canResetGame, canRequestOnlineUndo,
  isOnlineActionLoading, onLocalUndo, onRequestNewGameOrReset, onRequestOnlineUndo,
  onForfeitGame, canClaimOpponentLoss, onClaimOpponentLoss
}) => {
  if (!showMainControls) return null;

  const buttonBaseClass = "p-2 text-theme-icon-light dark:text-theme-icon-dark transition-colors duration-150 rounded-full focus:outline-none focus:ring-0";
  const enabledClass = "hover:bg-theme-button-icon-bg-hover-light dark:hover:bg-theme-button-icon-bg-hover-dark";
  const disabledClass = "opacity-50 cursor-not-allowed";

  return (
    <div className="absolute left-0 bottom-0 flex items-center space-x-2">
      {!isOnlineGameActive && ( // Local game controls
        <>
          <button onClick={onLocalUndo} disabled={!canUndoLocally} className={`${buttonBaseClass} ${!canUndoLocally ? disabledClass : `${enabledClass} hover:text-yellow-600 dark:hover:text-theme-link-dark`}`} aria-label="Undo last move" title="Undo Move">
            <UndoIcon className="w-6 h-6" />
          </button>
          <button onClick={onRequestNewGameOrReset} disabled={!canResetGame} className={`${buttonBaseClass} ${!canResetGame ? disabledClass : `${enabledClass} hover:text-red-600 dark:hover:text-red-500`}`} aria-label="Reset current game" title="Reset Game">
            <ResetIcon className="w-6 h-6" />
          </button>
        </>
      )}
      {isOnlineGameActive && ( // Online game specific controls
        <>
          <button onClick={onRequestOnlineUndo} disabled={!canRequestOnlineUndo || isOnlineActionLoading} className={`${buttonBaseClass} ${!canRequestOnlineUndo || isOnlineActionLoading ? disabledClass : `${enabledClass} hover:text-yellow-600 dark:hover:text-theme-link-dark`}`} aria-label="Request Online Undo" title="Request Online Undo">
            <UndoIcon className="w-6 h-6" />
          </button>
          <button onClick={onForfeitGame} disabled={isOnlineActionLoading} className={`${buttonBaseClass} ${isOnlineActionLoading ? disabledClass : `${enabledClass} hover:text-red-600 dark:hover:text-red-500`}`} aria-label="Forfeit Game" title="Forfeit Game">
            <ForfeitIcon className="w-6 h-6" />
          </button>
          {canClaimOpponentLoss && (
            <button onClick={onClaimOpponentLoss} disabled={isOnlineActionLoading} className={`${buttonBaseClass} text-yellow-500 dark:text-yellow-400 ${isOnlineActionLoading ? disabledClass : `${enabledClass} hover:text-yellow-600 dark:hover:text-yellow-500`}`} aria-label="Claim Opponent's Loss" title="Claim Opponent's Loss (Timeout/Disconnect)">
              <ClaimLossIcon className="w-6 h-6" />
            </button>
          )}
        </>
      )}
    </div>
  );
};

// Helper Component: GameFooter
// Displays game configuration details (board size, opponent, timer, swap rule).
// ================================================================================================
interface GameFooterProps {
  currentDisplayState: DisplayState;
  gameOptions: ReturnType<typeof useGameSession>['gameOptions'];
  loggedInUser: ReturnType<typeof useAuth>['loggedInUser'];
  onlineGameSessionId: string | null;
  isInWaitingRoom: boolean;
}
const GameFooter: React.FC<GameFooterProps> = ({ currentDisplayState, gameOptions, loggedInUser, onlineGameSessionId, isInWaitingRoom }) => {
  let footerText: React.ReactNode;

  if (currentDisplayState.isReplayActive && currentDisplayState.gameBeingReplayedTimestamp) {
    footerText = <>Replaying Game from: {new Date(currentDisplayState.gameBeingReplayedTimestamp).toLocaleDateString()} ({currentDisplayState.currentReplayStep + 1} / {currentDisplayState.totalReplaySteps} moves)</>;
  } else if (currentDisplayState.gamePhase === GamePhase.GAME_OVER && currentDisplayState.gameBeingReplayedTimestamp) {
    footerText = <>Finished Replay of game from: {new Date(currentDisplayState.gameBeingReplayedTimestamp).toLocaleDateString()}. Board: {currentDisplayState.gameBeingReplayedBoardSize}x{currentDisplayState.gameBeingReplayedBoardSize}.</>;
  } else if (isInWaitingRoom) {
    footerText = <>Online Game Waiting Room. Session: {onlineGameSessionId || "N/A"}</>;
  } else {
    const p2ControlType = gameOptions.player2ControlType;
    let p2Details: string;
    if (p2ControlType === PlayerControlType.AI) {
      p2Details = `${AI_NAME} (${gameOptions.aiDifficulty})`;
    } else if (p2ControlType === PlayerControlType.ONLINE) {
      p2Details = loggedInUser
        ? (onlineGameSessionId ? `${gameOptions.player2Profile.name || ONLINE_OPPONENT_NAME} (Online)` : `${ONLINE_OPPONENT_NAME} (Not in game)`)
        : `${ONLINE_OPPONENT_NAME} (Login Required)`;
    } else {
      p2Details = gameOptions.player2Profile.name;
    }

    const { mode: timerMode, durationPerGame, durationPerTurn, incrementSeconds } = gameOptions.timerSettings;
    let timerDetails: string;
    if (timerMode === 'off') {
      timerDetails = 'Off';
    } else if (timerMode === 'perTurn') {
      timerDetails = `${durationPerTurn}s/turn`;
    } else { // perGame
      const minutes = Math.floor(durationPerGame / 60);
      const seconds = durationPerGame % 60;
      const gameTimeFormatted = `${minutes}m${seconds > 0 ? ` ${seconds}s` : ''}/game`;
      const incrementText = (p2ControlType === PlayerControlType.ONLINE || p2ControlType === PlayerControlType.HUMAN) && (incrementSeconds ?? 0) > 0
        ? ` +${incrementSeconds}s inc`
        : '';
      timerDetails = `${gameTimeFormatted}${incrementText}`;
    }
    const aiTimerNote = p2ControlType === PlayerControlType.AI && timerMode !== 'off' ? " (Timer for Human Only)" : "";

    footerText = <>Board: {gameOptions.boardSize}x{gameOptions.boardSize}. P2: {p2Details}. Timer: {timerDetails}{aiTimerNote}. Swap: {gameOptions.swapRuleEnabled ? 'On' : 'Off'}.</>;
  }

  const loggedInStatus = loggedInUser && !currentDisplayState.isReplayActive && !isInWaitingRoom
    ? <span className="block mt-1">Logged in as: {loggedInUser.name}{gameOptions.player2ControlType === PlayerControlType.ONLINE && !onlineGameSessionId ? ' - (Online Mode)' : ''}</span>
    : null;

  return (
    <footer className="text-center text-xs sm:text-sm text-theme-text-subtle mt-6 sm:mt-8 pb-4 px-2">
      {footerText}
      {loggedInStatus}
    </footer>
  );
};


// Main Application Content Component
// Orchestrates all major UI elements, game logic, and interactions.
// ================================================================================================
const AppContent: React.FC = () => {
  const { loggedInUser, login, signup, logout, updateProfile: updateAuthProfile, isAuthLoading } = useAuth();
  const {
    gameOptions, updateGameOptionsAndSave, gameController, currentDisplayState, completedGames,
    startGame, undoMove: localUndoMove, makeMove, startReplay, stopReplayAndNewGame, stopReplayAndShowList,
    getProfileForBoardSide, getCurrentTurnParticipantProfile, isReplayListVisible,
  } = useGameSession();
  const {
    onlineGameSessionId, isFindingOnlineGame, onlineGameStatusMessage,
    findOnlineGame, leaveOnlineGame, isOnlineActionLoading, setOnlineGameStatusMessage,
    chatMessages, sendChatMessage, isInWaitingRoom, createOnlineGame,
    undoRequestState, opponentUndoRequestDetails, requestOnlineUndo, acceptOnlineUndo, denyOnlineUndo, canRequestOnlineUndo,
    forfeitOnlineGame,
    canClaimOpponentLoss, claimOpponentLoss,
    rematchOfferState, opponentRematchOfferDetails, offerRematch, acceptRematch, declineRematch, canOfferRematch,
    notificationPermission, requestBrowserNotificationPermission, // Notification related
  } = useOnlinePlay();
  const { isMusicEnabled, toggleMusicPreference, startBackgroundMusic, stopBackgroundMusic } = useBackgroundMusic();
  const { playClickSound, isSoundEffectsEnabled, playMessageChimeSound } = useSoundEffects({ isGloballyEnabled: isMusicEnabled });

  const prevTurnCountRef = useRef<number>(currentDisplayState.turnCount);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const gameCardRef = useRef<HTMLDivElement>(null);

  // Modal visibility states
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState<boolean>(false);
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState<boolean>(false);
  const [isSignupModalOpen, setIsSignupModalOpen] = useState<boolean>(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [isCreateGameModalOpen, setIsCreateGameModalOpen] = useState<boolean>(false);

  const [isLobbyScreenVisible, setIsLobbyScreenVisible] = useState<boolean>(false);
  const [isChatMaximized, setIsChatMaximized] = useState<boolean>(false);

  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState<boolean>(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const profileIconRef = useRef<HTMLButtonElement>(null);

  type ConfirmationModalConfigType = {
    title: string;
    message: string | React.ReactNode;
    onConfirmAction: () => void | Promise<void>;
    confirmButtonText?: string;
    cancelButtonText?: string;
    confirmButtonClassName?: string;
  };
  const [confirmationModalConfig, setConfirmationModalConfig] = useState<ConfirmationModalConfigType | null>(null);

  // Settings Modal Local Form State
  const [settingsInputSize, setSettingsInputSize] = useState<string>(String(gameOptions.boardSize));
  const [settingsThemeMode, setSettingsThemeMode] = useState<ThemeMode>(gameOptions.themeMode);
  const [settingsTimerMode, setSettingsTimerMode] = useState<TimerMode>(gameOptions.timerSettings.mode);
  const [settingsDurationPerTurn, setSettingsDurationPerTurn] = useState<string>(String(gameOptions.timerSettings.durationPerTurn));
  const [settingsDurationPerGame, setSettingsDurationPerGame] = useState<string>(String(gameOptions.timerSettings.durationPerGame));
  const [settingsIncrementSeconds, setSettingsIncrementSeconds] = useState<string>(String(gameOptions.timerSettings.incrementSeconds ?? 0));
  const [settingsSwapRuleEnabled, setSettingsSwapRuleEnabled] = useState<boolean>(gameOptions.swapRuleEnabled);
  const [settingsPlayer1Name, setSettingsPlayer1Name] = useState<string>(gameOptions.player1Profile.name);
  const [settingsPlayer1Color, setSettingsPlayer1Color] = useState<string>(gameOptions.player1Profile.color);
  const [settingsPlayer2Name, setSettingsPlayer2Name] = useState<string>(gameOptions.player2LocalName);
  const [settingsPlayer2Color, setSettingsPlayer2Color] = useState<string>(gameOptions.player2Profile.color);
  const [settingsPlayer2ControlType, setSettingsPlayer2ControlType] = useState<PlayerControlType>(gameOptions.player2ControlType);
  const [settingsAiDifficulty, setSettingsAiDifficulty] = useState<AiDifficulty>(gameOptions.aiDifficulty);
  const [settingsChatNotificationsEnabled, setSettingsChatNotificationsEnabled] = useState<boolean>(gameOptions.chatNotificationsEnabled);
  const [settingsError, setSettingsError] = useState<string | null>(null);


  const openSettingsModal = useCallback(() => {
    setSettingsInputSize(String(gameOptions.boardSize));
    setSettingsThemeMode(gameOptions.themeMode);
    setSettingsTimerMode(gameOptions.timerSettings.mode);
    setSettingsDurationPerTurn(String(gameOptions.timerSettings.durationPerTurn));
    setSettingsDurationPerGame(String(gameOptions.timerSettings.durationPerGame));
    setSettingsIncrementSeconds(String(gameOptions.timerSettings.incrementSeconds ?? 0));
    setSettingsSwapRuleEnabled(gameOptions.swapRuleEnabled);
    setSettingsPlayer1Name(gameOptions.player1Profile.name);
    setSettingsPlayer1Color(gameOptions.player1Profile.color);
    setSettingsPlayer2Name(gameOptions.player2LocalName);
    setSettingsPlayer2Color(gameOptions.player2Profile.color);
    setSettingsPlayer2ControlType(gameOptions.player2ControlType);
    setSettingsAiDifficulty(gameOptions.aiDifficulty);
    setSettingsChatNotificationsEnabled(gameOptions.chatNotificationsEnabled);
    setSettingsError(null);
    setIsSettingsModalOpen(true);
  }, [gameOptions]); 

  const closeSettingsModal = useCallback(() => setIsSettingsModalOpen(false), []);

  const applySettings = useCallback(async () => {
    const error = gameOptions.validateSettings(
      settingsInputSize, settingsTimerMode, settingsDurationPerTurn, settingsDurationPerGame, settingsIncrementSeconds,
      settingsPlayer1Name, settingsPlayer1Color, settingsPlayer2Name, settingsPlayer2Color, settingsPlayer2ControlType,
      settingsSwapRuleEnabled
    );
    if (error) { setSettingsError(error); return; }

    const oldPlayer2ControlType = gameOptions.player2ControlType;
    const newPlayer2IsOnline = settingsPlayer2ControlType === PlayerControlType.ONLINE;
    const changedToOfflineFromOnline = oldPlayer2ControlType === PlayerControlType.ONLINE && !newPlayer2IsOnline;
    const boardSizeChangedForOnlineGame = newPlayer2IsOnline && parseInt(settingsInputSize, 10) !== gameOptions.boardSize;

    if (onlineGameSessionId && (changedToOfflineFromOnline || boardSizeChangedForOnlineGame)) {
      await leaveOnlineGame();
    }

    updateGameOptionsAndSave(
      parseInt(settingsInputSize, 10),
      {
        mode: settingsTimerMode,
        durationPerTurn: parseInt(settingsDurationPerTurn, 10) || MIN_TIMER_DURATION_PER_TURN,
        durationPerGame: parseInt(settingsDurationPerGame, 10) || MIN_TIMER_DURATION_PER_GAME,
        incrementSeconds: (parseInt(settingsIncrementSeconds, 10) || 0) as AllowedIncrementSecondsType,
      },
      settingsSwapRuleEnabled,
      { name: settingsPlayer1Name.trim(), color: settingsPlayer1Color },
      { name: settingsPlayer2Name.trim(), color: settingsPlayer2Color }, 
      settingsThemeMode,
      settingsPlayer2Name.trim(), 
      settingsPlayer2ControlType,
      settingsAiDifficulty,
      settingsChatNotificationsEnabled 
    );
    closeSettingsModal();
  }, [
    gameOptions, onlineGameSessionId, leaveOnlineGame, updateGameOptionsAndSave, closeSettingsModal,
    settingsInputSize, settingsTimerMode, settingsDurationPerTurn, settingsDurationPerGame,
    settingsIncrementSeconds, settingsSwapRuleEnabled, settingsPlayer1Name, settingsPlayer1Color,
    settingsPlayer2Name, settingsPlayer2Color, settingsThemeMode, settingsPlayer2ControlType, 
    settingsAiDifficulty, settingsChatNotificationsEnabled
  ]);

  const openConfirmationModal = useCallback((config: ConfirmationModalConfigType) => {
    setConfirmationModalConfig(config);
    setIsConfirmationModalOpen(true);
  }, []);

  const closeConfirmationModal = useCallback(() => {
    setIsConfirmationModalOpen(false);
    setConfirmationModalConfig(null);
  }, []);

  const executeConfirmedAction = useCallback(async () => {
    if (confirmationModalConfig?.onConfirmAction) {
      await confirmationModalConfig.onConfirmAction();
    }
    closeConfirmationModal();
  }, [confirmationModalConfig, closeConfirmationModal]);


  const handleRequestNewGameOrReset = useCallback(async () => {
    if (gameOptions.player2ControlType === PlayerControlType.ONLINE && !loggedInUser) {
      openConfirmationModal({ title: "Login Required", message: "Please log in or sign up to start or reset an online game.", onConfirmAction: () => setIsLoginModalOpen(true), confirmButtonText: "Log In" });
      return;
    }
    if (gameOptions.player2ControlType === PlayerControlType.ONLINE && onlineGameSessionId) {
      openConfirmationModal({ title: "Leave Online Game?", message: "This will end your current online game and start a new local one. Are you sure?", onConfirmAction: async () => { await leaveOnlineGame(); startGame(); }, confirmButtonText: "Leave & Reset", confirmButtonClassName: "bg-red-600 hover:bg-red-700 text-white" });
      return;
    }
    if (gameController?.canUndo() || (gameController?.turnCount ?? 0) > 0) {
      openConfirmationModal({ title: "Reset Game?", message: "This will end the current game and start a new one. Are you sure?", onConfirmAction: startGame, confirmButtonText: "Reset Game", confirmButtonClassName: "bg-red-600 hover:bg-red-700 text-white" });
    } else {
      startGame(); 
    }
  }, [gameOptions.player2ControlType, onlineGameSessionId, loggedInUser, gameController, openConfirmationModal, leaveOnlineGame, startGame]);

  const handleStartReplayRequest = useCallback(async (gameToReplay: CompletedGameEntry) => {
    if (gameOptions.player2ControlType === PlayerControlType.ONLINE && loggedInUser && onlineGameSessionId) {
      openConfirmationModal({ title: "Leave Online Game for Replay?", message: "Starting a replay will end your current online game. Are you sure?", onConfirmAction: async () => { await leaveOnlineGame(); startReplay(gameToReplay); }, confirmButtonText: "Leave & Start Replay", confirmButtonClassName: "bg-red-600 hover:bg-red-700 text-white" });
      return;
    }
    if (gameController?.canUndo() || (gameController?.turnCount ?? 0) > 0) {
      openConfirmationModal({ title: "Start Replay?", message: "Starting a replay will end the current game. Are you sure?", onConfirmAction: () => startReplay(gameToReplay), confirmButtonText: "Start Replay" });
    } else {
      startReplay(gameToReplay);
    }
  }, [gameOptions.player2ControlType, onlineGameSessionId, loggedInUser, gameController, openConfirmationModal, leaveOnlineGame, startReplay]);

  const handleInternalStopReplayAndNewGame = useCallback(async () => {
    if (gameOptions.player2ControlType === PlayerControlType.ONLINE && onlineGameSessionId) {
      await leaveOnlineGame();
    }
    stopReplayAndNewGame();
  }, [gameOptions.player2ControlType, onlineGameSessionId, leaveOnlineGame, stopReplayAndNewGame]);

  const handleToggleFullScreen = useCallback(async () => {
    const element = gameCardRef.current;
    if (!element) return;

    const screenWithOrientation = screen.orientation as ExtendedScreenOrientation;

    try {
      if (!document.fullscreenElement) {
        await element.requestFullscreen();
        if (screenWithOrientation?.lock) {
          try {
            await screenWithOrientation.lock('landscape-primary');
          } catch (err) {
            console.warn('Screen orientation lock failed (landscape-primary):', err);
            try { 
              await screenWithOrientation.lock('landscape');
            } catch (lockErr) {
              console.warn('Screen orientation lock failed (landscape generic):', lockErr);
            }
          }
        }
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen API error:', err);
      setIsFullScreen(!!document.fullscreenElement); 
    }
  }, []);

  const handleSignupSuccess = useCallback((authResult: AuthResult) => {
    setIsSignupModalOpen(false);
    if (!authResult.success) return; 

    const welcomeMessage = <p>Welcome, {authResult.registeredUser?.name}! Your account has been created.</p>;
    if (authResult.needsManualLogin || authResult.autoLoginFailed) {
      const reason = authResult.autoLoginFailed ? `Auto login failed: ${(authResult.error as IgUserRegistrationError)?.message || "Unknown error"}` : "";
      openConfirmationModal({
        title: "Account Created" + (authResult.autoLoginFailed ? ", Auto-Login Failed" : ""),
        message: (<> {welcomeMessage} {reason && <p className="mt-2">{reason}</p>} <p className="mt-2">Please log in manually.</p> </>),
        onConfirmAction: () => setIsLoginModalOpen(true),
        confirmButtonText: "Log In",
        cancelButtonText: "Later",
      });
    }
  }, [openConfirmationModal]);

  const handleLoginSuccess = useCallback(() => {
    setIsLoginModalOpen(false);
    setIsProfileDropdownOpen(false);
    setOnlineGameStatusMessage(null); 
  }, [setOnlineGameStatusMessage]);

  const handleLogout = useCallback(() => {
    openConfirmationModal({
      title: "Confirm Logout",
      message: "Are you sure you want to log out?",
      onConfirmAction: async () => {
        if (onlineGameSessionId) await leaveOnlineGame();
        logout();
        setIsProfileDropdownOpen(false);
      },
      confirmButtonText: "Logout",
      confirmButtonClassName: "bg-red-600 hover:bg-red-700 text-white",
    });
  }, [onlineGameSessionId, logout, leaveOnlineGame, openConfirmationModal]);

  const handleProfileUpdated = useCallback((updatedName: string) => {
    setIsProfileModalOpen(false); 
    setIsProfileDropdownOpen(false); 
  }, []);


  const handleForfeitGame = useCallback(() => {
    openConfirmationModal({ title: "Forfeit Game?", message: "Are you sure you want to forfeit the game? This will result in a loss for you.", onConfirmAction: async () => { if (forfeitOnlineGame) await forfeitOnlineGame(); }, confirmButtonText: "Confirm Forfeit", confirmButtonClassName: "bg-red-600 hover:bg-red-700 text-white" });
  }, [openConfirmationModal, forfeitOnlineGame]);

  const handleClaimOpponentLoss = useCallback(() => {
    openConfirmationModal({ title: "Claim Opponent's Loss?", message: "Are you sure you want to claim victory due to opponent inactivity or disconnection? This will end the game.", onConfirmAction: async () => { if (claimOpponentLoss) await claimOpponentLoss(); }, confirmButtonText: "Claim Victory", confirmButtonClassName: "bg-yellow-500 hover:bg-yellow-600 text-white" });
  }, [openConfirmationModal, claimOpponentLoss]);

  const handleBrowseGamesClick = useCallback(async () => {
    if (!loggedInUser) {
      openConfirmationModal({ title: "Login Required", message: "Please log in to browse online games.", onConfirmAction: () => setIsLoginModalOpen(true), confirmButtonText: "Log In" });
    } else if (onlineGameSessionId) {
      openConfirmationModal({ title: "Leave Current Game?", message: "You are already in an online game. Leave it to browse other games?", onConfirmAction: async () => { await leaveOnlineGame(); setIsLobbyScreenVisible(true); }, confirmButtonText: "Leave & Browse", confirmButtonClassName: "bg-yellow-500 hover:bg-yellow-600 text-white" });
    } else {
      setIsLobbyScreenVisible(true);
    }
  }, [loggedInUser, onlineGameSessionId, openConfirmationModal, leaveOnlineGame]);

  useEffect(() => {
    const applyCurrentTheme = () => {
      const isDarkMode = gameOptions.themeMode === 'dark' ||
        (gameOptions.themeMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', isDarkMode);
    };
    applyCurrentTheme(); 

    if (gameOptions.themeMode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', applyCurrentTheme);
      return () => mediaQuery.removeEventListener('change', applyCurrentTheme);
    }
  }, [gameOptions.themeMode]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullScreen = !!document.fullscreenElement;
      setIsFullScreen(isCurrentlyFullScreen);
      if (!isCurrentlyFullScreen) {
        const screenWithOrientation = screen.orientation as ExtendedScreenOrientation;
        if (screenWithOrientation?.unlock) screenWithOrientation.unlock();
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (document.fullscreenElement) {
        const screenWithOrientation = screen.orientation as ExtendedScreenOrientation;
        if (screenWithOrientation?.unlock) screenWithOrientation.unlock();
      }
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isProfileDropdownOpen &&
        profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node) &&
        profileIconRef.current && !profileIconRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProfileDropdownOpen]);

  useEffect(() => {
    if ((onlineGameSessionId || isInWaitingRoom) && isLobbyScreenVisible) {
      setIsLobbyScreenVisible(false); 
    }
  }, [onlineGameSessionId, isInWaitingRoom, isLobbyScreenVisible]);

  useEffect(() => {
    // Determine if the game is in a state where music should play
    const gameIsActuallyActive =
      currentDisplayState.gamePhase === GamePhase.PLAYING &&
      (
        (currentDisplayState.turnCount > 0) || // Play started (local/AI)
        (currentDisplayState.isOnlineOpponent && !!onlineGameSessionId) // Online game is set up and in playing phase
      );
  
    const shouldMusicPlay =
      isMusicEnabled &&
      !currentDisplayState.isReplayActive &&
      !isInWaitingRoom && // Not in waiting room
      gameIsActuallyActive;
  
    if (shouldMusicPlay) {
      startBackgroundMusic();
    } else {
      stopBackgroundMusic();
    }
  }, [
    isMusicEnabled,
    currentDisplayState.gamePhase,
    currentDisplayState.isReplayActive,
    isInWaitingRoom,
    currentDisplayState.turnCount,
    currentDisplayState.isOnlineOpponent, // Added dependency
    onlineGameSessionId,                 // Added dependency
    startBackgroundMusic,
    stopBackgroundMusic
  ]);

  useEffect(() => {
    if ( isSoundEffectsEnabled &&
      currentDisplayState.gamePhase === GamePhase.PLAYING &&
      !currentDisplayState.isReplayActive &&
      gameController && 
      currentDisplayState.turnCount > 0 && 
      currentDisplayState.turnCount > prevTurnCountRef.current 
    ) {
      playClickSound();
    }
    prevTurnCountRef.current = currentDisplayState.turnCount;
  }, [
    currentDisplayState.turnCount, currentDisplayState.gamePhase, currentDisplayState.isReplayActive,
    isSoundEffectsEnabled, playClickSound, gameController
  ]);


  if (!gameController || !currentDisplayState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-theme-bg-light dark:bg-theme-bg-dark">
        <p className="text-theme-text-primary dark:text-theme-icon-dark">Loading Game...</p>
      </div>
    );
  }

  const activePlayer1BoardSideColor = getProfileForBoardSide(Player.ONE).color;
  const activePlayer2BoardSideColor = getProfileForBoardSide(Player.TWO).color;
  const currentTurnActualColor = getCurrentTurnParticipantProfile().color;
  const isAiCurrentlyPlaying = currentDisplayState.isAiOpponent && !!gameController?.isAiTurn();

  const needsLoginPromptForOnlinePlay = gameOptions.player2ControlType === PlayerControlType.ONLINE && !loggedInUser;
  const showOnlineGameInitiationButtons = gameOptions.player2ControlType === PlayerControlType.ONLINE && loggedInUser && !onlineGameSessionId && !isInWaitingRoom;
  const isOnlineGameActive = gameOptions.player2ControlType === PlayerControlType.ONLINE && !!onlineGameSessionId && currentDisplayState.gamePhase === GamePhase.PLAYING && !isInWaitingRoom;

  const showPlayAgainButton = currentDisplayState.gamePhase === GamePhase.GAME_OVER && !currentDisplayState.isReplayActive && !isInWaitingRoom && rematchOfferState === RematchOfferState.IDLE;
  const showOfferRematchButton = canOfferRematch && currentDisplayState.gamePhase === GamePhase.GAME_OVER && !currentDisplayState.isReplayActive && !isInWaitingRoom && gameOptions.player2ControlType === PlayerControlType.ONLINE && !!onlineGameSessionId;

  const showMainGameControls = currentDisplayState.gamePhase === GamePhase.PLAYING && !currentDisplayState.isReplayActive && !currentDisplayState.swappedCellCoordinate && !needsLoginPromptForOnlinePlay && !isInWaitingRoom;
  const showFinishedReplayControls = currentDisplayState.gamePhase === GamePhase.GAME_OVER && !currentDisplayState.isReplayActive && currentDisplayState.gameBeingReplayedTimestamp !== null;
  const showChat = gameOptions.player2ControlType === PlayerControlType.ONLINE && !!onlineGameSessionId && !isInWaitingRoom && !isFullScreen && !currentDisplayState.isReplayActive;
  const showGameArea = !needsLoginPromptForOnlinePlay;

  const boardDisabledConditions = {
    isReplayActive: currentDisplayState.isReplayActive,
    isGameOverPhase: currentDisplayState.gamePhase !== GamePhase.PLAYING && !isInWaitingRoom, 
    isSwapActionPending: !!currentDisplayState.swappedCellCoordinate,
    isAiThinking: currentDisplayState.isAiOpponent && (gameController?.isAiCurrentlyThinking ?? false),
    isLoginRequiredForOnline: needsLoginPromptForOnlinePlay,
    isOnlineGameNotStarted: gameOptions.player2ControlType === PlayerControlType.ONLINE && loggedInUser && !onlineGameSessionId && !isInWaitingRoom,
    isOpponentsTurnOnline: isOnlineGameActive && gameController?.onlineOpponent && gameController?.currentPlayerId !== gameController?.getEffectiveLocalPlayerSide(),
    isUndoRequestActive: undoRequestState === UndoRequestState.REQUEST_SENT || undoRequestState === UndoRequestState.REQUEST_RECEIVED || undoRequestState === UndoRequestState.ACCEPTED_AWAITING_SERVER,
    isRematchOfferActive: rematchOfferState === RematchOfferState.OFFER_SENT || rematchOfferState === RematchOfferState.OFFER_RECEIVED || rematchOfferState === RematchOfferState.ACCEPTED_AWAITING_NEW_GAME,
  };
  const boardDisabled = Object.values(boardDisabledConditions).some(condition => !!condition);

  const helpModalP1Color = currentDisplayState.isReplayActive && currentDisplayState.configuredPlayer1Profile
    ? currentDisplayState.configuredPlayer1Profile.color
    : gameController.playerAgent1.profile.color;
  const helpModalP2Color = currentDisplayState.isReplayActive && currentDisplayState.configuredPlayer2Profile
    ? currentDisplayState.configuredPlayer2Profile.color
    : gameController.playerAgent2.profile.color;

  const showGlobalSpinner = isAuthLoading ||
    (isOnlineActionLoading &&
     !isInWaitingRoom && 
     undoRequestState !== UndoRequestState.REQUEST_SENT && 
     undoRequestState !== UndoRequestState.ACCEPTED_AWAITING_SERVER &&
     rematchOfferState !== RematchOfferState.OFFER_SENT &&
     rematchOfferState !== RematchOfferState.ACCEPTED_AWAITING_NEW_GAME
    );

  return (
    <div className={`hex-app-shell min-h-screen flex flex-col items-center justify-center bg-theme-bg-light dark:bg-theme-bg-dark transition-all duration-300 ${isFullScreen ? 'p-0' : 'p-2 sm:p-4'}`}>
      {!isFullScreen && <div className="hex-stage">
        <aside className="hex-home" aria-label="Hex menu">
          <div className="hex-home-intro"><span className="hex-home-rule" />HEX<span className="hex-home-subtitle">THE CONNECTION GAME</span></div>
          <div className="hex-wheel" aria-label="Main actions">
            <svg className="hex-wheel-art" viewBox="0 0 300 280" aria-hidden="true">
              <path d="M75 10H225L300 140L225 270H75L0 140Z" fill="#f1f1f1" />
              <path d="M75 10H225L216 27H84Z" fill="#cc5c57" />
              <path d="M225 10L300 140L280 140L211 28Z" fill="#5f6ec2" />
              <path d="M300 140L225 270L215 252L280 140Z" fill="#f9db00" />
              <path d="M225 270H75L84 253H216Z" fill="#b7cf47" />
              <path d="M75 270L0 140H20L85 252Z" fill="#f48935" />
              <path d="M0 140L75 10L85 28L20 140Z" fill="#4ba5e2" />
              <path d="M150 140L75 10M150 140L225 10M150 140L300 140M150 140L225 270M150 140L75 270M150 140L0 140" stroke="#d0d0d0" strokeWidth="1" />
              <circle cx="150" cy="140" r="48" fill="#f1f1f1" />
            </svg>
            <span className="hex-wheel-center" aria-hidden="true">Hex</span>
            <button type="button" className="hex-wheel-action hex-wheel-settings" onClick={openSettingsModal}>⚙<span>Settings</span></button>
            <button type="button" className="hex-wheel-action hex-wheel-online" onClick={openSettingsModal}>⌁<span>Online</span></button>
            <button type="button" className="hex-wheel-action hex-wheel-replay" disabled={completedGames.length === 0} onClick={() => document.querySelector('.hex-replay-anchor')?.scrollIntoView({ behavior: 'smooth' })}>↺<span>Replay</span></button>
            <button type="button" className="hex-wheel-action hex-wheel-help" onClick={() => setIsHelpModalOpen(true)}>?<span>Help</span></button>
            <button type="button" className="hex-wheel-action hex-wheel-account" onClick={() => loggedInUser ? setIsProfileModalOpen(true) : setIsLoginModalOpen(true)}>★<span>Account</span></button>
            <button type="button" className="hex-wheel-action hex-wheel-play" onClick={handleRequestNewGameOrReset}>▶<span>Play</span></button>
          </div>
          <p className="hex-home-caption">Connect your sides. Make every move count.</p>
          <span className="hex-home-rule hex-home-rule-bottom" />
        </aside>
      </div>}
      <div
        ref={gameCardRef}
        className={`hex-game-card ${isFullScreen
          ? 'fixed inset-0 z-[1000] w-screen h-screen flex flex-col items-stretch justify-center p-0 bg-theme-card-bg-light dark:bg-theme-card-bg-dark rounded-none shadow-none overflow-auto'
          : 'relative bg-theme-card-bg-light dark:bg-theme-card-bg-dark shadow-2xl rounded-xl p-4 sm:p-6 md:p-8 w-full max-w-2xl'
          } transition-all duration-300`}
      >
        {!isFullScreen && !currentDisplayState.isReplayActive && (
          <div className="flex justify-between items-start mb-1">
            <h1 className="text-4xl sm:text-5xl font-bold text-theme-text-primary dark:text-theme-icon-dark">Hex</h1>
            <div className="flex items-center space-x-2 relative">
              <button onClick={() => setIsHelpModalOpen(true)} className="p-2 text-theme-icon-light dark:text-theme-icon-dark hover:text-theme-icon-light-hover dark:hover:text-theme-icon-dark-hover transition-colors duration-150 rounded-full hover:bg-theme-button-icon-bg-hover-light dark:hover:bg-theme-button-icon-bg-hover-dark focus:outline-none focus:ring-0" aria-label="Open Help"><HelpIcon className="w-6 h-6" /></button>
              <button onClick={openSettingsModal} className="p-2 text-theme-icon-light dark:text-theme-icon-dark hover:text-theme-icon-light-hover dark:hover:text-theme-icon-dark-hover transition-colors duration-150 rounded-full hover:bg-theme-button-icon-bg-hover-light dark:hover:bg-theme-button-icon-bg-hover-dark focus:outline-none focus:ring-0" aria-label="Open Settings"><SettingsIcon className="w-6 h-6" /></button>
              {loggedInUser && (
                <div className="relative">
                  <button ref={profileIconRef} onClick={() => setIsProfileDropdownOpen(prev => !prev)} className="p-1.5 text-theme-icon-light dark:text-theme-icon-dark hover:text-theme-icon-light-hover dark:hover:text-theme-icon-dark-hover transition-colors duration-150 rounded-full hover:bg-theme-button-icon-bg-hover-light dark:hover:bg-theme-button-icon-bg-hover-dark focus:outline-none focus:ring-0" aria-label="Open user profile menu" title={loggedInUser.name}><ProfileIcon className="w-7 h-7" /></button>
                  {isProfileDropdownOpen && (
                    <div ref={profileDropdownRef} className="absolute right-0 mt-2 w-48 bg-theme-card-bg-light dark:bg-theme-card-bg-dark rounded-md shadow-lg py-1 z-50 border border-theme-divider-light dark:border-theme-divider-dark">
                      <button onClick={() => { setIsProfileModalOpen(true); setIsProfileDropdownOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-theme-text-primary dark:text-theme-icon-dark hover:bg-theme-divider-light dark:hover:bg-theme-bg-dark">Profile</button>
                      <button onClick={handleLogout} className="block w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-theme-divider-light dark:hover:bg-theme-bg-dark">Log Out</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {showGameArea && (
          <>
            <TimerDisplay currentDisplayState={currentDisplayState} gameController={gameController} gameOptions={gameOptions} getProfileForBoardSide={getProfileForBoardSide} getCurrentTurnParticipantProfile={getCurrentTurnParticipantProfile} isInWaitingRoom={isInWaitingRoom} isAiCurrentlyPlaying={isAiCurrentlyPlaying} />
            <StatusDisplay currentDisplayState={currentDisplayState} gameController={gameController} getProfileForBoardSide={getProfileForBoardSide} getCurrentTurnParticipantProfile={getCurrentTurnParticipantProfile} isInWaitingRoom={isInWaitingRoom} onlineGameStatusMessage={onlineGameStatusMessage} rematchOfferState={rematchOfferState} undoRequestState={undoRequestState} isAiCurrentlyPlaying={isAiCurrentlyPlaying} />
            {!isInWaitingRoom && !currentDisplayState.isReplayActive && currentDisplayState.gamePhase === GamePhase.PLAYING && (
              <div className={`hex-turn-banner ${currentDisplayState.currentPlayerId === Player.ONE ? 'hex-turn-banner-red' : 'hex-turn-banner-blue'}`} aria-live="polite">
                <strong>{getCurrentTurnParticipantProfile().name}'s turn</strong>
                <span>{currentDisplayState.currentPlayerId === Player.ONE ? 'Connect left to right' : 'Connect top to bottom'}</span>
              </div>
            )}
          </>
        )}

        {needsLoginPromptForOnlinePlay ? (
          <div className="text-center p-8 my-8">
            <h2 className="text-2xl font-semibold mb-4 text-theme-text-primary dark:text-theme-icon-dark">Online Play Requires Login</h2>
            <p className="mb-6 text-theme-text-subtle">Please log in or sign up to challenge an opponent online.</p>
            <div className="space-x-4">
              <button onClick={() => setIsLoginModalOpen(true)} className="px-6 py-3 bg-theme-button-primary-bg-light hover:bg-theme-button-primary-bg-light-hover dark:bg-theme-button-primary-bg-dark dark:hover:bg-theme-button-primary-bg-dark-hover text-theme-button-primary-text-light dark:text-theme-button-primary-text-dark font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-150">Login</button>
              <button onClick={() => setIsSignupModalOpen(true)} className="px-6 py-3 bg-theme-button-secondary-bg-light hover:bg-theme-button-secondary-bg-light-hover dark:bg-theme-button-secondary-bg-dark dark:hover:bg-theme-button-secondary-bg-dark-hover text-theme-button-secondary-text-light dark:text-theme-button-secondary-text-dark font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-150">Sign Up</button>
            </div>
          </div>
        ) : isInWaitingRoom && onlineGameSessionId ? (
          <WaitingRoomScreen />
        ) : (
          <Board
            boardMatrix={currentDisplayState.boardMatrix}
            onCellClick={currentDisplayState.isReplayActive ? () => {} : makeMove}
            disabled={boardDisabled}
            currentPlayer={currentDisplayState.currentPlayerId}
            swapRuleEnabled={currentDisplayState.isReplayActive && currentDisplayState.gameBeingReplayedTimestamp ? currentDisplayState.gameBeingReplayedSwapRule : gameController.options.swapRuleEnabled}
            turnCount={currentDisplayState.turnCount}
            firstGameMoveDetails={currentDisplayState.firstGameMoveDetails}
            swappedCellCoordinate={currentDisplayState.swappedCellCoordinate}
            isPlayerRolesSwapped={currentDisplayState.isPlayerRolesSwapped}
            winningPlayer={currentDisplayState.finalWinnerPlayerColor}
            winningPath={currentDisplayState.winningPath}
            player1Color={activePlayer1BoardSideColor}
            player2Color={activePlayer2BoardSideColor}
            currentPlayerActualColor={currentTurnActualColor}
            isFullScreen={isFullScreen}
            onToggleFullScreen={handleToggleFullScreen}
            isReplayActive={currentDisplayState.isReplayActive}
          />
        )}

        {!isFullScreen && showGameArea && !isInWaitingRoom && (
          <>
            <div className="mt-10 flex flex-col sm:flex-row justify-center items-center space-y-3 sm:space-y-0 sm:space-x-3 h-auto sm:h-12 relative">
              {showPlayAgainButton && !showOfferRematchButton && (
                <button onClick={handleRequestNewGameOrReset} className={`px-8 py-3 font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-150 ease-in-out focus:outline-none focus:ring-0 bg-theme-button-primary-bg-light hover:bg-theme-button-primary-bg-light-hover dark:bg-theme-button-primary-bg-dark dark:hover:bg-theme-button-primary-bg-dark-hover text-theme-button-primary-text-light dark:text-theme-button-primary-text-dark`}>Play New Game</button>
              )}
              {showOfferRematchButton && (
                <button onClick={offerRematch} disabled={isOnlineActionLoading || rematchOfferState !== RematchOfferState.IDLE} className={`px-8 py-3 font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-150 ease-in-out focus:outline-none focus:ring-0 ${(isOnlineActionLoading || rematchOfferState !== RematchOfferState.IDLE) ? 'bg-gray-400 text-gray-700 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white'}`}>Offer Rematch</button>
              )}
              {showPlayAgainButton && showOfferRematchButton && ( 
                <button onClick={handleRequestNewGameOrReset} className={`px-4 py-2 text-sm font-medium rounded-lg shadow-sm border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-theme-text-primary dark:text-theme-icon-dark transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-yellow-500 dark:focus:ring-offset-theme-card-bg-dark`}> New Local Game </button>
              )}
              {showOnlineGameInitiationButtons && (
                <>
                  <button onClick={() => setIsCreateGameModalOpen(true)} disabled={isOnlineActionLoading || isAuthLoading} className="hex-online-action hex-online-action-create px-6 py-3 font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-150 ease-in-out focus:outline-none focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed">Create Game</button>
                  <button onClick={handleBrowseGamesClick} disabled={isOnlineActionLoading || isAuthLoading} className="hex-online-action hex-online-action-browse px-6 py-3 font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-150 ease-in-out focus:outline-none focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed">Browse Games</button>
                </>
              )}
              {currentDisplayState.isReplayActive && (
                <button onClick={handleInternalStopReplayAndNewGame} className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-150 ease-in-out focus:outline-none focus:ring-0">Stop Replay & New Game</button>
              )}

              <GameControlButtons showMainControls={showMainGameControls} isOnlineGameActive={isOnlineGameActive} canUndoLocally={gameController.canUndo()} canResetGame={gameController.canReset()} canRequestOnlineUndo={canRequestOnlineUndo} isOnlineActionLoading={isOnlineActionLoading} onLocalUndo={localUndoMove} onRequestNewGameOrReset={handleRequestNewGameOrReset} onRequestOnlineUndo={requestOnlineUndo} onForfeitGame={handleForfeitGame} canClaimOpponentLoss={!!canClaimOpponentLoss} onClaimOpponentLoss={handleClaimOpponentLoss} />
              {showMainGameControls && (
                <div className="absolute right-0 bottom-0 flex items-center">
                  <button onClick={toggleMusicPreference} className={`p-2 transition-colors duration-150 rounded-full hover:bg-theme-button-icon-bg-hover-light dark:hover:bg-theme-button-icon-bg-hover-dark focus:outline-none focus:ring-0 ${isMusicEnabled ? 'text-theme-icon-light dark:text-theme-icon-dark hover:text-theme-icon-light-hover dark:hover:text-theme-icon-dark-hover' : 'text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400'}`} aria-label={isMusicEnabled ? "Mute background music" : "Unmute background music"} title={isMusicEnabled ? "Mute Music" : "Unmute Music"} >
                    <MusicNoteIcon className="w-6 h-6" />
                  </button>
                </div>
              )}
            </div>

            {completedGames.length > 0 && !currentDisplayState.isReplayActive && isReplayListVisible && (
              <div className="hex-replay-anchor">
              <ReplayHistoryList
                completedGames={completedGames}
                onStartReplay={handleStartReplayRequest}
                getProfileControllingBoardColor={(side, p1ProfileForGame, p2ProfileForGame, wasSwapped, wasP1ProfileAssignedSideONEatStart) => {
                  const p1IsSideONE = (wasP1ProfileAssignedSideONEatStart && !wasSwapped) || (!wasP1ProfileAssignedSideONEatStart && wasSwapped);
                  return p1IsSideONE
                    ? (side === Player.ONE ? p1ProfileForGame : p2ProfileForGame)
                    : (side === Player.ONE ? p2ProfileForGame : p1ProfileForGame);
                }}
              />
              </div>
            )}
            {showFinishedReplayControls && (
              <div className="mt-8 w-full max-w-2xl text-center">
                <button onClick={stopReplayAndShowList} className="text-sm text-theme-link-dark dark:text-theme-link-dark-hover hover:underline">Show Replay List</button>
              </div>
            )}
          </>
        )}

        {showChat && (
          <ChatWindow
            messages={chatMessages}
            onSendMessage={sendChatMessage}
            localUserUid={loggedInUser?.uid || null}
            isMaximized={isChatMaximized}
            onToggleMaximized={() => setIsChatMaximized(prev => !prev)}
            isLoading={isOnlineActionLoading}
            soundEffectsEnabled={isSoundEffectsEnabled}
            playMessageChimeSound={playMessageChimeSound}
          />
        )}
      </div> 

      {isLobbyScreenVisible && gameOptions.player2ControlType === PlayerControlType.ONLINE && (
        <LobbyScreen onClose={() => setIsLobbyScreenVisible(false)} />
      )}

      {!isFullScreen && (
        <>
          {!currentDisplayState.isReplayActive && ( 
            <>
              <HelpModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} player1Color={helpModalP1Color} player2Color={helpModalP2Color} />
              <SettingsModal
                isOpen={isSettingsModalOpen}
                onClose={closeSettingsModal}
                onApplySettings={applySettings}
                settingsInputSize={settingsInputSize} onSettingsInputSizeChange={(e) => { setSettingsInputSize(e.target.value); setSettingsError(null); }}
                currentThemeMode={settingsThemeMode} onThemeChange={(e) => setSettingsThemeMode(e.target.value as ThemeMode)}
                settingsTimerMode={settingsTimerMode}
                onTimerModeChange={(e) => {
                  const newMode = e.target.value as TimerMode;
                  setSettingsTimerMode(newMode);
                  if (settingsPlayer2ControlType === PlayerControlType.ONLINE) { 
                    if (newMode === 'perTurn') { 
                      setSettingsTimerMode('perGame');
                      setSettingsDurationPerGame(String(DEFAULT_ONLINE_GAME_DURATION_SECONDS));
                      setSettingsIncrementSeconds(String(DEFAULT_ONLINE_TIMER_INCREMENT_SECONDS));
                    } else if (newMode === 'perGame') { 
                      if (!ALLOWED_ONLINE_GAME_DURATIONS_SECONDS.includes(parseInt(settingsDurationPerGame,10))) setSettingsDurationPerGame(String(DEFAULT_ONLINE_GAME_DURATION_SECONDS));
                      if (!ALLOWED_INCREMENT_SECONDS.includes(parseInt(settingsIncrementSeconds,10) as typeof ALLOWED_INCREMENT_SECONDS[number])) setSettingsIncrementSeconds(String(DEFAULT_ONLINE_TIMER_INCREMENT_SECONDS));
                    }
                  }
                  setSettingsError(null);
                }}
                settingsDurationPerTurn={settingsDurationPerTurn} onDurationPerTurnChange={(e) => { setSettingsDurationPerTurn(e.target.value); setSettingsError(null); }}
                settingsDurationPerGame={settingsDurationPerGame} onDurationPerGameChange={(e) => { setSettingsDurationPerGame(e.target.value); setSettingsError(null); }}
                settingsIncrementSeconds={settingsIncrementSeconds} onIncrementSecondsChange={(e) => { setSettingsIncrementSeconds(e.target.value); setSettingsError(null); }}
                settingsSwapRuleEnabled={settingsSwapRuleEnabled}
                onSwapRuleChange={(e) => {
                  if (settingsPlayer2ControlType !== PlayerControlType.ONLINE) setSettingsSwapRuleEnabled(e.target.checked);
                }}
                settingsChatNotificationsEnabled={settingsChatNotificationsEnabled}
                onChatNotificationsEnabledChange={(enabled) => setSettingsChatNotificationsEnabled(enabled)}
                browserNotificationPermission={notificationPermission}
                onRequestBrowserNotificationPermission={requestBrowserNotificationPermission}
                settingsError={settingsError}
                minBoardSize={MIN_BOARD_SIZE} maxBoardSize={MAX_BOARD_SIZE}
                minTimerDurationPerTurn={MIN_TIMER_DURATION_PER_TURN} maxTimerDurationPerTurn={MAX_TIMER_DURATION_PER_TURN}
                minTimerDurationPerGame={MIN_TIMER_DURATION_PER_GAME} maxTimerDurationPerGame={MAX_TIMER_DURATION_PER_GAME}
                player1Name={settingsPlayer1Name} onPlayer1NameChange={(e) => { setSettingsPlayer1Name(e.target.value); setSettingsError(null); }}
                player1Color={settingsPlayer1Color} onPlayer1ColorChange={(color) => { setSettingsPlayer1Color(color); setSettingsError(null); }}
                player2Name={settingsPlayer2Name} onPlayer2NameChange={(e) => { setSettingsPlayer2Name(e.target.value); setSettingsError(null); }}
                player2Color={settingsPlayer2Color} onPlayer2ColorChange={(color) => { setSettingsPlayer2Color(color); setSettingsError(null); }}
                player2ControlType={settingsPlayer2ControlType}
                onPlayer2ControlTypeChange={(newControlType: PlayerControlType) => {
                  setSettingsPlayer2ControlType(newControlType);
                  if (newControlType === PlayerControlType.ONLINE) {
                    setSettingsSwapRuleEnabled(true); 
                    if(!ALLOWED_ONLINE_SIZES.includes(parseInt(settingsInputSize,10) as typeof ALLOWED_ONLINE_SIZES[number])) setSettingsInputSize(String(DEFAULT_ONLINE_BOARD_SIZE));
                    if (settingsTimerMode === 'perTurn') {
                      setSettingsTimerMode('perGame');
                      setSettingsDurationPerGame(String(DEFAULT_ONLINE_GAME_DURATION_SECONDS));
                      setSettingsIncrementSeconds(String(DEFAULT_ONLINE_TIMER_INCREMENT_SECONDS));
                    } else if (settingsTimerMode === 'perGame') { 
                      if (!ALLOWED_ONLINE_GAME_DURATIONS_SECONDS.includes(parseInt(settingsDurationPerGame,10))) setSettingsDurationPerGame(String(DEFAULT_ONLINE_GAME_DURATION_SECONDS));
                      if (!ALLOWED_INCREMENT_SECONDS.includes(parseInt(settingsIncrementSeconds,10) as typeof ALLOWED_INCREMENT_SECONDS[number])) setSettingsIncrementSeconds(String(DEFAULT_ONLINE_TIMER_INCREMENT_SECONDS));
                    }
                  } else {
                    setSettingsSwapRuleEnabled(gameOptions.swapRuleEnabled);
                  }
                  setSettingsError(null);
                }}
                aiDifficulty={settingsAiDifficulty} onAiDifficultyChange={(e) => { setSettingsAiDifficulty(e.target.value as AiDifficulty); setSettingsError(null); }}
                colorPalette={COLOR_PALETTE}
                allowedOnlineGameDurationsSeconds={ALLOWED_ONLINE_GAME_DURATIONS_SECONDS}
                allowedIncrementSeconds={ALLOWED_INCREMENT_SECONDS}
              />
            </>
          )}
          <SignupModal isOpen={isSignupModalOpen} onClose={() => setIsSignupModalOpen(false)} onSignupSuccess={handleSignupSuccess} />
          <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} onLoginSuccess={handleLoginSuccess} onSwitchToSignup={() => { setIsLoginModalOpen(false); setIsSignupModalOpen(true); }} />
          {loggedInUser && (<ProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} loggedInUser={loggedInUser} onProfileUpdated={handleProfileUpdated} />)}
        </>
      )}

      {confirmationModalConfig && (
        <ConfirmationModal
          isOpen={isConfirmationModalOpen}
          onClose={closeConfirmationModal}
          onConfirm={executeConfirmedAction}
          title={confirmationModalConfig.title}
          message={confirmationModalConfig.message}
          confirmButtonText={confirmationModalConfig.confirmButtonText}
          cancelButtonText={confirmationModalConfig.cancelButtonText}
          confirmButtonClassName={confirmationModalConfig.confirmButtonClassName}
        />
      )}
      <CreateGameModal isOpen={isCreateGameModalOpen} onClose={() => setIsCreateGameModalOpen(false)} />

      {undoRequestState === UndoRequestState.REQUEST_RECEIVED && opponentUndoRequestDetails && (
        <OnlineUndoRequestModal isOpen={true} requestingPlayerName={opponentUndoRequestDetails.requestingPlayerName} onAccept={acceptOnlineUndo} onDeny={denyOnlineUndo} isResponding={isOnlineActionLoading} />
      )}
      {rematchOfferState === RematchOfferState.OFFER_RECEIVED && opponentRematchOfferDetails && (
        <OnlineRematchOfferModal isOpen={true} offeringPlayerName={opponentRematchOfferDetails.offeringPlayerName} onAccept={acceptRematch} onDecline={declineRematch} isResponding={isOnlineActionLoading} />
      )}

      {showGlobalSpinner && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" aria-label="Loading application data" role="status">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-yellow-500"></div>
        </div>
      )}

      {!isFullScreen && (
        <GameFooter currentDisplayState={currentDisplayState} gameOptions={gameOptions} loggedInUser={loggedInUser} onlineGameSessionId={onlineGameSessionId} isInWaitingRoom={isInWaitingRoom} />
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthManagerProvider>
      <GameSessionProvider>
        <OnlinePlayManagerProvider>
          <AppContent />
        </OnlinePlayManagerProvider>
      </GameSessionProvider>
    </AuthManagerProvider>
  );
};

export default App;
