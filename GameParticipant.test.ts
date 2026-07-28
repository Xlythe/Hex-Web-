
// Basic test structure for GameParticipant.ts
import { GameParticipant } from './GameParticipant';
import { Player } from './types';
import { DEFAULT_PLAYER_1_PROFILE_BASE, DEFAULT_PLAYER_2_PROFILE_BASE, COLOR_PALETTE } from './Constants';

/**
 * @file GameParticipant.test.ts
 * @description Unit tests for the `GameParticipant` class.
 * These tests verify the correct initialization of participants, profile updates,
 * and validation logic (e.g., name trimming, color defaulting on invalid input).
 * Tests are executed in the browser console.
 */
console.log('Running tests for GameParticipant.ts');
let allTestsPassed = true;

// Test: Constructor with default profile for Player 1
// Verifies that a GameParticipant for Player.ONE is correctly initialized with default P1 profile data.
const participant1 = new GameParticipant(Player.ONE, { ...DEFAULT_PLAYER_1_PROFILE_BASE });
if (participant1.initialBoardSide !== Player.ONE || participant1.profile.name !== DEFAULT_PLAYER_1_PROFILE_BASE.name) {
  console.error('Test FAILED: GameParticipant constructor did not set values correctly for Player 1.');
  allTestsPassed = false;
} else {
  console.log('Test PASSED: GameParticipant constructor for Player 1.');
}

// Test: updateProfile functionality
// Verifies that `updateProfile` correctly sets a new name (including trimming) and a valid color.
participant1.updateProfile(" New Name ", COLOR_PALETTE[2]);
if (participant1.profile.name !== "New Name" || participant1.profile.color !== COLOR_PALETTE[2]) {
  console.error('Test FAILED: GameParticipant updateProfile did not work (name trim or color set).');
  allTestsPassed = false;
} else {
  console.log('Test PASSED: GameParticipant updateProfile.');
}

// Test: Constructor with an invalid color
// Verifies that if a participant is constructed with an invalid color, it defaults to the correct player's default color.
const participant2 = new GameParticipant(Player.TWO, { name: "P2", color: "#INVALIDCOLOR" });
const expectedP2DefaultColor = DEFAULT_PLAYER_2_PROFILE_BASE.color;
if (participant2.profile.color !== expectedP2DefaultColor) {
    console.error(`Test FAILED: GameParticipant with invalid color on construction did not default correctly. Expected ${expectedP2DefaultColor}, got ${participant2.profile.color}`);
    allTestsPassed = false;
} else {
    console.log('Test PASSED: GameParticipant invalid color on construction defaults correctly.');
}

// Test: updateProfile with an invalid color
// Verifies that updating a profile with an invalid color results in the color defaulting.
participant2.updateProfile("P2 Updated", "#ANOTHERINVALID");
if(participant2.profile.color !== expectedP2DefaultColor) {
    console.error(`Test FAILED: GameParticipant updateProfile with invalid color did not default. Expected ${expectedP2DefaultColor}, got ${participant2.profile.color}`);
    allTestsPassed = false;
} else {
    console.log('Test PASSED: GameParticipant updateProfile with invalid color defaults correctly.');
}


// Test: Constructor with an empty name
// Verifies that an empty or whitespace-only name provided during construction defaults to the player's default name.
const participant3 = new GameParticipant(Player.ONE, { name: "  ", color: COLOR_PALETTE[0] });
if (participant3.profile.name !== DEFAULT_PLAYER_1_PROFILE_BASE.name) { // Default name for P1
    console.error(`Test FAILED: GameParticipant with empty name on construction did not default correctly. Got '${participant3.profile.name}', expected '${DEFAULT_PLAYER_1_PROFILE_BASE.name}'`);
    allTestsPassed = false;
} else {
    console.log('Test PASSED: GameParticipant empty name on construction defaults correctly.');
}

// Test: updateProfile with an empty name
// Verifies that `updateProfile` with an empty or whitespace name correctly trims it to an empty string.
// The `GameParticipant` class itself allows an empty name here; `GameOptions` might enforce non-emptiness later.
participant3.updateProfile("   ", COLOR_PALETTE[1]); // Update with empty name
if (participant3.profile.name !== "") { // Name should be trimmed empty string
    console.error(`Test FAILED: updateProfile with empty string name did not result in empty string. Got '${participant3.profile.name}'`);
    allTestsPassed = false;
} else {
    console.log('Test PASSED: updateProfile with empty string name keeps it empty (trimmed).');
}

// Summary of test results.
if (allTestsPassed) {
  console.log('All GameParticipant.ts tests passed!');
} else {
  console.error('Some GameParticipant.ts tests FAILED.');
}