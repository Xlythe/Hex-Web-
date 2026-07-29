import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../types';
import { SYSTEM_SENDER_UID } from '../types';
import { countUnreadChatMessages } from './ChatWindow';

const message = (
  id: string,
  overrides: Partial<ChatMessage> = {},
): ChatMessage => ({
  id,
  senderUid: 'opponent',
  senderName: 'Opponent',
  text: id,
  initialTimestamp: 1,
  serverTimestamp: 1,
  isLocalPlayer: false,
  status: 'sent',
  ...overrides,
});

describe('chat unread counter', () => {
  it('counts only newly received player messages', () => {
    const messages = [
      message('already-read'),
      message('local', { senderUid: 'me', isLocalPlayer: true }),
      message('system', { senderUid: SYSTEM_SENDER_UID }),
      message('sending', { status: 'sending' }),
      message('remote-1'),
      message('remote-2'),
    ];

    expect(countUnreadChatMessages(messages, 1)).toBe(2);
  });

  it('handles cleared chat history and large read cursors', () => {
    expect(countUnreadChatMessages([message('new')], 20)).toBe(0);
    expect(countUnreadChatMessages([], 0)).toBe(0);
  });
});
