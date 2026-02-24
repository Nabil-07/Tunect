// src/pages/admin/messages.tsx
import { useParams, useNavigate } from 'react-router-dom';
import ChatList from '../../components/chat/ChatList';
import { ChatWindow } from '../../components/chat/ChatWindow-Enhanced';
import { useState, useEffect, useCallback, useRef } from 'react';
import { sendSubjectBroadcast, fetchTutors, type TutorSummary } from '../../services/adminService';
import { createBroadcast } from '../../services/chatService';

type CommTab = 'broadcast' | 'private';

export default function AdminMessages() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();

  /* ── Broadcast state ── */
  const [broadcastMode, setBroadcastMode] = useState<'subject' | 'all'>('all');
  const [subject, setSubject] = useState('Physics');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState<string | null>(null);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);

  /* ── Private‑message state ── */
  const [tutorSearch, setTutorSearch] = useState('');
  const [tutorResults, setTutorResults] = useState<TutorSummary[]>([]);
  const [selectedTutor, setSelectedTutor] = useState<TutorSummary | null>(null);
  const [privateMsg, setPrivateMsg] = useState('');
  const [privateSending, setPrivateSending] = useState(false);
  const [privateStatus, setPrivateStatus] = useState<string | null>(null);
  const [privateError, setPrivateError] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Tab state ── */
  const [activeTab, setActiveTab] = useState<CommTab>('broadcast');

  /* ── Tutor search (debounced) ── */
  const searchTutors = useCallback(async (q: string) => {
    if (!q.trim()) { setTutorResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await fetchTutors({ page: 1, pageSize: 20, q: q.trim() });
      setTutorResults(res.items ?? []);
    } catch { setTutorResults([]); }
    finally { setSearchLoading(false); }
  }, []);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchTutors(tutorSearch), 350);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [tutorSearch, searchTutors]);

  /* ── Broadcast handler ── */
  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMsg.trim()) return;
    setBroadcastSending(true);
    setBroadcastStatus(null);
    setBroadcastError(null);
    try {
      if (broadcastMode === 'subject') {
        await sendSubjectBroadcast(subject, broadcastMsg.trim());
        setBroadcastStatus(`Broadcast sent to "${subject}" tutors`);
      } else {
        // All tutors
        await sendSubjectBroadcast('', broadcastMsg.trim());
        setBroadcastStatus('Announcement sent to all tutors');
      }
      setBroadcastMsg('');
    } catch (err: any) {
      setBroadcastError(err?.response?.data?.message || err?.message || 'Failed to send broadcast');
    } finally {
      setBroadcastSending(false);
    }
  };

  /* ── Private message handler ── */
  const handlePrivateMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTutor || !privateMsg.trim()) return;
    setPrivateSending(true);
    setPrivateStatus(null);
    setPrivateError(null);
    try {
      const convo = await createBroadcast({
        name: `Admin → ${selectedTutor.user.name || selectedTutor.user.email}`,
        memberIds: [selectedTutor.user.id],
        initialMessage: privateMsg.trim(),
      });
      setPrivateMsg('');
      setSelectedTutor(null);
      setTutorSearch('');
      setTutorResults([]);
      setPrivateStatus('Message sent — opening conversation…');
      // Navigate to the newly created conversation
      setTimeout(() => navigate(`/admin/messages/${convo.id}`), 600);
    } catch (err: any) {
      setPrivateError(err?.response?.data?.message || err?.message || 'Failed to send message');
    } finally {
      setPrivateSending(false);
    }
  };

  /* ── Render ── */
  if (conversationId) {
    return (
      <div className="h-[calc(100vh-200px)]">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate('/admin/messages')}
            className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Messages
          </button>
        </div>
        <div className="h-[calc(100%-40px)]">
          <ChatWindow conversationId={conversationId} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-200px)]">
      <h2 className="text-2xl font-bold mb-4">Admin Communication</h2>

      {/* ── Tab selector ── */}
      <div className="flex gap-1 mb-5 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('broadcast')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'broadcast'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          📢 Announcements
        </button>
        <button
          onClick={() => setActiveTab('private')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'private'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          ✉️ Private Message
        </button>
      </div>

      {/* ── Broadcast / Announcement panel ── */}
      {activeTab === 'broadcast' && (
        <div className="mb-6 border border-slate-200 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-1">Send Announcement</h3>
            <p className="text-sm text-slate-500">
              Broadcast a read‑only announcement to tutors. Choose to target all tutors or a specific subject group.
            </p>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setBroadcastMode('all')}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                broadcastMode === 'all'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              All Tutors
            </button>
            <button
              type="button"
              onClick={() => setBroadcastMode('subject')}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                broadcastMode === 'subject'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              By Subject
            </button>
          </div>

          <form className="flex flex-col gap-3" onSubmit={handleBroadcast}>
            {broadcastMode === 'subject' && (
              <input
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject (e.g., Physics)"
              />
            )}
            <textarea
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[100px] focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-y"
              value={broadcastMsg}
              onChange={(e) => setBroadcastMsg(e.target.value)}
              placeholder="Write your announcement…"
            />
            <div className="flex items-center justify-between">
              <div>
                {broadcastStatus && <span className="text-xs text-emerald-700">{broadcastStatus}</span>}
                {broadcastError && <span className="text-xs text-rose-600">{broadcastError}</span>}
              </div>
              <button
                type="submit"
                disabled={!broadcastMsg.trim() || broadcastSending}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-indigo-700 transition-colors"
              >
                {(() => {
                  if (broadcastSending) return 'Sending…';
                  if (broadcastMode === 'all') return 'Send to All Tutors';
                  return `Send to "${subject}" Tutors`;
                })()}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Private message panel ── */}
      {activeTab === 'private' && (
        <div className="mb-6 border border-slate-200 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-1">Private Message to Tutor</h3>
            <p className="text-sm text-slate-500">
              Send a direct private message to an individual tutor. A new conversation thread will be created.
            </p>
          </div>

          {/* Tutor selector */}
          <div className="mb-4">
            {selectedTutor ? (
              <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-indigo-200 flex items-center justify-center text-indigo-700 font-semibold text-sm">
                  {(selectedTutor.user.name || selectedTutor.user.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {selectedTutor.user.name || 'Unnamed Tutor'}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{selectedTutor.user.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedTutor(null); setTutorSearch(''); }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                  value={tutorSearch}
                  onChange={(e) => setTutorSearch(e.target.value)}
                  placeholder="Search tutor by name or email…"
                />
                {searchLoading && (
                  <div className="absolute right-3 top-2.5 text-xs text-slate-400">Searching…</div>
                )}
                {tutorResults.length > 0 && tutorSearch.trim() && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {tutorResults.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedTutor(t);
                          setTutorSearch('');
                          setTutorResults([]);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors"
                      >
                        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold text-xs">
                          {(t.user.name || t.user.email)[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{t.user.name || 'Unnamed'}</div>
                          <div className="text-xs text-slate-400 truncate">{t.user.email}</div>
                        </div>
                        {t.subjects.length > 0 && (
                          <div className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                            {t.subjects.slice(0, 2).join(', ')}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {tutorSearch.trim() && !searchLoading && tutorResults.length === 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg px-4 py-3 text-sm text-slate-500">
                    No tutors found
                  </div>
                )}
              </div>
            )}
          </div>

          <form className="flex flex-col gap-3" onSubmit={handlePrivateMessage}>
            <textarea
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[100px] focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-y"
              value={privateMsg}
              onChange={(e) => setPrivateMsg(e.target.value)}
              placeholder="Write your private message…"
              disabled={!selectedTutor}
            />
            <div className="flex items-center justify-between">
              <div>
                {privateStatus && <span className="text-xs text-emerald-700">{privateStatus}</span>}
                {privateError && <span className="text-xs text-rose-600">{privateError}</span>}
              </div>
              <button
                type="submit"
                disabled={!selectedTutor || !privateMsg.trim() || privateSending}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-indigo-700 transition-colors"
              >
                {privateSending ? 'Sending…' : 'Send Private Message'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Conversation list ── */}
      <div>
        <p className="text-slate-600 mb-4">
          View and manage all conversations. You can delete messages and create announcements or private messages above.
        </p>
        <ChatList />
      </div>
    </div>
  );
}