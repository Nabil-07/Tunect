// src/pages/student/chat.tsx
import { useParams } from 'react-router-dom';
import ChatList from '../../components/chat/ChatList';
import { ChatWindow } from '../../components/chat/ChatWindow-Enhanced';
import AdminMessagesView from '../../components/chat/AdminMessagesView';

export default function StudentChat() {
  const { conversationId } = useParams<{ conversationId?: string }>();

  return (
    <div className="h-[calc(100vh-200px)]" data-testid="student-chat-page">
      <h2 className="text-2xl font-bold mb-4">Messages</h2>
      
      {conversationId === 'admin-messages' ? (
        <div className="h-[calc(100%-60px)]" data-testid="student-chat-admin-messages">
          <AdminMessagesView />
        </div>
      ) : conversationId ? (
        // Show chat window for specific conversation
        <div className="h-[calc(100%-60px)]" data-testid="student-chat-window">
          <ChatWindow conversationId={conversationId} />
        </div>
      ) : (
        // Show conversation list
        <div data-testid="student-chat-list-container">
          <p className="text-slate-600 mb-4">Chat with tutors you've booked sessions with.</p>
          <ChatList />
        </div>
      )}
    </div>
  );
}