
import { useContext } from 'react';
import { OnlinePlayContext } from '../contexts/OnlinePlayManager'; // Correctly import the context value
import { OnlinePlayContextType } from '../types'; // Correctly import the type definition

/**
 * Custom hook to access the online play context.
 * Provides an easy way to get online game state and actions.
 * Throws an error if used outside of an OnlinePlayManagerProvider.
 */
export const useOnlinePlay = (): OnlinePlayContextType => {
  const context = useContext(OnlinePlayContext);
  if (context === undefined) {
    throw new Error('useOnlinePlay must be used within an OnlinePlayManagerProvider');
  }
  return context;
};
