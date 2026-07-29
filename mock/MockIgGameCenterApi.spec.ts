import { beforeEach, describe, expect, it } from 'vitest';
import { APP_CODE, APP_ID } from '../IgGameCenterApi';
import type {
  IgCommandHandlerFullParams,
  IgCommandHandlerSuccessResponse,
  IgCreateBoardSuccessResponse,
  IgUserLoginSuccessResponse,
} from '../types';
import { MockIgGameCenterApi } from './MockIgGameCenterApi';

describe('MockIgGameCenterApi multiplayer contract', () => {
  let api: MockIgGameCenterApi;

  beforeEach(() => {
    localStorage.clear();
    api = new MockIgGameCenterApi({ enableBot: false, latencyMs: 0, verbose: false });
  });

  const createUser = async (name: string) => {
    const password = `${name}-password`;
    const registration = await api.registerUser({ name, password });
    expect(registration.error).toBe(false);
    const login = await api.loginUser({ login: name, password });
    expect(login.error).toBe(false);
    return login as IgUserLoginSuccessResponse;
  };

  const command = async (
    user: IgUserLoginSuccessResponse,
    sid: string,
    cmd?: string,
    additional: Record<string, string> = {},
  ) => {
    const params: IgCommandHandlerFullParams = {
      app_id: APP_ID,
      app_code: APP_CODE,
      uid: user.uid,
      session_id: user.session_id,
      sid,
      lasteid: '0',
      ...additional,
    };
    if (cmd) params.cmd = cmd;
    const response = await api.handleGameCommand(params, 'gcMock');
    expect(response.error).toBe(false);
    return response as IgCommandHandlerSuccessResponse;
  };

  it('runs a two-user game with production move encoding and event replay', async () => {
    const alice = await createUser('Alice');
    const bob = await createUser('Bob');
    const board = await api.createBoardSession({
      uid: alice.uid,
      session_id: alice.session_id,
      gid: '12',
      place: '1',
    }) as IgCreateBoardSuccessResponse;

    await command(alice, board.sid);
    await command(bob, board.sid);
    await command(bob, board.sid, 'PLACE', { place: '2' });
    await command(alice, board.sid, 'START');
    const started = await command(bob, board.sid, 'START');

    expect(started.sessionInfo.status).toBe('ACTIVE');
    expect(started.playerList).toHaveLength(2);

    const move = await command(alice, board.sid, 'MOVE', { move: 'C7' });
    expect(move.eventList).toContainEqual(expect.objectContaining({
      type: 'MOVE',
      uid: alice.uid,
      data: 'C7',
    }));
    expect(move.gameData?.board?.[6 * 11 + 2]).toBe('1');

    const invalidMove = await command(bob, board.sid, 'MOVE', { move: '6-2' });
    expect(invalidMove.eventList?.filter(event => event.type === 'MOVE')).toHaveLength(1);
  });

  it('models legacy undo and restart events without invented JSON payloads', async () => {
    const alice = await createUser('Alice');
    const bob = await createUser('Bob');
    const board = await api.createBoardSession({
      uid: alice.uid,
      session_id: alice.session_id,
      gid: '12',
      place: '1',
    }) as IgCreateBoardSuccessResponse;

    await command(bob, board.sid);
    await command(bob, board.sid, 'PLACE', { place: '2' });
    await command(alice, board.sid, 'START');
    await command(bob, board.sid, 'START');
    await command(alice, board.sid, 'MOVE', { move: 'A1' });
    await command(bob, board.sid, 'MOVE', { move: 'B1' });

    const undoRequest = await command(alice, board.sid, 'UNDO', {
      type: 'ASK',
      move_ind: '1',
    });
    expect(undoRequest.eventList).toContainEqual(expect.objectContaining({
      type: 'UNDOASK',
      uid: alice.uid,
      data: '1',
    }));

    const undoAccepted = await command(bob, board.sid, 'UNDO', { type: 'ACCEPT' });
    expect(undoAccepted.eventList).toContainEqual(expect.objectContaining({
      type: 'UNDODONE',
      uid: bob.uid,
      data: '1',
    }));
    expect(undoAccepted.gameData?.board?.startsWith('10')).toBe(true);

    const restart = await command(alice, board.sid, 'RESTART');
    const restartEvent = restart.eventList?.find(event => event.type === 'RESTART');
    expect(restartEvent?.uid).toBe(alice.uid);
    expect(restartEvent?.data).toMatch(/^mock_board_sid_/);
  });

  it('delivers chat incrementally and models a player forfeit', async () => {
    const alice = await createUser('Alice');
    const bob = await createUser('Bob');
    const board = await api.createBoardSession({
      uid: alice.uid,
      session_id: alice.session_id,
      gid: '12',
      place: '1',
    }) as IgCreateBoardSuccessResponse;

    await command(bob, board.sid);
    await command(bob, board.sid, 'PLACE', { place: '2' });
    const aliceReady = await command(alice, board.sid, 'START');
    expect(aliceReady.sessionInfo.status).toBe('INIT');
    await command(bob, board.sid, 'START');

    const beforeMessage = await command(bob, board.sid, 'REFRESH');
    const lastEventId = beforeMessage.eventList?.at(-1)?.eid || '0';
    await command(alice, board.sid, 'MSG', { message: 'Good luck!' });
    const received = await command(bob, board.sid, 'REFRESH', {
      lasteid: lastEventId,
    });
    expect(received.eventList).toEqual([
      expect.objectContaining({
        type: 'MSG',
        uid: alice.uid,
        data: 'Good luck!',
      }),
    ]);

    const forfeit = await command(alice, board.sid, 'END', {
      type: 'GIVEUP',
    });
    expect(forfeit.sessionInfo.status).toBe('FINISHED');
    expect(forfeit.eventList).toContainEqual(expect.objectContaining({
      type: 'ENDGAME',
      uid: alice.uid,
      data: 'GIVEUP',
    }));
    expect(forfeit.playerList).toContainEqual(expect.objectContaining({
      uid: alice.uid,
      stat: 'QUIT',
      finished: '1',
    }));
    expect(forfeit.playerList).toContainEqual(expect.objectContaining({
      uid: bob.uid,
      stat: 'WIN',
      finished: '1',
    }));
  });

  it('models a valid inactivity claim as a win for the claimant', async () => {
    const alice = await createUser('Alice');
    const bob = await createUser('Bob');
    const board = await api.createBoardSession({
      uid: alice.uid,
      session_id: alice.session_id,
      gid: '12',
      place: '1',
    }) as IgCreateBoardSuccessResponse;

    await command(bob, board.sid);
    await command(bob, board.sid, 'PLACE', { place: '2' });
    await command(alice, board.sid, 'START');
    await command(bob, board.sid, 'START');

    const claim = await command(alice, board.sid, 'END', {
      type: 'CLAIMQUIT',
    });

    expect(claim.sessionInfo.status).toBe('FINISHED');
    expect(claim.eventList).toContainEqual(expect.objectContaining({
      type: 'ENDGAME',
      uid: alice.uid,
      data: 'CLAIMQUIT',
    }));
    expect(claim.playerList).toContainEqual(expect.objectContaining({
      uid: alice.uid,
      stat: 'WIN',
    }));
    expect(claim.playerList).toContainEqual(expect.objectContaining({
      uid: bob.uid,
      stat: 'LOST',
    }));
  });
});
