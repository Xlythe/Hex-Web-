import { describe, expect, it } from 'vitest';
import native from './testdata/android-game.rhex?raw';
import { type Replay, MAX_REPLAY_BYTES, serverHistory, readReplay, writeReplay } from './replayFile';
import { Player, WinReason } from './types';

describe('Android replay exchange', () => {
  it('plays a legacy hex-core save through its off-axis swap and winning move', () => {
    const game = readReplay(native);
    expect(game.history).toHaveLength(8);
    expect(game.history[2].boardMatrix[0][1]).toBe(null);
    expect(game.history[2].boardMatrix[1][0]).toBe(Player.TWO);
    expect(game.finalWinnerPlayerColor).toBe(Player.ONE);
    expect(game.winReason).toBe(WinReason.CONNECTION);
    expect(game.finalWinningPath).toHaveLength(3);
    expect(writeReplay(game)).toBe(native);
    expect(serverHistory(3, 'B1,SWAP,A1,B2,B1,C2,C1')).toEqual(game.history);
    expect(() => serverHistory(3, 'A1,A1')).toThrow();
  });

  it('reconstructs the Android moves from web snapshots including a diagonal swap', () => {
    for (const diagonal of [false, true]) {
      const source: Replay = JSON.parse(native);
      if (diagonal) {
        source.moveList.moveList = source.moveList.moveList.slice(0, 2);
        for (const move of source.moveList.moveList) move.x = move.y = 1;
      }
      const game = readReplay(JSON.stringify(source));
      delete game.sourceReplay;
      const encoded = writeReplay(game);
      const doc: Replay = JSON.parse(encoded);
      expect(doc.formatVersion).toBe(1);
      expect(doc.moveList.moveList.map(({x, y, team, swap}) => [x,y,team,swap]))
        .toEqual(source.moveList.moveList.map(({x, y, team, swap}) => [x,y,team,swap]));
      expect(readReplay(encoded).history).toEqual(game.history);
    }
  });

  it('rejects corrupt or incomplete history', () => {
    const edits: Array<(doc: Replay) => void> = [
      doc => { doc.formatVersion = 2; },
      doc => { doc.result = { winner: Player.TWO, reason: WinReason.CONNECTION }; },
      doc => { doc.result = { winner: Player.ONE, reason: WinReason.CONNECTION }; doc.moveList.moveList = []; },
      doc => { doc.gameOptions.gridSize = 100000; },
      doc => { doc.moveList.moveList[1].x = -1; },
      doc => { doc.moveList.moveList[1].team = 1; },
      doc => { doc.gameOptions.swap = false; },
      doc => { doc.moveList.moveList[1].swap = false; doc.moveList.moveList[1].x = 1; doc.moveList.moveList[1].y = 0; },
      doc => { doc.moveList.moveList.push(doc.moveList.moveList[1]); },
    ];
    for (const edit of edits) {
      const doc = JSON.parse(native);
      edit(doc);
      expect(() => readReplay(JSON.stringify(doc))).toThrow();
    }
    expect(() => readReplay(' '.repeat(MAX_REPLAY_BYTES + 1))).toThrow();
    const game = readReplay(native);
    delete game.sourceReplay;
    game.history.splice(2, 2);
    expect(() => writeReplay(game)).toThrow();
  });
});
