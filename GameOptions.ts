import { PlayerProfile, TimerSettings, ThemeMode, TimerMode, PlayerControlType, AiDifficulty, AllowedIncrementSecondsType } from './types';
import {
  DEFAULT_BOARD_SIZE, MIN_BOARD_SIZE, MAX_BOARD_SIZE,
  DEFAULT_TIMER_SETTINGS, MIN_TIMER_DURATION_PER_TURN, MAX_TIMER_DURATION_PER_TURN,
  MIN_TIMER_DURATION_PER_GAME, MAX_TIMER_DURATION_PER_GAME,
  DEFAULT_SWAP_RULE_ENABLED,
  DEFAULT_PLAYER_1_PROFILE_BASE, DEFAULT_PLAYER_2_PROFILE_BASE, COLOR_PALETTE, ColorPaletteType,
  AI_NAME, ONLINE_OPPONENT_NAME, DEFAULT_PLAYER_2_CONTROL_TYPE, DEFAULT_AI_DIFFICULTY,
  ALLOWED_ONLINE_GAME_DURATIONS_SECONDS, ALLOWED_INCREMENT_SECONDS,
  DEFAULT_ONLINE_GAME_DURATION_SECONDS, DEFAULT_ONLINE_TIMER_INCREMENT_SECONDS,
  ALLOWED_ONLINE_GAME_DURATIONS_MINUTES, ALLOWED_ONLINE_SIZES, DEFAULT_ONLINE_BOARD_SIZE,
  DEFAULT_CHAT_NOTIFICATIONS_ENABLED, CHAT_NOTIFICATIONS_ENABLED_STORAGE_KEY
} from './Constants';

/**
 * @class GameOptions
 * @description Manages all user-configurable game settings, including board dimensions,
 * timer configurations, player profiles (names and colors), the swap rule, and UI theme.
 * It handles loading these settings from `localStorage`, saving them back,
 * validating proposed changes, and ensuring internal consistency (e.g., resolving profile conflicts).
 * This class serves as the central source of truth for game parameters.
 */
export class GameOptions {
  /**
   * @constructor
   * @description Initializes a new `GameOptions` instance.
   * Accepts optional parameters for initial settings; if not provided, it uses predefined defaults
   * from `Constants.ts`. Crucially, it immediately calls `validateAndCorrectProfiles`
   * to ensure that the initial player profiles are consistent and valid (e.g., distinct names and colors).
   * Also ensures timer settings are consistent with online play mode if applicable.
   * If player2ControlType is ONLINE, swapRuleEnabled is forced to true.
   *
   * @param {number} [boardSize=DEFAULT_BOARD_SIZE] - The N x N dimension of the game board.
   * @param {TimerSettings} [timerSettings=DEFAULT_TIMER_SETTINGS] - Configuration for game timers.
   * @param {boolean} [swapRuleEnabled=DEFAULT_SWAP_RULE_ENABLED] - Whether the swap rule is active.
   * @param {PlayerProfile} [player1Profile=DEFAULT_PLAYER_1_PROFILE_BASE] - Profile for Player 1.
   * @param {PlayerProfile} [player2Profile=DEFAULT_PLAYER_2_PROFILE_BASE] - Profile for Player 2.
   * @param {ThemeMode} [themeMode='system'] - The UI theme preference.
   * @param {string} [player2LocalName=DEFAULT_PLAYER_2_PROFILE_BASE.name] - Local name for Player 2.
   * @param {PlayerControlType} [player2ControlType=DEFAULT_PLAYER_2_CONTROL_TYPE] - Control type for Player 2.
   * @param {AiDifficulty} [aiDifficulty=DEFAULT_AI_DIFFICULTY] - Difficulty for AI if Player 2 is AI.
   * @param {boolean} [chatNotificationsEnabled=DEFAULT_CHAT_NOTIFICATIONS_ENABLED] - Whether chat notifications are enabled.
   */
  constructor(
    public boardSize: number = DEFAULT_BOARD_SIZE,
    public timerSettings: TimerSettings = { 
        ...DEFAULT_TIMER_SETTINGS, 
        incrementSeconds: DEFAULT_TIMER_SETTINGS.incrementSeconds ?? (0 as AllowedIncrementSecondsType) 
    },
    public swapRuleEnabled: boolean = DEFAULT_SWAP_RULE_ENABLED,
    public player1Profile: PlayerProfile = { ...DEFAULT_PLAYER_1_PROFILE_BASE },
    public player2Profile: PlayerProfile = { ...DEFAULT_PLAYER_2_PROFILE_BASE },
    public themeMode: ThemeMode = 'system',
    public player2LocalName: string = DEFAULT_PLAYER_2_PROFILE_BASE.name,
    public player2ControlType: PlayerControlType = DEFAULT_PLAYER_2_CONTROL_TYPE,
    public aiDifficulty: AiDifficulty = DEFAULT_AI_DIFFICULTY,
    public chatNotificationsEnabled: boolean = DEFAULT_CHAT_NOTIFICATIONS_ENABLED
  ) {
    if (this.player2ControlType === PlayerControlType.ONLINE) {
        this.swapRuleEnabled = true;
    }
    this.validateAndCorrectProfiles();
    this.ensureOnlineSettings();
  }

  /**
   * @private
   * @method validateAndCorrectProfiles
   * @description Ensures that player profiles are valid and consistent.
   * This method performs several checks and corrections:
   * 1. Trims player names and falls back to default names if they are empty or consist only of whitespace.
   * 2. If Player 2 is AI-controlled, sets Player 2's name to `AI_NAME`.
   * 3. If Player 2 is Online-controlled, sets Player 2's name to `ONLINE_OPPONENT_NAME`.
   * 4. Validates player colors against the `COLOR_PALETTE`; if a color is invalid, it falls back to the default color for that player.
   * 5. Ensures player names are distinct (if both human). If names are identical, it attempts to make Player 2's name unique.
   * 6. Ensures player colors are distinct. If colors are identical, Player 2's color is changed.
   * This method is called by the constructor and `updateAndSave` to maintain profile integrity.
   */
  private validateAndCorrectProfiles(): void {
    // Validate Player 1 Profile
    this.player1Profile.name = this.player1Profile.name?.trim();
    if (!this.player1Profile.name) {
        this.player1Profile.name = DEFAULT_PLAYER_1_PROFILE_BASE.name;
    }
    if (!COLOR_PALETTE.includes(this.player1Profile.color as ColorPaletteType)) {
        this.player1Profile.color = DEFAULT_PLAYER_1_PROFILE_BASE.color;
    }

    // Validate Player 2 Profile
    if (this.player2ControlType === PlayerControlType.AI) {
        this.player2Profile.name = AI_NAME;
    } else if (this.player2ControlType === PlayerControlType.ONLINE) {
        this.player2Profile.name = ONLINE_OPPONENT_NAME;
    } else { // PlayerControlType.HUMAN
        this.player2Profile.name = this.player2LocalName.trim();
        if (!this.player2Profile.name) {
            this.player2Profile.name = DEFAULT_PLAYER_2_PROFILE_BASE.name;
        }
    }
    if (!COLOR_PALETTE.includes(this.player2Profile.color as ColorPaletteType)) {
        this.player2Profile.color = DEFAULT_PLAYER_2_PROFILE_BASE.color;
    }
    
    // Ensure distinct names if both are human
    if (this.player2ControlType === PlayerControlType.HUMAN && this.player1Profile.name === this.player2Profile.name) {
        const baseP1Name = this.player1Profile.name;
        let newP2Name = `${baseP1Name} 2`; 

        if (newP2Name === baseP1Name || newP2Name === DEFAULT_PLAYER_1_PROFILE_BASE.name ) { 
            this.player2Profile.name = DEFAULT_PLAYER_2_PROFILE_BASE.name;
            if (this.player1Profile.name === this.player2Profile.name) { // Extremely unlikely edge case after above
                 this.player2Profile.name = "Player Guest"; 
            }
        } else {
            this.player2Profile.name = newP2Name;
        }
    }

    // Ensure distinct colors
    if (this.player1Profile.color === this.player2Profile.color) {
        const p1Color = this.player1Profile.color;
        let newP2Color = DEFAULT_PLAYER_2_PROFILE_BASE.color; 
        if (newP2Color === p1Color) { 
            newP2Color = COLOR_PALETTE.find(c => c !== p1Color) || COLOR_PALETTE[0]; 
        }
        this.player2Profile.color = newP2Color;
    }
  }

  /**
   * @private
   * @method ensureOnlineSettings
   * @description If Player 2 is Online, ensures timer and board size settings are compatible.
   * - "Per Turn" mode is disallowed and switched to "Per Game".
   * - "Per Game" duration and increment are set to valid online defaults if current values are not allowed.
   * - Board size is set to a valid online default if current value is not allowed.
   * - Swap rule is forced to true.
   */
  private ensureOnlineSettings(): void {
    if (this.player2ControlType === PlayerControlType.ONLINE) {
      this.swapRuleEnabled = true; // Enforce swap rule for online play

      if (this.timerSettings.mode === 'perTurn') {
        this.timerSettings.mode = 'perGame';
        this.timerSettings.durationPerGame = DEFAULT_ONLINE_GAME_DURATION_SECONDS;
        this.timerSettings.incrementSeconds = DEFAULT_ONLINE_TIMER_INCREMENT_SECONDS;
      } else if (this.timerSettings.mode === 'perGame') {
        if (!ALLOWED_ONLINE_GAME_DURATIONS_SECONDS.includes(this.timerSettings.durationPerGame)) {
          this.timerSettings.durationPerGame = DEFAULT_ONLINE_GAME_DURATION_SECONDS;
        }
        if (!ALLOWED_INCREMENT_SECONDS.includes(this.timerSettings.incrementSeconds ?? (0 as AllowedIncrementSecondsType))) {
          this.timerSettings.incrementSeconds = DEFAULT_ONLINE_TIMER_INCREMENT_SECONDS;
        }
      }
      // If mode is 'off', it's fine for online.
      
      if (!ALLOWED_ONLINE_SIZES.includes(this.boardSize as typeof ALLOWED_ONLINE_SIZES[number])) {
         this.boardSize = DEFAULT_ONLINE_BOARD_SIZE;
      }

    } else {
      // If not online, increment is typically not used or is 0 for Human vs Human unless explicitly set.
      // For AI, increment is 0.
      if (this.player2ControlType === PlayerControlType.AI) {
        this.timerSettings.incrementSeconds = 0 as AllowedIncrementSecondsType;
      } else if (this.player2ControlType === PlayerControlType.HUMAN) {
        // Keep user-set increment if it's valid, otherwise default to 0 for local human games.
        if (!ALLOWED_INCREMENT_SECONDS.includes(this.timerSettings.incrementSeconds ?? (0 as AllowedIncrementSecondsType))) {
            this.timerSettings.incrementSeconds = 0 as AllowedIncrementSecondsType;
        }
      }
    }
  }

  /**
   * @static
   * @method load
   * @description Loads game options from `localStorage`.
   * Includes loading AI and Online settings, and timer increments.
   *
   * @returns {GameOptions} A new `GameOptions` instance populated with loaded or default settings.
   */
  public static load(): GameOptions {
    const boardSizeStr = localStorage.getItem('hexGameLastBoardSize');
    const boardSize = boardSizeStr ? parseInt(boardSizeStr, 10) : DEFAULT_BOARD_SIZE;
    
    const timerSettingsStored = localStorage.getItem('hexGameTimerSettings');
    const swapRuleEnabledStored = localStorage.getItem('hexGameSwapRuleEnabled');
    const swapRuleEnabled = swapRuleEnabledStored !== null ? JSON.parse(swapRuleEnabledStored) : DEFAULT_SWAP_RULE_ENABLED;
    
    const themeMode = (localStorage.getItem('hexGameThemeMode') as ThemeMode | null) || 'system';

    const player2LocalName = (localStorage.getItem('hexPlayer2LocalName') as string | null) || DEFAULT_PLAYER_2_PROFILE_BASE.name;
    const player2ControlType = (localStorage.getItem('hexPlayer2ControlType') as PlayerControlType | null) || DEFAULT_PLAYER_2_CONTROL_TYPE;
    const aiDifficulty = (localStorage.getItem('hexAiDifficulty') as AiDifficulty | null) || DEFAULT_AI_DIFFICULTY;
    const chatNotificationsEnabledStored = localStorage.getItem(CHAT_NOTIFICATIONS_ENABLED_STORAGE_KEY);
    const chatNotificationsEnabled = chatNotificationsEnabledStored !== null ? JSON.parse(chatNotificationsEnabledStored) : DEFAULT_CHAT_NOTIFICATIONS_ENABLED;


    let p1Profile = { ...DEFAULT_PLAYER_1_PROFILE_BASE };
    const p1Stored = localStorage.getItem('hexPlayer1Profile');
    if (p1Stored) try { p1Profile = JSON.parse(p1Stored); } catch (e) { /* use default */ }

    let p2Profile = { ...DEFAULT_PLAYER_2_PROFILE_BASE };
    const p2Stored = localStorage.getItem('hexPlayer2Profile');
    if (p2Stored) try { p2Profile = JSON.parse(p2Stored); } catch (e) { /* use default */ }

    let loadedTimerSettings: TimerSettings = { 
        mode: DEFAULT_TIMER_SETTINGS.mode,
        durationPerTurn: DEFAULT_TIMER_SETTINGS.durationPerTurn,
        durationPerGame: DEFAULT_TIMER_SETTINGS.durationPerGame,
        incrementSeconds: DEFAULT_TIMER_SETTINGS.incrementSeconds ?? (0 as AllowedIncrementSecondsType)
    };

    if (timerSettingsStored) {
        try { 
            const parsedSettings = JSON.parse(timerSettingsStored);
            loadedTimerSettings.mode = ['off', 'perTurn', 'perGame'].includes(parsedSettings.mode) ? parsedSettings.mode : DEFAULT_TIMER_SETTINGS.mode;
            loadedTimerSettings.durationPerTurn = typeof parsedSettings.durationPerTurn === 'number' ? parsedSettings.durationPerTurn : DEFAULT_TIMER_SETTINGS.durationPerTurn;
            loadedTimerSettings.durationPerGame = typeof parsedSettings.durationPerGame === 'number' ? parsedSettings.durationPerGame : DEFAULT_TIMER_SETTINGS.durationPerGame;
            
            let loadedIncrement: AllowedIncrementSecondsType | undefined = undefined;
            if (typeof parsedSettings.incrementSeconds === 'number') {
                if (ALLOWED_INCREMENT_SECONDS.includes(parsedSettings.incrementSeconds as AllowedIncrementSecondsType)) {
                    loadedIncrement = parsedSettings.incrementSeconds as AllowedIncrementSecondsType;
                } else {
                    console.warn(`Loaded invalid incrementSeconds ${parsedSettings.incrementSeconds} from localStorage, using default.`);
                    loadedIncrement = DEFAULT_TIMER_SETTINGS.incrementSeconds ?? (0 as AllowedIncrementSecondsType);
                }
            } else {
                 loadedIncrement = DEFAULT_TIMER_SETTINGS.incrementSeconds ?? (0 as AllowedIncrementSecondsType);
            }
            loadedTimerSettings.incrementSeconds = loadedIncrement;

        } catch(e) { /* use default from above if parsing fails */ }
    }


    const options = new GameOptions(
        (isNaN(boardSize) || boardSize < MIN_BOARD_SIZE || boardSize > MAX_BOARD_SIZE) ? DEFAULT_BOARD_SIZE : boardSize,
        loadedTimerSettings,
        swapRuleEnabled,
        p1Profile,
        p2Profile,
        themeMode,
        player2LocalName,
        // Ensure loaded player2ControlType is valid
        Object.values(PlayerControlType).includes(player2ControlType) ? player2ControlType : DEFAULT_PLAYER_2_CONTROL_TYPE,
        aiDifficulty,
        chatNotificationsEnabled
    );
    // ensureOnlineSettings is called in constructor, so no need here again
    return options;
  }

  /**
   * @method save
   * @description Persists the current game options to `localStorage`.
   * Includes saving AI and Online settings, and timer increments.
   */
  public save(): void {
    localStorage.setItem('hexGameLastBoardSize', String(this.boardSize));
    localStorage.setItem('hexGameTimerSettings', JSON.stringify(this.timerSettings));
    localStorage.setItem('hexGameSwapRuleEnabled', JSON.stringify(this.swapRuleEnabled));
    localStorage.setItem('hexPlayer1Profile', JSON.stringify(this.player1Profile));
    localStorage.setItem('hexPlayer2Profile', JSON.stringify(this.player2Profile));
    localStorage.setItem('hexGameThemeMode', this.themeMode);
    localStorage.setItem('hexPlayer2LocalName', this.player2LocalName);
    localStorage.setItem('hexPlayer2ControlType', this.player2ControlType);
    if (this.player2ControlType === PlayerControlType.AI) {
      localStorage.setItem('hexAiDifficulty', this.aiDifficulty);
    } else {
      localStorage.removeItem('hexAiDifficulty'); // Remove if not AI
    }
    localStorage.setItem(CHAT_NOTIFICATIONS_ENABLED_STORAGE_KEY, JSON.stringify(this.chatNotificationsEnabled));
  }

  /**
   * @method validateSettings
   * @description Validates a set of proposed game settings.
   * Includes validation for AI/Online settings: Player 2 name is not validated if AI or Online.
   * Validates timer settings based on online mode.
   * Validates swap rule is enabled for online mode.
   *
   * @param {string} inputSize - Proposed board size as a string.
   * @param {TimerMode} timerMode - Proposed timer mode.
   * @param {string} durationPerTurnStr - Proposed duration per turn as a string.
   * @param {string} durationPerGameStr - Proposed duration per game as a string.
   * @param {string} incrementSecondsStr - Proposed increment per move as a string (for online per-game).
   * @param {string} p1Name - Proposed name for Player 1.
   * @param {string} p1Color - Proposed color for Player 1.
   * @param {string} p2Name - Proposed name for Player 2.
   * @param {string} p2Color - Proposed color for Player 2.
   * @param {PlayerControlType} p2ControlType - Proposed control type for Player 2.
   * @param {boolean} swapRuleEnabled - Proposed state of the swap rule.
   * @returns {string | null} A string containing concatenated error messages if validation fails, or `null` if valid.
   */
  public validateSettings(
    inputSize: string,
    timerMode: TimerMode,
    durationPerTurnStr: string,
    durationPerGameStr: string,
    incrementSecondsStr: string,
    p1Name: string,
    p1Color: string,
    p2Name: string,
    p2Color: string,
    p2ControlType: PlayerControlType,
    swapRuleEnabled: boolean 
  ): string | null {
    const errors: string[] = [];
    const newSizeNum = parseInt(inputSize, 10);

    if (p2ControlType === PlayerControlType.ONLINE) {
        if (!ALLOWED_ONLINE_SIZES.includes(newSizeNum as typeof ALLOWED_ONLINE_SIZES[number])) {
            errors.push(`Board size for Online play must be one of: ${ALLOWED_ONLINE_SIZES.join(', ')}.`);
        }
        if (!swapRuleEnabled) {
            errors.push("Swap Rule must be enabled for Online play.");
        }
    } else {
        if (isNaN(newSizeNum) || newSizeNum < MIN_BOARD_SIZE || newSizeNum > MAX_BOARD_SIZE) {
            errors.push(`Board size must be between ${MIN_BOARD_SIZE}-${MAX_BOARD_SIZE}.`);
        }
    }

    if (!p1Name.trim()) errors.push("Player 1 Name cannot be empty.");

    if (p2ControlType === PlayerControlType.HUMAN && !p2Name.trim()) {
        errors.push("Player 2 Name cannot be empty.");
    }
    if (p2ControlType === PlayerControlType.HUMAN && p1Name.trim() === p2Name.trim() && p1Name.trim() !== "") {
        errors.push("Player names must be different.");
    }

    if (p1Color === p2Color) errors.push("Player colors must be different.");
    if (!COLOR_PALETTE.includes(p1Color as ColorPaletteType)) errors.push("Player 1 color is invalid.");
    if (!COLOR_PALETTE.includes(p2Color as ColorPaletteType)) errors.push("Player 2 color is invalid.");

    const newDurationPerTurn = parseInt(durationPerTurnStr, 10);
    const newDurationPerGame = parseInt(durationPerGameStr, 10); 
    const newIncrementSeconds = parseInt(incrementSecondsStr, 10);

    if (p2ControlType === PlayerControlType.ONLINE) {
        if (timerMode === 'perTurn') {
            errors.push("Per Turn timer is not allowed for Online play. Select Per Game or Off.");
        } else if (timerMode === 'perGame') {
            const durationInSecondsForOnline = newDurationPerGame; 
            if (!ALLOWED_ONLINE_GAME_DURATIONS_SECONDS.includes(durationInSecondsForOnline)) {
                errors.push(`Invalid game duration for Online play. Allowed: ${ALLOWED_ONLINE_GAME_DURATIONS_MINUTES.join(', ')} minutes.`);
            }
            if (!ALLOWED_INCREMENT_SECONDS.includes(newIncrementSeconds as AllowedIncrementSecondsType)) {
                 errors.push(`Invalid increment for Online play. Allowed: ${ALLOWED_INCREMENT_SECONDS.join(', ')} seconds.`);
            }
        }
    } else if (p2ControlType === PlayerControlType.AI) {
        // For AI, timer is effectively off. No specific timer validation beyond mode being 'off' or values being parseable.
        // This is handled by hiding controls, but underlying values should still be somewhat valid if mode isn't 'off'.
        if (timerMode === 'perTurn' && (isNaN(newDurationPerTurn))) {
             errors.push(`Time per turn must be a valid number.`);
        } else if (timerMode === 'perGame' && isNaN(newDurationPerGame)) {
            errors.push(`Time per game must be a valid number.`);
        }
    } else { // Human (Not Online)
        if (timerMode === 'perTurn' && (isNaN(newDurationPerTurn) || newDurationPerTurn < MIN_TIMER_DURATION_PER_TURN || newDurationPerTurn > MAX_TIMER_DURATION_PER_TURN)) {
            // This check is using constants that might not align with dropdown values.
            // For dropdowns, simple existence in allowed values is enough.
            // However, keeping this for now as it's a stricter check.
            // If durationPerTurnStr comes from a dropdown of allowed values, this might be simplified.
             errors.push(`Time per turn must be between ${MIN_TIMER_DURATION_PER_TURN}s-${MAX_TIMER_DURATION_PER_TURN}s.`);
        } else if (timerMode === 'perGame') {
             // If using dropdown for Human perGame, ensure it's one of the allowed online values.
            if (!ALLOWED_ONLINE_GAME_DURATIONS_SECONDS.includes(newDurationPerGame)) {
                 errors.push(`Invalid game duration. Allowed: ${ALLOWED_ONLINE_GAME_DURATIONS_MINUTES.join(', ')} minutes.`);
            }
            // Also validate increment for Human vs Human perGame
            if (!ALLOWED_INCREMENT_SECONDS.includes(newIncrementSeconds as AllowedIncrementSecondsType)) {
                errors.push(`Invalid increment. Allowed: ${ALLOWED_INCREMENT_SECONDS.join(', ')} seconds.`);
            }
        }
    }
    return errors.length > 0 ? errors.join('\n') : null;
  }

  /**
   * @method updateAndSave
   * @description Updates the current `GameOptions` instance with new settings,
   * re-validates player profile consistency, saves the changes to `localStorage`,
   * and returns a *new* `GameOptions` instance reflecting these changes.
   * Includes handling for AI/Online settings, timer increments, and ensures swap rule for online.
   *
   * @param {number} newBoardSize - The new board size.
   * @param {TimerSettings} newTimerSettings - The new timer settings.
   * @param {boolean} newSwapRuleEnabled - The new state for the swap rule.
   * @param {PlayerProfile} newP1Profile - The new profile for Player 1.
   * @param {PlayerProfile} newP2Profile - The new profile for Player 2.
   * @param {ThemeMode} newThemeMode - The new theme mode.
   * @param {string} newPlayer2LocalName - The new name for Player 2.
   * @param {PlayerControlType} newPlayer2ControlType - The new control type for Player 2.
   * @param {AiDifficulty} newAiDifficulty - The new AI difficulty.
   * @param {boolean} newChatNotificationsEnabled - The new state for chat notifications.
   * @returns {GameOptions} A new `GameOptions` instance with the updated and saved settings.
   */
  public updateAndSave(
    newBoardSize: number,
    newTimerSettings: TimerSettings,
    newSwapRuleEnabled: boolean,
    newP1Profile: PlayerProfile,
    newP2Profile: PlayerProfile,
    newThemeMode: ThemeMode,
    newPlayer2LocalName: string,
    newPlayer2ControlType: PlayerControlType,
    newAiDifficulty: AiDifficulty,
    newChatNotificationsEnabled: boolean
  ): GameOptions {
    this.boardSize = newBoardSize;
    this.timerSettings = { 
        ...newTimerSettings, 
        incrementSeconds: newTimerSettings.incrementSeconds ?? (0 as AllowedIncrementSecondsType) 
    };
    
    this.player2LocalName = newPlayer2LocalName;
    this.player2ControlType = newPlayer2ControlType; // Set this before setting swap rule or profiles

    if (this.player2ControlType === PlayerControlType.ONLINE) {
        this.swapRuleEnabled = true; // Enforce swap rule for online
    } else {
        this.swapRuleEnabled = newSwapRuleEnabled;
    }

    this.player1Profile = newP1Profile;
    
    if (newPlayer2ControlType === PlayerControlType.AI) {
        this.player2Profile = { ...newP2Profile, name: AI_NAME };
    } else if (newPlayer2ControlType === PlayerControlType.ONLINE) {
        this.player2Profile = { ...newP2Profile, name: ONLINE_OPPONENT_NAME };
    } else { // HUMAN
        this.player2Profile = { ...newP2Profile, name: this.player2LocalName };
    }

    this.themeMode = newThemeMode;
    this.aiDifficulty = newAiDifficulty;
    this.chatNotificationsEnabled = newChatNotificationsEnabled;

    this.validateAndCorrectProfiles(); 
    this.ensureOnlineSettings(); // Ensure timer and board size settings are valid for the (potentially new) control type
    this.save();

    // Return a new instance reflecting the applied (and potentially corrected) settings
    return new GameOptions(
        this.boardSize, 
        {...this.timerSettings}, // Pass a copy
        this.swapRuleEnabled, 
        {...this.player1Profile}, // Pass a copy
        {...this.player2Profile}, // Pass a copy
        this.themeMode,
        this.player2LocalName,
        this.player2ControlType,
        this.aiDifficulty,
        this.chatNotificationsEnabled
    );
  }
}
