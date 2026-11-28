import { describe, expect, it } from 'vitest';
import { Player, type BoardMatrix, type Coordinate } from './types';
import { winningPath } from './winningPath';

function adjacent(a: Coordinate, b: Coordinate) {
  const dx = b.c - a.c, dy = b.r - a.r;
  return Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dx + dy)) === 1;
}

const cells = Array.from({ length: 9 }, (_, i) => ({ r: Math.floor(i / 3), c: i % 3 }));

// The reference enumerates every simple chain. It shares no traversal or neighbor table with the game.
function minimum(mask: number, side: Player) {
  const axis = (i: number) => side === Player.ONE ? cells[i].c : cells[i].r;
  function visit(i: number, available: number): number {
    if (axis(i) === 2) return 1;
    let best = Infinity;
    for (let j = 0; j < 9; j++) {
      const bit = 1 << j;
      if ((available & bit) && adjacent(cells[i], cells[j])) best = Math.min(best, 1 + visit(j, available ^ bit));
    }
    return best;
  }
  let best = Infinity;
  for (let i = 0; i < 9; i++) {
    if (axis(i) === 0 && (mask & (1 << i))) best = Math.min(best, visit(i, mask ^ (1 << i)));
  }
  return best;
}

describe('Hex connections', () => {
  it('finds and traces a minimum chain for either side on all 3×3 positions', () => {
    const lengths = [Player.ONE, Player.TWO].map(side =>
      Array.from({ length: 512 }, (_, mask) => minimum(mask, side)));
    for (let state = 0; state < 3 ** 9; state++) {
      const masks = [0, 0, 0];
      let code = state;
      const board: BoardMatrix = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => {
        const side = code % 3;
        code = Math.floor(code / 3);
        return side === 0 ? null : side as Player;
      }));
      cells.forEach(({r, c}, i) => { masks[board[r][c] ?? 0] |= 1 << i; });
      let winners = 0;
      for (const side of [Player.ONE, Player.TWO]) {
        const path = winningPath(board, side);
        const length = lengths[side - 1][masks[side]];
        if ((path?.length ?? Infinity) !== length) throw new Error('Wrong length on board ' + state);
        if (!path) continue;
        winners++;
        const axis = side === Player.ONE ? 'c' : 'r';
        if (path[0][axis] !== 0 || path[path.length - 1][axis] !== 2 ||
            path.some((p, i) => board[p.r][p.c] !== side || (i > 0 && !adjacent(p, path[i - 1])))) {
          throw new Error('Invalid chain on board ' + state);
        }
      }
      if (winners > 1 || (!masks[0] && winners !== 1)) throw new Error('Invalid winner count on board ' + state);
    }
  });

  it('selects the shorter finishing edge when the last move completes two routes', () => {
    const board: BoardMatrix = [[2,2,1],[2,null,1],[1,1,null]];
    expect(winningPath(board, Player.ONE)).toEqual([{r:2,c:0},{r:2,c:1},{r:1,c:2}]);
  });
});
