// src/pages/student/chat.tsx
import { useParams } from 'react-router-dom';
import ChatList from '../../components/chat/ChatList';
import { ChatWindow } from '../../components/chat/ChatWindow-Enhanced';

export default function StudentChat() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  
  console.log('StudentChat - conversationId:', conversationId);

  return (
    <div className="h-[calc(100vh-200px)]">
      <h2 className="text-2xl font-bold mb-4">Messages</h2>
      
      {conversationId ? (
        // Show chat window for specific conversation
        <div className="h-[calc(100%-60px)]">
          <ChatWindow conversationId={conversationId} />
        </div>
      ) : (
        // Show conversation list
        <div>
          <p className="text-slate-600 mb-4">Chat with tutors you've booked sessions with.</p>
          <ChatList />
        </div>
      )}
    </div>
  );
}