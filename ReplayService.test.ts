
// Basic test structure for ReplayService.ts
import { ReplayService, ReplaySnapshot } from './ReplayService';
import { CompletedGameEntry, Player, GamePhase, WinReason, HistoryEntry } from './types';
import { DEFAULT_PLAYER_1_PROFILE_BASE, DEFAULT_PLAYER_2_PROFILE_BASE, DEFAULT_TIMER_SETTINGS } from './Constants';
import { describe, expect, it } from 'vitest';

/**
 * @file ReplayService.test.ts
 * @description Unit tests for the `ReplayService` class.
 * These tests focus on verifying the core logic of game replay functionality:
 * - Starting and stopping replays.
 * - Correctly stepping through game history.
 * - Accurate generation of `ReplaySnapshot` objects at each step.
 * - Proper handling of game-specific details within snapshots, such as player profile assignment (`wasPlayer1ProfileAssignedToSideONE_atGameStart`)
 *   and role swaps (`isPlayerRolesSwapped` from history entries).
 * Tests use mock `CompletedGameEntry` data and simulate timer progression to step through replays.
 * Results are logged to the browser console.
 */
describe('ReplayService', () => {
it('replays snapshots, stops, and disposes cleanly', () => {
console.log('Running tests for ReplayService.ts');
let allTestsPassed = true;
const replayUpdate = { lastSnapshot: null as ReplaySnapshot | null };
let updateCount = 0; // Counts how many times the onUpdateCallback is invoked.

/** Mock callback for ReplayService to track snapshot updates. */
const mockReplayUpdate = (snapshot: ReplaySnapshot | null) => {
  replayUpdate.lastSnapshot = snapshot;
  updateCount++;
};
const currentSnapshot = (): ReplaySnapshot | null => replayUpdate.lastSnapshot;

const replayService = new ReplayService(mockReplayUpdate);

// Define mock player profiles for consistent test data.
const p1ProfileForReplay = { ...DEFAULT_PLAYER_1_PROFILE_BASE, name: "ReplayP1", color: "#FF0000" };
const p2ProfileForReplay = { ...DEFAULT_PLAYER_2_PROFILE_BASE, name: "ReplayP2", color: "#0000FF" };

// Mock CompletedGameEntry: Simulates a game where Player 1's configured profile started on Player.ONE side,
// and no swap occurred during the game.
const mockGame_P1StartsONE_NoSwapInHistory: CompletedGameEntry = {
  id: "test-game-P1ONE-NoSwap",
  timestamp: Date.now(),
  durationSeconds: 120,
  settings: { boardSize: 3, timerSettings: {...DEFAULT_TIMER_SETTINGS, mode: 'off'}, swapRuleEnabled: true },
  player1Profile: p1ProfileForReplay,
  player2Profile: p2ProfileForReplay,
  wasPlayer1ProfileAssignedToSideONE_atGameStart: true, // P1's profile started as Player.ONE side
  finalWinnerPlayerColor: Player.ONE,
  winReason: 'connection' as WinReason,
  finalWinningPath: [{r:0,c:0}, {r:0,c:1}, {r:0,c:2}],
  wasPlayerRolesSwappedAtGameEnd: false, // Roles were not swapped by the end of the game.
  history: [ 
    // Step 0 (currentStepIndex = -1 initially, then 0): Initial empty board state
    { boardMatrix: [[null,null,null],[null,null,null],[null,null,null]], currentPlayer: Player.ONE, turnCount: 0, firstGameMove: null, isPlayerRolesSwapped: false, currentTurnTimeLeft: null, playerGameTimeLeft: null, winningPath: null },
    // Step 1 (currentStepIndex = 1): P1 makes first move, no swap occurs.
    { boardMatrix: [[Player.ONE,null,null],[null,null,null],[null,null,null]], currentPlayer: Player.TWO, turnCount: 1, firstGameMove: {coord: {r:0,c:0}, player:Player.ONE}, isPlayerRolesSwapped: false, currentTurnTimeLeft: null, playerGameTimeLeft: null, winningPath: null },
    // Step 2 (currentStepIndex = 2): Game ends, P1 wins.
    { boardMatrix: [[Player.ONE,Player.ONE,Player.ONE],[Player.TWO,Player.TWO,null],[null,null,null]], currentPlayer: Player.ONE, turnCount: 5, firstGameMove: {coord: {r:0,c:0}, player:Player.ONE}, isPlayerRolesSwapped: false, currentTurnTimeLeft: null, playerGameTimeLeft: null, winningPath: [{r:0,c:0}, {r:0,c:1}, {r:0,c:2}] }, 
  ]
};

// Mock CompletedGameEntry: Simulates a game where Player 2's configured profile started on Player.ONE side,
// and a swap *did* occur during the game.
const mockGame_P2StartsONE_SwapInHistory: CompletedGameEntry = {
  id: "test-game-P2ONE-Swap",
  timestamp: Date.now(),
  durationSeconds: 100,
  settings: { boardSize: 3, timerSettings: {...DEFAULT_TIMER_SETTINGS, mode: 'off'}, swapRuleEnabled: true },
  player1Profile: p1ProfileForReplay, // Configured P1 profile
  player2Profile: p2ProfileForReplay, // Configured P2 profile
  wasPlayer1ProfileAssignedToSideONE_atGameStart: false, // P1's profile started as Player.TWO side (P2's profile was on Player.ONE side)
  finalWinnerPlayerColor: Player.TWO, // Player.TWO side won. Given the start, this means the P1 Config profile won.
  winReason: 'connection' as WinReason,
  finalWinningPath: [{r:0,c:0}, {r:0,c:1}, {r:0,c:2}], // Example path for Player.TWO side
  wasPlayerRolesSwappedAtGameEnd: true, // Roles were swapped by the end.
  history: [ 
    // Step 0: Initial state
    { boardMatrix: [[null,null,null],[null,null,null],[null,null,null]], currentPlayer: Player.ONE, turnCount: 0, firstGameMove: null, isPlayerRolesSwapped: false, currentTurnTimeLeft: null, playerGameTimeLeft: null, winningPath: null },
    // Step 1: Player.ONE side (controlled by P2 config) makes first move.
    { boardMatrix: [[Player.ONE,null,null],[null,null,null],[null,null,null]], currentPlayer: Player.TWO, turnCount: 1, firstGameMove: {coord: {r:0,c:0}, player:Player.ONE}, isPlayerRolesSwapped: false, currentTurnTimeLeft: null, playerGameTimeLeft: null, winningPath: null },
    // Step 2: Player.TWO side (controlled by P1 config) invokes swap. Roles are now swapped. New Player.ONE side is P1 config. Current player becomes new Player.TWO side (original P2 config).
    { boardMatrix: [[Player.ONE,null,null],[null,null,null],[null,null,null]], currentPlayer: Player.ONE, turnCount: 1, firstGameMove: {coord: {r:0,c:0}, player:Player.ONE}, isPlayerRolesSwapped: true, currentTurnTimeLeft: null, playerGameTimeLeft: null, winningPath: null },
    // Step 3: New Player.TWO side (original P2 config) makes a move.
    { boardMatrix: [[Player.ONE,Player.TWO,null],[null,null,null],[null,null,null]], currentPlayer: Player.TWO, turnCount: 2, firstGameMove: {coord: {r:0,c:0}, player:Player.ONE}, isPlayerRolesSwapped: true, currentTurnTimeLeft: null, playerGameTimeLeft: null, winningPath: null },
    // Step 4: Game ends, Player.TWO side (controlled by P1 config due to swap) wins.
    { boardMatrix: [[Player.ONE,Player.TWO,Player.TWO],[Player.ONE,null,null],[Player.ONE,null,null]], currentPlayer: Player.ONE, turnCount: 5, firstGameMove: {coord: {r:0,c:0}, player:Player.ONE}, isPlayerRolesSwapped: true, currentTurnTimeLeft: null, playerGameTimeLeft: null, winningPath: [{r:0,c:0},{r:1,c:0},{r:2,c:0}] }, 
  ]
};

/**
 * Helper function to test a replay scenario.
 * It starts a replay for the given game, manually steps through its history,
 * and verifies snapshot properties at each step.
 * @param gameToTest - The `CompletedGameEntry` to replay.
 * @param description - A description of the test scenario.
 */
function testReplayScenario(gameToTest: CompletedGameEntry, description: string) {
    console.log(`--- Testing Replay Scenario: ${description} ---`);
    replayService.stopReplay(false); // Ensure clean state before starting
    updateCount = 0;
    replayUpdate.lastSnapshot = null;
    
    replayService.startReplay(gameToTest);
    const initialSnapshot = currentSnapshot();

    // Initial checks after startReplay
    if (!replayService.isActive || !initialSnapshot || initialSnapshot.currentStepIndex !== -1 || updateCount === 0) {
        console.error(`Test FAILED (${description}): startReplay did not initialize correctly. Active: ${replayService.isActive}, Snapshot Step: ${initialSnapshot?.currentStepIndex}, Updates: ${updateCount}`);
        allTestsPassed = false;
        return;
    }
    if (initialSnapshot.gameToReplay?.id !== gameToTest.id) {
        console.error(`Test FAILED (${description}): Initial snapshot gameToReplay ID mismatch.`);
        allTestsPassed = false;
    }
    // Verify configured player profiles in the snapshot match the game entry.
    if (initialSnapshot.player1Profile.name !== gameToTest.player1Profile.name || initialSnapshot.player2Profile.name !== gameToTest.player2Profile.name) {
        console.error(`Test FAILED (${description}): Initial snapshot configured player profiles mismatch.`);
        allTestsPassed = false;
    }

    let scenarioPassed = true;
    // Manually step through each history entry
    for (let i = 0; i < gameToTest.history.length; i++) {
        if (!replayService.isActive) {
            console.error(`Test FAILED (${description}): Replay became inactive prematurely at target step index ${i} (snapshot index ${currentSnapshot()?.currentStepIndex}).`);
            allTestsPassed = false; scenarioPassed = false; break;
        }
        // Simulate timer firing by directly calling playNextStep
        (replayService as any).playNextStep(); 
        const stepSnapshot = currentSnapshot();

        if (!stepSnapshot) {
            console.error(`Test FAILED (${description}): lastSnapshot is null during stepping at index ${i}.`);
            allTestsPassed = false; scenarioPassed = false; break;
        }
        // Check if the snapshot's currentStepIndex matches the loop index.
        if (stepSnapshot.currentStepIndex !== i) {
            console.error(`Test FAILED (${description}): Expected currentStepIndex ${i}, got ${stepSnapshot.currentStepIndex}`);
            allTestsPassed = false; scenarioPassed = false; break;
        }
        
        // Verify crucial flags in the snapshot against the game data and history entry.
        const expectedWasP1AssignedONE = gameToTest.wasPlayer1ProfileAssignedToSideONE_atGameStart;
        const expectedIsSwappedFromHistoryEntry = gameToTest.history[i].isPlayerRolesSwapped;

        if (stepSnapshot.wasPlayer1ProfileAssignedToSideONE_atGameStart !== expectedWasP1AssignedONE) {
            console.error(`Test FAILED (${description}): Snapshot at step ${i}, wasPlayer1ProfileAssignedToSideONE_atGameStart mismatch. Expected ${expectedWasP1AssignedONE}, Got ${stepSnapshot.wasPlayer1ProfileAssignedToSideONE_atGameStart}`);
            allTestsPassed = false; scenarioPassed = false;
        }
        if (stepSnapshot.isPlayerRolesSwapped !== expectedIsSwappedFromHistoryEntry) {
            console.error(`Test FAILED (${description}): Snapshot at step ${i}, isPlayerRolesSwapped (from history) mismatch. Expected ${expectedIsSwappedFromHistoryEntry}, Got ${stepSnapshot.isPlayerRolesSwapped}`);
            allTestsPassed = false; scenarioPassed = false;
        }
    }

    // After iterating through all history steps, one more playNextStep should transition to inactive.
    if (scenarioPassed && replayService.isActive) {
        (replayService as any).playNextStep(); // Final step to end replay
    }
    const finalSnapshot = currentSnapshot();

    // Final checks for replay completion
    if (replayService.isActive) {
        console.error(`Test FAILED (${description}): Replay still active after all steps. Step: ${finalSnapshot?.currentStepIndex}, Total History Entries: ${gameToTest.history.length}`);
        allTestsPassed = false; scenarioPassed = false;
    } else if (scenarioPassed && gameToTest.history.length > 0 && (!finalSnapshot || finalSnapshot.currentStepIndex !== gameToTest.history.length - 1)) {
        console.error(`Test FAILED (${description}): Replay ended on incorrect step. Ended at index: ${finalSnapshot?.currentStepIndex}, Expected last index: ${gameToTest.history.length - 1}`);
        allTestsPassed = false; scenarioPassed = false;
    }
    
    if (scenarioPassed) {
        console.log(`Test PASSED: Replay Scenario - ${description}`);
    }
     console.log(`--- End of Replay Scenario: ${description} ---`);
}

// Execute tests for different replay scenarios.
testReplayScenario(mockGame_P1StartsONE_NoSwapInHistory, "P1 Config Starts as Side ONE, No Swap in History");
testReplayScenario(mockGame_P2StartsONE_SwapInHistory, "P2 Config Starts as Side ONE, Swap Occurs in History");


// Test: stopReplay basic functionality
// Verifies that stopReplay deactivates the replay and notifies if requested.
updateCount = 0;
replayUpdate.lastSnapshot = null;
replayService.startReplay(mockGame_P1StartsONE_NoSwapInHistory); 
(replayService as any).playNextStep(); // Advance one step to ensure it's running

updateCount = 0; // Reset counter before testing stopReplay
replayService.stopReplay(true); // Stop with notification
const stoppedSnapshot = currentSnapshot();
if (replayService.isActive || stoppedSnapshot?.isActive) {
  console.error(`Test FAILED (stopReplay): Did not deactivate replay. ReplayActive: ${replayService.isActive}, SnapshotActive: ${stoppedSnapshot?.isActive}`);
  allTestsPassed = false;
} else if (updateCount === 0) {
  console.error('Test FAILED (stopReplay): Did not call onUpdate when notify=true.');
  allTestsPassed = false;
} else {
  console.log('Test PASSED: stopReplay basic functionality (deactivates and notifies).');
}
      
// Test: dispose method
// Verifies that dispose stops any active replay.
replayService.dispose(); 
console.log("Test (Conceptual): dispose called on replayService, expected to clear timers and stop replay.");
if (replayService.isActive) {
    console.error('Test FAILED (dispose): Replay still active after dispose.');
    allTestsPassed = false;
}

// Summary of test results.
if (allTestsPassed) {
  console.log('All ReplayService.ts tests passed (manual stepping with scenarios)!');
} else {
  console.error('Some ReplayService.ts tests FAILED (manual stepping with scenarios).');
}
expect(allTestsPassed).toBe(true);
});
});
