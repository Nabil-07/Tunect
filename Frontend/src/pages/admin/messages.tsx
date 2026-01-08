// src/pages/admin/messages.tsx
import { useParams } from 'react-router-dom';
import ChatList from '../../components/chat/ChatList';
import { ChatWindow } from '../../components/chat/ChatWindow-Enhanced';
import { useState } from 'react';
import { sendSubjectBroadcast } from '../../services/adminService';

export default function AdminMessages() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [subject, setSubject] = useState('Physics');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setStatus(null);
    setError(null);
    try {
      await sendSubjectBroadcast(subject, message.trim());
      setMessage('');
      setStatus('Broadcast sent');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to send broadcast');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-[calc(100vh-200px)]">
      <h2 className="text-2xl font-bold mb-4">Admin Messages</h2>
      
      {/* Subject broadcast (admin-only send) */}
      {!conversationId && (
        <div className="mb-6 border border-slate-200 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-lg font-semibold">Subject broadcast</div>
              <div className="text-sm text-slate-600">Automatically includes tutors tagged with the subject. Tutors are read-only.</div>
            </div>
          </div>
          <form className="flex flex-col gap-3" onSubmit={handleBroadcast}>
            <div className="flex flex-col md:flex-row gap-3">
              <input
                className="border rounded-lg px-3 py-2 text-sm flex-1"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject (e.g., Physics)"
              />
              <button
                type="submit"
                disabled={!message.trim() || sending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send to tutors'}
              </button>
            </div>
            <textarea
              className="border rounded-lg px-3 py-2 text-sm min-h-[80px]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Announcement message (only admin can post)"
            />
              {status && <div className="text-xs text-emerald-700">{status}</div>}
              {error && <div className="text-xs text-rose-600">{error}</div>}
          </form>
        </div>
      )}

      {conversationId ? (
        <div className="h-[calc(100%-60px)]">
          <ChatWindow conversationId={conversationId} />
        </div>
      ) : (
        <div>
          <p className="text-slate-600 mb-4">View and manage all conversations. You can delete messages and create broadcast announcements.</p>
          <ChatList />
        </div>
      )}
    </div>
  );
}