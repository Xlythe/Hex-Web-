import { BoardMatrix, Coordinate, Player } from './types';

type LegacyCoordinate = [number, number];
type LegacyPair = [LegacyCoordinate, LegacyCoordinate];

/**
 * Behavior-preserving port of Android's original stateful GameAI ("Will").
 *
 * Android stores its board as [x][y], while the web game uses [row][column].
 * Keeping the legacy coordinate model internally avoids silently changing the
 * many orientation-dependent bridge rules.
 */
export class AiPlayerEasy {
  private board: BoardMatrix = [];
  private team: Player = Player.ONE;
  private n: LegacyCoordinate = [0, 0];
  private m: LegacyCoordinate = [0, 0];
  private pairs: LegacyPair[] = [];
  private randA = 0;
  private randB = 0;

  public constructor() {
    do {
      this.randA = Math.floor(Math.random() * 3) - 1;
      this.randB = Math.floor(Math.random() * 3) - 1;
    } while (this.randA === 0 && this.randB === 0);
  }

  public getMove(
    boardMatrix: BoardMatrix,
    playerSide: Player,
    emptyCells: Coordinate[],
  ): Coordinate | null {
    if (emptyCells.length === 0) {
      return null;
    }

    this.board = boardMatrix;
    this.team = playerSide;
    return this.makeMove(emptyCells);
  }

  private makeMove(emptyCells: Coordinate[]): Coordinate {
    const x = this.team === Player.TWO ? 1 : 0;
    const y = this.team === Player.ONE ? 1 : 0;
    const mid = Math.floor((this.board.length - 1) / 2);

    if (this.cell(mid, mid) === null) {
      this.n = [mid, mid];
      this.m = [mid, mid];
      return this.move(mid, mid);
    }

    if (
      this.cell(mid, mid) !== this.team &&
      this.cell(mid + this.randA, mid + this.randB) === null
    ) {
      this.n[x] = mid + this.randA;
      this.n[y] = mid + this.randB;
      this.m = [...this.n];
      return this.move(mid + this.randA, mid + this.randB);
    }

    if (this.n[0] - 1 === 0) {
      this.pairs.push([
        [this.n[0] - 1, this.n[1]],
        [this.n[0] - 1, this.n[1] + 1],
      ]);
      this.n[0]--;
    }

    if (this.m[0] + 1 === this.board.length - 1) {
      this.pairs.push([
        [this.m[0] + 1, this.m[1]],
        [this.m[0] + 1, this.m[1] - 1],
      ]);
      this.m[0]++;
    }

    for (let index = 0; index < this.pairs.length; index++) {
      const [first, second] = this.pairs[index];
      const firstCell = this.cell(first[x], first[y]);
      const secondCell = this.cell(second[x], second[y]);
      if (firstCell !== null && secondCell !== null) {
        this.pairs.splice(index, 1);
        index--;
      } else if (firstCell !== null) {
        this.pairs.splice(index, 1);
        return this.move(second[x], second[y]);
      } else if (secondCell !== null) {
        this.pairs.splice(index, 1);
        return this.move(first[x], first[y]);
      }
    }

    if (
      this.right() &&
      this.cell(
        this.m[x] + y,
        this.m[y] + x,
      ) !== null
    ) {
      if (this.cell(this.m[x] - x + y, this.m[y] - y + x) === null) {
        this.m[0]++;
        this.m[1]--;
        return this.move(this.m[x], this.m[y]);
      }
      if (this.cell(this.m[x] + x, this.m[y] + y) === null) {
        this.m[1]++;
        return this.move(this.m[x], this.m[y]);
      }
    }

    if (
      this.right() &&
      (this.cell(this.m[x] - x + y, this.m[y] - y + x) !== null ||
        this.cell(this.m[x] + x, this.m[y] + y) !== null) &&
      this.cell(this.m[x] + y, this.m[y] + x) === null
    ) {
      this.m[0]++;
      return this.move(this.m[x], this.m[y]);
    }

    if (
      this.left() &&
      this.cell(this.n[x] - y, this.n[y] - x) !== null
    ) {
      if (this.cell(this.n[x] + x - y, this.n[y] + y - x) === null) {
        this.n[0]--;
        this.n[1]++;
        return this.move(this.n[x], this.n[y]);
      }
      if (this.cell(this.n[x] - x, this.n[y] - y) === null) {
        this.n[1]--;
        return this.move(this.n[x], this.n[y]);
      }
    }

    if (
      this.left() &&
      (this.cell(this.n[x] + x - y, this.n[y] + y - x) !== null ||
        this.cell(this.n[x] - x, this.n[y] - y) !== null) &&
      this.cell(this.n[x] - y, this.n[y] - x) === null
    ) {
      this.n[0]--;
      return this.move(this.n[x], this.n[y]);
    }

    if (this.left()) {
      if (
        this.cell(this.n[x] - x - y, this.n[y] - y - x) !== null &&
        this.cell(this.n[x] + x - 2 * y, this.n[y] + y - 2 * x) === null
      ) {
        this.pairs.push([
          [this.n[0] - 1, this.n[1]],
          [this.n[0] - 1, this.n[1] + 1],
        ]);
        this.n[0] -= 2;
        this.n[1]++;
        return this.move(this.n[x], this.n[y]);
      }
      if (
        this.cell(this.n[x] + x - 2 * y, this.n[y] + y - 2 * x) !== null &&
        this.cell(this.n[x] - x - y, this.n[y] - y - x) === null
      ) {
        this.pairs.push([
          [this.n[0], this.n[1] - 1],
          [this.n[0] - 1, this.n[1]],
        ]);
        this.n[0]--;
        this.n[1]--;
        return this.move(this.n[x], this.n[y]);
      }
    }

    if (this.right()) {
      if (
        this.cell(this.m[x] - x + 2 * y, this.m[y] - y + 2 * x) !== null &&
        this.cell(this.m[x] + x + y, this.m[y] + y + x) === null
      ) {
        this.pairs.push([
          [this.m[0] + 1, this.m[1]],
          [this.m[0], this.m[1] + 1],
        ]);
        this.m[0]++;
        this.m[1]++;
        return this.move(this.m[x], this.m[y]);
      }
      if (
        this.cell(this.m[x] + x + y, this.m[y] + y + x) !== null &&
        this.cell(this.m[x] - x + 2 * y, this.m[y] - y + 2 * x) === null
      ) {
        this.pairs.push([
          [this.m[0] + 1, this.m[1]],
          [this.m[0] + 1, this.m[1] - 1],
        ]);
        this.m[0] += 2;
        this.m[1]--;
        return this.move(this.m[x], this.m[y]);
      }
    }

    const randomDirection = Math.floor(2 * Math.random());
    if (
      this.left() &&
      randomDirection === 0 &&
      this.cell(this.n[x] + x - 2 * y, this.n[y] + y - 2 * x) === null
    ) {
      this.pairs.push([
        [this.n[0] - 1, this.n[1]],
        [this.n[0] - 1, this.n[1] + 1],
      ]);
      this.n[0] -= 2;
      this.n[1]++;
      return this.move(this.n[x], this.n[y]);
    }

    if (
      this.left() &&
      randomDirection === 1 &&
      this.cell(this.n[x] - x - y, this.n[y] - y - x) === null
    ) {
      this.pairs.push([
        [this.n[0], this.n[1] - 1],
        [this.n[0] - 1, this.n[1]],
      ]);
      this.n[0]--;
      this.n[1]--;
      return this.move(this.n[x], this.n[y]);
    }

    if (
      this.right() &&
      randomDirection === 0 &&
      this.cell(this.m[x] - x + 2 * y, this.m[y] - y + 2 * x) === null
    ) {
      this.pairs.push([
        [this.m[0] + 1, this.m[1]],
        [this.m[0] + 1, this.m[1] - 1],
      ]);
      this.m[0] += 2;
      this.m[1]--;
      return this.move(this.m[x], this.m[y]);
    }

    if (
      this.right() &&
      randomDirection === 1 &&
      this.cell(this.m[x] + x + y, this.m[y] + y + x) === null
    ) {
      this.pairs.push([
        [this.m[0] + 1, this.m[1]],
        [this.m[0], this.m[1] + 1],
      ]);
      this.m[0]++;
      this.m[1]++;
      return this.move(this.m[x], this.m[y]);
    }

    if (!this.left() && !this.right() && this.pairs.length > 0) {
      const coordinate = this.pairs.shift()![1];
      return this.move(coordinate[x], coordinate[y]);
    }

    return emptyCells[Math.floor(emptyCells.length * Math.random())];
  }

  private right(): boolean {
    return (
      this.m[0] + 2 <= this.board.length - 1 &&
      this.m[1] + 1 <= this.board.length - 1 &&
      this.m[1] - 1 >= 0
    );
  }

  private left(): boolean {
    return (
      this.n[0] - 2 >= 0 &&
      this.n[1] - 1 >= 0 &&
      this.n[1] + 1 <= this.board.length - 1
    );
  }

  private cell(x: number, y: number): Player | null | undefined {
    return this.board[y]?.[x];
  }

  private move(x: number, y: number): Coordinate {
    return { r: y, c: x };
  }
}
