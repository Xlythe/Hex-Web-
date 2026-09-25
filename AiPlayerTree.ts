import { BoardMatrix, Coordinate, Player } from './types';

const DX = [-1, 1, 0, 0, -1, 1];
const DY = [0, 0, -1, 1, 1, -1];
const INF = 100_000;

interface Node {
  parent: Node | null;
  move: number;
  justMoved: number;
  moves: number[];
  nextMove: number;
  children: Node[];
  visits: number;
  wins: number;
}

/** A separate Monte Carlo tree search bot. Cell indexes are column*size+row. */
export class AiPlayerTree {
  constructor(private readonly simulations = 3500, private readonly seed?: number) {}

  public getMove(boardMatrix: BoardMatrix, player: Player, emptyCells: Coordinate[], allowSwap = false): Coordinate | null {
    if (emptyCells.length === 0) return null;
    const size = boardMatrix.length;
    const board = new Int8Array(size * size);
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) board[col * size + row] = boardMatrix[row][col] ?? 0;
    }
    const move = this.choose(board, size, player, allowSwap);
    if (move < 0) return null;
    if (move === board.length) {
      const opening = board.indexOf(Player.ONE);
      return { r: opening % size, c: Math.floor(opening / size) };
    }
    return { r: move % size, c: Math.floor(move / size) };
  }

  private choose(position: Int8Array, size: number, player: number, allowSwap: boolean): number {
    if (position.every(value => value === 0)) {
      const center = Math.floor(size / 2);
      return center * size + center;
    }
    const ownWin = immediateWin(position, size, player);
    if (ownWin >= 0) return ownWin;
    const block = immediateWin(position, size, 3 - player);
    if (block >= 0) return block;

    const priority = priorities(position, size, player);
    const order = orderedMoves(position, priority, allowSwap);
    const root = makeNode(null, -1, 3 - player, order);
    const random = seededRandom(this.seed ?? Math.floor(Math.random() * 0xffffffff));
    for (let sample = 0; sample < this.simulations; sample++) {
      const state = position.slice();
      let node = root;
      let turn = player;
      while (true) {
        const capacity = Math.min(node.moves.length, 2 + Math.floor(Math.sqrt(node.visits)));
        if (node.nextMove < node.moves.length && node.children.length < capacity) {
          const move = node.moves[node.nextMove++];
          apply(state, size, move, turn);
          const child = makeNode(node, move, turn, orderedMoves(state, priority, false));
          node.children.push(child);
          node = child;
          turn = 3 - turn;
          break;
        }
        if (node.children.length === 0) break;
        node = select(node, random);
        apply(state, size, node.move, turn);
        turn = 3 - turn;
      }
      const winner = rollout(state, size, turn, priority, random);
      for (let path: Node | null = node; path; path = path.parent) {
        path.visits++;
        if (path.justMoved === winner) path.wins++;
      }
    }
    let best: Node | null = null;
    for (const child of root.children) {
      if (!best || child.visits > best.visits || child.visits === best.visits && child.wins > best.wins) best = child;
    }
    return best?.move ?? order[0] ?? -1;
  }
}

function makeNode(parent: Node | null, move: number, justMoved: number, moves: number[]): Node {
  return { parent, move, justMoved, moves, nextMove: 0, children: [], visits: 0, wins: 0 };
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = (value + Math.imul(value ^ value >>> 7, 61 | value)) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 0x100000000;
  };
}

function select(node: Node, random: () => number): Node {
  let best = node.children[0];
  let bestScore = -Infinity;
  for (const child of node.children) {
    const score = child.wins / child.visits
      + 1.35 * Math.sqrt(Math.log(node.visits + 1) / child.visits)
      + random() * 1e-9;
    if (score > bestScore) { best = child; bestScore = score; }
  }
  return best;
}

function rollout(board: Int8Array, size: number, turn: number, priority: Float64Array, random: () => number): number {
  const remaining: number[] = [];
  for (let i = 0; i < board.length; i++) if (board[i] === 0) remaining.push(i);
  while (remaining.length > 0) {
    let total = 0;
    for (const move of remaining) total += priority[move];
    let ticket = random() * total;
    let selected = remaining.length - 1;
    for (let i = 0; i < remaining.length; i++) {
      ticket -= priority[remaining[i]];
      if (ticket < 0) { selected = i; break; }
    }
    const move = remaining[selected];
    remaining[selected] = remaining[remaining.length - 1];
    remaining.pop();
    board[move] = turn;
    turn = 3 - turn;
  }
  return connected(board, size, Player.ONE) ? Player.ONE : Player.TWO;
}

function immediateWin(board: Int8Array, size: number, player: number): number {
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== 0) continue;
    board[i] = player;
    const won = connected(board, size, player);
    board[i] = 0;
    if (won) return i;
  }
  return -1;
}

function connected(board: Int8Array, size: number, player: number): boolean {
  const seen = new Uint8Array(board.length);
  const queue = new Int16Array(board.length);
  let head = 0, tail = 0;
  for (let i = 0; i < size; i++) {
    const cell = player === 1 ? i : i * size;
    if (board[cell] === player) { queue[tail++] = cell; seen[cell] = 1; }
  }
  while (head < tail) {
    const cell = queue[head++], x = Math.floor(cell / size), y = cell % size;
    if (player === 1 ? x === size - 1 : y === size - 1) return true;
    for (let direction = 0; direction < 6; direction++) {
      const nx = x + DX[direction], ny = y + DY[direction];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const next = nx * size + ny;
      if (!seen[next] && board[next] === player) { seen[next] = 1; queue[tail++] = next; }
    }
  }
  return false;
}

function apply(board: Int8Array, size: number, move: number, player: number): void {
  if (move === board.length) {
    const opening = board.indexOf(Player.ONE);
    board[opening] = 0;
    board[(opening % size) * size + Math.floor(opening / size)] = Player.TWO;
  } else board[move] = player;
}

function orderedMoves(board: Int8Array, priority: Float64Array, swap: boolean): number[] {
  const moves: number[] = [];
  if (swap) moves.push(board.length);
  const legal: number[] = [];
  for (let i = 0; i < board.length; i++) if (board[i] === 0) legal.push(i);
  legal.sort((a, b) => priority[b] - priority[a] || a - b);
  moves.push(...legal);
  return moves;
}

function priorities(board: Int8Array, size: number, player: number): Float64Array {
  const own = distances(board, size, player);
  const rival = distances(board, size, 3 - player);
  const result = new Float64Array(board.length);
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== 0) continue;
    const x = Math.floor(i / size), y = i % size;
    const ownSlack = own.start[i] + own.end[i] - 1 - own.best;
    const rivalSlack = rival.start[i] + rival.end[i] - 1 - rival.best;
    const center = 1 - (Math.abs(x - (size - 1) / 2) + Math.abs(y - (size - 1) / 2)) / size;
    result[i] = 1 + Math.max(0, 5 - ownSlack) * 1.5 + Math.max(0, 5 - rivalSlack) + center;
  }
  return result;
}

function distances(board: Int8Array, size: number, player: number): { start: Int32Array; end: Int32Array; best: number } {
  const start = dijkstra(board, size, player, false);
  const end = dijkstra(board, size, player, true);
  let best = INF;
  for (let i = 0; i < size; i++) {
    const cell = player === 1 ? (size - 1) * size + i : i * size + size - 1;
    best = Math.min(best, start[cell]);
  }
  return { start, end, best };
}

function dijkstra(board: Int8Array, size: number, player: number, reverse: boolean): Int32Array {
  const distance = new Int32Array(board.length).fill(INF);
  const visited = new Uint8Array(board.length);
  for (let i = 0; i < size; i++) {
    const cell = player === 1 ? (reverse ? (size - 1) * size + i : i)
      : (reverse ? i * size + size - 1 : i * size);
    if (board[cell] !== 3 - player) distance[cell] = board[cell] === player ? 0 : 1;
  }
  for (let step = 0; step < board.length; step++) {
    let cell = -1;
    for (let i = 0; i < board.length; i++) {
      if (!visited[i] && (cell < 0 || distance[i] < distance[cell])) cell = i;
    }
    if (cell < 0 || distance[cell] >= INF) break;
    visited[cell] = 1;
    const x = Math.floor(cell / size), y = cell % size;
    for (let direction = 0; direction < 6; direction++) {
      const nx = x + DX[direction], ny = y + DY[direction];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const next = nx * size + ny;
      const cost = board[next] === player ? 0 : board[next] === 0 ? 1 : INF;
      distance[next] = Math.min(distance[next], distance[cell] + cost);
    }
  }
  return distance;
}
