import { BoardMatrix, Coordinate, Player } from './types';

function getNeighbors(size: number, r: number, c: number): Coordinate[] {
  const potentialNeighborCoords: Array<[number, number]> = [
    [r, c - 1], [r, c + 1], [r - 1, c], [r - 1, c + 1], [r + 1, c], [r + 1, c - 1],
  ];
  const neighbors: Coordinate[] = [];
  for (const [nr, nc] of potentialNeighborCoords) {
    if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
      neighbors.push({ r: nr, c: nc });
    }
  }
  return neighbors;
}

export function winningPath(board: BoardMatrix, playerSide: Player): Coordinate[] | null {
  const size = board.length;
  if (size === 0) return null;
  const visited = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const parent = Array.from({ length: size }, () => Array<Coordinate | null>(size).fill(null));
  const queue: Coordinate[] = [];
  for (let index = 0; index < size; index++) {
    const start = playerSide === Player.ONE ? { r: index, c: 0 } : { r: 0, c: index };
    if (board[start.r][start.c] === playerSide) {
      visited[start.r][start.c] = true;
      queue.push(start);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    if ((playerSide === Player.ONE && cell.c === size - 1) ||
        (playerSide === Player.TWO && cell.r === size - 1)) {
      const path: Coordinate[] = [];
      let current: Coordinate | null = cell;
      while (current) {
        path.push(current);
        current = parent[current.r][current.c];
      }
      return path.reverse();
    }
    for (const neighbor of getNeighbors(size, cell.r, cell.c)) {
      if (!visited[neighbor.r][neighbor.c] && board[neighbor.r][neighbor.c] === playerSide) {
        visited[neighbor.r][neighbor.c] = true;
        parent[neighbor.r][neighbor.c] = cell;
        queue.push(neighbor);
      }
    }
  }
  return null;
}
