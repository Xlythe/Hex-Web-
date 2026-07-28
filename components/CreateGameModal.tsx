import React, { useState, FormEvent } from 'react';
import {
  TimerMode,
  CustomGameSettings,
  AllowedIncrementSecondsType,
} from '../types'; // Core type definitions for game settings
import { useOnlinePlay } from '../hooks/useOnlinePlay'; // Custom hook for online game functionalities
import { useAuth } from '../hooks/useAuth'; // Custom hook for authentication status
import {
  ALLOWED_ONLINE_SIZES,
  DEFAULT_ONLINE_BOARD_SIZE,
  ALLOWED_ONLINE_GAME_DURATIONS_SECONDS,
  DEFAULT_ONLINE_GAME_DURATION_SECONDS,
  ALLOWED_INCREMENT_SECONDS,
  DEFAULT_ONLINE_TIMER_INCREMENT_SECONDS,
  DEFAULT_ONLINE_RATED_STATUS,
  DEFAULT_ONLINE_HIDDEN_STATUS,
} from '../Constants'; // Application-wide constants for game settings
import { CloseIcon } from '../icons/CloseIcon'; // Import the CloseIcon

/**
 * Props for the CreateGameModal component.
 */
interface CreateGameModalProps {
  /** Controls whether the modal is visible or hidden. */
  isOpen: boolean;
  /** Callback function to be invoked when the modal requests to be closed (e.g., by clicking the close button or overlay). */
  onClose: () => void;
}

/**
 * `CreateGameModal` is a React functional component that provides a user interface
 * for creating new online Hex games. It allows users to configure various game settings
 * such as board size, timer mode, duration, increment, and game visibility/rating.
 *
 * The modal interacts with `useOnlinePlay` hook to submit the game creation request
 * and `useAuth` hook to ensure the user is authenticated.
 */
const CreateGameModal: React.FC<CreateGameModalProps> = ({
  isOpen,
  onClose,
}) => {
  // Hooks for interacting with application state and services
  const { createOnlineGame, isOnlineActionLoading, setOnlineGameStatusMessage } =
    useOnlinePlay(); // Manages online game creation logic and loading/status states.
  const { loggedInUser } = useAuth(); // Provides information about the currently logged-in user.

  // --- Component State ---
  // Each piece of state corresponds to a configurable game setting.
  // Default values are typically sourced from `Constants.ts`.

  /** Selected board size (e.g., 11 for an 11x11 board). */
  const [boardSize, setBoardSize] = useState<number>(
    DEFAULT_ONLINE_BOARD_SIZE
  );
  /** Selected timer mode ('off' or 'perGame' for online games). */
  const [timerMode, setTimerMode] = useState<TimerMode>('perGame'); // Defaulted to 'perGame' as it's common.
  /** Selected game duration in seconds, applicable if timerMode is 'perGame'. */
  const [timerDurationSeconds, setTimerDurationSeconds] = useState<number>(
    DEFAULT_ONLINE_GAME_DURATION_SECONDS
  );
  /** Selected time increment per move in seconds, applicable if timerMode is 'perGame'. */
  const [timerIncrementSeconds, setTimerIncrementSeconds] =
    useState<AllowedIncrementSecondsType>(
      DEFAULT_ONLINE_TIMER_INCREMENT_SECONDS
    );
  /** Whether the game is rated (affects player scores/ranking). Initialized based on a string constant ('1' means true). */
  const [isRated, setIsRated] = useState<boolean>(
    DEFAULT_ONLINE_RATED_STATUS === '1'
  );
  /** Whether the game is hidden (private, not listed publicly). Initialized based on a string constant ('1' means true). */
  const [isHidden, setIsHidden] = useState<boolean>(
    DEFAULT_ONLINE_HIDDEN_STATUS === '1'
  );
  /** Stores any form-specific validation errors to display to the user. */
  const [error, setError] = useState<string | null>(null);
  /** Tracks the submission state of the form to prevent multiple submissions and update UI (e.g., disable buttons). */
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // If the modal is not set to be open, render nothing.
  if (!isOpen) return null;

  /**
   * Formats a duration in seconds into a user-friendly string.
   * E.g., 60 -> "1 minute", 90 -> "1.5 minutes", 30 -> "30 seconds".
   * @param seconds The duration in seconds.
   * @returns A string representation of the duration.
   */
  const formatDurationForDisplay = (seconds: number): string => {
    if (seconds < 60) return `${seconds} seconds`;
    const minutes = seconds / 60;
    // Handle potential floating point precision if needed for non-integer minutes,
    // or ensure ALLOWED_ONLINE_GAME_DURATIONS_SECONDS are multiples of 60 for clean minute display.
    // Current implementation assumes integer minutes or accepts float display.
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  };

  /**
   * Handles the form submission event.
   * It validates the input, prepares the game settings, calls the `createOnlineGame` service,
   * and manages UI feedback based on the outcome.
   * @param e The form submission event.
   */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // Prevent default browser form submission.
    setError(null); // Clear any previous errors.

    // Authentication check
    if (!loggedInUser) {
      setError('You must be logged in to create a game.');
      return;
    }

    // Construct the game settings object to be sent to the server/service.
    const settings: CustomGameSettings = {
      boardSize,
      // Ensure only 'off' or 'perGame' are sent for online games, even if `TimerMode` type is broader.
      timerMode: timerMode === 'off' ? 'off' : 'perGame',
      timerDurationSeconds:
        timerMode === 'off' ? 0 : timerDurationSeconds, // Duration is 0 if timer is off.
      timerIncrementSeconds:
        timerMode === 'off' ? 0 : timerIncrementSeconds, // Increment is 0 if timer is off.
      isRated,
      isHidden,
    };

    // Basic client-side validation
    if (
      settings.timerMode === 'perGame' &&
      settings.timerDurationSeconds === 0
    ) {
      setError('Per Game timer duration must be greater than 0.');
      return;
    }

    setIsSubmitting(true); // Indicate that submission is in progress.
    setOnlineGameStatusMessage('Creating your game...'); // Provide initial feedback.

    // Call the actual game creation function from the `useOnlinePlay` hook.
    const success = await createOnlineGame(settings);
    setIsSubmitting(false); // Submission process finished.

    if (success) {
      // `useOnlinePlay` hook might set a more specific success message (e.g., with game ID).
      // This message serves as a fallback or initial confirmation.
      setOnlineGameStatusMessage(
        (prev) => prev || 'Game created! Waiting for opponent...'
      );
      onClose(); // Close the modal on successful game creation.
    } else {
      // If `createOnlineGame` failed, it should ideally set an error message via `setOnlineGameStatusMessage`.
      // This provides a generic fallback if no message was set by the hook AND the action is no longer loading.
      if (!isOnlineActionLoading) {
        setOnlineGameStatusMessage(
          (prev) => prev || 'Failed to create game. Please try again.'
        );
      }
      // `setError` could be used here for modal-specific errors if `setOnlineGameStatusMessage`
      // is for more global status updates. Currently, status messages seem to handle this.
    }
  };

  // Base Tailwind CSS classes for consistent styling of form inputs and labels.
  const textInputBaseClasses =
    'mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50';
  const labelBaseClasses =
    'block text-sm font-medium text-theme-text-primary dark:text-theme-icon-dark';

  return (
    // Modal Overlay: covers the screen, allows closing by clicking outside the modal content.
    <div
      className="fixed inset-0 bg-black/70 dark:bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true" // Indicates that interacting with content outside the dialog is prevented.
      aria-labelledby="create-game-modal-title" // Associates the dialog with its title for accessibility.
      onClick={onClose} // Close modal when overlay is clicked.
      data-testid="create-game-modal-overlay"
    >
      {/* Modal Content Area: prevents click propagation to avoid closing when content is clicked. */}
      <div
        className="bg-theme-card-bg-light dark:bg-theme-card-bg-dark p-6 rounded-lg shadow-xl max-w-lg w-full text-theme-text-primary dark:text-theme-icon-dark overflow-y-auto max-h-[90vh] scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent"
        onClick={(e) => e.stopPropagation()} // Prevents modal from closing when clicking inside.
        data-testid="create-game-modal-content"
      >
        {/* Modal Header: Title and Close Button */}
        <div className="flex justify-between items-center mb-6">
          <h2
            id="create-game-modal-title"
            className="text-2xl font-bold"
          >
            Create Online Game
          </h2>
          <button
            onClick={onClose}
            aria-label="Close create game dialog"
            className="p-1 text-theme-icon-light dark:text-theme-icon-dark hover:text-theme-icon-light-hover dark:hover:text-theme-icon-dark-hover rounded-full hover:bg-theme-button-icon-bg-hover-light dark:hover:bg-theme-button-icon-bg-hover-dark transition-colors focus:outline-none focus:ring-0"
            disabled={isSubmitting} // Disable close button during submission.
            data-testid="close-modal-button"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Game Settings Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Board Size Selection */}
          <div>
            <label htmlFor="boardSize" className={labelBaseClasses}>
              Board Size
            </label>
            <select
              id="boardSize"
              name="boardSize"
              value={boardSize}
              onChange={(e) => setBoardSize(Number(e.target.value))}
              className={textInputBaseClasses}
              disabled={isSubmitting}
              data-testid="board-size-select"
            >
              {ALLOWED_ONLINE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}x{size}
                </option>
              ))}
            </select>
          </div>

          {/* Timer Mode Selection */}
          <div>
            <label htmlFor="timerMode" className={labelBaseClasses}>
              Timer Mode
            </label>
            <select
              id="timerMode"
              name="timerMode"
              value={timerMode}
              onChange={(e) => setTimerMode(e.target.value as TimerMode)} // Cast to TimerMode, assuming values match the type.
              className={textInputBaseClasses}
              disabled={isSubmitting}
              data-testid="timer-mode-select"
            >
              <option value="off">Off</option>
              <option value="perGame">Per Game</option>
              {/* 'perMove' could be an option here if supported by online games and TimerMode type */}
            </select>
          </div>

          {/* Conditional Timer Settings: Only show if timerMode is 'perGame' */}
          {timerMode === 'perGame' && (
            <>
              {/* Timer Duration Selection */}
              <div>
                <label
                  htmlFor="timerDurationSeconds"
                  className={labelBaseClasses}
                >
                  Time Per Game
                </label>
                <select
                  id="timerDurationSeconds"
                  name="timerDurationSeconds"
                  value={timerDurationSeconds}
                  onChange={(e) =>
                    setTimerDurationSeconds(Number(e.target.value))
                  }
                  className={textInputBaseClasses}
                  disabled={isSubmitting}
                  data-testid="timer-duration-select"
                >
                  {ALLOWED_ONLINE_GAME_DURATIONS_SECONDS.map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {formatDurationForDisplay(seconds)}
                    </option>
                  ))}
                </select>
              </div>
              {/* Timer Increment Selection */}
              <div>
                <label
                  htmlFor="timerIncrementSeconds"
                  className={labelBaseClasses}
                >
                  Increment Per Move
                </label>
                <select
                  id="timerIncrementSeconds"
                  name="timerIncrementSeconds"
                  value={timerIncrementSeconds}
                  onChange={(e) =>
                    setTimerIncrementSeconds(
                      Number(e.target.value) as AllowedIncrementSecondsType // Cast, assuming values match the type.
                    )
                  }
                  className={textInputBaseClasses}
                  disabled={isSubmitting}
                  data-testid="timer-increment-select"
                >
                  {ALLOWED_INCREMENT_SECONDS.map((seconds) => (
                    <option key={seconds} value={seconds}>
                      +{seconds} seconds
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Checkbox Options: Rated and Hidden Game */}
          <div className="space-y-2 pt-2">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                name="isRated"
                checked={isRated}
                onChange={(e) => setIsRated(e.target.checked)}
                className="form-checkbox h-4 w-4 text-indigo-600 dark:text-yellow-500 border-gray-300 dark:border-gray-600 rounded focus:ring-indigo-500 dark:focus:ring-yellow-600 bg-theme-card-bg-light dark:bg-theme-card-bg-dark"
                disabled={isSubmitting}
                data-testid="is-rated-checkbox"
              />
              <span className={labelBaseClasses}>Rated Game (Scored)</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                name="isHidden"
                checked={isHidden}
                onChange={(e) => setIsHidden(e.target.checked)}
                className="form-checkbox h-4 w-4 text-indigo-600 dark:text-yellow-500 border-gray-300 dark:border-gray-600 rounded focus:ring-indigo-500 dark:focus:ring-yellow-600 bg-theme-card-bg-light dark:bg-theme-card-bg-dark"
                disabled={isSubmitting}
                data-testid="is-hidden-checkbox"
              />
              <span className={labelBaseClasses}>Hidden Game (Private)</span>
            </label>
          </div>

          {/* Error Message Display Area */}
          {error && (
            <p
              className="text-sm text-red-500 dark:text-red-400"
              role="alert" // Indicates this is an alert message for screen readers.
              data-testid="form-error-message"
            >
              {error}
            </p>
          )}

          {/* Modal Footer: Action Buttons (Cancel, Create Game) */}
          <div className="mt-6 pt-4 border-t border-theme-divider-light dark:border-theme-divider-dark flex justify-end space-x-3">
            <button
              type="button" // Important: type="button" to prevent form submission.
              onClick={onClose}
              disabled={isSubmitting} // Disable if form is currently submitting.
              className="px-4 py-2 text-sm font-medium rounded-lg shadow-sm border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-theme-text-primary dark:text-theme-icon-dark transition-colors disabled:opacity-50"
              data-testid="cancel-button"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isOnlineActionLoading} // Disable if modal is submitting OR global online action is loading.
              className="px-4 py-2 text-sm font-medium rounded-lg shadow-sm text-theme-button-primary-text-light dark:text-theme-button-primary-text-dark bg-theme-button-primary-bg-light hover:bg-theme-button-primary-bg-light-hover dark:bg-theme-button-primary-bg-dark dark:hover:bg-theme-button-primary-bg-dark-hover transition-colors disabled:opacity-50"
              data-testid="submit-create-game-button"
            >
              {isSubmitting || isOnlineActionLoading
                ? 'Creating...' // Show loading text.
                : 'Create Game'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateGameModal;