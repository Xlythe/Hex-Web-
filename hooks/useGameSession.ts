
import { useContext } from 'react';
import { GameSessionContext, GameSessionContextType } from '../contexts/GameSessionProvider';

/**
 * Custom hook to access the game session context.
 * Provides an easy way to get game state, display data, and game actions.
 * Throws an error if used outside of a GameSessionProvider.
 */
export const useGameSession = (): GameSessionContextType => {
  const context = useContext(GameSessionContext);
  if (context === undefined) {
    throw new Error('useGameSession must be used within a GameSessionProvider');
  }
  return context;
};
