import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { OnlinePlayer } from './OnlinePlayer';
import type {
  IgCommandHandlerFullParams,
  IgCommandHandlerSuccessResponse,
  LoggedInUser,
} from './types';

const user: LoggedInUser = {
  uid: '42',
  name: 'Alice',
  session_id: 'login-session',
  expiryTimestamp: Date.now() + 60_000,
};

const responseWithEvent = (eid: string): IgCommandHandlerSuccessResponse => ({
  sessionInfo: {
    cmd: 'REFRESH',
    curtime: 1,
    status: 'ACTIVE',
    owner: user.uid,
  },
  memberInfo: { active: '1', finished: '0', place: '1' },
  eventList: [{ eid, stamp: 1, uid: user.uid, type: 'NOTICE', data: 'ok' }],
  error: false,
});

describe('OnlinePlayer command queue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never overlaps requests and resolves lasteid when a queued request starts', async () => {
    const sentParams: IgCommandHandlerFullParams[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstRequestGate = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });

    vi.spyOn(api, 'handleGameCommand').mockImplementation(async params => {
      sentParams.push({ ...params });
      if (sentParams.length === 1) await firstRequestGate;
      return responseWithEvent(sentParams.length === 1 ? '5' : '6');
    });

    const player = new OnlinePlayer('Bob');
    player.setSessionInfo('game-session', 'gc1');

    const move = player.sendCommand('MOVE', user, { move: 'A1' });
    const refresh = player.sendCommand('REFRESH', user);
    await vi.waitFor(() => expect(sentParams).toHaveLength(1));

    releaseFirst?.();
    await Promise.all([move, refresh]);

    expect(sentParams).toHaveLength(2);
    expect(sentParams[0]).toMatchObject({ cmd: 'MOVE', move: 'A1', lasteid: '0' });
    expect(sentParams[1]).toMatchObject({ cmd: 'REFRESH', lasteid: '5' });
    expect(player.lastEventId).toBe('6');
  });

  it('does not allow a caller to replace the current event cursor', async () => {
    const sentParams: IgCommandHandlerFullParams[] = [];
    vi.spyOn(api, 'handleGameCommand').mockImplementation(async params => {
      sentParams.push({ ...params });
      return responseWithEvent('12');
    });
    const player = new OnlinePlayer('Bob');
    player.setSessionInfo('game-session', 'gc1');
    player.lastEventId = '11';

    await player.sendCommand('START', user, { lasteid: '0' });

    expect(sentParams[0]).toMatchObject({ cmd: 'START', lasteid: '11' });
  });
});
