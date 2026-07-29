
// Basic tests for `Constants.ts` to ensure values are within expected ranges and defaults are sensible.
// This simple test suite runs in the browser console and doesn't use a formal test runner like Jest.

import { 
    DEFAULT_BOARD_SIZE, MIN_BOARD_SIZE, MAX_BOARD_SIZE, 
    COLOR_PALETTE, 
    MIN_TIMER_DURATION_PER_GAME, MIN_TIMER_DURATION_PER_TURN, 
    DEFAULT_TIMER_SETTINGS, 
    DEFAULT_PLAYER_1_PROFILE_BASE, DEFAULT_PLAYER_2_PROFILE_BASE, 
    ColorPaletteType 
} from './Constants';
import { describe, expect, it } from 'vitest';

describe('game constants', () => {
it('keeps defaults internally valid', () => {
console.log('Running tests for gameConstants.ts');

let allTestsPassed = true;

// Test: Verify default board size is within defined min/max limits.
if (DEFAULT_BOARD_SIZE < MIN_BOARD_SIZE || DEFAULT_BOARD_SIZE > MAX_BOARD_SIZE) {
  console.error(`Test FAILED: DEFAULT_BOARD_SIZE (${DEFAULT_BOARD_SIZE}) is out of range (${MIN_BOARD_SIZE}-${MAX_BOARD_SIZE}).`);
  allTestsPassed = false;
} else {
  console.log('Test PASSED: DEFAULT_BOARD_SIZE is within range.');
}

// Test: Ensure the color palette contains a minimum number of colors for selection.
if (COLOR_PALETTE.length < 2) {
  console.error('Test FAILED: COLOR_PALETTE should have at least 2 colors (for two distinct players).');
  allTestsPassed = false;
} else {
  console.log('Test PASSED: COLOR_PALETTE has sufficient colors.');
}

// Test: Check if Player 1's default profile color is a valid color from the palette.
// The cast to ColorPaletteType is necessary because `includes` expects the same type.
if (!COLOR_PALETTE.includes(DEFAULT_PLAYER_1_PROFILE_BASE.color as ColorPaletteType)) {
  console.error(`Test FAILED: DEFAULT_PLAYER_1_PROFILE_BASE.color (${DEFAULT_PLAYER_1_PROFILE_BASE.color}) is not in the COLOR_PALETTE.`);
  allTestsPassed = false;
} else {
  console.log('Test PASSED: DEFAULT_PLAYER_1_PROFILE_BASE.color is valid.');
}

// Test: Check if Player 2's default profile color is a valid color from the palette.
if (!COLOR_PALETTE.includes(DEFAULT_PLAYER_2_PROFILE_BASE.color as ColorPaletteType)) {
  console.error(`Test FAILED: DEFAULT_PLAYER_2_PROFILE_BASE.color (${DEFAULT_PLAYER_2_PROFILE_BASE.color}) is not in the COLOR_PALETTE.`);
  allTestsPassed = false;
} else {
  console.log('Test PASSED: DEFAULT_PLAYER_2_PROFILE_BASE.color is valid.');
}

// Test: Ensure default player profile colors are distinct to avoid confusion.
if (DEFAULT_PLAYER_1_PROFILE_BASE.color === DEFAULT_PLAYER_2_PROFILE_BASE.color) {
  console.error('Test FAILED: Default player profile colors are the same, which should not happen for distinct defaults.');
  allTestsPassed = false;
} else {
  console.log('Test PASSED: Default player profile colors are different.');
}

// Test: Validate default 'per game' timer duration against its minimum.
if (DEFAULT_TIMER_SETTINGS.durationPerGame < MIN_TIMER_DURATION_PER_GAME) {
  console.error(`Test FAILED: DEFAULT_TIMER_SETTINGS.durationPerGame (${DEFAULT_TIMER_SETTINGS.durationPerGame}s) is less than MIN_TIMER_DURATION_PER_GAME (${MIN_TIMER_DURATION_PER_GAME}s).`);
  allTestsPassed = false;
} else {
  console.log('Test PASSED: DEFAULT_TIMER_SETTINGS.durationPerGame is valid.');
}

// Test: Validate default 'per turn' timer duration against its minimum.
if (DEFAULT_TIMER_SETTINGS.durationPerTurn < MIN_TIMER_DURATION_PER_TURN) {
  console.error(`Test FAILED: DEFAULT_TIMER_SETTINGS.durationPerTurn (${DEFAULT_TIMER_SETTINGS.durationPerTurn}s) is less than MIN_TIMER_DURATION_PER_TURN (${MIN_TIMER_DURATION_PER_TURN}s).`);
  allTestsPassed = false;
} else {
  console.log('Test PASSED: DEFAULT_TIMER_SETTINGS.durationPerTurn is valid.');
}

// Summary of test results.
if (allTestsPassed) {
  console.log('All gameConstants.ts tests passed!');
} else {
  console.error('Some gameConstants.ts tests FAILED.');
}
expect(allTestsPassed).toBe(true);
});
});
