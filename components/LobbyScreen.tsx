import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useOnlinePlay } from '../hooks/useOnlinePlay';
import { LobbyGameSession } from '../types';
import GameLobbyCard from './GameLobbyCard';
import { CloseIcon } from '../icons/CloseIcon'; // Import CloseIcon

/**
 * Props for the LobbyScreen component.
 */
interface LobbyScreenProps {
  /** Callback function invoked when the user requests to close the lobby screen. */
  onClose: () => void;
}

/**
 * LobbyScreen is a full-screen modal component that displays a list of available
 * public game sessions that the user can join. It handles fetching these games,
 * displaying loading/error states, and initiating the join process.
 */
const LobbyScreen: React.FC<LobbyScreenProps> = ({ onClose }) => {
  // Destructure relevant state and functions from the custom online play hook.
  const {
    lobbyGames,           // Array of available game sessions in the lobby.
    isFetchingLobby,      // Boolean indicating if the lobby game list is currently being fetched.
    lobbyError,           // Error message string if fetching lobby games failed.
    fetchLobbyGames,      // Function to trigger a fetch/refresh of lobby games.
    joinLobbyGame,        // Function to attempt joining a specific lobby game session.
    isOnlineActionLoading,// Global boolean indicating if any online action (like joining/creating a game) is in progress.
  } = useOnlinePlay();

  /**
   * State to track the 'sid' (session ID) of the game currently being attempted to join.
   * This helps in providing specific feedback for the joining action and preventing concurrent join attempts.
   * Null if no join attempt is currently active from this screen.
   */
  const [currentlyJoiningSid, setCurrentlyJoiningSid] = useState<string | null>(null);

  /**
   * Effect to fetch lobby games when the component initially mounts.
   * `fetchLobbyGames` is memoized by `useOnlinePlay` hook, ensuring stable dependency.
   */
  useEffect(() => {
    fetchLobbyGames();
  }, [fetchLobbyGames]);

  /**
   * Handles the action of a user attempting to join a game session.
   * It sets local state to indicate a join is in progress for a specific game,
   * then calls the `joinLobbyGame` function from the `useOnlinePlay` hook.
   * @param session The `LobbyGameSession` object representing the game to join.
   */
  const handleJoin = useCallback(async (session: LobbyGameSession) => {
    // Prevent multiple join attempts or joining while another online action is in progress.
    if (isOnlineActionLoading || currentlyJoiningSid) return;

    setCurrentlyJoiningSid(session.sid); // Mark this session as the one being joined.
    try {
      await joinLobbyGame(session);
      // If `joinLobbyGame` is successful, it updates global state (e.g., `onlineGameSessionId`
      // in `OnlinePlayManager`). The main `App.tsx` or a similar parent component is expected
      // to observe this change and automatically handle navigation (e.g., closing the lobby
      // and transitioning to the game screen). Thus, no explicit `onClose()` or success
      // navigation is needed directly from `LobbyScreen` upon successful join.
    } catch (e) {
      // Errors during the join process are typically handled within `joinLobbyGame` itself
      // (e.g., by setting `onlineGameStatusMessage` or `lobbyError`).
      // This console error is for additional client-side debugging if needed.
      console.error("LobbyScreen: Join lobby game attempt failed.", e);
    } finally {
      // Reset the specific joining state, regardless of success or failure.
      // If successful, the lobby will likely be unmounted. If failed, allows user to try again.
      setCurrentlyJoiningSid(null);
    }
  }, [isOnlineActionLoading, currentlyJoiningSid, joinLobbyGame]);

  /**
   * Renders the main content of the lobby based on the current state
   * (loading, error, no games, or list of games).
   * @returns JSX.Element representing the content to display.
   */
  const renderContent = () => {
    // Display loading indicator if fetching and no games/errors are present yet.
    if (isFetchingLobby && !lobbyGames?.length && !lobbyError) {
      return <p className="text-center text-theme-text-subtle py-10 animate-pulse">Loading game lobby...</p>;
    }
    // Display error message if fetching failed.
    if (lobbyError) {
      return <p className="text-center text-red-500 dark:text-red-400 py-10">Error: {lobbyError}</p>;
    }
    // Display message if no games are available.
    if (!lobbyGames || lobbyGames.length === 0) {
      return <p className="text-center text-theme-text-subtle py-10">No public games available right now. Try creating one or check back soon!</p>;
    }
    // Display the list of available game sessions.
    return (
      <div className="space-y-4">
        {lobbyGames.map(session => (
          <GameLobbyCard
            key={session.sid}
            session={session}
            onJoin={() => handleJoin(session)} // Pass session directly to pre-filled handleJoin
            // isJoining is true if this specific card's game is the one currently being joined.
            isJoining={currentlyJoiningSid === session.sid}
          />
        ))}
      </div>
    );
  };

  // Determine if any join action initiated from this screen is active.
  const isCurrentlyJoiningAnyGame = !!currentlyJoiningSid;
  const joiningGameDisplayName = useMemo(() => {
    if (!currentlyJoiningSid || !lobbyGames) return currentlyJoiningSid;
    const session = lobbyGames.find(g => g.sid === currentlyJoiningSid);
    return session?.gameName || currentlyJoiningSid;
  }, [currentlyJoiningSid, lobbyGames]);


  return (
    // Full-screen modal container for the lobby.
    // `aria-modal="true"` and `role="dialog"` improve accessibility.
    <div className="fixed inset-0 bg-theme-bg-light dark:bg-theme-bg-dark z-40 p-4 sm:p-6 md:p-8 flex flex-col" role="dialog" aria-labelledby="lobby-screen-title" aria-modal="true">
      {/* Header section with title and action buttons */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
        <h2 id="lobby-screen-title" className="text-2xl sm:text-3xl font-bold text-theme-text-primary dark:text-theme-icon-dark">Game Lobby</h2>
        <div className="flex items-center space-x-2">
            {/* Refresh Button */}
            <button
                onClick={fetchLobbyGames}
                // Disable if: actively fetching, any online action is globally loading, or a join from this screen is in progress.
                disabled={isFetchingLobby || isOnlineActionLoading || isCurrentlyJoiningAnyGame}
                className="px-3 py-2 sm:px-4 text-xs sm:text-sm font-medium rounded-lg shadow-sm border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-theme-text-primary dark:text-theme-icon-dark transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Refresh game lobby list"
            >
                {isFetchingLobby ? 'Refreshing...' : 'Refresh List'}
            </button>
            {/* Close Button */}
            <button
                onClick={onClose}
                // Disable if: any online action is globally loading or a join from this screen is in progress.
                disabled={isOnlineActionLoading || isCurrentlyJoiningAnyGame}
                className="p-2 text-theme-icon-light dark:text-theme-icon-dark hover:text-theme-icon-light-hover dark:hover:text-theme-icon-dark-hover rounded-full hover:bg-theme-button-icon-bg-hover-light dark:hover:bg-theme-button-icon-bg-hover-dark transition-colors focus:outline-none focus:ring-0 disabled:opacity-50"
                aria-label="Close Lobby"
            >
                <CloseIcon className="w-6 h-6" />
            </button>
        </div>
      </div>

      {/* Scrollable area for game list content */}
      <div className="flex-grow overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
        {renderContent()}
      </div>

       {/* Global joining status message: displayed if a join attempt is active from this screen. */}
       {(isOnlineActionLoading && isCurrentlyJoiningAnyGame) && (
        <div className="text-center mt-4 text-yellow-500 dark:text-theme-link-dark animate-pulse">
          Attempting to join game "{joiningGameDisplayName}"...
        </div>
      )}
    </div>
  );
};

export default LobbyScreen;