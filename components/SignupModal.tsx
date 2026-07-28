
import React, { useState, ChangeEvent, FormEvent } from 'react';
import { IgUserRegistrationParams, IgUserRegistrationSuccessResponse, IgUserRegistrationError } from '../types'; // Types for API request/response
import { useAuth } from '../hooks/useAuth'; // Import useAuth hook
import { AuthResult } from '../contexts/AuthManager'; // Import AuthResult type
import { CloseIcon } from '../icons/CloseIcon';
import { ChevronDownIcon } from '../icons/ChevronDownIcon';

/**
 * Props for the SignupModal component.
 */
interface SignupModalProps {
  /** Controls whether the modal is currently visible or hidden. */
  isOpen: boolean;
  /**
   * Callback function to be invoked when the modal requests to be closed
   * (e.g., by clicking the close button or the backdrop).
   */
  onClose: () => void;
  /**
   * Callback function to be invoked upon successful user registration attempt (which might include auto-login).
   * Passes the AuthResult back to the parent component.
   */
  onSignupSuccess: (authResult: AuthResult) => void;
}

/**
 * Translates known API error codes from user registration into human-readable messages.
 * @param apiErrorMessage The error message string (often an error code) from the API.
 * @returns A user-friendly error message.
 */
const getHumanReadableError = (apiErrorMessage: string): string => {
  switch (apiErrorMessage) {
    case 'DATABASE_ERROR':
      return "A server-side database error occurred. Please try again later.";
    case 'INVALID_APP_ID':
    case 'INVALID_APP_CODE':
      return "Application configuration error. Please contact support.";
    case 'INVALID_EMAIL':
      return "The email address provided is invalid. Please check the format (e.g., user@example.com).";
    case 'INVALID_BIRTH_DATE':
      return "The birth date provided is invalid. Please ensure day, month, and year are correct.";
    case 'INVALID_PASSWORD':
      return "The password provided is invalid. It may be too short or contain disallowed characters.";
    case 'SPECIFY_COUNTRY': // Assuming country might become mandatory or have specific validation
      return "Please specify a valid country code (e.g., US).";
    case 'NICK_TOO_LONG':
      return "Nickname cannot be longer than 15 characters.";
    case 'NICK_INVALID_SYMBOLS':
      return "Nickname contains invalid characters. Please use letters, numbers, and common symbols like '-', '_'.";
    case 'NICK_NO_ENG_LETTERS':
      return "Nickname should contain at least three consecutive English letters.";
    case 'DUPLICATE_NICK':
      return "This nickname is already taken. Please choose another one.";
    case 'DUPLICATE_EMAIL':
      return "This email address is already registered with another account.";
    default:
      // If the error message itself looks like a user-friendly sentence, display it. Otherwise, generic.
      if (apiErrorMessage.includes(' ') && apiErrorMessage.length > 20) {
        return apiErrorMessage;
      }
      return "An unexpected error occurred during registration. Please try again.";
  }
};


/**
 * `SignupModal` is a React functional component that provides a user interface
 * for new user registration. It captures user details through a form,
 * performs client-side validation, submits the data to a registration API,
 * and handles success or error responses.
 */
export const SignupModal: React.FC<SignupModalProps> = ({ isOpen, onClose, onSignupSuccess }) => {
  const { signup: authSignupHook } = useAuth(); // Get signup function from AuthContext

  const [formData, setFormData] = useState<Omit<IgUserRegistrationParams, 'networkuid'>>({
    name: '', password: '', email: '', realName: '', sex: '-',
    birthDay: '', birthMonth: '', birthYear: '', country: '', location: '',
    about: '', subscribeNews: '0', showEmail: '0', showBirthday: '0',
  });

  const [isLocalLoading, setIsLocalLoading] = useState(false);
  
  // Store the primary error message to display to the user (human-readable).
  const [displayedError, setDisplayedError] = useState<string | null>(null);
  // Store the detailed error object from the API for the collapsible section.
  const [detailedError, setDetailedError] = useState<IgUserRegistrationError | null>(null);
  
  const [isErrorDetailsOpen, setIsErrorDetailsOpen] = useState(false);

  if (!isOpen) return null;

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked ? '1' : '0' }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    setDisplayedError(null); // Clear displayed error
    setDetailedError(null);   // Clear detailed error object
    setIsErrorDetailsOpen(false);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDisplayedError(null);
    setDetailedError(null);
    setIsErrorDetailsOpen(false);

    if (!formData.name?.trim()) { setDisplayedError("Nickname is required."); return; }
    if (!formData.password?.trim()) { setDisplayedError("Password is required."); return; }
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) { setDisplayedError("Invalid email format."); return; }
    const { birthDay, birthMonth, birthYear } = formData;
    if (birthDay || birthMonth || birthYear) {
        const day = parseInt(birthDay || '0', 10);
        const month = parseInt(birthMonth || '0', 10);
        const year = parseInt(birthYear || '0', 10);
        if (birthDay && (isNaN(day) || day < 1 || day > 31)) { setDisplayedError("Invalid birth day."); return; }
        if (birthMonth && (isNaN(month) || month < 1 || month > 12)) { setDisplayedError("Invalid birth month."); return; }
        if (birthYear && (isNaN(year) || year < 1900 || year > new Date().getFullYear())) { setDisplayedError("Invalid birth year."); return; }
    }

    setIsLocalLoading(true);
    const authResult = await authSignupHook(formData, formData.password);
    setIsLocalLoading(false);

    if (authResult.error && !authResult.success) { // Primary signup operation failed
        const errorObj = authResult.error as IgUserRegistrationError;
        setDetailedError(errorObj); // Store the full error object for details

        if (typeof authResult.error === 'string') {
            setDisplayedError(authResult.error);
        } else if (errorObj && typeof errorObj.message === 'string') {
            setDisplayedError(getHumanReadableError(errorObj.message));
        } else {
            setDisplayedError("An unknown registration error occurred. Please check the details or try again.");
        }
        return; // Keep modal open by not calling onSignupSuccess
    }
    
    // If signup was successful (authResult.success is true), even if auto-login failed (authResult.error might exist),
    // proceed to call onSignupSuccess. App.tsx will handle modal closing and further user messages.
    onSignupSuccess(authResult);
  };

  const canShowErrorDetails = detailedError && (detailedError.rawXmlResponse || detailedError.httpStatusCode || detailedError.message);

  const textInputBaseClasses = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50";
  const labelBaseClasses = "block text-sm font-medium text-theme-text-primary dark:text-theme-icon-dark";

  return (
    <div
      className="fixed inset-0 bg-black/70 dark:bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-labelledby="signup-modal-title" onClick={onClose}
    >
      <div
        className="bg-theme-card-bg-light dark:bg-theme-card-bg-dark p-6 rounded-lg shadow-xl max-w-lg w-full text-theme-text-primary dark:text-theme-icon-dark overflow-y-auto max-h-[90vh] scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 id="signup-modal-title" className="text-2xl font-bold">Sign Up for Online Play</h2>
          <button onClick={onClose} aria-label="Close sign up" className="p-1 text-theme-icon-light dark:text-theme-icon-dark hover:text-theme-icon-light-hover dark:hover:text-theme-icon-dark-hover rounded-full hover:bg-theme-button-icon-bg-hover-light dark:hover:bg-theme-button-icon-bg-hover-dark transition-colors focus:outline-none focus:ring-0" disabled={isLocalLoading}>
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className={labelBaseClasses}>Nickname <span className="text-red-500">*</span></label>
            <input type="text" name="name" id="name" value={formData.name} onChange={handleChange} className={textInputBaseClasses} maxLength={15} required disabled={isLocalLoading} />
          </div>
          <div>
            <label htmlFor="password" className={labelBaseClasses}>Password <span className="text-red-500">*</span></label>
            <input type="password" name="password" id="password" value={formData.password} onChange={handleChange} className={textInputBaseClasses} required disabled={isLocalLoading} />
          </div>
          <div>
            <label htmlFor="email" className={labelBaseClasses}>Email (Optional)</label>
            <input type="email" name="email" id="email" value={formData.email || ''} onChange={handleChange} className={textInputBaseClasses} disabled={isLocalLoading} />
          </div>
          <div>
            <label htmlFor="realName" className={labelBaseClasses}>Real Name (Optional)</label>
            <input type="text" name="realName" id="realName" value={formData.realName || ''} onChange={handleChange} className={textInputBaseClasses} disabled={isLocalLoading} />
          </div>
          <div>
            <label htmlFor="sex" className={labelBaseClasses}>Sex (Optional)</label>
            <select name="sex" id="sex" value={formData.sex} onChange={handleChange} className={textInputBaseClasses} disabled={isLocalLoading}>
              <option value="-">-</option> <option value="M">Male</option> <option value="F">Female</option>
            </select>
          </div>
          <fieldset className="border border-gray-300 dark:border-gray-700 rounded-md p-3">
            <legend className={`${labelBaseClasses} text-xs px-1`}>Birthday (Optional)</legend>
            <div className="grid grid-cols-3 gap-2">
              <div><label htmlFor="birthDay" className={`${labelBaseClasses} text-xs`}>Day</label><input type="number" name="birthDay" id="birthDay" value={formData.birthDay || ''} onChange={handleChange} className={textInputBaseClasses} min="1" max="31" placeholder="DD" disabled={isLocalLoading} /></div>
              <div><label htmlFor="birthMonth" className={`${labelBaseClasses} text-xs`}>Month</label><input type="number" name="birthMonth" id="birthMonth" value={formData.birthMonth || ''} onChange={handleChange} className={textInputBaseClasses} min="1" max="12" placeholder="MM" disabled={isLocalLoading} /></div>
              <div><label htmlFor="birthYear" className={`${labelBaseClasses} text-xs`}>Year</label><input type="number" name="birthYear" id="birthYear" value={formData.birthYear || ''} onChange={handleChange} className={textInputBaseClasses} min="1900" max={new Date().getFullYear()} placeholder="YYYY" disabled={isLocalLoading} /></div>
            </div>
          </fieldset>
          <div><label htmlFor="country" className={labelBaseClasses}>Country Code (Optional, 2 letters)</label><input type="text" name="country" id="country" value={formData.country || ''} onChange={handleChange} className={textInputBaseClasses} maxLength={2} disabled={isLocalLoading} /></div>
          <div><label htmlFor="location" className={labelBaseClasses}>Location (Optional)</label><input type="text" name="location" id="location" value={formData.location || ''} onChange={handleChange} className={textInputBaseClasses} disabled={isLocalLoading} /></div>
          <div><label htmlFor="about" className={labelBaseClasses}>About Me (Optional)</label><textarea name="about" id="about" value={formData.about || ''} onChange={handleChange} className={textInputBaseClasses} rows={3} disabled={isLocalLoading}></textarea></div>
          <div className="space-y-2 pt-2">
            <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" name="subscribeNews" checked={formData.subscribeNews === '1'} onChange={handleChange} className="form-checkbox h-4 w-4 text-indigo-600 dark:text-yellow-500 border-gray-300 dark:border-gray-600 rounded focus:ring-indigo-500 dark:focus:ring-yellow-600 bg-theme-card-bg-light dark:bg-theme-card-bg-dark" disabled={isLocalLoading} /> <span className={labelBaseClasses}>Subscribe to igGameCenter's newsletter</span></label>
            <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" name="showEmail" checked={formData.showEmail === '1'} onChange={handleChange} className="form-checkbox h-4 w-4 text-indigo-600 dark:text-yellow-500 border-gray-300 dark:border-gray-600 rounded focus:ring-indigo-500 dark:focus:ring-yellow-600 bg-theme-card-bg-light dark:bg-theme-card-bg-dark" disabled={isLocalLoading} /> <span className={labelBaseClasses}>Show email on public profile</span></label>
            <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" name="showBirthday" checked={formData.showBirthday === '1'} onChange={handleChange} className="form-checkbox h-4 w-4 text-indigo-600 dark:text-yellow-500 border-gray-300 dark:border-gray-600 rounded focus:ring-indigo-500 dark:focus:ring-yellow-600 bg-theme-card-bg-light dark:bg-theme-card-bg-dark" disabled={isLocalLoading} /> <span className={labelBaseClasses}>Show birthday on public profile</span></label>
          </div>

          {displayedError && (
            <div className="my-2 p-3 bg-red-100 dark:bg-red-800 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-100 rounded-md text-sm" role="alert">
              <div className={`flex justify-between items-center ${canShowErrorDetails ? 'cursor-pointer' : ''}`}
                onClick={() => canShowErrorDetails && setIsErrorDetailsOpen(!isErrorDetailsOpen)}
                onKeyDown={(e) => { if (canShowErrorDetails && (e.key === 'Enter' || e.key === ' ')) setIsErrorDetailsOpen(!isErrorDetailsOpen);}}
                tabIndex={canShowErrorDetails ? 0 : -1} aria-expanded={isErrorDetailsOpen} aria-controls="error-details-signup"
              >
                <span>{displayedError}</span>
                {canShowErrorDetails && detailedError && (<ChevronDownIcon className={`w-4 h-4 transition-transform duration-200 ${isErrorDetailsOpen ? 'transform rotate-180' : ''}`} />)}
              </div>
              {canShowErrorDetails && isErrorDetailsOpen && detailedError && (
                <div id="error-details-signup" className="mt-2 pt-2 border-t border-red-300 dark:border-red-700">
                  {detailedError.httpStatusCode && (<p><strong>HTTP Status:</strong> {detailedError.httpStatusCode} {detailedError.httpStatusText || ''}</p>)}
                  {detailedError.message && <p className="mt-1"><strong>Original Error Code:</strong> {detailedError.message}</p>}
                  {detailedError.rawXmlResponse && (<><p className="mt-1"><strong>Raw Server Response:</strong></p><pre className="mt-1 p-2 bg-red-50 dark:bg-red-900/50 text-xs rounded max-h-32 overflow-auto whitespace-pre-wrap break-all">{detailedError.rawXmlResponse}</pre></>)}
                </div>
              )}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-theme-divider-light dark:border-theme-divider-dark flex justify-end space-x-3">
            <button type="button" onClick={onClose} disabled={isLocalLoading}
              className="px-4 py-2 text-sm font-medium rounded-lg shadow-sm border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-theme-text-primary dark:text-theme-icon-dark transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-yellow-500 dark:focus:ring-offset-theme-card-bg-dark disabled:opacity-50"
            > Cancel </button>
            <button type="submit" disabled={isLocalLoading}
              className="px-4 py-2 text-sm font-medium rounded-lg shadow-sm text-theme-button-primary-text-light dark:text-theme-button-primary-text-dark bg-theme-button-primary-bg-light hover:bg-theme-button-primary-bg-light-hover dark:bg-theme-button-primary-bg-dark dark:hover:bg-theme-button-primary-bg-dark-hover transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-yellow-500 dark:focus:ring-offset-theme-card-bg-dark disabled:opacity-50"
            > {isLocalLoading ? 'Signing Up...' : 'Sign Up'} </button>
          </div>
        </form>
      </div>
    </div>
  );
};
