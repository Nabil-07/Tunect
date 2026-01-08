// Frontend/src/components/chat/ChatList.tsx
import { useState, useEffect } from 'react';
import { MessageSquare, Users, Lock } from 'lucide-react';
import { listConversations } from '../../services/chatService';
import type { Conversation } from '../../services/chatService';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSocket } from '../../hooks/useSocket';

export default function ChatList() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { on, off, isConnected } = useSocket();
  
  // Determine the base path based on current route
  const getBasePath = () => {
    if (location.pathname.startsWith('/tutor')) return '/tutor/chat';
    if (location.pathname.startsWith('/student')) return '/student/chat';
    return '/chat'; // fallback
  };

  useEffect(() => {
    loadConversations();
  }, []);

  // Live refresh when new messages arrive via websocket
  useEffect(() => {
    const handler = () => loadConversations();
    on('conversationUpdate', handler);
    return () => off('conversationUpdate', handler);
  }, [on, off, isConnected]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listConversations();
      setConversations(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  const getConversationIcon = (type: string) => {
    switch (type) {
      case 'GROUP_SESSION':
        return <Users className="h-5 w-5 text-blue-600" />;
      case 'ADMIN_BROADCAST':
        return <Lock className="h-5 w-5 text-purple-600" />;
      default:
        return <MessageSquare className="h-5 w-5 text-gray-600" />;
    }
  };

  const getConversationLabel = (conv: Conversation) => {
    // If we have a name (the other participant), show it
    if (conv.name) {
      return conv.name;
    }
    
    // Fallback to generic labels
    switch (conv.type) {
      case 'DIRECT':
        return 'Direct Chat';
      case 'GROUP_SESSION':
        return `Group Session (${conv.memberCount} members)`;
      case 'ADMIN_BROADCAST':
        return 'Announcement';
      default:
        return 'Chat';
    }
  };

  const formatLastMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading conversations...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <MessageSquare className="h-12 w-12 mb-4" />
        <p>No conversations yet</p>
        <p className="text-sm mt-2">Book a session to start chatting with a tutor</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conversations.map((conv) => (
        <div
          key={conv.id}
          onClick={() => navigate(`${getBasePath()}/${conv.id}`)}
          className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-1">{getConversationIcon(conv.type)}</div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-semibold text-gray-900 truncate">{getConversationLabel(conv)}</h4>
                {conv.lastMessage && (
                  <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                    {formatLastMessageTime(conv.lastMessage.createdAt)}
                  </span>
                )}
              </div>
              
              {conv.lastMessage && (
                <p className="text-sm text-gray-600 truncate">
                  {conv.lastMessage.isDeleted
                    ? 'Message removed by admin'
                    : conv.lastMessage.content}
                </p>
              )}
              
              {!conv.isActive && (
                <span className="inline-block mt-2 text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                  Archived
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
