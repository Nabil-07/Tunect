// Frontend/src/components/chat/AdminMessagesView.tsx
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Megaphone, Mail, ShieldCheck } from 'lucide-react';
import { fetchMyAdminMessages, markAllThreadsRead, type AdminMessage } from '../../services/chatService';

export default function AdminMessagesView() {
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const getBackPath = () => {
    if (location.pathname.startsWith('/tutor')) return '/tutor/chat';
    if (location.pathname.startsWith('/student')) return '/student/chat';
    return '/';
  };

  useEffect(() => {
    markAllThreadsRead()
      .then(() => globalThis.dispatchEvent(new Event('messages:updated')))
      .catch(() => {});

    fetchMyAdminMessages()
      .then(setMessages)
      .catch((err) => setError(err?.response?.data?.message || 'Failed to load admin messages'))
      .finally(() => setLoading(false));
  }, []);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex flex-col h-full" data-testid="admin-messages-view">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b mb-4">
        <button
          onClick={() => navigate(getBackPath())}
          className="p-1 rounded hover:bg-gray-100 transition-colors"
          data-testid="admin-messages-view-back-btn"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <ShieldCheck className="h-6 w-6 text-purple-600" />
        <div>
          <h3 className="font-semibold text-gray-900">Admin</h3>
          <p className="text-xs text-gray-500">Messages from the Tunect team</p>
        </div>
      </div>

      {/* Body */}
      {loading && (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          Loading messages…
        </div>
      )}

      {error && (
        <div className="flex-1 flex items-center justify-center text-red-500">{error}</div>
      )}

      {!loading && !error && messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
          <ShieldCheck className="h-10 w-10" />
          <p>No admin messages yet</p>
        </div>
      )}

      {!loading && !error && messages.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-3" data-testid="admin-messages-view-list">
          {messages.map((msg) => (
            <div key={msg.id} className="bg-white border rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {msg.type === 'BROADCAST' ? (
                    <Megaphone className="h-4 w-4 text-purple-500" />
                  ) : (
                    <Mail className="h-4 w-4 text-blue-500" />
                  )}
                  <span className="text-xs font-medium text-gray-700">
                    {msg.type === 'BROADCAST'
                      ? msg.subject
                        ? `Announcement · ${msg.subject}`
                        : 'Announcement · All tutors'
                      : 'Private message'}
                  </span>
                </div>
                <span className="text-xs text-gray-400">{formatDate(msg.createdAt)}</span>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{msg.message}</p>
              <p className="mt-2 text-xs text-gray-400 font-medium">— Admin</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
