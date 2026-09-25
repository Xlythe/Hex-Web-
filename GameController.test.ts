
// Basic test structure for GameController.ts
import { GameController } from './GameController';
import { GameOptions } from './GameOptions';
import { Player, GamePhase, CellState, PlayerProfile, PlayerControlType } from './types';
import { DEFAULT_BOARD_SIZE, MIN_BOARD_SIZE, MAX_BOARD_SIZE, DEFAULT_PLAYER_1_PROFILE_BASE, DEFAULT_PLAYER_2_PROFILE_BASE } from './Constants';
import { describe, expect, it } from 'vitest';

/**
 * @file GameController.test.ts
 * @description Unit tests for the GameController class. These tests verify core game logic,
 * including starting a game, making moves, undoing moves, swap rule implementation,
 * win condition checking, and player profile resolution.
 * Note: These tests run in a browser console environment and do not use a formal test runner.
 */

describe('GameController', () => {
it('returns a shortest winning connection when several paths exist', () => {
  const options = new GameOptions(4);
  options.player2ControlType = PlayerControlType.HUMAN;
  const game = new GameController(options, () => {}, false);
  game.boardMatrix = Array.from({ length: 4 }, () => Array(4).fill(Player.ONE));
  const path = game.checkForWin(Player.ONE);
  expect(path).toHaveLength(4);
  expect(path?.[0].c).toBe(0);
  expect(path?.[3].c).toBe(3);
});

it('supports moves, undo, wins, swaps, and completed game data', async () => {
console.log('Running tests for GameController.ts');
let allTestsPassed = true;
let updateCalledCount = 0; // Counter for mock onUpdate callback.
const mockOnUpdate = () => { updateCalledCount++; }; // Mock callback to track UI update notifications.

// Define default player profiles for testing purposes.
const defaultP1Profile: PlayerProfile = { ...DEFAULT_PLAYER_1_PROFILE_BASE, name: "P1 Test", color: DEFAULT_PLAYER_1_PROFILE_BASE.color};
const defaultP2Profile: PlayerProfile = { ...DEFAULT_PLAYER_2_PROFILE_BASE, name: "P2 Test", color: DEFAULT_PLAYER_2_PROFILE_BASE.color};

// Initialize GameOptions and GameController for tests.
const options = new GameOptions(DEFAULT_BOARD_SIZE, undefined, undefined, defaultP1Profile, defaultP2Profile);
options.player2ControlType = PlayerControlType.HUMAN;
options.swapRuleEnabled = false;
const game = new GameController(options, mockOnUpdate);

// Test: startGame functionality.
// Verifies correct initialization of game phase, turn count, update callback invocation,
// randomization flag for starting player side, and player agent profiles.
updateCalledCount = 0;
game.startGame();
if (game.gamePhase !== GamePhase.PLAYING || game.turnCount !== 0 || updateCalledCount === 0) {
  console.error(`Test FAILED: startGame did not initialize correctly or call onUpdate. Phase: ${game.gamePhase}, Turns: ${game.turnCount}, Updates: ${updateCalledCount}`);
  allTestsPassed = false;
} else {
  console.log('Test PASSED: startGame initializes game phase, turn count, and calls onUpdate.');
}
// Check if the randomization flag for player side assignment is set.
if (typeof game.isPlayer1ProfileAssignedToSideONE_atGameStart !== 'boolean') {
  console.error(`Test FAILED: startGame did not set isPlayer1ProfileAssignedToSideONE_atGameStart to a boolean.`);
  allTestsPassed = false;
} else {
  console.log('Test PASSED: startGame sets player side randomization flag.');
}
// Verify player agents are initialized with profiles from options.
if (game.playerAgent1.profile.name !== defaultP1Profile.name || game.playerAgent2.profile.name !== defaultP2Profile.name) {
  console.error(`Test FAILED: startGame did not correctly initialize player agents from options.`);
  allTestsPassed = false;
} else {
  console.log('Test PASSED: startGame initializes player agents correctly from options.');
}


// Test: makeMove basic functionality.
// Verifies piece placement, turn count increment, and update callback.
updateCalledCount = 0;
const initialCurrentPlayer = game.currentPlayerId;
await game.makeMove(0, 0); // Assumes board is at least 1x1.
if (game.boardMatrix[0][0] !== initialCurrentPlayer || game.turnCount !== 1 || updateCalledCount === 0) {
  console.error(`Test FAILED: makeMove did not place piece, increment turn, or call onUpdate. Cell: ${String(game.boardMatrix[0][0])}, Turns: ${game.turnCount}, Updates: ${updateCalledCount}`);
  allTestsPassed = false;
} else {
  console.log('Test PASSED: makeMove places piece, increments turn, and calls onUpdate.');
}
const playerAfterFirstMove = game.boardMatrix[0][0];

// Test: makeMove on an already occupied cell.
// Verifies that attempting to move on an occupied cell does not change game state or call update.
updateCalledCount = 0;
const turnCountBeforeOccupiedMove = game.turnCount;
await game.makeMove(0,0); // Attempt to move on the same cell.
if(game.turnCount !== turnCountBeforeOccupiedMove || updateCalledCount > 0){ // Should not update if move is invalid.
    console.error(`Test FAILED: makeMove on occupied cell changed turnCount or called update. Turns: ${game.turnCount}, Updates: ${updateCalledCount}`);
    allTestsPassed = false;
} else {
    console.log('Test PASSED: makeMove on occupied cell is correctly ignored.');
}

// Test: undoMove functionality.
// Verifies that undoing a move reverts game state (board, turn count) and calls update.
updateCalledCount = 0;
if (!game.canUndo()) { // Check if undo is permissible.
    console.error('Test FAILED: canUndo returned false after one valid move.');
    allTestsPassed = false;
}
game.undoMove(); // Undoes the (0,0) move.
if (game.boardMatrix[0][0] !== null || game.turnCount !== 0 || updateCalledCount === 0) {
  console.error(`Test FAILED: undoMove did not revert state or call onUpdate. Cell: ${String(game.boardMatrix[0][0])}, Turns: ${game.turnCount}, Updates: ${updateCalledCount}`);
  allTestsPassed = false;
} else {
  console.log('Test PASSED: undoMove correctly reverts game state.');
}
if (game.canUndo()) { // After undoing all moves, canUndo should be false.
    console.error('Test FAILED: canUndo returned true after undoing all moves.');
    allTestsPassed = false;
}

// Test: checkForWin - Simple horizontal win for Player.ONE.
// Sets up a 3x3 board and places pieces for Player.ONE to form a horizontal line.
game.startGame(); // Reset board and game state.
game.options.boardSize = 3; // Use a small board for easier win condition setup.
game.boardMatrix = createEmptyBoard(3, MIN_BOARD_SIZE, MAX_BOARD_SIZE, DEFAULT_BOARD_SIZE);
game.currentPlayerId = Player.ONE; // Manually set current player for this test path.

game.boardMatrix[0][0] = Player.ONE;
game.boardMatrix[0][1] = Player.ONE;
game.boardMatrix[0][2] = Player.ONE;
let winPath = game.checkForWin(Player.ONE);
if (!winPath || winPath.length !== 3) {
  console.error(`Test FAILED: checkForWin did not detect horizontal win for P1. Path: ${JSON.stringify(winPath)}`);
  allTestsPassed = false;
} else {
  console.log('Test PASSED: checkForWin detects horizontal win for Player.ONE.');
}

// Test: checkForWin - Simple vertical win for Player.TWO.
// Sets up a 3x3 board and places pieces for Player.TWO to form a vertical line.
game.startGame();
game.options.boardSize = 3;
game.boardMatrix = createEmptyBoard(3, MIN_BOARD_SIZE, MAX_BOARD_SIZE, DEFAULT_BOARD_SIZE);
game.currentPlayerId = Player.TWO; // Manually set current player.
game.boardMatrix[0][0] = Player.TWO;
game.boardMatrix[1][0] = Player.TWO;
game.boardMatrix[2][0] = Player.TWO;
winPath = game.checkForWin(Player.TWO);
if (!winPath || winPath.length !== 3) {
  console.error(`Test FAILED: checkForWin did not detect vertical win for P2. Path: ${JSON.stringify(winPath)}`);
  allTestsPassed = false;
} else {
  console.log('Test PASSED: checkForWin detects vertical win for Player.TWO.');
}

// Test: checkForWin - Player.ONE complex "staircase" win on 4x4.
// The top-left stone is a detour; the shortest connection starts at (1,0).
game.startGame();
game.options.boardSize = 4;
game.boardMatrix = createEmptyBoard(4, MIN_BOARD_SIZE, MAX_BOARD_SIZE, DEFAULT_BOARD_SIZE);
game.boardMatrix[0][0] = Player.ONE;
game.boardMatrix[1][0] = Player.ONE;
game.boardMatrix[1][1] = Player.ONE;
game.boardMatrix[2][1] = Player.ONE;
game.boardMatrix[2][2] = Player.ONE;
game.boardMatrix[3][2] = Player.ONE;
game.boardMatrix[3][3] = Player.ONE;
winPath = game.checkForWin(Player.ONE);
if (!winPath || winPath.length !== 6) {
  console.error(`Test FAILED: checkForWin P1 complex staircase (4x4). Expected path length 6. Path: ${JSON.stringify(winPath)}`);
  allTestsPassed = false;
} else {
  console.log('Test PASSED: checkForWin P1 complex staircase (4x4).');
}


// Test: checkForWin - Player.TWO complex "staircase" win on 4x4.
// The top-left stone is a detour; the shortest connection starts at (0,1).
game.startGame();
game.options.boardSize = 4;
game.boardMatrix = createEmptyBoard(4, MIN_BOARD_SIZE, MAX_BOARD_SIZE, DEFAULT_BOARD_SIZE);
game.boardMatrix[0][0] = Player.TWO;
game.boardMatrix[0][1] = Player.TWO;
game.boardMatrix[1][1] = Player.TWO;
game.boardMatrix[1][2] = Player.TWO;
game.boardMatrix[2][2] = Player.TWO;
game.boardMatrix[2][3] = Player.TWO;
game.boardMatrix[3][3] = Player.TWO;
winPath = game.checkForWin(Player.TWO);
if (!winPath || winPath.length !== 6) {
  console.error(`Test FAILED: checkForWin P2 complex staircase (4x4). Expected path length 6. Path: ${JSON.stringify(winPath)}`);
  allTestsPassed = false;
} else {
  console.log('Test PASSED: checkForWin P2 complex staircase (4x4).');
}


// Test: Swap rule logic - Current Player after Swap
// Verifies that after a swap, the turn correctly passes to the player who made the first move,
// playing the same side while the opening stone becomes the second side's.
console.log("--- Testing Swap Rule: Current Player After Swap ---");
updateCalledCount = 0;
game.startGame();
game.options.swapRuleEnabled = true;

// @ts-expect-error: Forcing player 1 config to start as Player.ONE side for predictable test
game._isPlayer1ProfileAssignedToSideONE_atGameStart = true;
game.currentPlayerId = Player.ONE; // Ensure P1 (Player.ONE side) starts

const firstMoverSide: Player = Player.ONE as Player; 

const firstMoveCoord = {r: 0, c: 1};
await game.makeMove(firstMoveCoord.r, firstMoveCoord.c); // First player (Player.ONE side) makes a move. 

const firstMoveDetailsForSwapTest = game.firstGameMoveDetails;
if (!firstMoveDetailsForSwapTest || Number(firstMoveDetailsForSwapTest.player) !== Number(firstMoverSide)) {
    console.error(`Test FAILED (Swap - Current Player Setup): firstGameMoveDetails not set correctly or player mismatch. Expected player: ${firstMoverSide}, Got: ${firstMoveDetailsForSwapTest?.player}`);
    allTestsPassed = false;
}

// At this point, game.currentPlayerId should be the side of the second mover (Player.TWO)
const secondMoverSide = game.currentPlayerId;
if (Number(secondMoverSide) !== Number(Player.TWO)) {
    console.error(`Test FAILED (Swap - Current Player Setup): Expected second mover's turn (Player.TWO side). Got: ${secondMoverSide}`);
    allTestsPassed = false;
}

updateCalledCount = 0; // Reset for the swap action
if (firstMoveDetailsForSwapTest) { // Check if firstMoveDetailsForSwapTest is not null before accessing its properties
    await game.makeMove(firstMoveDetailsForSwapTest.coord.r, firstMoveDetailsForSwapTest.coord.c); // Second mover (Player.TWO side) swaps.

    if (game.isPlayerRolesSwapped) {
        console.error("Test FAILED (Swap - Current Player): seat ownership changed after swap.");
        allTestsPassed = false;
    }

    if (game.boardMatrix[0][1] !== null || game.boardMatrix[1][0] !== Player.TWO) {
        console.error("Test FAILED (Swap - Current Player): off-axis opening was not transposed and recolored.");
        allTestsPassed = false;
    }

    const playerMakingFirstMove: Player = firstMoveDetailsForSwapTest.player;
    const expectedCurrentPlayerAfterSwap = playerMakingFirstMove;
    
    if (game.currentPlayerId !== expectedCurrentPlayerAfterSwap) {
        console.error(`Test FAILED (Swap - Current Player): currentPlayerId after swap is incorrect. Expected ${expectedCurrentPlayerAfterSwap}, Got ${game.currentPlayerId}`);
        allTestsPassed = false;
    } else if (updateCalledCount === 0) { // An update for swap execution, then another for clearing visual feedback after timeout.
        console.error("Test FAILED (Swap - Current Player): Swap execution did not call onUpdate at least once.");
        allTestsPassed = false;
    } else {
        console.log(`Test PASSED: Swap rule - currentPlayerId is correct after swap (${game.currentPlayerId}), onUpdate called ${updateCalledCount} times.`);
    }
} else {
    // This case should ideally not be reached if previous checks are fine, but it's a safeguard.
    console.error("Test SKIPPED (Swap - Current Player): firstGameMoveDetailsForSwapTest was null, cannot proceed with swap action test.");
    allTestsPassed = false; // Mark as failed because the setup for this specific test part failed.
}
console.log("--- End of Swap Rule: Current Player After Swap Test ---");


// --- Start of detailed tests for getParticipantProfileForBoardSide ---
console.log('--- Testing getParticipantProfileForBoardSide ---');
// Creates a new GameController instance for isolated testing of profile resolution logic.
const testController = new GameController(
  new GameOptions(DEFAULT_BOARD_SIZE, undefined, undefined, defaultP1Profile, defaultP2Profile),
  mockOnUpdate
);

// Scenarios to test different combinations of initial side assignment and swap state.
const scenarios = [
  { p1StartsAsONE: true,  swapped: false, expectedP1onSideONE: defaultP1Profile, expectedP2onSideTWO: defaultP2Profile, description: "P1 Config starts as Side ONE, No Swap" },
  { p1StartsAsONE: true,  swapped: true,  expectedP1onSideONE: defaultP2Profile, expectedP2onSideTWO: defaultP1Profile, description: "P1 Config starts as Side ONE, Swapped" },
  { p1StartsAsONE: false, swapped: false, expectedP1onSideONE: defaultP2Profile, expectedP2onSideTWO: defaultP1Profile, description: "P1 Config starts as Side TWO (P2 config is Side ONE), No Swap" },
  { p1StartsAsONE: false, swapped: true,  expectedP1onSideONE: defaultP1Profile, expectedP2onSideTWO: defaultP2Profile, description: "P1 Config starts as Side TWO (P2 config is Side ONE), Swapped" },
];

scenarios.forEach(scenario => {
  // Manually set internal state for each test scenario.
  // @ts-expect-error: Accessing private member for test setup.
  testController._isPlayer1ProfileAssignedToSideONE_atGameStart = scenario.p1StartsAsONE;
  testController.isPlayerRolesSwapped = scenario.swapped;

  // Get profiles for Player.ONE and Player.TWO sides under current scenario.
  const profileForSideONE = testController.getParticipantProfileForBoardSide(Player.ONE);
  const profileForSideTWO = testController.getParticipantProfileForBoardSide(Player.TWO);

  let scenarioPassed = true;
  // Validate profile for Player.ONE side.
  if (profileForSideONE.name !== scenario.expectedP1onSideONE.name || profileForSideONE.color !== scenario.expectedP1onSideONE.color) {
    console.error(`Test FAILED (${scenario.description}): Profile for Side ONE is incorrect. Expected ${scenario.expectedP1onSideONE.name}, Got ${profileForSideONE.name}`);
    allTestsPassed = false;
    scenarioPassed = false;
  }
  // Validate profile for Player.TWO side.
  if (profileForSideTWO.name !== scenario.expectedP2onSideTWO.name || profileForSideTWO.color !== scenario.expectedP2onSideTWO.color) {
    console.error(`Test FAILED (${scenario.description}): Profile for Side TWO is incorrect. Expected ${scenario.expectedP2onSideTWO.name}, Got ${profileForSideTWO.name}`);
    allTestsPassed = false;
    scenarioPassed = false;
  }

  if (scenarioPassed) {
    console.log(`Test PASSED: getParticipantProfileForBoardSide - ${scenario.description}`);
  }
});
console.log('--- End of getParticipantProfileForBoardSide tests ---');
// --- End of new detailed tests ---


// Test: getCompletedGameData includes the correct randomization flag.
// Verifies that 'wasPlayer1ProfileAssignedToSideONE_atGameStart' is correctly stored.
game.startGame(); // This will randomize isPlayer1ProfileAssignedToSideONE_atGameStart.
// @ts-expect-error: Accessing private member for test validation.
const internalRandomFlag = game._isPlayer1ProfileAssignedToSideONE_atGameStart;
// Simulate a game end to generate completed game data.
// @ts-expect-error: Calling private method for test setup.
game.endGame(Player.ONE, 'connection', [{r:0, c:0}]);
const completedData = game.getCompletedGameData();

if (!completedData) {
    console.error('Test FAILED: getCompletedGameData returned null after game end.');
    allTestsPassed = false;
} else if (completedData.wasPlayer1ProfileAssignedToSideONE_atGameStart !== internalRandomFlag) {
    console.error(`Test FAILED: getCompletedGameData did not save correct 'wasPlayer1ProfileAssignedToSideONE_atGameStart'. Expected ${internalRandomFlag}, Got ${completedData.wasPlayer1ProfileAssignedToSideONE_atGameStart}`);
    allTestsPassed = false;
} else {
    console.log('Test PASSED: getCompletedGameData correctly saves player side randomization flag.');
}


// Test: dispose method.
// Conceptually tests if dispose clears timers (difficult to assert directly without spies).
game.dispose();
// Note: Direct assertion of timer clearing is tricky in this simple test setup.
// We rely on the implementation of dispose to correctly clear intervals.
console.log('Test (Conceptual): dispose called, expected to clear timers.');


// Final summary of test results.
if (allTestsPassed) {
  console.log('All GameController.ts tests passed!');
} else {
  console.error('Some GameController.ts tests FAILED.');
}

/**
 * @function createEmptyBoard
 * @description Helper function local to this test file to create an empty board matrix.
 * Mirrors the utility function but is defined locally for test isolation if utils.ts were unavailable.
 * @param size - The dimension of the square board (N for an N x N grid).
 * @param minSize - Minimum allowed board size.
 * @param maxSize - Maximum allowed board size.
 * @param defaultSize - Default size if 'size' is out of range.
 * @returns A 2D array representing the empty board, filled with nulls.
 */
function createEmptyBoard(size: number, minSize: number, maxSize: number, defaultSize: number): CellState[][] {
  let finalSize = size;
  if (size < minSize || size > maxSize) {
    finalSize = defaultSize; // Default to valid size if input is out of range.
  }
  return Array(finalSize).fill(null).map(() => Array(finalSize).fill(null));
}
expect(allTestsPassed).toBe(true);
});
});
