
import React, { createContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import {
  LoggedInUser,
  IgUserRegistrationParams,
  IgUserLoginParams,
  IgUserRegistrationError,
  IgUserRegistrationSuccessResponse,
  IgUserLoginSuccessResponse,
  IgUserUpdateParams,
  IgUserProfileData, // Added for caching
  AuthContextType // Updated to AuthContextType from types.ts
} from '../types'; // Core authentication-related type definitions
import { api } from '../api'; // Abstraction layer for API calls
import { 
  LOGGED_IN_USER_STORAGE_KEY, 
  ONE_YEAR_MS, 
  DEBUG,
  USER_PROFILE_CACHE_KEY,        // New constant for profile cache
  USER_PROFILE_CACHE_TIMESTAMP_KEY, // New constant for profile cache timestamp
  PROFILE_CACHE_MAX_AGE_MS       // New constant for cache duration (15 minutes)
} from '../Constants'; // Application-wide constants

/**
 * Defines the structure of the result object returned by authentication operations
 * like login, signup, and profile updates.
 */
export interface AuthResult {
  /** Indicates whether the authentication operation was successful. */
  success: boolean;
  /**
   * Contains error details if the operation failed.
   * Can be a structured `IgUserRegistrationError` object or a generic string message.
   */
  error?: IgUserRegistrationError | string | null;
  /**
   * Specifically for signup: indicates if the automatic login attempt after a successful
   * registration failed. The user might be registered but not logged in.
   */
  autoLoginFailed?: boolean;
  /**
   * Specifically for signup: contains basic information (`uid`, `name`) of the newly
   * registered user, even if the subsequent auto-login failed.
   */
  registeredUser?: Pick<IgUserRegistrationSuccessResponse, 'uid' | 'name'>;
  /**
   * Specifically for signup without a password (e.g. social logins where password isn't immediately available):
   * indicates that the user was registered but needs to perform a manual login step.
   */
  needsManualLogin?: boolean;
}

/**
 * React Context object for authentication.
 * It allows descendant components to subscribe to authentication changes and access auth methods.
 * Initialized as `undefined` and will be provided a value by `AuthManagerProvider`.
 */
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Props for the `AuthManagerProvider` component.
 */
interface AuthManagerProviderProps {
  /** The child components that will have access to the authentication context. */
  children: ReactNode;
}

/**
 * `AuthManagerProvider` is a React component that serves as the central hub for managing
 * user authentication state and logic. It utilizes the React Context API to make authentication
 * data (like `loggedInUser`) and functions (like `login`, `signup`, `logout`) available
 * throughout the component tree.
 *
 * Responsibilities:
 * - Initializes `loggedInUser` state from `localStorage` on mount to persist sessions.
 * - Manages `loggedInUser` state and updates `localStorage` accordingly.
 * - Provides `login`, `signup`, `logout`, and `updateProfile` functions that interact with the backend API.
 * - Tracks loading states for asynchronous authentication operations (`isAuthLoading`).
 * - Implements in-memory caching for user profiles, with background fetch on login.
 */
export const AuthManagerProvider: React.FC<AuthManagerProviderProps> = ({ children }) => {
  const shouldValidateStoredSession = useRef(
    localStorage.getItem(LOGGED_IN_USER_STORAGE_KEY) !== null,
  );
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser | null>(() => {
    const storedUserJson = localStorage.getItem(LOGGED_IN_USER_STORAGE_KEY);
    if (storedUserJson) {
      try {
        const storedUser: LoggedInUser = JSON.parse(storedUserJson);
        if (storedUser.expiryTimestamp && storedUser.expiryTimestamp > Date.now()) {
          if (DEBUG) console.log("AuthManagerProvider: Restored user from localStorage:", storedUser.name);
          return storedUser;
        } else {
          if (DEBUG) console.log("AuthManagerProvider: Stored user session expired or invalid. Clearing.");
          localStorage.removeItem(LOGGED_IN_USER_STORAGE_KEY);
        }
      } catch (e) {
        console.error("AuthManagerProvider: Failed to parse loggedInUser from localStorage:", e);
        localStorage.removeItem(LOGGED_IN_USER_STORAGE_KEY);
      }
    }
    return null;
  });

  const [isAuthLoading, setIsAuthLoading] = useState(false);
  // --- Profile Caching State ---
  const [cachedUserProfile, setCachedUserProfile] = useState<IgUserProfileData | null>(() => {
    const storedProfile = localStorage.getItem(USER_PROFILE_CACHE_KEY);
    try {
      return storedProfile ? JSON.parse(storedProfile) : null;
    } catch (e) {
      console.error("AuthManager: Failed to parse cachedUserProfile from localStorage:", e);
      localStorage.removeItem(USER_PROFILE_CACHE_KEY); // Clear corrupted data
      return null;
    }
  });
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [profileCacheTimestamp, setProfileCacheTimestamp] = useState<number | null>(() => {
    const storedTimestamp = localStorage.getItem(USER_PROFILE_CACHE_TIMESTAMP_KEY);
    return storedTimestamp ? parseInt(storedTimestamp, 10) : null;
  });


  useEffect(() => {
    if (loggedInUser) {
      const userToStore = { ...loggedInUser };
      if (!userToStore.expiryTimestamp || userToStore.expiryTimestamp <= Date.now()) {
        userToStore.expiryTimestamp = Date.now() + ONE_YEAR_MS;
        if (DEBUG) console.log("AuthManagerProvider: Updated/set expiry for user:", userToStore.name);
      }
      localStorage.setItem(LOGGED_IN_USER_STORAGE_KEY, JSON.stringify(userToStore));
      if (DEBUG) console.log("AuthManagerProvider: Saved user to localStorage:", userToStore.name);
    } else {
      localStorage.removeItem(LOGGED_IN_USER_STORAGE_KEY);
      if (DEBUG) console.log("AuthManagerProvider: Removed user from localStorage.");
    }
  }, [loggedInUser]);


  const _fetchAndCacheProfile = useCallback(async (uid: string, sessionId: string, isBackgroundFetch: boolean = false): Promise<IgUserProfileData | IgUserRegistrationError> => {
    if (!isBackgroundFetch) {
      setIsProfileLoading(true);
    }
    try {
      if (DEBUG) console.log(`AuthManager: ${isBackgroundFetch ? 'Background ' : ''}Fetching profile for UID: ${uid}`);
      const result = await api.getUserProfile({ uid, session_id: sessionId, stat: '1', log: '1' });
      
      if (!result.error) {
        const resultAsProfile = result as IgUserProfileData;
        setCachedUserProfile(resultAsProfile);
        const now = Date.now();
        setProfileCacheTimestamp(now);
        localStorage.setItem(USER_PROFILE_CACHE_KEY, JSON.stringify(resultAsProfile));
        localStorage.setItem(USER_PROFILE_CACHE_TIMESTAMP_KEY, String(now));
        if (DEBUG) console.log(`AuthManager: Profile for UID ${uid} cached successfully.`);
        return resultAsProfile;
      } else {
        // API returned an error
        const apiError = result as IgUserRegistrationError;
        if (DEBUG) console.error(`AuthManager: API error fetching profile UID ${uid}:`, apiError.message, apiError);

        // Determine if the cache should be cleared based on the error type.
        // Only clear for errors that definitively invalidate the user's current session or profile data.
        const shouldClearCacheOnError =
          apiError.httpStatusCode === 401 || // Unauthorized
          apiError.httpStatusCode === 403 || // Forbidden
          (apiError.message && (
            apiError.message.toUpperCase().includes("INVALID_SESSION_ID") ||
            apiError.message.toUpperCase().includes("USER NOT FOUND") ||
            apiError.message.toUpperCase().includes("SHOULD_BE_AUTH_ERROR") // From mock API
          ));

        if (shouldClearCacheOnError) {
          if (DEBUG) console.warn(`AuthManager: Clearing profile cache for UID ${uid} due to unrecoverable API error: ${apiError.message}`);
          setCachedUserProfile(null);
          setProfileCacheTimestamp(null);
          localStorage.removeItem(USER_PROFILE_CACHE_KEY);
          localStorage.removeItem(USER_PROFILE_CACHE_TIMESTAMP_KEY);
        } else {
          if (DEBUG) console.warn(`AuthManager: Retaining profile cache for UID ${uid} despite API error: ${apiError.message}. Error not deemed critical for cache invalidation.`);
        }
        return apiError;
      }
    } catch (e: any) {
      // Network error or other exception during fetch
      if (DEBUG) console.error(`AuthManager: Network/Exception during profile fetch for UID ${uid}:`, e);
      // DO NOT clear cache on generic network errors or exceptions. Old cache is better than none.
      // If `isBackgroundFetch` is false, the UI will show an error based on the return value.
      // The `isProfileLoading` state will be set to false in the finally block.
      return { error: true, message: e.message || "Network error during profile fetch." } as IgUserRegistrationError;
    } finally {
      if (!isBackgroundFetch) {
        setIsProfileLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!loggedInUser || !shouldValidateStoredSession.current) return;
    shouldValidateStoredSession.current = false;
    let cancelled = false;

    void _fetchAndCacheProfile(loggedInUser.uid, loggedInUser.session_id, true)
      .then(result => {
        if (cancelled || !result.error) return;
        const message = result.message.toUpperCase();
        if (
          result.httpStatusCode === 401
          || result.httpStatusCode === 403
          || message.includes('INVALID_SESSION')
        ) {
          setLoggedInUser(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loggedInUser, _fetchAndCacheProfile]);


  const handleLoginSuccess = useCallback((user: { uid: string; name: string; session_id: string; }) => {
    const newLoggedInUser: LoggedInUser = {
      uid: user.uid,
      name: user.name,
      session_id: user.session_id,
      expiryTimestamp: Date.now() + ONE_YEAR_MS,
    };
    setLoggedInUser(newLoggedInUser);
    if (DEBUG) console.log("AuthManagerProvider: Login success, user set:", newLoggedInUser.name);
    // Trigger background profile fetch to update/populate cache
    _fetchAndCacheProfile(newLoggedInUser.uid, newLoggedInUser.session_id, true);
    return { success: true, error: null };
  }, [_fetchAndCacheProfile]);


  const login = useCallback(async (params: Omit<IgUserLoginParams, 'networkuid' | 'md5'>): Promise<AuthResult> => {
    setIsAuthLoading(true);
    if (DEBUG) console.log("AuthManagerProvider: Attempting login for:", params.login);
    const result = await api.loginUser(params);
    setIsAuthLoading(false);

    if (result.error) {
      if (DEBUG) console.error("AuthManagerProvider: Login failed:", result.error);
      return { success: false, error: result as IgUserRegistrationError };
    }
    return handleLoginSuccess(result as IgUserLoginSuccessResponse);
  }, [handleLoginSuccess]);

  const signup = useCallback(async (params: Omit<IgUserRegistrationParams, 'networkuid'>, password?: string): Promise<AuthResult> => {
    setIsAuthLoading(true);
    if (DEBUG) console.log("AuthManagerProvider: Attempting signup for:", params.name);
    const registrationResult = await api.registerUser(params);

    if (registrationResult.error) {
      setIsAuthLoading(false);
      if (DEBUG) console.error("AuthManagerProvider: Signup registration failed:", registrationResult.error);
      return { success: false, error: registrationResult as IgUserRegistrationError, autoLoginFailed: false };
    }

    const registeredUser = registrationResult as IgUserRegistrationSuccessResponse;
    if (DEBUG) console.log("AuthManagerProvider: Signup registration successful:", registeredUser.name);

    if (password) {
      if (DEBUG) console.log("AuthManagerProvider: Attempting auto-login post-signup for:", registeredUser.name);
      const loginResult = await api.loginUser({ login: registeredUser.name, password });
      setIsAuthLoading(false);

      if (!loginResult.error) {
        handleLoginSuccess(loginResult as IgUserLoginSuccessResponse);
        return { success: true, error: null, autoLoginFailed: false, registeredUser: { uid: registeredUser.uid, name: registeredUser.name } };
      }
      if (DEBUG) console.warn("AuthManagerProvider: Auto-login post-signup failed for:", registeredUser.name, loginResult.error);
      return { success: true, error: loginResult as IgUserRegistrationError, autoLoginFailed: true, registeredUser: { uid: registeredUser.uid, name: registeredUser.name } };
    }
    
    setIsAuthLoading(false);
    if (DEBUG) console.log("AuthManagerProvider: Signup successful, manual login needed for:", registeredUser.name);
    return { success: true, error: null, autoLoginFailed: false, registeredUser: { uid: registeredUser.uid, name: registeredUser.name }, needsManualLogin: true };
  }, [handleLoginSuccess]);

  const logout = useCallback(() => {
    if (DEBUG) console.log("AuthManagerProvider: Logging out user:", loggedInUser?.name);
    setLoggedInUser(null);
    setCachedUserProfile(null); 
    setProfileCacheTimestamp(null);
    localStorage.removeItem(USER_PROFILE_CACHE_KEY);
    localStorage.removeItem(USER_PROFILE_CACHE_TIMESTAMP_KEY);
    localStorage.removeItem(LOGGED_IN_USER_STORAGE_KEY); // Ensure loggedInUser is also cleared
  }, [loggedInUser?.name]);

  const updateProfile = useCallback(async (params: IgUserUpdateParams): Promise<AuthResult> => {
    setIsAuthLoading(true);
    if (DEBUG) console.log("AuthManagerProvider: Attempting to update profile for:", loggedInUser?.name, "with params:", params);
    const result = await api.updateUserProfile(params);

    if (result.error) {
      setIsAuthLoading(false); 
      if (DEBUG) console.error("AuthManagerProvider: Profile update failed:", result.error);
      return { success: false, error: result as IgUserRegistrationError };
    }

    if (DEBUG) console.log("AuthManagerProvider: Profile update API call successful.");
    
    if (params.name && loggedInUser && params.name !== loggedInUser.name) {
      if (DEBUG) console.log("AuthManagerProvider: Profile name updated locally from", loggedInUser.name, "to", params.name);
      setLoggedInUser(prevUser => prevUser ? { ...prevUser, name: params.name! } : null);
    }
    
    if (loggedInUser) {
      if (DEBUG) console.log("AuthManagerProvider: Refreshing cached profile after update...");
      // Trigger a non-background fetch to immediately reflect changes and update loading state
      await _fetchAndCacheProfile(loggedInUser.uid, loggedInUser.session_id, false);
      if (DEBUG) console.log("AuthManagerProvider: Cached profile refresh complete after update.");
    }

    setIsAuthLoading(false); 
    return { success: true, error: null };
  }, [loggedInUser, _fetchAndCacheProfile]);


  const fetchUserProfile = useCallback(async (forceRefresh: boolean = false): Promise<IgUserProfileData | IgUserRegistrationError | null> => {
    if (!loggedInUser) {
      if (DEBUG) console.warn("AuthManager: fetchUserProfile called without loggedInUser.");
      return { error: true, message: "User not logged in." } as IgUserRegistrationError;
    }

    const now = Date.now();
    const isCacheValid = profileCacheTimestamp && (now - profileCacheTimestamp <= PROFILE_CACHE_MAX_AGE_MS);

    if (cachedUserProfile && !forceRefresh && isCacheValid) {
      if (DEBUG) console.log("AuthManager: Returning profile from cache for UID:", loggedInUser.uid);
      return cachedUserProfile;
    }
    
    if (DEBUG) console.log(`AuthManager: Fetching profile from API for UID: ${loggedInUser.uid}. Force refresh: ${forceRefresh}, Cache stale/missing: ${!isCacheValid}`);
    // This is a foreground fetch if called directly by UI, so isBackgroundFetch is false.
    return _fetchAndCacheProfile(loggedInUser.uid, loggedInUser.session_id, false);
  }, [loggedInUser, cachedUserProfile, profileCacheTimestamp, _fetchAndCacheProfile]);

  return (
    <AuthContext.Provider value={{ 
        loggedInUser, 
        login, 
        signup, 
        logout, 
        updateProfile, 
        isAuthLoading,
        cachedUserProfile,
        isProfileLoading,
        fetchUserProfile
      }}>
      {children}
    </AuthContext.Provider>
  );
};
