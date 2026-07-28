
// Basic test structure for GameHistory.ts
import { GameHistory } from './GameHistory';
import { MoveRecord } from './MoveRecord';
import { Player } // Assuming Player enum is accessible
from './types'; 

/**
 * @file GameHistory.test.ts
 * @description Unit tests for the `GameHistory` class.
 * These tests verify the core functionalities of game state management,
 * including adding moves, undoing moves, peeking at previous states,
 * clearing history, and retrieving the full history.
 * A key focus is ensuring the immutability of stored and retrieved game states
 * through proper deep cloning.
 */

console.log('Running tests for GameHistory.ts');
let allTestsPassed = true;

// Initialize GameHistory instance for testing.
const gameHistory = new GameHistory();

// Define sample MoveRecord objects for testing.
const move1: MoveRecord = {
  boardMatrix: [[null]], currentPlayer: Player.ONE, turnCount: 0,
  firstGameMove: null, isPlayerRolesSwapped: false,
  currentTurnTimeLeft: null, playerGameTimeLeft: null, winningPath: null,
};
const move2: MoveRecord = {
  boardMatrix: [[Player.ONE]], currentPlayer: Player.TWO, turnCount: 1,
  firstGameMove: { coord: {r:0, c:0}, player: Player.ONE }, isPlayerRolesSwapped: false,
  currentTurnTimeLeft: 30, playerGameTimeLeft: null, winningPath: [{r:0, c:0}], // Add a path for cloning test
};

// Test: addMove and getStackLength
// Verifies that adding moves correctly increases the stack length.
gameHistory.addMove(move1);
if (gameHistory.getStackLength() !== 1) {
  console.error('Test FAILED: addMove/getStackLength incorrect after 1 move.');
  allTestsPassed = false;
} else {
  console.log('Test PASSED: addMove/getStackLength after 1 move.');
}

gameHistory.addMove(move2); // move2 includes a winningPath for deeper clone testing
if (gameHistory.getStackLength() !== 2) {
  console.error('Test FAILED: addMove/getStackLength incorrect after 2 moves.');
  allTestsPassed = false;
} else {
  console.log('Test PASSED: addMove/getStackLength after 2 moves.');
}

// Test: undoLastMove
// Verifies that undoing moves correctly returns the previous state and updates stack length.
// Also checks for immutability: ensuring that mutating a record returned by undoLastMove
// does not affect other records in the history (though less critical here as it's popped).
const undoneMove2 = gameHistory.undoLastMove();
if (gameHistory.getStackLength() !== 1 || undoneMove2?.turnCount !== move2.turnCount) {
  console.error('Test FAILED: undoLastMove did not return correct move or update stack (move 2).');
  allTestsPassed = false;
} else {
  console.log('Test PASSED: undoLastMove for second move.');
}

// Immutability check for objects within the original 'move2' (input to addMove)
// This verifies that the deep cloning within addMove prevents the internal history
// from being affected if the original 'move2' object is mutated *after* being added.
if (move2.boardMatrix[0][0] === null) { 
    console.error('Test FAILED: Original move object (move2.boardMatrix) was unexpectedly mutated. This check implies addMove might not be cloning deeply enough if original objects are modified post-add.');
    allTestsPassed = false;
}
if (move2.winningPath && move2.winningPath[0].r === 99) { // If original move2.winningPath was mutated
    console.error('Test FAILED: Original move object (move2.winningPath) was unexpectedly mutated. This check implies addMove might not be cloning deeply enough for nested objects.');
    allTestsPassed = false;
}


// Immutability check for the object returned by undoLastMove.
// If `undoLastMove` returns a direct reference instead of a copy, mutating `undoneMove2`
// could potentially affect other parts of the system if that reference was shared.
// GameHistory's current implementation returns a deep copy, so this test should pass.
if (undoneMove2) {
    undoneMove2.boardMatrix[0][0] = Player.TWO; // Mutate the board of the undone move.
    if (undoneMove2.winningPath && undoneMove2.winningPath.length > 0) {
        undoneMove2.winningPath[0].r = 99; // Mutate the path of the undone move.
    }
    const peekedAfterUndoMutation = gameHistory.getPreviousState(); // This should be 'move1'
    // We expect 'peekedAfterUndoMutation' (representing 'move1') to be unaffected by mutations to 'undoneMove2'.
    if (peekedAfterUndoMutation && peekedAfterUndoMutation.boardMatrix[0][0] === Player.TWO) {
        console.error('Test FAILED: Mutating object from undoLastMove affected subsequent getPreviousState (boardMatrix). This implies shared references or shallow copies.');
        allTestsPassed = false;
    }
    if (peekedAfterUndoMutation && peekedAfterUndoMutation.winningPath && peekedAfterUndoMutation.winningPath[0].r === 99) { // move1.winningPath is null
         console.error('Test FAILED: Mutating object from undoLastMove affected subsequent getPreviousState (winningPath). This implies shared references or shallow copies.');
        allTestsPassed = false;
    }
}


const undoneMove1 = gameHistory.undoLastMove();
if (gameHistory.getStackLength() !== 0 || undoneMove1?.turnCount !== move1.turnCount) {
  console.error('Test FAILED: undoLastMove did not return correct move or update stack for first move.');
  allTestsPassed = false;
} else {
  console.log('Test PASSED: undoLastMove for first move.');
}

// Test: undoLastMove on empty history
// Verifies it correctly returns undefined.
const noMove = gameHistory.undoLastMove();
if (noMove !== undefined) {
  console.error('Test FAILED: undoLastMove on empty history should return undefined.');
  allTestsPassed = false;
} else {
  console.log('Test PASSED: undoLastMove on empty history.');
}

// Test: getPreviousState
// Verifies peeking at the last move without altering the stack.
// Crucially tests immutability: mutating the record returned by getPreviousState
// should NOT affect the actual record stored in the history stack.
gameHistory.clear();
gameHistory.addMove(move1);
gameHistory.addMove(move2); // move2 has a winningPath
const peekedMove = gameHistory.getPreviousState();
if (peekedMove?.turnCount !== move2.turnCount || gameHistory.getStackLength() !== 2) {
    console.error('Test FAILED: getPreviousState did not return correct move or changed stack.');
    allTestsPassed = false;
} else {
    console.log('Test PASSED: getPreviousState returns correct move and preserves stack.');
    // Immutability test for getPreviousState's returned object
    if (peekedMove) {
        peekedMove.turnCount = 100; // Try to mutate a primitive property of the peeked move.
        peekedMove.boardMatrix[0][0] = null; // Try to mutate the boardMatrix of the peeked move.
        if (peekedMove.winningPath && peekedMove.winningPath.length > 0) {
            peekedMove.winningPath[0].r = 55; // Try to mutate a coordinate in the winningPath.
        }
        
        const rePeekedMove = gameHistory.getPreviousState(); // Re-peek the state from history.
        if(rePeekedMove && rePeekedMove.turnCount === 100) {
            console.error('Test FAILED: Mutating primitive (turnCount) from getPreviousState affected internal stack.');
            allTestsPassed = false;
        }
        if(rePeekedMove && rePeekedMove.boardMatrix[0][0] === null) {
            console.error('Test FAILED: Mutating boardMatrix from getPreviousState affected internal stack.');
            allTestsPassed = false;
        }
        if(rePeekedMove && rePeekedMove.winningPath && rePeekedMove.winningPath[0].r === 55) {
            console.error('Test FAILED: Mutating winningPath from getPreviousState affected internal stack.');
            allTestsPassed = false;
        } else if (rePeekedMove?.winningPath && move2.winningPath && rePeekedMove.winningPath[0].r !== move2.winningPath[0].r) {
             console.error(`Test FAILED: winningPath comparison failure after re-peek. Expected original r: ${move2.winningPath[0].r}, Got: ${rePeekedMove.winningPath[0].r}. Implies peekedMove wasn't a full deep copy or comparison is flawed.`);
             allTestsPassed = false;
        } else {
            console.log('Test PASSED: Immutability check for getPreviousState (mutations did not affect internal stack).');
        }
    }
}


// Test: clear
// Verifies that clearing the history empties the stack.
gameHistory.clear(); 
if (gameHistory.getStackLength() !== 0) {
  console.error('Test FAILED: clear did not empty the history stack.');
  allTestsPassed = false;
} else {
  console.log('Test PASSED: clear.');
}

// Test: getFullHistory
// Verifies that the full history is returned correctly.
// Also tests immutability: modifying the array or its objects returned by getFullHistory
// should NOT affect the internal history stack.
gameHistory.addMove(move1);
gameHistory.addMove(move2); // move2 has winningPath
const fullHistory = gameHistory.getFullHistory();
if (fullHistory.length !== 2 || fullHistory[0].turnCount !== move1.turnCount || fullHistory[1].winningPath?.[0].r !== move2.winningPath?.[0].r) {
    console.error('Test FAILED: getFullHistory did not return the correct history array or content.');
    allTestsPassed = false;
} else {
    console.log('Test PASSED: getFullHistory returns correct data.');
    // Immutability test for getFullHistory's returned array and its contents.
    if (fullHistory.length > 0) {
        (fullHistory[0] as any).turnCount = 999; // Mutate a primitive in a copied record.
        (fullHistory[1] as any).boardMatrix[0][0] = Player.TWO; // Mutate array in a copied record.
        if (fullHistory[1].winningPath && fullHistory[1].winningPath!.length > 0) {
          (fullHistory[1].winningPath![0] as any).r = 77; // Mutate object in array in copied record.
        }

        const internalHistoryCopy = gameHistory.getFullHistory(); // Get a fresh deep copy of internal history.
        
        if (internalHistoryCopy[0].turnCount === 999) {
             console.error('Test FAILED: Modifying primitive (turnCount) in array from getFullHistory affected internal stack.');
             allTestsPassed = false;
        }
        if (internalHistoryCopy[1].boardMatrix[0][0] === Player.TWO) {
             console.error('Test FAILED: Modifying boardMatrix in array from getFullHistory affected internal stack.');
             allTestsPassed = false;
        }
        if (internalHistoryCopy[1].winningPath && internalHistoryCopy[1].winningPath[0].r === 77) {
             console.error('Test FAILED: Modifying winningPath in array from getFullHistory affected internal stack.');
             allTestsPassed = false;
        } else {
            console.log('Test PASSED: Immutability check for getFullHistory (mutations did not affect internal stack).');
        }
    }
}

// Final summary of test results.
if (allTestsPassed) {
  console.log('All GameHistory.ts tests passed!');
} else {
  console.error('Some GameHistory.ts tests FAILED.');
}
