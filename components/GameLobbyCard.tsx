import React from 'react';
import { LobbyGameSession, LobbyGameSessionMember } from '../types';

// --- Constants for Game Status ---
/** Represents the game status when a session is open for players to join. */
const GAME_STATUS_WAITING = 'WAITING';
/** Represents the game status when a session is initializing but may be joinable. */
const GAME_STATUS_INIT = 'INIT'; // Often used for games just created, before fully 'WAITING'

// --- Component Props Definition ---
/**
 * Props for the `GameLobbyCard` component.
 */
interface GameLobbyCardProps {
  /** The game session data object containing all details for a lobby entry. */
  session: LobbyGameSession;
  /** 
   * Callback function invoked when the user clicks the "Join" button.
   * It receives the session object of the card that was clicked.
   */
  onJoin: (session: LobbyGameSession) => void;
  /** 
   * A boolean flag indicating if a join operation for *this specific session card* 
   * is currently in progress. This is used to manage the button's state 
   * (e.g., disable it and show "Joining...").
   */
  isJoining: boolean;
}

/**
 * `GameLobbyCard` is a React functional component responsible for rendering
 * a single game session's information within a game lobby. It displays key details
 * like the host's name, current player count, game privacy, and status.
 * It also provides a "Join" button, with its state and text dynamically updated
 * based on the session's availability and any ongoing join attempts.
 *
 * Accessibility is a key consideration, with ARIA attributes used to provide
 * context for screen reader users.
 *
 * Note: Certain game-specific details (e.g., board size, timer settings)
 * are not displayed as they are assumed to be unavailable in the `LobbyGameSession` data
 * (e.g., if the data comes from an API endpoint like `/api_board_list.php` which
 * might not provide them).
 */
const GameLobbyCard: React.FC<GameLobbyCardProps> = ({ session, onJoin, isJoining }) => {
  
  // --- Derived State and Game Logic ---
  const MAX_PLAYERS_HEX = 2; // Hex is a 2-player game. This could be made dynamic if lobby supports other game types.

  /** 
   * Calculates the number of active players in the session.
   * It filters out members where `place` is "0", which typically indicates a spectator
   * or an unassigned/empty slot rather than an active player.
   */
  const numPlayers = session.members.filter((member: LobbyGameSessionMember) => member.place !== "0").length;
  
  /** Indicates whether the game session has reached its maximum player capacity. */
  const isGameFull = numPlayers >= MAX_PLAYERS_HEX;

  /** 
   * Determines if the game session is in a state that allows new players to join.
   * Games are joinable if their status is 'WAITING' or 'INIT'.
   * The session state is converted to uppercase once for reliable comparison.
   */
  const currentSessionStateUpper = session.state?.toUpperCase();
  const isGameWaiting = currentSessionStateUpper === GAME_STATUS_WAITING || currentSessionStateUpper === GAME_STATUS_INIT;

  /**
   * Determines if the current user is eligible to join this game session.
   * Conditions for joining:
   * 1. The game must not be full.
   * 2. The game status must be 'WAITING' or 'INIT'.
   * 3. A join operation for this specific session must not already be in progress.
   */
  const canJoin = !isGameFull && isGameWaiting && !isJoining;

  // --- UI Text and Accessibility Content Preparation ---

  /** Retrieves the host's name, falling back to owner UID or "Unknown Host". */
  const hostMember = session.members.find((member: LobbyGameSessionMember) => member.uid === session.ownerUid);
  const hostName = hostMember?.name || session.ownerUid || "Unknown Host";

  let buttonText: string;
  let buttonAriaLabelContext: string; // Provides additional context for the button's aria-label, especially when disabled.

  if (isJoining) {
    buttonText = 'Joining...';
    buttonAriaLabelContext = 'Joining this game...';
  } else if (isGameFull) {
    buttonText = 'Full';
    buttonAriaLabelContext = 'Game is full.';
  } else if (!isGameWaiting) {
    // Display the current game state (e.g., "Playing", "Finished") if not waiting.
    // Gracefully handles potentially undefined or empty session.state.
    const statusDisplay = session.state 
      ? session.state.charAt(0).toUpperCase() + session.state.slice(1).toLowerCase() 
      : 'Unavailable'; // Fallback if state is missing.
    buttonText = statusDisplay;
    buttonAriaLabelContext = `Game is ${session.state?.toLowerCase() || 'not available to join'}.`;
  } else {
    buttonText = 'Join Game';
    // When joinable, the context is positive, or can be omitted for a simpler ARIA label if preferred.
    buttonAriaLabelContext = 'Ready to join.'; 
  }
  
  /** Base accessible name for the join button, referencing the host. */
  const baseJoinButtonAriaLabel = `Join game hosted by ${hostName}`;
  
  /**
   * Constructs the full accessible name for the join button.
   * If the game is straightforwardly joinable (button text is "Join Game" and `canJoin` is true),
   * a simpler ARIA label is used. Otherwise, more context (e.g., "Game is full") is appended.
   */
  const joinButtonAriaLabel = canJoin && buttonText === 'Join Game'
    ? baseJoinButtonAriaLabel 
    : `${baseJoinButtonAriaLabel}. ${buttonAriaLabelContext}`;


  // --- Component Rendering ---
  return (
    // Main card container.
    // `aria-labelledby` links this card to the host's name (h3 element) for better
    // screen reader context, making the host's name the "title" of the card.
    <div
      className="bg-theme-card-bg-light dark:bg-theme-card-bg-dark p-4 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-3 sm:space-y-0"
      aria-labelledby={`session-host-${session.sid}`} // Links to the h3 by its ID.
    >
      {/* Left section: Contains game session details. */}
      <div className="flex-grow space-y-1">
        {/* Host's name: Serves as the accessible label for the entire card via `aria-labelledby` on the parent div. */}
        <h3 id={`session-host-${session.sid}`} className="text-lg font-semibold text-theme-text-primary dark:text-theme-icon-dark">
          Host: {hostName}
        </h3>
        
        {/* Session ID and Server information. `break-all` helps manage long, unbreakable strings. */}
        <p className="text-xs text-theme-text-subtle break-all">
          Session ID: {session.sid} (Server: {session.server || "N/A"})
        </p>
        
        {/* Grid layout for other structured game parameters. */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-theme-text-subtle">
          <p>Players: {numPlayers}/{MAX_PLAYERS_HEX}</p>
          <p>Privacy: {session.priv === '1' ? 'Private' : 'Public'}</p>
          {/* Game status: Displayed in lowercase with a 'capitalize' CSS class for consistent title-casing. */}
          <p className="capitalize">Status: {session.state?.toLowerCase() || "Unknown"}</p>
          {/* Note: Game-specific settings like board size or timer are intentionally omitted
              if not available in the `session` data. */}
        </div>
      </div>

      {/* Right section: Join button. */}
      <button
        onClick={() => onJoin(session)} // Triggers the onJoin callback with the current session.
        disabled={!canJoin} // Button is disabled if `canJoin` is false.
        className={`
          ml-0 sm:ml-4 mt-3 sm:mt-0 px-5 py-2.5 text-sm font-medium rounded-lg shadow-md 
          transition-colors duration-150 ease-in-out 
          focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-theme-card-bg-dark 
          whitespace-nowrap 
          ${!canJoin // Conditional styling based on join eligibility.
            ? 'bg-gray-400 dark:bg-gray-600 text-gray-700 dark:text-gray-400 cursor-not-allowed' // Disabled state
            : 'bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white focus:ring-green-500 dark:focus:ring-green-400' // Enabled state
          }
        `}
        aria-label={joinButtonAriaLabel} // Provides comprehensive context for screen readers.
      >
        {buttonText} {/* Text dynamically updates (e.g., "Join Game", "Full", "Joining..."). */}
      </button>
    </div>
  );
};

export default GameLobbyCard;