// src/pages/tutor/chat.tsx
import { useParams } from 'react-router-dom';
import ChatList from '../../components/chat/ChatList';
import { ChatWindow } from '../../components/chat/ChatWindow';
import AdminMessagesView from '../../components/chat/AdminMessagesView';

export default function TutorChat() {
  const { conversationId } = useParams<{ conversationId?: string }>();

  return (
    <div className="h-[calc(100vh-200px)]" data-testid="tutor-chat-page">
      <h2 className="text-2xl font-bold mb-4">Messages</h2>
      
      {conversationId === 'admin-messages' ? (
        <div className="h-[calc(100%-60px)]" data-testid="tutor-chat-admin-messages">
          <AdminMessagesView />
        </div>
      ) : conversationId ? (
        // Show chat window for specific conversation
        <div className="h-[calc(100%-60px)]" data-testid="tutor-chat-window">
          <ChatWindow conversationId={conversationId} />
        </div>
      ) : (
        // Show conversation list
        <div data-testid="tutor-chat-thread-list">
          <p className="text-slate-600 mb-4">Chat with students you're teaching.</p>
          <ChatList />
        </div>
      )}
    </div>
  );
}
