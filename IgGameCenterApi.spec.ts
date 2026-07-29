import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IgGameCenterApi } from './IgGameCenterApi';
import type { IgCommandHandlerSuccessResponse } from './types';
import { md5 } from './utils';

const xmlResponse = (xml: string, status = 200): Response =>
  new Response(xml, {
    status,
    headers: { 'Content-Type': 'application/xml' },
  });

describe('IgGameCenterApi transport and XML parsing', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('registers with the legacy plaintext password without logging credentials', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(xmlResponse(`
      <registrationResult>
        <uid>123</uid>
        <name>Alice</name>
      </registrationResult>
    `));
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const client = new IgGameCenterApi({
      baseUrl: 'https://example.test',
      fetchImplementation,
    });

    const response = await client.registerUser({
      name: 'Alice',
      password: 'correct horse battery staple',
      email: 'alice@example.test',
    });

    expect(response).toMatchObject({ error: false, uid: '123', name: 'Alice' });
    const request = fetchImplementation.mock.calls[0][1];
    const body = request?.body as URLSearchParams;
    expect(body.get('password')).toBe('correct horse battery staple');
    expect(body.get('app_id')).toBe('17');
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it('logs in with the historical MD5 flag and parses the session', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(xmlResponse(`
      <loginResult>
        <uid>123</uid>
        <name>Alice</name>
        <session_id>session-secret</session_id>
      </loginResult>
    `));
    const client = new IgGameCenterApi({
      baseUrl: 'https://example.test',
      fetchImplementation,
    });

    const response = await client.loginUser({ login: 'Alice', password: 'hunter2' });
    const body = fetchImplementation.mock.calls[0][1]?.body as URLSearchParams;

    expect(body.get('password')).toBe(md5('hunter2'));
    expect(body.get('password')).not.toBe('hunter2');
    expect(body.get('md5')).toBe('1');
    expect(response).toEqual({
      error: false,
      uid: '123',
      name: 'Alice',
      session_id: 'session-secret',
    });
  });

  it('parses a handler fixture including events, board state, and options', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(xmlResponse(`
      <handlerData>
        <sessionInfo cmd="REFRESH" curtime="1700000000" status="ACTIVE" owner="123" />
        <memberInfo active="0" finished="0" place="1" />
        <playerList>
          <player uid="123" name="Alice" sex="F" score="1510" place="1"
            stat="PLAYING" lastRefresh="1699999998" online="1" active="0" finished="0" />
          <player uid="456" name="Bob" sex="M" score="1490" place="2"
            stat="PLAYING" lastRefresh="1699999999" timerLeft="294"
            online="1" active="1" finished="0" />
        </playerList>
        <eventList>
          <event eid="17" stamp="1700000000" uid="456" type="MOVE" data="C7" />
        </eventList>
        <gameData><board>1002</board></gameData>
        <gameOptions>
          <hidden>0</hidden><scored>1</scored><boardSize>11</boardSize>
          <timerTotal>300</timerTotal><timerInc>5</timerInc>
        </gameOptions>
        <elapsed>0.012</elapsed>
      </handlerData>
    `));
    const client = new IgGameCenterApi({
      baseUrl: 'https://example.test',
      fetchImplementation,
    });

    const response = await client.handleGameCommand({
      app_id: '17',
      app_code: 'code',
      uid: '123',
      session_id: 'session',
      sid: '99',
      cmd: 'REFRESH',
      lasteid: '16',
    }, 'gc1') as IgCommandHandlerSuccessResponse;

    expect(fetchImplementation.mock.calls[0][0]).toBe(
      'https://example.test/server/gc1/api_handler.php',
    );
    expect(response.error).toBe(false);
    expect(response.sessionInfo.activePlayer).toBe('456');
    expect(response.eventList).toEqual([
      { eid: '17', stamp: 1700000000, uid: '456', type: 'MOVE', data: 'C7' },
    ]);
    expect(response.gameData?.board).toBe('1002');
    expect(response.gameOptions).toMatchObject({
      private: '0',
      scored: '1',
      boardSize: 11,
      timerTotal: 300,
      timerInc: 5,
    });
  });

  it('returns typed failures for server errors, malformed XML, and invalid routing', async () => {
    const fetchImplementation = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(xmlResponse('<errorMessage>INVALID_PASSWORD</errorMessage>'))
      .mockResolvedValueOnce(xmlResponse('<broken>'));
    const client = new IgGameCenterApi({
      baseUrl: 'https://example.test',
      fetchImplementation,
    });

    await expect(client.loginUser({ login: 'Alice', password: 'wrong' }))
      .resolves.toMatchObject({ error: true, message: 'INVALID_PASSWORD' });
    await expect(client.loginUser({ login: 'Alice', password: 'wrong' }))
      .resolves.toMatchObject({ error: true, message: 'Malformed XML response from igGameCenter.' });
    await expect(client.handleGameCommand({
      app_id: '17',
      app_code: 'code',
      uid: '123',
      session_id: 'session',
      sid: '99',
      cmd: 'REFRESH',
    }, '../gc1')).resolves.toMatchObject({
      error: true,
      message: 'Invalid igGameCenter game-server name.',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });
});
