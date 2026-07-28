
/**
 * @file utils.test.ts
 * @description Basic unit tests for the utility functions in `utils.ts`.
 * These tests are designed to run in the browser console and verify the correctness
 * of time formatting and board creation logic, including edge cases.
 */

import { formatTime, createEmptyBoard } from './utils';
import { MIN_BOARD_SIZE, MAX_BOARD_SIZE, DEFAULT_BOARD_SIZE } from './Constants';

console.log('Running tests for utils.ts');
let allTestsPassed = true;

// --- Test cases for formatTime ---
// This block tests various inputs for the formatTime function, including:
// - Normal time values (e.g., 65 seconds).
// - Zero value.
// - Null, undefined, and negative inputs (expected to return a placeholder).
// - A larger value approaching one hour.
const testCasesFormatTime = [
  { input: 65, expected: '01:05', description: 'Standard conversion' },
  { input: 0, expected: '00:00', description: 'Zero seconds' },
  { input: null, expected: '--:--', description: 'Null input' },
  { input: undefined, expected: '--:--', description: 'Undefined input' },
  { input: -10, expected: '--:--', description: 'Negative input' },
  { input: 3599, expected: '59:59', description: 'Value near one hour' },
];

testCasesFormatTime.forEach(tc => {
  const result = formatTime(tc.input);
  if (result !== tc.expected) {
    console.error(`Test FAILED: formatTime(${String(tc.input)}) for "${tc.description}". Expected ${tc.expected}, got ${result}`);
    allTestsPassed = false;
  } else {
    console.log(`Test PASSED: formatTime(${String(tc.input)}) for "${tc.description}".`);
  }
});

// --- Test cases for createEmptyBoard ---

// Test: createEmptyBoard with a valid size.
// Verifies that a board of the specified valid size is created,
// with correct dimensions and all cells initialized to null.
const validBoardSize = 5;
const board = createEmptyBoard(validBoardSize, MIN_BOARD_SIZE, MAX_BOARD_SIZE, DEFAULT_BOARD_SIZE);
if (board.length !== validBoardSize || board[0].length !== validBoardSize || board[0][0] !== null) {
  console.error(`Test FAILED: createEmptyBoard(${validBoardSize}) did not create a ${validBoardSize}x${validBoardSize} null board.`);
  allTestsPassed = false;
} else {
  console.log(`Test PASSED: createEmptyBoard(${validBoardSize}) for valid size.`);
}

// Test: createEmptyBoard with an out-of-range (too small) size.
// Verifies that if a size smaller than MIN_BOARD_SIZE is requested,
// the function defaults to creating a board of DEFAULT_BOARD_SIZE.
const tooSmallSize = MIN_BOARD_SIZE - 1; // e.g., 2 if MIN_BOARD_SIZE is 3
const defaultBoardTooSmall = createEmptyBoard(tooSmallSize, MIN_BOARD_SIZE, MAX_BOARD_SIZE, DEFAULT_BOARD_SIZE);
if (defaultBoardTooSmall.length !== DEFAULT_BOARD_SIZE) {
    console.error(`Test FAILED: createEmptyBoard for out-of-range (too small) size. Expected default size ${DEFAULT_BOARD_SIZE}, got ${defaultBoardTooSmall.length}`);
    allTestsPassed = false;
} else {
    console.log('Test PASSED: createEmptyBoard for out-of-range (too small) size defaulted correctly.');
}

// Test: createEmptyBoard with an out-of-range (too large) size.
// Verifies that if a size larger than MAX_BOARD_SIZE is requested,
// the function defaults to creating a board of DEFAULT_BOARD_SIZE.
const tooLargeSize = MAX_BOARD_SIZE + 1;
const defaultBoardTooLarge = createEmptyBoard(tooLargeSize, MIN_BOARD_SIZE, MAX_BOARD_SIZE, DEFAULT_BOARD_SIZE);
if (defaultBoardTooLarge.length !== DEFAULT_BOARD_SIZE) {
    console.error(`Test FAILED: createEmptyBoard for out-of-range (too large) size. Expected default size ${DEFAULT_BOARD_SIZE}, got ${defaultBoardTooLarge.length}`);
    allTestsPassed = false;
} else {
    console.log('Test PASSED: createEmptyBoard for out-of-range (too large) size defaulted correctly.');
}


// --- Summary of test results ---
if (allTestsPassed) {
  console.log('All utils.ts tests passed!');
} else {
  console.error('Some utils.ts tests FAILED.');
}
