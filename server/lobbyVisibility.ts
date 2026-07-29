import type { LobbyGameSession } from '../types';

/** Defense in depth when an igGameCenter lobby unexpectedly returns hidden boards. */
export const publicLobbySessions = (
  sessions: LobbyGameSession[],
): LobbyGameSession[] => sessions.filter(session => session.priv !== '1');
