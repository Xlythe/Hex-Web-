import {
  IgApiResponse,
  IgCommandHandlerFullParams,
  IgCommandHandlerResponse,
  IgCommandHandlerSuccessResponse,
  IgCreateBoardParams,
  IgCreateBoardResponse,
  IgGameEvent,
  IgGameLogEntry,
  IgGameLogPlayer,
  IgGameStatEntry,
  IgJoinRandomGameParams,
  IgJoinRandomGameResponse,
  IgLobbyApiParams,
  IgLobbyResponse,
  IgLobbySuccessResponse,
  IgUserLoginParams,
  IgUserLoginSuccessResponse,
  IgUserProfileData,
  IgUserProfileParams,
  IgUserRegistrationError,
  IgUserRegistrationParams,
  IgUserRegistrationSuccessResponse,
  IgUserUpdateParams,
  IgUserUpdateSuccessResponse,
  LobbyGameSession,
  LobbyGameSessionMember,
  PlayerStat,
} from './types';
import { getOrGenerateNetworkUid, md5 } from './utils';
import { isValidServerName } from './server/igGameCenterProtocol';

export const APP_ID = '17';
export const APP_CODE = 'wihamo8984';

const DEFAULT_API_BASE_URL =
  'https://ig-game-center-proxy-12702774477.us-west1.run.app';
const DEFAULT_TIMEOUT_MS = 15_000;

interface XmlSuccess {
  error: false;
  document: XMLDocument;
  rawText: string;
  response: Response;
}

type XmlResult = XmlSuccess | IgUserRegistrationError;

export interface IgGameCenterApiOptions {
  baseUrl?: string;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}

const isError = (result: XmlResult): result is IgUserRegistrationError => result.error;

const text = (parent: ParentNode, selector: string): string | undefined => {
  const value = parent.querySelector(selector)?.textContent?.trim();
  return value || undefined;
};

const integer = (value: string | null | undefined): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const form = (
  values: object,
): URLSearchParams => {
  const params = new URLSearchParams();
  Object.entries(values as Record<string, string | number | null | undefined>).forEach(([key, value]) => {
    if (value !== undefined && value !== null) params.append(key, String(value));
  });
  return params;
};

/**
 * Typed client for the legacy igGameCenter POST/XML API.
 *
 * The application passcode is necessarily public in a browser client. This
 * class therefore treats member passwords and session IDs as secrets: request
 * bodies and raw responses are never logged.
 */
export class IgGameCenterApi {
  private readonly baseUrl: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: IgGameCenterApiOptions = {}) {
    this.baseUrl = (
      options.baseUrl
      || import.meta.env.VITE_IGGC_API_BASE_URL
      || DEFAULT_API_BASE_URL
    ).replace(/\/+$/, '');
    this.fetchImplementation = options.fetchImplementation || fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private commonParams(
    values: object,
  ): URLSearchParams {
    return form({ app_id: APP_ID, app_code: APP_CODE, ...values });
  }

  private error(
    message: string,
    rawXmlResponse?: string,
    response?: Response,
  ): IgUserRegistrationError {
    return {
      error: true,
      message,
      rawXmlResponse,
      httpStatusCode: response?.status,
      httpStatusText: response?.statusText,
    };
  }

  private async postXml(path: string, body: URLSearchParams): Promise<XmlResult> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response | undefined;
    let rawText = '';

    try {
      response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Accept: 'application/xml, text/xml',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: controller.signal,
      });
      rawText = await response.text();
      if (!response.ok) {
        return this.error(
          `HTTP ${response.status}: ${response.statusText || 'Request failed'}`,
          undefined,
          response,
        );
      }
      const document = new DOMParser().parseFromString(rawText, 'application/xml');
      const parseError = document.querySelector('parsererror');
      if (parseError) {
        return this.error('Malformed XML response from igGameCenter.', rawText, response);
      }

      const apiError = text(document, 'errorMessage');
      if (apiError) {
        return this.error(
          apiError || `HTTP ${response.status}: ${response.statusText || 'Request failed'}`,
          rawText,
          response,
        );
      }
      return { error: false, document, rawText, response };
    } catch (requestError) {
      const aborted = requestError instanceof DOMException && requestError.name === 'AbortError';
      return this.error(
        aborted
          ? 'The igGameCenter request timed out.'
          : requestError instanceof Error
            ? requestError.message
            : 'Could not connect to igGameCenter.',
        rawText || undefined,
        response,
      );
    } finally {
      window.clearTimeout(timeout);
    }
  }

  public async registerUser(
    params: Omit<IgUserRegistrationParams, 'networkuid'>,
  ): Promise<IgApiResponse> {
    const result = await this.postXml('/api_user_add.php', this.commonParams({
      ...params,
      networkuid: getOrGenerateNetworkUid(),
    }));
    if (isError(result)) return result;

    const uid = text(result.document, 'uid');
    const name = text(result.document, 'name');
    if (!uid || !name) {
      return this.error(
        'Malformed registration response: expected uid and name.',
        result.rawText,
        result.response,
      );
    }
    const response: IgUserRegistrationSuccessResponse = { uid, name, error: false };
    const hashedPassword = text(result.document, 'password');
    if (hashedPassword) response.hashedPassword = hashedPassword;
    return response;
  }

  public async loginUser(
    params: Omit<IgUserLoginParams, 'networkuid' | 'md5'>,
  ): Promise<IgApiResponse> {
    const result = await this.postXml('/api_login.php', this.commonParams({
      login: params.login,
      password: md5(params.password),
      md5: '1',
      networkuid: getOrGenerateNetworkUid(),
    }));
    if (isError(result)) return result;

    const uid = text(result.document, 'uid');
    const name = text(result.document, 'name');
    const sessionId = text(result.document, 'session_id');
    if (!uid || !name || !sessionId) {
      return this.error(
        'Malformed login response: expected uid, name, and session_id.',
        result.rawText,
        result.response,
      );
    }
    const response: IgUserLoginSuccessResponse = {
      uid,
      name,
      session_id: sessionId,
      error: false,
    };
    return response;
  }

  public async getUserProfile(
    params: IgUserProfileParams,
  ): Promise<IgUserProfileData | IgUserRegistrationError> {
    const result = await this.postXml('/api_profile.php', this.commonParams(params));
    if (isError(result)) return result;

    const profile = result.document.querySelector('profile');
    if (!profile) {
      return this.error('Malformed profile response: expected profile.', result.rawText, result.response);
    }

    const profileData: IgUserProfileData = {
      error: false,
      curtime: integer(text(profile, 'curtime')),
      isFastReg: text(profile, 'isFastReg') as '0' | '1' | undefined,
      name: text(profile, 'name'),
      realName: text(profile, 'realName'),
      sex: text(profile, 'sex') as 'M' | 'F' | '-' | undefined,
      country: text(profile, 'country'),
      location: text(profile, 'location'),
      about: text(profile, 'about'),
      registrationTime: integer(text(profile, 'registrationTime')),
      lastAliveTime: integer(text(profile, 'lastAliveTime')),
      idleTimeSec: integer(text(profile, 'idleTimeSec')),
      email: text(profile, 'email'),
      subscribeNews: text(profile, 'subscribeNews') as '0' | '1' | undefined,
      showEmail: text(profile, 'showEmail') as '0' | '1' | undefined,
      showBirthday: text(profile, 'showBirthday') as '0' | '1' | undefined,
    };

    const birthDate = text(profile, 'birthDate');
    if (birthDate) {
      profileData.birthDate = birthDate;
      const [day, month, year] = birthDate.split('-');
      if (day && month && year) {
        profileData.birthDay = day;
        profileData.birthMonth = month;
        profileData.birthYear = year;
      }
    } else {
      profileData.birthDay = text(profile, 'birthDay');
      profileData.birthMonth = text(profile, 'birthMonth');
      profileData.birthYear = text(profile, 'birthYear');
    }

    const gameStats = profile.querySelectorAll('gameStat > game');
    if (gameStats.length) {
      profileData.gameStat = Array.from(gameStats).map(node => ({
        gid: node.getAttribute('gid') || '',
        score: integer(node.getAttribute('score')) || 0,
        numGames: integer(node.getAttribute('numGames')) || 0,
        numWin: integer(node.getAttribute('numWin')) || 0,
        numLoss: integer(node.getAttribute('numLoss')) || 0,
        numDraw: integer(node.getAttribute('numDraw')) || 0,
        numQuit: integer(node.getAttribute('numQuit')) || 0,
      } satisfies IgGameStatEntry));
    }

    const gameLog = profile.querySelectorAll('gameLog > game');
    if (gameLog.length) {
      profileData.gameLog = Array.from(gameLog).map(node => ({
        gid: node.getAttribute('gid') || '',
        createTime: integer(node.getAttribute('createTime')) || 0,
        durationMin: integer(node.getAttribute('durationMin')) || 0,
        players: Array.from(node.querySelectorAll('players > player')).map(player => ({
          uid: player.getAttribute('uid') || '',
          name: player.getAttribute('name') || '',
          stat: (player.getAttribute('stat') || 'DRAW') as IgGameLogPlayer['stat'],
          scoreOld: integer(player.getAttribute('scoreOld')) || 0,
          scoreNew: integer(player.getAttribute('scoreNew')) || 0,
        })),
      } satisfies IgGameLogEntry));
    }
    return profileData;
  }

  public async updateUserProfile(
    params: IgUserUpdateParams,
  ): Promise<IgUserUpdateSuccessResponse | IgUserRegistrationError> {
    const values: Record<string, string | number | null | undefined> = { ...params };
    const result = await this.postXml('/api_user_edit.php', this.commonParams(values));
    if (isError(result)) return result;
    if (!result.document.querySelector('userUpdateSuccess')) {
      return this.error(
        'Malformed profile update response: expected userUpdateSuccess.',
        result.rawText,
        result.response,
      );
    }
    return { success: true, error: false };
  }

  public async joinRandomGame(
    params: IgJoinRandomGameParams,
  ): Promise<IgJoinRandomGameResponse> {
    return this.requestBoard('/api_board_random.php', params, 'random board');
  }

  public async createBoardSession(
    params: IgCreateBoardParams,
  ): Promise<IgCreateBoardResponse> {
    return this.requestBoard('/api_board_create.php', params, 'created board');
  }

  private async requestBoard(
    path: string,
    params: object,
    description: string,
  ): Promise<IgJoinRandomGameResponse | IgCreateBoardResponse> {
    const result = await this.postXml(path, this.commonParams(params));
    if (isError(result)) return result;
    const sid = text(result.document, 'sid');
    const server = text(result.document, 'server');
    if (!sid || !server || !isValidServerName(server)) {
      return this.error(
        `Malformed ${description} response: expected a valid sid and server.`,
        result.rawText,
        result.response,
      );
    }
    return { sid, server, error: false };
  }

  public async fetchLobby(params: IgLobbyApiParams): Promise<IgLobbyResponse> {
    const result = await this.postXml('/api_board_list.php', this.commonParams(params));
    if (isError(result)) return result;

    const sessions: LobbyGameSession[] = Array.from(
      result.document.querySelectorAll('sessionList > session'),
    ).map(node => {
      const members: LobbyGameSessionMember[] = Array.from(
        node.querySelectorAll('member'),
      ).map(member => ({
        place: member.getAttribute('plc') || member.getAttribute('place') || '0',
        uid: member.getAttribute('uid') || '',
        name: member.getAttribute('nam') || member.getAttribute('name') || 'Unknown Player',
        stat: (member.getAttribute('stat') || PlayerStat.NONE) as PlayerStat,
      }));
      return {
        sid: node.getAttribute('sid') || '',
        state: node.getAttribute('stat') || 'UNKNOWN',
        ownerUid: node.getAttribute('uid') || '',
        server: node.getAttribute('serv') || '',
        priv: node.getAttribute('priv') as '0' | '1' | undefined,
        members,
        gameName: 'Hex',
        numPlayers: members.filter(member => member.place !== '0').length,
        maxPlayers: 2,
      };
    }).filter(session => session.sid && isValidServerName(session.server));
    const response: IgLobbySuccessResponse = { sessions, error: false };
    return response;
  }

  public async handleGameCommand(
    params: IgCommandHandlerFullParams,
    serverName: string,
  ): Promise<IgCommandHandlerResponse> {
    if (!isValidServerName(serverName)) {
      return this.error('Invalid igGameCenter game-server name.');
    }
    const path = `/server/${encodeURIComponent(serverName)}/api_handler.php`;
    const result = await this.postXml(path, form(params));
    if (isError(result)) return result;

    const handler = result.document.querySelector('handlerData');
    const session = handler?.querySelector('sessionInfo');
    const member = handler?.querySelector('memberInfo');
    if (!handler || !session || !member) {
      return this.error(
        'Malformed handler response: expected handlerData, sessionInfo, and memberInfo.',
        result.rawText,
        result.response,
      );
    }

    const response: IgCommandHandlerSuccessResponse = {
      sessionInfo: {
        cmd: session.getAttribute('cmd') || params.cmd || '',
        curtime: integer(session.getAttribute('curtime')) || 0,
        status: (session.getAttribute('status') || 'INIT') as 'INIT' | 'ACTIVE' | 'FINISHED',
        owner: session.getAttribute('owner') || '',
        activePlayer: session.getAttribute('activePlayer') || undefined,
      },
      memberInfo: {
        active: (member.getAttribute('active') || '0') as '0' | '1',
        finished: (member.getAttribute('finished') || '0') as '0' | '1',
        place: member.getAttribute('place') || '0',
      },
      error: false,
    };

    const players = handler.querySelectorAll('playerList > player');
    if (players.length) {
      response.playerList = Array.from(players).map(player => ({
        uid: player.getAttribute('uid') || '',
        name: player.getAttribute('name') || '',
        sex: (player.getAttribute('sex') || '-') as 'M' | 'F' | '-',
        score: integer(player.getAttribute('score')) || 0,
        place: player.getAttribute('place') || '0',
        stat: (player.getAttribute('stat') || PlayerStat.NONE) as PlayerStat,
        lastRefresh: integer(player.getAttribute('lastRefresh')) || 0,
        timerLeft: integer(player.getAttribute('timerLeft')),
        online: (player.getAttribute('online') || '0') as '0' | '1',
        active: (player.getAttribute('active') || '0') as '0' | '1',
        finished: (player.getAttribute('finished') || '0') as '0' | '1',
      }));
      response.sessionInfo.activePlayer ||= response.playerList.find(
        player => player.active === '1',
      )?.uid;
    }

    const guests = handler.querySelectorAll('guestList > guest');
    if (guests.length) {
      response.guestList = Array.from(guests).map(guest => ({
        uid: guest.getAttribute('uid') || '',
        name: guest.getAttribute('name') || '',
        score: integer(guest.getAttribute('score')) || 0,
      }));
    }

    const events = handler.querySelectorAll('eventList > event');
    if (events.length) {
      response.eventList = Array.from(events).map(event => ({
        eid: event.getAttribute('eid') || '',
        stamp: integer(event.getAttribute('stamp')) || 0,
        uid: event.getAttribute('uid') || '0',
        type: event.getAttribute('type') || '',
        data: event.getAttribute('data') ?? text(event, ':scope'),
      } satisfies IgGameEvent));
    }

    const gameData = handler.querySelector('gameData');
    if (gameData) {
      response.gameData = {};
      Array.from(gameData.children).forEach(child => {
        response.gameData![child.tagName] = child.textContent || '';
      });
    }

    const gameOptions = handler.querySelector('gameOptions');
    if (gameOptions) {
      response.gameOptions = {};
      Array.from(gameOptions.children).forEach(child => {
        const key = child.tagName === 'hidden' ? 'private' : child.tagName;
        const value = child.textContent?.trim() || '';
        response.gameOptions![key] = ['timerTotal', 'timerInc', 'boardSize'].includes(key)
          ? integer(value)
          : value;
      });
    }

    response.elapsed = Number.parseFloat(text(handler, 'elapsed') || '');
    if (Number.isNaN(response.elapsed)) delete response.elapsed;
    return response;
  }
}
