
import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { BoardMatrix, Player, Coordinate, FirstGameMoveDetails } from '../types';
import Cell from './Cell';
import { ExpandIcon } from '../icons/ExpandIcon'; // Import the new ExpandIcon

/**
 * @file Board.tsx
 * @description
 * Renders the interactive hexagonal game board for the game of Hex.
 * This component is central to the game's UI, responsible for:
 * - Displaying the grid of hexagonal cells based on the `boardMatrix`.
 * - Handling user click interactions on cells via the `onCellClick` callback.
 * - Visually representing the current game state, including:
 *   - Pieces placed by Player.ONE and Player.TWO.
 *   - Highlighting a winning path if a player has won.
 *   - Indicating the current player's connection goal (e.g., top-to-bottom or left-to-right)
 *     using edge indicators. This is now shown during active replays as well.
 * - Implementing responsive scaling to ensure the board fits gracefully within various screen sizes
 *   and its container.
 * - Providing a fullscreen toggle functionality for an immersive game experience.
 *
 * The hexagonal layout is achieved by applying specific CSS offsets (marginLeft, marginTop)
 * to rows and cells. The responsive scaling logic dynamically calculates the board's
 * original dimensions and then applies a CSS transform (scale) to fit it into the
 * available space of its wrapper element.
 */

interface BoardProps {
  /**
   * The 2D array representing the current state of each cell on the board.
   * Each element is typically `Player.ONE`, `Player.TWO`, or `null` (empty).
   */
  boardMatrix: BoardMatrix;
  /**
   * Callback function invoked when a cell is clicked by the user.
   * Passes the 0-indexed `row` and `col` of the clicked cell.
   */
  onCellClick: (row: number, col: number) => void;
  /**
   * Boolean indicating if board interaction (cell clicks) should be disabled.
   * True during AI turns, game replay, or after the game has ended.
   */
  disabled: boolean;
  /**
   * The `Player` enum (Player.ONE or Player.TWO) indicating whose turn it *would be*
   * to connect their respective sides of the board. Used for UI cues like edge highlighting
   * to show Player One's horizontal goal and Player Two's vertical goal.
   * Note: This might differ from the actual participant whose turn it is if roles are swapped.
   */
  currentPlayer: Player;
  /** Boolean indicating if the "swap rule" is currently active in the game. */
  swapRuleEnabled: boolean;
  /** The current turn number of the game (e.g., 1 for the first move, 2 for the second, etc.). */
  turnCount: number;
  /**
   * Details of the first move made in the game, including its coordinate and the `Player`
   * (board side) that made it. This is `null` if no move has been made yet.
   * Crucial for determining if the swap rule can be invoked.
   */
  firstGameMoveDetails: FirstGameMoveDetails | null;
  /**
   * Coordinate of the cell that was clicked to invoke the swap rule, if the swap occurred.
   * Used for visual feedback, e.g., highlighting the swapped cell briefly. `null` otherwise.
   */
  swappedCellCoordinate: Coordinate | null;
  /**
   * Boolean indicating if player roles (i.e., which human/AI profile is assigned to Player.ONE's
   * side vs. Player.TWO's side) have been swapped. This affects UI color mapping.
   */
  isPlayerRolesSwapped: boolean;
  /**
   * The `Player` enum (Player.ONE or Player.TWO) indicating the board side that won the game.
   * `null` if the game is ongoing or resulted in a draw (though draws are impossible in Hex).
   */
  winningPlayer: Player | null;
  /**
   * An array of `Coordinate` objects representing the sequence of cells forming a winning connection.
   * `null` if there is no winner or if the winning path isn't available/calculated.
   */
  winningPath: Coordinate[] | null;
  /** Hex color string for pieces and UI indicators associated with the Player.ONE side of the board. */
  player1Color: string;
  /** Hex color string for pieces and UI indicators associated with the Player.TWO side of the board. */
  player2Color: string;
  /**
   * Hex color string of the *actual participant* (human player or AI profile) whose turn it currently is.
   * Used for dynamic UI elements like cell hover effects to reflect the active player's color.
   */
  currentPlayerActualColor: string;
  /** Boolean indicating if the game board is currently displayed in fullscreen mode. */
  isFullScreen: boolean;
  /** Callback function to request a toggle of the fullscreen mode. */
  onToggleFullScreen: () => void;
  /** Boolean indicating if a game replay is currently active. */
  isReplayActive: boolean;
}

// --- Fundamental Pixel Dimensions for Hexagonal Grid Rendering ---
// These constants define the base size and relative positioning of individual hexagonal cells.
// They are used to calculate the overall dimensions of the board before scaling.

/** Base width of a single hexagonal cell in pixels. */
const CELL_WIDTH_PX = 36;
/** Base height of a single hexagonal cell in pixels. */
const CELL_HEIGHT_PX = 31;
/**
 * Vertical overlap between rows of hexagons.
 * For a pointy-topped hexagon, this is 1/4 of the cell height, leading to rows interlocking.
 */
const ROW_VERTICAL_OFFSET_PX = Math.round(CELL_HEIGHT_PX / 4);
/** Internal vertical padding within the scalable board content area, in pixels. */
const BOARD_INTERNAL_VERTICAL_PADDING_PX = 18;
/** Internal horizontal padding within the scalable board content area, in pixels. */
const BOARD_INTERNAL_HORIZONTAL_PADDING_PX = 18;


const Board: React.FC<BoardProps> = ({
  boardMatrix,
  onCellClick,
  disabled,
  currentPlayer,
  swapRuleEnabled,
  turnCount,
  firstGameMoveDetails,
  swappedCellCoordinate,
  isPlayerRolesSwapped,
  winningPlayer,
  winningPath,
  player1Color,
  player2Color,
  currentPlayerActualColor,
  isFullScreen,
  onToggleFullScreen,
  isReplayActive,
}) => {
  const boardSize = boardMatrix.length; // Assumes a square board (e.g., 11 for 11x11).
  /** Ref attached to the main wrapper div of the board. Used to measure available space for scaling. */
  const boardWrapperRef = useRef<HTMLDivElement>(null);

  /**
   * State storing layout properties required for responsive scaling and positioning.
   * - `originalWidth`, `originalHeight`: The calculated "natural" pixel dimensions of the board
   *   content (hex grid + internal padding) before any scaling is applied.
   * - `scale`: The CSS scale factor to be applied to fit the board content within its wrapper.
   * - `wrapperVerticalPadding`: The sum of top and bottom padding of `boardWrapperRef`. Used to
   *   calculate the dynamic height of the wrapper when not in fullscreen.
   * - `horizontalOffset`: The pixel offset to center the scaled board content horizontally within
   *   `boardWrapperRef` if there's extra space.
   * - `verticalOffset`: The pixel offset to center the scaled board content vertically.
   */
  const [layoutProps, setLayoutProps] = useState({
    originalWidth: 0,
    originalHeight: 0,
    scale: 1,
    wrapperVerticalPadding: 0,
    horizontalOffset: 0,
    verticalOffset: 0,
  });

  /**
   * `useLayoutEffect` is used for responsive scaling calculations because it fires synchronously
   * after all DOM mutations, ensuring that measurements are based on the latest layout.
   * This effect calculates the board's original (unscaled) dimensions and determines the
   * appropriate scale factor and offsets to fit it within its container (`boardWrapperRef`).
   * It also observes the `boardWrapperRef` for size changes using `ResizeObserver` to
   * trigger recalculations dynamically.
   */
  useLayoutEffect(() => {
    const calculateScaleAndOffset = () => {
      if (boardWrapperRef.current) {
        const wRef = boardWrapperRef.current; // The main div wrapping the board content.

        // Constants for cell margins, affecting overall grid size calculation.
        const CELL_MARGIN_X = 1; // Horizontal margin between cells.
        const CELL_MARGIN_Y = 1; // Vertical margin between cells. (Effective vertical margin)

        // Effective height of a single row considering its own cell height and bottom margin.
        const ROW_OWN_HEIGHT = CELL_HEIGHT_PX + CELL_MARGIN_Y;

        let calculatedHexGridPixelWidth = 0;
        let calculatedHexGridPixelHeight = 0;

        // Calculate the raw pixel dimensions of the hexagonal grid itself.
        if (boardSize > 0) {
          // Width: Considers width of cells in a row + staggering offset of the last row.
          const widthOfOneRowCellsAndMargins = (boardSize * CELL_WIDTH_PX) + ((boardSize - 1) * CELL_MARGIN_X);
          // Each subsequent row is offset by half a cell width.
          const maxRowOffset = (boardSize - 1) * (CELL_WIDTH_PX / 2);
          calculatedHexGridPixelWidth = maxRowOffset + widthOfOneRowCellsAndMargins;

          // Height: Considers height of rows, accounting for their vertical overlap.
          // Each row after the first effectively adds (ROW_OWN_HEIGHT - ROW_VERTICAL_OFFSET_PX) to the total height.
          calculatedHexGridPixelHeight = (boardSize - 1) * (ROW_OWN_HEIGHT - ROW_VERTICAL_OFFSET_PX) + ROW_OWN_HEIGHT;
          // Adjust for the last row not having a margin that contributes to inter-row spacing.
          if (boardSize > 0) calculatedHexGridPixelHeight -= CELL_MARGIN_Y; // Correct for final margin not being between rows
        }
        
        calculatedHexGridPixelWidth = Math.max(0, calculatedHexGridPixelWidth);
        calculatedHexGridPixelHeight = Math.max(0, calculatedHexGridPixelHeight);

        // Total original content dimensions including the grid and internal board padding.
        const originalContentWidth = calculatedHexGridPixelWidth + (2 * BOARD_INTERNAL_HORIZONTAL_PADDING_PX);
        const originalContentHeight = calculatedHexGridPixelHeight + (2 * BOARD_INTERNAL_VERTICAL_PADDING_PX);

        // If calculated dimensions are zero (e.g., boardSize is 0), reset layout and exit.
        if (originalContentWidth === 0 || originalContentHeight === 0) {
          setLayoutProps({ originalWidth: 0, originalHeight: 0, scale: 1, wrapperVerticalPadding: 0, horizontalOffset: 0, verticalOffset: 0 });
          return;
        }

        // Get the computed padding of the wrapper element.
        const wrapperComputedStyle = window.getComputedStyle(wRef);
        const wrapperPaddingTop = parseFloat(wrapperComputedStyle.paddingTop) || 0;
        const wrapperPaddingBottom = parseFloat(wrapperComputedStyle.paddingBottom) || 0;
        const wrapperPaddingLeft = parseFloat(wrapperComputedStyle.paddingLeft) || 0;
        const wrapperPaddingRight = parseFloat(wrapperComputedStyle.paddingRight) || 0;
        
        // Calculate the available content area within the wrapper (excluding its padding).
        const availableWidthInWrapperContentBox = wRef.clientWidth - wrapperPaddingLeft - wrapperPaddingRight;
        
        let availableHeightInWrapperContentBox;
        const parentEl = wRef.parentElement;

        if (!isFullScreen && parentEl) {
            const parentStyle = window.getComputedStyle(parentEl);
            const parentClientHeight = parentEl.clientHeight;
            const parentVPadding = (parseFloat(parentStyle.paddingTop) || 0) + (parseFloat(parentStyle.paddingBottom) || 0);
            // Available height within the parent's content box for the boardWrapperRef
            const heightAvailableForBoardWrapper = parentClientHeight - parentVPadding;
            // The boardWrapper itself has padding, so subtract that for the hex grid's content area.
            availableHeightInWrapperContentBox = heightAvailableForBoardWrapper - wrapperPaddingTop - wrapperPaddingBottom;
            if (availableHeightInWrapperContentBox < 0) availableHeightInWrapperContentBox = 0; // Sanity check
        } else { // Fullscreen or no parent element (fallback to original logic for this case)
            availableHeightInWrapperContentBox = wRef.clientHeight - wrapperPaddingTop - wrapperPaddingBottom;
        }

        // On a short landscape screen, leave room for the title, turn banner,
        // and controls so players can see the complete board before scrolling.
        if (!isFullScreen && window.innerHeight <= 500) {
          availableHeightInWrapperContentBox = Math.min(
            availableHeightInWrapperContentBox,
            Math.max(145, window.innerHeight - 260),
          );
        }


        // Determine the scale factor to fit the original content into the available space.
        let newScale = 1;
        if (originalContentWidth > 0 && originalContentHeight > 0) {
          const scaleBasedOnWidth = availableWidthInWrapperContentBox > 0 ? availableWidthInWrapperContentBox / originalContentWidth : 1;
          const scaleBasedOnHeight = availableHeightInWrapperContentBox > 0 ? availableHeightInWrapperContentBox / originalContentHeight : 1;
          // Use the smaller scale factor to ensure the entire content fits without overflow.
          newScale = Math.min(scaleBasedOnWidth, scaleBasedOnHeight);
        }
        
        // Apply an additional scaling adjustment when in fullscreen mode.
        // This provides some "breathing room" and ensures the board doesn't touch the screen edges.
        if (isFullScreen) {
          const scaleAdjustmentFactor = 0.75; // Reduce scale by 25% in fullscreen.
          newScale *= scaleAdjustmentFactor;
        }

        // Calculate horizontal offset to center the scaled content if there's spare width.
        const scaledContentWidth = originalContentWidth * newScale;
        let newHorizontalOffset = 0;
        if (availableWidthInWrapperContentBox > scaledContentWidth) {
          newHorizontalOffset = (availableWidthInWrapperContentBox - scaledContentWidth) / 2;
        }
        
        // Calculate vertical offset to center the scaled content.
        const scaledContentHeight = originalContentHeight * newScale;
        let newVerticalOffset = 0;
        if (availableHeightInWrapperContentBox > scaledContentHeight) {
          newVerticalOffset = (availableHeightInWrapperContentBox - scaledContentHeight) / 2;
        }

        // Update the state with the new layout properties.
        setLayoutProps({
          originalWidth: originalContentWidth,
          originalHeight: originalContentHeight,
          scale: newScale,
          wrapperVerticalPadding: wrapperPaddingTop + wrapperPaddingBottom,
          horizontalOffset: newHorizontalOffset,
          verticalOffset: newVerticalOffset,
        });
      }
    };
    
    // Use a minimal timeout. While useLayoutEffect is sync, complex layouts or interactions with
    // ResizeObserver might benefit from ensuring the calculation runs after the current paint/reflow cycle
    // is fully complete, especially if ResizeObserver triggers rapidly.
    const timeoutId = setTimeout(calculateScaleAndOffset, 0);

    // Observe the board wrapper for size changes and recalculate layout.
    const resizeObserver = new ResizeObserver(calculateScaleAndOffset);
    if (boardWrapperRef.current) {
      resizeObserver.observe(boardWrapperRef.current);
    }

    // Cleanup function: clear timeout and disconnect the observer when the component unmounts
    // or when dependencies change, preventing memory leaks and unnecessary computations.
    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, [boardSize, isFullScreen]); // Recalculate if boardSize or fullscreen state changes.

  /**
   * Checks if a given cell (r, c) is part of the current winning path.
   * @param r Row index of the cell.
   * @param c Column index of the cell.
   * @returns True if the cell is in the winning path, false otherwise.
   */
  const isCellInWinningPath = (r: number, c: number): boolean => {
    if (!winningPath) return false;
    return winningPath.some(coord => coord.r === r && coord.c === c);
  };

  /**
   * CSS properties for the div that directly contains the board grid and edge indicators.
   * This div is scaled using `transform: scale()`.
   * `transformOrigin: 'top left'` ensures scaling behaves predictably from the top-left corner.
   * `visibility` is set to 'hidden' until original dimensions are calculated to prevent flash of unstyled content.
   * In fullscreen, it's positioned absolutely to allow centering via top/left offsets.
   */
  const scalableContentStyle: React.CSSProperties = {
    transform: `scale(${layoutProps.scale})`,
    transformOrigin: 'top left',
    width: layoutProps.originalWidth > 0 ? `${layoutProps.originalWidth}px` : 'auto',
    height: layoutProps.originalHeight > 0 ? `${layoutProps.originalHeight}px` : 'auto',
    position: isFullScreen ? 'absolute' : 'relative', // Absolute for fullscreen to use top/left offsets
    left: layoutProps.horizontalOffset > 0 ? `${layoutProps.horizontalOffset}px` : '0px',
    top: isFullScreen && layoutProps.verticalOffset > 0 ? `${layoutProps.verticalOffset}px` : '0px', // Apply vertical offset in fullscreen
    visibility: layoutProps.originalWidth > 0 ? 'visible' : 'hidden',
    overflow: 'visible',
  };

  /**
   * Dynamic CSS for the main board wrapper (`boardWrapperRef`).
   * In fullscreen mode, it acts as a simple container.
   * In non-fullscreen mode, its height is dynamically set to fit the scaled content plus its own padding.
   * `minHeight` provides a fallback if originalHeight is 0 (e.g., during initial render).
   */
  const boardWrapperDynamicStyle: React.CSSProperties = isFullScreen ? {
    // Fullscreen wrapper is just a container; scalableContent positions itself.
  } : {
    height: layoutProps.originalHeight > 0
      ? `${(layoutProps.originalHeight * layoutProps.scale) + layoutProps.wrapperVerticalPadding}px`
      : 'auto',
    minHeight: layoutProps.originalHeight === 0 ? '100px' : undefined,
  };
  
  // Dimensions of the parent of edge indicators (the scalableContent div).
  // Used to make edge indicators responsive to the scaled board size.
  const edgeIndicatorParentWidth = layoutProps.originalWidth;
  const edgeIndicatorParentHeight = layoutProps.originalHeight;

  // Base CSS classes for the board wrapper.
  const baseWrapperClasses = "hex-board relative block"; // `relative` for absolute positioning of fullscreen button and scalable content.
  // Fullscreen specific classes: take full parent dimensions and apply a contrasting background.
  const fullscreenWrapperClasses = "w-full h-full";
  // Non-fullscreen classes: self-contained styling with padding, background, rounded corners, and shadow.
  const nonFullscreenWrapperClasses = "p-3 mx-auto";
  
  return (
    <div 
      ref={boardWrapperRef} 
      className={`${baseWrapperClasses} ${isFullScreen ? fullscreenWrapperClasses : nonFullscreenWrapperClasses}`} 
      style={boardWrapperDynamicStyle}
      aria-label="Game Board Area" // Accessibility: Label for the board container.
    >
      {/* Fullscreen toggle button: only shown when not in fullscreen mode. */}
      {!isFullScreen && (
        <button
          onClick={onToggleFullScreen}
          className="absolute top-1 right-1 z-20 p-1.5 text-theme-icon-light dark:text-theme-icon-dark hover:text-theme-icon-light-hover dark:hover:text-theme-icon-dark-hover transition-colors duration-150 rounded-full hover:bg-theme-button-icon-bg-hover-light dark:hover:bg-theme-button-icon-bg-hover-dark focus:outline-none focus:ring-1 focus:ring-inset focus:ring-indigo-500 dark:focus:ring-yellow-500"
          aria-label="Enter Fullscreen"
          title="Enter Fullscreen"
        >
          <ExpandIcon className="w-5 h-5" />
        </button>
      )}

      {/* This div is the one that gets scaled. It contains the hex grid and edge indicators. */}
      <div style={scalableContentStyle} role="grid" aria-rowcount={boardSize} aria-colcount={boardSize}>
        {/* Edge Indicators: Visual cues for player connection goals.
            Rendered if layout is calculated AND (EITHER no winner OR replay is active). */}
        {layoutProps.originalWidth > 0 && layoutProps.originalHeight > 0 && (!winningPlayer || isReplayActive) && (
          <>
            {/* Player.TWO (Vertical connector) indicators: Top and Bottom edges. */}
            {currentPlayer === Player.TWO && (
              <>
                <div
                  className="absolute left-1/2 -translate-x-1/2 top-0 h-1.5 rounded-full opacity-70"
                  style={{ width: `${edgeIndicatorParentWidth * 0.6}px`, minWidth: '50px', backgroundColor: player2Color }}
                  aria-hidden="true" // Decorative element
                ></div>
                <div
                  className="absolute left-1/2 -translate-x-1/2 bottom-0 h-1.5 rounded-full opacity-70"
                  style={{ width: `${edgeIndicatorParentWidth * 0.6}px`, minWidth: '50px', backgroundColor: player2Color }}
                  aria-hidden="true"
                ></div>
              </>
            )}
            {/* Player.ONE (Horizontal connector) indicators: Left and Right edges. */}
            {currentPlayer === Player.ONE && (
              <>
                <div
                  className="absolute top-1/2 -translate-y-1/2 left-0 w-1.5 rounded-full opacity-70"
                  style={{ height: `${edgeIndicatorParentHeight * 0.6}px`, minHeight: '50px', backgroundColor: player1Color }}
                  aria-hidden="true"
                ></div>
                <div
                  className="absolute top-1/2 -translate-y-1/2 right-0 w-1.5 rounded-full opacity-70"
                  style={{ height: `${edgeIndicatorParentHeight * 0.6}px`, minHeight: '50px', backgroundColor: player1Color }}
                  aria-hidden="true"
                ></div>
              </>
            )}
          </>
        )}

        {/* Container for the actual hexagonal grid cells. Includes internal padding. */}
        <div style={{ 
            display: 'flex', 
            flexDirection: 'column', // Rows are stacked vertically.
            position: 'relative', // Ensures it's above edge indicators if z-index isn't enough.
            zIndex: 1, // Render grid above edge indicators.
            paddingTop: `${BOARD_INTERNAL_VERTICAL_PADDING_PX}px`,
            paddingBottom: `${BOARD_INTERNAL_VERTICAL_PADDING_PX}px`,
            paddingLeft: `${BOARD_INTERNAL_HORIZONTAL_PADDING_PX}px`,
            paddingRight: `${BOARD_INTERNAL_HORIZONTAL_PADDING_PX}px`,
        }}>
          {/* Map over the boardMatrix to render each row of hexagonal cells. */}
          {boardMatrix.map((row, rowIndex) => {
            // Calculate horizontal offset for each row to create the staggered hexagonal layout.
            // Each subsequent row is shifted right by half a cell width.
            const marginLeftPx = rowIndex * (CELL_WIDTH_PX / 2);
            return (
              <div
                key={rowIndex}
                role="row" // Accessibility: Defines a row in the grid.
                style={{
                  display: 'flex', // Cells within a row are laid out horizontally.
                  marginLeft: `${marginLeftPx}px`,
                  // Apply negative top margin for rows after the first to achieve vertical overlap.
                  marginTop: rowIndex > 0 ? `-${ROW_VERTICAL_OFFSET_PX}px` : '0px',
                }}
              >
                {/* Map over cells in the current row. */}
                {row.map((cellValue, colIndex) => (
                  // Wrapper for each cell, includes inter-cell margins.
                  <div key={`${rowIndex}-${colIndex}`} style={{ marginRight: '1px', marginBottom: '1px' }} role="gridcell">
                    <Cell
                      value={cellValue}
                      onClick={() => onCellClick(rowIndex, colIndex)}
                      baseDisabled={disabled}
                      currentPlayer={currentPlayer} // Board side current player
                      rowIndex={rowIndex}
                      colIndex={colIndex}
                      swapRuleEnabled={swapRuleEnabled}
                      turnCount={turnCount}
                      firstGameMoveDetails={firstGameMoveDetails}
                      isSwappedCell={swappedCellCoordinate?.r === rowIndex && swappedCellCoordinate?.c === colIndex}
                      isPlayerRolesSwapped={isPlayerRolesSwapped}
                      winningPlayer={winningPlayer}
                      isInWinningPath={isCellInWinningPath(rowIndex, colIndex)}
                      player1Color={player1Color}
                      player2Color={player2Color}
                      currentPlayerActualColor={currentPlayerActualColor} // Actual participant color
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Board;
