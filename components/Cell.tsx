
import React from 'react';
import { CellState, Player, Coordinate, FirstGameMoveDetails } from '../types';

/**
 * @file Cell.tsx
 * @description Represents a single hexagonal cell on the Hex game board.
 * This component handles user clicks to make a move or invoke the swap rule.
 * It dynamically styles itself based on its current state: whether it's empty,
 * occupied by a player, part of a winning path, or currently swappable.
 * Hover effects also provide visual feedback to the user.
 */

interface CellProps {
  /** The state of the cell: Player.ONE, Player.TWO, or null (empty). */
  value: CellState;
  /** Callback function invoked when the cell is clicked. */
  onClick: () => void;
  /** Boolean indicating if the cell interaction is fundamentally disabled (e.g., game over, replay mode). */
  baseDisabled: boolean;
  /** The Player enum (Player.ONE or Player.TWO) indicating the *board side* whose turn it currently is. Used for hover previews and swap logic. */
  currentPlayer: Player;
  /** The row index of this cell on the board. */
  rowIndex: number;
  /** The column index of this cell on the board. */
  colIndex: number;
  /** Boolean indicating if the swap rule is enabled for the current game. */
  swapRuleEnabled: boolean;
  /** The current turn number of the game. */
  turnCount: number;
  /** Details of the first move made in the game, null if no move made yet or not applicable. Crucial for swap rule logic. */
  firstGameMoveDetails: FirstGameMoveDetails | null;
  /** Boolean indicating if this specific cell was the one clicked to invoke the swap rule. Used for visual highlighting. */
  isSwappedCell: boolean;
  /** Boolean indicating if player roles (assignment of configured profiles to board sides) have been swapped. Impacts color interpretation. */
  isPlayerRolesSwapped: boolean;
  /** The Player enum (Player.ONE or Player.TWO) indicating the *board side* that won the game, null if no winner. Affects styling. */
  winningPlayer: Player | null;
  /** Boolean indicating if this cell is part of the winning path. Used for highlighting. */
  isInWinningPath: boolean;
  /** Hex color string for pieces and indicators associated with the Player.ONE *side* of the board. */
  player1Color: string;
  /** Hex color string for pieces and indicators associated with the Player.TWO *side* of the board. */
  player2Color: string;
  /** Hex color string of the *participant* (actual player profile) whose turn it currently is. Used for hover previews on empty/swappable cells. */
  currentPlayerActualColor: string;
}

// Fixed dimensions for the hexagonal cell.
const CELL_WIDTH = '36px';
const CELL_HEIGHT = '31px';

/**
 * Converts a hex color string to an rgba string.
 * @param hex The hex color string (e.g., "#RRGGBB").
 * @param alpha The alpha value (0 to 1).
 * @returns The rgba color string (e.g., "rgba(r,g,b,a)").
 */
const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};


const Cell: React.FC<CellProps> = ({
  value,
  onClick,
  baseDisabled,
  currentPlayer,
  rowIndex,
  colIndex,
  swapRuleEnabled,
  turnCount,
  firstGameMoveDetails,
  isSwappedCell,
  isPlayerRolesSwapped,
  winningPlayer,
  isInWinningPath,
  player1Color,
  player2Color,
  currentPlayerActualColor,
}) => {
  const clipPathValue = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
  
  let cellClasses = `flex items-center justify-center text-white font-bold transition-all duration-200 ease-in-out focus:outline-none focus:ring-0`;
  const cellStyle: React.CSSProperties = {
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
    clipPath: clipPathValue,
    WebkitClipPath: clipPathValue, // For Safari compatibility.
    position: 'relative', 
    opacity: 1, 
  };
  let hoverClassName = '';


  const isPotentiallySwappableCell =
    swapRuleEnabled &&
    !isPlayerRolesSwapped && 
    turnCount === 1 && 
    firstGameMoveDetails && 
    currentPlayer !== firstGameMoveDetails.player && 
    value === firstGameMoveDetails.player && 
    firstGameMoveDetails.coord.r === rowIndex && 
    firstGameMoveDetails.coord.c === colIndex;

  const finalDisabled = baseDisabled || (value !== null && !isPotentiallySwappableCell);


  if (value === Player.ONE) {
    cellStyle.backgroundColor = player1Color; 
    if (winningPlayer === Player.ONE) { 
      cellStyle.opacity = isInWinningPath ? 1 : 0.7; 
      if (isInWinningPath) {
        cellClasses += ' shadow-lg scale-105 z-10'; 
      }
    }
    if (isPotentiallySwappableCell && !baseDisabled && !winningPlayer) {
      cellClasses += ' cursor-pointer';
      hoverClassName = 'hex-cell-swappable-hoverable';
      (cellStyle as any)['--swappable-cell-hover-overlay-bg'] = currentPlayerActualColor;
      (cellStyle as any)['--swappable-cell-hover-overlay-opacity'] = '0.7';
    } else {
      cellClasses += ' cursor-default';
    }
  } else if (value === Player.TWO) {
    cellStyle.backgroundColor = player2Color; 
    if (winningPlayer === Player.TWO) { 
      cellStyle.opacity = isInWinningPath ? 1 : 0.7; 
      if (isInWinningPath) {
        cellClasses += ' shadow-lg scale-105 z-10'; 
      }
    }
     if (isPotentiallySwappableCell && !baseDisabled && !winningPlayer) {
      cellClasses += ' cursor-pointer';
      hoverClassName = 'hex-cell-swappable-hoverable';
      (cellStyle as any)['--swappable-cell-hover-overlay-bg'] = currentPlayerActualColor;
      (cellStyle as any)['--swappable-cell-hover-overlay-opacity'] = '0.7';
    } else {
      cellClasses += ' cursor-default';
    }
  } else { // Empty cell
    cellClasses += ' bg-gray-200 dark:bg-theme-card-bg-dark';
    // An empty cell is interactive if:
    // 1. It's not fundamentally disabled (baseDisabled from parent is false).
    // 2. The game is not over (winningPlayer is null).
    const isEmptyCellInteractive = !baseDisabled && !winningPlayer;

    if (isEmptyCellInteractive) {
      cellClasses += ' cursor-pointer';
      hoverClassName = 'hex-cell-empty-hoverable';
      (cellStyle as any)['--empty-cell-hover-bg'] = hexToRgba(currentPlayerActualColor, 0.5);
    } else { // Not interactive (either baseDisabled is true, or game is over)
      cellClasses += ' cursor-default';
      // Only apply dimming to empty cells if the game is definitively over.
      if (winningPlayer) {
        cellStyle.opacity = 0.7; // Dim empty cells when game is won
        if (document.documentElement.classList.contains('dark')) {
          cellStyle.opacity = 0.6;
        }
      }
      // If baseDisabled is true (e.g., AI's turn, replay not yet won) but game isn't won,
      // empty cells remain visually standard (opacity 1) but are non-interactive.
      // No explicit opacity change is needed here if not winningPlayer, as default opacity is 1.
    }
  }
  
  if (isSwappedCell) {
    const outlineColor = isPlayerRolesSwapped ? player1Color : player2Color; 
    cellStyle.outline = `2px solid ${outlineColor}`;
    cellStyle.outlineOffset = '2px';
  }

  if (finalDisabled && !isPotentiallySwappableCell) {
    cellClasses = cellClasses.replace(/cursor-pointer/g, ''); 
    if (!cellClasses.includes('cursor-default')) cellClasses += ' cursor-default'; 
  }

  return (
    <button
      onClick={onClick}
      disabled={finalDisabled}
      className={`${cellClasses} ${hoverClassName}`}
      style={cellStyle}
      aria-label={`Cell R${rowIndex + 1}C${colIndex + 1} ${value ? (value === Player.ONE ? 'Player 1 Piece' : 'Player 2 Piece') : (isPotentiallySwappableCell ? 'Swappable by current player' : 'Empty')}`}
    >
    </button>
  );
};

export default Cell;
