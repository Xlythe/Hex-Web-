
import React, { useEffect, useState, ChangeEvent } from 'react';
import { ThemeMode, TimerMode, TimerSettings, PlayerControlType, AiDifficulty, AllowedIncrementSecondsType } from '../types';
import {
    COLOR_PALETTE, ColorPaletteType, AI_NAME, ONLINE_OPPONENT_NAME,
    ALLOWED_ONLINE_SIZES, DEFAULT_ONLINE_BOARD_SIZE, DEFAULT_BOARD_SIZE,
    ALLOWED_ONLINE_GAME_DURATIONS_SECONDS, ALLOWED_INCREMENT_SECONDS,
    DEFAULT_ONLINE_GAME_DURATION_SECONDS, DEFAULT_ONLINE_TIMER_INCREMENT_SECONDS,
} from '../Constants';
import ColorPicker from './ColorPicker'; 
import { CloseIcon } from '../icons/CloseIcon';
import { ChevronDownIcon } from '../icons/ChevronDownIcon';

/**
 * @file SettingsModal.tsx
 * @description Provides a modal dialog for users to configure various game settings.
 * This includes board size (now a dropdown), player names and colors (using a new hexagonal ColorPicker),
 * timer options (mode and durations), the swap rule, application's visual theme,
 * and Player 2's control type (Human/AI/Online) with AI difficulty.
 * For Online play, board size selection is restricted to specific allowed sizes,
 * and timer settings are adjusted: "Per Turn" is disallowed, "Per Game" uses specific durations and increments.
 * The Swap Rule is mandatory for Online play and the checkbox is disabled.
 * For AI play, timer settings are now configurable but only apply to the human player's turn. Increment is hidden for AI.
 * "Game Setup", "Player Profiles", and "Appearance" sections are collapsible.
 * Also includes settings for chat notifications and browser notification permissions.
 */

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplySettings: () => void;
  settingsInputSize: string;
  onSettingsInputSizeChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  currentThemeMode: ThemeMode;
  onThemeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  settingsTimerMode: TimerMode;
  onTimerModeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  settingsDurationPerTurn: string;
  onDurationPerTurnChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  settingsDurationPerGame: string;
  onDurationPerGameChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  settingsIncrementSeconds: string;
  onIncrementSecondsChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  settingsSwapRuleEnabled: boolean;
  onSwapRuleChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  settingsChatNotificationsEnabled: boolean; // New prop for chat notification preference
  onChatNotificationsEnabledChange: (enabled: boolean) => void; // New prop for handling change
  browserNotificationPermission: NotificationPermission; // New prop for current browser permission
  onRequestBrowserNotificationPermission: () => Promise<void>; // New prop to request permission
  settingsError: string | null;
  minBoardSize: number;
  maxBoardSize: number;
  minTimerDurationPerTurn: number;
  maxTimerDurationPerTurn: number;
  minTimerDurationPerGame: number;
  maxTimerDurationPerGame: number;
  player1Name: string;
  onPlayer1NameChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  player1Color: string;
  onPlayer1ColorChange: (color: string) => void;
  player2Name: string;
  onPlayer2NameChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  player2Color: string;
  onPlayer2ColorChange: (color: string) => void;
  player2ControlType: PlayerControlType;
  onPlayer2ControlTypeChange: (newControlType: PlayerControlType) => void;
  aiDifficulty: AiDifficulty;
  onAiDifficultyChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  colorPalette: ReadonlyArray<ColorPaletteType>;
  allowedOnlineGameDurationsSeconds: ReadonlyArray<number>;
  allowedIncrementSeconds: ReadonlyArray<AllowedIncrementSecondsType>;
}

const ALLOWED_PER_TURN_DURATIONS_SECONDS = [5, 10, 15, 20, 30, 45, 60] as const;

const SettingsModalComponent: React.FC<SettingsModalProps> = ({
  isOpen, onClose, onApplySettings,
  settingsInputSize, onSettingsInputSizeChange,
  currentThemeMode, onThemeChange,
  settingsTimerMode, onTimerModeChange,
  settingsDurationPerTurn, onDurationPerTurnChange,
  settingsDurationPerGame, onDurationPerGameChange,
  settingsIncrementSeconds, onIncrementSecondsChange,
  settingsSwapRuleEnabled, onSwapRuleChange,
  settingsChatNotificationsEnabled, onChatNotificationsEnabledChange, // Destructure new props
  browserNotificationPermission, onRequestBrowserNotificationPermission, // Destructure new props
  settingsError,
  minBoardSize, maxBoardSize,
  minTimerDurationPerTurn, maxTimerDurationPerTurn,
  minTimerDurationPerGame, maxTimerDurationPerGame,
  player1Name, onPlayer1NameChange, player1Color, onPlayer1ColorChange,
  player2Name, onPlayer2NameChange, player2Color, onPlayer2ColorChange,
  player2ControlType, onPlayer2ControlTypeChange,
  aiDifficulty, onAiDifficultyChange,
  colorPalette,
  allowedOnlineGameDurationsSeconds,
  allowedIncrementSeconds
}) => {

  const [isGameSetupOpen, setIsGameSetupOpen] = useState<boolean>(true);
  const [isPlayerProfilesOpen, setIsPlayerProfilesOpen] = useState<boolean>(false);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState<boolean>(false);
  const [, setForceUpdate] = useState(0); 
  
  useEffect(() => {
        if (isOpen) {
            setIsGameSetupOpen(true);
            setIsPlayerProfilesOpen(false);
            setIsAppearanceOpen(false);
        }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleResize = () => setForceUpdate(prev => prev + 1);
    window.addEventListener('resize', handleResize);
    handleResize(); 
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen]); 

  useEffect(() => {
    if (isOpen && player2ControlType === PlayerControlType.ONLINE) {
      const currentNumSize = parseInt(settingsInputSize, 10);
      const effectiveCurrentSize = isNaN(currentNumSize) ? DEFAULT_BOARD_SIZE : currentNumSize;
      if (!ALLOWED_ONLINE_SIZES.includes(effectiveCurrentSize as typeof ALLOWED_ONLINE_SIZES[number])) {
        let newSize: number;
        if (effectiveCurrentSize < ALLOWED_ONLINE_SIZES[0]) {
          newSize = ALLOWED_ONLINE_SIZES[0]; 
        } else if (effectiveCurrentSize > ALLOWED_ONLINE_SIZES[ALLOWED_ONLINE_SIZES.length - 1]) {
          newSize = ALLOWED_ONLINE_SIZES[ALLOWED_ONLINE_SIZES.length - 1]; 
        } else {
          let closestSize = DEFAULT_ONLINE_BOARD_SIZE; 
          let minDiff = Infinity;
          for (const allowed of ALLOWED_ONLINE_SIZES) {
            const diff = Math.abs(allowed - effectiveCurrentSize);
            if (diff < minDiff) {
              minDiff = diff;
              closestSize = allowed;
            } else if (diff === minDiff) {
              closestSize = Math.min(closestSize, allowed);
            }
          }
          newSize = closestSize;
        }
        const simulatedEvent = {
          target: { value: String(newSize) }
        } as React.ChangeEvent<HTMLSelectElement>; 
        onSettingsInputSizeChange(simulatedEvent);
      }
    }
  }, [isOpen, player2ControlType, settingsInputSize, onSettingsInputSizeChange]);


  if (!isOpen) return null;

  const textInputBaseClasses = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-gray-700";
  const labelBaseClasses = "block text-sm font-medium text-theme-text-primary dark:text-theme-icon-dark";
  const sectionClasses = "mb-4"; 
  const fieldsetClasses = "mt-2 space-y-2"; 
  const sectionTitleClasses = "text-lg font-semibold text-theme-text-primary dark:text-theme-icon-dark";
  const collapsibleButtonClasses = "w-full flex justify-between items-center text-left py-2 focus:outline-none";
  const playerProfileBlockClasses = "border border-theme-divider-light dark:border-theme-divider-dark rounded-md mb-3 flex p-0"; 
  
  const isPlayer2Human = player2ControlType === PlayerControlType.HUMAN;
  const isPlayer2Ai = player2ControlType === PlayerControlType.AI;
  const isPlayer2Online = player2ControlType === PlayerControlType.ONLINE;

  const formatDurationForDisplay = (seconds: number): string => {
    if (seconds < 60) return `${seconds} seconds`;
    const minutes = seconds / 60;
    if (minutes === 1) return "1 minute"; 
    return `${minutes} minutes`;
  };

  const formatSecondsForDisplay = (seconds: number): string => {
    return `${seconds} seconds`;
  };

  const usePerGameDurationDropdown = (isPlayer2Online || isPlayer2Human || isPlayer2Ai) && settingsTimerMode === 'perGame';

  const standardBoardSizeOptions = [];
  for (let i = minBoardSize; i <= maxBoardSize; i++) {
    standardBoardSizeOptions.push(i);
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 dark:bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" onClick={onClose}
    >
      <div
        className="bg-theme-card-bg-light dark:bg-theme-card-bg-dark p-6 rounded-lg shadow-xl max-w-lg w-full text-theme-text-primary dark:text-theme-icon-dark overflow-y-auto max-h-[90vh] scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 id="settings-modal-title" className="text-2xl font-bold">Game Settings</h2>
          <button onClick={onClose} aria-label="Close settings" className="p-1 text-theme-icon-light dark:text-theme-icon-dark hover:text-theme-icon-light-hover dark:hover:text-theme-icon-dark-hover rounded-full hover:bg-theme-button-icon-bg-hover-light dark:hover:bg-theme-button-icon-bg-hover-dark transition-colors focus:outline-none focus:ring-0">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-1"> 
          <div className={sectionClasses}>
            <button type="button" onClick={() => setIsGameSetupOpen(!isGameSetupOpen)} className={collapsibleButtonClasses} aria-expanded={isGameSetupOpen} aria-controls="game-setup-content">
              <h3 className={sectionTitleClasses}>Game Setup</h3>
              <ChevronDownIcon className={`w-5 h-5 transform transition-transform duration-200 ${isGameSetupOpen ? 'rotate-180' : 'rotate-0'} text-theme-icon-light dark:text-theme-icon-dark`} />
            </button>
            {isGameSetupOpen && (
                <div id="game-setup-content" className="mt-3 space-y-4 pl-2 pr-1">
                    <div className="mb-4">
                    <label htmlFor="boardSize" className={labelBaseClasses}>Board Size</label>
                    <select
                        id="boardSize" name="boardSize" value={settingsInputSize} onChange={onSettingsInputSizeChange}
                        className={`${textInputBaseClasses}`} aria-describedby="boardSizeHelp"
                    >
                        {isPlayer2Online
                        ? ALLOWED_ONLINE_SIZES.map(size => (
                            <option key={size} value={String(size)}>{size}x{size}</option>
                            ))
                        : standardBoardSizeOptions.map(size => (
                            <option key={size} value={String(size)}>{size}x{size}</option>
                            ))
                        }
                    </select>
                    <p id="boardSizeHelp" className="mt-1 text-xs text-theme-text-subtle">
                        {isPlayer2Online
                        ? "Allowed sizes for online play."
                        : "Select the grid dimensions (NxN)."}
                    </p>
                    </div>
                    <div className="mb-4"> 
                        <label className={`flex items-center space-x-2 mt-1 ${isPlayer2Online ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                            <input
                            type="checkbox" checked={settingsSwapRuleEnabled} onChange={onSwapRuleChange}
                            className="form-checkbox h-5 w-5 text-indigo-600 dark:text-yellow-500 border-gray-300 dark:border-gray-600 rounded focus:ring-indigo-500 dark:focus:ring-yellow-600 bg-theme-card-bg-light dark:bg-theme-card-bg-dark"
                            disabled={isPlayer2Online}
                            />
                            <span className={`${labelBaseClasses} ${isPlayer2Online ? 'opacity-70' : ''}`}>Enable Swap Rule</span>
                        </label>
                        <p className="mt-1 text-xs text-theme-text-subtle">
                            Allows second player to take first player's opening move.
                            {isPlayer2Online && <span className="font-semibold"> (Required for Online play)</span>}
                        </p>
                    </div>

                    <div>
                        <h3 className={`${labelBaseClasses} mb-3`}>Timer Settings</h3>
                        <fieldset className={fieldsetClasses}>
                            <legend className="sr-only">Timer Mode</legend>
                            {(['off', 'perTurn', 'perGame'] as TimerMode[]).map(mode => (
                            <label key={mode} className={`flex items-center space-x-2 ${isPlayer2Online && mode === 'perTurn' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                                <input
                                type="radio" name="timerMode" value={mode} checked={settingsTimerMode === mode} onChange={onTimerModeChange}
                                className="form-radio h-4 w-4 text-indigo-600 dark:text-yellow-500 border-gray-300 dark:border-gray-600 focus:ring-indigo-500 dark:focus:ring-yellow-600 bg-theme-card-bg-light dark:bg-theme-card-bg-dark"
                                disabled={isPlayer2Online && mode === 'perTurn'} 
                                />
                                <span className="capitalize text-sm">{mode === 'perTurn' ? 'Per Turn' : mode === 'perGame' ? 'Per Game' : 'Off'}</span>
                            </label>
                            ))}
                        </fieldset>
                        {settingsTimerMode === 'perTurn' && !isPlayer2Online && (
                            <div className="mt-3">
                            <label htmlFor="durationPerTurn" className={labelBaseClasses}>Time Per Turn</label>
                            <select
                                id="durationPerTurn" name="durationPerTurn" value={settingsDurationPerTurn} onChange={onDurationPerTurnChange}
                                className={`${textInputBaseClasses}`} aria-describedby="durationPerTurnHelp"
                            >
                                {ALLOWED_PER_TURN_DURATIONS_SECONDS.map(seconds => (
                                <option key={seconds} value={String(seconds)}>{formatSecondsForDisplay(seconds)}</option>
                                ))}
                            </select>
                            <p id="durationPerTurnHelp" className="mt-1 text-xs text-theme-text-subtle">Select a time limit for each move.</p>
                            </div>
                        )}
                        {settingsTimerMode === 'perGame' && (
                            <div className="mt-3">
                            <label htmlFor="durationPerGame" className={labelBaseClasses}>
                                {usePerGameDurationDropdown ? 'Time Per Game' : 'Time Per Game (seconds)'}
                            </label>
                            {usePerGameDurationDropdown ? (
                                <select
                                    id="durationPerGame" name="durationPerGame" value={settingsDurationPerGame} onChange={onDurationPerGameChange}
                                    className={`${textInputBaseClasses}`} aria-describedby="durationPerGameHelpOnline"
                                >
                                    {allowedOnlineGameDurationsSeconds.map(seconds => (
                                    <option key={seconds} value={String(seconds)}>{formatDurationForDisplay(seconds)}</option>
                                    ))}
                                </select>
                            ) : (
                                <input type="number" id="durationPerGame" value={settingsDurationPerGame} onChange={onDurationPerGameChange} min={minTimerDurationPerGame} max={maxTimerDurationPerGame} className={`${textInputBaseClasses} appearance-none`} aria-describedby="durationPerGameHelp"/>
                            )}
                            <p id={usePerGameDurationDropdown ? "durationPerGameHelpOnline" : "durationPerGameHelp"} className="mt-1 text-xs text-theme-text-subtle">
                                {isPlayer2Ai && <span className="font-semibold block">Timer applies to human player's turn only.</span>}
                                {usePerGameDurationDropdown && !isPlayer2Ai
                                ? ""
                                : `Time per game for each player. Range: ${minTimerDurationPerGame}s - ${maxTimerDurationPerGame}s.`
                                }
                            </p>
                            </div>
                        )}
                        {settingsTimerMode === 'perGame' && (player2ControlType === PlayerControlType.HUMAN || player2ControlType === PlayerControlType.ONLINE) && (
                            <div className="mt-3">
                                <label htmlFor="incrementSeconds" className={labelBaseClasses}>Increment Per Move</label>
                                <select
                                    id="incrementSeconds" name="incrementSeconds" value={settingsIncrementSeconds} onChange={onIncrementSecondsChange}
                                    className={`${textInputBaseClasses}`} aria-describedby="incrementSecondsHelp"
                                >
                                    {allowedIncrementSeconds.map(seconds => (
                                        <option key={seconds} value={String(seconds)}>+{seconds} seconds</option>
                                    ))}
                                </select>
                                <p id="incrementSecondsHelp" className="mt-1 text-xs text-theme-text-subtle">Time added to your clock after each move.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
          </div>

            <div className={sectionClasses}>
                <button type="button" onClick={() => setIsPlayerProfilesOpen(!isPlayerProfilesOpen)} className={collapsibleButtonClasses} aria-expanded={isPlayerProfilesOpen} aria-controls="player-profiles-content">
                    <h3 className={sectionTitleClasses}>Player Profiles</h3>
                    <ChevronDownIcon className={`w-5 h-5 transform transition-transform duration-200 ${isPlayerProfilesOpen ? 'rotate-180' : 'rotate-0'} text-theme-icon-light dark:text-theme-icon-dark`} />
                </button>
                {isPlayerProfilesOpen && (
                    <div id="player-profiles-content" className="mt-3 space-y-4 pl-2 pr-1">
                        <div className={playerProfileBlockClasses}>
                           <div className="w-[65%] p-3 space-y-3"> 
                                <h4 className="text-md font-semibold text-theme-text-primary dark:text-theme-icon-dark">Player 1</h4>
                                <div>
                                    <label htmlFor="player1Name" className={labelBaseClasses}>Name</label>
                                    <input type="text" id="player1Name" value={player1Name} onChange={onPlayer1NameChange} className={`${textInputBaseClasses}`} maxLength={20} />
                                </div>
                            </div>
                           <div className="w-[35%] p-3 flex items-start justify-center pt-10"> 
                             <ColorPicker
                               availableColors={colorPalette} selectedColor={player1Color} disabledColor={player2Color}
                               onColorSelect={onPlayer1ColorChange} size="sm"
                             />
                           </div>
                        </div>

                        <div className={playerProfileBlockClasses}>
                           <div className="w-[65%] p-3 space-y-3">  
                                <h4 className="text-md font-semibold text-theme-text-primary dark:text-theme-icon-dark">Player 2</h4>
                                <fieldset>
                                    <legend className={`${labelBaseClasses} mb-1`}>Control</legend>
                                    <div className="flex space-x-4 mt-1">
                                        {(Object.values(PlayerControlType) as PlayerControlType[]).map(type => (
                                            <label key={type} className="flex items-center space-x-1 cursor-pointer">
                                                <input type="radio" name="player2ControlType" value={type} checked={player2ControlType === type}
                                                    onChange={(e) => onPlayer2ControlTypeChange(e.target.value as PlayerControlType)}
                                                    className="form-radio h-4 w-4 text-indigo-600 dark:text-yellow-500 border-gray-300 dark:border-gray-600 focus:ring-indigo-500 dark:focus:ring-yellow-600 bg-theme-card-bg-light dark:bg-theme-card-bg-dark" />
                                                <span className="text-sm capitalize">{type}</span>
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>

                                {isPlayer2Human && (
                                    <div>
                                        <label htmlFor="player2Name" className={labelBaseClasses}>Name</label>
                                        <input type="text" id="player2Name" value={player2Name} onChange={onPlayer2NameChange} className={`${textInputBaseClasses}`} maxLength={20} />
                                    </div>
                                )}
                                {isPlayer2Online && (
                                    <p className="mt-1 text-xs text-theme-text-subtle">Online opponent name will be assigned by the server.</p>
                                )}
                                {isPlayer2Ai && (
                                    <p className="mt-1 text-xs text-theme-text-subtle">Player 2 is {AI_NAME}.</p>
                                )}
                                
                                {isPlayer2Ai && (
                                    <fieldset className="mt-2">
                                        <legend className={`${labelBaseClasses} mb-1`}>AI Difficulty</legend>
                                        <div className="flex space-x-4 mt-1">
                                            {(Object.values(AiDifficulty) as AiDifficulty[]).map(level => (
                                                <label key={level} className="flex items-center space-x-1 cursor-pointer">
                                                    <input type="radio" name="aiDifficulty" value={level} checked={aiDifficulty === level} onChange={onAiDifficultyChange} className="form-radio h-4 w-4 text-indigo-600 dark:text-yellow-500 border-gray-300 dark:border-gray-600 focus:ring-indigo-500 dark:focus:ring-yellow-600 bg-theme-card-bg-light dark:bg-theme-card-bg-dark" />
                                                    <span className="text-sm capitalize">{level}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </fieldset>
                                )}
                            </div>
                           <div className="w-[35%] p-3 flex items-start justify-center pt-10"> 
                             <ColorPicker
                               availableColors={colorPalette} selectedColor={player2Color} disabledColor={player1Color}
                               onColorSelect={onPlayer2ColorChange} size="sm"
                             />
                           </div>
                        </div>
                    </div>
                )}
            </div>
          
           <div className={`${sectionClasses} border-t border-theme-divider-light dark:border-theme-divider-dark pt-4`}>
                <button type="button" onClick={() => setIsAppearanceOpen(!isAppearanceOpen)} className={collapsibleButtonClasses} aria-expanded={isAppearanceOpen} aria-controls="appearance-content">
                    <h3 className={sectionTitleClasses}>Appearance</h3>
                     <ChevronDownIcon className={`w-5 h-5 transform transition-transform duration-200 ${isAppearanceOpen ? 'rotate-180' : 'rotate-0'} text-theme-icon-light dark:text-theme-icon-dark`} />
                </button>
                {isAppearanceOpen && (
                    <div id="appearance-content" className="mt-3 pl-2 pr-1 space-y-4"> {/* Added space-y-4 */}
                        <fieldset className={fieldsetClasses}>
                        <legend className="sr-only">Theme Mode</legend> 
                        {(['light', 'dark', 'system'] as ThemeMode[]).map(mode => (
                            <label key={mode} className="flex items-center space-x-2 cursor-pointer">
                            <input type="radio" name="theme" value={mode} checked={currentThemeMode === mode} onChange={onThemeChange} className="form-radio h-4 w-4 text-indigo-600 dark:text-yellow-500 border-gray-300 dark:border-gray-600 focus:ring-indigo-500 dark:focus:ring-yellow-600 bg-theme-card-bg-light dark:bg-theme-card-bg-dark" />
                            <span className="capitalize text-sm">{mode}</span>
                            </label>
                        ))}
                        </fieldset>

                         {/* Chat Notifications Setting */}
                        <div className="mt-3">
                            <label className={`${labelBaseClasses} mb-1`}>Notifications</label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                type="checkbox"
                                checked={settingsChatNotificationsEnabled}
                                onChange={(e) => onChatNotificationsEnabledChange(e.target.checked)}
                                disabled={browserNotificationPermission === 'denied'}
                                className="form-checkbox h-4 w-4 text-indigo-600 dark:text-yellow-500 border-gray-300 dark:border-gray-600 rounded focus:ring-indigo-500 dark:focus:ring-yellow-600 bg-theme-card-bg-light dark:bg-theme-card-bg-dark disabled:opacity-70"
                                />
                                <span className={`text-sm ${browserNotificationPermission === 'denied' ? 'opacity-70' : ''}`}>
                                Enable In-Game Chat Notifications
                                </span>
                            </label>
                            <p className="mt-1 text-xs text-theme-text-subtle">
                                Browser permission:
                                {browserNotificationPermission === 'granted' && <span className="text-green-600 dark:text-green-400"> Granted</span>}
                                {browserNotificationPermission === 'denied' && <span className="text-red-600 dark:text-red-400"> Denied (Change in browser settings)</span>}
                                {browserNotificationPermission === 'default' && (
                                <>
                                    <span> Not Granted. </span>
                                    <button
                                    type="button"
                                    onClick={onRequestBrowserNotificationPermission}
                                    className="text-indigo-600 hover:text-indigo-500 dark:text-yellow-500 dark:hover:text-yellow-400 underline"
                                    >
                                    Request Permission
                                    </button>
                                </>
                                )}
                            </p>
                        </div>
                    </div>
                )}
            </div>

          {settingsError && (
            <div className="my-4 p-3 bg-red-100 dark:bg-red-800 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-100 rounded-md" role="alert">
              <p className="text-sm font-medium">Configuration Error</p>
              <p className="text-sm whitespace-pre-line">{settingsError}</p> 
            </div>
          )}
        </div>

        <div className="mt-8 pt-5 border-t border-theme-divider-light dark:border-theme-divider-dark flex justify-end space-x-3">
          <button
            type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg shadow-sm border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-theme-text-primary dark:text-theme-icon-dark transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-yellow-500 dark:focus:ring-offset-theme-card-bg-dark"
          >
            Cancel
          </button>
          <button
            type="button" onClick={onApplySettings}
            className="px-4 py-2 text-sm font-medium rounded-lg shadow-sm text-theme-button-primary-text-light dark:text-theme-button-primary-text-dark bg-theme-button-primary-bg-light hover:bg-theme-button-primary-bg-light-hover dark:bg-theme-button-primary-bg-dark dark:hover:bg-theme-button-primary-bg-dark-hover transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-yellow-500 dark:focus:ring-offset-theme-card-bg-dark"
          >
            Apply Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export { SettingsModalComponent as SettingsModal };
