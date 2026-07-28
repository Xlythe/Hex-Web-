
import {
  // --- User Management Types ---
  IgUserRegistrationParams, IgUserLoginParams,
  IgUserRegistrationSuccessResponse, IgUserLoginSuccessResponse, IgUserRegistrationError,
  IgUserProfileParams, IgUserProfileData,
  IgUserUpdateParams, IgUserUpdateSuccessResponse,

  // --- Game & Session Types ---
  IgGameStatEntry, IgGameLogEntry, Player, PlayerStat,
  IgJoinRandomGameParams, IgJoinRandomGameResponse, IgJoinRandomGameSuccessResponse,
  IgCommandHandlerFullParams, IgCommandHandlerResponse, IgCommandHandlerSuccessResponse,
  IgSessionInfo, IgMemberInfo, IgPlayerInfo, IgGuestInfo, IgGameEvent, IgHandlerGameData, IgHandlerGameOptions,
  IgApiResponse, LoggedInUser, // General API response and user type
  LobbyGameSession, IgLobbyApiParams, IgLobbyResponse, IgLobbySuccessResponse, LobbyGameSessionMember, // Lobby types
  IgCreateBoardParams, IgCreateBoardResponse, IgCreateBoardSuccessResponse // Create Board types
} from '../types'; // Importing type definitions for API requests, responses, and data structures.
import { getOrGenerateNetworkUid } from '../utils'; // Utility function (not directly used in this mock's core logic but might be relevant for a fuller implementation).
import { APP_ID, APP_CODE } from '../IgGameCenterApi'; // Constants for a real API (not used in mock).
import { MOCK_BOT_UID, MOCK_BOT_NAME, DEFAULT_BOARD_SIZE, DEBUG, HEX_GID } from '../Constants'; // Constants for identifying the mock bot.

/**
 * @interface StoredMockUser
 * @description Defines the structure for storing user data internally within the mock API.
 */
interface StoredMockUser extends Omit<IgUserRegistrationParams, 'password' | 'networkuid'> {
  uid: string;
  hashedPassword?: string;
  sessionId?: string;
  sessionExpiry?: number;
}

/**
 * @interface MockBoardSessionData
 * @description Represents the complete state of a single game session (a "board") managed by the mock API.
 */
interface MockBoardSessionData {
  sid: string;
  ownerUid: string;
  ownerName: string;
  gameStatus: 'INIT' | 'ACTIVE' | 'FINISHED';
  players: Map<string, IgPlayerInfo>; // uid -> IgPlayerInfo
  guests: Map<string, IgGuestInfo>;   // uid -> IgGuestInfo
  events: IgGameEvent[];
  gameData?: IgHandlerGameData;
  gameOptions?: IgHandlerGameOptions;
  lastEventIdCounter: number;
  playerPlaces: Map<string, string>; // uid -> place ("1", "2", "0" for guest)
  boardMatrixForMockAi: string[][];
  boardSize: number;
  aiPlayerUid: string | null;
  humanPlayerUid: string | null;
  isBotTurnInProgress: boolean;
  botAutoJoinTimeoutId?: number;
  botAutoReadyTimeoutId?: number;
}


/**
 * @class MockIgGameCenterApi
 * @description Provides a mock implementation of the IgGameCenterApi.
 */
export class MockIgGameCenterApi {
  private users: Map<string, StoredMockUser> = new Map();
  private profiles: Map<string, IgUserProfileData> = new Map();
  private usernameToUid: Map<string, string> = new Map();
  private emailToUid: Map<string, string> = new Map();
  private nextUid: number = 1;
  private nextBoardSidCounter: number = 1;
  private mockBoardSessions: Map<string, MockBoardSessionData> = new Map();
  private botMoveTimeoutId: Map<string, number> = new Map();

  constructor() {
    if (!this.users.has(MOCK_BOT_UID)) {
        const botUser: StoredMockUser = {
            uid: MOCK_BOT_UID,
            name: MOCK_BOT_NAME,
            hashedPassword: this.hashPassword("bot_password"), 
            email: "bot@example.com",
            sex: '-', 
        };
        this.users.set(MOCK_BOT_UID, botUser);
        this.usernameToUid.set(MOCK_BOT_NAME, MOCK_BOT_UID);
        this.emailToUid.set("bot@example.com", MOCK_BOT_UID);
        this.profiles.set(MOCK_BOT_UID, {
            name: MOCK_BOT_NAME,
            email: "bot@example.com",
            registrationTime: Math.floor(Date.now() / 1000),
            error: false, 
        });
    }
  }

  private generateUid(): string {
    return `mock_uid_${this.nextUid++}`;
  }

  private generateBoardSid(): string {
    return `mock_board_sid_${this.nextBoardSidCounter++}`;
  }

  private hashPassword(password: string): string {
    return password + "_mock_hashed";
  }

  private getNextEventIdForBoard(sid: string): string {
    const boardSession = this.mockBoardSessions.get(sid);
    if (boardSession) {
        boardSession.lastEventIdCounter++;
        return String(boardSession.lastEventIdCounter);
    }
    return "1";
  }

  private addEventToBoard(sid: string, type: string, uid: string, data?: string): IgGameEvent {
    const boardSession = this.mockBoardSessions.get(sid);
    if (!boardSession) throw new Error("Board session not found for adding event");

    const newEvent: IgGameEvent = {
        eid: this.getNextEventIdForBoard(sid),       
        stamp: Math.floor(Date.now() / 1000), 
        uid,                                        
        type,                                       
        data                                        
    };
    boardSession.events.push(newEvent); 
    if (DEBUG) console.log(`MockAPI Event [SID:${sid}, EID:${newEvent.eid}]: Type=${type}, UID=${uid}, Data=${data || "N/A"}`);
    return newEvent;
  }

  private syncBoardMatrixToGameData(sid: string): void {
    const boardSession = this.mockBoardSessions.get(sid);
    if (boardSession && boardSession.gameData && boardSession.boardMatrixForMockAi) {
        const flatBoard = boardSession.boardMatrixForMockAi.flat().join('');
        boardSession.gameData.board = flatBoard;
    }
  }

  private syncGameDataToBoardMatrix(sid: string): void {
    const boardSession = this.mockBoardSessions.get(sid);
    if (boardSession && boardSession.gameData?.board && boardSession.boardSize > 0) {
        const flatBoard = boardSession.gameData.board.split('');
        const newMatrix: string[][] = [];
        for (let i = 0; i < boardSession.boardSize; i++) {
            newMatrix.push(flatBoard.slice(i * boardSession.boardSize, (i + 1) * boardSession.boardSize));
        }
        boardSession.boardMatrixForMockAi = newMatrix;
    }
  }

  private scheduleBotAutoJoinIfApplicable(sid: string): void {
    const boardSession = this.mockBoardSessions.get(sid);
    if (!boardSession || boardSession.gameStatus !== 'INIT' || boardSession.players.size >= 2 || boardSession.aiPlayerUid) {
        return; 
    }

    if (boardSession.botAutoJoinTimeoutId) clearTimeout(boardSession.botAutoJoinTimeoutId);

    boardSession.botAutoJoinTimeoutId = setTimeout(() => {
        const currentSession = this.mockBoardSessions.get(sid); 
        const botUser = this.users.get(MOCK_BOT_UID);
        if (!currentSession || currentSession.gameStatus !== 'INIT' || currentSession.players.size >= 2 || currentSession.aiPlayerUid || !botUser) {
            if(currentSession) delete currentSession.botAutoJoinTimeoutId;
            return;
        }

        currentSession.aiPlayerUid = MOCK_BOT_UID;
        const botPlace = Array.from(currentSession.playerPlaces.values()).includes("1") ? "2" : "1"; 
        currentSession.playerPlaces.set(MOCK_BOT_UID, botPlace);

        const botPlayerInfo: IgPlayerInfo = {
            uid: MOCK_BOT_UID, name: MOCK_BOT_NAME, sex: botUser.sex || '-', score: 1600,
            place: botPlace, stat: PlayerStat.NONE, lastRefresh: Math.floor(Date.now()/1000), 
            online: '1', active: '0', finished: '0'
        };
        currentSession.players.set(MOCK_BOT_UID, botPlayerInfo);
        this.addEventToBoard(sid, "JOIN", MOCK_BOT_UID, MOCK_BOT_NAME);
        this.addEventToBoard(sid, "PLACE", MOCK_BOT_UID, botPlace);
        this.addEventToBoard(sid, "NOTICE", "0", `${MOCK_BOT_NAME} (Bot) has joined the game.`);
        delete currentSession.botAutoJoinTimeoutId;
        
        this.scheduleBotAutoReadyUpIfApplicable(sid); 

    }, 1000 + Math.random() * 1000) as unknown as number; 
  }

  private scheduleBotAutoReadyUpIfApplicable(sid: string): void {
    const boardSession = this.mockBoardSessions.get(sid);
    if (!boardSession || boardSession.gameStatus !== 'INIT' || !boardSession.aiPlayerUid) {
        return;
    }
    const botInfo = boardSession.players.get(boardSession.aiPlayerUid);
    if (!botInfo || botInfo.stat === PlayerStat.OFFERSTART) { 
        return;
    }

    if (boardSession.botAutoReadyTimeoutId) clearTimeout(boardSession.botAutoReadyTimeoutId);

    boardSession.botAutoReadyTimeoutId = setTimeout(() => {
        const currentSession = this.mockBoardSessions.get(sid);
        if (!currentSession || currentSession.gameStatus !== 'INIT' || !currentSession.aiPlayerUid) {
             if(currentSession) delete currentSession.botAutoReadyTimeoutId;
            return;
        }
        const currentBotInfo = currentSession.players.get(currentSession.aiPlayerUid);
        if (!currentBotInfo || currentBotInfo.stat === PlayerStat.OFFERSTART) {
             if(currentSession) delete currentSession.botAutoReadyTimeoutId;
            return;
        }

        currentBotInfo.stat = PlayerStat.OFFERSTART;
        this.addEventToBoard(sid, "START", MOCK_BOT_UID); // Data is n/a for START event
        this.addEventToBoard(sid, "NOTICE", "0", `${MOCK_BOT_NAME} (Bot) is ready!`);
        delete currentSession.botAutoReadyTimeoutId;

        this.tryStartActiveGame(sid); 
    }, 1000 + Math.random() * 1000) as unknown as number; 
  }


  private tryStartActiveGame(sid: string): void {
    const boardSession = this.mockBoardSessions.get(sid);
    if (!boardSession || boardSession.gameStatus !== 'INIT' || boardSession.players.size !== 2) {
        return;
    }

    let allReady = true;
    boardSession.players.forEach(p => {
        if (p.stat !== PlayerStat.OFFERSTART) allReady = false;
    });

    if (allReady) {
        boardSession.gameStatus = 'ACTIVE';
        this.addEventToBoard(sid, "NOTICE", "0", "All players ready. Game starting!");
        this.addEventToBoard(sid, "ACTIVE", "0", "Game is now active"); 

        const playerArray = Array.from(boardSession.players.values());
        const firstPlayer = playerArray.find(p => p.place === '1');
        const secondPlayer = playerArray.find(p => p.place === '2');

        if (firstPlayer && secondPlayer) {
            firstPlayer.active = '1';
            secondPlayer.active = '0';
            this.addEventToBoard(sid, "NOTICE", "0", `${firstPlayer.name} to move first.`);
            if (firstPlayer.uid === boardSession.aiPlayerUid) {
                this.scheduleBotMove(sid);
            }
        } else {
             if (DEBUG) console.error(`MockAPI tryStartActiveGame: Player places not correctly set for SID ${sid}.`);
             playerArray[0].active = '1'; playerArray[1].active = '0';
             this.addEventToBoard(sid, "NOTICE", "0", `${playerArray[0].name} to move first (defaulted).`);
             if (playerArray[0].uid === boardSession.aiPlayerUid) this.scheduleBotMove(sid);
        }
    }
  }

  private scheduleBotMove(sid: string): void {
    const boardSession = this.mockBoardSessions.get(sid);
    if (!boardSession || boardSession.gameStatus !== 'ACTIVE' || boardSession.isBotTurnInProgress || !boardSession.aiPlayerUid) {
      if (boardSession) boardSession.isBotTurnInProgress = false; 
      return;
    }
    const botPlayerInfo = boardSession.players.get(boardSession.aiPlayerUid);
    if (!botPlayerInfo || botPlayerInfo.active !== '1') { 
      if (boardSession) boardSession.isBotTurnInProgress = false; 
      return;
    }

    boardSession.isBotTurnInProgress = true; 

    const existingTimeout = this.botMoveTimeoutId.get(sid);
    if (existingTimeout) clearTimeout(existingTimeout);

    const timeoutId = setTimeout(() => {
      const currentBoardSession = this.mockBoardSessions.get(sid);
      if (!currentBoardSession || currentBoardSession.gameStatus !== 'ACTIVE' || !currentBoardSession.aiPlayerUid) {
        if (currentBoardSession) currentBoardSession.isBotTurnInProgress = false;
        this.botMoveTimeoutId.delete(sid); 
        return;
      }
      const currentBotPlayerInfo = currentBoardSession.players.get(currentBoardSession.aiPlayerUid);
      if (!currentBotPlayerInfo || currentBotPlayerInfo.active !== '1') {
        currentBoardSession.isBotTurnInProgress = false;
        this.botMoveTimeoutId.delete(sid);
        return;
      }

      const emptyCells: {r: number, c: number}[] = [];
      for(let r = 0; r < currentBoardSession.boardSize; r++) {
        for(let c = 0; c < currentBoardSession.boardSize; c++) {
          if (currentBoardSession.boardMatrixForMockAi[r][c] === '0') { 
            emptyCells.push({r, c});
          }
        }
      }

      if (emptyCells.length > 0) {
        const randomMove = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        const botPlace = currentBoardSession.playerPlaces.get(currentBoardSession.aiPlayerUid!);
        const botPiece = botPlace === '1' ? '1' : botPlace === '2' ? '2' : 'E'; 

        if (botPiece !== 'E') {
            currentBoardSession.boardMatrixForMockAi[randomMove.r][randomMove.c] = botPiece;
            this.syncBoardMatrixToGameData(sid);
            this.addEventToBoard(sid, "MOVE", currentBoardSession.aiPlayerUid!, `${randomMove.r}-${randomMove.c}`);
            this.addEventToBoard(sid, "NOTICE", "0", `${MOCK_BOT_NAME} (Bot) made a move to ${randomMove.r}-${randomMove.c}`);

            currentBotPlayerInfo.active = '0';
            const humanPlayerInfo = currentBoardSession.humanPlayerUid ? currentBoardSession.players.get(currentBoardSession.humanPlayerUid) : undefined;
            if (humanPlayerInfo) humanPlayerInfo.active = '1';

            if (emptyCells.length - 1 === 0) { 
                currentBoardSession.gameStatus = 'FINISHED';
                this.addEventToBoard(sid, "NOTICE", "0", "Game ended (board full - mock).");
                currentBoardSession.players.forEach(p => p.finished = '1'); 
            }
        } else {
            if (DEBUG) console.error(`Mock Bot Error: Bot piece could not be determined. Bot place: ${botPlace}`);
            this.addEventToBoard(sid, "NOTICE", "0", `${MOCK_BOT_NAME} (Bot) had an issue determining its piece.`);
        }

      } else {
         this.addEventToBoard(sid, "NOTICE", "0", "Board is full. Game Over (mock).");
         currentBoardSession.gameStatus = 'FINISHED';
         currentBoardSession.players.forEach(p => p.finished = '1');
      }

      currentBoardSession.isBotTurnInProgress = false; 
      this.botMoveTimeoutId.delete(sid); 
    }, 1000 + Math.random() * 1000) as unknown as number; 
    this.botMoveTimeoutId.set(sid, timeoutId);
  }

  public async registerUser(params: Omit<IgUserRegistrationParams, 'networkuid'>): Promise<IgApiResponse> {
    await new Promise(resolve => setTimeout(resolve, 300)); 

    const { name, password, email } = params;

    if (!name || name.trim() === '') {
      return { error: true, message: "Nickname is required." } as IgUserRegistrationError;
    }
    if (this.usernameToUid.has(name)) {
      return { error: true, message: "DUPLICATE_NICK" } as IgUserRegistrationError;
    }
    if (email && this.emailToUid.has(email)) {
      return { error: true, message: "DUPLICATE_EMAIL" } as IgUserRegistrationError;
    }
    if (!password) {
        return { error: true, message: "Password is required." } as IgUserRegistrationError;
    }

    const uid = this.generateUid();
    const hashedPassword = this.hashPassword(password);

    const newUser: StoredMockUser = {
      ...params, 
      uid,
      hashedPassword,
      name, 
      email,
    };
    this.users.set(uid, newUser);
    this.usernameToUid.set(name, uid);
    if (email) {
      this.emailToUid.set(email, uid);
    }

    const newProfile: IgUserProfileData = {
        name, email, realName: params.realName, sex: params.sex,
        birthDay: params.birthDay, birthMonth: params.birthMonth, birthYear: params.birthYear,
        country: params.country, location: params.location, about: params.about,
        subscribeNews: params.subscribeNews, showEmail: params.showEmail, showBirthday: params.showBirthday,
        registrationTime: Math.floor(Date.now() / 1000),
        lastAliveTime: Math.floor(Date.now() / 1000), 
        isFastReg: '0', 
        error: false, 
    };
    this.profiles.set(uid, newProfile);

    return {
      uid, name, hashedPassword, error: false, 
    } as IgUserRegistrationSuccessResponse;
  }

  public async loginUser(params: Omit<IgUserLoginParams, 'networkuid' | 'md5'>): Promise<IgApiResponse> {
    await new Promise(resolve => setTimeout(resolve, 300)); 

    const { login, password } = params;
    let user: StoredMockUser | undefined;
    let uid: string | undefined;

    if (this.usernameToUid.has(login)) {
      uid = this.usernameToUid.get(login);
    } else if (this.emailToUid.has(login)) {
      uid = this.emailToUid.get(login);
    }

    if (uid) {
      user = this.users.get(uid);
    }

    if (!user || user.hashedPassword !== this.hashPassword(password)) {
      return { error: true, message: "Invalid login credentials." } as IgUserRegistrationError; 
    }

    const sessionId = `mock_session_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const sessionExpiry = Date.now() + (365 * 24 * 60 * 60 * 1000); 

    this.users.set(user.uid, { ...user, sessionId, sessionExpiry });

    return {
      uid: user.uid, name: user.name!, session_id: sessionId, error: false,
    } as IgUserLoginSuccessResponse;
  }

  public async getUserProfile(params: IgUserProfileParams): Promise<IgUserProfileData | IgUserRegistrationError> {
    await new Promise(resolve => setTimeout(resolve, 300)); 

    const profile = this.profiles.get(params.uid);
    const user = this.users.get(params.uid); 

    if (!profile || !user) {
      return { error: true, message: "User not found." };
    }

    const hasValidSession = params.session_id && user.sessionId === params.session_id && (user.sessionExpiry || 0) > Date.now();
    const profileToSend: IgUserProfileData = { ...profile, error: false };

    if (!hasValidSession) {
      delete profileToSend.email;
      delete profileToSend.subscribeNews; 
      if (profileToSend.showBirthday !== '1') {
          delete profileToSend.birthDay;
          delete profileToSend.birthMonth;
          delete profileToSend.birthYear;
      }
    }
    profileToSend.curtime = Math.floor(Date.now() / 1000);
    profileToSend.lastAliveTime = Math.floor(Date.now() / 1000); 
    profileToSend.idleTimeSec = 0; 

    if (params.stat === '1') { 
        // Mock some stats for the requested user if they are the bot or a specific test user
        if (params.uid === MOCK_BOT_UID) {
            profileToSend.gameStat = [{ gid: HEX_GID, score: 1650, numGames: 10, numWin: 6, numLoss: 3, numDraw: 1, numQuit: 0 }];
        } else if (params.uid.startsWith("mock_uid_")) { // Example for other mock users
             profileToSend.gameStat = [{ gid: HEX_GID, score: 1500 + Math.floor(Math.random()*100), numGames: 5 + Math.floor(Math.random()*5), numWin: 2, numLoss: 2, numDraw: 1, numQuit: 0 }];
        }
     }
    if (params.log === '1') {
        if (params.uid === MOCK_BOT_UID || params.uid.startsWith("mock_uid_")) {
            profileToSend.gameLog = [
                { gid: HEX_GID, createTime: Math.floor(Date.now()/1000) - 86400, durationMin: 15, players: [
                    { uid: params.uid, name: profileToSend.name || "Player", stat: 'WIN', scoreOld: (profileToSend.gameStat?.[0]?.score || 1500) -8, scoreNew: profileToSend.gameStat?.[0]?.score || 1500 },
                    { uid: "opponent_mock_uid", name: "OpponentX", stat: 'LOST', scoreOld: 1450, scoreNew: 1442 }
                ]}
            ];
        }
     }
    return profileToSend;
  }

  public async updateUserProfile(params: IgUserUpdateParams): Promise<IgUserUpdateSuccessResponse | IgUserRegistrationError> {
    await new Promise(resolve => setTimeout(resolve, 300)); 

    const user = this.users.get(params.uid);
    const profile = this.profiles.get(params.uid);

    if (!user || !profile) return { error: true, message: "User not found." };

    if (user.sessionId !== params.session_id || (user.sessionExpiry || 0) <= Date.now()) {
      return { error: true, message: "Invalid or expired session." };
    }

    if (params.name && params.name !== user.name) {
      if (this.usernameToUid.has(params.name) && this.usernameToUid.get(params.name) !== params.uid) {
        return { error: true, message: "Nickname already taken." };
      }
      if (user.name) this.usernameToUid.delete(user.name); 
      this.usernameToUid.set(params.name, params.uid);    
      user.name = params.name;
    }
    if (params.email && params.email !== user.email) {
        if (this.emailToUid.has(params.email) && this.emailToUid.get(params.email) !== params.uid) {
          return { error: true, message: "Email already taken." };
        }
        if (user.email) this.emailToUid.delete(user.email); 
        this.emailToUid.set(params.email, params.uid);     
        user.email = params.email;
    }
    if (params.password) user.hashedPassword = this.hashPassword(params.password);

    this.users.set(params.uid, { ...user }); 

    const updatedProfile: IgUserProfileData = { ...profile };
    for (const key in params) {
      if (key !== 'uid' && key !== 'session_id' && key !== 'password' && Object.prototype.hasOwnProperty.call(params, key)) {
        (updatedProfile as any)[key] = (params as any)[key];
      }
    }
    this.profiles.set(params.uid, updatedProfile); 

    return { success: true, error: false };
  }

  public async joinRandomGame(params: IgJoinRandomGameParams): Promise<IgJoinRandomGameResponse> {
    await new Promise(resolve => setTimeout(resolve, 500)); 

    const user = this.users.get(params.uid);
    if (!user || user.sessionId !== params.session_id || (user.sessionExpiry || 0) <= Date.now()) {
      return { error: true, message: "SHOULD_BE_AUTH_ERROR" }; 
    }

    const sid = this.generateBoardSid(); 
    const server = 'gcMock'; 
    const boardSize = DEFAULT_BOARD_SIZE; 

    const initialBoardMatrix: string[][] = Array(boardSize).fill(null).map(() => Array(boardSize).fill('0'));

    this.mockBoardSessions.set(sid, {
        sid,
        ownerUid: params.uid, 
        ownerName: user.name || "Unknown Host",
        gameStatus: 'INIT',   
        players: new Map(),   
        guests: new Map(),
        events: [],
        lastEventIdCounter: 0,
        playerPlaces: new Map(),
        gameData: { board: initialBoardMatrix.flat().join('') },
        gameOptions: { private: '0', scored: '1', timerTotal: 300, timerInc: 0, boardSize: boardSize }, 
        boardMatrixForMockAi: initialBoardMatrix,
        boardSize,
        aiPlayerUid: null,       
        humanPlayerUid: params.uid, 
        isBotTurnInProgress: false,
    });
    this.addEventToBoard(sid, "NOTICE", "0", `Game session ${sid} created by ${user.name}. Waiting for players.`);
    
    const humanPlace = params.place || '1'; 
    const humanPlayerInfo: IgPlayerInfo = {
        uid: params.uid, name: user.name || "Player", sex: user.sex || '-', score: 1500,
        place: humanPlace, stat: PlayerStat.NONE, lastRefresh: Math.floor(Date.now() / 1000),
        online: '1', active: '0', finished: '0'
    };
    this.mockBoardSessions.get(sid)!.players.set(params.uid, humanPlayerInfo);
    this.mockBoardSessions.get(sid)!.playerPlaces.set(params.uid, humanPlace);
    this.addEventToBoard(sid, "JOIN", params.uid, user.name);
    this.addEventToBoard(sid, "PLACE", params.uid, humanPlace);

    this.scheduleBotAutoJoinIfApplicable(sid);

    return { sid, server, error: false } as IgJoinRandomGameSuccessResponse;
  }

  public async createBoardSession(params: IgCreateBoardParams): Promise<IgCreateBoardResponse> {
    await new Promise(resolve => setTimeout(resolve, 400)); 

    const user = this.users.get(params.uid);
    if (!user || user.sessionId !== params.session_id || (user.sessionExpiry || 0) <= Date.now()) {
      return { error: true, message: "Authentication failed. Please log in again." };
    }

    const sid = this.generateBoardSid();
    const server = 'gcMock'; 
    const boardSize = DEFAULT_BOARD_SIZE; 

    const initialBoardMatrix: string[][] = Array(boardSize).fill(null).map(() => Array(boardSize).fill('0'));
    const isPrivateGame = params.private === '1';

    this.mockBoardSessions.set(sid, {
      sid,
      ownerUid: params.uid,
      ownerName: user.name || "Unknown Host",
      gameStatus: 'INIT', 
      players: new Map(),
      guests: new Map(),
      events: [],
      lastEventIdCounter: 0,
      playerPlaces: new Map(),
      gameData: { board: initialBoardMatrix.flat().join('') },
      gameOptions: { 
            private: isPrivateGame ? '1' : '0', 
            scored: '1', 
            boardSize: boardSize, 
            timerTotal: 0, 
            timerInc: 0 
      },
      boardMatrixForMockAi: initialBoardMatrix,
      boardSize,
      aiPlayerUid: null,
      humanPlayerUid: params.uid, 
      isBotTurnInProgress: false,
    });
    
    this.addEventToBoard(sid, "NOTICE", "0", `Game session ${sid} created by ${user.name}. ${isPrivateGame ? '(Private)' : '(Public)'} Waiting for setup.`);
    
    const hostPlace = params.place || '1';
    const hostPlayerInfo: IgPlayerInfo = {
        uid: params.uid, name: user.name || "Host", sex: user.sex || '-', score: 1500, 
        place: hostPlace, stat: PlayerStat.NONE, lastRefresh: Math.floor(Date.now()/1000),
        online: '1', active: '0', finished: '0'
    };
    this.mockBoardSessions.get(sid)!.players.set(params.uid, hostPlayerInfo);
    this.mockBoardSessions.get(sid)!.playerPlaces.set(params.uid, hostPlace);
    this.addEventToBoard(sid, "JOIN", params.uid, user.name);
    this.addEventToBoard(sid, "PLACE", params.uid, hostPlace);


    this.scheduleBotAutoJoinIfApplicable(sid);

    return { sid, server, error: false } as IgCreateBoardSuccessResponse;
  }

  public async fetchLobby(params: IgLobbyApiParams): Promise<IgLobbyResponse> {
    await new Promise(resolve => setTimeout(resolve, 300)); 

    const user = this.users.get(params.uid);
    if (!user || user.sessionId !== params.session_id || (user.sessionExpiry || 0) <= Date.now()) {
        return { error: true, message: "Invalid session. Please log in again." };
    }

    const mockSessions: LobbyGameSession[] = [];

    this.mockBoardSessions.forEach(session => {
        if (session.gameStatus === 'INIT' && session.players.size < 2 && session.gameOptions?.private !== '1') {
            const members: LobbyGameSessionMember[] = [];
            session.players.forEach(p => members.push({ uid: p.uid, name: p.name, place: p.place, stat: p.stat }));
            session.guests.forEach(g => members.push({ uid: g.uid, name: g.name, place: "0", stat: PlayerStat.NONE }));

            mockSessions.push({
                sid: session.sid,
                server: 'gcMock',
                state: session.gameStatus,
                ownerUid: session.ownerUid,
                priv: session.gameOptions?.private,
                members: members,
                gameName: "Hex", 
                numPlayers: members.filter(m => m.place !== "0").length,
                maxPlayers: 2,
            });
        }
    });
    
    if (mockSessions.length < 3) { 
        const numToAdd = 3 - mockSessions.length;
        for (let i = 0; i < numToAdd ; i++) {
            const randomSid = `mock_lobby_sid_${i + 1000 + this.nextBoardSidCounter}`;
            const randomOwnerUid = `lobby_owner_${i + 1000}`;
            const randomOwnerName = `LobbyHost${i+101}`;
            const members: LobbyGameSessionMember[] = [{
              uid: randomOwnerUid, name: randomOwnerName, place: "1", stat: PlayerStat.NONE
            }];
            if (Math.random() < 0.3) { 
                members.push({ uid: `other_player_${i}`, name: `Other${i}`, place: Math.random() < 0.5 ? "2" : "0", stat: PlayerStat.NONE });
            }

            mockSessions.push({
                sid: randomSid,
                server: 'gcMock',
                state: 'INIT',
                ownerUid: randomOwnerUid,
                priv: Math.random() < 0.2 ? '1' : '0',
                members: members,
                gameName: "Hex",
                numPlayers: members.filter(m => m.place !== "0").length,
                maxPlayers: 2,
            });
        }
    }
    return { sessions: mockSessions, error: false } as IgLobbySuccessResponse;
  }

  public async handleGameCommand(params: IgCommandHandlerFullParams, serverUrl: string): Promise<IgCommandHandlerResponse> {
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200)); 

    const user = this.users.get(params.uid);
    if (!user || user.sessionId !== params.session_id || (user.sessionExpiry || 0) <= Date.now()) {
      return { error: true, message: "SHOULD_BE_AUTH_ERROR" };
    }

    let boardSession = this.mockBoardSessions.get(params.sid);

    if (!boardSession && params.cmd?.toUpperCase() === "JOIN" && params.fromLobby === 'true') {
        if (DEBUG) console.log(`Mock API: Board session ${params.sid} not found. Creating it for JOIN from lobby.`);
        
        let boardSizeNum = DEFAULT_BOARD_SIZE; 
        if (params.lobbyBoardSize) {
            const parsedSize = parseInt(params.lobbyBoardSize, 10);
            if (!isNaN(parsedSize) && parsedSize >=3 && parsedSize <=19) { 
                boardSizeNum = parsedSize;
            } else {
                if (DEBUG) console.warn(`Mock API: Invalid lobbyBoardSize '${params.lobbyBoardSize}' received. Defaulting to 11.`);
            }
        }
        
        const initialBoardMatrix: string[][] = Array(boardSizeNum).fill(null).map(() => Array(boardSizeNum).fill('0'));
        const newSessionOwnerName = params.lobbyOwnerName || "Lobby Game Host";
        const hostUid = (params.lobbyHostUid && this.users.has(params.lobbyHostUid)) ? params.lobbyHostUid : params.uid;


        const newBoardSessionData: MockBoardSessionData = {
            sid: params.sid,
            ownerUid: hostUid, 
            ownerName: this.users.get(hostUid)?.name || newSessionOwnerName,
            gameStatus: 'INIT', 
            players: new Map(),
            guests: new Map(),
            events: [],
            lastEventIdCounter: 0,
            playerPlaces: new Map(),
            gameData: { board: initialBoardMatrix.flat().join('') },
            gameOptions: { 
                private: params.lobbyHidden === '1' ? '1' : '0', 
                scored: (params.lobbyScored as '0' | '1') || '0',
                timerTotal: params.lobbyTimerTotal ? parseInt(params.lobbyTimerTotal, 10) : 0,
                timerInc: params.lobbyTimerInc ? parseInt(params.lobbyTimerInc, 10) : 0,
                boardSize: boardSizeNum, 
            },
            boardMatrixForMockAi: initialBoardMatrix,
            boardSize: boardSizeNum,
            aiPlayerUid: null, 
            humanPlayerUid: null, 
            isBotTurnInProgress: false,
        };
        this.mockBoardSessions.set(params.sid, newBoardSessionData);
        boardSession = newBoardSessionData; 
        this.addEventToBoard(params.sid, "NOTICE", "0", `Game session ${params.sid} (from lobby) created by ${newBoardSessionData.ownerName}.`);
        if (hostUid !== params.uid) {
            const hostUser = this.users.get(hostUid);
            if (hostUser) {
                const hostPlayerInfo: IgPlayerInfo = {
                    uid: hostUid, name: hostUser.name || "Host", sex: hostUser.sex || '-', score: 1500,
                    place: '1', stat: PlayerStat.NONE, lastRefresh: Math.floor(Date.now()/1000),
                    online: '1', active: '0', finished: '0'
                };
                boardSession.players.set(hostUid, hostPlayerInfo);
                boardSession.playerPlaces.set(hostUid, '1');
                this.addEventToBoard(params.sid, "JOIN", hostUid, hostUser.name);
                this.addEventToBoard(params.sid, "PLACE", hostUid, '1');
            }
        }
    }


    if (!boardSession) {
      return { error: true, message: "INVALID_BOARD_SESSION_ID" };
    }

    const requestingUserPlace = boardSession.playerPlaces.get(params.uid) || "0";

    switch (params.cmd?.toUpperCase()) {
      case "JOIN": {
        let place = params.place || "0"; 
        if (place === "0" && boardSession.players.size < 2) {
             if (!Array.from(boardSession.playerPlaces.values()).includes("1")) place = "1";
             else if (!Array.from(boardSession.playerPlaces.values()).includes("2")) place = "2";
        }

        if (boardSession.players.has(params.uid)) { 
             this.addEventToBoard(params.sid, "NOTICE", "0", `${user.name} is already in the game.`);
             break;
        }
        if (boardSession.players.size >= 2 && place !== "0") { 
             this.addEventToBoard(params.sid, "NOTICE", "0", `Game is full. ${user.name} cannot join as player.`);
             break;
        }
        
        boardSession.playerPlaces.set(params.uid, place);
        if (params.uid !== boardSession.aiPlayerUid && place !== "0") { 
            boardSession.humanPlayerUid = params.uid; 
        }

        if (place !== "0") { 
            const playerInfo: IgPlayerInfo = {
                uid: params.uid, name: user.name || "Unknown", sex: user.sex || '-', score: 1500, 
                place: place, stat: PlayerStat.NONE, lastRefresh: Math.floor(Date.now()/1000),
                online: '1', active: '0', finished: '0'
            };
            boardSession.players.set(params.uid, playerInfo);
        } else { 
            const guestInfo: IgGuestInfo = { uid: params.uid, name: user.name || "Unknown", score: 0 };
            boardSession.guests.set(params.uid, guestInfo);
        }
        this.addEventToBoard(params.sid, "JOIN", params.uid, user.name);
        if (place !== "0") this.addEventToBoard(params.sid, "PLACE", params.uid, place); 
        
        if (boardSession.gameStatus === 'INIT' && boardSession.players.size === 1 && !boardSession.aiPlayerUid) {
             this.scheduleBotAutoJoinIfApplicable(params.sid);
        } else if (boardSession.gameStatus === 'INIT' && boardSession.players.size === 2 && boardSession.aiPlayerUid) {
             this.scheduleBotAutoReadyUpIfApplicable(params.sid);
        }
        break;
      }
      case "SETUP": { 
        if (params.uid !== boardSession.ownerUid) {
            this.addEventToBoard(params.sid, "NOTICE", "0", `Only the host (${boardSession.ownerName}) can setup the game.`);
            break;
        }
        if (boardSession.gameStatus !== 'INIT') {
            this.addEventToBoard(params.sid, "NOTICE", "0", `Game options can only be set before the game starts.`);
            break;
        }
        
        const newBoardSize = params.boardSize ? parseInt(params.boardSize, 10) : boardSession.boardSize; 
        if (newBoardSize && (newBoardSize < 3 || newBoardSize > 19)) { 
            this.addEventToBoard(params.sid, "NOTICE", "0", `Invalid board size: ${newBoardSize}. Must be 3-19.`);
            break;
        }

        if (newBoardSize && newBoardSize !== boardSession.boardSize) {
            boardSession.boardSize = newBoardSize;
            boardSession.boardMatrixForMockAi = Array(newBoardSize).fill(null).map(() => Array(newBoardSize).fill('0'));
            if (boardSession.gameData) boardSession.gameData.board = boardSession.boardMatrixForMockAi.flat().join('');
            else boardSession.gameData = { board: boardSession.boardMatrixForMockAi.flat().join('') };
        }

        const newPrivateStatus = params.private !== undefined ? params.private as '0' | '1' : (boardSession.gameOptions?.private ?? '0');

        boardSession.gameOptions = {
            ...(boardSession.gameOptions || {}), 
            boardSize: newBoardSize || boardSession.boardSize,
            timerTotal: params.timerTotal ? parseInt(params.timerTotal, 10) : (boardSession.gameOptions?.timerTotal ?? 0), 
            timerInc: params.timerInc ? parseInt(params.timerInc, 10) : (boardSession.gameOptions?.timerInc ?? 0), 
            scored: (params.scored as '0' | '1') || boardSession.gameOptions?.scored || '0',
            private: newPrivateStatus,
        };
        this.addEventToBoard(params.sid, "OPTIONS", params.uid, JSON.stringify(boardSession.gameOptions)); 
        this.addEventToBoard(params.sid, "NOTICE", "0", `Game options updated by host ${user.name}.`);
        break;
      }
      case "REFRESH":
        if (boardSession.gameStatus === 'ACTIVE' && boardSession.aiPlayerUid && !boardSession.isBotTurnInProgress) {
            const botPlayer = boardSession.players.get(boardSession.aiPlayerUid);
            if (botPlayer && botPlayer.active === '1') { 
                if (!this.botMoveTimeoutId.has(params.sid)) {
                    this.addEventToBoard(params.sid, "NOTICE", "0", `${MOCK_BOT_NAME} (Bot) is thinking (triggered by refresh)...`);
                    this.scheduleBotMove(params.sid);
                }
            }
        } else if (boardSession.gameStatus === 'INIT' && boardSession.aiPlayerUid) {
             this.scheduleBotAutoReadyUpIfApplicable(params.sid);
        }
        break;
      case "MOVE":
        const moveData = params.move || ""; 
        const [rStr, cStr] = moveData.split('-');
        const r = parseInt(rStr, 10);
        const c = parseInt(cStr, 10);
        const movingPlayerInfo = boardSession.players.get(params.uid);

        if (movingPlayerInfo && movingPlayerInfo.active === '1' &&
            r >= 0 && r < boardSession.boardSize &&
            c >= 0 && c < boardSession.boardSize &&
            boardSession.boardMatrixForMockAi[r][c] === '0') { 

            const playerPiece = boardSession.playerPlaces.get(params.uid) === '1' ? '1' : '2';
            boardSession.boardMatrixForMockAi[r][c] = playerPiece;
            this.syncBoardMatrixToGameData(params.sid);
            this.addEventToBoard(params.sid, "MOVE", params.uid, moveData);
            this.addEventToBoard(params.sid, "NOTICE", "0", `${user.name} made a move to ${r}-${c}`);

            movingPlayerInfo.active = '0';
            if (boardSession.aiPlayerUid) {
                const botPlayer = boardSession.players.get(boardSession.aiPlayerUid);
                if (botPlayer) {
                    botPlayer.active = '1';
                    this.scheduleBotMove(params.sid); 
                }
            } else { 
                const otherPlayerUid = Array.from(boardSession.players.keys()).find(uid => uid !== params.uid);
                if (otherPlayerUid) {
                    const otherPlayer = boardSession.players.get(otherPlayerUid);
                    if (otherPlayer) otherPlayer.active = '1';
                }
            }
        } else {
            this.addEventToBoard(params.sid, "NOTICE", "0", `Invalid move attempt by ${user.name}.`);
        }
        break;
      case "MSG": 
        this.addEventToBoard(params.sid, "MSG", params.uid, params.message);
        break;
      case "PLACE": 
        const newPlace = params.place || "0";
        boardSession.playerPlaces.set(params.uid, newPlace);
        const playerToUpdate = boardSession.players.get(params.uid);
        if(playerToUpdate) playerToUpdate.place = newPlace;
        this.addEventToBoard(params.sid, "PLACE", params.uid, newPlace);
        break;
      case "START": 
        const playerOfferingStart = boardSession.players.get(params.uid);
        if(playerOfferingStart && playerOfferingStart.stat !== PlayerStat.OFFERSTART) {
            playerOfferingStart.stat = PlayerStat.OFFERSTART; 
            this.addEventToBoard(params.sid, "START", params.uid); // data="n/a" as per spec
            this.addEventToBoard(params.sid, "NOTICE", "0", `${playerOfferingStart.name} is ready!`);
            this.tryStartActiveGame(params.sid);
        } else if (playerOfferingStart && playerOfferingStart.stat === PlayerStat.OFFERSTART) {
            this.addEventToBoard(params.sid, "NOTICE", "0", `${playerOfferingStart.name} is already ready.`);
        }
        break;
       case "LEAVE": 
        const leavingPlayerName = boardSession.players.get(params.uid)?.name || user.name || "A player";
        boardSession.players.delete(params.uid);
        boardSession.guests.delete(params.uid);
        boardSession.playerPlaces.delete(params.uid);
        this.addEventToBoard(params.sid, "LEAVE", params.uid, leavingPlayerName);
        this.addEventToBoard(params.sid, "NOTICE", "0", `${leavingPlayerName} has left the game.`);

        if (boardSession.botAutoJoinTimeoutId) clearTimeout(boardSession.botAutoJoinTimeoutId);
        if (boardSession.botAutoReadyTimeoutId) clearTimeout(boardSession.botAutoReadyTimeoutId);
        delete boardSession.botAutoJoinTimeoutId;
        delete boardSession.botAutoReadyTimeoutId;

        const botMoveTimeout = this.botMoveTimeoutId.get(params.sid);
        if (botMoveTimeout) {
            clearTimeout(botMoveTimeout);
            this.botMoveTimeoutId.delete(params.sid);
        }
        boardSession.isBotTurnInProgress = false; 

        if (params.uid === boardSession.humanPlayerUid || boardSession.players.size < (boardSession.aiPlayerUid ? 1 : 2) ) {
            if(boardSession.players.size < 2){ 
                boardSession.gameStatus = 'FINISHED';
                this.addEventToBoard(params.sid, "NOTICE", "0", `Not enough players. Game ended.`);
                if (boardSession.aiPlayerUid && boardSession.players.has(boardSession.aiPlayerUid)) {
                    this.addEventToBoard(params.sid, "LEAVE", boardSession.aiPlayerUid, MOCK_BOT_NAME);
                    boardSession.players.delete(boardSession.aiPlayerUid);
                }
            }
        }
        if (boardSession.gameStatus === 'INIT' && boardSession.players.size === 1 && !boardSession.aiPlayerUid) {
            this.scheduleBotAutoJoinIfApplicable(params.sid);
        }
        break;
    case "UNDO":
        const undoType = params.type; 
        if (undoType === 'REQUEST') {
            const targetEid = params.target_eid;
            if (!targetEid) {
                this.addEventToBoard(params.sid, "NOTICE", "0", `Undo request from ${user.name} is missing target_eid.`);
                break;
            }
            this.addEventToBoard(params.sid, "UNDO", params.uid, JSON.stringify({ action: "REQUEST", by_uid: params.uid, by_name: user.name, target_eid: targetEid }));
            this.addEventToBoard(params.sid, "NOTICE", "0", `${user.name} has requested an undo for move EID ${targetEid}.`);
        } else if (undoType === 'ACCEPT') {
            this.addEventToBoard(params.sid, "UNDO", params.uid, JSON.stringify({ action: "ACCEPT", by_uid: params.uid, by_name: user.name }));
            this.addEventToBoard(params.sid, "NOTICE", "0", `${user.name} has accepted the undo request.`);
            
            if (boardSession.gameData && boardSession.gameData.board) {
                const boardStr = boardSession.gameData.board;
                let lastPieceIndex = -1;
                for(let i = boardStr.length -1; i >=0; i--) {
                    if(boardStr[i] === '1' || boardStr[i] === '2') {
                        lastPieceIndex = i;
                        break;
                    }
                }
                if (lastPieceIndex !== -1) {
                    const newBoardArr = boardStr.split('');
                    newBoardArr[lastPieceIndex] = '0';
                    boardSession.gameData.board = newBoardArr.join('');
                    this.syncGameDataToBoardMatrix(params.sid);
                }
                
                boardSession.players.forEach(p => p.active = (p.active === '1' ? '0' : '1'));
                const nowActivePlayer = Array.from(boardSession.players.values()).find(p=>p.active === '1');
                if (nowActivePlayer) this.addEventToBoard(params.sid, "NOTICE", "0", `Board state reverted (mock). It's now ${nowActivePlayer.name}'s turn.`);

            }

        } else if (undoType === 'DENY') {
            this.addEventToBoard(params.sid, "UNDO", params.uid, JSON.stringify({ action: "DENY", by_uid: params.uid, by_name: user.name }));
            this.addEventToBoard(params.sid, "NOTICE", "0", `${user.name} has denied the undo request.`);
        }
        break;

      default:
        if (DEBUG) console.warn(`Mock API: Unhandled command '${params.cmd}' for SID ${params.sid}`);
    }

    const sessionInfo: IgSessionInfo = {
      cmd: params.cmd || "REFRESH", 
      curtime: Math.floor(Date.now() / 1000),
      status: boardSession.gameStatus,
      owner: boardSession.ownerUid,
    };
    
    if (boardSession.gameStatus === 'ACTIVE') {
        const activePlayer = Array.from(boardSession.players.values()).find(p => p.active === '1');
        if (activePlayer) sessionInfo.activePlayer = activePlayer.uid;
    }


    const memberInfo: IgMemberInfo = {
      active: boardSession.players.get(params.uid)?.active || '0', 
      finished: boardSession.players.get(params.uid)?.finished || '0', 
      place: requestingUserPlace, 
    };

    const playerList = Array.from(boardSession.players.values());
    const guestList = Array.from(boardSession.guests.values());
    const lastEidNum = params.lasteid ? parseInt(params.lasteid, 10) : 0;
    const eventList = boardSession.events.filter(event => parseInt(event.eid, 10) > lastEidNum);

    return {
      sessionInfo,
      memberInfo,
      playerList: playerList.length > 0 ? playerList : undefined,
      guestList: guestList.length > 0 ? guestList : undefined,
      eventList: eventList.length > 0 ? eventList : undefined,
      gameData: boardSession.gameData,
      gameOptions: boardSession.gameOptions,
      elapsed: Math.random() * 0.1, 
      error: false,
    } as IgCommandHandlerSuccessResponse;
  }
}
