
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthManager'; // AuthContext is exported from AuthManager
import type { AuthContextType } from '../types'; // AuthContextType is defined and exported from types.ts

/**
 * Custom hook to access the authentication context.
 * Provides an easy way to get user data and auth actions.
 * Throws an error if used outside of an AuthManagerProvider.
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthManagerProvider');
  }
  return context;
};