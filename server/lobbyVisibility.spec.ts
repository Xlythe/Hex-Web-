import { describe, expect, it } from 'vitest';
import type { LobbyGameSession } from '../types';
import { publicLobbySessions } from './lobbyVisibility';

const session = (
  sid: string,
  priv?: '0' | '1',
): LobbyGameSession => ({
  sid,
  priv,
  state: 'INIT',
  ownerUid: `owner-${sid}`,
  server: 'gc1',
  members: [],
});

describe('public lobby visibility', () => {
  it('removes private sessions even if the legacy server returns them', () => {
    expect(publicLobbySessions([
      session('public', '0'),
      session('legacy-public'),
      session('private', '1'),
    ]).map(game => game.sid)).toEqual(['public', 'legacy-public']);
  });
});
