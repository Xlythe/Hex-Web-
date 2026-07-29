import { describe, expect, it } from 'vitest';
import {
  appendChatMessage,
  markChatDelivery,
  MAX_CHAT_HISTORY,
  normalizeChatText,
  reconcileChatEvent,
} from './chatMessages';
import type { ChatMessage, IgGameEvent } from './types';

const optimistic = (): ChatMessage => ({
  id: 'local:1',
  localId: 'local:1',
  senderUid: '7',
  senderName: 'Alice',
  text: 'hello',
  initialTimestamp: 10,
  serverTimestamp: 10,
  isLocalPlayer: true,
  status: 'sending',
});

const event = (overrides: Partial<IgGameEvent> = {}): IgGameEvent => ({
  eid: '42',
  stamp: 11,
  uid: '7',
  type: 'MSG',
  data: 'hello',
  ...overrides,
});

describe('chat message state', () => {
  it('reconciles an optimistic row without duplicating it', () => {
    const result = reconcileChatEvent([optimistic()], event(), 'Alice', '7');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: '42',
      localId: undefined,
      status: 'sent',
      serverTimestamp: 11,
    });
  });

  it('still reconciles when the command response arrived before its echo', () => {
    const delivered = markChatDelivery([optimistic()], 'local:1', 'sent');
    const result = reconcileChatEvent(delivered, event(), 'Alice', '7');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('42');
  });

  it('keeps a failed row distinct from a later matching server event', () => {
    const failed = markChatDelivery([optimistic()], 'local:1', 'failed');
    const result = reconcileChatEvent(failed, event(), 'Alice', '7');

    expect(result).toHaveLength(2);
    expect(result.map(message => message.status)).toEqual(['failed', 'sent']);
  });

  it('deduplicates repeated server events', () => {
    const once = reconcileChatEvent([], event({ uid: '9' }), 'Bob', '7');
    const twice = reconcileChatEvent(once, event({ uid: '9' }), 'Bob', '7');

    expect(twice).toHaveLength(1);
  });

  it('normalizes input and bounds in-memory history', () => {
    expect(normalizeChatText(`  ${'x'.repeat(205)}  `)).toHaveLength(200);
    let messages: ChatMessage[] = [];
    for (let index = 0; index < MAX_CHAT_HISTORY + 5; index++) {
      messages = appendChatMessage(messages, {
        ...optimistic(),
        id: String(index),
        localId: undefined,
        initialTimestamp: index,
      });
    }
    expect(messages).toHaveLength(MAX_CHAT_HISTORY);
    expect(messages[0].id).toBe('5');
  });
});
