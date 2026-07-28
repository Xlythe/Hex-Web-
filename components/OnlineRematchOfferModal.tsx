import React from 'react';

/**
 * Props for the {@link OnlineRematchOfferModal} component.
 */
interface OnlineRematchOfferModalProps {
  /**
   * Controls the visibility of the modal.
   * If `true`, the modal is displayed; otherwise, it's hidden.
   */
  isOpen: boolean;
  /**
   * The name of the player who has sent the rematch offer.
   * This name is displayed in the modal's message.
   */
  offeringPlayerName: string;
  /**
   * Callback function triggered when the user clicks the "Accept Rematch" button.
   * This function should handle the logic for accepting the rematch.
   */
  onAccept: () => void;
  /**
   * Callback function triggered when the user clicks the "Decline Rematch" button.
   * This function should handle the logic for declining the rematch.
   */
  onDecline: () => void;
  /**
   * Indicates whether an accept or decline action is currently being processed.
   * If `true`, the buttons will be disabled, and their text will change to indicate
   * the ongoing action (e.g., "Accepting...", "Declining...").
   * This prevents multiple submissions and provides user feedback.
   */
  isResponding: boolean;
}

/**
 * `OnlineRematchOfferModal` is a presentational component that displays a modal dialog
 * when a player receives a rematch offer in an online game.
 *
 * It informs the user who offered the rematch and provides options to accept or decline.
 * The modal is designed to be clear and user-friendly, with explicit actions required.
 *
 * Features:
 * - Displays the name of the player offering the rematch.
 * - Provides "Accept" and "Decline" buttons.
 * - Disables buttons and shows loading text during response processing (`isResponding` prop).
 * - Uses Tailwind CSS for styling.
 * - Implements ARIA attributes for accessibility.
 * - Does not render if `isOpen` is false.
 */
const OnlineRematchOfferModal: React.FC<OnlineRematchOfferModalProps> = ({
  isOpen,
  offeringPlayerName,
  onAccept,
  onDecline,
  isResponding,
}) => {
  // If the modal is not supposed to be open, render nothing (early return).
  if (!isOpen) {
    return null;
  }

  // Determine the text for the buttons based on the `isResponding` state.
  const declineButtonText = isResponding ? 'Declining...' : 'Decline Rematch';
  const acceptButtonText = isResponding ? 'Accepting...' : 'Accept Rematch';

  return (
    // Modal Overlay:
    // - Covers the entire screen to focus user attention on the modal.
    // - `fixed inset-0`: Positions the overlay to fill the viewport.
    // - `bg-black/70 dark:bg-black/80`: Semi-transparent background for the overlay.
    // - `flex items-center justify-center`: Centers the modal content within the overlay.
    // - `p-4`: Adds padding around the modal content area, especially useful on smaller screens.
    // - `z-[60]`: High z-index to ensure the modal appears above other page content.
    //   (Consider managing z-indices globally via a theme or constants if this becomes common).
    // - `backdrop-blur-sm`: Applies a slight blur to the content behind the modal.
    <div
      className="fixed inset-0 bg-black/70 dark:bg-black/80 flex items-center justify-center p-4 z-[60] backdrop-blur-sm"
      // ARIA attributes for accessibility:
      // - `role="dialog"`: Identifies the element as a dialog.
      // - `aria-modal="true"`: Indicates that the dialog is modal, meaning content outside it is inert.
      // - `aria-labelledby="rematch-offer-modal-title"`: Associates the dialog with its title for screen readers.
      role="dialog"
      aria-modal="true"
      aria-labelledby="rematch-offer-modal-title"
    >
      {/* Modal Content Container:
          - Styles the main box of the modal.
          - `max-w-md w-full`: Ensures the modal is responsive, taking full width on small screens
            up to a maximum width (`max-w-md`).
      */}
      <div
        className="bg-theme-card-bg-light dark:bg-theme-card-bg-dark p-6 rounded-lg shadow-xl max-w-md w-full text-theme-text-primary dark:text-theme-icon-dark"
      >
        {/* Modal Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 id="rematch-offer-modal-title" className="text-xl font-bold">
            Rematch Offer
          </h2>
          {/* Deliberately no close button (X) is included.
              The user must explicitly accept or decline the rematch offer.
              This ensures a clear response to the game event. */}
        </div>

        {/* Modal Body/Message */}
        <div className="mb-6 text-sm text-theme-text-subtle">
          <p>
            <span className="font-semibold">{offeringPlayerName}</span> has offered a rematch!
          </p>
          <p className="mt-1">Do you want to play again?</p>
        </div>

        {/* Modal Footer/Action Buttons */}
        <div className="flex justify-end space-x-3">
          {/* Decline Button */}
          <button
            type="button" // Explicitly type="button" to prevent form submission if wrapped in a form.
            onClick={onDecline}
            disabled={isResponding} // Disable button if an action is already in progress.
            className="px-4 py-2 text-sm font-medium rounded-lg shadow-sm border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-theme-text-primary dark:text-theme-icon-dark transition-colors disabled:opacity-50"
          >
            {declineButtonText}
          </button>

          {/* Accept Button */}
          <button
            type="button"
            onClick={onAccept}
            disabled={isResponding} // Disable button if an action is already in progress.
            className="px-4 py-2 text-sm font-medium rounded-lg shadow-sm text-theme-button-primary-text-light dark:text-theme-button-primary-text-dark bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {acceptButtonText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnlineRematchOfferModal;