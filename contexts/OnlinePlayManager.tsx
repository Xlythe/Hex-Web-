
import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
  useMemo,
  useRef,
} from 'react';
import {
  // Server response types
  IgUserRegistrationError,
  IgCommandHandlerSuccessResponse,
  IgJoinRandomGameSuccessResponse,
  IgLobbySuccessResponse,
  IgCreateBoardSuccessResponse,
  IgCommandHandlerResponse,
  // Core game and player information types
  IgPlayerInfo,
  IgSessionInfo,
  IgHandlerGameOptions,
  IgGameEvent,
  // Enum types
  GamePhase,
  PlayerControlType,
  LobbyGameSession,
  ChatMessage,
  PlayerStat,
  WinReason,
  Player,
  OnlinePlayContextType, // Use the type from types.ts
  SYSTEM_SENDER_UID,    // Import special UID for system messages
  // Specific state and parameter types
  WaitingRoomStateData,
  WaitingRoomGameSetupParams,
  CustomGameSettings,
  UndoRequestState,
  OpponentUndoRequestDetails,
  // Rematch related types
  OpponentRematchOfferDetails,
  RematchOfferState,
} from '../types';
import { api } from '../api';
import { APP_ID, APP_CODE } from '../IgGameCenterApi'; // Required for direct IgGameCenter API calls
import {
  HEX_GID, // Game ID for Hex
  DEBUG, // Global debug flag
  OPPONENT_ACTIVITY_TIMEOUT_SECONDS, // Timeout threshold for claiming opponent loss due to inactivity
  SYSTEM_SENDER_NAME, // Import display name for system messages
} from '../Constants';
import {
  createUndoCommandParams,
  decodeHexMove,
  IGGC_POLL_INTERVAL_MS,
  isClaimQuitResponse,
  nextPollDelayMs,
  parseLegacyUndoEvent,
  parseRestartSessionId,
} from '../server/igGameCenterProtocol';
import { useAuth } from '../hooks/useAuth';
import { useGameSession } from '../hooks/useGameSession';
import {
  appendChatMessage,
  markChatDelivery,
  normalizeChatText,
  reconcileChatEvent,
  systemChatMessageId,
} from '../chatMessages';
import { publicLobbySessions } from '../server/lobbyVisibility';

const NOTIFICATION_ICON_URL = 'https://xlythe.com/images/favicon.ico'; // Ensure this is accessible

export const OnlinePlayContext = createContext<OnlinePlayContextType | undefined>(undefined);

interface OnlinePlayManagerProviderProps {
  children: ReactNode;
}

export const OnlinePlayManagerProvider: React.FC<OnlinePlayManagerProviderProps> = ({ children }) => {
  const { loggedInUser } = useAuth();
  const {
    gameController,
    gameOptions,
    currentDisplayState,
    startGame: startGameFromGameSession,
  } = useGameSession();

  // --- Online Game Session State ---
  const [onlineGameSessionId, setOnlineGameSessionId] = useState<string | null>(null);
  const [onlineGameServer, setOnlineGameServer] = useState<string | null>(null);
  const [isFindingOnlineGame, setIsFindingOnlineGame] = useState<boolean>(false);
  const [onlineGameStatusMessage, setOnlineGameStatusMessage] = useState<string | null>(null);
  const [isOnlineActionLoading, setIsOnlineActionLoading] = useState<boolean>(false);

  // --- Lobby State ---
  const [lobbyGames, setLobbyGames] = useState<LobbyGameSession[] | null>(null);
  const [isFetchingLobby, setIsFetchingLobby] = useState<boolean>(false);
  const [lobbyError, setLobbyError] = useState<string | null>(null);

  // --- In-Game State (specific to an active session) ---
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [playerListCache, setPlayerListCache] = useState<IgPlayerInfo[]>([]);
  const [opponentUid, setOpponentUid] = useState<string | null>(null);
  const [opponentIsOnline, setOpponentIsOnline] = useState<boolean | null>(null);
  const [opponentLastRefreshTime, setOpponentLastRefreshTime] = useState<number | null>(null);

  // --- Waiting Room State ---
  const [waitingRoomData, setWaitingRoomData] = useState<WaitingRoomStateData | null>(null);
  const [isInWaitingRoom, setIsInWaitingRoom] = useState<boolean>(false);

  // --- Undo Request State ---
  const [undoRequestState, setUndoRequestState] = useState<UndoRequestState>(UndoRequestState.IDLE);
  const [opponentUndoRequestDetails, setOpponentUndoRequestDetails] = useState<OpponentUndoRequestDetails | null>(null);
  const [isAwaitingUndoBoardReset, setIsAwaitingUndoBoardReset] = useState<boolean>(false);

  // --- Rematch State ---
  const [rematchOfferState, setRematchOfferState] = useState<RematchOfferState>(RematchOfferState.IDLE);
  const [opponentRematchOfferDetails, setOpponentRematchOfferDetails] = useState<OpponentRematchOfferDetails | null>(null);

  // --- Browser Notifications State ---
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    if (typeof Notification !== 'undefined') {
      return Notification.permission;
    }
    return 'default';
  });
  const previousActivePlayerUidRef = useRef<string | null | undefined>(null);
  const _handleRematchEventCallbackRef = useRef<((event: IgGameEvent) => void) | null>(null);
  const pollInFlightRef = useRef(false);
  const lastPollStartedAtRef = useRef(0);
  const nextSystemMessageSequenceRef = useRef(0);

  const showNotification = useCallback((title: string, body: string, tag?: string, isOpponentAction: boolean = true) => {
    if (
      typeof Notification !== 'undefined' &&
      notificationPermission === "granted" &&
      gameOptions.chatNotificationsEnabled &&
      (!document.hasFocus || !document.hasFocus()) &&
      isOpponentAction
    ) {
      const notification = new Notification(title, { body, tag, icon: NOTIFICATION_ICON_URL });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  }, [notificationPermission, gameOptions.chatNotificationsEnabled]);

  useEffect(() => {
    if (onlineGameSessionId && typeof Notification !== 'undefined' && Notification.permission === "default") {
      Notification.requestPermission().then(permission => {
        setNotificationPermission(permission);
      });
    }
  }, [onlineGameSessionId]);

  const requestBrowserNotificationPermission = useCallback(async () => {
    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'denied') {
        setOnlineGameStatusMessage("Notification permission is denied by your browser. Please update your browser settings if you wish to enable them.");
        return;
      }
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        setOnlineGameStatusMessage("Notifications enabled!");
        showNotification("Hex Notifications", "You will now receive game notifications.", "hex-permission-granted", false);
      } else if (permission === 'denied') {
        setOnlineGameStatusMessage("Notifications denied. You can change this in your browser settings.");
      } else {
        setOnlineGameStatusMessage("Notification permission not granted.");
      }
    } else {
      setOnlineGameStatusMessage("Browser notifications are not supported by your browser.");
    }
  }, [showNotification]);


  const _updatePlayerListAndOpponentActivity = useCallback((playerList: IgPlayerInfo[] | undefined) => {
    if (!playerList) return;

    setPlayerListCache(playerList);
    const foundOpponent = playerList.find(p => p.uid !== loggedInUser?.uid && (p.place === '1' || p.place === '2'));

    if (foundOpponent) {
      if (opponentUid !== foundOpponent.uid) setOpponentUid(foundOpponent.uid);
      setOpponentIsOnline(foundOpponent.online === '1');

      const isOpponentTurn = foundOpponent.active === '1' && loggedInUser?.uid !== foundOpponent.uid;
      if (foundOpponent.online === '0' || isOpponentTurn) {
        setOpponentLastRefreshTime(foundOpponent.lastRefresh);
      } else if (foundOpponent.online === '1' && !isOpponentTurn) {
        setOpponentLastRefreshTime(null);
      }
    } else if (opponentUid) {
      setOpponentUid(null);
      setOpponentIsOnline(null);
      setOpponentLastRefreshTime(null);
    }
  }, [loggedInUser, opponentUid]);

  const addSystemChatMessage = useCallback((text: string, timestamp?: number) => {
    const nowSeconds = timestamp || Math.floor(Date.now() / 1000);
    const systemMessage: ChatMessage = {
      id: systemChatMessageId(
        nowSeconds,
        nextSystemMessageSequenceRef.current++,
      ),
      senderUid: SYSTEM_SENDER_UID,
      senderName: SYSTEM_SENDER_NAME,
      text: text, // Use the passed text directly without prepending "System:"
      initialTimestamp: nowSeconds,
      serverTimestamp: nowSeconds,
      isLocalPlayer: false,
      // status: 'sent', // Status is optional for system messages
    };
    setChatMessages(prev => [...prev, systemMessage].sort((a, b) => (a.initialTimestamp || 0) - (b.initialTimestamp || 0)));
  }, []);

  const _handleChatMessageEvent = useCallback((event: IgGameEvent, allPlayers: IgPlayerInfo[]) => {
    if (!event.data) return;
    const sender = allPlayers.find(p => p.uid === event.uid);
    const senderName = sender?.name || `User (${event.uid.substring(0, 4)})`;
    const isLocalUserMessage = event.uid === loggedInUser?.uid;
    const trimmedEventText = normalizeChatText(event.data);

    setChatMessages(previous =>
      reconcileChatEvent(previous, event, senderName, loggedInUser?.uid || null)
    );

    if (!isLocalUserMessage) {
      showNotification(senderName, trimmedEventText, `hex-chat-${event.uid}`, true);
    }
  }, [loggedInUser, showNotification]);

  const _handleOpponentMoveEvent = useCallback((event: IgGameEvent) => {
    if (!gameController || !event.data || event.uid === loggedInUser?.uid) return;

    const move = decodeHexMove(event.data, gameController.options.boardSize);
    if (move?.kind === 'place') {
      if (DEBUG) console.log(`OnlinePlayManager: Processing opponent MOVE ${event.data}`);
      gameController.applyOpponentMove(move.coordinate.r, move.coordinate.c);
    } else if (move?.kind === 'swap') {
      gameController.applyOpponentSwap();
    } else {
      if (DEBUG) console.warn("OnlinePlayManager: Received invalid MOVE data from opponent:", event.data);
    }
  }, [gameController, loggedInUser]);

  const _handleOpponentLeftOrForfeitEvent = useCallback((event: IgGameEvent): string | null => {
    if (!gameController || event.uid === loggedInUser?.uid || gameController.gamePhase !== GamePhase.PLAYING) return null;

    const opponentName = playerListCache.find(p => p.uid === event.uid)?.name || 'Opponent';
    let reason: WinReason;
    let message: string;
    let systemChatMessage: string;

    switch (event.type) {
      case 'LEAVE':
        reason = WinReason.TIMEOUT; // Or could be a more specific "disconnect" reason if server provides
        message = `${opponentName} has left the game. You win!`;
        systemChatMessage = `${opponentName} has left the game.`;
        break;
      case 'QUIT': case 'GIVEUP':
        reason = WinReason.FORFEIT;
        const actionText = event.type === 'QUIT' ? 'forfeited' : 'resigned';
        message = `${opponentName} has ${actionText}. You win!`;
        systemChatMessage = `${opponentName} has ${actionText}.`;
        break;
      default: return null;
    }
    
    addSystemChatMessage(systemChatMessage, event.stamp);
    setOnlineGameStatusMessage(message);
    const localPlayerSide = gameController.getEffectiveLocalPlayerSide();
    if (localPlayerSide) gameController.endGame(localPlayerSide, reason, null);
    return systemChatMessage;
  }, [gameController, loggedInUser, playerListCache, addSystemChatMessage]);

  const _handleUndoEvent = useCallback((event: IgGameEvent): string | null => {
    const undoEvent = parseLegacyUndoEvent(event);
    if (!undoEvent) return null;
    const requestingPlayerName = playerListCache.find(player => player.uid === event.uid)?.name || 'Opponent';
    let systemMessageText: string | null = null;

    if (undoEvent.kind === 'request' && event.uid !== loggedInUser?.uid) {
        setUndoRequestState(UndoRequestState.REQUEST_RECEIVED);
        setOpponentUndoRequestDetails({
          targetEid: undoEvent.moveIndex === null ? '' : String(undoEvent.moveIndex),
          requestingPlayerUid: event.uid,
          requestingPlayerName,
        });
        systemMessageText = `${requestingPlayerName} requests an undo.`;
        setOnlineGameStatusMessage(systemMessageText);
        addSystemChatMessage(systemMessageText, event.stamp);
        showNotification("Undo Request", `${requestingPlayerName} wants to undo a move.`, "hex-undo-request", true);
    } else if (undoEvent.kind === 'completed') {
        setUndoRequestState(UndoRequestState.ACCEPTED_AWAITING_SERVER);
        setIsAwaitingUndoBoardReset(true);
        systemMessageText = `Undo accepted by ${requestingPlayerName}. Board will update.`;
        setOnlineGameStatusMessage(systemMessageText);
        addSystemChatMessage(systemMessageText, event.stamp);
    }
    return systemMessageText;
  }, [loggedInUser, playerListCache, showNotification, addSystemChatMessage]);

  const processEventsFromResponse = useCallback(
    (response: IgCommandHandlerResponse, currentSid: string | null) => {
      if (!gameController) return;
      if (response.error && DEBUG) {
        console.warn("OnlinePlayManager: processEventsFromResponse called with an error, but attempting to process available data.", (response as IgUserRegistrationError).message, response);
      }

      const successResponse = response as IgCommandHandlerSuccessResponse;
      const localSeat = successResponse.playerList?.find(player => player.uid === loggedInUser?.uid)?.place;
      if (localSeat === '1' || localSeat === '2') {
        gameController.setOnlineLocalSeat(localSeat === '1' ? Player.ONE : Player.TWO);
      }
      _updatePlayerListAndOpponentActivity(successResponse.playerList);
      const currentPlayersForEventContext = successResponse.playerList || playerListCache;
      const eventsToProcess = successResponse.eventList || [];
      let highestEidProcessedThisBatch = 0;

      const systemMessagesTextsAddedBySpecificEventsThisBatch: string[] = [];

      eventsToProcess.forEach(event => {
        const eventEidNum = parseInt(event.eid, 10);
        if (!isNaN(eventEidNum) && eventEidNum > highestEidProcessedThisBatch) highestEidProcessedThisBatch = eventEidNum;
        if (currentSid !== gameController.onlineOpponent?.sid) return;
        
        const eventPlayerName = currentPlayersForEventContext.find(p => p.uid === event.uid)?.name || `User (${event.uid.substring(0,4)})`;
        let systemMessageTextFromSpecificEvent: string | null = null;

        switch (event.type) {
          case 'MSG': _handleChatMessageEvent(event, currentPlayersForEventContext); break;
          case 'OPTIONS':
            if (isInWaitingRoom) {
                setWaitingRoomData(prev => {
                    if (!prev && !onlineGameSessionId) return null;
                    if (!prev && onlineGameSessionId) { 
                        return {
                            sessionInfo: successResponse.sessionInfo || null,
                            playerList: successResponse.playerList?.map(p => ({ ...p, isReady: p.stat === PlayerStat.OFFERSTART })) || [],
                            gameOptions: successResponse.gameOptions || null,
                            isCurrentUserHost: successResponse.sessionInfo?.owner === loggedInUser?.uid || false,
                            isLoading: false,
                            error: null,
                        };
                    }
                    return prev ? ({
                        ...prev,
                        gameOptions: successResponse.gameOptions as IgHandlerGameOptions,
                        isLoading: false,
                    }) : null;
                });
            }
            break;
          case 'JOIN':
             if (eventPlayerName && event.uid !== SYSTEM_SENDER_UID && event.uid !== "0") {
                 systemMessageTextFromSpecificEvent = `${eventPlayerName} has joined the room.`;
             }
             if (isInWaitingRoom) {
                setWaitingRoomData(prev => {
                    if (!prev && !onlineGameSessionId) return null;
                    const playerListFromResponse = successResponse.playerList?.map(p => ({ ...p, isReady: p.stat === PlayerStat.OFFERSTART })) || prev?.playerList || [];
                     if (!prev && onlineGameSessionId) {
                        return {
                            sessionInfo: successResponse.sessionInfo || null,
                            playerList: playerListFromResponse,
                            gameOptions: successResponse.gameOptions || null,
                            isCurrentUserHost: successResponse.sessionInfo?.owner === loggedInUser?.uid || false,
                            isLoading: false,
                            error: null,
                        };
                    }
                    return prev ? ({
                        ...prev,
                        playerList: playerListFromResponse,
                        isLoading: false,
                    }) : null;
                });
             }
             break;
          case 'PLACE': {
            const newPlace = event.data || "0";
            if (eventPlayerName && event.uid !== SYSTEM_SENDER_UID && event.uid !== "0") {
                if (newPlace === '1' || newPlace === '2') {
                    systemMessageTextFromSpecificEvent = `${eventPlayerName} sat down as Player ${newPlace}.`;
                } else if (newPlace === '0') {
                    const prevPlayerState = playerListCache.find(p => p.uid === event.uid);
                    if (prevPlayerState && (prevPlayerState.place === '1' || prevPlayerState.place === '2')) {
                        systemMessageTextFromSpecificEvent = `${eventPlayerName} is now spectating.`;
                    }
                }
            }
            if (isInWaitingRoom) {
                const playerListFromServer = (response as IgCommandHandlerSuccessResponse).playerList;
                const sessionInfoFromServer = (response as IgCommandHandlerSuccessResponse).sessionInfo;
                const gameOptionsFromServer = (response as IgCommandHandlerSuccessResponse).gameOptions;

                setWaitingRoomData(prev => {
                    if (!prev && !onlineGameSessionId) return null;
                    const newProcessedPlayerList = playerListFromServer
                        ? playerListFromServer.map(p => ({ ...p, isReady: p.stat === PlayerStat.OFFERSTART }))
                        : (prev?.playerList || []);

                    if (!prev && onlineGameSessionId) {
                        return {
                            sessionInfo: sessionInfoFromServer || null,
                            playerList: newProcessedPlayerList,
                            gameOptions: gameOptionsFromServer || null,
                            isCurrentUserHost: sessionInfoFromServer?.owner === loggedInUser?.uid || false,
                            isLoading: false,
                            error: null
                        };
                    }
                    if (prev) {
                        let listToUse = newProcessedPlayerList;
                        if (!playerListFromServer && event.uid && event.data !== undefined) {
                            if (DEBUG) console.warn("PLACE event processed, but no playerList in successResponse. Attempting to update from event data.");
                            listToUse = prev.playerList?.map(p => {
                                if (p.uid === event.uid) {
                                    return { ...p, place: event.data || p.place, stat: event.data === "0" ? PlayerStat.NONE : p.stat, isReady: event.data === "0" ? false : (p.stat === PlayerStat.OFFERSTART) };
                                }
                                return p;
                            }) || [];
                        }
                        return {
                            sessionInfo: sessionInfoFromServer || prev.sessionInfo || null,
                            playerList: listToUse,
                            gameOptions: gameOptionsFromServer || prev.gameOptions || null,
                            isCurrentUserHost: (sessionInfoFromServer?.owner === loggedInUser?.uid) || prev.isCurrentUserHost,
                            isLoading: false,
                            error: prev.error,
                        };
                    }
                    return null;
                });
            }
            break;
          }
          case 'START':
            if (eventPlayerName && event.uid !== SYSTEM_SENDER_UID && event.uid !== "0") {
                systemMessageTextFromSpecificEvent = `${eventPlayerName} is ready!`;
            }
            if (isInWaitingRoom) {
              setWaitingRoomData(prev => {
                if (!prev) return null;
                const updatedPlayerList = prev.playerList?.map(p =>
                  p.uid === event.uid ? { ...p, stat: PlayerStat.OFFERSTART, isReady: true } : p
                );
                return { ...prev, playerList: updatedPlayerList || prev.playerList, isLoading: false };
              });
            }
            break;
          case 'ACTIVE': break; // Typically implies game is starting; often accompanied by a NOTICE.
          case 'MOVE':
            if (event.uid !== loggedInUser?.uid) { // Opponent's move
                const opponentPlayer = currentPlayersForEventContext.find(p => p.uid === event.uid);
                if (opponentPlayer) {
                    systemMessageTextFromSpecificEvent = `${opponentPlayer.name} made a move.`;
                }
            }
            _handleOpponentMoveEvent(event);
            gameController.lastProcessedMoveServerEid = event.eid;
            if (event.uid === loggedInUser?.uid) gameController.lastLocalPlayerMoveServerEid = event.eid;
            break;
          case 'LEAVE': case 'QUIT': case 'GIVEUP': 
            const forfeitMsg = _handleOpponentLeftOrForfeitEvent(event); 
            if (forfeitMsg) systemMessagesTextsAddedBySpecificEventsThisBatch.push(forfeitMsg);
            break;
          case 'ENDGAME': case 'FINISHED_EVT':  break; // Handled by player stat changes
          case 'NOTICE':
            if (event.data) {
              const noticeText = event.data.trim();
              const isRedundant = systemMessagesTextsAddedBySpecificEventsThisBatch.includes(noticeText);

              if (!isRedundant && !noticeText.toLowerCase().includes("game is now active")) {
                addSystemChatMessage(noticeText, event.stamp); // Removed SYSTEM_SENDER_NAME prefix
              } else if (DEBUG && isRedundant) {
                console.log("OnlinePlayManager: Suppressed redundant NOTICE event:", noticeText);
              }
            }
            break;
          case 'UNDOASK': case 'UNDODONE':
            const undoSysMsg = _handleUndoEvent(event); 
            if (undoSysMsg) systemMessagesTextsAddedBySpecificEventsThisBatch.push(undoSysMsg);
            break;
          case 'REMATCH': case 'REMATCH_OFFER': case 'REMATCH_ACCEPTED':
          case 'REMATCH_DECLINED': case 'REMATCH_CANCELLED': case 'NEWSID_FOR_REMATCH':
          case 'RESTART':
               if (_handleRematchEventCallbackRef.current) _handleRematchEventCallbackRef.current(event);
               break;
          default: if (DEBUG) console.log("OnlinePlayManager: Unhandled event type:", event.type, event);
        }

        if (systemMessageTextFromSpecificEvent) {
            addSystemChatMessage(systemMessageTextFromSpecificEvent, event.stamp);
            systemMessagesTextsAddedBySpecificEventsThisBatch.push(systemMessageTextFromSpecificEvent);
        }
      });

      if (gameController.onlineOpponent && highestEidProcessedThisBatch > 0) {
        const currentLastEidNum = parseInt(gameController.onlineOpponent.lastEventId, 10) || 0;
        if (highestEidProcessedThisBatch > currentLastEidNum) {
          gameController.onlineOpponent.lastEventId = String(highestEidProcessedThisBatch);
        }
      }

      if (
        eventsToProcess.some(event => event.type === 'UNDODONE')
        && successResponse.gameData?.board
      ) {
        gameController.reinitializeFromOnlineState(
          successResponse.gameData.board,
          successResponse.playerList || [],
          successResponse.sessionInfo,
        );
        setIsAwaitingUndoBoardReset(false);
        setUndoRequestState(UndoRequestState.IDLE);
        setOpponentUndoRequestDetails(null);
      }

      const currentActivePlayerUid = successResponse.sessionInfo?.activePlayer;
      if (currentActivePlayerUid === loggedInUser?.uid &&
          currentActivePlayerUid !== previousActivePlayerUidRef.current &&
          successResponse.sessionInfo?.status === 'ACTIVE' &&
          currentDisplayState.gamePhase === GamePhase.PLAYING) {
        showNotification("Your Turn!", "It's your move in Hex.", "hex-turn-notification", true);
      }
      previousActivePlayerUidRef.current = currentActivePlayerUid;

      if (successResponse.playerList && gameController.gamePhase !== GamePhase.GAME_OVER) {
        successResponse.playerList.forEach(pInfo => {
          if (pInfo.stat === PlayerStat.WIN) {
            const winnerSide = pInfo.place === '1' ? Player.ONE : Player.TWO;
            const winnerMsg = `${pInfo.name || 'Player ' + pInfo.place} has won!`;
            setOnlineGameStatusMessage(winnerMsg);
            if (!systemMessagesTextsAddedBySpecificEventsThisBatch.includes(winnerMsg)) {
              addSystemChatMessage(winnerMsg);
            }
            let reason = WinReason.CONNECTION;
            if (pInfo.uid === loggedInUser?.uid && isClaimQuitResponse(
              successResponse.sessionInfo.cmd,
              successResponse.eventList,
            )) {
              reason = WinReason.CLAIMED;
            }
            gameController.endGame(winnerSide, reason, null);
          } else if (pInfo.uid === loggedInUser?.uid && (pInfo.stat === PlayerStat.QUIT || pInfo.stat === PlayerStat.LOST)) {
            const loseMsg = `You ${pInfo.stat === PlayerStat.QUIT ? 'forfeited' : 'lost'} the game.`;
            setOnlineGameStatusMessage(loseMsg);
            if (!systemMessagesTextsAddedBySpecificEventsThisBatch.includes(loseMsg)) {
                addSystemChatMessage(loseMsg);
            }
            const opponent = successResponse.playerList?.find(p => p.uid !== loggedInUser?.uid);
            const opponentSide = opponent ? (opponent.place === '1' ? Player.ONE : Player.TWO) : (gameController.getEffectiveLocalPlayerSide() === Player.ONE ? Player.TWO : Player.ONE);
            gameController.endGame(opponentSide, pInfo.stat === PlayerStat.QUIT ? WinReason.FORFEIT : WinReason.CONNECTION, null);
          } else if (pInfo.uid !== loggedInUser?.uid && (pInfo.stat === PlayerStat.QUIT || pInfo.stat === PlayerStat.LOST)) {
             const oppForfeitMsg = _handleOpponentLeftOrForfeitEvent({ eid: '', type: pInfo.stat === PlayerStat.QUIT ? 'QUIT' : 'LEAVE', uid: pInfo.uid, stamp: Date.now()/1000, data: '' });
             if(oppForfeitMsg) systemMessagesTextsAddedBySpecificEventsThisBatch.push(oppForfeitMsg);
          }

          if (pInfo.timerLeft !== undefined && gameController.options.timerSettings.mode === 'perGame' && (pInfo.place === '1' || pInfo.place === '2')) {
            gameController.setPlayerGameTime(pInfo.place === '1' ? Player.ONE : Player.TWO, pInfo.timerLeft);
          }
        });
      }

      if (successResponse.sessionInfo?.status === 'ACTIVE' && isInWaitingRoom) {
        if (DEBUG) console.log("OnlinePlayManager: Game starting because sessionInfo.status is ACTIVE.");
        setIsInWaitingRoom(false);
        setWaitingRoomData(null);
        setUndoRequestState(UndoRequestState.IDLE); setOpponentUndoRequestDetails(null);
        setRematchOfferState(RematchOfferState.IDLE); setOpponentRematchOfferDetails(null);
        const gameStartOptions = successResponse.gameOptions || waitingRoomData?.gameOptions;
        startGameFromGameSession(gameStartOptions || undefined);
        const startMsg = "Game is starting!";
        setOnlineGameStatusMessage(startMsg);
        addSystemChatMessage(startMsg); 
      } else if (successResponse.sessionInfo?.status === 'FINISHED' && gameController?.gamePhase !== GamePhase.GAME_OVER) {
        const finishMsg = "Game session has finished.";
        setOnlineGameStatusMessage(finishMsg);
        if (!systemMessagesTextsAddedBySpecificEventsThisBatch.includes(finishMsg)) {
            addSystemChatMessage(finishMsg);
        }
        const winnerInfo = successResponse.playerList?.find(p => p.stat === PlayerStat.WIN);
        const winnerPlayerSide = winnerInfo ? (winnerInfo.place === '1' ? Player.ONE : Player.TWO) : null;
        let reason = winnerPlayerSide ? WinReason.CONNECTION : null;
        if (winnerPlayerSide && winnerInfo?.uid === loggedInUser?.uid && isClaimQuitResponse(
          successResponse.sessionInfo.cmd,
          successResponse.eventList,
        )) {
          reason = WinReason.CLAIMED;
        }
        gameController.endGame(winnerPlayerSide, reason, null);
      }
    },
    [
      loggedInUser, playerListCache, gameController, onlineGameSessionId, isInWaitingRoom,
      waitingRoomData?.gameOptions,
      startGameFromGameSession,
      _updatePlayerListAndOpponentActivity, _handleChatMessageEvent,
      _handleOpponentMoveEvent, _handleOpponentLeftOrForfeitEvent, _handleUndoEvent,
      showNotification, currentDisplayState.gamePhase, addSystemChatMessage,
    ]
  );

  const _joinRestartedSession = useCallback(async (newSid: string) => {
    if (!gameController || !loggedInUser || !onlineGameServer) return;
    setRematchOfferState(RematchOfferState.ACCEPTED_AWAITING_NEW_GAME);
    setOpponentRematchOfferDetails(null);
    setOnlineGameStatusMessage('Starting rematch...');
    setChatMessages([]);
    setUndoRequestState(UndoRequestState.IDLE);
    setOpponentUndoRequestDetails(null);
    setOnlineGameSessionId(newSid);
    gameController.setOnlineGameSession(newSid, onlineGameServer);
    const refreshResponse = await gameController.onlineOpponent!.sendCommand('REFRESH', loggedInUser);
    processEventsFromResponse(refreshResponse, newSid);
    setRematchOfferState(RematchOfferState.IDLE);
  }, [gameController, loggedInUser, onlineGameServer, processEventsFromResponse]);

  const _handleRematchEventCallbackLogic = useCallback((event: IgGameEvent) => {
    const newSid = parseRestartSessionId(event);
    if (!newSid) return;
    const offeringPlayerName = playerListCache.find(player => player.uid === event.uid)?.name || 'Opponent';
    const timestamp = event.stamp || Math.floor(Date.now() / 1000);

    if (event.uid === loggedInUser?.uid) {
      addSystemChatMessage(`Rematch created. Starting game ${newSid}.`, timestamp);
      void _joinRestartedSession(newSid).catch(error => {
        setRematchOfferState(RematchOfferState.ERROR);
        setOnlineGameStatusMessage(`Could not start rematch: ${(error as Error).message}`);
      });
      return;
    }

    setRematchOfferState(RematchOfferState.OFFER_RECEIVED);
    setOpponentRematchOfferDetails({
      offeringPlayerUid: event.uid,
      offeringPlayerName,
      newSessionId: newSid,
    });
    const message = `${offeringPlayerName} started a rematch. Join them?`;
    setOnlineGameStatusMessage(message);
    addSystemChatMessage(message, timestamp);
    showNotification('Rematch', message, 'hex-rematch-offer', true);
  }, [
    loggedInUser,
    playerListCache,
    _joinRestartedSession,
    showNotification,
    addSystemChatMessage,
  ]);

  useEffect(() => {
    _handleRematchEventCallbackRef.current = _handleRematchEventCallbackLogic;
  }, [_handleRematchEventCallbackLogic]);

  const _resetLocalOnlineState = useCallback(() => {
    setOnlineGameSessionId(null);
    setOnlineGameServer(null);
    gameController?.clearOnlineGameSession();
    setChatMessages([]);
    setPlayerListCache([]);
    setIsInWaitingRoom(false);
    setWaitingRoomData(null);
    setUndoRequestState(UndoRequestState.IDLE);
    setOpponentUndoRequestDetails(null);
    setIsAwaitingUndoBoardReset(false);
    setOpponentUid(null);
    setOpponentIsOnline(null);
    setOpponentLastRefreshTime(null);
    setRematchOfferState(RematchOfferState.IDLE);
    setOpponentRematchOfferDetails(null);
    previousActivePlayerUidRef.current = null;
  }, [gameController]);

  const findOnlineGame = useCallback(async () => {
    if (!loggedInUser || !gameController) {
      setOnlineGameStatusMessage("Please log in to find an online game."); return;
    }
    setIsFindingOnlineGame(true);
    setOnlineGameStatusMessage("Searching for an opponent...");
    try {
      const joinResponse = await api.joinRandomGame({
        uid: loggedInUser.uid, session_id: loggedInUser.session_id, gid: HEX_GID,
      });
      if (joinResponse.error) throw new Error((joinResponse as IgUserRegistrationError).message);

      const successResponse = joinResponse as IgJoinRandomGameSuccessResponse;
      setOnlineGameSessionId(successResponse.sid);
      setOnlineGameServer(successResponse.server);
      gameController.setOnlineGameSession(successResponse.sid, successResponse.server);
      setOnlineGameStatusMessage(`Connecting to game room ${successResponse.sid}...`);

      const joinCommandResponse = await gameController.onlineOpponent!.sendCommand(null, loggedInUser);
      if (joinCommandResponse.error) throw new Error(`Failed to enter game session: ${(joinCommandResponse as IgUserRegistrationError).message}`);
      processEventsFromResponse(joinCommandResponse, successResponse.sid);

      const joinSuccess = joinCommandResponse as IgCommandHandlerSuccessResponse;
      setWaitingRoomData({
        sessionInfo: joinSuccess.sessionInfo || null,
        playerList: joinSuccess.playerList?.map(p => ({ ...p, isReady: p.stat === PlayerStat.OFFERSTART })) || [],
        gameOptions: joinSuccess.gameOptions || null,
        isCurrentUserHost: joinSuccess.sessionInfo?.owner === loggedInUser.uid,
        isLoading: false, error: null,
      });
      setIsInWaitingRoom(true);
      setUndoRequestState(UndoRequestState.IDLE); setOpponentUndoRequestDetails(null);
      setRematchOfferState(RematchOfferState.IDLE); setOpponentRematchOfferDetails(null);
      addSystemChatMessage(`Joined game room. Waiting for opponent.`);
      setOnlineGameStatusMessage("Waiting for opponent in game room.");
    } catch (err: any) {
      setOnlineGameStatusMessage(`Error finding game: ${err.message}`);
      _resetLocalOnlineState();
    } finally {
      setIsFindingOnlineGame(false);
    }
  }, [loggedInUser, gameController, processEventsFromResponse, _resetLocalOnlineState, addSystemChatMessage]);

  const leaveOnlineGame = useCallback(async () => {
    const sidForServer = onlineGameSessionId;
    const serverForServer = onlineGameServer;
    const userForServer = loggedInUser;
    const lastEventIdForServer =
      gameController?.onlineOpponent?.lastEventId ?? "0";

    _resetLocalOnlineState();
    setOnlineGameStatusMessage("You have left the game session.");

    if (userForServer && sidForServer && serverForServer) {
        setIsOnlineActionLoading(true);
        try {
            if (DEBUG) console.log(`OnlinePlayManager: Attempting to send LEAVE command for SID ${sidForServer}`);
            await api.handleGameCommand({
                app_id: APP_ID, app_code: APP_CODE,
                uid: userForServer.uid, session_id: userForServer.session_id,
                sid: sidForServer, cmd: 'LEAVE', lasteid: lastEventIdForServer,
            }, serverForServer);
            if (DEBUG) console.log(`OnlinePlayManager: LEAVE command for SID ${sidForServer} acknowledged by server (or sent without error).`);
        } catch (err: any) {
            console.warn(`OnlinePlayManager: Failed to send LEAVE command for SID ${sidForServer}:`, (err as Error).message);
        } finally {
            setIsOnlineActionLoading(false);
        }
    }
  }, [
    loggedInUser,
    onlineGameSessionId,
    onlineGameServer,
    gameController,
    _resetLocalOnlineState,
  ]);

  const createOnlineGame = useCallback(async (settings: CustomGameSettings): Promise<boolean> => {
    if (!loggedInUser || !gameController) {
      setOnlineGameStatusMessage("Please log in to create an online game."); return false;
    }
    setIsOnlineActionLoading(true);
    setOnlineGameStatusMessage("Creating new game session...");
    let createdSid: string | null = null;
    try {
      const createResponse = await api.createBoardSession({
        uid: loggedInUser.uid,
        session_id: loggedInUser.session_id,
        gid: HEX_GID,
        place: '1',
        private: settings.isHidden ? '1' : '0'
      });
      if (createResponse.error) throw new Error(`Failed to create board: ${(createResponse as IgUserRegistrationError).message}`);
      const { sid, server } = createResponse as IgCreateBoardSuccessResponse;
      createdSid = sid;
      setOnlineGameSessionId(sid); setOnlineGameServer(server);
      gameController.setOnlineGameSession(sid, server);
      setOnlineGameStatusMessage(`Entering game room ${sid}...`);
      addSystemChatMessage(`Game room ${sid} created by you.`, Math.floor(Date.now()/1000));

      // The original Android client performed the handler handshake immediately
      // after board creation; the server can discard an unclaimed board quickly.
      const joinResponse = await gameController.onlineOpponent!.sendCommand(null, loggedInUser);
      if (joinResponse.error) throw new Error(`Failed to enter created game: ${(joinResponse as IgUserRegistrationError).message}`);
      processEventsFromResponse(joinResponse, sid);

      setOnlineGameStatusMessage(`Game ${sid} created. Setting up options...`);
      const setupParamsForCommand: Record<string, string> = {
        boardSize: String(settings.boardSize),
        timerTotal: String(settings.timerMode === 'perGame' ? settings.timerDurationSeconds : 0),
        timerInc: String(settings.timerMode === 'perGame' ? settings.timerIncrementSeconds : 0),
        scored: settings.isRated ? '1' : '0',
        private: settings.isHidden ? '1' : '0',
      };

      const setupResponse = await gameController.onlineOpponent!.sendCommand('SETUP', loggedInUser, setupParamsForCommand);
      if (setupResponse.error) throw new Error(`Failed to SETUP game options: ${(setupResponse as IgUserRegistrationError).message}`);
      processEventsFromResponse(setupResponse, sid);

      const joinSuccess = joinResponse as IgCommandHandlerSuccessResponse;
      setWaitingRoomData({
        sessionInfo: joinSuccess.sessionInfo || null,
        playerList: joinSuccess.playerList?.map(p => ({ ...p, isReady: p.stat === PlayerStat.OFFERSTART })) || [],
        gameOptions: (setupResponse as IgCommandHandlerSuccessResponse).gameOptions || joinSuccess.gameOptions || null,
        isCurrentUserHost: true, isLoading: false, error: null,
      });
      setIsInWaitingRoom(true);
      setUndoRequestState(UndoRequestState.IDLE); setOpponentUndoRequestDetails(null);
      setRematchOfferState(RematchOfferState.IDLE); setOpponentRematchOfferDetails(null);
      setOnlineGameStatusMessage("Game created. Waiting for opponent.");
      addSystemChatMessage(`Game options set. Waiting for opponent.`, Math.floor(Date.now()/1000));
      return true;
    } catch (err: any) {
      setOnlineGameStatusMessage(`Error creating game: ${err.message}`);
      if (createdSid && gameController.onlineOpponent?.sid === createdSid) {
        await leaveOnlineGame();
      } else {
        _resetLocalOnlineState();
      }
      return false;
    } finally {
      setIsOnlineActionLoading(false);
    }
  }, [loggedInUser, gameController, processEventsFromResponse, leaveOnlineGame, _resetLocalOnlineState, addSystemChatMessage]);

  const fetchLobbyGames = useCallback(async () => {
    if (!loggedInUser) {
      setLobbyError("Please log in to view the lobby."); setLobbyGames(null); return;
    }
    setIsFetchingLobby(true); setLobbyError(null);
    try {
      const response = await api.fetchLobby({
        uid: loggedInUser.uid, session_id: loggedInUser.session_id, gid: HEX_GID,
      });
      if (response.error) throw new Error((response as IgUserRegistrationError).message);
      setLobbyGames(publicLobbySessions(
        (response as IgLobbySuccessResponse).sessions,
      ));
    } catch (err: any) {
      setLobbyError(err.message); setLobbyGames(null);
    } finally {
      setIsFetchingLobby(false);
    }
  }, [loggedInUser]);

  const joinLobbyGame = useCallback(async (session: LobbyGameSession) => {
    if (!loggedInUser || !gameController) {
      setOnlineGameStatusMessage("Login required to join."); return;
    }
    if (onlineGameSessionId) {
      setOnlineGameStatusMessage("You are already in a game. Leave it first to join another."); return;
    }
    setIsOnlineActionLoading(true);
    setOnlineGameStatusMessage(`Connecting to game: ${session.sid}...`);
    try {
      setOnlineGameSessionId(session.sid);
      setOnlineGameServer(session.server);
      gameController.setOnlineGameSession(session.sid, session.server);

      const joinResponse = await gameController.onlineOpponent!.sendCommand(null, loggedInUser, {
        fromLobby: 'true',
        lobbyOwnerName: session.members.find(member => member.uid === session.ownerUid)?.name || 'Host',
        lobbyHostUid: session.ownerUid,
      });
      if (joinResponse.error) throw new Error(`Failed to enter game session: ${(joinResponse as IgUserRegistrationError).message}`);
      processEventsFromResponse(joinResponse, session.sid);

      const occupiedPlaces = new Set(session.members.map(member => member.place));
      const availablePlace: '1' | '2' = occupiedPlaces.has('1') ? '2' : '1';
      const placeResponse = await gameController.onlineOpponent!.sendCommand('PLACE', loggedInUser, {
        place: availablePlace,
      });
      if (placeResponse.error) throw new Error(`Failed to take player seat: ${(placeResponse as IgUserRegistrationError).message}`);
      processEventsFromResponse(placeResponse, session.sid);

      const joinSuccess = placeResponse as IgCommandHandlerSuccessResponse;
      setWaitingRoomData({
        sessionInfo: joinSuccess.sessionInfo || null,
        playerList: joinSuccess.playerList?.map(p => ({ ...p, isReady: p.stat === PlayerStat.OFFERSTART })) || [],
        gameOptions: joinSuccess.gameOptions || null,
        isCurrentUserHost: joinSuccess.sessionInfo?.owner === loggedInUser.uid,
        isLoading: false, error: null,
      });
      setIsInWaitingRoom(true);
      setUndoRequestState(UndoRequestState.IDLE); setOpponentUndoRequestDetails(null);
      setRematchOfferState(RematchOfferState.IDLE); setOpponentRematchOfferDetails(null);
      addSystemChatMessage(`Joined game ${session.sid}. Waiting for players/start.`, Math.floor(Date.now()/1000));
      setOnlineGameStatusMessage(`Joined game ${session.sid}. Waiting for players/start.`);
    } catch (err: any) {
      setOnlineGameStatusMessage(`Error joining lobby game: ${err.message}`);
      _resetLocalOnlineState();
    } finally {
      setIsOnlineActionLoading(false);
    }
  }, [loggedInUser, gameController, onlineGameSessionId, processEventsFromResponse, _resetLocalOnlineState, addSystemChatMessage]);

  const sendChatMessage = useCallback(async (messageText: string) => {
    if (!loggedInUser || !onlineGameSessionId || !gameController?.onlineOpponent) return;
    const trimmedMessageText = normalizeChatText(messageText);
    if (!trimmedMessageText) return;

    const nowSeconds = Math.floor(Date.now() / 1000);
    const tempId = `local-${nowSeconds}-${Math.random().toString(36).substring(2, 7)}`;
    const optimisticMessage: ChatMessage = {
      id: tempId, localId: tempId, senderUid: loggedInUser.uid, senderName: loggedInUser.name,
      text: trimmedMessageText, initialTimestamp: nowSeconds, serverTimestamp: nowSeconds,
      isLocalPlayer: true, status: 'sending',
    };
    setChatMessages(previous => appendChatMessage(previous, optimisticMessage));

    try {
      const response = await gameController.onlineOpponent.sendCommand('MSG', loggedInUser, { message: trimmedMessageText });
      if (response.error) {
        setChatMessages(previous => markChatDelivery(previous, tempId, 'failed'));
      } else {
        processEventsFromResponse(response, onlineGameSessionId);
        setChatMessages(previous => markChatDelivery(previous, tempId, 'sent'));
      }
    } catch (err: any) {
      console.error("OnlinePlayManager: Chat send exception:", err);
      setChatMessages(previous => markChatDelivery(previous, tempId, 'failed'));
    }
  }, [loggedInUser, onlineGameSessionId, gameController, processEventsFromResponse]);

  const selectPlayerPlace = useCallback(async (place: '1' | '2') => {
    if (!loggedInUser || !onlineGameSessionId || !gameController?.onlineOpponent || !waitingRoomData) return;
    setIsOnlineActionLoading(true);
    try {
      const response = await gameController.onlineOpponent.sendCommand('PLACE', loggedInUser, { place });
      if (response.error) {
        setWaitingRoomData(prev => prev ? { ...prev, error: (response as IgUserRegistrationError).message, isLoading: prev.isLoading } : null);
      } else {
        processEventsFromResponse(response, onlineGameSessionId);
      }
    } catch (err: any) {
      setWaitingRoomData(prev => prev ? { ...prev, error: (err as Error).message, isLoading: prev.isLoading } : null);
    } finally {
      setIsOnlineActionLoading(false);
    }
  }, [loggedInUser, onlineGameSessionId, gameController, processEventsFromResponse, waitingRoomData]);

  const unreadyPlayerSeat = useCallback(async () => {
    if (!loggedInUser || !onlineGameSessionId || !gameController?.onlineOpponent || !waitingRoomData) {
      setOnlineGameStatusMessage("Cannot un-ready: session or user data missing.");
      return;
    }
    const localPlayerInRoom = waitingRoomData.playerList?.find(p => p.uid === loggedInUser.uid);
    if (!localPlayerInRoom ) {
      setOnlineGameStatusMessage("You are not in this game room's player list.");
      return;
    }
    if (localPlayerInRoom.stat !== PlayerStat.OFFERSTART) {
        setOnlineGameStatusMessage("You are not currently marked as ready.");
        return;
    }

    setIsOnlineActionLoading(true);
    setOnlineGameStatusMessage("Un-readying...");
    try {
      const response = await gameController.onlineOpponent.sendCommand('PLACE', loggedInUser, { place: '0' });
      if (response.error) {
        setOnlineGameStatusMessage(`Error un-readying: ${(response as IgUserRegistrationError).message}`);
      } else {
        processEventsFromResponse(response, onlineGameSessionId);
        setOnlineGameStatusMessage("You are no longer ready.");
      }
    } catch (err: any) {
      setOnlineGameStatusMessage(`Exception un-readying: ${err.message}`);
    } finally {
      setIsOnlineActionLoading(false);
    }
  }, [loggedInUser, onlineGameSessionId, gameController, waitingRoomData, processEventsFromResponse]);

  const updateWaitingRoomGameSetup = useCallback(async (newSetupParams: WaitingRoomGameSetupParams) => {
    if (!loggedInUser || !onlineGameSessionId || !gameController?.onlineOpponent || !waitingRoomData || !waitingRoomData.isCurrentUserHost) {
      if (DEBUG && waitingRoomData && !waitingRoomData.isCurrentUserHost) console.warn("OnlinePlayManager: Attempted to update game setup by non-host.");
      return;
    }
    setIsOnlineActionLoading(true);
    setWaitingRoomData(prev => prev ? { ...prev, isLoading: true, error: null } : null);
    try {
      const paramsToSendForSetup: Record<string, string> = {};
      (Object.keys(newSetupParams) as Array<keyof WaitingRoomGameSetupParams>).forEach(key => {
          const value = newSetupParams[key];
          if (value !== undefined && value !== null) {
              paramsToSendForSetup[key] = String(value);
          }
      });

      const response = await gameController.onlineOpponent!.sendCommand('SETUP', loggedInUser, paramsToSendForSetup);
      if (response.error) {
        setWaitingRoomData(prev => prev ? { ...prev, error: (response as IgUserRegistrationError).message, isLoading: false } : null);
      } else {
        processEventsFromResponse(response, onlineGameSessionId);
        setWaitingRoomData(prev => prev ? { ...prev, isLoading: false } : null);
        addSystemChatMessage(`Game settings updated by host.`, Math.floor(Date.now()/1000));
      }
    } catch (err: any) {
      setWaitingRoomData(prev => prev ? { ...prev, error: (err as Error).message, isLoading: false } : null);
    } finally {
      setIsOnlineActionLoading(false);
    }
  }, [loggedInUser, onlineGameSessionId, gameController, waitingRoomData, processEventsFromResponse, addSystemChatMessage]);

  const signalReadyToStart = useCallback(async () => {
    if (!loggedInUser || !onlineGameSessionId || !gameController?.onlineOpponent || !waitingRoomData) {
      setOnlineGameStatusMessage("Cannot signal ready: session or user data missing."); return;
    }
    const localPlayer = waitingRoomData.playerList?.find(p => p.uid === loggedInUser.uid);
    if (!localPlayer || localPlayer.place === "0") {
      setOnlineGameStatusMessage("You must select a seat before signaling ready."); return;
    }
    if (localPlayer.stat === PlayerStat.OFFERSTART) {
      setOnlineGameStatusMessage("You are already marked as ready."); return;
    }

    setIsOnlineActionLoading(true);
    setOnlineGameStatusMessage("Signaling ready to start...");
    try {
      const response = await gameController.onlineOpponent.sendCommand('START', loggedInUser, { lasteid: gameController.onlineOpponent.lastEventId });
      if (response.error) {
        setOnlineGameStatusMessage(`Error signaling ready: ${(response as IgUserRegistrationError).message}`);
      } else {
        processEventsFromResponse(response, onlineGameSessionId);
        setOnlineGameStatusMessage("Ready signal sent. Waiting for server...");
      }
    } catch (err: any) {
      setOnlineGameStatusMessage(`Exception signaling ready: ${err.message}`);
    } finally {
      setIsOnlineActionLoading(false);
    }
  }, [loggedInUser, onlineGameSessionId, gameController, waitingRoomData, processEventsFromResponse]);

  const forfeitOnlineGame = useCallback(async () => {
    if (!loggedInUser || !onlineGameSessionId || !gameController?.onlineOpponent || currentDisplayState.gamePhase !== GamePhase.PLAYING) {
      setOnlineGameStatusMessage("Cannot forfeit: Not in an active online game."); return;
    }
    setIsOnlineActionLoading(true);
    setOnlineGameStatusMessage("Forfeiting game...");
    try {
      const response = await gameController.onlineOpponent.sendCommand('END', loggedInUser, { type: 'GIVEUP' });
      if (response.error) {
        setOnlineGameStatusMessage(`Error forfeiting on server: ${(response as IgUserRegistrationError).message}. Forcing local end.`);
        const opponentSide = gameController.getEffectiveLocalPlayerSide() === Player.ONE ? Player.TWO : Player.ONE;
        addSystemChatMessage(`You forfeited the game.`, Math.floor(Date.now()/1000));
        gameController.endGame(opponentSide, WinReason.FORFEIT, null);
      } else {
        processEventsFromResponse(response, onlineGameSessionId);
      }
    } catch (err: any) {
      setOnlineGameStatusMessage(`Exception forfeiting: ${err.message}. Forcing local end.`);
      const opponentSide = gameController.getEffectiveLocalPlayerSide() === Player.ONE ? Player.TWO : Player.ONE;
      addSystemChatMessage(`You forfeited the game due to an error.`, Math.floor(Date.now()/1000));
      gameController.endGame(opponentSide, WinReason.FORFEIT, null);
    } finally {
      setIsOnlineActionLoading(false);
    }
  }, [loggedInUser, onlineGameSessionId, gameController, processEventsFromResponse, currentDisplayState.gamePhase, addSystemChatMessage]);

  const canClaimOpponentLossComputed = useMemo(() => {
    if (!onlineGameSessionId || !loggedInUser || !opponentUid || !playerListCache.length || gameController?.gamePhase !== GamePhase.PLAYING) return false;
    const opponentDetails = playerListCache.find(p => p.uid === opponentUid);
    if (!opponentDetails || opponentDetails.active !== '1') return false;
    if (opponentLastRefreshTime !== null) {
      const currentTimeSeconds = Math.floor(Date.now() / 1000);
      return (currentTimeSeconds - opponentLastRefreshTime) >= OPPONENT_ACTIVITY_TIMEOUT_SECONDS;
    }
    return false;
  }, [onlineGameSessionId, loggedInUser, opponentUid, playerListCache, opponentLastRefreshTime, gameController?.gamePhase]);

  const claimOpponentLoss = useCallback(async () => {
    if (!loggedInUser || !gameController?.onlineOpponent || !onlineGameSessionId || !canClaimOpponentLossComputed) {
      setOnlineGameStatusMessage("Cannot claim win at this time."); return;
    }
    setIsOnlineActionLoading(true);
    setOnlineGameStatusMessage("Attempting to claim victory due to opponent inactivity...");
    try {
      const response = await gameController.onlineOpponent.sendCommand('END', loggedInUser, { type: 'CLAIMQUIT' });
      if (response.error) {
        setOnlineGameStatusMessage(`Claim failed: ${(response as IgUserRegistrationError).message}`);
      } else {
        processEventsFromResponse(response, onlineGameSessionId);
        setOnlineGameStatusMessage("Claim request processed by server.");
        addSystemChatMessage("You claimed victory due to opponent inactivity.", Math.floor(Date.now()/1000));
      }
    } catch (err: any) {
      setOnlineGameStatusMessage(`Exception claiming win: ${err.message}`);
    } finally {
      setIsOnlineActionLoading(false);
    }
  }, [loggedInUser, gameController, onlineGameSessionId, processEventsFromResponse, canClaimOpponentLossComputed, addSystemChatMessage]);

  const canRequestOnlineUndoComputed = useMemo(() => (
    gameOptions.player2ControlType === PlayerControlType.ONLINE &&
    !!onlineGameSessionId &&
    undoRequestState === UndoRequestState.IDLE &&
    currentDisplayState.gamePhase === GamePhase.PLAYING &&
    (gameController?.turnCount ?? 0) > 0 &&
    !isOnlineActionLoading
  ), [gameOptions.player2ControlType, onlineGameSessionId, undoRequestState, currentDisplayState.gamePhase, gameController, isOnlineActionLoading]);

  const requestOnlineUndo = useCallback(async () => {
    if (!loggedInUser || !gameController?.onlineOpponent || !canRequestOnlineUndoComputed) return;
    setIsOnlineActionLoading(true);
    setOnlineGameStatusMessage("Sending undo request...");
    try {
      const response = await gameController.onlineOpponent.sendCommand(
        'UNDO',
        loggedInUser,
        createUndoCommandParams('ASK', gameController.turnCount - 1),
      );
      if (response.error) {
        setOnlineGameStatusMessage(`Undo request failed: ${(response as IgUserRegistrationError).message}`);
        setUndoRequestState(UndoRequestState.IDLE);
      } else {
        setUndoRequestState(UndoRequestState.REQUEST_SENT);
        setOnlineGameStatusMessage("Undo request sent. Waiting for opponent...");
        addSystemChatMessage(`You requested an undo.`, Math.floor(Date.now()/1000));
        processEventsFromResponse(response, onlineGameSessionId);
      }
    } catch (err: any) {
      setOnlineGameStatusMessage(`Error sending undo request: ${err.message}`);
      setUndoRequestState(UndoRequestState.IDLE);
    } finally {
      setIsOnlineActionLoading(false);
    }
  }, [loggedInUser, gameController, processEventsFromResponse, onlineGameSessionId, canRequestOnlineUndoComputed, addSystemChatMessage]);

  const acceptOnlineUndo = useCallback(async () => {
    if (!loggedInUser || !gameController?.onlineOpponent || undoRequestState !== UndoRequestState.REQUEST_RECEIVED) return;
    setIsOnlineActionLoading(true);
    setOnlineGameStatusMessage("Accepting undo request...");
    try {
      const response = await gameController.onlineOpponent.sendCommand(
        'UNDO',
        loggedInUser,
        createUndoCommandParams('ACCEPT'),
      );
      if (response.error) {
        setOnlineGameStatusMessage(`Failed to accept undo: ${(response as IgUserRegistrationError).message}`);
        setUndoRequestState(UndoRequestState.IDLE);
      } else {
        setUndoRequestState(UndoRequestState.ACCEPTED_AWAITING_SERVER);
        setIsAwaitingUndoBoardReset(true);
        setOnlineGameStatusMessage("Undo accepted. Game state will update shortly.");
        addSystemChatMessage(`You accepted the undo request.`, Math.floor(Date.now()/1000));
        processEventsFromResponse(response, onlineGameSessionId);
      }
    } catch (err: any) {
      setOnlineGameStatusMessage(`Error accepting undo: ${err.message}`);
      setUndoRequestState(UndoRequestState.IDLE);
    } finally {
      setIsOnlineActionLoading(false);
      setOpponentUndoRequestDetails(null);
    }
  }, [loggedInUser, gameController, undoRequestState, processEventsFromResponse, onlineGameSessionId, addSystemChatMessage]);

  const denyOnlineUndo = useCallback(async () => {
    if (!loggedInUser || !gameController?.onlineOpponent || undoRequestState !== UndoRequestState.REQUEST_RECEIVED) return;
    setIsOnlineActionLoading(true);
    setOnlineGameStatusMessage("Denying undo request...");
    try {
      const response = await gameController.onlineOpponent.sendCommand(
        'UNDO',
        loggedInUser,
        createUndoCommandParams('DENY'),
      );
      if (response.error) {
        setOnlineGameStatusMessage(`Failed to deny undo: ${(response as IgUserRegistrationError).message}`);
      } else {
        setUndoRequestState(UndoRequestState.DENIED);
        setOnlineGameStatusMessage("Undo request denied.");
        addSystemChatMessage(`You denied the undo request.`, Math.floor(Date.now()/1000));
        processEventsFromResponse(response, onlineGameSessionId);
        setTimeout(() => setUndoRequestState(UndoRequestState.IDLE), 3000);
      }
    } catch (err: any) {
      setOnlineGameStatusMessage(`Error denying undo: ${err.message}`);
    } finally {
      setIsOnlineActionLoading(false);
      setOpponentUndoRequestDetails(null);
    }
  }, [loggedInUser, gameController, undoRequestState, processEventsFromResponse, onlineGameSessionId, addSystemChatMessage]);

  const canOfferRematchComputed = useMemo(() => (
    !!onlineGameSessionId &&
    currentDisplayState.gamePhase === GamePhase.GAME_OVER &&
    rematchOfferState === RematchOfferState.IDLE &&
    !isOnlineActionLoading
  ), [onlineGameSessionId, currentDisplayState.gamePhase, rematchOfferState, isOnlineActionLoading]);

  const offerRematch = useCallback(async () => {
    if (!loggedInUser || !gameController?.onlineOpponent || !canOfferRematchComputed) return;
    setIsOnlineActionLoading(true);
    setOnlineGameStatusMessage("Offering rematch...");
    try {
      const response = await gameController.onlineOpponent.sendCommand('RESTART', loggedInUser);
      if (response.error) {
        setOnlineGameStatusMessage(`Failed to offer rematch: ${(response as IgUserRegistrationError).message}`);
        setRematchOfferState(RematchOfferState.ERROR);
        setTimeout(() => setRematchOfferState(RematchOfferState.IDLE), 3000);
      } else {
        processEventsFromResponse(response, onlineGameSessionId);
        if (!(response as IgCommandHandlerSuccessResponse).eventList?.some(event => event.type === 'RESTART')) {
          setRematchOfferState(RematchOfferState.OFFER_SENT);
          setOnlineGameStatusMessage('Rematch requested.');
        }
      }
    } catch (err: any) {
      setOnlineGameStatusMessage(`Error offering rematch: ${err.message}`);
      setRematchOfferState(RematchOfferState.ERROR);
      setTimeout(() => setRematchOfferState(RematchOfferState.IDLE), 3000);
    } finally {
      setIsOnlineActionLoading(false);
    }
  }, [loggedInUser, gameController, canOfferRematchComputed, processEventsFromResponse, onlineGameSessionId]);

  const acceptRematch = useCallback(async () => {
    if (
      !loggedInUser
      || !gameController?.onlineOpponent
      || rematchOfferState !== RematchOfferState.OFFER_RECEIVED
      || !opponentRematchOfferDetails
    ) return;
    setIsOnlineActionLoading(true);
    setOnlineGameStatusMessage("Accepting rematch...");
    try {
      await _joinRestartedSession(opponentRematchOfferDetails.newSessionId);
    } catch (err: any) {
      setOnlineGameStatusMessage(`Error accepting rematch: ${err.message}`);
      setRematchOfferState(RematchOfferState.ERROR);
      setTimeout(() => setRematchOfferState(RematchOfferState.IDLE), 3000);
    } finally {
      setIsOnlineActionLoading(false);
    }
  }, [
    loggedInUser,
    gameController,
    rematchOfferState,
    opponentRematchOfferDetails,
    _joinRestartedSession,
  ]);

  const declineRematch = useCallback(async () => {
    if (!loggedInUser || !gameController?.onlineOpponent || rematchOfferState !== RematchOfferState.OFFER_RECEIVED) return;
    setIsOnlineActionLoading(true);
    setOnlineGameStatusMessage("Declining rematch...");
    try {
      // The legacy protocol has no decline command. Declining simply leaves the
      // newly-created board unjoined, matching the production Android client.
      setOpponentRematchOfferDetails(null);
      setRematchOfferState(RematchOfferState.DECLINED_BY_LOCAL);
      setTimeout(() => setRematchOfferState(RematchOfferState.IDLE), 3000);
    } catch (err: any) {
      setOnlineGameStatusMessage(`Error declining rematch: ${err.message}`);
    } finally {
      setIsOnlineActionLoading(false);
    }
  }, [loggedInUser, gameController, rematchOfferState]);

  useEffect(() => {
    if (!loggedInUser || !onlineGameSessionId || !onlineGameServer || !gameController?.onlineOpponent) {
      return;
    }

    let timeoutId: number | undefined;
    let cancelled = false;
    const pollInterval = IGGC_POLL_INTERVAL_MS;

    const fetchData = async () => {
      if (!gameController?.onlineOpponent || !onlineGameSessionId || !loggedInUser) return;

      const isAwaitingCriticalServerResponse = undoRequestState === UndoRequestState.REQUEST_SENT ||
                                             isAwaitingUndoBoardReset ||
                                             rematchOfferState === RematchOfferState.OFFER_SENT ||
                                             rematchOfferState === RematchOfferState.ACCEPTED_AWAITING_NEW_GAME;

      if (isOnlineActionLoading && !isAwaitingCriticalServerResponse) {
        if (DEBUG) console.log("OnlinePlayManager: Skipping REFRESH poll due to ongoing online action (isOnlineActionLoading=true).");
        return;
      }
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      lastPollStartedAtRef.current = Date.now();

      try {
        const response = await gameController.onlineOpponent.sendCommand('REFRESH', loggedInUser, {
          lasteid: gameController.onlineOpponent.lastEventId,
        });

        if (!response.error && (response as IgCommandHandlerSuccessResponse).sessionInfo?.status === 'INIT' && !isInWaitingRoom && onlineGameSessionId) {
            if(DEBUG) console.log(`OnlinePlayManager: Server indicates game ${onlineGameSessionId} is INIT. Forcing to waiting room UI.`);
            setIsInWaitingRoom(true);
            const successResp = response as IgCommandHandlerSuccessResponse;
            setWaitingRoomData({
              sessionInfo: successResp.sessionInfo,
              playerList: successResp.playerList?.map(p => ({ ...p, isReady: p.stat === PlayerStat.OFFERSTART })) || [],
              gameOptions: successResp.gameOptions || null,
              isCurrentUserHost: successResp.sessionInfo?.owner === loggedInUser.uid,
              isLoading: false,
              error: null,
            });
        }


        if (response.error && ((response as IgUserRegistrationError).message.includes("INVALID_BOARD_SESSION_ID") || (response as IgUserRegistrationError).message.includes("INVALID_SESSION_ID"))) {
          console.error("OnlinePlayManager: Session invalid during REFRESH, leaving game.", response);
          await leaveOnlineGame();
          return;
        }
        processEventsFromResponse(response, onlineGameSessionId);

        const successResponse = response as IgCommandHandlerSuccessResponse;
        if (response.error) {
          setOnlineGameStatusMessage(`Refresh error: ${(response as IgUserRegistrationError).message}`);
          if (isInWaitingRoom) { 
            setWaitingRoomData(prev => prev ? { ...prev, error: (response as IgUserRegistrationError).message, isLoading: false } : {
                 sessionInfo: null, playerList: [], gameOptions: null, isCurrentUserHost: false, isLoading: false, error: (response as IgUserRegistrationError).message
            });
          }
        } else {
          if (isAwaitingUndoBoardReset && successResponse.gameData?.board && gameController) {
            if (DEBUG) console.log("OnlinePlayManager: Board reset from REFRESH data after accepted undo.");
            gameController.reinitializeFromOnlineState(successResponse.gameData.board, successResponse.playerList || [], successResponse.sessionInfo);
            setIsAwaitingUndoBoardReset(false);
            setUndoRequestState(UndoRequestState.IDLE);
            const updateMsg = "Game state updated after undo.";
            setOnlineGameStatusMessage(updateMsg);
            setTimeout(() => setOnlineGameStatusMessage(null), 3000);
          }

          if (isInWaitingRoom) {
            setWaitingRoomData(prev => {
                if (!onlineGameSessionId && prev) return null;

                const newPlayerList = successResponse.playerList?.map(p => ({
                    ...p,
                    isReady: p.stat === PlayerStat.OFFERSTART
                })) || (prev?.playerList ?? []);

                const updatedGameOptions = successResponse.gameOptions ?
                    (successResponse.gameOptions as IgHandlerGameOptions) :
                    (prev?.gameOptions ?? null);

                return {
                    sessionInfo: successResponse.sessionInfo || (prev?.sessionInfo ?? null),
                    playerList: newPlayerList,
                    gameOptions: updatedGameOptions,
                    isCurrentUserHost: successResponse.sessionInfo?.owner === loggedInUser?.uid || (prev?.isCurrentUserHost ?? false),
                    isLoading: false,
                    error: null,
                };
            });
          } else if (successResponse.sessionInfo?.status === 'FINISHED' && gameController?.gamePhase !== GamePhase.GAME_OVER) {
            setOnlineGameStatusMessage("Game has finished.");
          }

          if (!isInWaitingRoom && successResponse.memberInfo?.active === '1' &&
              successResponse.sessionInfo?.status === 'ACTIVE' &&
              undoRequestState === UndoRequestState.IDLE && rematchOfferState === RematchOfferState.IDLE &&
              currentDisplayState.gamePhase === GamePhase.PLAYING && currentDisplayState.isOnlineOpponent &&
              gameController?.currentPlayerId === gameController?.getEffectiveLocalPlayerSide()) {
            if (!onlineGameStatusMessage || onlineGameStatusMessage.startsWith("Server:") || onlineGameStatusMessage === "Game state updated after undo.") {
               setOnlineGameStatusMessage("It's your turn!");
            }
          }
        }
      } catch (err: any) {
        console.error("OnlinePlayManager: Polling exception:", err);
        setOnlineGameStatusMessage(`Polling connection error: ${err.message}`);
         if (isInWaitingRoom) { 
            setWaitingRoomData(prev => prev ? { ...prev, error: err.message, isLoading: false } : {
                 sessionInfo: null, playerList: [], gameOptions: null, isCurrentUserHost: false, isLoading: false, error: err.message
            });
          }
      } finally {
        pollInFlightRef.current = false;
      }
    };

    const runPoll = async () => {
      const remainingDelay = nextPollDelayMs(
        Date.now(),
        lastPollStartedAtRef.current,
        pollInterval,
      );
      if (remainingDelay > 0) {
        timeoutId = window.setTimeout(runPoll, remainingDelay);
        return;
      }
      await fetchData();
      if (!cancelled) {
        timeoutId = window.setTimeout(runPoll, pollInterval);
      }
    };

    void runPoll();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [
    loggedInUser, onlineGameSessionId, onlineGameServer, gameController,
    processEventsFromResponse, leaveOnlineGame, isOnlineActionLoading,
    isInWaitingRoom,
    currentDisplayState.gamePhase, currentDisplayState.isOnlineOpponent,
    startGameFromGameSession,
    undoRequestState, isAwaitingUndoBoardReset,
    rematchOfferState, addSystemChatMessage
  ]);

  const contextValue = useMemo<OnlinePlayContextType>(() => ({
    onlineGameSessionId, onlineGameServer, isFindingOnlineGame, onlineGameStatusMessage,
    isOnlineActionLoading, setOnlineGameStatusMessage, findOnlineGame, leaveOnlineGame,
    createOnlineGame, lobbyGames, isFetchingLobby, lobbyError, fetchLobbyGames, joinLobbyGame,
    chatMessages, sendChatMessage, waitingRoomData, isInWaitingRoom, selectPlayerPlace, unreadyPlayerSeat,
    updateWaitingRoomGameSetup, signalReadyToStart, undoRequestState, opponentUndoRequestDetails,
    requestOnlineUndo, acceptOnlineUndo, denyOnlineUndo, canRequestOnlineUndo: canRequestOnlineUndoComputed,
    isAwaitingUndoBoardReset, forfeitOnlineGame, canClaimOpponentLoss: canClaimOpponentLossComputed,
    claimOpponentLoss, opponentLastRefreshTime, opponentIsOnline, rematchOfferState,
    opponentRematchOfferDetails, offerRematch, acceptRematch, declineRematch,
    canOfferRematch: canOfferRematchComputed,
    notificationPermission,
    requestBrowserNotificationPermission,
  }), [
    onlineGameSessionId, onlineGameServer, isFindingOnlineGame, onlineGameStatusMessage,
    isOnlineActionLoading, findOnlineGame, leaveOnlineGame,
    createOnlineGame, lobbyGames, isFetchingLobby, lobbyError, fetchLobbyGames, joinLobbyGame,
    chatMessages, sendChatMessage, waitingRoomData, isInWaitingRoom, selectPlayerPlace, unreadyPlayerSeat,
    updateWaitingRoomGameSetup, signalReadyToStart, undoRequestState, opponentUndoRequestDetails,
    requestOnlineUndo, acceptOnlineUndo, denyOnlineUndo, canRequestOnlineUndoComputed,
    isAwaitingUndoBoardReset, forfeitOnlineGame, canClaimOpponentLossComputed,
    claimOpponentLoss, opponentLastRefreshTime, opponentIsOnline, rematchOfferState,
    opponentRematchOfferDetails, offerRematch, acceptRematch, declineRematch,
    canOfferRematchComputed,
    notificationPermission,
    requestBrowserNotificationPermission,
  ]);

  return (
    <OnlinePlayContext.Provider value={contextValue}>
      {children}
    </OnlinePlayContext.Provider>
  );
};
