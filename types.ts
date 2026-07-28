/**
 * @file types.ts
 * @description Defines shared TypeScript types and enums used throughout the Hex game application.
 * This includes core game concepts like Player sides, Cell states, Board representation, Game phases,
 * and detailed structures for game history, completed game entries, player profiles, and timer settings.
 */

import { ALLOWED_INCREMENT_SECONDS } from "./Constants"; // Import for AllowedIncrementSecondsType
import { AuthResult } from "./contexts/AuthManager"; // Import AuthResult type for AuthContextType

/**
 * @enum Player
 * @description Represents the two opposing sides or "colors" on the Hex board.
 * Player.ONE typically connects horizontally (e.g., Left to Right).
 * Player.TWO typically connects vertically (e.g., Top to Bottom).
 * It's important to note that these represent board *sides*, not fixed player identities,
 * as the actual player controlling a side can change due to the swap rule or initial randomization.
 */
export enum Player {
  ONE = 1, // Represents the first side/color (e.g., aims for Left-Right connection)
  TWO = 2, // Represents the second side/color (e.g., aims for Top-Bottom connection)
}

/**
 * @type CellState
 * @description Represents the state of a single cell on the Hex board.
 * It can be occupied by Player.ONE, Player.TWO, or be null (empty).
 */
export type CellState = Player | null;

/**
 * @type BoardMatrix
 * @description A 2D array representing the Hex game board.
 * Each element in the array is a `CellState`, indicating if the cell is empty or occupied by a player.
 * The outer array represents rows, and the inner array represents columns within each row.
 */
export type BoardMatrix = CellState[][];

/**
 * @enum GamePhase
 * @description Defines the different phases a game can be in.
 * - WAITING_ROOM: Online game created, players joining/getting ready.
 * - PLAYING: The game is currently active, and players can make moves.
 * - GAME_OVER: The game has concluded (either a win, draw, or other termination).
 * - REPLAY: A completed game is currently being replayed.
 */
export enum GamePhase {
  WAITING_ROOM = 'WAITING_ROOM', // Added for online game waiting state
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
  REPLAY = 'REPLAY',
}

/**
 * @type Coordinate
 * @description Represents a 2D coordinate on the game board, with 'r' for row and 'c' for column.
 * Both row and column indices are typically 0-based.
 */
export type Coordinate = {
  r: number; // Row index
  c: number; // Column index
};

/**
 * @type ThemeMode
 * @description Defines the possible theme settings for the application's appearance.
 * - 'light': Forces light mode.
 * - 'dark': Forces dark mode.
 * - 'system': Uses the operating system's preferred theme setting.
 */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * @type TimerMode
 * @description Defines the modes for the game timer.
 * - 'off': No timer is used.
 * - 'perTurn': Each player has a fixed amount of time for each move.
 * - 'perGame': Each player has a total time bank for the entire game.
 */
export type TimerMode = 'off' | 'perTurn' | 'perGame';

/**
 * @type AllowedIncrementSecondsType
 * @description Union type for allowed increment seconds values.
 * Derived from ALLOWED_INCREMENT_SECONDS in Constants.ts.
 */
export type AllowedIncrementSecondsType = typeof ALLOWED_INCREMENT_SECONDS[number];


/**
 * @interface TimerSettings
 * @description Configuration for the game timer.
 */
export interface TimerSettings {
  /** @property mode - The active timer mode ('off', 'perTurn', 'perGame'). */
  mode: TimerMode;
  /** @property durationPerTurn - Time limit in seconds for each turn if mode is 'perTurn'. */
  durationPerTurn: number;
  /** @property durationPerGame - Total time limit in seconds per player for the game if mode is 'perGame'. */
  durationPerGame: number;
  /** @property incrementSeconds - Optional time increment in seconds added to a player's game time after each move, if mode is 'perGame' (primarily for online play). Must be one of the AllowedIncrementSecondsType values. */
  incrementSeconds?: AllowedIncrementSecondsType;
}

/**
 * @enum WinReason
 * @description The reason why a game ended, particularly if it was a win.
 * - CONNECTION: A player successfully connected their sides of the board.
 * - TIMEOUT: A player ran out of time (either per turn or per game).
 * - FORFEIT: A player forfeited or quit the game.
 * - CLAIMED: A player claimed victory due to opponent disconnection/timeout.
 */
export enum WinReason {
  CONNECTION = 'connection',
  TIMEOUT = 'timeout',
  FORFEIT = 'forfeit',
  CLAIMED = 'claimed',
}

/**
 * @interface PlayerProfile
 * @description Represents a player's configurable profile.
 */
export interface PlayerProfile {
  /** @property name - The player's display name. */
  name: string;
  /** @property color - The player's chosen color as a hex string (e.g., "#RRGGBB"). */
  color: string;
}

/**
 * @interface FirstGameMoveDetails
 * @description Stores information about the very first move made in a game.
 * This is crucial for implementing the swap rule.
 */
export interface FirstGameMoveDetails {
  /** @property coord - The coordinate (row, column) of the first move. */
  coord: Coordinate;
  /** @property player - The Player side (Player.ONE or Player.TWO) that made this first move. */
  player: Player;
}

/**
 * @interface HistoryEntry
 * @description Represents a single snapshot of the game state stored in the game's history.
 * Used for undo functionality and for replaying completed games.
 */
export interface HistoryEntry {
  /** @property boardMatrix - The state of the board at this point in history. */
  boardMatrix: BoardMatrix;
  /** @property currentPlayer - The Player side (ONE or TWO) whose turn it *was* just before this state, or *is* in this state. */
  currentPlayer: Player;
  /** @property turnCount - The total number of moves made up to this point. */
  turnCount: number;
  /** @property firstGameMove - Details of the first move, if it occurred by this state. Null otherwise. */
  firstGameMove: FirstGameMoveDetails | null;
  /** @property isPlayerRolesSwapped - True if player roles (assignment of configured profiles to board sides) were swapped due to the swap rule by this point. */
  isPlayerRolesSwapped: boolean;
  /** @property currentTurnTimeLeft - Time remaining for the current turn (if 'perTurn' timer), in seconds. Null otherwise. */
  currentTurnTimeLeft: number | null;
  /** @property playerGameTimeLeft - Time remaining for each player side (if 'perGame' timer), in seconds. Null otherwise. */
  playerGameTimeLeft: { [key in Player]?: number } | null;
  /** @property winningPath - If this state resulted in a win, this holds the coordinates of the winning path. Null otherwise. */
  winningPath: Coordinate[] | null;
}

/**
 * @interface CompletedGameEntry
 * @description Represents all the data associated with a game that has finished.
 * This includes game settings, player profiles involved, final outcome, and the full move history.
 * Used for storing and replaying past games.
 */
export interface CompletedGameEntry {
  /** @property id - A unique identifier for this completed game entry. */
  id: string;
  /** @property timestamp - The Unix timestamp (milliseconds since epoch) when the game concluded. */
  timestamp: number;
  /** @property durationSeconds - The total duration of the game in seconds. */
  durationSeconds: number;
  /** @property settings - The game settings (board size, timer, swap rule) active for this game. */
  settings: {
    boardSize: number;
    timerSettings: TimerSettings; // Will include incrementSeconds if applicable
    swapRuleEnabled: boolean;
    // AI settings for the completed game, if P2 was AI
    player2ControlType?: PlayerControlType;
    aiDifficulty?: AiDifficulty;
  };
  /** @property player1Profile - The profile of the player configured as "Player 1" in settings for this game. */
  player1Profile: PlayerProfile;
  /** @property player2Profile - The profile of the player configured as "Player 2" in settings for this game. */
  player2Profile: PlayerProfile;
  /**
   * @property wasPlayer1ProfileAssignedToSideONE_atGameStart
   * @description Indicates if the `player1Profile` (from settings) was initially assigned to control the Player.ONE *side* of the board.
   * If false, `player1Profile` started on Player.TWO side, and `player2Profile` on Player.ONE side. This is key for interpreting roles.
   */
  wasPlayer1ProfileAssignedToSideONE_atGameStart: boolean;
  /** @property finalWinnerPlayerColor - The Player side (ONE or TWO) that won the game. Null if it was a draw or no winner. */
  finalWinnerPlayerColor: Player | null;
  /** @property winReason - The reason the game ended with a winner (e.g., 'connection', 'timeout'). Null if no winner or other reason. */
  winReason: WinReason | null;
  /** @property finalWinningPath - The coordinates forming the winning path at the end of the game. Null if no connection win. */
  finalWinningPath: Coordinate[] | null;
  /** @property wasPlayerRolesSwappedAtGameEnd - The state of `isPlayerRolesSwapped` at the game's conclusion. True if player roles were flipped from their initial assignment due to the swap rule. */
  wasPlayerRolesSwappedAtGameEnd: boolean;
  /** @property history - An array of `HistoryEntry` objects, representing the full sequence of states in the game. */
  history: HistoryEntry[];
}

/**
 * @interface ReplayState
 * @description Represents the state of the replay UI or service.
 * Note: This type seems to be a candidate for removal or integration into `ReplaySnapshot`
 * if it's not actively used or if its fields overlap significantly.
 * The primary state for replay visualization is handled by `ReplaySnapshot`.
 */
export interface ReplayState { // This type seems to be a candidate for removal or integration into ReplaySnapshot if not used elsewhere
  /** @property isActive - Whether the replay is currently auto-playing. */
  isActive: boolean;
  /** @property gameToReplay - The `CompletedGameEntry` being replayed, or null if none. */
  gameToReplay: CompletedGameEntry | null;
  /** @property currentStepIndex - The index of the current history step in the replay. */
  currentStepIndex: number;
  /** @property intervalId - ID of the timer interval for auto-playing replay steps. Null if not active. */
  intervalId: number | null;
}


/**
 * @enum AiDifficulty
 * @description Defines the difficulty levels for an AI opponent.
 */
export enum AiDifficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

/**
 * @enum PlayerControlType
 * @description Defines who controls a player slot.
 * - 'human': Controlled by a human player.
 * - 'ai': Controlled by an AI opponent.
 * - 'online': Controlled by an online opponent.
 */
export enum PlayerControlType {
  HUMAN = 'human',
  AI = 'ai',
  ONLINE = 'online',
}


// --- igGameCenter API Types ---

/**
 * @interface IgUserRegistrationParams
 * @description Parameters for registering a new user with igGameCenter.
 */
export interface IgUserRegistrationParams {
  name: string;          // Desired member's nickname (mandatory)
  password: string;      // Desired member's password (mandatory)
  email?: string;        // Member's email (optional)
  realName?: string;     // Member's real name (optional)
  sex?: 'M' | 'F' | '-'; // Member's sex (optional)
  birthDay?: string;     // Day of member's birth (optional, 1-31)
  birthMonth?: string;   // Month of member's birth (optional, 1-12)
  birthYear?: string;    // Year of member's birth (optional, 4 digits)
  country?: string;      // 2-letters country code (optional)
  location?: string;     // More details about member's location (optional)
  about?: string;        // Any text information (optional)
  subscribeNews?: '1' | '0'; // Subscribe to newsletter (optional, 1 for true)
  showEmail?: '1' | '0';     // Show email on public profile (optional, 1 for true)
  showBirthday?: '1' | '0';  // Show birthday on public profile (optional, 1 for true)
  networkuid?: string;   // Unique device/site/social network ID (optional, max 64 symbols)
}

/**
 * @interface IgUserRegistrationSuccessResponse
 * @description Structure of a successful user registration response from igGameCenter.
 */
export interface IgUserRegistrationSuccessResponse {
  uid: string;
  name: string;
  hashedPassword?: string;
  error?: false;
}

/**
 * @interface IgUserLoginParams
 * @description Parameters for logging in a user with igGameCenter.
 */
export interface IgUserLoginParams {
  login: string; // Member's nickname or email
  password: string; // Member's password (plain-text or MD5 based on 'md5' flag)
  networkuid?: string; // Optional network UID
  md5?: '0' | '1'; // '1' if password is MD5 hashed, '0' or omitted for plaintext (server default)
}

/**
 * @interface IgUserLoginSuccessResponse
 * @description Structure of a successful user login response from igGameCenter.
 */
export interface IgUserLoginSuccessResponse {
  uid: string;
  name: string;
  session_id: string;
  error?: false;
}

/**
 * @interface IgUserRegistrationError
 * @description Structure of an error response from igGameCenter.
 */
export interface IgUserRegistrationError {
  error: true;
  message: string; // Error message from the API
  rawXmlResponse?: string; // Raw XML response text, if available
  httpStatusCode?: number; // HTTP status code, if available
  httpStatusText?: string; // HTTP status text, if available
}

/**
 * @type LoggedInUser
 * @description Information about the currently logged-in user.
 */
export interface LoggedInUser {
  uid: string;
  name: string;
  session_id: string; // Session ID from login
  expiryTimestamp: number; // Unix timestamp (ms) when the login should expire
}

/**
 * @interface IgUserProfileParams
 * @description Parameters for fetching a user's profile from igGameCenter.
 */
export interface IgUserProfileParams {
  uid: string;        // User ID whose profile is requested (mandatory)
  session_id?: string; // Optional, for accessing private fields like email, full birthday, newsletter status
  stat?: '0' | '1';    // Include game statistics (optional, 1 for true)
  log?: '0' | '1';     // Include game log (optional, 1 for true)
}

/**
 * @interface IgGameStatEntry
 * @description Represents a single game's statistics for a user.
 */
export interface IgGameStatEntry {
  gid: string;
  score: number;
  numGames: number;
  numWin: number;
  numLoss: number;
  numDraw: number;
  numQuit: number;
}

/**
 * @interface IgGameLogPlayer
 * @description Represents a player within a game log entry.
 */
export interface IgGameLogPlayer {
  uid: string;
  name: string;
  stat: 'WIN' | 'LOST' | 'DRAW' | 'QUIT';
  scoreOld: number;
  scoreNew: number;
}

/**
 * @interface IgGameLogEntry
 * @description Represents a single game log entry.
 */
export interface IgGameLogEntry {
  gid: string;
  createTime: number; // Unix timestamp
  durationMin: number;
  players: IgGameLogPlayer[];
}

/**
 * @interface IgUserProfileData
 * @description Structure for the parsed user profile data from igGameCenter.
 */
export interface IgUserProfileData {
  curtime?: number;
  isFastReg?: '0' | '1';
  name?: string;
  realName?: string;
  sex?: 'M' | 'F' | '-';
  birthDate?: string; // e.g., "9-1-1978" - full date only if session_id matches
  birthDay?: string; // Day (if full date not shown)
  birthMonth?: string; // Month (if full date not shown)
  birthYear?: string; // Year (if full date not shown)
  country?: string;
  location?: string;
  about?: string;
  registrationTime?: number; // Unix timestamp
  lastAliveTime?: number; // Unix timestamp
  idleTimeSec?: number;
  email?: string; // Only if session_id matches or user allows public
  subscribeNews?: '0' | '1'; // Only if session_id matches
  showEmail?: '0' | '1'; // Only if session_id matches
  showBirthday?: '0' | '1'; // Only if session_id matches
  gameStat?: IgGameStatEntry[];
  gameLog?: IgGameLogEntry[];
  error?: false; // Indicate success if present
}

/**
 * @interface IgUserUpdateParams
 * @description Parameters for updating a user's profile with igGameCenter.
 * All fields are optional except uid and session_id.
 */
export interface IgUserUpdateParams {
  uid: string;           // Mandatory
  session_id: string;    // Mandatory
  name?: string;
  password?: string;     // New password (plaintext, API service will hash if needed)
  email?: string;
  realName?: string;
  sex?: 'M' | 'F' | '-';
  birthDay?: string;
  birthMonth?: string;
  birthYear?: string;
  country?: string;
  location?: string;
  about?: string;
  subscribeNews?: '0' | '1';
  showEmail?: '0' | '1';
  showBirthday?: '0' | '1';
}

/**
 * @interface IgUserUpdateSuccessResponse
 * @description Structure for a successful profile update response.
 */
export interface IgUserUpdateSuccessResponse {
  success: true;
  error?: false;
}

/**
 * @interface IgJoinRandomGameParams
 * @description Parameters for joining a random game board.
 */
export interface IgJoinRandomGameParams {
  uid: string;        // Member's ID
  session_id: string; // Member's session ID
  gid: string;        // Game ID to play
  place?: '1' | '2';  // Optional desired place (1st or 2nd player)
  fromLobby?: 'true'; // Custom parameter if joining from lobby
  lobbyBoardSize?: string;
  lobbyScored?: '0' | '1';
  lobbyTimerTotal?: string;
  lobbyTimerInc?: string;
  lobbyOwnerName?: string;
  lobbyHostUid?: string; // Custom mock param for lobby join
  lobbyHidden?: '0' | '1'; // Custom mock param
}

/**
 * @interface IgJoinRandomGameSuccessResponse
 * @description Structure of a successful response when joining a random game board.
 */
export interface IgJoinRandomGameSuccessResponse {
  sid: string;   // Unique session ID for the new board
  server: string; // Subdomain prefix of the server handling this board
  error?: false;
}

/**
 * @type IgJoinRandomGameResponse
 * @description Union type for the join random game API response.
 */
export type IgJoinRandomGameResponse = IgJoinRandomGameSuccessResponse | IgUserRegistrationError;

// --- Game Handler API Types ---

/**
 * @interface IgCommandHandlerParamsBase
 * @description Base parameters common to all api_handler.php requests.
 */
export interface IgCommandHandlerParamsBase {
  app_id: string;
  app_code: string;
  uid: string;
  session_id: string; // User's login session ID
  sid: string;        // Board session ID
}

/**
 * @interface IgCommandHandlerFullParams
 * @description Full parameters for api_handler.php, including command and specific params.
 * This is used as the input type for the `handleGameCommand` method.
 */
export interface IgCommandHandlerFullParams extends IgCommandHandlerParamsBase {
  cmd: string;             // The command to execute (e.g., "JOIN", "MOVE", "REMATCH")
  lasteid?: string;        // ID of the last event received in a previous call
  // Allows for additional command-specific parameters like 'place', 'move', 'message', 'type' for REMATCH/UNDO, 'move_ind' for UNDO
  [key: string]: string | undefined;
}

/**
 * @enum UndoEventAction
 * @description Specific actions for an UNDO event's data.
 */
export enum UndoEventAction {
  REQUEST = 'REQUEST',   // An undo has been requested (maps to 'ASK' for sending)
  ACCEPT = 'ACCEPT',     // An undo request has been accepted
  DENY = 'DENY',       // An undo request has been denied
  // FORBID, DONE are also types seen in Java, but might be server-to-client notifications
}

/**
 * @interface UndoEventData
 * @description Structured data for an `UNDO` type `IgGameEvent`.
 */
export interface UndoEventData {
  action: UndoEventAction | 'ASK' | 'DONE' | 'FORBID'; // Include raw types from server if they differ
  by_uid: string;           // UID of the player who initiated the action (requested, accepted, denied)
  by_name: string;          // Name of the player who initiated the action
  target_eid?: string;      // EID of the move being requested to undo (present for REQUEST action, or if server uses it)
  move_ind?: string;        // Move index for undo request (if server uses this)
}

/**
 * @interface RematchEventData
 * @description Structured data for REMATCH type events.
 */
export interface RematchEventData {
  action: 'OFFER' | 'ACCEPT' | 'DECLINE' | 'STARTING' | 'CANCEL' | 'ACCEPTED' | 'CANCELLED' | 'DECLINED'; // Matches TS definition for event processing
  by_uid: string;       // UID of the player initiating the action
  by_name: string;      // Name of the player
  new_sid?: string;     // New session ID if rematch is accepted and results in a new game session
  new_server?: string;  // New server if rematch results in a new game session on potentially different server
}


/**
 * @interface IgGameEvent
 * @description Structure for a single game event from the `eventList`.
 */
export interface IgGameEvent {
  eid: string;        // Unique ID of the event
  stamp: number;      // Unix timestamp of the server time
  uid: string;        // ID of the member who sent this event (0 for notice)
  // Updated type string to include REMATCH events, and also server-specific ones like UNDOASK, UNDODONE
  type: string;       // Type of the event (e.g., "JOIN", "MOVE", "MSG", "OPTIONS", "START", "ACTIVE", "UNDO", "QUIT", "REMATCH", "NEWSID_FOR_REMATCH", "REMATCH_OFFER", "REMATCH_ACCEPTED", "REMATCH_DECLINED", "REMATCH_CANCELLED", "UNDOASK", "UNDODONE")
  data?: string;      // Data associated with the event. For "UNDO", JSON string of UndoEventData. For "REMATCH", JSON string of RematchEventData.
}

/**
 * @enum PlayerStat
 * @description Player's state in the game, as received from the server.
 */
export enum PlayerStat {
  NONE = "NONE",
  OFFERSTART = "OFFERSTART", // Player has indicated they are ready
  OFFERDRAW = "OFFERDRAW",
  OFFERREMATCH = "OFFERREMATCH", // Player has offered a rematch
  DRAW = "DRAW",
  WIN = "WIN",
  LOST = "LOST",
  QUIT = "QUIT", // Player has quit/forfeited the game
  PLAYING = "PLAYING", // Often implied if not otherwise stated, or specific to some games
}

/**
 * @interface IgPlayerInfo
 * @description Information about a player in the `playerList` from `api_handler.php`.
 */
export interface IgPlayerInfo {
  uid: string;
  name: string;
  sex: 'M' | 'F' | '-';
  score: number;
  place: string; // Player's place/side on the board (e.g., "1", "2", or "0" for unseated/spectator)
  stat: PlayerStat;
  lastRefresh: number; // Unix timestamp
  timerLeft?: number;  // Optional: Number of seconds left
  online: '0' | '1';
  active: '0' | '1';   // 1 if it's this player's turn
  finished: '0' | '1'; // 1 if this player has finished the game
}

/**
 * @interface IgGuestInfo
 * @description Information about a guest in the `guestList` from `api_handler.php`.
 */
export interface IgGuestInfo {
  uid: string;
  name: string;
  score: number;
}

/**
 * @interface IgSessionInfo
 * @description Information about the current game session from `<sessionInfo>` in `api_handler.php`.
 */
export interface IgSessionInfo {
  cmd: string;        // Command that was sent with the request
  curtime: number;    // Unix timestamp of current server time
  status: 'INIT' | 'ACTIVE' | 'FINISHED'; // Status of the board
  owner: string;      // UID of the member who opened the board
  activePlayer?: string; // Optional: UID of the currently active player (server might provide this)
}

/**
 * @interface IgMemberInfo
 * @description Information about the currently connected member from `<memberInfo>` in `api_handler.php`.
 */
export interface IgMemberInfo {
  active: '0' | '1';   // 1 if it's this member's turn
  finished: '0' | '1'; // 1 if this member has finished the game
  place: string;       // 0 for guest, otherwise player's place/side
}

/**
 * @interface IgHandlerGameData
 * @description Placeholder for game-specific data from `<gameData>` in `api_handler.php`.
 * Content varies by game. For Hex, this might include the board string.
 */
export interface IgHandlerGameData {
  board?: string; // Example: "w20000w500w7w800...100b70000b60000b2"
  wCaptured?: string; // Example for games with captures
  bCaptured?: string; // Example for games with captures
  [key: string]: any; // Allow other game-specific properties
}

/**
 * @interface IgHandlerGameOptions
 * @description Common game options from `<gameOptions>` in `api_handler.php`.
 * These are the game options *as set on the server* for an online game.
 */
export interface IgHandlerGameOptions {
  private?: '0' | '1'; // Server uses 'private' for privacy status (e.g., created game)
  scored?: '0' | '1'; // 'rated' in some contexts
  timerTotal?: number; // In seconds
  timerInc?: number;   // In seconds
  boardSize?: number; // For Hex, board size from server
  // ... any other game-specific options the server might send.
  [key: string]: any; // Allow other game-specific options
}

/**
 * @interface IgCommandHandlerSuccessResponse
 * @description Structure of a successful response from `api_handler.php`.
 */
export interface IgCommandHandlerSuccessResponse {
  sessionInfo: IgSessionInfo;
  memberInfo: IgMemberInfo;
  playerList?: IgPlayerInfo[]; // Optional as it might not always be present
  guestList?: IgGuestInfo[];   // Optional
  eventList?: IgGameEvent[];   // Optional, list of new events since lasteid
  gameData?: IgHandlerGameData; // Optional, if game state changed
  gameOptions?: IgHandlerGameOptions; // Optional, if game options changed
  elapsed?: number;            // Optional, e.g., 0.056 (server processing time)
  error?: false; // Explicitly set to false for success differentiation
}

/**
 * @type IgCommandHandlerResponse
 * @description Union type for the `api_handler.php` response, can be success or an error.
 */
export type IgCommandHandlerResponse = IgCommandHandlerSuccessResponse | IgUserRegistrationError;


// --- Lobby API Types (Updated to align with Java's api_board_list.php parsing) ---

/**
 * @interface LobbyGameSessionMember
 * @description Represents a member (player or spectator) within a game session listed in the lobby.
 * Based on Java's XMLHandler parsing of `<member>` inside `<session>` from `api_board_list.php`.
 */
export interface LobbyGameSessionMember {
  place: string; // Player's place/slot (e.g., "1", "2", or "0" for spectator/unseated)
  uid: string;   // User ID of the member
  name: string;  // Name of the member
  stat: PlayerStat; // Status of the member in that game (e.g., OFFERSTART, NONE)
}

/**
 * @interface LobbyGameSession
 * @description Represents a single game session entry retrieved from the game lobby (`api_board_list.php`).
 * Aligned with Java's XMLHandler parsing of `<session>` attributes and nested `<member>` elements.
 * Does NOT include detailed game settings like boardSize, timer specifics, as those are not in api_board_list.php.
 */
export interface LobbyGameSession {
  sid: string;          // Unique session ID of the game board (from <session> 'sid' attribute)
  state: string;        // Current state of the game session, e.g., "INIT", "ACTIVE" (from <session> 'stat' attribute)
  ownerUid: string;     // UID of the user who created/owns the game (from <session> 'uid' attribute)
  server: string;       // Subdomain prefix of the game server (e.g., "gc1") (from <session> 'serv' attribute)
  priv?: '0' | '1';     // Privacy status: '0' for public, '1' for private (from <session> 'priv' attribute)
  members: LobbyGameSessionMember[]; // List of members (players/spectators) in the session
  // The following are often derived client-side or were from the older /api_lobby.php structure:
  gameName?: string;     // e.g., "Hex" (Can be hardcoded client-side if only one game type)
  numPlayers?: number;   // Can be derived from `members.filter(m => m.place !== '0').length`
  maxPlayers?: number;   // Typically fixed for the game type (e.g., 2 for Hex)
}


/**
 * @interface IgLobbyApiParams
 * @description Parameters for fetching the game lobby list from `api_board_list.php`.
 * (Previously was for api_lobby.php, endpoint changed to align with Java)
 */
export interface IgLobbyApiParams {
  uid: string;        // User's unique ID
  session_id: string; // User's current login session ID
  gid: string;        // Game ID for which to fetch the lobby (e.g., "12" for Hex)
  // Other optional filters might be supported by the API (e.g., filter by board size, timer settings)
}

/**
 * @interface IgLobbySuccessResponse
 * @description Structure of a successful response from `api_board_list.php`.
 */
export interface IgLobbySuccessResponse {
  sessions: LobbyGameSession[]; // An array of game session objects
  error?: false; // Explicitly false for success
}

/**
 * @type IgLobbyResponse
 * @description Union type for the `api_board_list.php` response. Can be a success or an error.
 */
export type IgLobbyResponse = IgLobbySuccessResponse | IgUserRegistrationError;


/**
 * @interface IgCreateBoardParams
 * @description Parameters for creating a new game board via `api_board_create.php`.
 */
export interface IgCreateBoardParams {
  uid: string;
  session_id: string;
  gid: string; // Game ID for Hex
  place?: '1' | '2'; // Optional desired starting place for the host
  private?: '0' | '1'; // Optional: '0' for public, '1' for private/hidden.
  // Potentially other creation-time params like 'password' if supported directly by create
}

/**
 * @interface IgCreateBoardSuccessResponse
 * @description Structure of a successful response from `api_board_create.php`.
 */
export interface IgCreateBoardSuccessResponse {
  sid: string;   // Unique session ID for the new board
  server: string; // Subdomain prefix of the server handling this board (e.g., "gc1")
  error?: false;
}

/**
 * @type IgCreateBoardResponse
 * @description Union type for the create board API response.
 */
export type IgCreateBoardResponse = IgCreateBoardSuccessResponse | IgUserRegistrationError;


/**
 * @type IgApiResponse
 * @description Union type for all igGameCenter API responses.
 * Updated to include profile-related, join game, command handler, and lobby responses.
 */
export type IgApiResponse =
  | IgUserRegistrationSuccessResponse
  | IgUserLoginSuccessResponse
  | IgUserProfileData // Successful profile fetch
  | IgUserUpdateSuccessResponse // Successful profile update
  | IgJoinRandomGameSuccessResponse // Successful join game
  | IgCreateBoardSuccessResponse // Successful create board
  | IgCommandHandlerResponse // Game handler command response (which itself is a union)
  | IgLobbyResponse // Lobby API response
  | IgUserRegistrationError; // Generic error structure for all API calls


/**
 * @const SYSTEM_SENDER_UID
 * @description Special UID used for system-generated chat messages.
 */
export const SYSTEM_SENDER_UID = 'system_hex_game_000';

// --- Chat Message Type ---
/**
 * @interface ChatMessage
 * @description Represents a single chat message in an online game.
 */
export interface ChatMessage {
  /** @property id - Unique identifier for the message (e.g., server event ID or local temporary ID). */
  id: string;
  /** @property localId - Optional temporary local ID used before server confirmation. */
  localId?: string;
  /** @property senderUid - The UID of the user who sent the message, or SYSTEM_SENDER_UID for system messages. */
  senderUid: string | typeof SYSTEM_SENDER_UID;
  /** @property senderName - The display name of the sender. */
  senderName: string;
  /** @property text - The content of the chat message. */
  text: string;
  /** @property initialTimestamp - Unix timestamp (seconds) when the message was first created by the client (local send) or received by client (remote message). Used for sorting. */
  initialTimestamp: number;
  /** @property serverTimestamp - Unix timestamp (seconds) from the server. Updated upon confirmation for local messages. Used for display. */
  serverTimestamp: number;
  /** @property isLocalPlayer - True if this message was sent by the currently logged-in local player. */
  isLocalPlayer: boolean;
  /** @property status - Optional status of the message: 'sending', 'sent', 'failed'. Not applicable for system messages. */
  status?: 'sending' | 'sent' | 'failed';
}

// --- Waiting Room Specific Types ---

/**
 * @interface WaitingRoomPlayer
 * @description Information about a player specifically for the waiting room UI.
 * Derived from IgPlayerInfo but might be simplified or augmented.
 */
export interface WaitingRoomPlayer extends IgPlayerInfo {
  // Add any additional UI-specific fields if needed
  isReady?: boolean; // Derived from stat === PlayerStat.OFFERSTART
}

/**
 * @interface WaitingRoomGameSetupParams
 * @description Parameters for the host to set up or modify game options in the waiting room
 * (sent via the SETUP command). Aligned with parameters Java's `editBoard` might send.
 * Uses `private` for consistency with server expectations on game privacy control.
 */
export interface WaitingRoomGameSetupParams {
  boardSize?: number;    // Game board dimension (N for NxN)
  timerTotal?: number;   // Total game time per player in seconds
  timerInc?: number;     // Increment per move in seconds
  scored?: '0' | '1';    // '1' if rated, '0' if unrated
  private?: '0' | '1';   // '1' if private, '0' if public (this 'private' is for sending SETUP command)
}

/**
 * @interface WaitingRoomStateData
 * @description Holds all relevant data for the waiting room, typically fetched via REFRESH.
 */
export interface WaitingRoomStateData {
  sessionInfo: IgSessionInfo | null;
  playerList: WaitingRoomPlayer[] | null; // Use WaitingRoomPlayer for UI
  gameOptions: IgHandlerGameOptions | null; // Server-side game options (this should use 'private' if server sends that)
  isCurrentUserHost: boolean;
  isLoading: boolean; // Is data currently being fetched/updated?
  error: string | null; // Any error related to fetching/updating waiting room state
}

/**
 * @interface CustomGameSettings
 * @description Settings collected from the user when creating a custom online game.
 */
export interface CustomGameSettings {
  boardSize: number;
  timerMode: 'perGame' | 'off'; // Timer mode selection
  timerDurationSeconds: number; // Duration in seconds (used if mode is 'perGame')
  timerIncrementSeconds: AllowedIncrementSecondsType; // Increment in seconds (used if mode is 'perGame')
  isRated: boolean; // True if game is 'scored' (rated)
  isHidden: boolean; // True if game is 'hidden' (private) - This name is for UI, maps to 'private' for API.
}

// --- Online Undo Types ---
/**
 * @enum UndoRequestState
 * @description Represents the state of an online undo request process.
 */
export enum UndoRequestState {
  IDLE = 'IDLE',                                // No undo process active
  REQUEST_SENT = 'REQUEST_SENT',                // Local player has sent an undo request, awaiting opponent's response
  REQUEST_RECEIVED = 'REQUEST_RECEIVED',        // Opponent has requested an undo, local player needs to respond
  ACCEPTED_AWAITING_SERVER = 'ACCEPTED_AWAITING_SERVER', // Undo was accepted (by local or opponent), awaiting server state update
  DENIED = 'DENIED',                            // Undo request was denied (by local or opponent)
}

/**
 * @interface OpponentUndoRequestDetails
 * @description Details of an undo request received from an opponent.
 */
export interface OpponentUndoRequestDetails {
  targetEid: string;      // The EID of the move the opponent wants to undo (if available in event data)
  requestingPlayerUid: string;
  requestingPlayerName: string;
}

// --- Online Rematch Types ---
/**
 * @enum RematchOfferState
 * @description Represents the state of an online rematch offer process.
 */
export enum RematchOfferState {
  IDLE = 'IDLE',                         // No rematch process active
  OFFER_SENT = 'OFFER_SENT',             // Local player has offered a rematch, awaiting opponent's response
  OFFER_RECEIVED = 'OFFER_RECEIVED',     // Opponent has offered a rematch, local player needs to respond
  ACCEPTED_AWAITING_NEW_GAME = 'ACCEPTED_AWAITING_NEW_GAME', // Rematch accepted, waiting for server to initiate new game
  DECLINED_BY_OPPONENT = 'DECLINED_BY_OPPONENT', // Opponent declined the rematch offer sent by local player
  DECLINED_BY_LOCAL = 'DECLINED_BY_LOCAL',   // Local player declined opponent's rematch offer
  CANCELLED_BY_LOCAL = 'CANCELLED_BY_LOCAL', // Local player cancelled their sent offer
  CANCELLED_BY_OPPONENT = 'CANCELLED_BY_OPPONENT', // Opponent cancelled their offer (e.g., they left)
  ERROR = 'ERROR'                        // An error occurred during the rematch process
}

/**
 * @interface OpponentRematchOfferDetails
 * @description Details of a rematch offer received from an opponent.
 */
export interface OpponentRematchOfferDetails {
  offeringPlayerUid: string;
  offeringPlayerName: string;
}

// --- AuthContextType Definition ---
/**
 * Defines the shape of the authentication context provided to the application.
 * Components can consume this context to access authentication state and methods.
 */
export interface AuthContextType {
  loggedInUser: LoggedInUser | null;
  login: (params: Omit<IgUserLoginParams, 'networkuid' | 'md5'>) => Promise<AuthResult>;
  signup: (params: Omit<IgUserRegistrationParams, 'networkuid'>, password?: string) => Promise<AuthResult>;
  logout: () => void;
  updateProfile: (params: IgUserUpdateParams) => Promise<AuthResult>;
  isAuthLoading: boolean; // For login/signup type actions
  // --- Profile Caching ---
  /** Cached profile data for the currently logged-in user. Null if not fetched or user not logged in. */
  cachedUserProfile: IgUserProfileData | null;
  /** True if a profile fetch (typically for the modal) is in progress. */
  isProfileLoading: boolean;
  /**
   * Fetches the profile for the current loggedInUser.
   * Used by ProfileModal if cachedUserProfile is null or if a refresh is needed.
   * Returns the fetched profile data or an error.
   * @param forceRefresh Optional boolean to bypass cache and force a new API call.
   */
  fetchUserProfile: (forceRefresh?: boolean) => Promise<IgUserProfileData | IgUserRegistrationError | null>;
}


/**
 * @interface OnlinePlayContextType
 * @description Defines the shape of the context provided by `OnlinePlayManagerProvider`.
 * It exposes state and actions related to online gameplay, lobby, chat, and waiting room.
 */
export interface OnlinePlayContextType {
  onlineGameSessionId: string | null;
  onlineGameServer: string | null;
  isFindingOnlineGame: boolean;
  onlineGameStatusMessage: string | null;
  isOnlineActionLoading: boolean;
  findOnlineGame: () => Promise<void>;
  leaveOnlineGame: () => Promise<void>;
  setOnlineGameStatusMessage: React.Dispatch<React.SetStateAction<string | null>>;
  lobbyGames: LobbyGameSession[] | null;
  isFetchingLobby: boolean;
  lobbyError: string | null;
  fetchLobbyGames: () => Promise<void>;
  joinLobbyGame: (session: LobbyGameSession) => Promise<void>;
  chatMessages: ChatMessage[];
  sendChatMessage: (messageText: string) => Promise<void>;
  waitingRoomData: WaitingRoomStateData | null;
  isInWaitingRoom: boolean;
  selectPlayerPlace: (place: '1' | '2') => Promise<void>;
  unreadyPlayerSeat: () => Promise<void>; // New: For un-readying / leaving seat
  updateWaitingRoomGameSetup: (setupParams: WaitingRoomGameSetupParams) => Promise<void>;
  signalReadyToStart: () => Promise<void>;
  createOnlineGame: (settings: CustomGameSettings) => Promise<boolean>;
  // Online Undo
  undoRequestState: UndoRequestState;
  opponentUndoRequestDetails: OpponentUndoRequestDetails | null;
  requestOnlineUndo: () => Promise<void>;
  acceptOnlineUndo: () => Promise<void>;
  denyOnlineUndo: () => Promise<void>;
  canRequestOnlineUndo: boolean;
  isAwaitingUndoBoardReset: boolean;
  // Forfeit Game
  forfeitOnlineGame: () => Promise<void>;
  // Claim Opponent's Loss
  canClaimOpponentLoss: boolean;
  claimOpponentLoss: () => Promise<void>;
  opponentLastRefreshTime: number | null;
  opponentIsOnline: boolean | null;
  // Online Rematch
  rematchOfferState: RematchOfferState;
  opponentRematchOfferDetails: OpponentRematchOfferDetails | null;
  offerRematch: () => Promise<void>;
  acceptRematch: () => Promise<void>;
  declineRematch: () => Promise<void>;
  canOfferRematch: boolean;
  // Notification Permission
  notificationPermission: NotificationPermission;
  requestBrowserNotificationPermission: () => Promise<void>;
}
