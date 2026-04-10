// src/pages/admin/messages.tsx
import { useParams, useNavigate } from 'react-router-dom';
import ChatList from '../../components/chat/ChatList';
import { ChatWindow } from '../../components/chat/ChatWindow';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  sendSubjectBroadcast,
  sendAdminPrivateMessage,
  fetchTutors,
  fetchBroadcastHistory,
  fetchPrivateMessageHistory,
  fetchDistinctSubjects,
  type TutorSummary,
} from '../../services/adminService';

type CommTab = 'broadcast' | 'private';

export default function AdminMessages() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();

  /* ── Broadcast state ── */
  const [broadcastMode, setBroadcastMode] = useState<'subject' | 'all'>('all');
  const [subject, setSubject] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState<string | null>(null);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);

  /* ── Private-message state ── */
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

  /* ── Message history state ── */
  interface BroadcastRecord { id: string; subject: string | null; message: string; recipientCount: number; sender: { name: string | null; email: string }; createdAt: string }
  interface PrivateMessageRecord { id: string; message: string; sender: { name: string | null; email: string }; recipient: { name: string | null; email: string }; createdAt: string }
  const [broadcastHistory, setBroadcastHistory] = useState<BroadcastRecord[]>([]);
  const [privateHistory, setPrivateHistory] = useState<PrivateMessageRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  /* ── Load subjects on mount ── */
  useEffect(() => {
    const loadSubjects = async () => {
      setSubjectsLoading(true);
      try {
        const data = await fetchDistinctSubjects();
        setSubjects(data);
        if (data.length > 0) setSubject(data[0]);
      } catch { setSubjects([]); }
      finally { setSubjectsLoading(false); }
    };
    loadSubjects();
  }, []);

  /* ── Load message history ── */
  useEffect(() => {
    const loadHistory = async () => {
      setHistoryLoading(true);
      try {
        const [bRes, pRes] = await Promise.all([
          fetchBroadcastHistory(1, 50),
          fetchPrivateMessageHistory(1, 50),
        ]);
        setBroadcastHistory(bRes.items ?? []);
        setPrivateHistory(pRes.items ?? []);
      } catch { /* silently fail */ }
      finally { setHistoryLoading(false); }
    };
    loadHistory();
  }, []);

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
    if (broadcastMode === 'subject' && !subject) return;
    setBroadcastSending(true);
    setBroadcastStatus(null);
    setBroadcastError(null);
    try {
      const result = await sendSubjectBroadcast(
        broadcastMode === 'subject' ? subject : '',
        broadcastMsg.trim(),
      );
      setBroadcastStatus(
        broadcastMode === 'subject'
          ? `Broadcast sent to ${result.recipientCount} "${subject}" tutor(s)`
          : `Announcement sent to ${result.recipientCount} tutor(s)`,
      );
      setBroadcastMsg('');
      // Refresh history
      const bRes = await fetchBroadcastHistory(1, 50);
      setBroadcastHistory(bRes.items ?? []);
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
      await sendAdminPrivateMessage(selectedTutor.user.id, privateMsg.trim());
      setPrivateMsg('');
      setSelectedTutor(null);
      setTutorSearch('');
      setTutorResults([]);
      setPrivateStatus('Private message sent successfully.');
      // Refresh history
      const pRes = await fetchPrivateMessageHistory(1, 50);
      setPrivateHistory(pRes.items ?? []);
    } catch (err: any) {
      setPrivateError(err?.response?.data?.message || err?.message || 'Failed to send message');
    } finally {
      setPrivateSending(false);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  /* ── Render ── */
  if (conversationId) {
    return (
      <div className="h-[calc(100vh-200px)]">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate('/admin/messages')}
            className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            data-testid="admin-messages-back-button"
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
    <div className="min-h-[calc(100vh-200px)]" data-testid="admin-messages-page">
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
          data-testid="admin-messages-broadcast-tab"
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
          data-testid="admin-messages-private-tab"
        >
          ✉️ Private Message
        </button>
      </div>

      {/* ── Broadcast / Announcement panel ── */}
      {activeTab === 'broadcast' && (
        <>
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
                data-testid="admin-messages-broadcast-all-button"
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
                data-testid="admin-messages-broadcast-subject-button"
              >
                By Subject
              </button>
            </div>

            <form className="flex flex-col gap-3" onSubmit={handleBroadcast} data-testid="admin-messages-broadcast-form">
              {broadcastMode === 'subject' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Select Subject</label>
                  {subjectsLoading ? (
                    <div className="text-sm text-slate-400">Loading subjects…</div>
                  ) : subjects.length === 0 ? (
                    <div className="text-sm text-slate-400">No subjects available</div>
                  ) : (
                    <select
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none bg-white"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      data-testid="admin-messages-subject-select"
                    >
                      {subjects.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              <textarea
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[100px] focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-y"
                value={broadcastMsg}
                onChange={(e) => setBroadcastMsg(e.target.value)}
                placeholder="Write your announcement…"
                data-testid="admin-messages-broadcast-textarea"
              />
              <div className="flex items-center justify-between">
                <div>
                  {broadcastStatus && <span className="text-xs text-emerald-700" data-testid="admin-messages-broadcast-success">{broadcastStatus}</span>}
                  {broadcastError && <span className="text-xs text-rose-600" data-testid="admin-messages-broadcast-error">{broadcastError}</span>}
                </div>
                <button
                  type="submit"
                  disabled={!broadcastMsg.trim() || broadcastSending || (broadcastMode === 'subject' && !subject)}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                  data-testid="admin-messages-broadcast-send-button"
                >
                  {broadcastSending
                    ? 'Sending…'
                    : broadcastMode === 'all'
                      ? 'Send to All Tutors'
                      : `Send to "${subject}" Tutors`}
                </button>
              </div>
            </form>
          </div>

          {/* Broadcast history */}
          <div className="mb-6 border border-slate-200 rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold mb-3">Broadcast History</h3>
            {historyLoading ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : broadcastHistory.length === 0 ? (
              <p className="text-sm text-slate-400">No broadcasts sent yet</p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {broadcastHistory.map((b) => (
                  <div key={b.id} className="border border-slate-100 rounded-lg p-3 bg-slate-50">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-indigo-600">
                          {b.subject ? `📢 ${b.subject}` : '📢 All Tutors'}
                        </span>
                        <span className="text-xs text-slate-400">
                          → {b.recipientCount} recipient{b.recipientCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">{formatDate(b.createdAt)}</span>
                    </div>
                    <p className="text-sm text-slate-700">{b.message}</p>
                    <p className="text-xs text-slate-400 mt-1">Sent by {b.sender.name || b.sender.email}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Private message panel ── */}
      {activeTab === 'private' && (
        <>
          <div className="mb-6 border border-slate-200 rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-1">Private Message to Tutor</h3>
              <p className="text-sm text-slate-500">
                Send a direct private message to an individual tutor. They will receive it as a notification.
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
                    data-testid="admin-messages-clear-tutor-button"
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
                    data-testid="admin-messages-tutor-search-input"
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
                          data-testid={`admin-messages-tutor-result-${t.id}`}
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

            <form className="flex flex-col gap-3" onSubmit={handlePrivateMessage} data-testid="admin-messages-private-form">
              <textarea
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[100px] focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-y"
                value={privateMsg}
                onChange={(e) => setPrivateMsg(e.target.value)}
                placeholder="Write your private message…"
                disabled={!selectedTutor}
                data-testid="admin-messages-private-textarea"
              />
              <div className="flex items-center justify-between">
                <div>
                  {privateStatus && <span className="text-xs text-emerald-700" data-testid="admin-messages-private-success">{privateStatus}</span>}
                  {privateError && <span className="text-xs text-rose-600" data-testid="admin-messages-private-error">{privateError}</span>}
                </div>
                <button
                  type="submit"
                  disabled={!selectedTutor || !privateMsg.trim() || privateSending}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                  data-testid="admin-messages-private-send-button"
                >
                  {privateSending ? 'Sending…' : 'Send Private Message'}
                </button>
              </div>
            </form>
          </div>

          {/* Private message history */}
          <div className="mb-6 border border-slate-200 rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold mb-3">Private Message History</h3>
            {historyLoading ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : privateHistory.length === 0 ? (
              <p className="text-sm text-slate-400">No private messages sent yet</p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {privateHistory.map((m) => (
                  <div key={m.id} className="border border-slate-100 rounded-lg p-3 bg-slate-50">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-indigo-600">
                          ✉️ To: {m.recipient.name || m.recipient.email}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">{formatDate(m.createdAt)}</span>
                    </div>
                    <p className="text-sm text-slate-700">{m.message}</p>
                    <p className="text-xs text-slate-400 mt-1">Sent by {m.sender.name || m.sender.email}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Conversation list ── */}
      <div>
        <p className="text-slate-600 mb-4">
          View and manage all conversations. You can create announcements or private messages above.
        </p>
        <ChatList />
      </div>
    </div>
  );
}