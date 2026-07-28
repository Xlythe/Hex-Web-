import React from 'react';

/**
 * Props for the `OnlineUndoRequestModal` component.
 */
interface OnlineUndoRequestModalProps {
  /**
   * If `true`, the modal is visible. If `false`, it's hidden.
   */
  isOpen: boolean;
  /**
   * The display name of the player who initiated the undo request.
   */
  requestingPlayerName: string;
  /**
   * Callback function to be executed when the user accepts the undo request.
   */
  onAccept: () => void;
  /**
   * Callback function to be executed when the user denies the undo request.
   */
  onDeny: () => void;
  /**
   * If `true`, indicates that an accept or deny action is currently being processed (e.g., an API call).
   * This is used to disable buttons and show loading states.
   */
  isResponding: boolean;
}

/**
 * `OnlineUndoRequestModal` is a React functional component that displays a modal dialog
 * to the user when another player in an online game requests to undo their last move.
 * The user can then choose to accept or deny this request.
 *
 * The modal is controlled by the `isOpen` prop. It provides visual feedback
 * during the accept/deny process via the `isResponding` prop.
 */
const OnlineUndoRequestModal: React.FC<OnlineUndoRequestModalProps> = ({
  isOpen,
  requestingPlayerName,
  onAccept,
  onDeny,
  isResponding,
}) => {
  // If the modal is not supposed to be open, render nothing.
  if (!isOpen) {
    return null;
  }

  // Render the modal structure.
  return (
    // Modal Overlay: Covers the entire screen with a semi-transparent background.
    // - `fixed inset-0`: Positions the div to cover the viewport.
    // - `bg-black/70 dark:bg-black/80`: Semi-transparent black background, slightly different for dark mode.
    // - `flex items-center justify-center`: Centers the modal content.
    // - `p-4`: Adds padding around the modal, useful on smaller screens.
    // - `z-[60]`: High z-index to ensure the modal appears above other content.
    // - `backdrop-blur-sm`: Applies a subtle blur to the content behind the modal.
    <div
      className="fixed inset-0 bg-black/70 dark:bg-black/80 flex items-center justify-center p-4 z-[60] backdrop-blur-sm"
      role="dialog" // ARIA role indicating this is a dialog.
      aria-modal="true" // ARIA attribute indicating that content outside the dialog is inert.
      aria-labelledby="undo-request-modal-title" // Associates the dialog with its title for screen readers.
    >
      {/* Modal Content Container: The main box holding the modal's content. */}
      {/* - `bg-theme-card-bg-light dark:bg-theme-card-bg-dark`: Theme-aware background color. */}
      {/* - `p-6 rounded-lg shadow-xl`: Padding, rounded corners, and a prominent shadow. */}
      {/* - `max-w-md w-full`: Limits maximum width but allows it to be full-width on small screens. */}
      {/* - `text-theme-text-primary dark:text-theme-icon-dark`: Theme-aware text color. */}
      <div
        className="bg-theme-card-bg-light dark:bg-theme-card-bg-dark p-6 rounded-lg shadow-xl max-w-md w-full text-theme-text-primary dark:text-theme-icon-dark"
      >
        {/* Modal Header: Contains the title. */}
        <div className="flex justify-between items-center mb-4">
          <h2 id="undo-request-modal-title" className="text-xl font-bold">
            Undo Request
          </h2>
          {/* No explicit close button is provided in this design; the user must respond via action buttons. */}
        </div>

        {/* Modal Body: Displays the message about the undo request. */}
        <div className="mb-6 text-sm text-theme-text-subtle">
          <p>
            <span className="font-semibold">{requestingPlayerName}</span> has
            requested to undo their last move.
          </p>
          <p className="mt-1">Do you want to accept this request?</p>
        </div>

        {/* Modal Footer/Actions: Contains the "Deny" and "Accept" buttons. */}
        <div className="flex justify-end space-x-3">
          {/* Deny Button */}
          <button
            type="button" // Standard type for buttons not submitting a form.
            onClick={onDeny}
            disabled={isResponding} // Disable button if an action is already in progress.
            // Styling for the deny button (secondary action style).
            className="px-4 py-2 text-sm font-medium rounded-lg shadow-sm border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-theme-text-primary dark:text-theme-icon-dark transition-colors disabled:opacity-50"
          >
            {isResponding ? 'Denying...' : 'Deny Undo'} {/* Dynamic text based on `isResponding` state. */}
          </button>

          {/* Accept Button */}
          <button
            type="button"
            onClick={onAccept}
            disabled={isResponding} // Disable button if an action is already in progress.
            // Styling for the accept button (primary action style, typically more prominent).
            className="px-4 py-2 text-sm font-medium rounded-lg shadow-sm text-theme-button-primary-text-light dark:text-theme-button-primary-text-dark bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {isResponding ? 'Accepting...' : 'Accept Undo'} {/* Dynamic text based on `isResponding` state. */}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnlineUndoRequestModal;