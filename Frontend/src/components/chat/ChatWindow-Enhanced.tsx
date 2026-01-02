// Frontend/src/components/chat/ChatWindow-Enhanced.tsx
import { useState, useEffect, useRef } from 'react';
import { Send, Users, Lock, AlertTriangle, Trash2 } from 'lucide-react';
import { getConversation, sendMessage, deleteMessage } from '../../services/chatService';
import type { ConversationDetail, Message } from '../../services/chatService';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../hooks/useSocket';

interface ChatWindowProps {
  conversationId: string;
}

export function ChatWindow({ conversationId }: ChatWindowProps) {
  const { user } = useAuth();
  const { isConnected, on, off, emit } = useSocket();
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversation();
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [conversation?.messages]);

  // WebSocket: Join conversation room
  useEffect(() => {
    if (isConnected && conversationId) {
      emit('joinConversation', { conversationId });
      console.log('Joined conversation:', conversationId);

      return () => {
        emit('leaveConversation', { conversationId });
        console.log('Left conversation:', conversationId);
      };
    }
  }, [isConnected, conversationId, emit]);

  // WebSocket: Listen for new messages
  useEffect(() => {
    const handleNewMessage = (message: Message) => {
      console.log('New message received:', message);
      setConversation((prev) => {
        if (!prev || message.conversationId !== conversationId) return prev;
        
        // Check if message already exists
        if (prev.messages.some(m => m.id === message.id)) return prev;

        return {
          ...prev,
          messages: [...prev.messages, message],
        };
      });
    };

    on('newMessage', handleNewMessage);

    return () => {
      off('newMessage', handleNewMessage);
    };
  }, [conversationId, on, off]);

  const loadConversation = async () => {
    try {
      console.log('Loading conversation:', conversationId);
      setLoading(true);
      const data = await getConversation(conversationId);
      console.log('Conversation loaded:', data);
      setConversation(data);
      setError('');
    } catch (err: any) {
      console.error('Error loading conversation:', err);
      setError(err.response?.data?.message || 'Failed to load conversation');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageText.trim() || sending) return;

    try {
      setSending(true);
      const newMessage = await sendMessage(conversationId, messageText);
      setMessageText('');
      // No need to reload - WebSocket will update the message list
      // await loadConversation();
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
      await loadConversation();
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
        return <Users className="h-6 w-6 text-blue-600" />;
      case 'ADMIN_BROADCAST':
        return <Lock className="h-6 w-6 text-purple-600" />;
      default:
        return null;
    }
  };

  const getConversationBadge = () => {
    if (conversation?.type === 'ADMIN_BROADCAST') {
      return (
        <span className="px-3 py-1.5 text-xs bg-purple-100 text-purple-700 rounded-full font-semibold">
          📢 Broadcast (Read-only)
        </span>
      );
    }
    if (conversation?.type === 'GROUP_SESSION') {
      return (
        <span className="px-3 py-1.5 text-xs bg-blue-100 text-blue-700 rounded-full flex items-center gap-1 font-semibold">
          <Users className="h-3 w-3" /> {conversation.members.length} members
        </span>
      );
    }
    return null;
  };

  const getTokenWarning = () => {
    if (!conversation?.tokenBalance) return null;

    if (!conversation.tokenBalance.hasTokens) {
      return {
        type: 'exhausted' as const,
        message: '⚠️ Token balance exhausted. You cannot send messages until you purchase more tokens.',
      };
    }

    if (conversation.tokenBalance.balance < 5) {
      return {
        type: 'low' as const,
        message: `🔔 Low token balance! You have ${conversation.tokenBalance.balance} tokens remaining.`,
      };
    }

    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading conversation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6 max-w-md">
          <AlertTriangle className="w-12 h-12 text-red-600 mx-auto mb-3" />
          <p className="text-red-800 text-center font-semibold">{error}</p>
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-500">
          <p className="text-xl font-semibold mb-2">Conversation not found</p>
          <p className="text-sm">This conversation may have been deleted.</p>
        </div>
      </div>
    );
  }

  const tokenWarning = getTokenWarning();
  const canSend = conversation.canPost && conversation.type !== 'ADMIN_BROADCAST';
  const disabledReason = conversation.type === 'ADMIN_BROADCAST' 
    ? 'This is a read-only announcement' 
    : 'Insufficient tokens';

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-gray-50 to-white rounded-xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b-2 border-blue-100 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex-shrink-0 transform hover:rotate-12 transition-transform duration-200">
              {getConversationIcon()}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {conversation.name || (
                  conversation.type === 'DIRECT' ? 'Direct Chat' :
                  conversation.type === 'GROUP_SESSION' ? 'Group Session' :
                  'Announcement'
                )}
              </h2>
              <div className="text-sm text-gray-600 font-medium mt-1">
                {getConversationBadge()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Token warnings */}
      {tokenWarning && (
        <div
          className={`p-4 mx-4 my-3 rounded-xl shadow-sm border-2 ${
            tokenWarning.type === 'exhausted'
              ? 'bg-gradient-to-r from-red-50 to-red-100 border-red-400 text-red-800'
              : 'bg-gradient-to-r from-yellow-50 to-yellow-100 border-yellow-400 text-yellow-800'
          }`}
        >
          <div className="flex items-center space-x-3">
            <AlertTriangle className={`w-6 h-6 ${tokenWarning.type === 'exhausted' ? 'animate-bounce' : ''}`} />
            <span className="text-sm font-bold">{tokenWarning.message}</span>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4" style={{ scrollBehavior: 'smooth' }}>
        {conversation.messages.length === 0 ? (
          <div className="text-center text-gray-400 py-20">
            <Send className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-semibold">No messages yet</p>
            <p className="text-sm mt-2">Start the conversation!</p>
          </div>
        ) : (
          conversation.messages.map((msg: Message) => {
            const isOwnMessage = msg.senderId === user?.id;

            return (
              <div
                key={msg.id}
                className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-4 animate-fade-in`}
              >
                <div className="flex items-start space-x-2 max-w-[75%] group">
                  <div
                    className={`rounded-2xl p-4 shadow-md transition-all duration-200 ${
                      isOwnMessage
                        ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white hover:shadow-lg'
                        : 'bg-white border-2 border-gray-100 text-gray-900 hover:border-blue-200 hover:shadow-lg'
                    }`}
                  >
                    {!isOwnMessage && (
                      <div className="text-xs font-semibold mb-2 opacity-70">
                        {msg.sender.name || msg.sender.email}
                      </div>
                    )}
                    {msg.isDeleted ? (
                      <div className="text-sm text-gray-400 italic flex items-center">
                        <span className="mr-2">🚫</span>
                        Message removed by admin
                      </div>
                    ) : (
                      <div className="text-sm leading-relaxed">{msg.content}</div>
                    )}
                    <div className={`text-xs mt-2 ${isOwnMessage ? 'text-blue-100' : 'text-gray-500'} font-medium`}>
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  {/* Delete button for admins */}
                  {!msg.isDeleted && user?.role === 'ADMIN' && (
                    <button
                      onClick={() => handleDeleteMessage(msg.id)}
                      className="opacity-0 group-hover:opacity-100 ml-2 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all duration-200 transform hover:scale-110"
                      title="Delete message"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t-2 border-blue-100 p-5 shadow-lg">
        <form onSubmit={handleSendMessage} className="flex space-x-3">
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder={canSend ? 'Type your message...' : disabledReason}
            disabled={!canSend || sending}
            className="flex-1 px-5 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500 transition-all text-sm placeholder-gray-400"
            maxLength={2000}
          />
          <button
            type="submit"
            disabled={!canSend || !messageText.trim() || sending}
            className="px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-2 shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95 font-semibold"
          >
            <Send className={`w-5 h-5 ${sending ? 'animate-pulse' : ''}`} />
            <span>{sending ? 'Sending...' : 'Send'}</span>
          </button>
        </form>
        {!canSend && (
          <div className="text-xs text-gray-500 mt-2 text-center">{disabledReason}</div>
        )}
      </div>

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
