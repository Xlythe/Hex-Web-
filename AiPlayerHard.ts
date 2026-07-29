import { BoardMatrix, Coordinate, Player } from './types';

// --- Constants for AI's internal representation ---
/** Represents an empty cell on the board. */
const EMPTY = 0;
/**
 * Internal AI representation for Player.ONE.
 * Player One typically aims to connect horizontally (e.g., West to East).
 */
const PLAYER_ONE_INTERNAL_ID = 1;
/**
 * Internal AI representation for Player.TWO.
 * Player Two typically aims to connect vertically (e.g., North to South).
 */
const PLAYER_TWO_INTERNAL_ID = 2;

// --- AI Algorithm Parameters ---
/** Default search depth for the minimax algorithm. Higher values mean deeper search but more computation. */
const DEFAULT_MAX_DEPTH = 2;
/**
 * Default beam size for the beam search optimization.
 * At each node in the game tree, only the 'beamSize' best moves (according to a heuristic) are explored further.
 * This prunes the search space, making deeper searches feasible at the cost of potentially missing an optimal move.
 */
const DEFAULT_BEAM_SIZE = 5;

/**
 * Interface for a comparable object. Used here by `MoveInternalImpl`
 * to allow sorting of potential moves based on their heuristic evaluation.
 */
interface Comparable<T> {
  /**
   * Compares this object with the specified object for order.
   * @param other The object to be compared.
   * @returns A negative integer, zero, or a positive integer as this object
   *          is less than, equal to, or greater than the specified object.
   */
  compareTo(other: T): number;
}

/**
 * Represents a potential move within the AI's internal board representation.
 * It includes the move's coordinates on the AI's padded internal board and an
 * evaluated heuristic 'value'. This value is used to quickly sort and prioritize
 * moves, especially for the beam search. In this AI, a lower 'value' (sum of
 * two-distances) is considered better for move ordering during the initial phase of move generation.
 */
class MoveInternalImpl implements Comparable<MoveInternalImpl> {
  constructor(
    /** Row index on the AI's internal padded board. */
    public row: number,
    /** Column index on the AI's internal padded board. */
    public column: number,
    /** Heuristic value of the move. Lower is generally better for sorting. */
    public value: number
  ) {}

  /**
   * Compares this move to another based on its heuristic value.
   * Essential for sorting moves, e.g., in `getMovesInternal` for beam search.
   * @param other The other `MoveInternalImpl` to compare to.
   * @returns A negative number if this move's value is smaller,
   *          a positive number if larger, or zero if equal.
   */
  compareTo(other: MoveInternalImpl): number {
    return this.value - other.value;
  }
}

/**
 * Represents a node (cell) on the Hex board for graph-based evaluations within the AI.
 * Each node corresponds to a cell on the AI's internal padded board.
 *
 * For empty cells, this class is crucial for determining "effective" neighboring empty cells.
 * An "effective neighbor" is another empty cell that can be reached from the current empty cell
 * by traversing through an adjacent path of same-colored pieces belonging to a specific player.
 * This concept is fundamental for the AI's pathfinding heuristics (the "two-distance" arrays).
 *
 * The `buildEvaluationBoard` static method initializes a grid of these nodes,
 * pre-calculating these effective neighborhood relationships for all empty cells.
 */
class EvaluationNodeInternal {
  /**
   * Set of empty cells effectively adjacent for Player One (horizontal player).
   * An empty cell 'B' is an effective neighbor of empty cell 'A' for Player One if
   * 'B' is geometrically adjacent to a contiguous group of Player One's pieces,
   * and that group is, in turn, geometrically adjacent to 'A'.
   */
  public playerOneEffectiveNeighbours: Set<EvaluationNodeInternal>;
  /** Set of empty cells effectively adjacent for Player Two (vertical player). */
  public playerTwoEffectiveNeighbours: Set<EvaluationNodeInternal>;

  /**
   * Constructs an EvaluationNodeInternal.
   * @param row Row index on the AI's internal padded board.
   * @param column Column index on the AI's internal padded board.
   */
  constructor(public row: number, public column: number) {
    this.playerOneEffectiveNeighbours = new Set<EvaluationNodeInternal>();
    this.playerTwoEffectiveNeighbours = new Set<EvaluationNodeInternal>();
  }

  /**
   * Recursively finds all empty cells that are "effectively" adjacent to this node
   * (which is assumed to be an empty cell when this method is initially called on it).
   * "Effectively adjacent" means an empty cell is reachable from this initial empty cell
   * by traversing a path of geometrically adjacent pieces belonging to the specified `playerInternalId`.
   *
   * This method performs a Depth First Search (DFS)-like exploration.
   * When it encounters a piece of `playerInternalId`, it continues the search from that piece's
   * neighbors. If it encounters an empty cell, that empty cell is an "effective neighbor".
   *
   * @param playerInternalId The internal ID of the player (PLAYER_ONE_INTERNAL_ID or PLAYER_TWO_INTERNAL_ID)
   *                         whose connecting pieces are being traced to find effective neighbors.
   * @param piecesVisitedInPath A set to keep track of *colored pieces* visited within the *current*
   *                            DFS path. This prevents cycles while exploring a single contiguous
   *                            group of same-colored pieces. A new Set is passed for sub-branches
   *                            to ensure all distinct paths are explored.
   * @param allNodesArray The 2D array of all `EvaluationNodeInternal` objects for the entire board.
   * @param pieces The AI's internal representation of the board (0 for empty, 1 for Player One, 2 for Player Two).
   * @param gridSizePadded The dimension of the padded `pieces` array (actual game grid size + 2).
   * @returns A set of `EvaluationNodeInternal` objects representing reachable empty cells.
   */
  private getReachableEmptyCells(
    playerInternalId: number,
    piecesVisitedInPath: Set<EvaluationNodeInternal>,
    allNodesArray: EvaluationNodeInternal[][],
    pieces: number[][],
    gridSizePadded: number
  ): Set<EvaluationNodeInternal> {
    // Base case for cycle detection: if `this` node represents a colored piece
    // and it has already been visited in the current exploration path through colored pieces.
    if (pieces[this.row][this.column] === playerInternalId && piecesVisitedInPath.has(this)) {
      return new Set<EvaluationNodeInternal>(); // Stop this path to avoid cycles.
    }

    const reachableEmptyCells = new Set<EvaluationNodeInternal>();

    // If `this` node represents a piece of `playerInternalId` (i.e., this is a recursive call
    // on a colored piece as part of path traversal), add it to `piecesVisitedInPath`
    // for the current DFS exploration to prevent cycles within this specific path.
    if (pieces[this.row][this.column] === playerInternalId) {
      piecesVisitedInPath.add(this);
    }

    // Define the 6 hexagonal neighbor offsets for a cell in a square grid representation.
    // These are (dr, dc) pairs: (row_offset, col_offset).
    const DIRS = [
      [-1, 0], [1, 0], // Up, Down
      [0, -1], [0, 1], // Left, Right
      [-1, 1], [1, -1] // Diagonal neighbors (common in square grid hex representations)
      // Note: The original Java code uses different neighbors: (-1,0), (0,-1), (1,0), (0,1), (-1,-1), (1,1)
      // The provided TS uses: [-1, -1], [-1, 0], [0, -1], [0, 1], [1, 0], [1, 1]
      // Assuming the TS `DIRS` is the intended set for this port.
      // Both are valid 6-neighbor sets for different square-grid-to-hex-grid mappings.
    ];
    // Let's update the TS DIRS to match the Java version's effective neighbors for consistency with the original logic.
    // Java neighbors (a,b) where a+b!=0: (-1,0), (0,-1), (1,0), (0,1), (-1,-1), (1,1)
    const JAVA_LIKE_DIRS = [
        [-1,0], [0,-1], [1,0], [0,1], [-1,-1], [1,1]
    ];


    for (const [dr, dc] of JAVA_LIKE_DIRS) { // Using Java-like directions
      const nRow = this.row + dr;
      const nCol = this.column + dc;

      // Boundary checks for the padded grid.
      if (nRow < 0 || nRow >= gridSizePadded || nCol < 0 || nCol >= gridSizePadded) {
        continue;
      }

      const neighborNode = allNodesArray[nRow][nCol]; // The EvaluationNodeInternal for the geometric neighbor.

      if (pieces[nRow][nCol] === EMPTY) {
        // If the geometric neighbor is an empty cell, it's an "effective" neighbor. Add it.
        reachableEmptyCells.add(neighborNode);
      } else if (pieces[nRow][nCol] === playerInternalId) {
        // If the geometric neighbor is a piece of the same `playerInternalId`, we can "see through" it.
        // Recursively find empty cells reachable *through* that piece.
        // Crucially, pass a *new Set* for `piecesVisitedInPath` (copied from the current one).
        // This ensures that each exploration branch through colored pieces is independent,
        // allowing a single colored piece to be part of multiple paths to different empty cells.
        const cellsViaThisColoredPath = neighborNode.getReachableEmptyCells(
          playerInternalId,
          new Set<EvaluationNodeInternal>(piecesVisitedInPath), // Path-specific visited set for colored pieces
          allNodesArray,
          pieces,
          gridSizePadded
        );
        // Add all unique empty cells found via this path to the main set.
        cellsViaThisColoredPath.forEach(n => reachableEmptyCells.add(n));
      }
      // If the neighbor is an opponent's piece or part of the border padding of the wrong color,
      // it blocks the path for this player; thus, do nothing.
    }
    return reachableEmptyCells;
  }

  /**
   * Initializes the `nodesArrayToPopulate` with `EvaluationNodeInternal` instances and
   * computes their `playerOneEffectiveNeighbours` and `playerTwoEffectiveNeighbours` sets.
   * This method effectively builds the graph representation used by the AI for its heuristics.
   * In this graph:
   *   - Nodes are cells on the board.
   *   - Edges (implicitly, via the `player*EffectiveNeighbours` sets) connect empty cells
   *     that are "effectively" adjacent from each player's perspective.
   *
   * @param pieces The AI's internal, padded representation of the board state.
   * @param nodesArrayToPopulate (Output parameter) The 2D array that will be filled with
   *                             initialized `EvaluationNodeInternal` nodes, including their
   *                             calculated effective neighbor sets.
   * @param gridSizePadded The dimension of the padded `pieces` array and `nodesArrayToPopulate`.
   */
  public static buildEvaluationBoard(
    pieces: number[][],
    nodesArrayToPopulate: EvaluationNodeInternal[][],
    gridSizePadded: number
  ): void {
    // 1. Initialize all EvaluationNodeInternal instances in the grid.
    //    At this point, their effective neighbor sets are empty.
    for (let r = 0; r < gridSizePadded; r++) {
      for (let c = 0; c < gridSizePadded; c++) {
        nodesArrayToPopulate[r][c] = new EvaluationNodeInternal(r, c);
      }
    }

    // 2. For each EMPTY cell on the board, compute its "effective" neighbors
    //    for Player One and Player Two.
    for (let r = 0; r < gridSizePadded; r++) {
      for (let c = 0; c < gridSizePadded; c++) {
        if (pieces[r][c] !== EMPTY) {
          continue; // Only calculate effective neighbors for currently empty cells.
        }

        const currentNode = nodesArrayToPopulate[r][c];

        // Calculate effective neighbors for Player One (e.g., horizontal connector).
        // The initial call to getReachableEmptyCells starts with an empty `piecesVisitedInPath` set.
        currentNode.playerOneEffectiveNeighbours = currentNode.getReachableEmptyCells(
          PLAYER_ONE_INTERNAL_ID,
          new Set<EvaluationNodeInternal>(), // Fresh visited set for this player's calculation
          nodesArrayToPopulate,
          pieces,
          gridSizePadded
        );
        // An empty cell is not its own effective neighbor in this context.
        currentNode.playerOneEffectiveNeighbours.delete(currentNode);

        // Calculate effective neighbors for Player Two (e.g., vertical connector).
        currentNode.playerTwoEffectiveNeighbours = currentNode.getReachableEmptyCells(
          PLAYER_TWO_INTERNAL_ID,
          new Set<EvaluationNodeInternal>(), // Fresh visited set
          nodesArrayToPopulate,
          pieces,
          gridSizePadded
        );
        currentNode.playerTwoEffectiveNeighbours.delete(currentNode);
      }
    }
  }
}

/**
 * Implements the "Hard" difficulty AI for the game of Hex.
 *
 * Core Strategy:
 * This AI uses the minimax search algorithm with alpha-beta pruning to explore future game states.
 * To manage complexity, it employs beam search, considering only a limited number of promising moves at each step.
 *
 * Board Evaluation:
 * The heart of the AI is its board evaluation function. This function estimates the "goodness" of a board
 * position for the current player. It's based on a concept called "two-distance arrays."
 * These arrays approximate the shortest path length for each player to connect their respective sides of the board.
 * The heuristic considers not just the shortest path ("potential") but also the number of such paths ("mobility").
 *
 * Internal Representation:
 * The AI maintains an internal representation of the game board, which is padded with border cells
 * representing each player's target sides. This simplifies pathfinding calculations to the borders.
 * Coordinate transformations are used to map between the game's external board and this internal representation.
 */
export class AiPlayerHard {
  /**
   * The AI's internal representation of the Hex board.
   * It's a 2D array, larger than the actual game grid due to a 1-cell padding on all sides.
   * Padding cells are marked with player IDs to represent their target connection zones.
   * `pieces[row][col]` stores `EMPTY`, `PLAYER_ONE_INTERNAL_ID`, or `PLAYER_TWO_INTERNAL_ID`.
   * Row 0 and `gridSizePadded-1` are top/bottom borders (for Player Two).
   * Col 0 and `gridSizePadded-1` are left/right borders (for Player One).
   */
  private pieces: number[][] = [];
  /** The size of the actual game grid (e.g., 11 for an 11x11 board). */
  private gridSize: number = 0;
  /** The size of the internal padded board (`gridSize + 2`). */
  private gridSizePadded: number = 0;

  /** The internal ID of the player for whom the AI is currently making a move. */
  private currentAiPlayerInternalId: number = 0;
  /** The internal ID of the opponent player. */
  private opponentPlayerInternalId: number = 0;

  // --- Algorithm Parameters ---
  /** Maximum depth for the minimax search. */
  private maxDepth: number;
  /** Beam size for beam search (limits moves considered at each ply). */
  private beamSize: number;
  /**
   * Transposition table to store evaluations of previously seen board states.
   * Key: String representation of the board state. Value: Heuristic evaluation score.
   * This implementation primarily caches results from the `evaluate()` function,
   * effectively memoizing leaf node evaluations or states fully evaluated.
   */
  private transpositionTable: Map<string, number>;

  /**
   * Constructs the AiPlayerHard instance.
   * @param maxDepth Overrides the default maximum search depth.
   * @param beamSize Overrides the default beam size.
   */
  constructor(maxDepth?: number, beamSize?: number) {
    this.maxDepth = maxDepth ?? DEFAULT_MAX_DEPTH;
    this.beamSize = beamSize ?? DEFAULT_BEAM_SIZE;
    this.transpositionTable = new Map<string, number>();
  }

  private findImmediateWinningMove(
    boardMatrix: BoardMatrix,
    emptyCells: Coordinate[],
    playerSide: Player
  ): Coordinate | null {
    for (const move of emptyCells) {
      const candidate = boardMatrix.map(row => [...row]);
      candidate[move.r][move.c] = playerSide;
      if (this.hasConnection(candidate, playerSide)) {
        return move;
      }
    }
    return null;
  }

  private hasConnection(boardMatrix: BoardMatrix, playerSide: Player): boolean {
    const size = boardMatrix.length;
    const visited = Array.from({ length: size }, () => Array(size).fill(false));
    const stack: Coordinate[] = [];

    if (playerSide === Player.ONE) {
      for (let row = 0; row < size; row++) {
        if (boardMatrix[row][0] === playerSide) stack.push({ r: row, c: 0 });
      }
    } else {
      for (let column = 0; column < size; column++) {
        if (boardMatrix[0][column] === playerSide) stack.push({ r: 0, c: column });
      }
    }

    const directions = [
      [0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, -1],
    ] as const;
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited[current.r][current.c]) continue;
      visited[current.r][current.c] = true;
      if (playerSide === Player.ONE && current.c === size - 1) return true;
      if (playerSide === Player.TWO && current.r === size - 1) return true;

      for (const [rowDelta, columnDelta] of directions) {
        const row = current.r + rowDelta;
        const column = current.c + columnDelta;
        if (row >= 0 && row < size
          && column >= 0 && column < size
          && !visited[row][column]
          && boardMatrix[row][column] === playerSide) {
          stack.push({ r: row, c: column });
        }
      }
    }
    return false;
  }

  /**
   * Initializes the AI's internal board (`this.pieces`) based on the current game state.
   * Sets up player IDs, grid dimensions, and transforms the external `boardMatrix`
   * coordinates to the AI's internal padded representation.
   *
   * Coordinate System for `this.pieces` (internal, padded):
   * - `this.pieces[0][...]` and `this.pieces[this.gridSizePadded-1][...]` are PLAYER_TWO's border rows.
   * - `this.pieces[...][0]` and `this.pieces[...][this.gridSizePadded-1]` are PLAYER_ONE's border columns.
   * - Playable area: `this.pieces[1..this.gridSize][1..this.gridSize]`.
   *
   * Transformation from game coordinates `(game_r, game_c)` (0-indexed, top-left origin)
   * to internal array indices for `this.pieces`:
   *   `internal_array_row = (this.gridSize - 1 - game_r) + 1`
   *   `internal_array_col = game_c + 1`
   * The `(this.gridSize - 1 - game_r)` part flips the row index, so the game's top row
   * corresponds to a high internal row index (near Player One's "top" perspective if they connect bottom-to-top internally),
   * and game's bottom row to a low internal row index.
   *
   * @param boardMatrix The current state of the game board from the game engine.
   * @param playerSide The `Player` enum (Player.ONE or Player.TWO) indicating whose turn it is.
   */
  private initializeBoard(boardMatrix: BoardMatrix, playerSide: Player): void {
    this.gridSize = boardMatrix.length;
    this.gridSizePadded = this.gridSize + 2;

    // Determine internal IDs for the AI and its opponent.
    this.currentAiPlayerInternalId = playerSide === Player.ONE ? PLAYER_ONE_INTERNAL_ID : PLAYER_TWO_INTERNAL_ID;
    this.opponentPlayerInternalId = this.currentAiPlayerInternalId === PLAYER_ONE_INTERNAL_ID ? PLAYER_TWO_INTERNAL_ID : PLAYER_ONE_INTERNAL_ID;

    // Initialize the padded `pieces` array with EMPTY.
    this.pieces = Array(this.gridSizePadded)
      .fill(null)
      .map(() => Array(this.gridSizePadded).fill(EMPTY));

    // Set up border cells for Player One (horizontal) and Player Two (vertical).
    // These borders act as the target connection points for each player.
    for (let i = 1; i < this.gridSizePadded - 1; i++) { // Iterate along the actual game board span
      // Player One's borders (left and right columns of the padded grid)
      this.pieces[i][0] = PLAYER_ONE_INTERNAL_ID;                       // Left border
      this.pieces[i][this.gridSizePadded - 1] = PLAYER_ONE_INTERNAL_ID; // Right border
      // Player Two's borders (top and bottom rows of the padded grid)
      this.pieces[0][i] = PLAYER_TWO_INTERNAL_ID;                       // Top border
      this.pieces[this.gridSizePadded - 1][i] = PLAYER_TWO_INTERNAL_ID; // Bottom border
    }

    // Copy the game state from `boardMatrix` to `this.pieces`.
    for (let game_r = 0; game_r < this.gridSize; game_r++) { // game_r: 0 (top) to gridSize-1 (bottom)
      for (let game_c = 0; game_c < this.gridSize; game_c++) { // game_c: 0 (left) to gridSize-1 (right)
        const pieceEnum = boardMatrix[game_r][game_c];

        // Transform game coordinates to AI's internal *playable area* 0-indexed coordinates.
        // The AI's internal playable row 0 is the game's bottom row.
        const internal_playable_r_0idx = this.gridSize - 1 - game_r;
        const internal_playable_c_0idx = game_c;

        let pieceVal = EMPTY;
        if (pieceEnum === Player.ONE) pieceVal = PLAYER_ONE_INTERNAL_ID;
        else if (pieceEnum === Player.TWO) pieceVal = PLAYER_TWO_INTERNAL_ID;

        // Store in `this.pieces` using padded array indices (+1 offset).
        this.pieces[internal_playable_r_0idx + 1][internal_playable_c_0idx + 1] = pieceVal;
      }
    }
  }

  /**
   * Creates a string representation of the current board state (playable area only).
   * Used as a key for the transposition table to cache board evaluations.
   * The string includes the grid size to ensure uniqueness for different board sizes.
   * @returns A string uniquely identifying the current arrangement of pieces on the board.
   */
  private piecesToString(): string {
    let sb = this.gridSize.toString(); // Start with grid size for uniqueness
    // Iterate over the playable area of the internal padded board.
    for (let i = 1; i < this.gridSizePadded - 1; i++) { // Padded row index
      for (let j = 1; j < this.gridSizePadded - 1; j++) { // Padded col index
        sb += this.pieces[i][j].toString(); // Append piece value (0, 1, or 2)
      }
    }
    return sb;
  }

  /**
   * Calculates the "two-distance" arrays, a core component of the AI's board evaluation heuristic.
   * For each player, two distance arrays are computed:
   *  - `playerOneDistA` / `playerTwoDistA`: Distances from one side of their connecting axis.
   *  - `playerOneDistB` / `playerTwoDistB`: Distances from the other side of their connecting axis.
   *
   * Example: For Player One (horizontal connection):
   *   - `playerOneDistA`: Estimated path cost from an empty cell to Player One's LEFT border.
   *   - `playerOneDistB`: Estimated path cost from an empty cell to Player One's RIGHT border.
   * The sum `playerOneDistA[r][c] + playerOneDistB[r][c]` estimates the length of a path for Player One
   * through cell (r,c) to connect their sides.
   *
   * The calculation uses a Bellman-Ford-like iterative approach.
   * The distance to an empty cell is `1 + second_minimum_distance_of_its_effective_neighbors`.
   * Using the *second* minimum (instead of the first) is a common heuristic in Hex AI. It tends to
   * favor paths that are wider or have more alternative connections, making them more robust
   * against opponent blocks.
   *
   * @param currentEvalGraph A 2D array of `EvaluationNodeInternal` representing the board's
   *                         current effective neighborhood graph. This graph tells which empty
   *                         cells are "connected" through same-colored pieces.
   * @returns An object containing the four calculated two-distance arrays.
   */
  private calculateTwoDistanceArrays(currentEvalGraph: EvaluationNodeInternal[][]): {
    playerOneDistA: number[][]; playerOneDistB: number[][]; playerTwoDistA: number[][]; playerTwoDistB: number[][];
  } {
    const distArrayInitVal = 100000; // A large value representing "infinity" or unreachable.
    const createDistArray = () => Array(this.gridSizePadded).fill(0).map(() => Array(this.gridSizePadded).fill(distArrayInitVal));

    const playerOneDistA = createDistArray(); const playerOneDistB = createDistArray();
    const playerTwoDistA = createDistArray(); const playerTwoDistB = createDistArray();

    // Initialize source distances for Player One (Horizontal: Left/Right borders)
    // These are specific points on the padded border. The actual border pieces are already set to player IDs.
    // The distance calculation will propagate from these effectively zero-cost "virtual" source cells.
    // In the Java code, these are corners. This implies these points are the "start" of the virtual graph path.
    playerOneDistA[0][0] = 0; playerOneDistA[this.gridSizePadded - 1][0] = 0; // "Left" sources (top-left, bottom-left padded corners)
    playerOneDistB[0][this.gridSizePadded - 1] = 0; playerOneDistB[this.gridSizePadded - 1][this.gridSizePadded - 1] = 0; // "Right" sources

    // Initialize source distances for Player Two (Vertical: Top/Bottom borders)
    playerTwoDistA[0][0] = 0; playerTwoDistA[0][this.gridSizePadded - 1] = 0; // "Top" sources (top-left, top-right padded corners)
    playerTwoDistB[this.gridSizePadded - 1][0] = 0; playerTwoDistB[this.gridSizePadded - 1][this.gridSizePadded - 1] = 0; // "Bottom" sources

    let changed: boolean;

    // Calculate playerOneDistA (distances from Player One's "left" side)
    // Iterates columns left-to-right, allowing distances to propagate from the left.
    do {
        changed = false;
        for (let j = 1; j < this.gridSizePadded - 1; j++) { // Iterate columns (inner loop for some propagation orders)
            for (let i = 1; i < this.gridSizePadded - 1; i++) { // Iterate rows
                if (playerOneDistA[i][j] !== distArrayInitVal || this.pieces[i][j] !== EMPTY) continue; // Already set or not empty

                let min1 = distArrayInitVal, min2 = distArrayInitVal;
                // Consider all "effective neighbors" for Player One for this empty cell.
                currentEvalGraph[i][j].playerOneEffectiveNeighbours.forEach(n => {
                    const val = playerOneDistA[n.row][n.column];
                    if (val < min2) { min2 = val; if (val < min1) { min2 = min1; min1 = val; }}
                });
                // Update distance if a shorter path (cost = secondMin + 1) is found.
                if (min2 < 100 && playerOneDistA[i][j] > min2 + 1) { // min2 < 100 acts as a reachability check
                    playerOneDistA[i][j] = min2 + 1; changed = true;
                }
            }
        }
    } while (changed); // Repeat until no more distance updates occur.

    // Calculate playerOneDistB (distances from Player One's "right" side)
    // Iterates columns right-to-left.
    do {
        changed = false;
        for (let j = this.gridSizePadded - 2; j > 0; j--) { // Iterate columns right-to-left
            for (let i = 1; i < this.gridSizePadded - 1; i++) { // Iterate rows
                if (playerOneDistB[i][j] !== distArrayInitVal || this.pieces[i][j] !== EMPTY) continue;
                let min1 = distArrayInitVal, min2 = distArrayInitVal;
                currentEvalGraph[i][j].playerOneEffectiveNeighbours.forEach(n => {
                    const val = playerOneDistB[n.row][n.column];
                    if (val < min2) { min2 = val; if (val < min1) { min2 = min1; min1 = val; }}
                });
                if (min2 < 100 && playerOneDistB[i][j] > min2 + 1) {
                    playerOneDistB[i][j] = min2 + 1; changed = true;
                }
            }
        }
    } while (changed);

    // Calculate playerTwoDistA (distances from Player Two's "top" side)
    // Iterates rows top-to-bottom.
    do {
        changed = false;
        for (let i = 1; i < this.gridSizePadded - 1; i++) { // Iterate rows top-to-bottom
            for (let j = 1; j < this.gridSizePadded - 1; j++) { // Iterate columns
                 if (playerTwoDistA[i][j] !== distArrayInitVal || this.pieces[i][j] !== EMPTY) continue;
                let min1 = distArrayInitVal, min2 = distArrayInitVal;
                currentEvalGraph[i][j].playerTwoEffectiveNeighbours.forEach(n => {
                    const val = playerTwoDistA[n.row][n.column];
                     if (val < min2) { min2 = val; if (val < min1) { min2 = min1; min1 = val; }}
                });
                if (min2 < 100 && playerTwoDistA[i][j] > min2 + 1) {
                    playerTwoDistA[i][j] = min2 + 1; changed = true;
                }
            }
        }
    } while (changed);

    // Calculate playerTwoDistB (distances from Player Two's "bottom" side)
    // Iterates rows bottom-to-top.
    do {
        changed = false;
        for (let i = this.gridSizePadded - 2; i > 0; i--) { // Iterate rows bottom-to-top
            for (let j = 1; j < this.gridSizePadded - 1; j++) { // Iterate columns
                if (playerTwoDistB[i][j] !== distArrayInitVal || this.pieces[i][j] !== EMPTY) continue;
                let min1 = distArrayInitVal, min2 = distArrayInitVal;
                currentEvalGraph[i][j].playerTwoEffectiveNeighbours.forEach(n => {
                    const val = playerTwoDistB[n.row][n.column];
                    if (val < min2) { min2 = val; if (val < min1) { min2 = min1; min1 = val; }}
                });
                if (min2 < 100 && playerTwoDistB[i][j] > min2 + 1) {
                    playerTwoDistB[i][j] = min2 + 1; changed = true;
                }
            }
        }
    } while (changed);

    return { playerOneDistA, playerOneDistB, playerTwoDistA, playerTwoDistB };
  }

  /**
   * Evaluates the current board state from the perspective of Player One (who wants to maximize the score).
   * A positive score favors Player One, a negative score favors Player Two.
   *
   * The evaluation is based on:
   * 1. Potential Path Length: The shortest estimated path for each player to connect their sides.
   *    This is found by summing their two two-distance arrays (`DistA + DistB`) for each empty cell
   *    and finding the minimum sum.
   *    `playerOnePotentialPathLength` = min(playerOneDistA[r][c] + playerOneDistB[r][c]) over empty (r,c).
   *    `playerTwoPotentialPathLength` = min(playerTwoDistA[r][c] + playerTwoDistB[r][c]) over empty (r,c).
   *
   * 2. Mobility: The number of empty cells that achieve this minimum potential path length.
   *    Higher mobility suggests more options or a wider path.
   *
   * The formula: `100 * (P2_Potential - P1_Potential) - (P2_Mobility - P1_Mobility)`
   * - Player One (maximizer) benefits from smaller `P1_Potential` and larger `P2_Potential`.
   * - Player One benefits from larger `P1_Mobility` and smaller `P2_Mobility`.
   *
   * This method uses a transposition table (`this.transpositionTable`) to cache results
   * for previously evaluated board states.
   *
   * @returns A numerical score representing the board's value.
   */
  private evaluate(): number {
    const piecesStr = this.piecesToString(); // Get a unique string key for the current board state.
    const storedValue = this.transpositionTable.get(piecesStr);
    if (storedValue !== undefined) {
      return storedValue; // Return cached evaluation if available.
    }

    // Build the effective neighborhood graph for the current board state.
    // This graph is needed to calculate the two-distance arrays.
    const localEvalGraph: EvaluationNodeInternal[][] = Array(this.gridSizePadded)
        .fill(null)
        .map(() => Array(this.gridSizePadded).fill(null as any));
    EvaluationNodeInternal.buildEvaluationBoard(this.pieces, localEvalGraph, this.gridSizePadded);

    // Calculate the four two-distance arrays using the generated graph.
    const { playerOneDistA, playerOneDistB, playerTwoDistA, playerTwoDistB } = this.calculateTwoDistanceArrays(localEvalGraph);

    let playerOnePotentialPathLength = 100000; // Initialize with "infinity"
    let playerTwoPotentialPathLength = 100000; // Initialize with "infinity"
    let playerOneMobility = 0;
    let playerTwoMobility = 0;

    // Iterate over all empty cells in the playable area to find potential and mobility.
    for (let i = 1; i < this.gridSizePadded - 1; i++) { // Padded row index
      for (let j = 1; j < this.gridSizePadded - 1; j++) { // Padded col index
        if (this.pieces[i][j] === EMPTY) {
          // Calculate path sum for Player One through this cell.
          const currentP1PathSum = playerOneDistA[i][j] + playerOneDistB[i][j];
          if (currentP1PathSum < playerOnePotentialPathLength) {
            playerOnePotentialPathLength = currentP1PathSum;
            playerOneMobility = 1; // New shortest path found, reset mobility.
          } else if (currentP1PathSum === playerOnePotentialPathLength && playerOnePotentialPathLength !== 100000) {
            playerOneMobility++; // Another cell offers the same shortest path length.
          }

          // Calculate path sum for Player Two through this cell.
          const currentP2PathSum = playerTwoDistA[i][j] + playerTwoDistB[i][j];
          if (currentP2PathSum < playerTwoPotentialPathLength) {
            playerTwoPotentialPathLength = currentP2PathSum;
            playerTwoMobility = 1;
          } else if (currentP2PathSum === playerTwoPotentialPathLength && playerTwoPotentialPathLength !== 100000) {
            playerTwoMobility++;
          }
        }
      }
    }
    
    // If a player has no path (potential remains at initial large value), their mobility is effectively zero.
    if (playerOnePotentialPathLength === 100000) playerOneMobility = 0;
    if (playerTwoPotentialPathLength === 100000) playerTwoMobility = 0;

    // The evaluation formula:
    // Weighted difference in potential path lengths, adjusted by difference in mobilities.
    const evaluation = 100 * (playerTwoPotentialPathLength - playerOnePotentialPathLength) - (playerTwoMobility - playerOneMobility);

    this.transpositionTable.set(piecesStr, evaluation); // Cache the result.
    return evaluation;
  }

  /**
   * Generates a list of all possible moves for the current board state,
   * ordered by a preliminary heuristic value.
   * This ordering is crucial for the effectiveness of beam search.
   *
   * The heuristic value for a move at an empty cell (r_pad, c_pad) is the sum of all four
   * two-distance values for that cell:
   * `P1_DistA + P1_DistB + P2_DistA + P2_DistB`.
   * A lower sum suggests the cell is strategically important for both players' pathfinding,
   * making it a promising candidate move.
   *
   * @param playerOneDistA Pre-calculated two-distance array.
   * @param playerOneDistB Pre-calculated two-distance array.
   * @param playerTwoDistA Pre-calculated two-distance array.
   * @param playerTwoDistB Pre-calculated two-distance array.
   * @returns An array of `MoveInternalImpl` objects, sorted by their heuristic `value` (ascending).
   */
  private getMovesInternal(
    playerOneDistA: number[][], playerOneDistB: number[][],
    playerTwoDistA: number[][], playerTwoDistB: number[][]
  ): MoveInternalImpl[] {
    const moves: MoveInternalImpl[] = [];
    // Iterate over empty cells in the playable area of the padded board.
    for (let r_pad = 1; r_pad < this.gridSizePadded - 1; r_pad++) {
      for (let c_pad = 1; c_pad < this.gridSizePadded - 1; c_pad++) {
        if (this.pieces[r_pad][c_pad] === EMPTY) {
          // Calculate the sum of all four two-distance values for this empty cell.
          const moveValue = playerOneDistA[r_pad][c_pad] + playerOneDistB[r_pad][c_pad] +
                            playerTwoDistA[r_pad][c_pad] + playerTwoDistB[r_pad][c_pad];
          moves.push(new MoveInternalImpl(r_pad, c_pad, moveValue));
        }
      }
    }
    // Sort moves by their heuristic value (ascending, as per MoveInternalImpl.compareTo).
    moves.sort((a, b) => a.compareTo(b));
    return moves;
  }

  /**
   * The recursive core of the minimax algorithm with alpha-beta pruning and beam search.
   * It explores the game tree to a specified `depth`.
   *
   * @param depth Current depth in the search tree (0 at root, increases with recursion).
   * @param alpha The alpha value for alpha-beta pruning (best score found so far for the maximizing player).
   * @param beta The beta value for alpha-beta pruning (best score found so far for the minimizing player).
   * @param currentPlayerMoving The internal ID of the player whose turn it is at this node in the tree.
   * @returns The heuristic evaluation of the board state from this node, assuming optimal play.
   */
  private expand(depth: number, alpha: number, beta: number, currentPlayerMoving: number): number {
    // Transposition table lookup (current TT is basic, mostly for `evaluate()` caching)
    // A full TT for internal nodes would store/check depth and bounds.
    // const boardStateKey = this.piecesToString();
    // if (this.transpositionTable.has(boardStateKey) && depth > 0 { ... }

    // Base case: If maximum depth is reached, evaluate the board state.
    if (depth === this.maxDepth) {
      return this.evaluate();
    }

    // For the current board state at this node, build its evaluation graph and calculate distances.
    // This is computationally intensive but necessary as the graph changes with each hypothetical move.
    const currentBoardEvalGraph: EvaluationNodeInternal[][] = Array(this.gridSizePadded)
        .fill(null)
        .map(() => Array(this.gridSizePadded).fill(null as any));
    EvaluationNodeInternal.buildEvaluationBoard(this.pieces, currentBoardEvalGraph, this.gridSizePadded);
    
    const { playerOneDistA, playerOneDistB, playerTwoDistA, playerTwoDistB } = this.calculateTwoDistanceArrays(currentBoardEvalGraph);
    // Get candidate moves, sorted heuristically, for beam search.
    const availableMoves = this.getMovesInternal(playerOneDistA, playerOneDistB, playerTwoDistA, playerTwoDistB);

    // If no moves are available (e.g., board full), evaluate the current state.
    if (availableMoves.length === 0) {
        return this.evaluate();
    }

    let bestVal;
    // Determine if the currentPlayerMoving is the maximizing player (Player One) or minimizing player (Player Two).
    // The evaluation function is always from Player One's perspective (higher is better for P1).
    if (currentPlayerMoving === PLAYER_ONE_INTERNAL_ID) { // Player One (Maximizer)
      bestVal = -Infinity;
      // Beam Search: Consider only the top `beamSize` moves from the sorted list.
      for (let k = 0; k < this.beamSize && k < availableMoves.length; k++) {
        const nextMove = availableMoves[k];
        this.pieces[nextMove.row][nextMove.column] = currentPlayerMoving; // Make the move

        // Recursively call expand for the opponent.
        const val = this.expand(depth + 1, alpha, beta, this.opponentPlayerInternalId);
        bestVal = Math.max(bestVal, val);
        alpha = Math.max(alpha, bestVal); // Update alpha (best for maximizer)

        this.pieces[nextMove.row][nextMove.column] = EMPTY; // Undo the move
        if (beta <= alpha) {
          break; // Beta cut-off (minimizer has a better option elsewhere)
        }
      }
    } else { // Player Two (Minimizer)
      bestVal = Infinity;
      // Beam Search
      for (let k = 0; k < this.beamSize && k < availableMoves.length; k++) {
        const nextMove = availableMoves[k];
        this.pieces[nextMove.row][nextMove.column] = currentPlayerMoving; // Make the move

        // Recursively call expand for the opponent (which is currentAiPlayerInternalId if P2 is moving now)
        // No, opponent for P2 is P1.
        const val = this.expand(depth + 1, alpha, beta, PLAYER_ONE_INTERNAL_ID); // Next player is P1
        bestVal = Math.min(bestVal, val);
        beta = Math.min(beta, bestVal); // Update beta (best for minimizer)
        
        this.pieces[nextMove.row][nextMove.column] = EMPTY; // Undo the move
        if (beta <= alpha) {
          break; // Alpha cut-off (maximizer has a better option elsewhere)
        }
      }
    }
    return bestVal;
  }

  /**
   * Determines the best move for the AI from the current board state.
   * This is the top-level function for the AI's search logic.
   * It iterates through potential first moves (limited by beam search at root),
   * calls `expand()` for each, and chooses the one leading to the best evaluated outcome.
   *
   * @returns An object `{r, c}` with 0-indexed coordinates for the AI's internal *playable area*,
   *          or `null` if no valid move is found.
   */
  private getBestMoveInternal(): { r: number, c: number } | null {
    // Initialize bestValue depending on whether AI is maximizing (P1) or minimizing (P2).
    // The 'evaluate' and 'expand' functions return scores from P1's perspective.
    // So, if AI is P1, it maximizes this score. If AI is P2, it minimizes this score.
    let currentBestValue = (this.currentAiPlayerInternalId === PLAYER_ONE_INTERNAL_ID) ? -Infinity : Infinity;
    let bestInternalPlayableR_0idx = -1; // 0-indexed row in AI's *playable area*
    let bestInternalPlayableC_0idx = -1; // 0-indexed col in AI's *playable area*

    // Setup for root node: build graph, calculate distances, get sorted moves.
    const rootBoardEvalGraph: EvaluationNodeInternal[][] = Array(this.gridSizePadded)
        .fill(null)
        .map(() => Array(this.gridSizePadded).fill(null as any));
    EvaluationNodeInternal.buildEvaluationBoard(this.pieces, rootBoardEvalGraph, this.gridSizePadded);
    
    const { playerOneDistA, playerOneDistB, playerTwoDistA, playerTwoDistB } = this.calculateTwoDistanceArrays(rootBoardEvalGraph);
    const rootMoves = this.getMovesInternal(playerOneDistA, playerOneDistB, playerTwoDistA, playerTwoDistB);

    if (rootMoves.length === 0) return null; // No moves possible.

    let alpha = -Infinity;
    let beta = Infinity;

    // Iterate through the top `beamSize` candidate moves at the root.
    for (let k = 0; k < this.beamSize && k < rootMoves.length; k++) {
        const move = rootMoves[k]; // `move.row`, `move.column` are padded indices.
        const r_pad = move.row;
        const c_pad = move.column;

        // Should always be EMPTY, but double-check.
        if (this.pieces[r_pad][c_pad] !== EMPTY) continue;

        this.pieces[r_pad][c_pad] = this.currentAiPlayerInternalId; // Make the move
        // Call expand for the opponent. Depth is 1 because this is the first level of recursion.
        const valueFromExpand = this.expand(1, alpha, beta, this.opponentPlayerInternalId);
        this.pieces[r_pad][c_pad] = EMPTY; // Undo the move

        if (this.currentAiPlayerInternalId === PLAYER_ONE_INTERNAL_ID) { // AI is P1 (Maximizer)
            if (valueFromExpand > currentBestValue) {
                currentBestValue = valueFromExpand;
                bestInternalPlayableR_0idx = r_pad - 1; // Convert padded index to 0-idx playable area
                bestInternalPlayableC_0idx = c_pad - 1;
            }
            alpha = Math.max(alpha, currentBestValue);
        } else { // AI is P2 (Minimizer)
            if (valueFromExpand < currentBestValue) {
                currentBestValue = valueFromExpand;
                bestInternalPlayableR_0idx = r_pad - 1;
                bestInternalPlayableC_0idx = c_pad - 1;
            }
            beta = Math.min(beta, currentBestValue);
        }
        // Alpha-beta pruning at root (though less critical with beam search also active)
        // if (beta <= alpha) break; // Not strictly necessary if all beam moves are explored, but good practice.
    }
    
    // Fallback: If no move improved `currentBestValue` (e.g., all moves led to worse states
    // or beam was too narrow), or if `bestInternalPlayableR_0idx` remained -1.
    // Pick the top move from the initial heuristic sort if search didn't yield a clear best.
    if (bestInternalPlayableR_0idx === -1 && rootMoves.length > 0) {
        bestInternalPlayableR_0idx = rootMoves[0].row - 1; // Convert from padded coord to 0-idx playable
        bestInternalPlayableC_0idx = rootMoves[0].column - 1;
    }

    if (bestInternalPlayableR_0idx !== -1 && bestInternalPlayableC_0idx !== -1) {
      return { r: bestInternalPlayableR_0idx, c: bestInternalPlayableC_0idx };
    }
    return null; // Should ideally not happen if rootMoves is not empty.
  }

  /**
   * Public method called by the game engine to get the AI's next move.
   *
   * @param boardMatrix The current game board state (external representation).
   * @param playerSide The `Player` (Player.ONE or Player.TWO) for whom to make a move.
   * @param emptyCells A list of `Coordinate` objects for all empty cells on the board.
   * @returns A `Coordinate` object for the chosen move (external game coordinates), or `null` if no move can be made.
   */
  public getMove(
    boardMatrix: BoardMatrix,
    playerSide: Player,
    emptyCells: Coordinate[] // Game coordinates {r, c} for empty cells
  ): Coordinate | null {
    if (emptyCells.length === 0) {
      return null; // No empty cells, no move possible.
    }

    this.transpositionTable.clear(); // Clear TT for a fresh calculation.
    this.initializeBoard(boardMatrix, playerSide); // Setup AI's internal state.

    // Handle first move of the game: typically play in the center.
    if (emptyCells.length === this.gridSize * this.gridSize) {
        const game_r_center = Math.floor((this.gridSize - 1) / 2);
        const game_c_center = Math.floor((this.gridSize - 1) / 2);
        
        // Check if center is actually empty (it should be for the very first move).
        if (boardMatrix[game_r_center][game_c_center] === null) {
            return { r: game_r_center, c: game_c_center };
        }
        // If center is somehow taken (e.g., unusual board setup or non-standard first move), fall through to search.
    }

    const winningMove = this.findImmediateWinningMove(boardMatrix, emptyCells, playerSide);
    if (winningMove) return winningMove;

    const opponent = playerSide === Player.ONE ? Player.TWO : Player.ONE;
    const blockingMove = this.findImmediateWinningMove(boardMatrix, emptyCells, opponent);
    if (blockingMove) return blockingMove;

    // Perform the search to find the best internal move.
    const bestMoveInternal_0idx = this.getBestMoveInternal(); // Returns {r, c} in AI's 0-idx playable area.

    if (bestMoveInternal_0idx) {
      // Transform AI's internal 0-indexed playable area move to game's 0-indexed coordinates.
      // AI internal playable row 0 = game's bottom row (gridSize - 1)
      // AI internal playable row (gridSize - 1) = game's top row (0)
      // So, game_r_out = (gridSize - 1) - internal_playable_r
      const game_r_out = this.gridSize - 1 - bestMoveInternal_0idx.r;
      const game_c_out = bestMoveInternal_0idx.c; // Column index is direct

      // Sanity check: ensure the chosen cell is valid and empty on the external game board.
      if (game_r_out >= 0 && game_r_out < this.gridSize && 
          game_c_out >=0 && game_c_out < this.gridSize &&
          boardMatrix[game_r_out][game_c_out] === null) {
          return { r: game_r_out, c: game_c_out };
      } else {
          // This case indicates an issue in the AI logic or coordinate transformation if it occurs.
          console.warn("AIPlayerHard chose an invalid or occupied cell. Falling back.", 
                       { game_r_out, game_c_out }, 
                       "Internal chosen (0-idx playable):", bestMoveInternal_0idx,
                       "Board value at target:", boardMatrix[game_r_out]?.[game_c_out]);
      }
    }

    // Fallback: If search fails or returns an invalid move, pick a random valid move.
    // This ensures the AI always makes a move if one is available.
    if (emptyCells.length > 0) {
        console.warn("AIPlayerHard falling back to a random move from available empty cells.");
        return emptyCells[Math.floor(Math.random() * emptyCells.length)];
    }
    return null; // Should not be reached if emptyCells was initially > 0.
  }
}
