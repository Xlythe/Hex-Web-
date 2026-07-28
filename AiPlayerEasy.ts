
import { BoardMatrix, Coordinate, Player } from './types';

/**
 * @class AiPlayerEasy
 * @description Implements an "Easy" difficulty AI strategy for the Hex game.
 * This AI is based on a translation of a specific Java implementation.
 * Its core strategy involves:
 * 1. Tracking its "advancement points": `easy_n_coord` (start/left/top-most) and `easy_m_coord` (end/right/bottom-most).
 * 2. Preferring central board positions initially.
 * 3. Forming "pairs" of adjacent cells (`easy_pairs`) to create rudimentary bridges or paths.
 * 4. Defending these pairs if one cell is occupied (by AI or opponent) and the other is empty.
 * 5. Reacting to opponent moves that directly block its `easy_n_coord` or `easy_m_coord` advances.
 * 6. Extending its `easy_n_coord` and `easy_m_coord` paths using specific 2-step patterns.
 * 7. Checking for immediate winning moves on the edge.
 * 8. Actively playing onto an edge to "secure" it once adjacent, updating its advancement points.
 * 9. Filling in gaps in its `easy_pairs` structure once its advancement points reach the board edges.
 * 10. Resorting to a random move if no specific strategic move is identified.
 *
 * The AI's internal state (`easy_n_coord`, `easy_m_coord`, `easy_pairs`) is reset if the game
 * context (player side, board size) changes or if it's the first move in a new game setup.
 */
export class AiPlayerEasy {
  // Tracks the "leftmost" or "starting" point of the AI's conceptual path.
  // For a horizontal player (Player.ONE), this is the piece closest to the left edge.
  // For a vertical player (Player.TWO), this is the piece closest to the top edge.
  private easy_n_coord: Coordinate | null = null;

  // Tracks the "rightmost" or "ending" point of the AI's conceptual path.
  // For Player.ONE, closest to the right edge; for Player.TWO, closest to the bottom edge.
  private easy_m_coord: Coordinate | null = null;

  // Stores pairs of coordinates that form part of the AI's path structure.
  // These are used for defense and for filling gaps when edges are reached.
  private easy_pairs: Array<[Coordinate, Coordinate]> = [];

  // Random offsets used for an initial move if the center is taken by the opponent.
  private easy_rand_a: number = 0;
  private easy_rand_b: number = 0;

  // State variables to detect changes in game context, triggering a reset of AI's internal state.
  private easy_last_player_side: Player | null = null;
  private easy_last_board_size: number = 0;
  private easy_state_initialized_this_game: boolean = false;

  constructor() {
    this.resetRandomOffsets();
  }

  /**
   * Resets the random offsets `easy_rand_a` and `easy_rand_b`.
   * Ensures that at least one of them is non-zero.
   */
  private resetRandomOffsets(): void {
    this.easy_rand_a = 0;
    this.easy_rand_b = 0;
    while (this.easy_rand_a === 0 && this.easy_rand_b === 0) {
      this.easy_rand_a = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
      this.easy_rand_b = Math.floor(Math.random() * 3) - 1;
    }
  }
  
  /**
   * Determines the opponent of the given player side.
   * @param playerSide The player side whose opponent is to be found.
   * @returns The opposing player side.
   */
  private getOpponent(playerSide: Player): Player {
    return playerSide === Player.ONE ? Player.TWO : Player.ONE;
  }
  
  /**
   * Safely retrieves the state of a cell on the board.
   * @param board The game board matrix.
   * @param r Row index.
   * @param c Column index.
   * @returns The cell state (Player.ONE, Player.TWO, or null) if within bounds, otherwise undefined.
   */
  private getBoardCellState(board: BoardMatrix, r: number, c: number): Player | null | undefined {
      const boardSize = board.length;
      if (r >= 0 && r < boardSize && c >= 0 && c < boardSize) {
          return board[r][c];
      }
      return undefined; // Out of bounds
  }

  /**
   * Checks if a cell is within board bounds and is empty.
   * @param board The game board matrix.
   * @param r Row index.
   * @param c Column index.
   * @returns True if the cell is valid and empty, false otherwise.
   */
  private isValidAndEmpty(board: BoardMatrix, r: number, c: number): boolean {
      const cellState = this.getBoardCellState(board, r, c);
      return cellState === null;
  }

  // --- Start of Win Condition Check Helper Methods ---
  private cloneBoard_INTERNAL(boardMatrix: BoardMatrix): BoardMatrix {
    return boardMatrix.map(row => [...row]);
  }

  private getNeighbors_INTERNAL(r: number, c: number, boardSize: number): Coordinate[] {
    const potentialNeighborCoords: Array<[number, number]> = [
      [r, c - 1], [r, c + 1], [r - 1, c], [r - 1, c + 1], [r + 1, c], [r + 1, c - 1],
    ];
    const neighbors: Coordinate[] = [];
    for (const [nr, nc] of potentialNeighborCoords) {
      if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize) {
        neighbors.push({ r: nr, c: nc });
      }
    }
    return neighbors;
  }
  
  private dfsWinCheck_INTERNAL(
    board: BoardMatrix,
    player: Player,
    r: number,
    c: number,
    visited: boolean[][],
    boardSize: number
  ): boolean {
    if (r < 0 || r >= boardSize || c < 0 || c >= boardSize || visited[r][c] || board[r][c] !== player) {
      return false;
    }
    visited[r][c] = true;

    if (player === Player.ONE && c === boardSize - 1) return true; 
    if (player === Player.TWO && r === boardSize - 1) return true; 

    const neighbors = this.getNeighbors_INTERNAL(r, c, boardSize);
    for (const neighbor of neighbors) {
      if (this.dfsWinCheck_INTERNAL(board, player, neighbor.r, neighbor.c, visited, boardSize)) {
        return true;
      }
    }
    return false;
  }

  private checkWinConditionOnBoard_INTERNAL(board: BoardMatrix, player: Player): boolean {
    const boardSize = board.length;
    if (boardSize === 0) return false;
    const visited: boolean[][] = Array(boardSize).fill(null).map(() => Array(boardSize).fill(false));

    if (player === Player.ONE) { 
      for (let r_start = 0; r_start < boardSize; r_start++) {
        if (board[r_start][0] === player && !visited[r_start][0]) { 
          if (this.dfsWinCheck_INTERNAL(board, player, r_start, 0, visited, boardSize)) return true;
        }
      }
    } else { // Player.TWO
      for (let c_start = 0; c_start < boardSize; c_start++) {
        if (board[0][c_start] === player && !visited[0][c_start]) { 
          if (this.dfsWinCheck_INTERNAL(board, player, 0, c_start, visited, boardSize)) return true;
        }
      }
    }
    return false;
  }
  // --- End of Win Condition Check Helper Methods ---


  /**
   * Calculates the AI's next move.
   * @param boardMatrix The current state of the game board.
   * @param playerSide The player side (Player.ONE or Player.TWO) for which the AI is making a move.
   * @param emptyCells An array of coordinates representing all empty cells on the board.
   * @returns The coordinate of the AI's chosen move, or null if no move is possible.
   */
  public getMove(
      boardMatrix: BoardMatrix,
      playerSide: Player,
      emptyCells: Coordinate[]
  ): Coordinate | null {
      if (emptyCells.length === 0) return null;

      const boardSize = boardMatrix.length;
      const opponentSide = this.getOpponent(playerSide);

      // Reset AI state if game context (player side, board size) has changed,
      // or if this is the first move for the AI in this specific game setup.
      if (this.easy_last_player_side !== playerSide || this.easy_last_board_size !== boardSize || !this.easy_state_initialized_this_game) {
          this.easy_n_coord = null;
          this.easy_m_coord = null;
          this.easy_pairs = [];
          this.resetRandomOffsets(); 
          this.easy_last_player_side = playerSide;
          this.easy_last_board_size = boardSize;
          this.easy_state_initialized_this_game = true; 
      }
      
      // Initial Move Strategy:
      // If the AI has no tracked advancement points (n_coord or m_coord), try to establish them.
      if (!this.easy_n_coord || !this.easy_m_coord) {
        const mid = Math.floor((boardSize - 1) / 2); // Center of the board.
        // Prefer the exact center if empty.
        if (this.isValidAndEmpty(boardMatrix, mid, mid)) {
            this.easy_n_coord = { r: mid, c: mid };
            this.easy_m_coord = { r: mid, c: mid };
            return { ...this.easy_n_coord };
        } else if (this.getBoardCellState(boardMatrix, mid, mid) === opponentSide) {
            // If opponent took center, play randomly nearby.
            const randMoveR = mid + this.easy_rand_a;
            const randMoveC = mid + this.easy_rand_b;
            if (this.isValidAndEmpty(boardMatrix, randMoveR, randMoveC)) {
                this.easy_n_coord = { r: randMoveR, c: randMoveC };
                this.easy_m_coord = { r: randMoveR, c: randMoveC };
                return { ...this.easy_n_coord };
            }
        }
        // If still no n_coord, try to find any existing piece to anchor from.
        // This handles scenarios where AI takes over a game or if initial center plays failed.
        if (!this.easy_n_coord) {
            let foundOwnPiece = false;
            for (let r_idx = 0; r_idx < boardSize; r_idx++) {
                for (let c_idx = 0; c_idx < boardSize; c_idx++) {
                    if (this.getBoardCellState(boardMatrix, r_idx, c_idx) === playerSide) {
                        if (!this.easy_n_coord) this.easy_n_coord = {r: r_idx, c: c_idx};
                        this.easy_m_coord = {r: r_idx, c: c_idx}; // Both n and m start at the first found piece.
                        foundOwnPiece = true;
                    }
                }
            }
            // If no pieces yet and center options failed, make a random move to start.
            if (!foundOwnPiece && emptyCells.length > 0) {
                 const firstRandomMove = emptyCells[Math.floor(Math.random() * emptyCells.length)];
                 this.easy_n_coord = {...firstRandomMove};
                 this.easy_m_coord = {...firstRandomMove};
                 return firstRandomMove;
            }
             // Final fallback for initialization if something unexpected happened.
             if(!this.easy_n_coord && emptyCells.length > 0) { 
                 const randomFallback = emptyCells[Math.floor(Math.random() * emptyCells.length)];
                 this.easy_n_coord = {...randomFallback};
                 this.easy_m_coord = {...randomFallback};
                 return randomFallback;
             }
             if(!this.easy_n_coord && emptyCells.length === 0) return null; // No moves possible.
        }
      }
      
      // Ensure n_coord and m_coord are non-null before proceeding.
      // This should be guaranteed by the initialization logic above if emptyCells.length > 0.
      if (!this.easy_n_coord || !this.easy_m_coord) {
          // This is a fallback if initialization logic somehow failed to set n_coord/m_coord.
          return emptyCells[Math.floor(Math.random() * emptyCells.length)]; 
      }

      // Order of Operations:
      // 1. Defend Pairs
      // 2. Final Edge Connection (Winning Move)
      // 3. Reactive Moves (Counter Opponent Blocks)
      // 4. Path Extension (2-step advances)
      // 5. Secure Edge and Update Extents (NEWLY REFINED)
      // 6. Gap Filling Logic
      // 7. Fallback Random Move


      // 1. Pair Defense Logic:
      // Iterate through existing pairs. If one cell is AI's/opponent's and the other is empty, play the empty one.
      for (let i = this.easy_pairs.length - 1; i >= 0; i--) { 
          const pair = this.easy_pairs[i];
          const cell1 = pair[0];
          const cell2 = pair[1];
          const cell1State = this.getBoardCellState(boardMatrix, cell1.r, cell1.c);
          const cell2State = this.getBoardCellState(boardMatrix, cell2.r, cell2.c);

          if (cell1State === null || cell2State === null) { // If at least one cell in the pair is empty
              if (cell1State !== null && cell2State === null) { // Cell1 is occupied, Cell2 is empty
                  this.easy_pairs.splice(i, 1); // Consume the pair
                  return { ...cell2 }; // Play in Cell2
              }
              else if (cell2State !== null && cell1State === null) { // Cell2 is occupied, Cell1 is empty
                  this.easy_pairs.splice(i, 1); // Consume the pair
                  return { ...cell1 }; // Play in Cell1
              }
          } else { // Both cells are occupied (by AI or opponent), pair is no longer useful for defense.
              this.easy_pairs.splice(i, 1); // Remove the fulfilled or blocked pair
          }
      }
      
      // 2. Final Edge Connection Check (Winning Move):
      // Explicitly check if the AI is one move away from winning by connecting to an edge.
      if (this.easy_n_coord && this.easy_m_coord) { // Ensure coordinates are initialized
        const n_on_its_goal_edge = (playerSide === Player.ONE && this.easy_n_coord.c === 0) || (playerSide === Player.TWO && this.easy_n_coord.r === 0);
        const m_on_its_goal_edge = (playerSide === Player.ONE && this.easy_m_coord.c === boardSize - 1) || (playerSide === Player.TWO && this.easy_m_coord.r === boardSize - 1);

        let potentialWinningMove: Coordinate | null = null;

        // Scenario 1: m_coord is on its goal edge, check if n_coord can connect to its goal edge.
        if (m_on_its_goal_edge) {
            if (playerSide === Player.ONE && this.easy_n_coord.c === 1) { // P1, n_coord is 1 step from left edge
                potentialWinningMove = { r: this.easy_n_coord.r, c: 0 };
            } else if (playerSide === Player.TWO && this.easy_n_coord.r === 1) { // P2, n_coord is 1 step from top edge
                potentialWinningMove = { r: 0, c: this.easy_n_coord.c };
            }
        }

        // Scenario 2: n_coord is on its goal edge, check if m_coord can connect to its goal edge.
        // (Only if not already found a potential winning move from Scenario 1).
        if (n_on_its_goal_edge && !potentialWinningMove) { 
            if (playerSide === Player.ONE && this.easy_m_coord.c === boardSize - 2) { // P1, m_coord is 1 step from right edge
                potentialWinningMove = { r: this.easy_m_coord.r, c: boardSize - 1 };
            } else if (playerSide === Player.TWO && this.easy_m_coord.r === boardSize - 2) { // P2, m_coord is 1 step from bottom edge
                potentialWinningMove = { r: boardSize - 1, c: this.easy_m_coord.c };
            }
        }
        
        // If a potential winning move is identified and the cell is empty:
        if (potentialWinningMove && this.isValidAndEmpty(boardMatrix, potentialWinningMove.r, potentialWinningMove.c)) {
            const tempBoard = this.cloneBoard_INTERNAL(boardMatrix); // Create a temporary board
            tempBoard[potentialWinningMove.r][potentialWinningMove.c] = playerSide; // Simulate the move
            if (this.checkWinConditionOnBoard_INTERNAL(tempBoard, playerSide)) { // Check if this move wins
                // This is a winning move. Update n_coord or m_coord to this new winning cell.
                if (playerSide === Player.ONE) {
                    if (potentialWinningMove.c === 0) this.easy_n_coord = { ...potentialWinningMove };
                    else if (potentialWinningMove.c === boardSize - 1) this.easy_m_coord = { ...potentialWinningMove };
                } else { // Player.TWO
                    if (potentialWinningMove.r === 0) this.easy_n_coord = { ...potentialWinningMove };
                    else if (potentialWinningMove.r === boardSize - 1) this.easy_m_coord = { ...potentialWinningMove };
                }
                return { ...potentialWinningMove }; // Play the winning move
            }
        }
      }

      // 3. Reactive Moves (Countering "Sneaky" Opponent Plays):
      // Check if opponent played directly in front of m_coord or n_coord advance.
      const {r: mr, c: mc} = this.easy_m_coord; 
      const {r: nr, c: nc} = this.easy_n_coord; 

      // Define forward/alternative cells based on player orientation
      let forwardCell: Coordinate, altCell1: Coordinate, altCell2: Coordinate; 
      let backwardCell: Coordinate, backAltCell1: Coordinate, backAltCell2: Coordinate; 

      if (playerSide === Player.ONE) { // Horizontal player
          // Forward from m_coord (rightward advance)
          forwardCell = {r: mr, c: mc + 1};     // Directly right
          altCell1 = {r: mr - 1, c: mc + 1};  // Diagonal up-right
          altCell2 = {r: mr + 1, c: mc};      // Diagonal down-right (original Java: mr+1, mc was for m[y] + 1*x + 0*y)
          
          // Backward from n_coord (leftward advance)
          backwardCell = {r: nr, c: nc - 1};    // Directly left
          backAltCell1 = {r: nr + 1, c: nc - 1}; // Diagonal down-left
          backAltCell2 = {r: nr - 1, c: nc};     // Diagonal up-left (original Java: nr-1, nc was for n[y] -1*y +0*x)
      } else { // Vertical player
          // Forward from m_coord (downward advance)
          forwardCell = {r: mr + 1, c: mc};     // Directly down
          altCell1 = {r: mr + 1, c: mc - 1};  // Diagonal down-left
          altCell2 = {r: mr + 1, c: mc + 1};  // Diagonal down-right
          
          // Backward from n_coord (upward advance)
          backwardCell = {r: nr - 1, c: nc};    // Directly up
          backAltCell1 = {r: nr - 1, c: nc + 1}; // Diagonal up-right
          backAltCell2 = {r: nr - 1, c: nc - 1}; // Diagonal up-left
      }

      // If opponent blocked directly in front of m_coord's path
      if (this.getBoardCellState(boardMatrix, forwardCell.r, forwardCell.c) === opponentSide) {
          if (this.isValidAndEmpty(boardMatrix, altCell1.r, altCell1.c)) { // Try alternative 1
              this.easy_m_coord = {...altCell1}; return {...altCell1};
          } else if (this.isValidAndEmpty(boardMatrix, altCell2.r, altCell2.c)) { // Try alternative 2
              this.easy_m_coord = {...altCell2}; return {...altCell2};
          }
      }
      // If opponent blocked one of the alternatives, try to play in the direct forward cell
      if ((this.getBoardCellState(boardMatrix, altCell1.r, altCell1.c) === opponentSide || 
           this.getBoardCellState(boardMatrix, altCell2.r, altCell2.c) === opponentSide) &&
          this.isValidAndEmpty(boardMatrix, forwardCell.r, forwardCell.c)) {
          this.easy_m_coord = {...forwardCell}; return {...forwardCell};
      }
      // If opponent blocked directly in front of n_coord's path (backward expansion)
      if (this.getBoardCellState(boardMatrix, backwardCell.r, backwardCell.c) === opponentSide) {
          if (this.isValidAndEmpty(boardMatrix, backAltCell1.r, backAltCell1.c)) {
              this.easy_n_coord = {...backAltCell1}; return {...backAltCell1};
          } else if (this.isValidAndEmpty(boardMatrix, backAltCell2.r, backAltCell2.c)) {
              this.easy_n_coord = {...backAltCell2}; return {...backAltCell2};
          }
      }
      // If opponent blocked one of n_coord's alternatives, try to play in the direct backward cell
      if ((this.getBoardCellState(boardMatrix, backAltCell1.r, backAltCell1.c) === opponentSide || 
           this.getBoardCellState(boardMatrix, backAltCell2.r, backAltCell2.c) === opponentSide) &&
          this.isValidAndEmpty(boardMatrix, backwardCell.r, backwardCell.c)) {
          this.easy_n_coord = {...backwardCell}; return {...backwardCell};
      }

      // 4. Path Extension Logic (2-step advances):
      // Defines potential 2-step advances and corresponding pairs for m_coord.
      let m_target1: Coordinate, m_target2: Coordinate, m_pair1_c1: Coordinate, m_pair1_c2: Coordinate, m_pair2_c1: Coordinate, m_pair2_c2: Coordinate;
      let m_can_extend = false;

      if (playerSide === Player.ONE) { // Horizontal P1: m_coord extends right
          m_target1 = { r: mr + 1, c: mc + 1 }; // Diagonal down-right-ish
          m_target2 = { r: mr - 1, c: mc + 2 }; // "Knight's move" up-double-right
          m_pair1_c1 = { r: mr + 1, c: mc };   m_pair1_c2 = { r: mr, c: mc + 1 }; // Pair for m_target1
          m_pair2_c1 = { r: mr, c: mc + 1 };   m_pair2_c2 = { r: mr - 1, c: mc + 1 }; // Pair for m_target2
          m_can_extend = mc + 2 < boardSize && mr + 1 < boardSize && mr - 1 >= 0; // Check bounds for targets
      } else { // Vertical P2: m_coord extends down
          m_target1 = { r: mr + 1, c: mc + 1 }; // Diagonal down-right
          m_target2 = { r: mr + 2, c: mc - 1 }; // "Knight's move" double-down-left
          m_pair1_c1 = { r: mr, c: mc + 1 };   m_pair1_c2 = { r: mr + 1, c: mc }; // Pair for m_target1
          m_pair2_c1 = { r: mr + 1, c: mc - 1 }; m_pair2_c2 = { r: mr + 1, c: mc }; // Pair for m_target2
          m_can_extend = mr + 2 < boardSize && mc + 1 < boardSize && mc - 1 >= 0; // Check bounds
      }

      if (m_can_extend) {
          const state_target1 = this.getBoardCellState(boardMatrix, m_target1.r, m_target1.c);
          const state_target2 = this.getBoardCellState(boardMatrix, m_target2.r, m_target2.c);

          // If opponent blocks one target, play the other if empty
          if (state_target2 === opponentSide && state_target1 === null) {
              this.easy_m_coord = { ...m_target1 }; this.easy_pairs.push([m_pair1_c1, m_pair1_c2]); return { ...m_target1 };
          } else if (state_target1 === opponentSide && state_target2 === null) {
              this.easy_m_coord = { ...m_target2 }; this.easy_pairs.push([m_pair2_c1, m_pair2_c2]); return { ...m_target2 };
          }
          // If neither blocked by opponent, randomly choose one if empty
          const rand_choice_m = Math.floor(Math.random() * 2);
          if (rand_choice_m === 0 && state_target2 === null) {
              this.easy_m_coord = { ...m_target2 }; this.easy_pairs.push([m_pair2_c1, m_pair2_c2]); return { ...m_target2 };
          } else if (rand_choice_m === 1 && state_target1 === null) {
              this.easy_m_coord = { ...m_target1 }; this.easy_pairs.push([m_pair1_c1, m_pair1_c2]); return { ...m_target1 };
          } // Fallback if random choice was blocked but other is available
          else if (state_target2 === null) { 
              this.easy_m_coord = { ...m_target2 }; this.easy_pairs.push([m_pair2_c1, m_pair2_c2]); return { ...m_target2 };
          } else if (state_target1 === null) {
              this.easy_m_coord = { ...m_target1 }; this.easy_pairs.push([m_pair1_c1, m_pair1_c2]); return { ...m_target1 };
          }
      }
      
      // Defines potential 2-step advances and corresponding pairs for n_coord.
      let n_target1: Coordinate, n_target2: Coordinate, n_pair1_c1: Coordinate, n_pair1_c2: Coordinate, n_pair2_c1: Coordinate, n_pair2_c2: Coordinate;
      let n_can_extend = false;

      if (playerSide === Player.ONE) { // Horizontal P1: n_coord extends left
          n_target1 = { r: nr - 1, c: nc - 1 }; // Diagonal up-left-ish
          n_target2 = { r: nr + 1, c: nc - 2 }; // "Knight's move" down-double-left
          n_pair1_c1 = { r: nr - 1, c: nc };   n_pair1_c2 = { r: nr, c: nc - 1 }; // Pair for n_target1
          n_pair2_c1 = { r: nr, c: nc - 1 };   n_pair2_c2 = { r: nr + 1, c: nc - 1 }; // Pair for n_target2
          n_can_extend = nc - 2 >= 0 && nr + 1 < boardSize && nr - 1 >= 0; // Check bounds
      } else { // Vertical P2: n_coord extends up
          n_target1 = { r: nr - 1, c: nc - 1 }; // Diagonal up-left
          n_target2 = { r: nr - 2, c: nc + 1 }; // "Knight's move" double-up-right
          n_pair1_c1 = { r: nr, c: nc - 1 };   n_pair1_c2 = { r: nr - 1, c: nc }; // Pair for n_target1
          n_pair2_c1 = { r: nr - 1, c: nc + 1 }; n_pair2_c2 = { r: nr - 1, c: nc }; // Pair for n_target2
          n_can_extend = nr - 2 >= 0 && nc + 1 < boardSize && nc - 1 >= 0; // Check bounds
      }
      
      if (n_can_extend) {
          const state_target1 = this.getBoardCellState(boardMatrix, n_target1.r, n_target1.c);
          const state_target2 = this.getBoardCellState(boardMatrix, n_target2.r, n_target2.c);

          if (state_target2 === opponentSide && state_target1 === null) {
              this.easy_n_coord = { ...n_target1 }; this.easy_pairs.push([n_pair1_c1, n_pair1_c2]); return { ...n_target1 };
          } else if (state_target1 === opponentSide && state_target2 === null) {
              this.easy_n_coord = { ...n_target2 }; this.easy_pairs.push([n_pair2_c1, n_pair2_c2]); return { ...n_target2 };
          }
          const rand_choice_n = Math.floor(Math.random() * 2);
          if (rand_choice_n === 0 && state_target2 === null) {
              this.easy_n_coord = { ...n_target2 }; this.easy_pairs.push([n_pair2_c1, n_pair2_c2]); return { ...n_target2 };
          } else if (rand_choice_n === 1 && state_target1 === null) {
              this.easy_n_coord = { ...n_target1 }; this.easy_pairs.push([n_pair1_c1, n_pair1_c2]); return { ...n_target1 };
          } else if (state_target2 === null) {
              this.easy_n_coord = { ...n_target2 }; this.easy_pairs.push([n_pair2_c1, n_pair2_c2]); return { ...n_target2 };
          } else if (state_target1 === null) {
              this.easy_n_coord = { ...n_target1 }; this.easy_pairs.push([n_pair1_c1, n_pair1_c2]); return { ...n_target1 };
          }
      }

      // 5. Secure Edge and Update Extents:
      // If AI is adjacent to an edge, play onto it to secure presence and update n/m coords.
      if (playerSide === Player.ONE) { // Horizontal Player
        if (this.easy_n_coord && this.easy_n_coord.c === 1) { // Near left edge
            const original_n_coord_r = this.easy_n_coord.r;
            const onEdgeCell1 = { r: original_n_coord_r, c: 0 };
            const onEdgeCell2 = { r: original_n_coord_r + 1, c: 0 }; // Alternative hex bridge connection
            if (this.isValidAndEmpty(boardMatrix, onEdgeCell1.r, onEdgeCell1.c)) {
                this.easy_n_coord = { ...onEdgeCell1 };
                this.easy_pairs.push([{...onEdgeCell1}, {r: original_n_coord_r, c: 1}]); 
                return { ...onEdgeCell1 };
            } else if (original_n_coord_r + 1 < boardSize && this.isValidAndEmpty(boardMatrix, onEdgeCell2.r, onEdgeCell2.c)) {
                this.easy_n_coord = { ...onEdgeCell2 };
                this.easy_pairs.push([{...onEdgeCell2}, {r: original_n_coord_r, c: 1}]); 
                return { ...onEdgeCell2 };
            }
        }
        if (this.easy_m_coord && this.easy_m_coord.c === boardSize - 2) { // Near right edge
            const original_m_coord_r = this.easy_m_coord.r;
            const onEdgeCell1 = { r: original_m_coord_r, c: boardSize - 1 };
            const onEdgeCell2 = { r: original_m_coord_r - 1, c: boardSize - 1 };
            if (this.isValidAndEmpty(boardMatrix, onEdgeCell1.r, onEdgeCell1.c)) {
                this.easy_m_coord = { ...onEdgeCell1 };
                this.easy_pairs.push([{...onEdgeCell1}, {r: original_m_coord_r, c: boardSize - 2}]);
                return { ...onEdgeCell1 };
            } else if (original_m_coord_r - 1 >= 0 && this.isValidAndEmpty(boardMatrix, onEdgeCell2.r, onEdgeCell2.c)) {
                this.easy_m_coord = { ...onEdgeCell2 };
                this.easy_pairs.push([{...onEdgeCell2}, {r: original_m_coord_r, c: boardSize - 2}]);
                return { ...onEdgeCell2 };
            }
        }
      } else { // Vertical Player (Player.TWO)
        if (this.easy_n_coord && this.easy_n_coord.r === 1) { // Near top edge
            const original_n_coord_c = this.easy_n_coord.c;
            const onEdgeCell1 = { r: 0, c: original_n_coord_c };
            const onEdgeCell2 = { r: 0, c: original_n_coord_c + 1 };
            if (this.isValidAndEmpty(boardMatrix, onEdgeCell1.r, onEdgeCell1.c)) {
                this.easy_n_coord = { ...onEdgeCell1 };
                this.easy_pairs.push([{...onEdgeCell1}, {r: 1, c: original_n_coord_c}]);
                return { ...onEdgeCell1 };
            } else if (original_n_coord_c + 1 < boardSize && this.isValidAndEmpty(boardMatrix, onEdgeCell2.r, onEdgeCell2.c)) {
                this.easy_n_coord = { ...onEdgeCell2 };
                this.easy_pairs.push([{...onEdgeCell2}, {r: 1, c: original_n_coord_c}]);
                return { ...onEdgeCell2 };
            }
        }
        if (this.easy_m_coord && this.easy_m_coord.r === boardSize - 2) { // Near bottom edge
            const original_m_coord_c = this.easy_m_coord.c;
            const onEdgeCell1 = { r: boardSize - 1, c: original_m_coord_c };
            const onEdgeCell2 = { r: boardSize - 1, c: original_m_coord_c - 1 };
            if (this.isValidAndEmpty(boardMatrix, onEdgeCell1.r, onEdgeCell1.c)) {
                this.easy_m_coord = { ...onEdgeCell1 };
                this.easy_pairs.push([{...onEdgeCell1}, {r: boardSize - 2, c: original_m_coord_c}]);
                return { ...onEdgeCell1 };
            } else if (original_m_coord_c - 1 >= 0 && this.isValidAndEmpty(boardMatrix, onEdgeCell2.r, onEdgeCell2.c)) {
                this.easy_m_coord = { ...onEdgeCell2 };
                this.easy_pairs.push([{...onEdgeCell2}, {r: boardSize - 2, c: original_m_coord_c}]);
                return { ...onEdgeCell2 };
            }
        }
      }

      // 6. Gap Filling Logic:
      // If n_coord and m_coord are on their respective goal edges, fill in pairs.
      let n_on_edge = false;
      let m_on_edge = false;
      if (this.easy_n_coord && this.easy_m_coord ) { // Check again as they might have been updated
        if(playerSide === Player.ONE){ 
            n_on_edge = this.easy_n_coord.c === 0;
            m_on_edge = this.easy_m_coord.c === boardSize - 1;
        } else { // Player.TWO
            n_on_edge = this.easy_n_coord.r === 0;
            m_on_edge = this.easy_m_coord.r === boardSize - 1;
        }
      }

      if (n_on_edge && m_on_edge && this.easy_pairs.length > 0) {
          for (let i = this.easy_pairs.length - 1; i >= 0; i--) { 
              const pairToFill = this.easy_pairs[i];
              const cellA = pairToFill[0]; 
              const cellB = pairToFill[1]; 

              // Try to play in the second cell of the pair if empty
              if (this.isValidAndEmpty(boardMatrix, cellB.r, cellB.c)) {
                  this.easy_pairs.splice(i, 1); // Consume the pair
                  return { ...cellB };
              } // Else, try to play in the first cell of the pair if empty
              else if (this.isValidAndEmpty(boardMatrix, cellA.r, cellA.c)) {
                  this.easy_pairs.splice(i, 1); // Consume the pair
                  return { ...cellA };
              } // If both are occupied or invalid, remove the pair
              else if (!this.isValidAndEmpty(boardMatrix, cellA.r, cellA.c) && 
                       !this.isValidAndEmpty(boardMatrix, cellB.r, cellB.c)) {
                  this.easy_pairs.splice(i, 1);
              }
          }
      }

      // 7. Fallback: Random Move
      // If no strategic move was found, pick a random empty cell.
      if (emptyCells.length > 0) {
        const randomMove = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        // Update m_coord (and n_coord if it was just initialized) to this random move
        // to give some sense of progression, even if random.
        this.easy_m_coord = {...randomMove}; 
        if (!this.easy_n_coord) this.easy_n_coord = {...randomMove}; 
        return randomMove;
      }

      return null; // Should not be reached if emptyCells.length > 0 initially.
  }
}
