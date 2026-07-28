
import React from 'react';
import { CompletedGameEntry, Player, PlayerProfile } from '../types';

/**
 * @file ReplayHistoryList.tsx
 * @description This component displays a list of previously completed games.
 * Each item in the list shows key details of a game (timestamp, winner, duration, settings)
 * and allows the user to click on it to initiate a replay of that game.
 * It relies on a sophisticated prop `getProfileControllingBoardColor` to accurately
 * determine and display player names and colors, especially considering game history complexities like swaps.
 */

interface ReplayHistoryListProps {
  /** An array of `CompletedGameEntry` objects, representing games played and saved. */
  completedGames: CompletedGameEntry[];
  /** Callback function invoked when a user selects a game from the list to start its replay. */
  onStartReplay: (game: CompletedGameEntry) => void;
  /**
   * A crucial callback function to determine the actual player profile (name, color)
   * that was controlling a specific board side (Player.ONE or Player.TWO) at a particular
   * point in the game (or at game end).
   * This function must consider:
   *  - `boardPlayerSide`: The Player.ONE or Player.TWO side in question.
   *  - `player1ProfileForGame`: The profile of the player configured as "Player 1" for that game.
   *  - `player2ProfileForGame`: The profile of the player configured as "Player 2" for that game.
   *  - `wasRolesSwappedInGame`: Whether the player roles were swapped at the point of interest in the game's history.
   *  - `wasPlayer1ProfileAssignedToSideONE_atGameStart`: Whether the configured "Player 1" profile initially started on the Player.ONE side.
   * This is essential for accurately displaying winner information, as the configured profiles might not align
   * directly with board sides due to initial randomization or the swap rule.
   */
  getProfileControllingBoardColor: (
    boardPlayerSide: Player,      
    player1ProfileForGame: PlayerProfile, 
    player2ProfileForGame: PlayerProfile, 
    wasRolesSwappedInGame: boolean,
    wasPlayer1ProfileAssignedToSideONE_atGameStart: boolean   
  ) => PlayerProfile;
}

const ReplayHistoryList: React.FC<ReplayHistoryListProps> = ({ completedGames, onStartReplay, getProfileControllingBoardColor }) => {
  return (
    <div className="mt-8 w-full max-w-2xl bg-theme-card-bg-light dark:bg-theme-card-bg-dark shadow-xl rounded-lg p-4">
      <h2 className="text-xl font-semibold mb-3 text-theme-text-primary dark:text-theme-icon-dark text-center">Game Replays</h2>
      <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
        {completedGames.map(game => {
          let winnerDisplayName = "No one"; 
          let winnerDisplayColor = 'inherit'; // Default color if no specific winner.

          // Determine the winner's display name and color using the provided logic resolver.
          // This is critical because the `game.finalWinnerPlayerColor` (Player.ONE or Player.TWO)
          // needs to be mapped back to the actual configured player profile that controlled that side,
          // considering potential role swaps and initial side assignments.
          if (game.finalWinnerPlayerColor) {
            const winnerProfile = getProfileControllingBoardColor(
              game.finalWinnerPlayerColor,      // The board side (ONE or TWO) that won.
              game.player1Profile,              // The profile configured as P1 for this game.
              game.player2Profile,              // The profile configured as P2 for this game.
              game.wasPlayerRolesSwappedAtGameEnd, // State of role swap at game's end.
              game.wasPlayer1ProfileAssignedToSideONE_atGameStart // Initial P1 profile assignment.
            );
            winnerDisplayName = winnerProfile.name;
            winnerDisplayColor = winnerProfile.color;
          } else if (game.winReason) { // Handle cases like draws or other non-win conclusions if applicable.
            winnerDisplayName = "Draw"; // Or derive from winReason if more specific.
          }


          return (
            <div
              key={game.id}
              className="p-3 border border-theme-divider-light dark:border-theme-divider-dark rounded-md hover:bg-theme-divider-light dark:hover:bg-theme-bg-dark cursor-pointer transition-colors"
              onClick={() => onStartReplay(game)}
              role="button" // Indicates the item is clickable like a button.
              tabIndex={0} // Makes the item focusable for keyboard navigation.
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onStartReplay(game); }} // Allows activation with Enter/Space.
              // Provides a comprehensive accessible name for screen readers.
              aria-label={`Replay game from ${new Date(game.timestamp).toLocaleString()}, Winner: ${winnerDisplayName}`}
            >
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium text-theme-text-primary dark:text-theme-icon-dark">
                  {new Date(game.timestamp).toLocaleString()}
                </span>
                <span className={`font-semibold`} style={{ color: winnerDisplayColor }}>
                  {winnerDisplayName}{game.finalWinnerPlayerColor ? ' Wins' : ''}
                </span>
              </div>
              <div className="text-xs text-theme-text-subtle mt-1">
                Duration: {Math.floor(game.durationSeconds / 60)}m {game.durationSeconds % 60}s | Size: {game.settings.boardSize}x{game.settings.boardSize} | Swap: {game.settings.swapRuleEnabled ? 'On' : 'Off'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ReplayHistoryList;
