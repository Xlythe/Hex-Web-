
import React, { useState, ChangeEvent, FormEvent } from 'react';
// Type definitions for API request parameters and response/error structures.
import { IgUserLoginParams, IgUserLoginSuccessResponse, IgUserRegistrationError } from '../types';
// Shared API instance for making network requests (e.g., to a backend).
// import { api } from '../api'; // No longer calling api directly
import { useAuth } from '../hooks/useAuth'; // Import useAuth hook
import { CloseIcon } from '../icons/CloseIcon';
import { ChevronDownIcon } from '../icons/ChevronDownIcon';

/**
 * Defines the properties (props) accepted by the LoginModal component.
 */
interface LoginModalProps {
  /** Controls whether the modal is currently visible or hidden. */
  isOpen: boolean;
  /** Callback function to be invoked when the modal requests to be closed (e.g., user clicks overlay or close button). */
  onClose: () => void;
  /**
   * Callback function to be invoked upon successful user login.
   * It receives an object containing the user's unique ID, name, and session ID.
   * Note: This callback is now primarily for modal-specific actions like closing it,
   * as the global user state is handled by AuthContext.
   */
  onLoginSuccess: (user: { uid: string; name: string; session_id: string }) => void;
  /** Callback function to switch the view from the login modal to a signup/registration modal. */
  onSwitchToSignup: () => void;
}

/**
 * `LoginModal` is a React functional component that provides a user interface
 * for users to log into their accounts. It handles form input, communicates
 * with a backend API for authentication, manages loading states, and displays
 * success or error messages.
 */
export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  onSwitchToSignup,
}) => {
  // --- State Management ---
  const { login: authContextLogin, isAuthLoading } = useAuth(); // Use login function and loading state from AuthContext

  /**
   * State for managing the login form data (nickname/email and password).
   */
  const [formData, setFormData] = useState<Omit<IgUserLoginParams, 'networkuid' | 'md5'>>({
    login: '',    // User's nickname or email
    password: '', // User's password
  });

  // isLoading state is now derived from isAuthLoading from context.
  // const [isLoading, setIsLoading] = useState(false); // Replaced by isAuthLoading

  /**
   * State to store error information from a failed login attempt.
   */
  const [error, setError] = useState<IgUserRegistrationError | string | null>(null);

  /** State to control the visibility of the expandable detailed error information section. */
  const [isErrorDetailsOpen, setIsErrorDetailsOpen] = useState(false);

  // --- Early Return ---
  if (!isOpen) return null;

  // --- Event Handlers ---

  /**
   * Handles changes in the form input fields.
   */
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
    setIsErrorDetailsOpen(false);
  };

  /**
   * Handles the submission of the login form.
   */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsErrorDetailsOpen(false);

    if (!formData.login.trim()) {
      setError("Nickname or Email is required.");
      return;
    }
    if (!formData.password.trim()) {
      setError("Password is required.");
      return;
    }

    // Call the login function from AuthContext
    const authResult = await authContextLogin(formData);

    if (authResult.error) {
      setError(authResult.error);
    } else {
      // AuthContext's login function handles setting the loggedInUser.
      // onLoginSuccess prop is now primarily for App.tsx to close the modal.
      // The actual user data for this callback might not be directly available from AuthResult
      // if AuthResult is simplified. However, AuthManager updates loggedInUser, which App.tsx consumes.
      // For the sake of the existing onLoginSuccess prop signature, we can pass placeholder or derive from loggedInUser if needed.
      // Best is if onLoginSuccess doesn't *need* the user object anymore if parent relies on context.
      // Assuming AuthManager.tsx has updated loggedInUser, we can use that.
      // However, `loggedInUser` from `useAuth()` might not be updated yet in this exact render cycle.
      // The key is that `onClose()` (called by `onLoginSuccess` via `App.tsx`) will close the modal.
      // The `loggedInUser` state update will trigger re-renders elsewhere.
      // For now, let's assume onLoginSuccess might still expect some user-like data,
      // though it's mainly for closing. We can send minimal data or adjust the prop if needed.
      // Let's pass some minimal data based on what `authResult` *might* implicitly contain if it were richer,
      // or rely on the parent component to handle UI changes based on the new `loggedInUser` from context.
      // The main goal here is that the global state *is* updated by `authContextLogin`.
      
      // The `onLoginSuccess` prop definition expects uid, name, session_id.
      // The `AuthResult` from `AuthManager.login` is `{ success: true, error: null }`.
      // This means `LoginModal` cannot directly fulfill the `onLoginSuccess` prop signature after this change.
      // The parent component `AppContent`'s `handleLoginSuccessWithModal` function, which is passed as `onLoginSuccess`,
      // *doesn't actually use the user object passed to it*. It just closes the modal.
      // So, we can pass a dummy object or, ideally, refactor `handleLoginSuccessWithModal` to not expect parameters.
      // For minimal change, let's pass a dummy object that matches the signature.
      onLoginSuccess({ uid: '', name: '', session_id: '' }); // This is primarily to trigger modal close in App.tsx
      // onClose(); // `onLoginSuccess` in App.tsx will call `setIsLoginModalOpen(false)`
    }
  };

  // --- Derived State / Computed Values ---
  const canShowErrorDetails = typeof error === 'object' && error !== null && (error.rawXmlResponse || error.httpStatusCode);

  // --- Styling Constants ---
  const textInputBaseClasses = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50";
  const labelBaseClasses = "block text-sm font-medium text-theme-text-primary dark:text-theme-icon-dark";

  // --- JSX Rendering ---
  return (
    <div
      className="fixed inset-0 bg-black/70 dark:bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
      onClick={onClose}
    >
      <div
        className="bg-theme-card-bg-light dark:bg-theme-card-bg-dark p-6 rounded-lg shadow-xl max-w-md w-full text-theme-text-primary dark:text-theme-icon-dark"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 id="login-modal-title" className="text-2xl font-bold">Login</h2>
          <button
            onClick={onClose}
            aria-label="Close login"
            className="p-1 text-theme-icon-light dark:text-theme-icon-dark hover:text-theme-icon-light-hover dark:hover:text-theme-icon-dark-hover rounded-full hover:bg-theme-button-icon-bg-hover-light dark:hover:bg-theme-button-icon-bg-hover-dark transition-colors focus:outline-none focus:ring-0"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login" className={labelBaseClasses}>Nickname or Email <span className="text-red-500">*</span></label>
            <input
              type="text"
              name="login"
              id="login"
              value={formData.login}
              onChange={handleChange}
              className={textInputBaseClasses}
              required
              disabled={isAuthLoading} // Use isAuthLoading from context
            />
          </div>

          <div>
            <label htmlFor="password" className={labelBaseClasses}>Password <span className="text-red-500">*</span></label>
            <input
              type="password"
              name="password"
              id="password"
              value={formData.password}
              onChange={handleChange}
              className={textInputBaseClasses}
              required
              disabled={isAuthLoading} // Use isAuthLoading from context
            />
          </div>

          {error && (
             <div className="my-2 p-3 bg-red-100 dark:bg-red-800 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-100 rounded-md text-sm" role="alert">
              <div
                className={`flex justify-between items-center ${canShowErrorDetails ? 'cursor-pointer' : ''}`}
                onClick={() => canShowErrorDetails && setIsErrorDetailsOpen(!isErrorDetailsOpen)}
                onKeyDown={(e) => { if (canShowErrorDetails && (e.key === 'Enter' || e.key === ' ')) setIsErrorDetailsOpen(!isErrorDetailsOpen);}}
                tabIndex={canShowErrorDetails ? 0 : -1}
                aria-expanded={isErrorDetailsOpen}
                aria-controls="error-details-login"
              >
                <span>{typeof error === 'string' ? error : error.message}</span>
                {canShowErrorDetails && (
                  <ChevronDownIcon className={`w-4 h-4 transition-transform duration-200 ${isErrorDetailsOpen ? 'transform rotate-180' : ''}`} />
                )}
              </div>
              {canShowErrorDetails && isErrorDetailsOpen && typeof error === 'object' && (
                <div id="error-details-login" className="mt-2 pt-2 border-t border-red-300 dark:border-red-700">
                  {error.httpStatusCode && (
                    <p><strong>HTTP Status:</strong> {error.httpStatusCode} {error.httpStatusText || ''}</p>
                  )}
                  {error.rawXmlResponse && (
                    <>
                      <p className="mt-1"><strong>Raw Server Response:</strong></p>
                      <pre className="mt-1 p-2 bg-red-50 dark:bg-red-900/50 text-xs rounded max-h-32 overflow-auto whitespace-pre-wrap break-all">
                        {error.rawXmlResponse}
                      </pre>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-theme-divider-light dark:border-theme-divider-dark flex flex-col sm:flex-row justify-between items-center space-y-2 sm:space-y-0 sm:space-x-3">
            <button
                type="button"
                onClick={onSwitchToSignup}
                disabled={isAuthLoading} // Use isAuthLoading from context
                className="text-sm text-theme-link-dark dark:text-theme-link-dark-hover hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Don't have an account? Sign Up
            </button>
            <div className="flex space-x-3">
                 <button
                    type="button"
                    onClick={onClose}
                    disabled={isAuthLoading} // Use isAuthLoading from context
                    className="px-4 py-2 text-sm font-medium rounded-lg shadow-sm border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-theme-text-primary dark:text-theme-icon-dark transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-yellow-500 dark:focus:ring-offset-theme-card-bg-dark disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAuthLoading} // Use isAuthLoading from context
                    className="px-4 py-2 text-sm font-medium rounded-lg shadow-sm text-theme-button-primary-text-light dark:text-theme-button-primary-text-dark bg-theme-button-primary-bg-light hover:bg-theme-button-primary-bg-light-hover dark:bg-theme-button-primary-bg-dark dark:hover:bg-theme-button-primary-bg-dark-hover transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-yellow-500 dark:focus:ring-offset-theme-card-bg-dark disabled:opacity-50"
                  >
                    {isAuthLoading ? 'Logging In...' : 'Login'}
                  </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
