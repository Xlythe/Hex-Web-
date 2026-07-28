
import React, { useState, ChangeEvent, useMemo } from 'react';
import { useOnlinePlay } from '../hooks/useOnlinePlay';
import { useAuth } from '../hooks/useAuth';
import ChatWindow from './ChatWindow';
import {
  WaitingRoomPlayer,
  PlayerStat,
  WaitingRoomGameSetupParams,
  IgHandlerGameOptions, // Assuming gameOptions is of this type or similar
  TimerMode,
  AllowedIncrementSecondsType,
} from '../types';
import {
  ALLOWED_ONLINE_SIZES,
  ALLOWED_ONLINE_GAME_DURATIONS_SECONDS,
  ALLOWED_INCREMENT_SECONDS,
  DEFAULT_ONLINE_BOARD_SIZE,
  DEFAULT_ONLINE_GAME_DURATION_SECONDS,
  DEFAULT_ONLINE_TIMER_INCREMENT_SECONDS,
} from '../Constants';
import { ChatBubbleIcon } from '../icons/ChatBubbleIcon'; // Import ChatBubbleIcon
import { useSoundEffects } from '../hooks/useSoundEffects'; // Added
import { useBackgroundMusic } from '../hooks/useBackgroundMusic'; // Added
import { useGameSession } from '../hooks/useGameSession'; // To get gameOptions

/**
 * @file WaitingRoomScreen.tsx
 * Displays the waiting room interface for an online Hex game.
 * Users can see game settings, other players, choose their spot, signal readiness,
 * and chat. The host can modify game settings before the game starts.
 * Players can un-ready if they previously readied up. Host settings are locked if any player is ready.
 */

// --- Helper Components ---

interface GameSettingItemProps<T extends string | number> {
  label: string;
  id: string;
  currentValue: T;
  isEditable: boolean; // Can this setting *ever* be edited by this user? (e.g. host status, game phase)
  canInteract: boolean; // Can the user interact *right now*? (e.g. not loading, no one ready)
  options?: { value: T; label:string }[];
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  valueToDisplay?: string; // Optional prop to directly control display text
  inputType?: 'select'; // Extendable for other input types
  disabled?: boolean; // Additional explicit disabled state passed from parent
  inputClassName?: string;
  labelClassName?: string;
  valueDisplayClassName?: string;
}

/**
 * A generic component to display or allow editing of a game setting.
 */
const GameSettingItem = <T extends string | number>({
  label,
  id,
  currentValue,
  isEditable,
  canInteract, // This now incorporates the "isAnyPlayerReady" logic from parent
  options,
  onChange,
  valueToDisplay,
  inputType = 'select',
  disabled = false, // Parent explicitly passes if setting should be disabled (e.g. due to someone being ready)
  inputClassName = "mt-1 block w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-theme-card-bg-light dark:bg-gray-700 text-theme-text-primary dark:text-theme-icon-dark disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-gray-700",
  labelClassName = "block text-xs font-medium text-theme-text-subtle",
  valueDisplayClassName = "text-sm text-theme-text-primary dark:text-theme-icon-dark pt-1.5"
}: GameSettingItemProps<T>) => {
  // The final disabled state for the input element
  const finalInputDisabled = !isEditable || !canInteract || disabled;

  return (
    <div>
      <label htmlFor={id} className={labelClassName}>{label}</label>
      {isEditable ? (
        inputType === 'select' && options ? (
          <select
            id={id}
            value={currentValue}
            onChange={onChange}
            disabled={finalInputDisabled}
            className={inputClassName}
          >
            {options.map(opt => <option key={opt.value.toString()} value={opt.value}>{opt.label}</option>)}
          </select>
        ) : null 
      ) : (
        <p className={`${valueDisplayClassName} ${disabled ? 'opacity-50' : ''}`}>
          {valueToDisplay || currentValue.toString()}
        </p>
      )}
    </div>
  );
};

interface ChatToggleButtonProps {
  onClick: () => void;
  hasUnreadMessages: boolean;
}

/**
 * Floating action button to open/toggle the chat window.
 */
const ChatToggleButton: React.FC<ChatToggleButtonProps> = ({ onClick, hasUnreadMessages }) => (
  <button
    onClick={onClick}
    className="fixed bottom-4 right-4 p-2 text-theme-icon-light dark:text-theme-icon-dark hover:text-theme-icon-light-hover dark:hover:text-theme-icon-dark-hover rounded-full bg-theme-card-bg-light dark:bg-theme-card-bg-dark shadow-lg z-50"
    aria-label="Open Chat"
    title="Open Chat"
  >
    <ChatBubbleIcon className="w-6 h-6" />
    {hasUnreadMessages && (
      <span className="absolute -top-1 -right-1 flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
      </span>
    )}
  </button>
);


// --- Main Component ---

const WaitingRoomScreen: React.FC = () => {
  // --- Hooks ---
  const {
    waitingRoomData,    
    chatMessages,       
    sendChatMessage,    
    selectPlayerPlace,  
    unreadyPlayerSeat, // New function from context
    signalReadyToStart, 
    updateWaitingRoomGameSetup, 
    isOnlineActionLoading, 
    onlineGameStatusMessage, 
    leaveOnlineGame     
  } = useOnlinePlay();
  const { loggedInUser } = useAuth(); 
  const { gameOptions: localGameOptions } = useGameSession(); 
  const { isMusicEnabled } = useBackgroundMusic(); 
  const { isSoundEffectsEnabled, playMessageChimeSound } = useSoundEffects({ isGloballyEnabled: isMusicEnabled }); 

  // --- Local State ---
  const [isChatMaximized, setIsChatMaximized] = useState(false); 

  // --- Early Exit for Loading/Error States ---
  if (!waitingRoomData || !loggedInUser) {
    return (
      <div className="text-center p-8">
        <p className="text-lg font-semibold animate-pulse text-theme-text-primary dark:text-theme-icon-dark">
          {onlineGameStatusMessage || "Loading waiting room..."}
        </p>
      </div>
    );
  }

  // --- Destructure Data & Calculate Derived State ---
  const {
    sessionInfo,        
    playerList,         
    gameOptions,        
    isCurrentUserHost,  
    isLoading: isWaitingRoomDataLoading, 
    error: waitingRoomError 
  } = waitingRoomData;

  const currentUserData = useMemo(() => playerList?.find(p => p.uid === loggedInUser.uid), [playerList, loggedInUser.uid]);
  const currentUserPlayerPlace = currentUserData?.place; 
  const isCurrentUserPlayerReady = currentUserData?.stat === PlayerStat.OFFERSTART; 

  const canInteractGlobally = !isOnlineActionLoading && !isWaitingRoomDataLoading; // Renamed for clarity
  const isGameInInitPhase = sessionInfo?.status === 'INIT';
  const isTimerEffectivelyOff = gameOptions?.timerTotal === 0 && gameOptions?.timerInc === 0;

  const isAnyPlayerReady = useMemo(() => {
    return playerList?.some(p => p.stat === PlayerStat.OFFERSTART) || false;
  }, [playerList]);

  const canHostEditSettings = isCurrentUserHost && isGameInInitPhase && canInteractGlobally && !isAnyPlayerReady;


  // --- Event Handlers ---

  const handleReadyClick = () => {
    if (canInteractGlobally && currentUserPlayerPlace && currentUserPlayerPlace !== "0" && !isCurrentUserPlayerReady && playerList && playerList.length > 0) {
      signalReadyToStart();
    }
  };

  const handleUnreadyClick = () => {
    if (canInteractGlobally && isCurrentUserPlayerReady) {
        unreadyPlayerSeat();
    }
  };

  const handleSelectPlace = (place: '1' | '2') => {
    if (canInteractGlobally) {
      selectPlayerPlace(place);
    }
  };

  const handleLeaveRoom = async () => {
    if (canInteractGlobally) {
      await leaveOnlineGame();
    }
  };

  const handleGameOptionChange = <K extends keyof Pick<WaitingRoomGameSetupParams, 'boardSize' | 'timerTotal' | 'timerInc'>>(
    key: K,
    parser: (value: string) => WaitingRoomGameSetupParams[K]
  ) => (e: ChangeEvent<HTMLSelectElement>) => {
    if (!isCurrentUserHost || !isGameInInitPhase || !canInteractGlobally || isAnyPlayerReady) return;
    
    if ((key === 'timerTotal' || key === 'timerInc') && isTimerEffectivelyOff) {
        return;
    }

    const newValue = parser(e.target.value);
    updateWaitingRoomGameSetup({ [key]: newValue });
  };

  const handleTimerModeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    if (!isCurrentUserHost || !isGameInInitPhase || !canInteractGlobally || isAnyPlayerReady) return;
    const newMode = e.target.value as TimerMode | 'off';

    if (newMode === 'off') {
      updateWaitingRoomGameSetup({ timerTotal: 0, timerInc: 0 });
    } else { 
      const currentDuration = gameOptions?.timerTotal !== undefined &&
        ALLOWED_ONLINE_GAME_DURATIONS_SECONDS.includes(gameOptions.timerTotal)
        ? gameOptions.timerTotal
        : DEFAULT_ONLINE_GAME_DURATION_SECONDS;
      const currentIncrement = gameOptions?.timerInc !== undefined &&
        ALLOWED_INCREMENT_SECONDS.includes(gameOptions.timerInc as AllowedIncrementSecondsType)
        ? gameOptions.timerInc as AllowedIncrementSecondsType
        : DEFAULT_ONLINE_TIMER_INCREMENT_SECONDS;
      updateWaitingRoomGameSetup({ timerTotal: currentDuration, timerInc: currentIncrement });
    }
  };

  const handleRatedChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!isCurrentUserHost || !isGameInInitPhase || !canInteractGlobally || isAnyPlayerReady) return;
    const newRatedStatus = e.target.checked ? '1' : '0'; 
    updateWaitingRoomGameSetup({ scored: newRatedStatus });
  };

  // --- Helper Functions ---

  const formatTimerDurationForDisplay = (seconds: number): string => {
    if (seconds === 0) return "Off"; 
    if (seconds < 60) return `${seconds} sec`;
    const minutes = seconds / 60;
    return `${minutes} min`;
  };

  const getPlayerHexColor = (place: string): string => {
    if (place === '1') return localGameOptions.player1Profile.color;
    if (place === '2') return localGameOptions.player2Profile.color;
    return '#9CA3AF'; 
  };

  // --- Base CSS classes ---
  const textInputBaseClasses = "mt-1 block w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-theme-card-bg-light dark:bg-gray-700 text-theme-text-primary dark:text-theme-icon-dark disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-gray-700";
  const labelBaseClasses = "block text-xs font-medium text-theme-text-subtle";

  // --- Render Functions ---

  const renderPlayerActionButtons = () => {
    const p1Color = localGameOptions.player1Profile.color;
    const p2Color = localGameOptions.player2Profile.color;
    const buttonBaseClasses = "w-full sm:w-auto px-6 py-3 font-semibold rounded-lg shadow-md text-white disabled:opacity-50 filter hover:brightness-90 dark:hover:brightness-110";

    if (isCurrentUserPlayerReady) {
      return (
        <button 
          onClick={handleUnreadyClick} 
          disabled={!canInteractGlobally}
          className={`${buttonBaseClasses} bg-yellow-500 hover:bg-yellow-600`}
        >
          Cancel Ready
        </button>
      );
    } else if (!currentUserPlayerPlace || currentUserPlayerPlace === "0") {
      const p1SeatTaken = !!playerList?.find(p => p.place === '1');
      const p2SeatTaken = !!playerList?.find(p => p.place === '2');
      return (
        <>
          <button 
            onClick={() => handleSelectPlace('1')} 
            disabled={!canInteractGlobally || p1SeatTaken}
            className={buttonBaseClasses}
            style={{ backgroundColor: p1Color }}
          >
            Join as Player 1 {p1SeatTaken ? "(Taken)" : ""}
          </button>
          <button 
            onClick={() => handleSelectPlace('2')} 
            disabled={!canInteractGlobally || p2SeatTaken}
            className={buttonBaseClasses}
            style={{ backgroundColor: p2Color }}
          >
            Join as Player 2 {p2SeatTaken ? "(Taken)" : ""}
          </button>
        </>
      );
    } else {
      let buttonText: string;
      let buttonDisabled = !canInteractGlobally;
      let buttonStyle = 'bg-green-500 hover:bg-green-600 text-white';

      if (playerList && playerList.length < 2 && isGameInInitPhase) {
        buttonText = "Waiting for Opponent";
        buttonDisabled = true; 
        buttonStyle = 'bg-yellow-300 text-yellow-800 cursor-not-allowed';
      } else {
        buttonText = "Ready Up";
      }
      
      return (
        <button onClick={handleReadyClick} disabled={buttonDisabled}
          className={`${buttonBaseClasses} ${buttonStyle} ${buttonDisabled && (playerList && playerList.length < 2 && isGameInInitPhase) ? '' : (buttonDisabled ? 'disabled:opacity-60' : '')}`}>
          {buttonText}
        </button>
      );
    }
  };


  // --- Main Component Render ---
  return (
    <div className="p-4 md:p-6 space-y-4 h-full flex flex-col text-theme-text-primary dark:text-theme-icon-dark">
      {waitingRoomError && <p className="text-center text-red-500 dark:text-red-400 p-2 bg-red-100 dark:bg-red-900/50 rounded-md">{waitingRoomError}</p>}

      <div className="p-3 bg-theme-divider-light dark:bg-theme-divider-dark rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-3">Game Settings</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <GameSettingItem
            label="Board Size"
            id="boardSize"
            currentValue={gameOptions?.boardSize || DEFAULT_ONLINE_BOARD_SIZE}
            isEditable={isCurrentUserHost && isGameInInitPhase}
            canInteract={canInteractGlobally}
            options={ALLOWED_ONLINE_SIZES.map(size => ({ value: size, label: `${size}x${size}` }))}
            onChange={handleGameOptionChange('boardSize', (v) => parseInt(v, 10))}
            valueToDisplay={`${gameOptions?.boardSize || 'N/A'}x${gameOptions?.boardSize || 'N/A'}`}
            inputClassName={textInputBaseClasses}
            labelClassName={labelBaseClasses}
            disabled={isAnyPlayerReady && isCurrentUserHost}
          />

          <div>
            <label htmlFor="isRated" className={`${labelBaseClasses} mb-1`}>Rated Game</label>
            {isCurrentUserHost && isGameInInitPhase ? (
              <label className="flex items-center space-x-2 cursor-pointer mt-1.5">
                <input
                  type="checkbox"
                  id="isRated"
                  checked={gameOptions?.scored === '1'}
                  onChange={handleRatedChange}
                  disabled={!canInteractGlobally || (isAnyPlayerReady && isCurrentUserHost)}
                  className="form-checkbox h-4 w-4 text-indigo-600 dark:text-yellow-500 border-gray-300 dark:border-gray-600 rounded focus:ring-indigo-500 dark:focus:ring-yellow-600 bg-theme-card-bg-light dark:bg-gray-700"
                />
                <span className="text-sm">{gameOptions?.scored === '1' ? "Yes (Scored)" : "No (Unscored)"}</span>
              </label>
            ) : (
              <p className={`text-sm pt-1.5 ${(isAnyPlayerReady && isCurrentUserHost) ? 'opacity-50' : ''}`}>{gameOptions?.scored === '1' ? "Yes (Scored)" : "No (Unscored)"}</p>
            )}
          </div>

          <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3 items-end border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
            <GameSettingItem
              label="Timer Mode"
              id="timerMode"
              currentValue={isTimerEffectivelyOff ? 'off' : 'perGame'}
              isEditable={isCurrentUserHost && isGameInInitPhase}
              canInteract={canInteractGlobally}
              options={[{ value: 'off', label: 'Off' }, { value: 'perGame', label: 'Per Game' }]}
              onChange={handleTimerModeChange}
              valueToDisplay={isTimerEffectivelyOff ? 'Off' : 'Per Game'}
              inputClassName={textInputBaseClasses}
              labelClassName={labelBaseClasses}
              disabled={(isAnyPlayerReady && isCurrentUserHost)}
            />
            
             <GameSettingItem
                label="Time Per Game"
                id="timerDuration"
                currentValue={gameOptions?.timerTotal || DEFAULT_ONLINE_GAME_DURATION_SECONDS}
                isEditable={isCurrentUserHost && isGameInInitPhase && !isTimerEffectivelyOff}
                canInteract={canInteractGlobally}
                options={ALLOWED_ONLINE_GAME_DURATIONS_SECONDS.map(sec => ({ value: sec, label: formatTimerDurationForDisplay(sec) }))}
                onChange={handleGameOptionChange('timerTotal', (v) => parseInt(v, 10))}
                valueToDisplay={formatTimerDurationForDisplay(gameOptions?.timerTotal || 0)}
                inputClassName={textInputBaseClasses}
                labelClassName={labelBaseClasses}
                disabled={isTimerEffectivelyOff || (isAnyPlayerReady && isCurrentUserHost)} 
            />

            <GameSettingItem
                label="Increment Per Move"
                id="timerIncrement"
                currentValue={(gameOptions?.timerInc as AllowedIncrementSecondsType) || DEFAULT_ONLINE_TIMER_INCREMENT_SECONDS}
                isEditable={isCurrentUserHost && isGameInInitPhase && !isTimerEffectivelyOff}
                canInteract={canInteractGlobally}
                options={ALLOWED_INCREMENT_SECONDS.map(sec => ({ value: sec, label: `+${sec}s` }))}
                onChange={handleGameOptionChange('timerInc', (v) => parseInt(v, 10) as AllowedIncrementSecondsType)}
                valueToDisplay={`+${gameOptions?.timerInc || 0}s`}
                inputClassName={textInputBaseClasses}
                labelClassName={labelBaseClasses}
                disabled={isTimerEffectivelyOff || (isAnyPlayerReady && isCurrentUserHost)}
            />
          </div>
        </div>
      </div>


      <div className="p-3 bg-theme-divider-light dark:bg-theme-divider-dark rounded-lg shadow flex-grow overflow-y-auto min-h-[150px]">
        <h3 className="text-lg font-semibold mb-2">Players ({playerList?.length || 0} / 2)</h3>
        <ul className="space-y-2">
          {playerList?.map((player: WaitingRoomPlayer) => (
            <li key={player.uid} className="flex items-center justify-between p-2 bg-theme-card-bg-light dark:bg-theme-card-bg-dark rounded-md shadow-sm">
              <div className="flex items-center">
                <span 
                  className="w-3 h-3 rounded-full mr-2"
                  style={{ backgroundColor: getPlayerHexColor(player.place) }}
                ></span>
                <span className="font-medium">
                  {player.name}
                  {player.uid === loggedInUser.uid ? " (You)" : ""}
                  {player.uid === sessionInfo?.owner ? " (Host)" : ""}
                </span>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${player.stat === PlayerStat.OFFERSTART ? 'bg-green-200 text-green-800 dark:bg-green-700 dark:text-green-100' : 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300'}`}>
                {player.stat === PlayerStat.OFFERSTART ? 'Ready' : 'Waiting'}
              </span>
            </li>
          ))}
          {(!playerList || playerList.length < 2) && Array.from({ length: 2 - (playerList?.length || 0) }).map((_, i) => (
            <li key={`empty-${i}`} className="flex items-center p-2 text-theme-text-subtle italic rounded-md">
              <span className="w-3 h-3 rounded-full mr-2 bg-gray-300 dark:bg-gray-600"></span>
              Waiting for player...
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center space-y-3 sm:space-y-0 sm:space-x-4 p-3 border-t border-theme-divider-light dark:border-theme-divider-dark">
        <div className="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-3 w-full sm:w-auto">
          {renderPlayerActionButtons()}
        </div>
        <button
          onClick={handleLeaveRoom}
          disabled={!canInteractGlobally}
          className="w-full sm:w-auto px-6 py-3 font-semibold rounded-lg shadow-md border border-gray-300 dark:border-gray-600 bg-theme-button-secondary-bg-light hover:bg-theme-button-secondary-bg-light-hover dark:bg-theme-button-secondary-bg-dark dark:hover:bg-theme-button-secondary-bg-dark-hover text-theme-button-secondary-text-light dark:text-theme-button-secondary-text-dark disabled:opacity-50"
        >
          Leave Room
        </button>
      </div>

      <div className="mt-auto"> 
        {isChatMaximized && (
          <ChatWindow
            messages={chatMessages}
            onSendMessage={sendChatMessage}
            localUserUid={loggedInUser.uid}
            isMaximized={isChatMaximized} 
            onToggleMaximized={() => setIsChatMaximized(false)}
            isLoading={isOnlineActionLoading} 
            soundEffectsEnabled={isSoundEffectsEnabled}
            playMessageChimeSound={playMessageChimeSound}
          />
        )}
      </div>
      {!isChatMaximized && (
        <ChatToggleButton
          onClick={() => setIsChatMaximized(true)}
          hasUnreadMessages={
            chatMessages.length > 0 &&
            chatMessages[chatMessages.length - 1].senderUid !== loggedInUser.uid
          }
        />
      )}
    </div>
  );
};

export default WaitingRoomScreen;