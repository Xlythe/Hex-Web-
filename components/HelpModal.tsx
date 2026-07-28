import React from 'react';
import { CloseIcon } from '../icons/CloseIcon';

/**
 * @file HelpModal.tsx
 * @description A presentational component that displays a modal window with game rules,
 * instructions on how to play Hex, explanations of features like the swap rule and timers.
 * It uses player-specific colors to highlight text related to Player 1 and Player 2.
 */

interface HelpModalProps {
  /** Boolean indicating whether the help modal is currently visible. */
  isOpen: boolean;
  /** Callback function to be invoked when the modal is requested to be closed (e.g., by clicking the close button or overlay). */
  onClose: () => void;
  /** Hex color string for Player 1, used to style text referring to Player 1 in the help content. */
  player1Color: string;
  /** Hex color string for Player 2, used to style text referring to Player 2 in the help content. */
  player2Color: string;
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, player1Color, player2Color }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/70 dark:bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm"
      role="dialog" // Identifies the element as a dialog window.
      aria-modal="true" // Indicates that content outside the dialog is inert.
      aria-labelledby="help-modal-title" // Associates the dialog with its title for screen readers.
      onClick={onClose} // Allow closing the modal by clicking on the overlay.
    >
      <div 
        className="bg-theme-card-bg-light dark:bg-theme-card-bg-dark p-6 rounded-lg shadow-xl max-w-lg w-full text-theme-text-primary dark:text-theme-icon-dark overflow-y-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()} // Prevent clicks inside the modal from closing it.
      >
        <div className="flex justify-between items-center mb-6">
          <h2 id="help-modal-title" className="text-2xl font-bold">Game Rules & Help</h2>
          <button onClick={onClose} aria-label="Close help" className="p-1 text-theme-icon-light dark:text-theme-icon-dark hover:text-theme-icon-light-hover dark:hover:text-theme-icon-dark-hover rounded-full hover:bg-theme-button-icon-bg-hover-light dark:hover:bg-theme-button-icon-bg-hover-dark transition-colors focus:outline-none focus:ring-0">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="space-y-4 text-sm">
          {/* Objective Section */}
          <section>
            <h3 className="text-lg font-semibold mb-1 text-theme-text-primary dark:text-theme-icon-dark">Objective</h3>
            <p className="text-theme-text-subtle">Hex is a two-player connection game. Players take turns placing pieces on a hexagonal grid.</p>
            <ul className="list-disc list-inside ml-4 mt-1 text-theme-text-subtle">
              {/* Player 1's objective, styled with their specific color. */}
              <li><span className="font-semibold" style={{color: player1Color}}>Player 1</span> aims to create an unbroken chain of their pieces connecting the Left edge to the Right edge of the board.</li>
              {/* Player 2's objective, styled with their specific color. */}
              <li><span className="font-semibold" style={{color: player2Color}}>Player 2</span> aims to create an unbroken chain of their pieces connecting the Top edge to the Bottom edge of the board.</li>
            </ul>
            <p className="mt-1 text-theme-text-subtle">The first player to complete their chain wins. Corners are considered part of both adjacent edges.</p>
          </section>
          <hr className="border-theme-divider-light dark:border-theme-divider-dark"/>
          {/* Swap Rule Section */}
          <section>
            <h3 className="text-lg font-semibold mb-1 text-theme-text-primary dark:text-theme-icon-dark">Swap Rule</h3>
            <p className="text-theme-text-subtle">To balance the game, the Swap Rule is typically used:</p>
            <ul className="list-disc list-inside ml-4 mt-1 text-theme-text-subtle">
              <li>Player 1 places their first piece on any empty cell.</li>
              <li>Player 2 then has a choice for their first turn:
                <ul className="list-circle list-inside ml-4 mt-1">
                    <li>Place their own piece on any other empty cell. The game continues normally.</li>
                    <li><strong>OR:</strong> Click on Player 1's first piece. This invokes the swap:
                        <ul className="list-disc list-inside ml-4 mt-1">
                            {/* Swap details, using player colors for clarity. */}
                            <li>Player 2 takes on the role of Player 1 (controlling the <span style={{color: player1Color, fontWeight: 'normal'}}>first player's side/pieces</span>), and Player 1's first move is now considered their own.</li>
                            <li>Player 1 takes on the role of Player 2 (controlling the <span style={{color: player2Color, fontWeight: 'normal'}}>second player's side/pieces</span>).</li>
                            <li>The next turn belongs to the new Player 2 (who was originally Player 1).</li>
                        </ul>
                    </li>
                </ul>
              </li>
            </ul>
            <p className="mt-1 text-theme-text-subtle">This rule can be toggled in the Settings.</p>
          </section>
          <hr className="border-theme-divider-light dark:border-theme-divider-dark"/>
          {/* Timer Section */}
          <section>
            <h3 className="text-lg font-semibold mb-1 text-theme-text-primary dark:text-theme-icon-dark">Timer</h3>
            <p className="text-theme-text-subtle">The game includes optional timers, configurable in Settings:</p>
            <ul className="list-disc list-inside ml-4 mt-1 text-theme-text-subtle">
              <li><strong>Off:</strong> No timer.
              </li>
              <li><strong>Per Turn:</strong> Each player has a fixed amount of time for each move. Exceeding this time results in a loss.</li>
              <li><strong>Per Game:</strong> Each player has a total time bank for the entire game. Exceeding this time results in a loss.</li>
            </ul>
          </section>
           <div className="mt-8 flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-theme-button-primary-bg-light hover:bg-theme-button-primary-bg-light-hover dark:bg-theme-button-primary-bg-dark dark:hover:bg-theme-button-primary-bg-dark-hover text-theme-button-primary-text-light dark:text-theme-button-primary-text-dark font-medium rounded-lg shadow-sm transition-colors duration-150 ease-in-out focus:outline-none focus:ring-0"
              >
                Got it!
              </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;