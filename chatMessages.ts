import type { ChatMessage, IgGameEvent } from './types';

export const MAX_CHAT_MESSAGE_LENGTH = 200;
export const MAX_CHAT_HISTORY = 100;

export const normalizeChatText = (text: string): string =>
  text.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);

export const appendChatMessage = (
  messages: ChatMessage[],
  message: ChatMessage,
): ChatMessage[] =>
  [...messages, message]
    .sort((a, b) => a.initialTimestamp - b.initialTimestamp)
    .slice(-MAX_CHAT_HISTORY);

export const markChatDelivery = (
  messages: ChatMessage[],
  localId: string,
  status: 'sent' | 'failed',
): ChatMessage[] =>
  messages.map(message =>
    message.localId === localId ? { ...message, status } : message
  );

/**
 * Reconciles server echoes with optimistic local rows and de-duplicates events.
 * Successful commands can be marked sent before their echo arrives.
 */
export const reconcileChatEvent = (
  messages: ChatMessage[],
  event: IgGameEvent,
  senderName: string,
  localUserUid: string | null,
): ChatMessage[] => {
  const text = normalizeChatText(event.data || '');
  if (!text) return messages;

  const existingEvent = messages.findIndex(message => message.id === event.eid);
  if (existingEvent >= 0) {
    return messages.map((message, index) =>
      index === existingEvent
        ? {
            ...message,
            senderName,
            text,
            serverTimestamp: Math.max(message.serverTimestamp, event.stamp),
            status: 'sent',
          }
        : message
    );
  }

  const ownMessage = event.uid === localUserUid;
  if (ownMessage) {
    const optimistic = messages.findIndex(message =>
      Boolean(message.localId) &&
      message.isLocalPlayer &&
      message.text === text &&
      message.status !== 'failed'
    );
    if (optimistic >= 0) {
      return messages.map((message, index) =>
        index === optimistic
          ? {
              ...message,
              id: event.eid,
              localId: undefined,
              senderName,
              serverTimestamp: event.stamp,
              status: 'sent',
            }
          : message
      );
    }
  }

  return appendChatMessage(messages, {
    id: event.eid,
    senderUid: event.uid,
    senderName,
    text,
    initialTimestamp: event.stamp,
    serverTimestamp: event.stamp,
    isLocalPlayer: ownMessage,
    status: 'sent',
  });
};
