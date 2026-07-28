
// Basic test structure for GameOptions.ts
import { GameOptions } from './GameOptions';
import { 
    DEFAULT_BOARD_SIZE, DEFAULT_PLAYER_1_PROFILE_BASE, DEFAULT_PLAYER_2_PROFILE_BASE, 
    MIN_BOARD_SIZE, MAX_BOARD_SIZE, COLOR_PALETTE, DEFAULT_SWAP_RULE_ENABLED,
    AI_NAME, ONLINE_OPPONENT_NAME, DEFAULT_PLAYER_2_CONTROL_TYPE, DEFAULT_AI_DIFFICULTY,
    DEFAULT_TIMER_SETTINGS, MIN_TIMER_DURATION_PER_GAME, MAX_TIMER_DURATION_PER_GAME,
    ALLOWED_ONLINE_SIZES, DEFAULT_ONLINE_BOARD_SIZE,
    ALLOWED_ONLINE_GAME_DURATIONS_SECONDS, DEFAULT_ONLINE_GAME_DURATION_SECONDS,
    ALLOWED_INCREMENT_SECONDS, DEFAULT_ONLINE_TIMER_INCREMENT_SECONDS, ColorPaletteType,
    AllowedIncrementSecondsType, DEFAULT_CHAT_NOTIFICATIONS_ENABLED // Added this import
} from './Constants';
import { PlayerControlType, TimerMode, PlayerProfile, TimerSettings, AiDifficulty } from './types';

/**
 * @file GameOptions.test.ts
 * @description Unit tests for the `GameOptions` class.
 * These tests verify the correct behavior of game settings management, including:
 * - Initialization with default values.
 * - Resolution of conflicts in player profiles (names and colors).
 * - Handling of empty or invalid profile inputs.
 * - Loading settings from and saving settings to `localStorage`.
 * - Validation of proposed settings changes.
 * - Enforcement of online-specific rules (swap, timer, board size).
 * These tests run directly in the browser console.
 */
console.log('Running tests for GameOptions.ts');
let allTestsPassed = true;

// Helper function to create a clean GameOptions instance for certain tests
const createDefaultOptions = () => new GameOptions();

// --- Constructor & Initialization Tests ---
console.log('--- Testing Constructor & Initialization ---');
const defaultOptions = createDefaultOptions();
if (defaultOptions.boardSize !== DEFAULT_BOARD_SIZE) {
  console.error('Test FAILED: Constructor - Default boardSize is incorrect.');
  allTestsPassed = false;
} else {
  console.log('Test PASSED: Constructor - Default boardSize.');
}
if (defaultOptions.player1Profile.name !== DEFAULT_PLAYER_1_PROFILE_BASE.name || defaultOptions.player1Profile.color !== DEFAULT_PLAYER_1_PROFILE_BASE.color) {
  console.error('Test FAILED: Constructor - Default player1Profile is incorrect.');
  allTestsPassed = false;
} else {
  console.log('Test PASSED: Constructor - Default player1Profile.');
}
if (defaultOptions.player2ControlType === DEFAULT_PLAYER_2_CONTROL_TYPE && // Only check specific P2 name if it's default AI/Human
    (defaultOptions.player2Profile.name !== (DEFAULT_PLAYER_2_CONTROL_TYPE === PlayerControlType.AI ? AI_NAME : DEFAULT_PLAYER_2_PROFILE_BASE.name) || 
     defaultOptions.player2Profile.color !== DEFAULT_PLAYER_2_PROFILE_BASE.color)
   ) {
  console.error(`Test FAILED: Constructor - Default player2Profile name/color incorrect for type ${DEFAULT_PLAYER_2_CONTROL_TYPE}. Got name: ${defaultOptions.player2Profile.name}, color: ${defaultOptions.player2Profile.color}`);
  allTestsPassed = false;
} else {
  console.log(`Test PASSED: Constructor - Default player2Profile for type ${DEFAULT_PLAYER_2_CONTROL_TYPE}.`);
}
if (defaultOptions.aiDifficulty !== DEFAULT_AI_DIFFICULTY) {
    console.error('Test FAILED: Constructor - Default aiDifficulty is incorrect.');
    allTestsPassed = false;
} else {
    console.log('Test PASSED: Constructor - Default aiDifficulty.');
}


// --- validateAndCorrectProfiles Tests (tested via constructor) ---
console.log('--- Testing Profile Validation & Correction (via Constructor) ---');
// Player Profile Color Conflict Resolution
const p1InitialColorConflict = COLOR_PALETTE[0];
const conflictingColorOptions = new GameOptions(
  DEFAULT_BOARD_SIZE, undefined, undefined,
  { name: "P1", color: p1InitialColorConflict },
  { name: "P2", color: p1InitialColorConflict }, // Conflicting color
  'system',
  "P2", // player2LocalName
  PlayerControlType.HUMAN,
  DEFAULT_AI_DIFFICULTY
);
if (conflictingColorOptions.player1Profile.color === conflictingColorOptions.player2Profile.color) {
  console.error(`Test FAILED (ProfileValidation): Player profile colors were not resolved on conflict. P1: ${conflictingColorOptions.player1Profile.color}, P2: ${conflictingColorOptions.player2Profile.color}`);
  allTestsPassed = false;
} else if (conflictingColorOptions.player1Profile.color !== p1InitialColorConflict) {
  console.error(`Test FAILED (ProfileValidation): Player 1's color changed during conflict resolution. Expected ${p1InitialColorConflict}, got ${conflictingColorOptions.player1Profile.color}`);
  allTestsPassed = false;
} else {
  console.log('Test PASSED (ProfileValidation): Player profile color conflict resolution.');
}

// Player Profile Name Conflict Resolution (Human vs Human)
const sameNameOptions = new GameOptions(
  DEFAULT_BOARD_SIZE, undefined, undefined,
  { name: "User", color: COLOR_PALETTE[0] },
  { name: "User", color: COLOR_PALETTE[1] }, // Same name
  'system',
  "User", // player2LocalName
  PlayerControlType.HUMAN,
  DEFAULT_AI_DIFFICULTY
);
if (sameNameOptions.player1Profile.name === sameNameOptions.player2Profile.name) {
  console.error(`Test FAILED (ProfileValidation): Player profile names were not resolved on conflict. P1: ${sameNameOptions.player1Profile.name}, P2: ${sameNameOptions.player2Profile.name}`);
  allTestsPassed = false;
} else {
  console.log('Test PASSED (ProfileValidation): Player profile name conflict resolution (Human vs Human).');
}

// Empty/Whitespace Player Name Resolution
const emptyNameOptions = new GameOptions(
    DEFAULT_BOARD_SIZE, undefined, undefined,
    {name: " ", color: COLOR_PALETTE[0]}, // Empty P1 name
    {name: "  User 2", color: COLOR_PALETTE[1]},
    'system',
    "  User 2", // player2LocalName
    PlayerControlType.HUMAN,
    DEFAULT_AI_DIFFICULTY
);
if(emptyNameOptions.player1Profile.name !== DEFAULT_PLAYER_1_PROFILE_BASE.name || emptyNameOptions.player2Profile.name !== "User 2"){
    console.error(`Test FAILED (ProfileValidation): Empty/whitespace names not resolved. P1 Exp: ${DEFAULT_PLAYER_1_PROFILE_BASE.name}, Got: '${emptyNameOptions.player1Profile.name}'. P2 Exp: "User 2", Got: '${emptyNameOptions.player2Profile.name}'`);
    allTestsPassed = false;
} else {
    console.log('Test PASSED (ProfileValidation): Empty/whitespace names resolved.');
}

// AI Name Assignment
const aiOptions = new GameOptions(DEFAULT_BOARD_SIZE, undefined, undefined, undefined, undefined, 'system', AI_NAME, PlayerControlType.AI, DEFAULT_AI_DIFFICULTY);
if (aiOptions.player2Profile.name !== AI_NAME) {
    console.error(`Test FAILED (ProfileValidation): AI Player name not set to AI_NAME. Got: ${aiOptions.player2Profile.name}`);
    allTestsPassed = false;
} else {
    console.log('Test PASSED (ProfileValidation): AI Player name assignment.');
}

// Online Opponent Name Assignment
const onlineOptionsName = new GameOptions(DEFAULT_BOARD_SIZE, undefined, undefined, undefined, undefined, 'system', ONLINE_OPPONENT_NAME, PlayerControlType.ONLINE, DEFAULT_AI_DIFFICULTY);
if (onlineOptionsName.player2Profile.name !== ONLINE_OPPONENT_NAME) {
    console.error(`Test FAILED (ProfileValidation): Online Player name not set to ONLINE_OPPONENT_NAME. Got: ${onlineOptionsName.player2Profile.name}`);
    allTestsPassed = false;
} else {
    console.log('Test PASSED (ProfileValidation): Online Player name assignment.');
}

// Invalid Color Fallback
const invalidColorP1Options = new GameOptions(DEFAULT_BOARD_SIZE, undefined, undefined, {name: "P1", color: "#INVALID"}, undefined, 'system', DEFAULT_PLAYER_1_PROFILE_BASE.name, PlayerControlType.HUMAN, DEFAULT_AI_DIFFICULTY);
if (invalidColorP1Options.player1Profile.color !== DEFAULT_PLAYER_1_PROFILE_BASE.color) {
    console.error(`Test FAILED (ProfileValidation): P1 invalid color did not fall back to default. Got: ${invalidColorP1Options.player1Profile.color}`);
    allTestsPassed = false;
} else {
    console.log('Test PASSED (ProfileValidation): P1 invalid color fallback.');
}
const invalidColorP2Options = new GameOptions(DEFAULT_BOARD_SIZE, undefined, undefined, undefined, {name: "P2", color: "badcolor"}, 'system', "P2", PlayerControlType.HUMAN, DEFAULT_AI_DIFFICULTY);
if (invalidColorP2Options.player2Profile.color !== DEFAULT_PLAYER_2_PROFILE_BASE.color) {
    console.error(`Test FAILED (ProfileValidation): P2 invalid color did not fall back to default. Got: ${invalidColorP2Options.player2Profile.color}`);
    allTestsPassed = false;
} else {
    console.log('Test PASSED (ProfileValidation): P2 invalid color fallback.');
}


// --- ensureOnlineSettings Tests (tested via constructor) ---
console.log('--- Testing Online Settings Enforcement (via Constructor) ---');
const onlineSettingsOptions = new GameOptions(
    MIN_BOARD_SIZE -1, // Invalid online board size
    { mode: 'perTurn', durationPerTurn: 15, durationPerGame: 120, incrementSeconds: 5 as AllowedIncrementSecondsType }, // Timer mode that should change
    false, // Swap rule should be forced true
    undefined, undefined, 'system', ONLINE_OPPONENT_NAME, PlayerControlType.ONLINE, DEFAULT_AI_DIFFICULTY
);
if (!onlineSettingsOptions.swapRuleEnabled) {
  console.error('Test FAILED (OnlineSettings): Swap rule not forced to true for Online play.');
  allTestsPassed = false;
} else {
  console.log('Test PASSED (OnlineSettings): Swap rule forced true for Online.');
}
if (onlineSettingsOptions.boardSize !== DEFAULT_ONLINE_BOARD_SIZE) {
  console.error(`Test FAILED (OnlineSettings): Invalid board size not corrected to online default. Expected ${DEFAULT_ONLINE_BOARD_SIZE}, Got ${onlineSettingsOptions.boardSize}`);
  allTestsPassed = false;
} else {
  console.log('Test PASSED (OnlineSettings): Board size corrected for Online.');
}
if (onlineSettingsOptions.timerSettings.mode !== 'perGame' || 
    onlineSettingsOptions.timerSettings.durationPerGame !== DEFAULT_ONLINE_GAME_DURATION_SECONDS ||
    onlineSettingsOptions.timerSettings.incrementSeconds !== DEFAULT_ONLINE_TIMER_INCREMENT_SECONDS) {
  console.error(`Test FAILED (OnlineSettings): Timer settings not corrected for Online (perTurn to perGame default). Got mode: ${onlineSettingsOptions.timerSettings.mode}, duration: ${onlineSettingsOptions.timerSettings.durationPerGame}, increment: ${onlineSettingsOptions.timerSettings.incrementSeconds}`);
  allTestsPassed = false;
} else {
  console.log('Test PASSED (OnlineSettings): Timer settings corrected for Online (perTurn to perGame default).');
}
const onlineSettingsInvalidPerGame = new GameOptions(
    DEFAULT_ONLINE_BOARD_SIZE, 
    { mode: 'perGame', durationPerTurn: 30, durationPerGame: 1, incrementSeconds: 99 as AllowedIncrementSecondsType }, // Invalid duration/increment
    true, undefined, undefined, 'system', ONLINE_OPPONENT_NAME, PlayerControlType.ONLINE, DEFAULT_AI_DIFFICULTY
);
if (onlineSettingsInvalidPerGame.timerSettings.durationPerGame !== DEFAULT_ONLINE_GAME_DURATION_SECONDS ||
    onlineSettingsInvalidPerGame.timerSettings.incrementSeconds !== DEFAULT_ONLINE_TIMER_INCREMENT_SECONDS) {
  console.error(`Test FAILED (OnlineSettings): Invalid perGame timer duration/increment not corrected to online defaults. Duration: ${onlineSettingsInvalidPerGame.timerSettings.durationPerGame}, Increment: ${onlineSettingsInvalidPerGame.timerSettings.incrementSeconds}`);
  allTestsPassed = false;
} else {
  console.log('Test PASSED (OnlineSettings): Invalid perGame timer duration/increment corrected to online defaults.');
}
// Test AI timer settings (increment should be 0)
const aiTimerOptions = new GameOptions(DEFAULT_BOARD_SIZE, { mode: 'perGame', durationPerGame: 300, durationPerTurn: 30, incrementSeconds: 10 as AllowedIncrementSecondsType }, true, undefined, undefined, 'system', AI_NAME, PlayerControlType.AI, DEFAULT_AI_DIFFICULTY);
if (aiTimerOptions.timerSettings.incrementSeconds !== 0) {
    console.error(`Test FAILED (AITimerSettings): Increment for AI game is not 0. Got: ${aiTimerOptions.timerSettings.incrementSeconds}`);
    allTestsPassed = false;
} else {
    console.log('Test PASSED (AITimerSettings): Increment for AI game is 0.');
}



// --- localStorage Load and Save Tests ---
console.log('--- Testing localStorage Load/Save ---');
localStorage.clear(); 
const optionsToSave = new GameOptions(
    10, { mode: 'perGame', durationPerGame: 600, durationPerTurn: 0, incrementSeconds: 15 as AllowedIncrementSecondsType }, false, 
    {name: "TestP1", color: COLOR_PALETTE[2] as ColorPaletteType}, 
    {name: "TestP2", color: COLOR_PALETTE[3] as ColorPaletteType},
    'dark', "TestP2", PlayerControlType.HUMAN, AiDifficulty.HARD, true // Added chatNotificationsEnabled
);
optionsToSave.save();
const loadedOptions = GameOptions.load();

let loadSaveTestPassed = true;
if (loadedOptions.boardSize !== 10) { loadSaveTestPassed = false; console.error('LS Test FAIL: boardSize'); }
if (loadedOptions.timerSettings.mode !== 'perGame' || loadedOptions.timerSettings.durationPerGame !== 600 || loadedOptions.timerSettings.incrementSeconds !== 15) { loadSaveTestPassed = false; console.error('LS Test FAIL: timerSettings'); }
if (loadedOptions.swapRuleEnabled !== false) { loadSaveTestPassed = false; console.error('LS Test FAIL: swapRuleEnabled'); }
if (loadedOptions.player1Profile.name !== "TestP1" || loadedOptions.player1Profile.color !== COLOR_PALETTE[2]) { loadSaveTestPassed = false; console.error('LS Test FAIL: player1Profile'); }
if (loadedOptions.player2Profile.name !== "TestP2" || loadedOptions.player2Profile.color !== COLOR_PALETTE[3]) { loadSaveTestPassed = false; console.error('LS Test FAIL: player2Profile'); }
if (loadedOptions.themeMode !== 'dark') { loadSaveTestPassed = false; console.error('LS Test FAIL: themeMode'); }
if (loadedOptions.player2ControlType !== PlayerControlType.HUMAN) { loadSaveTestPassed = false; console.error('LS Test FAIL: player2ControlType'); }
// AI difficulty is not saved if P2 is not AI. It should be default in this loaded human case.
if (loadedOptions.aiDifficulty !== DEFAULT_AI_DIFFICULTY) { loadSaveTestPassed = false; console.error(`LS Test FAIL: aiDifficulty for Human. Expected ${DEFAULT_AI_DIFFICULTY}, Got ${loadedOptions.aiDifficulty}`); }
if (loadedOptions.chatNotificationsEnabled !== true) { loadSaveTestPassed = false; console.error('LS Test FAIL: chatNotificationsEnabled'); }


if (!loadSaveTestPassed) {
  console.error('Test FAILED: Load/Save functionality did not preserve settings correctly.');
  allTestsPassed = false;
} else {
  console.log('Test PASSED: Load/Save functionality.');
}
// Test saving AI difficulty
localStorage.clear();
const aiOptionsToSave = new GameOptions(
    DEFAULT_BOARD_SIZE, undefined, true, undefined, undefined, 'system', AI_NAME, PlayerControlType.AI, AiDifficulty.MEDIUM
);
aiOptionsToSave.save();
const loadedAiOptions = GameOptions.load();
if (loadedAiOptions.player2ControlType !== PlayerControlType.AI || loadedAiOptions.aiDifficulty !== AiDifficulty.MEDIUM) {
    console.error(`Test FAILED: Load/Save for AI difficulty. Expected AI/Medium, Got ${loadedAiOptions.player2ControlType}/${loadedAiOptions.aiDifficulty}`);
    allTestsPassed = false;
} else {
    console.log('Test PASSED: Load/Save for AI difficulty.');
}
localStorage.clear(); // Clean up

// Test loading with malformed data
localStorage.setItem('hexGameTimerSettings', 'not-json');
localStorage.setItem('hexPlayer2ControlType', 'INVALID_TYPE');
localStorage.setItem('hexPlayer1Profile', JSON.stringify({name: "P1", color: "badcolor"}));
const loadedMalformedOptions = GameOptions.load();
if (loadedMalformedOptions.timerSettings.mode !== DEFAULT_TIMER_SETTINGS.mode || 
    loadedMalformedOptions.player2ControlType !== DEFAULT_PLAYER_2_CONTROL_TYPE ||
    loadedMalformedOptions.player1Profile.color !== DEFAULT_PLAYER_1_PROFILE_BASE.color) {
    console.error(`Test FAILED: Loading malformed data did not fall back to defaults gracefully. TimerMode: ${loadedMalformedOptions.timerSettings.mode}, P2Control: ${loadedMalformedOptions.player2ControlType}, P1Color: ${loadedMalformedOptions.player1Profile.color}`);
    allTestsPassed = false;
} else {
    console.log('Test PASSED: Loading malformed data falls back to defaults.');
}
localStorage.clear();


// --- validateSettings Tests ---
console.log('--- Testing validateSettings Method ---');
const validatorInstance = createDefaultOptions();

// Error cases
const valErrorBoardSize = validatorInstance.validateSettings( String(MIN_BOARD_SIZE - 1), "off", "30", "300", "0", "P1", COLOR_PALETTE[0], "P2", COLOR_PALETTE[1], PlayerControlType.HUMAN, true);
if (!valErrorBoardSize || !valErrorBoardSize.includes("Board size")) { allTestsPassed = false; console.error(`ValTest FAIL: invalid board size. Error: ${valErrorBoardSize}`); } 
else { console.log('ValTest PASS: invalid board size.'); }

const valErrorP1Name = validatorInstance.validateSettings( String(DEFAULT_BOARD_SIZE), "off", "30", "300", "0", "  ", COLOR_PALETTE[0], "P2", COLOR_PALETTE[1], PlayerControlType.HUMAN, true);
if (!valErrorP1Name || !valErrorP1Name.includes("Player 1 Name")) { allTestsPassed = false; console.error(`ValTest FAIL: empty P1 name. Error: ${valErrorP1Name}`); }
else { console.log('ValTest PASS: empty P1 name.'); }

const valErrorSameColor = validatorInstance.validateSettings( String(DEFAULT_BOARD_SIZE), "off", "30", "300", "0", "P1", COLOR_PALETTE[0], "P2", COLOR_PALETTE[0], PlayerControlType.HUMAN, true);
if (!valErrorSameColor || !valErrorSameColor.includes("colors must be different")) { allTestsPassed = false; console.error(`ValTest FAIL: same player colors. Error: ${valErrorSameColor}`); }
else { console.log('ValTest PASS: same player colors.'); }

const valErrorOnlinePerTurnTimer = validatorInstance.validateSettings(String(DEFAULT_ONLINE_BOARD_SIZE), "perTurn", "30", "600", "10", "P1", COLOR_PALETTE[0], "P2", COLOR_PALETTE[1], PlayerControlType.ONLINE, true);
if (!valErrorOnlinePerTurnTimer || !valErrorOnlinePerTurnTimer.includes("Per Turn timer is not allowed for Online play")) { allTestsPassed = false; console.error(`ValTest FAIL: online perTurn timer. Error: ${valErrorOnlinePerTurnTimer}`); }
else { console.log('ValTest PASS: online perTurn timer disallowed.'); }

const valErrorOnlineInvalidDuration = validatorInstance.validateSettings(String(DEFAULT_ONLINE_BOARD_SIZE), "perGame", "30", "1", "10", "P1", COLOR_PALETTE[0], "P2", COLOR_PALETTE[1], PlayerControlType.ONLINE, true); // 1s duration is invalid
if (!valErrorOnlineInvalidDuration || !valErrorOnlineInvalidDuration.includes("Invalid game duration for Online play")) { allTestsPassed = false; console.error(`ValTest FAIL: online invalid duration. Error: ${valErrorOnlineInvalidDuration}`); }
else { console.log('ValTest PASS: online invalid duration.'); }

const valErrorOnlineInvalidIncrement = validatorInstance.validateSettings(String(DEFAULT_ONLINE_BOARD_SIZE), "perGame", "30", String(DEFAULT_ONLINE_GAME_DURATION_SECONDS), "99", "P1", COLOR_PALETTE[0], "P2", COLOR_PALETTE[1], PlayerControlType.ONLINE, true); // 99s increment is invalid
if (!valErrorOnlineInvalidIncrement || !valErrorOnlineInvalidIncrement.includes("Invalid increment for Online play")) { allTestsPassed = false; console.error(`ValTest FAIL: online invalid increment. Error: ${valErrorOnlineInvalidIncrement}`); }
else { console.log('ValTest PASS: online invalid increment.'); }

const valErrorOnlineInvalidBoardSize = validatorInstance.validateSettings("7", "perGame", "30", String(DEFAULT_ONLINE_GAME_DURATION_SECONDS), "0", "P1", COLOR_PALETTE[0], "P2", COLOR_PALETTE[1], PlayerControlType.ONLINE, true); // 7 is not an allowed online size
if (!valErrorOnlineInvalidBoardSize || !valErrorOnlineInvalidBoardSize.includes("Board size for Online play must be one of")) { allTestsPassed = false; console.error(`ValTest FAIL: online invalid board size. Error: ${valErrorOnlineInvalidBoardSize}`); }
else { console.log('ValTest PASS: online invalid board size.'); }

// Success case
const valSuccess = validatorInstance.validateSettings( String(DEFAULT_BOARD_SIZE), "perTurn", "30", "300", "0", "PlayerX", COLOR_PALETTE[0], "PlayerY", COLOR_PALETTE[1], PlayerControlType.HUMAN, true);
if (valSuccess) { allTestsPassed = false; console.error(`ValTest FAIL: valid settings. Error: ${valSuccess}`); }
else { console.log('ValTest PASS: valid settings returns no error.'); }


// --- updateAndSave Tests ---
console.log('--- Testing updateAndSave Method ---');
let baseOptionsForUpdate = createDefaultOptions();
const p1UpdateProfile = { name: "UpdatedP1", color: COLOR_PALETTE[4] as ColorPaletteType };
const p2UpdateProfileHuman = { name: "UpdatedP2Human", color: COLOR_PALETTE[5] as ColorPaletteType };

// Test basic update
let updatedOptions = baseOptionsForUpdate.updateAndSave(
    13, { mode: 'perGame', durationPerGame: 900, durationPerTurn: 0, incrementSeconds: 30 as AllowedIncrementSecondsType }, false,
    p1UpdateProfile, p2UpdateProfileHuman, 'light', "UpdatedP2Human", PlayerControlType.HUMAN, AiDifficulty.EASY,
    false // newChatNotificationsEnabled
);
if (updatedOptions.boardSize !== 13 || updatedOptions.player1Profile.name !== "UpdatedP1" || updatedOptions.player2Profile.name !== "UpdatedP2Human" || updatedOptions.themeMode !== 'light' || updatedOptions.chatNotificationsEnabled !== false) {
    allTestsPassed = false; console.error('UpdateTest FAIL: Basic update did not apply settings.');
} else {
    console.log('UpdateTest PASS: Basic update.');
}

// Test update to Online, ensure online settings are enforced
updatedOptions = baseOptionsForUpdate.updateAndSave(
    9, // Valid online size, but different from current
    { mode: 'perTurn', durationPerGame: 120, durationPerTurn: 10, incrementSeconds: 0 as AllowedIncrementSecondsType }, // Should be corrected
    false, // Should be forced true
    p1UpdateProfile, { name: ONLINE_OPPONENT_NAME, color: COLOR_PALETTE[1] as ColorPaletteType }, // P2 name will become ONLINE_OPPONENT_NAME
    'system', ONLINE_OPPONENT_NAME, PlayerControlType.ONLINE, DEFAULT_AI_DIFFICULTY,
    true // newChatNotificationsEnabled
);
if (!updatedOptions.swapRuleEnabled || updatedOptions.boardSize !== 9 || 
    updatedOptions.timerSettings.mode !== 'perGame' || 
    updatedOptions.timerSettings.durationPerGame !== DEFAULT_ONLINE_GAME_DURATION_SECONDS ||
    updatedOptions.player2Profile.name !== ONLINE_OPPONENT_NAME || updatedOptions.chatNotificationsEnabled !== true) {
    allTestsPassed = false; console.error(`UpdateTest FAIL: Update to Online did not enforce settings. Swap: ${updatedOptions.swapRuleEnabled}, Size: ${updatedOptions.boardSize}, TimerMode: ${updatedOptions.timerSettings.mode}, P2Name: ${updatedOptions.player2Profile.name}, ChatNotif: ${updatedOptions.chatNotificationsEnabled}`);
} else {
    console.log('UpdateTest PASS: Update to Online enforces settings.');
}

// Test update to AI, ensure P2 name is AI_NAME and AI difficulty is saved
localStorage.clear(); // Clear localStorage to check AI difficulty persistence
baseOptionsForUpdate = GameOptions.load(); // Start with fresh defaults from load
updatedOptions = baseOptionsForUpdate.updateAndSave(
    DEFAULT_BOARD_SIZE, DEFAULT_TIMER_SETTINGS, true,
    DEFAULT_PLAYER_1_PROFILE_BASE, { name: "Ignored", color: DEFAULT_PLAYER_2_PROFILE_BASE.color },
    'system', AI_NAME, PlayerControlType.AI, AiDifficulty.HARD,
    DEFAULT_CHAT_NOTIFICATIONS_ENABLED // newChatNotificationsEnabled
);
const loadedAIAfterUpdateAndSave = GameOptions.load(); // Load again to check persistence
if (updatedOptions.player2Profile.name !== AI_NAME || updatedOptions.aiDifficulty !== AiDifficulty.HARD ||
    loadedAIAfterUpdateAndSave.aiDifficulty !== AiDifficulty.HARD || loadedAIAfterUpdateAndSave.player2ControlType !== PlayerControlType.AI ||
    updatedOptions.chatNotificationsEnabled !== DEFAULT_CHAT_NOTIFICATIONS_ENABLED) {
    allTestsPassed = false; console.error(`UpdateTest FAIL: Update to AI did not set name/difficulty or persist AI difficulty. P2Name: ${updatedOptions.player2Profile.name}, AIDiff: ${updatedOptions.aiDifficulty}, LoadedAIDiff: ${loadedAIAfterUpdateAndSave.aiDifficulty}, ChatNotif: ${updatedOptions.chatNotificationsEnabled}`);
} else {
    console.log('UpdateTest PASS: Update to AI sets name, difficulty, and persists AI settings.');
}
// Test that AI difficulty is cleared from storage if P2 is not AI
localStorage.clear();
baseOptionsForUpdate = new GameOptions(DEFAULT_BOARD_SIZE, undefined, true, undefined, undefined, 'system', AI_NAME, PlayerControlType.AI, AiDifficulty.HARD, DEFAULT_CHAT_NOTIFICATIONS_ENABLED);
baseOptionsForUpdate.save(); // Save with AI difficulty
updatedOptions = baseOptionsForUpdate.updateAndSave( // Update to Human
    DEFAULT_BOARD_SIZE, DEFAULT_TIMER_SETTINGS, true,
    DEFAULT_PLAYER_1_PROFILE_BASE, DEFAULT_PLAYER_2_PROFILE_BASE,
    'system', DEFAULT_PLAYER_2_PROFILE_BASE.name, PlayerControlType.HUMAN, AiDifficulty.HARD,
    true // newChatNotificationsEnabled
);
const loadedHumanAfterAI = GameOptions.load();
if (localStorage.getItem('hexAiDifficulty') !== null || loadedHumanAfterAI.aiDifficulty !== DEFAULT_AI_DIFFICULTY || updatedOptions.chatNotificationsEnabled !== true) {
     allTestsPassed = false; console.error(`UpdateTest FAIL: AI difficulty not cleared from localStorage or model when switching to Human. Stored: ${localStorage.getItem('hexAiDifficulty')}, Model: ${loadedHumanAfterAI.aiDifficulty}, ChatNotif: ${updatedOptions.chatNotificationsEnabled}`);
} else {
    console.log('UpdateTest PASS: AI difficulty cleared when P2 not AI.');
}
localStorage.clear();


// --- Final summary ---
if (allTestsPassed) {
  console.log('All GameOptions.ts tests passed!');
} else {
  console.error('Some GameOptions.ts tests FAILED.');
}

// Quick check that it returns a new instance
const o1 = new GameOptions();
const o2 = o1.updateAndSave(11, o1.timerSettings, true, o1.player1Profile, o1.player2Profile, 'dark', o1.player2Profile.name, PlayerControlType.HUMAN, AiDifficulty.EASY, DEFAULT_CHAT_NOTIFICATIONS_ENABLED);
if (o1 === o2) {
    allTestsPassed = false; console.error('Test FAILED: updateAndSave did not return a new instance.');
} else {
    console.log('Test PASSED: updateAndSave returns a new instance.');
}

if (allTestsPassed) {
  console.log('ALL GameOptions.ts tests passed successfully!');
} else {
  console.error('ONE OR MORE GameOptions.ts tests FAILED.');
}
