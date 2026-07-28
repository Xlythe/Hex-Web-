import React, { useState, useEffect, useRef, FormEvent } from 'react';
import { ChatMessage, SYSTEM_SENDER_UID } from '../types'; // Import SYSTEM_SENDER_UID
import { SpinnerIcon } from '../icons/SpinnerIcon';
import { ErrorIcon } from '../icons/ErrorIcon';
import { ChatBubbleIcon } from '../icons/ChatBubbleIcon';
import { MinimizeIcon } from '../icons/MinimizeIcon';
import { SendIcon } from '../icons/SendIcon';

interface ChatWindowProps {
  messages: ChatMessage[];
  onSendMessage: (messageText: string) => Promise<void>;
  localUserUid: string | null;
  isMaximized: boolean;
  onToggleMaximized: () => void;
  isLoading: boolean; // True if a message is currently being sent or other critical online action
  soundEffectsEnabled: boolean; // Prop to control if sound effects play
  playMessageChimeSound: () => void; // Function to play the message chime
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  onSendMessage,
  localUserUid,
  isMaximized,
  onToggleMaximized,
  isLoading,
  soundEffectsEnabled,
  playMessageChimeSound,
}) => {
  const [currentMessage, setCurrentMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevMessagesLengthRef = useRef(messages.length);
  const [lastReadMessageTimestamp, setLastReadMessageTimestamp] = useState<number>(0);
  const [hasUnread, setHasUnread] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isMaximized) {
      scrollToBottom();
      if (messages.length > 0) {
        setLastReadMessageTimestamp(messages[messages.length - 1].initialTimestamp);
      }
      setHasUnread(false); // Mark as read when chat is opened
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  }, [isMaximized, messages]); // Dependency on messages ensures timestamp updates if new messages arrive while open

  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      const newMessage = messages[messages.length - 1];
      if (newMessage && !newMessage.isLocalPlayer && newMessage.status !== 'sending' && newMessage.senderUid !== SYSTEM_SENDER_UID) {
        if (soundEffectsEnabled) {
          playMessageChimeSound();
        }
        if (!isMaximized) { // Only set unread if chat is not currently open
          setHasUnread(true);
        }
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, soundEffectsEnabled, playMessageChimeSound, isMaximized]);

  // Update `hasUnread` specifically if messages arrive while minimized
  useEffect(() => {
    if (!isMaximized && messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      if (latestMessage.initialTimestamp > lastReadMessageTimestamp && !latestMessage.isLocalPlayer && latestMessage.senderUid !== SYSTEM_SENDER_UID) {
        setHasUnread(true);
      }
    }
  }, [messages, isMaximized, lastReadMessageTimestamp]);


  const handleSendMessage = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentMessage.trim() || isLoading) return;
    
    const messageToSend = currentMessage.trim();
    setCurrentMessage(''); 

    try {
      await onSendMessage(messageToSend);
    } catch (error) {
      console.error("Failed to send message from ChatWindow:", error);
    }
  };

  const formatTimestamp = (unixSeconds: number): string => {
    const date = new Date(unixSeconds * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const iconButtonClasses = "p-2 text-theme-icon-light dark:text-theme-icon-dark hover:text-theme-icon-light-hover dark:hover:text-theme-icon-dark-hover rounded-full hover:bg-theme-button-icon-bg-hover-light dark:hover:bg-theme-button-icon-bg-hover-dark transition-colors focus:outline-none focus:ring-0";
  const primaryButtonClasses = "px-4 py-2 text-sm font-medium rounded-lg shadow-sm text-theme-button-primary-text-light dark:text-theme-button-primary-text-dark bg-theme-button-primary-bg-light hover:bg-theme-button-primary-bg-light-hover dark:bg-theme-button-primary-bg-dark dark:hover:bg-theme-button-primary-bg-dark-hover disabled:opacity-50";

  const renderMessageStatus = (status?: 'sending' | 'sent' | 'failed') => {
    if (status === 'sending') {
      return (
        <SpinnerIcon className="animate-spin h-3 w-3 text-gray-400 dark:text-gray-500 ml-1 inline-block" />
      );
    }
    if (status === 'failed') {
      return (
        <ErrorIcon className="h-3 w-3 text-red-500 dark:text-red-400 ml-1 inline-block" />
      );
    }
    return null;
  };

  if (!isMaximized) {
    return (
      <button
        onClick={() => {
          onToggleMaximized();
          if (messages.length > 0) { // Mark as read on open
            const latestMessage = messages[messages.length - 1];
            if (latestMessage.senderUid !== SYSTEM_SENDER_UID) {
                setLastReadMessageTimestamp(latestMessage.initialTimestamp);
            }
          }
          setHasUnread(false);
        }}
        className={`fixed bottom-4 right-4 ${iconButtonClasses} bg-theme-card-bg-light dark:bg-theme-card-bg-dark shadow-lg z-50`}
        aria-label="Open Chat"
        title="Open Chat"
      >
        <ChatBubbleIcon className="w-6 h-6" />
        {hasUnread && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3 pointer-events-none">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 sm:bottom-4 sm:right-4 w-full sm:w-80 h-[60%] sm:h-96 bg-theme-card-bg-light dark:bg-theme-card-bg-dark shadow-2xl rounded-t-lg sm:rounded-lg flex flex-col z-50 border-t-2 sm:border-2 border-theme-divider-light dark:border-theme-divider-dark">
      {/* Header */}
      <div className="flex justify-between items-center p-3 border-b border-theme-divider-light dark:border-theme-divider-dark">
        <h3 className="font-semibold text-theme-text-primary dark:text-theme-icon-dark">Game Chat</h3>
        <button onClick={onToggleMaximized} className={iconButtonClasses} aria-label="Minimize Chat" title="Minimize Chat">
          <MinimizeIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Message Area */}
      <div className="flex-grow p-3 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
        {messages.map((msg) => {
          const isSystemMessage = msg.senderUid === SYSTEM_SENDER_UID;
          return (
            <div
              key={msg.localId || msg.id}
              className={`flex flex-col ${msg.isLocalPlayer ? 'items-end' : (isSystemMessage ? 'items-center' : 'items-start')}`}
            >
              <div
                className={`max-w-[80%] p-2 rounded-lg ${
                  isSystemMessage
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 italic text-xs'
                    : msg.isLocalPlayer
                    ? 'bg-blue-500 dark:bg-blue-700 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-theme-text-primary dark:text-theme-icon-dark'
                } ${msg.status === 'sending' ? 'opacity-70' : ''} ${msg.status === 'failed' ? 'bg-red-200 dark:bg-red-800 border border-red-400 dark:border-red-600' : ''}`}
              >
                {!isSystemMessage && (
                  <div className="flex items-center mb-0.5">
                    <p className="text-xs font-semibold">
                      {msg.senderName}
                    </p>
                    <span className="ml-2 text-xs opacity-70">
                      {formatTimestamp(msg.status === 'sent' ? msg.serverTimestamp : msg.initialTimestamp)}
                    </span>
                    {msg.isLocalPlayer && renderMessageStatus(msg.status)}
                  </div>
                )}
                <p className={`text-sm whitespace-pre-wrap break-words ${msg.status === 'failed' ? 'text-red-700 dark:text-red-300' : ''}`}>
                  {msg.text}
                  {isSystemMessage && (
                    <span className="ml-1.5 text-xs opacity-60">({formatTimestamp(msg.serverTimestamp)})</span>
                  )}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSendMessage} className="p-3 border-t border-theme-divider-light dark:border-theme-divider-dark flex items-center space-x-2">
        <input
          ref={inputRef}
          type="text"
          value={currentMessage}
          onChange={(e) => setCurrentMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-grow px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-yellow-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
          disabled={isLoading}
          maxLength={200}
        />
        <button type="submit" className={primaryButtonClasses} disabled={isLoading || !currentMessage.trim()}>
          {isLoading && messages.some(m => m.status === 'sending' && m.isLocalPlayer && m.text === currentMessage.trim()) ? (
            <SpinnerIcon className="animate-spin h-4 w-4 text-white" />
          ) : (
            <SendIcon className="w-5 h-5" />
          )}
        </button>
      </form>
    </div>
  );
};

export default ChatWindow;
