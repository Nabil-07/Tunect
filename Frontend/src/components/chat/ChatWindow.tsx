// Frontend/src/components/chat/ChatWindow.tsx
import { useState, useEffect, useRef } from 'react';
import { Send, Users, Lock, AlertTriangle, Trash2 } from 'lucide-react';
import { getConversation, sendMessage, deleteMessage, markThreadRead } from '../../services/chatService';
import type { ConversationDetail, Message } from '../../services/chatService';
import { useAuth } from '../../contexts/AuthContext';

interface ChatWindowProps {
  conversationId: string;
}

export default function ChatWindow({ conversationId }: ChatWindowProps) {
  const { user } = useAuth();
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversation();
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [conversation?.messages]);

  const loadConversation = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getConversation(conversationId);
      setConversation(data);

      // Mark conversation as read and notify Navbar to refresh unread badge
      markThreadRead(conversationId)
        .then(() => globalThis.dispatchEvent(new Event('messages:updated')))
        .catch(() => {}); // fire-and-forget
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load conversation');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !conversation?.canPost) return;

    try {
      setSending(true);
      const newMessage = await sendMessage(conversationId, messageText.trim());
      setConversation((prev) =>
        prev
          ? {
              ...prev,
              messages: [...prev.messages, newMessage],
            }
          : null,
      );
      setMessageText('');
      // Refresh unread badge (sending marks the conversation as read)
      globalThis.dispatchEvent(new Event('messages:updated'));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Delete this message? It will show as "Message removed by admin".')) return;

    try {
      await deleteMessage(messageId);
      await loadConversation(); // Reload to show updated message
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete message');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getConversationIcon = () => {
    switch (conversation?.type) {
      case 'GROUP_SESSION':
        return <Users className="h-5 w-5" />;
      case 'ADMIN_BROADCAST':
        return <Lock className="h-5 w-5" />;
      default:
        return null;
    }
  };

  const getConversationBadge = () => {
    if (conversation?.type === 'ADMIN_BROADCAST') {
      return (
        <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full">
          Broadcast (Read-only)
        </span>
      );
    }
    if (conversation?.type === 'GROUP_SESSION') {
      return (
        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full flex items-center gap-1">
          <Users className="h-3 w-3" /> {conversation.members.length} members
        </span>
      );
    }
    return null;
  };

  const getTokenWarning = () => {
    // Only show token warnings for students, not tutors
    if (user?.role !== 'STUDENT' || !conversation?.tokenBalance) return null;

    if (!conversation.tokenBalance.hasTokens) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-red-900">Token balance exhausted</h4>
            <p className="text-sm text-red-700">
              You cannot send messages until you purchase more tokens. Existing messages remain readable.
            </p>
          </div>
        </div>
      );
    }

    // Show low balance warning when balance <= 2 tokens (for students only)
    if (conversation.tokenBalance.balance <= 2) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-yellow-900">Low token balance</h4>
            <p className="text-sm text-yellow-700">
              You have {conversation.tokenBalance.balance} tokens remaining. Consider purchasing more.
            </p>
          </div>
        </div>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Loading conversation...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Conversation not found</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-lg" data-testid="chat-window">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getConversationIcon()}
          <h3 className="font-semibold text-lg">
            {conversation.type === 'DIRECT' && 'Direct Chat'}
            {conversation.type === 'GROUP_SESSION' && 'Group Session Chat'}
            {conversation.type === 'ADMIN_BROADCAST' && 'Announcement'}
          </h3>
        </div>
        {getConversationBadge()}
      </div>

      {/* Token Warning */}
      {getTokenWarning() && <div className="px-4 pt-4">{getTokenWarning()}</div>}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="chat-window-messages">
        {conversation.messages.length === 0 ? (
          <div className="text-center text-gray-500 py-12">No messages yet. Start the conversation!</div>
        ) : (
          conversation.messages.map((msg: Message) => {
            const isMe = msg.senderId === user?.id;
            const isDeleted = msg.isDeleted;
            const isAdmin = user?.role === 'ADMIN';

            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-md ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                  {!isMe && (
                    <div className="text-xs text-gray-500 mb-1">{msg.sender.name || msg.sender.email}</div>
                  )}
                  <div
                    className={`rounded-lg px-4 py-2 relative ${
                      isMe
                        ? 'bg-blue-600 text-white'
                        : isDeleted
                        ? 'bg-gray-200 text-gray-500 italic'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    {msg.content}
                    {isAdmin && !isDeleted && (
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                        title="Delete message (admin)"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4">
        {conversation.canPost ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Type a message..."
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={sending}
              data-testid="chat-window-message-input"
            />
            <button
              onClick={handleSendMessage}
              disabled={!messageText.trim() || sending}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              data-testid="chat-window-send-btn"
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </div>
        ) : (
          <div className="text-center text-gray-500 py-2">
            {conversation.type === 'ADMIN_BROADCAST' && 'This is a read-only announcement'}
            {conversation.tokenBalance && !conversation.tokenBalance.hasTokens && 'Purchase tokens to continue messaging'}
          </div>
        )}
      </div>
    </div>
  );
}
