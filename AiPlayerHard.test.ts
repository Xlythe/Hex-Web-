
import { AiPlayerHard } from './AiPlayerHard';
import { BoardMatrix, Coordinate, Player } from '../types'; // Assuming types.ts is in parent directory

/**
 * @file AiPlayerHard.test.ts
 * @description Unit tests for the AiPlayerHard class.
 * These tests verify critical decision-making capabilities of the AI, including:
 * - Making direct winning moves.
 * - Completing bridge formations for strategic advantage.
 * - Defensively blocking an opponent's imminent win.
 * Tests are executed in the browser console.
 */

console.log('Running tests for AiPlayerHard.ts');
let allHardTestsPassed = true;

const aiHard = new AiPlayerHard(); // Default depth/beam

function getEmptyCellsForTest(board: BoardMatrix): Coordinate[] {
  const empty: Coordinate[] = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c] === null) {
        empty.push({ r, c });
      }
    }
  }
  return empty;
}

function runAiTest(
  description: string,
  board: BoardMatrix,
  aiPlayerSide: Player,
  expectedMove: Coordinate | null
) {
  console.log(`--- Test: ${description} ---`);
  const emptyCells = getEmptyCellsForTest(board);
  const move = aiHard.getMove(board, aiPlayerSide, emptyCells);

  let pass = false;
  if (expectedMove === null && move === null) {
    pass = true;
  } else if (expectedMove && move && move.r === expectedMove.r && move.c === expectedMove.c) {
    pass = true;
  }

  if (pass) {
    console.log(`Test PASSED: ${description}. AI chose ${JSON.stringify(move)}`);
  } else {
    console.error(`Test FAILED: ${description}. AI chose ${JSON.stringify(move)}, Expected ${JSON.stringify(expectedMove)}`);
    console.log("Board state:");
    board.forEach(row => console.log(row.map(cell => cell === Player.ONE ? '1' : cell === Player.TWO ? '2' : '.').join(' ')));
    allHardTestsPassed = false;
  }
  return pass;
}

// --- Test Cases ---

// Test Case 1: AI Player.ONE (Horizontal) one move from winning
const boardWinP1: BoardMatrix = [
  [null, Player.TWO, null],
  [Player.ONE, Player.ONE, null], // AI P1 should play (1,2)
  [null, Player.TWO, null]
];
runAiTest("AI P1 (Horizontal) Wins", boardWinP1, Player.ONE, { r: 1, c: 2 });

// Test Case 2: AI Player.TWO (Vertical) one move from winning
const boardWinP2: BoardMatrix = [
  [Player.TWO, Player.ONE, null],
  [null, Player.TWO, Player.ONE],
  [null, null, Player.ONE]      // AI P2 should play (2,1) to connect with (1,1)
];
// For P2 to win at (2,1), it needs to connect with (1,1)
// Correcting the board for P2 win at (2,1)
const boardWinP2_corrected: BoardMatrix = [
  [Player.ONE, Player.TWO, null],
  [null, Player.TWO, Player.ONE],
  [Player.ONE, null, null]      // AI P2 should play (2,1)
];
runAiTest("AI P2 (Vertical) Wins", boardWinP2_corrected, Player.TWO, { r: 2, c: 1 });


// Test Case 3: AI Player.ONE (Horizontal) to complete a bridge
// P1 pieces at (0,1) and (2,1). AI P1 should play (1,1).
const boardBridgeP1: BoardMatrix = [
  [Player.TWO, Player.ONE, Player.TWO],
  [null,       null,       null], // AI P1 should play (1,1)
  [Player.TWO, Player.ONE, Player.TWO]
];
runAiTest("AI P1 (Horizontal) Completes Bridge", boardBridgeP1, Player.ONE, { r: 1, c: 1 });


// Test Case 4: AI Player.ONE (Horizontal) blocks opponent P2 (Vertical) win
// Opponent P2 (X) wants to play (2,1) to win. AI P1 (O) must play (2,1).
// P1 is 'O', P2 is 'X'
const boardBlockP2Win: BoardMatrix = [
  [null, Player.TWO, null],
  [Player.ONE, Player.TWO, Player.ONE],
  [null, null, null]      // P2 wants (2,1). AI P1 must play (2,1).
];
runAiTest("AI P1 (Horizontal) Blocks P2 Win", boardBlockP2Win, Player.ONE, { r: 2, c: 1 });

// Test Case 5: AI Player.TWO (Vertical) blocks opponent P1 (Horizontal) win
// Opponent P1 (X) wants to play (1,2) to win. AI P2 (O) must play (1,2).
// P2 is 'O', P1 is 'X'
const boardBlockP1Win: BoardMatrix = [
  [Player.TWO, null, null],
  [Player.ONE, Player.ONE, null], // P1 wants (1,2). AI P2 must play (1,2).
  [Player.TWO, null, null]
];
runAiTest("AI P2 (Vertical) Blocks P1 Win", boardBlockP1Win, Player.TWO, { r: 1, c: 2 });


// Test Case 6: AI Player.ONE more complex defense
// Board 4x4. P1 (O) vs P2 (X)
// P2 (X) threatens a vertical win path.
// . X . .
// O X O .
// . X . .
// . O . .
// P2 (X) can win by playing (2,1) or (0,1).
// If AI is P1 (O), it should block one of these, e.g. (2,1)
const boardDefenseComplexP1: BoardMatrix = [
    [null, Player.TWO, null, null],
    [Player.ONE, Player.TWO, Player.ONE, null],
    [null, Player.TWO, null, null],
    [null, Player.ONE, null, null]
];
runAiTest("AI P1 Complex Defense", boardDefenseComplexP1, Player.ONE, { r: 2, c: 1 });


// Test Case 7: AI Player.TWO more complex defense
// Board 4x4. P2 (O) vs P1 (X)
// P1 (X) threatens a horizontal win path.
// . O . .
// X X X . <- P1 (X) has a strong line
// . O . O
// . . . .
// P1 (X) can win by playing (1,3). AI P2 (O) should block at (1,3)
const boardDefenseComplexP2: BoardMatrix = [
    [null, Player.TWO, null, null],
    [Player.ONE, Player.ONE, Player.ONE, null],
    [null, Player.TWO, null, Player.TWO],
    [null, null, null, null]
];
runAiTest("AI P2 Complex Defense", boardDefenseComplexP2, Player.TWO, { r: 1, c: 3 });


// --- Final summary ---
if (allHardTestsPassed) {
  console.log('All AiPlayerHard.ts tests passed!');
} else {
  console.error('Some AiPlayerHard.ts tests FAILED.');
}

// Ensure this test file is treated as a module
export {};
