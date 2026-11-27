import { AiPlayer } from './AiPlayer';
import { AI_NAME } from './Constants';
import type { AiDifficulty, BoardMatrix, Player } from './types';

export interface SearchRequest {
  board: BoardMatrix;
  side: Player;
  canSwap: boolean;
  difficulty: AiDifficulty;
}

self.onmessage = ({ data }: MessageEvent<SearchRequest>) => {
  const { board, side, canSwap, difficulty } = data;
  self.postMessage(new AiPlayer(difficulty, AI_NAME).getMove(board, side, canSwap));
};
