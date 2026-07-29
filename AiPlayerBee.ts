import { BoardMatrix, Coordinate, Player } from './types';

const EMPTY = 0;
const RED = Player.ONE;
const BLUE = Player.TWO;
const UNREACHABLE = 100_000;

type InternalBoard = number[][];

interface EvaluationNode {
  row: number;
  column: number;
  redNeighbours: Set<EvaluationNode>;
  blueNeighbours: Set<EvaluationNode>;
}

interface Move {
  row: number;
  column: number;
  value: number;
}

interface DistanceArrays {
  redA: number[][];
  redB: number[][];
  blueA: number[][];
  blueB: number[][];
}

/**
 * A behavior-preserving TypeScript port of Android's production BeeGameAI.
 *
 * The unusual two-distance calculation, move ordering, pruning rules, coordinate
 * rotation, and 32-bit board hash are intentional. They are part of the legacy
 * bot contract and are covered by cross-platform reference-line tests.
 */
export class AiPlayerBee {
  private pieces: InternalBoard = [];
  private gridSize = 0;
  private team: Player = Player.ONE;
  private readonly lookUpTable = new Map<number, number>();

  public constructor(
    private readonly maxDepth: number,
    private readonly beamSize: number,
  ) {}

  public getMove(
    boardMatrix: BoardMatrix,
    playerSide: Player,
    emptyCells: Coordinate[],
  ): Coordinate | null {
    if (emptyCells.length === 0) {
      return null;
    }

    this.initializeBoard(boardMatrix);
    this.team = playerSide;

    if (emptyCells.length === this.gridSize * this.gridSize) {
      const center = Math.floor(this.gridSize / 2);
      return { r: center, c: center };
    }

    const bestMove = this.getBestMove();
    if (bestMove === null) {
      return null;
    }

    // BeeGameAI rotates Android's Point(x, y) representation relative to its
    // padded search board. Web coordinates are expressed as { row, column }.
    return {
      r: this.gridSize - bestMove.row,
      c: bestMove.column - 1,
    };
  }

  private initializeBoard(boardMatrix: BoardMatrix): void {
    const nextGridSize = boardMatrix.length;
    if (nextGridSize !== this.gridSize) {
      this.lookUpTable.clear();
    }
    this.gridSize = nextGridSize;

    const paddedSize = this.gridSize + 2;
    this.pieces = this.createMatrix(paddedSize, EMPTY);

    for (let i = 1; i < paddedSize - 1; i++) {
      this.pieces[i][0] = RED;
      this.pieces[0][i] = BLUE;
      this.pieces[i][paddedSize - 1] = RED;
      this.pieces[paddedSize - 1][i] = BLUE;
    }

    for (let row = 0; row < this.gridSize; row++) {
      for (let column = 0; column < this.gridSize; column++) {
        const piece = boardMatrix[row][column];
        if (piece !== null) {
          this.pieces[this.gridSize - row][column + 1] = piece;
        }
      }
    }
  }

  private getBestMove(): Move | null {
    let bestValue =
      this.team === RED ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    let bestMove: Move | null = null;
    const opponent = this.team === RED ? BLUE : RED;

    // Android evaluates every root move in padded-board row-major order. Beam
    // limiting begins below the root.
    for (let row = 1; row < this.pieces.length - 1; row++) {
      for (let column = 1; column < this.pieces.length - 1; column++) {
        if (this.pieces[row][column] !== EMPTY) {
          continue;
        }

        this.pieces[row][column] = this.team;
        const value = this.expand(1, bestValue, opponent);
        this.pieces[row][column] = EMPTY;

        if (
          (this.team === RED && value > bestValue) ||
          (this.team === BLUE && value < bestValue)
        ) {
          bestValue = value;
          bestMove = { row, column, value };
        }
      }
    }

    return bestMove;
  }

  private expand(
    depth: number,
    previousBest: number,
    currentColour: Player,
  ): number {
    if (depth === this.maxDepth) {
      return this.evaluate();
    }

    let bestValue =
      currentColour === RED
        ? Number.NEGATIVE_INFINITY
        : Number.POSITIVE_INFINITY;
    const moves = this.getMoves();

    for (let index = 0; index < this.beamSize && index < moves.length; index++) {
      const move = moves[index];
      this.pieces[move.row][move.column] = currentColour;
      const value = this.expand(
        depth + 1,
        bestValue,
        currentColour === RED ? BLUE : RED,
      );
      this.pieces[move.row][move.column] = EMPTY;

      if (
        (currentColour === RED && value > bestValue) ||
        (currentColour === BLUE && value < bestValue)
      ) {
        bestValue = value;
      }

      if (
        (currentColour === RED && bestValue > previousBest) ||
        (currentColour === BLUE && bestValue < previousBest)
      ) {
        return bestValue;
      }
    }

    if (!Number.isFinite(bestValue)) {
      return this.evaluate();
    }
    return bestValue;
  }

  private getMoves(): Move[] {
    const nodes = this.buildEvaluationBoard();
    const distances = this.calculateDistances(nodes);
    const moves: Move[] = [];

    for (let row = 1; row < this.pieces.length - 1; row++) {
      for (let column = 1; column < this.pieces.length - 1; column++) {
        if (this.pieces[row][column] === EMPTY) {
          moves.push({
            row,
            column,
            value:
              distances.redA[row][column] +
              distances.redB[row][column] +
              distances.blueA[row][column] +
              distances.blueB[row][column],
          });
        }
      }
    }

    // Modern JavaScript and Android's Collections.sort are both stable, so
    // equal scores retain the legacy row-major insertion order.
    moves.sort((left, right) => left.value - right.value);
    return moves;
  }

  private evaluate(): number {
    const boardHash = this.piecesHash();
    const cachedValue = this.lookUpTable.get(boardHash);
    if (cachedValue !== undefined) {
      return cachedValue;
    }

    const nodes = this.buildEvaluationBoard();
    const { redA, redB, blueA, blueB } = this.calculateDistances(nodes);
    let redPotential = UNREACHABLE;
    let bluePotential = UNREACHABLE;
    let redMobility = 0;
    let blueMobility = 0;

    for (let row = 1; row < this.pieces.length - 1; row++) {
      for (let column = 1; column < this.pieces.length - 1; column++) {
        if (this.pieces[row][column] !== EMPTY) {
          continue;
        }

        const redDistance = redA[row][column] + redB[row][column];
        if (redDistance < redPotential) {
          redPotential = redDistance;
          redMobility = 1;
        } else if (redDistance === redPotential) {
          redMobility++;
        }

        const blueDistance = blueA[row][column] + blueB[row][column];
        if (blueDistance < bluePotential) {
          bluePotential = blueDistance;
          blueMobility = 1;
        } else if (blueDistance === bluePotential) {
          blueMobility++;
        }
      }
    }

    const value =
      100 * (bluePotential - redPotential) -
      (blueMobility - redMobility);
    this.lookUpTable.set(boardHash, value);
    return value;
  }

  private buildEvaluationBoard(): EvaluationNode[][] {
    const size = this.pieces.length;
    const nodes: EvaluationNode[][] = Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, column) => ({
        row,
        column,
        redNeighbours: new Set<EvaluationNode>(),
        blueNeighbours: new Set<EvaluationNode>(),
      })),
    );

    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        if (this.pieces[row][column] !== EMPTY) {
          continue;
        }

        const node = nodes[row][column];
        node.redNeighbours = this.getNeighbours(
          node,
          RED,
          new Set<EvaluationNode>(),
          nodes,
        );
        node.redNeighbours.delete(node);
        node.blueNeighbours = this.getNeighbours(
          node,
          BLUE,
          new Set<EvaluationNode>(),
          nodes,
        );
        node.blueNeighbours.delete(node);
      }
    }

    return nodes;
  }

  private getNeighbours(
    node: EvaluationNode,
    colour: Player,
    piecesVisited: Set<EvaluationNode>,
    nodes: EvaluationNode[][],
  ): Set<EvaluationNode> {
    if (piecesVisited.has(node)) {
      return new Set<EvaluationNode>();
    }

    const neighbours = new Set<EvaluationNode>();
    if (this.pieces[node.row][node.column] === colour) {
      piecesVisited.add(node);
    }

    for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
      for (let columnOffset = -1; columnOffset <= 1; columnOffset++) {
        if (rowOffset + columnOffset === 0) {
          continue;
        }

        const row = node.row + rowOffset;
        const column = node.column + columnOffset;
        if (
          row < 0 ||
          row === nodes.length ||
          column < 0 ||
          column === nodes.length
        ) {
          continue;
        }

        if (this.pieces[row][column] === EMPTY) {
          neighbours.add(nodes[row][column]);
        } else if (this.pieces[row][column] === colour) {
          for (const reachable of this.getNeighbours(
            nodes[row][column],
            colour,
            piecesVisited,
            nodes,
          )) {
            neighbours.add(reachable);
          }
        }
      }
    }

    return neighbours;
  }

  private calculateDistances(nodes: EvaluationNode[][]): DistanceArrays {
    const size = this.pieces.length;
    const redA = this.createMatrix(size, UNREACHABLE);
    const redB = this.createMatrix(size, UNREACHABLE);
    const blueA = this.createMatrix(size, UNREACHABLE);
    const blueB = this.createMatrix(size, UNREACHABLE);

    redA[0][0] = 0;
    redA[size - 1][0] = 0;
    redB[0][size - 1] = 0;
    redB[size - 1][size - 1] = 0;
    blueA[0][0] = 0;
    blueA[0][size - 1] = 0;
    blueB[size - 1][0] = 0;
    blueB[size - 1][size - 1] = 0;

    this.relaxDistances(redA, nodes, RED, false, false, false);
    this.relaxDistances(redB, nodes, RED, false, true, false);
    this.relaxDistances(blueA, nodes, BLUE, true, false, false);
    this.relaxDistances(blueB, nodes, BLUE, true, false, true);

    return { redA, redB, blueA, blueB };
  }

  private relaxDistances(
    distances: number[][],
    nodes: EvaluationNode[][],
    colour: Player,
    rowMajor: boolean,
    reverseOuter: boolean,
    reverseInner: boolean,
  ): void {
    const size = distances.length;
    let found = true;

    while (found) {
      found = false;
      const outerValues = this.indices(size, reverseOuter);
      const innerValues = this.indices(size, reverseInner);

      for (const outer of outerValues) {
        for (const inner of innerValues) {
          const row = rowMajor ? outer : inner;
          const column = rowMajor ? inner : outer;
          if (
            distances[row][column] !== UNREACHABLE ||
            this.pieces[row][column] !== EMPTY
          ) {
            continue;
          }

          let minimum = UNREACHABLE;
          let secondMinimum = UNREACHABLE;
          const neighbours =
            colour === RED
              ? nodes[row][column].redNeighbours
              : nodes[row][column].blueNeighbours;

          for (const neighbour of neighbours) {
            const value = distances[neighbour.row][neighbour.column];
            if (value < secondMinimum) {
              secondMinimum = value;
              if (value < minimum) {
                secondMinimum = minimum;
                minimum = value;
              }
            }
          }

          if (secondMinimum < 100) {
            distances[row][column] = secondMinimum + 1;
            found = true;
          }
        }
      }
    }
  }

  private indices(size: number, reverse: boolean): number[] {
    return Array.from(
      { length: size - 2 },
      (_, index) => (reverse ? size - 2 - index : index + 1),
    );
  }

  private piecesHash(): number {
    let value = this.pieces.length - 2;
    for (let row = 1; row < this.pieces.length - 1; row++) {
      for (let column = 1; column < this.pieces.length - 1; column++) {
        // Java's Integer arithmetic wraps at 32 bits.
        value = (Math.imul(value, 3) + this.pieces[row][column]) | 0;
      }
    }
    return value;
  }

  private createMatrix(size: number, value: number): number[][] {
    return Array.from({ length: size }, () => Array<number>(size).fill(value));
  }
}
