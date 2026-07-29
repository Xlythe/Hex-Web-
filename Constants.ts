import { PlayerProfile, TimerSettings, TimerMode, PlayerControlType, AiDifficulty } from './types';

/**
 * @file Constants.ts
 * @description Defines global constants used throughout the Hex board game application.
 * This includes UI elements like color palettes, game logic defaults such as board size and timer settings,
 * and operational parameters like replay speed.
 */

/**
 * @const DEBUG
 * @description If true, the application will use mock APIs and services instead of live ones.
 * Development builds use the deterministic mock by default. Production builds
 * use the live API unless VITE_USE_MOCK_API=true is explicitly configured.
 */
export const DEBUG = import.meta.env.VITE_USE_MOCK_API === 'true'
  || (import.meta.env.DEV && import.meta.env.VITE_USE_REAL_API !== 'true');

/**
 * @const COLOR_PALETTE
 * @description A curated list of hex color codes available for player profile customization.
 * Used in the settings modal to allow players to choose their representative colors.
 * The order might influence default selections if not explicitly handled elsewhere.
 */
export const COLOR_PALETTE = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#22c55e', // Green
  '#eab308', // Yellow
  '#a855f7', // Purple
  '#f97316', // Orange
  '#ec4899', // Pink
] as const;

/**
 * @type ColorPaletteType
 * @description A TypeScript utility type derived from `COLOR_PALETTE`.
 * Ensures that any variable assigned a color from the palette is type-safe
 * and restricted to the defined set of colors.
 */
export type ColorPaletteType = typeof COLOR_PALETTE[number];

// --- Default Player Profiles ---
/**
 * @const DEFAULT_PLAYER_1_PROFILE_BASE
 * @description The default base profile for Player 1.
 * Used as a fallback if no profile is loaded from storage or during initial setup.
 */
export const DEFAULT_PLAYER_1_PROFILE_BASE: PlayerProfile = { name: "Player 1", color: COLOR_PALETTE[0] };

/**
 * @const DEFAULT_PLAYER_2_PROFILE_BASE
 * @description The default base profile for Player 2.
 * Used as a fallback, ensuring a distinct default color from Player 1.
 */
export const DEFAULT_PLAYER_2_PROFILE_BASE: PlayerProfile = { name: "Player 2", color: COLOR_PALETTE[1] };

// --- Timer Configuration ---
/**
 * @const DEFAULT_TIMER_SETTINGS
 * @description Defines the initial state of timer settings for a new game or when settings are reset.
 * Includes the mode (off, perTurn, perGame) and default durations.
 */
export const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  mode: 'off' as TimerMode,
  durationPerTurn: 30, // Default seconds per turn if 'perTurn' mode is active
  durationPerGame: 300, // Default seconds per game per player if 'perGame' mode is active
  incrementSeconds: 0, // Default increment per move if 'perGame' mode is active (primarily for online)
};

/**
 * @const MIN_TIMER_DURATION_PER_TURN
 * @description The minimum allowed duration (in seconds) for the 'per turn' timer setting.
 * Used for input validation in the settings modal.
 */
export const MIN_TIMER_DURATION_PER_TURN = 5;

/**
 * @const MAX_TIMER_DURATION_PER_TURN
 * @description The maximum allowed duration (in seconds) for the 'per turn' timer setting.
 */
export const MAX_TIMER_DURATION_PER_TURN = 300;

/**
 * @const MIN_TIMER_DURATION_PER_GAME
 * @description The minimum allowed duration (in seconds) for the 'per game' timer setting.
 */
export const MIN_TIMER_DURATION_PER_GAME = 60;

/**
 * @const MAX_TIMER_DURATION_PER_GAME
 * @description The maximum allowed duration (in seconds) for the 'per game' timer setting.
 */
export const MAX_TIMER_DURATION_PER_GAME = 7200; // Increased to accommodate 120 minutes

// --- Online Timer Specific Constants ---
/**
 * @const ALLOWED_ONLINE_GAME_DURATIONS_MINUTES
 * @description Array of allowed game durations in minutes for online play.
 */
export const ALLOWED_ONLINE_GAME_DURATIONS_MINUTES = [2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120] as const;

/**
 * @const ALLOWED_ONLINE_GAME_DURATIONS_SECONDS
 * @description Array of allowed game durations in seconds for online play.
 */
export const ALLOWED_ONLINE_GAME_DURATIONS_SECONDS = ALLOWED_ONLINE_GAME_DURATIONS_MINUTES.map(m => m * 60);

/**
 * @const DEFAULT_ONLINE_GAME_DURATION_SECONDS
 * @description Default game duration in seconds for online games (1 hour).
 */
export const DEFAULT_ONLINE_GAME_DURATION_SECONDS = 3600;

/**
 * @const ALLOWED_INCREMENT_SECONDS
 * @description Array of allowed increment values in seconds for online per-game timers.
 */
export const ALLOWED_INCREMENT_SECONDS = [0, 5, 10, 15, 20, 30, 45, 60] as const;
export type AllowedIncrementSecondsType = typeof ALLOWED_INCREMENT_SECONDS[number];


/**
 * @const DEFAULT_ONLINE_TIMER_INCREMENT_SECONDS
 * @description Default increment in seconds for online per-game timers.
 */
export const DEFAULT_ONLINE_TIMER_INCREMENT_SECONDS: AllowedIncrementSecondsType = 60;


// --- Board Configuration ---
/**
 * @const DEFAULT_BOARD_SIZE
 * @description The default dimension (N for an N x N grid) for the Hex board.
 * Used when the game is first loaded or settings are reset.
 */
export const DEFAULT_BOARD_SIZE = 11;

/**
 * @const MIN_BOARD_SIZE
 * @description The minimum allowed dimension for the Hex board.
 * Used for input validation in settings and board creation.
 */
export const MIN_BOARD_SIZE = 3;

/**
 * @const MAX_BOARD_SIZE
 * @description The maximum allowed dimension for the Hex board.
 * Influences performance and UI scalability.
 */
export const MAX_BOARD_SIZE = 19;

/**
 * @const ALLOWED_ONLINE_SIZES
 * @description An array of board sizes permitted for online play.
 */
export const ALLOWED_ONLINE_SIZES = [8, 9, 10, 11, 12, 13, 14, 15, 19] as const;

/**
 * @const DEFAULT_ONLINE_BOARD_SIZE
 * @description Default board size for online games if current selection is invalid.
 * Must be one of the ALLOWED_ONLINE_SIZES.
 */
export const DEFAULT_ONLINE_BOARD_SIZE = 11;


// --- Game Rules ---
/**
 * @const DEFAULT_SWAP_RULE_ENABLED
 * @description The default state for the "swap rule" (also known as the "pie rule").
 * If true, the second player has the option to swap positions after the first player's opening move.
 */
export const DEFAULT_SWAP_RULE_ENABLED = true;

// --- Replay Settings ---
/**
 * @const REPLAY_STEP_DELAY_MS
 * @description The delay in milliseconds between each step (move) during game replay.
 * Controls the speed of the automated replay visualization.
 */
export const REPLAY_STEP_DELAY_MS = 750;

// --- AI Settings ---
/**
 * @const AI_NAME
 * @description The default display name for the AI opponent.
 */
export const AI_NAME = "HexAI";

/**
 * @const ONLINE_OPPONENT_NAME
 * @description The default display name for an online opponent.
 */
export const ONLINE_OPPONENT_NAME = "Online Opponent";

/**
 * @const DEFAULT_PLAYER_2_CONTROL_TYPE
 * @description The default control type for Player 2 (Human, AI, or Online).
 */
export const DEFAULT_PLAYER_2_CONTROL_TYPE: PlayerControlType = PlayerControlType.AI;

/**
 * @const DEFAULT_AI_DIFFICULTY
 * @description The default difficulty level for the AI opponent.
 */
export const DEFAULT_AI_DIFFICULTY: AiDifficulty = AiDifficulty.HARD;

/**
 * @const NETWORK_UID_STORAGE_KEY
 * @description The localStorage key used to store the generated network UID.
 */
export const NETWORK_UID_STORAGE_KEY = 'hexNetworkUid';

/**
 * @const LOGGED_IN_USER_STORAGE_KEY
 * @description The localStorage key used to store the logged-in user's data.
 */
export const LOGGED_IN_USER_STORAGE_KEY = 'hexLoggedInUser';

/**
 * @const MUSIC_ENABLED_STORAGE_KEY
 * @description The localStorage key used to store the user's music preference (enabled/disabled).
 */
export const MUSIC_ENABLED_STORAGE_KEY = 'hexGameMusicEnabledV1';

/**
 * @const CHAT_NOTIFICATIONS_ENABLED_STORAGE_KEY
 * @description The localStorage key used to store the user's preference for chat notifications.
 */
export const CHAT_NOTIFICATIONS_ENABLED_STORAGE_KEY = 'hexGameChatNotificationsEnabledV1';

/**
 * @const DEFAULT_CHAT_NOTIFICATIONS_ENABLED
 * @description Default state for enabling chat notifications.
 */
export const DEFAULT_CHAT_NOTIFICATIONS_ENABLED = true;


/**
 * @const CLICK_SOUND_URL
 * @description URL for the tile placement sound effect.
 */
export const CLICK_SOUND_URL = 'https://storage.cloud.google.com/hex-game-assets/hex_clink.mp3';


/**
 * @const ONE_YEAR_MS
 * @description One year in milliseconds, for login persistence.
 */
export const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * @const HEX_GID
 * @description The Game ID for Hex on igGameCenter.
 */
export const HEX_GID = '12';

/**
 * @const MOCK_BOT_UID
 * @description UID for the mock AI bot opponent.
 */
export const MOCK_BOT_UID = "mock_bot_player_001";

/**
 * @const MOCK_BOT_NAME
 * @description Name for the mock AI bot opponent.
 */
export const MOCK_BOT_NAME = "Hex Bot Alpha";

/**
 * @const DEFAULT_ONLINE_RATED_STATUS
 * @description Default 'scored' status for online games ('1' for rated, '0' for unrated).
 */
export const DEFAULT_ONLINE_RATED_STATUS: '0' | '1' = '1';

/**
 * @const DEFAULT_ONLINE_HIDDEN_STATUS
 * @description Default 'hidden' status for online games ('1' for private, '0' for public).
 */
export const DEFAULT_ONLINE_HIDDEN_STATUS: '0' | '1' = '0';

/**
 * @const OPPONENT_ACTIVITY_TIMEOUT_SECONDS
 * @description The duration in seconds after which an opponent is considered inactive or disconnected,
 * allowing the local player to claim a win.
 */
export const OPPONENT_ACTIVITY_TIMEOUT_SECONDS = 300; // 5 minutes

/**
 * @const USER_PROFILE_CACHE_KEY
 * @description localStorage key for the cached user profile data.
 */
export const USER_PROFILE_CACHE_KEY = 'hexUserProfileCache';

/**
 * @const USER_PROFILE_CACHE_TIMESTAMP_KEY
 * @description localStorage key for the timestamp of the cached user profile data.
 */
export const USER_PROFILE_CACHE_TIMESTAMP_KEY = 'hexUserProfileCacheTimestamp';

/**
 * @const PROFILE_CACHE_MAX_AGE_MS
 * @description Maximum age of the profile cache in milliseconds before it's considered stale (15 minutes).
 */
export const PROFILE_CACHE_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * @const SYSTEM_SENDER_NAME
 * @description Display name for system-generated chat messages.
 */
export const SYSTEM_SENDER_NAME = 'System';
