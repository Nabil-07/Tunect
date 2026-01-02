// src/pages/admin/messages.tsx
import { useParams } from 'react-router-dom';
import ChatList from '../../components/chat/ChatList';
import { ChatWindow } from '../../components/chat/ChatWindow-Enhanced';

export default function AdminMessages() {
  const { conversationId } = useParams<{ conversationId?: string }>();

  return (
    <div className="h-[calc(100vh-200px)]">
      <h2 className="text-2xl font-bold mb-4">Admin Messages</h2>
      
      {conversationId ? (
        // Show chat window for specific conversation
        <div className="h-[calc(100%-60px)]">
          <ChatWindow conversationId={conversationId} />
        </div>
      ) : (
        // Show conversation list
        <div>
          <p className="text-slate-600 mb-4">View and manage all conversations. You can delete messages and create broadcast announcements.</p>
          <ChatList />
        </div>
      )}
    </div>
  );
}