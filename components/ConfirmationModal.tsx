
import React from 'react';
import { CloseIcon } from '../icons/CloseIcon'; // Import the CloseIcon

/**
 * @file ConfirmationModal.tsx
 * @description A reusable modal component designed to prompt the user for confirmation
 * before performing a potentially destructive or irreversible action. It displays a title,
 * message, and provides options to confirm or cancel the action.
 */

interface ConfirmationModalProps {
  /** Boolean indicating whether the confirmation modal is currently visible. */
  isOpen: boolean;
  /** Callback function to be invoked when the modal is requested to be closed (e.g., by clicking the close button, overlay, or cancel button). */
  onClose: () => void;
  /** Callback function to be invoked when the user confirms the action. */
  onConfirm: () => void;
  /** The title text displayed at the top of the modal. */
  title: string;
  /** The message or question presented to the user for confirmation. Can be a string or a React node for more complex content. */
  message: string | React.ReactNode;
  /** Optional text for the confirm button. Defaults to "Confirm". */
  confirmButtonText?: string;
  /** Optional text for the cancel button. Defaults to "Cancel". */
  cancelButtonText?: string;
  /** Optional Tailwind CSS class names to customize the appearance of the confirm button (e.g., for dangerous actions). */
  confirmButtonClassName?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmButtonText = "Confirm",
  cancelButtonText = "Cancel",
  confirmButtonClassName, // Allows custom styling for the confirm button (e.g., red for destructive actions).
}) => {
  if (!isOpen) return null;

  // Base classes for confirm button, ensuring consistent padding, font, shadow, transitions, and focus rings.
  const baseConfirmButtonClasses = "px-4 py-2 text-sm font-medium rounded-lg shadow-sm transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-yellow-500 dark:focus:ring-offset-theme-card-bg-dark";
  // Default styling for the confirm button if no custom class name is provided.
  const defaultConfirmClasses = `text-theme-button-primary-text-light dark:text-theme-button-primary-text-dark bg-theme-button-primary-bg-light hover:bg-theme-button-primary-bg-light-hover dark:bg-theme-button-primary-bg-dark dark:hover:bg-theme-button-primary-bg-dark-hover ${baseConfirmButtonClasses}`;
  // Final class name for the confirm button, prioritizing custom class if provided.
  const finalConfirmButtonClassName = confirmButtonClassName ? `${confirmButtonClassName} ${baseConfirmButtonClasses}` : defaultConfirmClasses;


  return (
    <div
      className="fixed inset-0 bg-black/70 dark:bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm"
      role="dialog" // Identifies the element as a dialog window.
      aria-modal="true" // Indicates that content outside the dialog is inert.
      aria-labelledby="confirmation-modal-title" // Associates the dialog with its title for screen readers.
      onClick={onClose} // Allow closing by clicking on the overlay.
    >
      <div
        className="bg-theme-card-bg-light dark:bg-theme-card-bg-dark p-6 rounded-lg shadow-xl max-w-md w-full text-theme-text-primary dark:text-theme-icon-dark"
        onClick={(e) => e.stopPropagation()} // Prevent clicks inside the modal from closing it.
      >
        <div className="flex justify-between items-center mb-4">
          <h2 id="confirmation-modal-title" className="text-xl font-bold">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close confirmation" // Accessible label for the close button.
            className="p-1 text-theme-icon-light dark:text-theme-icon-dark hover:text-theme-icon-light-hover dark:hover:text-theme-icon-dark-hover rounded-full hover:bg-theme-button-icon-bg-hover-light dark:hover:bg-theme-button-icon-bg-hover-dark transition-colors focus:outline-none focus:ring-0"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="mb-6 text-sm text-theme-text-subtle">
          {/* Display the message, supporting either plain string or React node for rich content. */}
          {typeof message === 'string' ? <p>{message}</p> : message}
        </div>
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            // Styling for the cancel button, typically less prominent than the confirm button.
            className={`px-4 py-2 text-sm font-medium rounded-lg shadow-sm border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-theme-text-primary dark:text-theme-icon-dark transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-yellow-500 dark:focus:ring-offset-theme-card-bg-dark ${baseConfirmButtonClasses}`}
          >
            {cancelButtonText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm(); // Execute the confirmed action.
              onClose();   // Close the modal after confirmation.
            }}
            className={finalConfirmButtonClassName} // Apply determined confirm button styling.
          >
            {confirmButtonText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
