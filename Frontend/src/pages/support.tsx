import { useEffect, useMemo, useState } from 'react';
import { Bot, Send, User, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  addSupportMessage,
  assignSupportTicket,
  createSupportTicket,
  getSupportTicket,
  listAssignedSupportTickets,
  listMySupportTickets,
  listUnassignedSupportTickets,
  type SupportMessage,
  type SupportTicket,
  updateSupportTicketStatus,
} from '../services/supportService';

type BotMessage = { id: string; from: 'user' | 'bot'; text: string; createdAt: string };

type TabKey = 'ai' | 'support' | 'admin';

const botReplies: Array<{ keywords: string[]; reply: string }> = [
  { keywords: ['refund', 'cancel'], reply: 'Refunds depend on booking status. For confirmed sessions, you can cancel from Bookings and view the refund policy in-app.' },
  { keywords: ['reschedule', 'schedule'], reply: 'You can reschedule from your Bookings page. If a slot is available, pick a new time and confirm.' },
  { keywords: ['payout', 'earnings'], reply: 'Payouts happen on the 1st, 7th, 14th, and 21st. Check the Earnings page for your next payout date.' },
  { keywords: ['verification', 'kyc'], reply: 'Complete KYC from the Tutor Profile page. Verification status updates within 1–2 business days.' },
  { keywords: ['support', 'help'], reply: 'If you need more help, open a support ticket and our team will respond here.' },
];

function getBotReply(text: string) {
  const q = text.toLowerCase();
  const hit = botReplies.find((r) => r.keywords.some((k) => q.includes(k)));
  return hit?.reply || 'Thanks for the message. Please share more details, or open a support ticket for a human response.';
}

export default function SupportPage() {
  const { user } = useAuth();
  const role = (user?.role || '').toString().toUpperCase();
  const isAdmin = role === 'ADMIN';

  const [tab, setTab] = useState<TabKey>('ai');

  // AI bot state
  const [botInput, setBotInput] = useState('');
  const [botMessages, setBotMessages] = useState<BotMessage[]>([
    {
      id: 'welcome',
      from: 'bot',
      text: 'Hi! I can help with quick questions about bookings, payouts, and account setup. Ask me anything.',
      createdAt: new Date().toISOString(),
    },
  ]);

  // Support tickets state
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [assignedTickets, setAssignedTickets] = useState<SupportTicket[]>([]);
  const [unassignedTickets, setUnassignedTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [ticketMessage, setTicketMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [newTicketMessage, setNewTicketMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const showSupport = !!user;

  const loadUserTickets = async () => {
    if (!user) return;
    const data = await listMySupportTickets();
    setTickets(data);
  };

  const loadAdminQueues = async () => {
    if (!isAdmin) return;
    const [unassigned, assigned] = await Promise.all([
      listUnassignedSupportTickets(),
      listAssignedSupportTickets(),
    ]);
    setUnassignedTickets(unassigned);
    setAssignedTickets(assigned);
  };

  const loadTicketMessages = async (ticketId: string) => {
    const ticket = await getSupportTicket(ticketId);
    setSelectedTicket(ticket);
    setMessages(ticket.messages || []);
  };

  useEffect(() => {
    if (!showSupport) return;
    loadUserTickets();
    loadAdminQueues();
  }, [showSupport, isAdmin]);

  const handleBotSend = () => {
    if (!botInput.trim()) return;
    const userMsg: BotMessage = {
      id: `u-${Date.now()}`,
      from: 'user',
      text: botInput.trim(),
      createdAt: new Date().toISOString(),
    };
    const botMsg: BotMessage = {
      id: `b-${Date.now() + 1}`,
      from: 'bot',
      text: getBotReply(botInput.trim()),
      createdAt: new Date().toISOString(),
    };
    setBotMessages((prev) => [...prev, userMsg, botMsg]);
    setBotInput('');
  };

  const handleCreateTicket = async () => {
    if (!newTicketMessage.trim()) return;
    setLoading(true);
    try {
      const ticket = await createSupportTicket({
        subject: subject.trim() || undefined,
        message: newTicketMessage.trim(),
      });
      setTickets((prev) => [ticket, ...prev]);
      setSubject('');
      setNewTicketMessage('');
      await loadTicketMessages(ticket.id);
      setTab('support');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedTicket || !ticketMessage.trim()) return;
    const msg = await addSupportMessage(selectedTicket.id, ticketMessage.trim());
    setMessages((prev) => [...prev, msg]);
    setTicketMessage('');
  };

  const handleAssignToMe = async (ticketId: string) => {
    await assignSupportTicket(ticketId);
    await loadAdminQueues();
    await loadTicketMessages(ticketId);
    setTab('admin');
  };

  const handleCloseTicket = async () => {
    if (!selectedTicket) return;
    await updateSupportTicketStatus(selectedTicket.id, 'RESOLVED');
    await loadUserTickets();
    await loadAdminQueues();
    const ticket = await getSupportTicket(selectedTicket.id);
    setSelectedTicket(ticket);
  };

  const ticketLabel = (t: SupportTicket) => `#${t.ticketNumber} ${t.subject || 'Support request'}`;

  const quickTopics = useMemo(() => [
    'How do I reschedule a session?',
    'When is my next payout?',
    'How do refunds work?',
    'How to complete KYC?',
  ], []);

  return (
    <main className="bg-slate-50/60 py-6">
      <div className="container mx-auto px-4">
        <div className="mx-auto w-full max-w-6xl rounded-2xl border bg-white p-4 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Support</h1>
              <p className="text-sm text-slate-600">Get help from the chatbot or chat with our support team.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setTab('ai')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === 'ai' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
              >
                Chatbot
              </button>
              <button
                onClick={() => setTab('support')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === 'support' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
              >
                Support Chat
              </button>
              {isAdmin && (
                <button
                  onClick={() => setTab('admin')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === 'admin' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  Admin Queue
                </button>
              )}
            </div>
          </div>

          {!showSupport && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-700">
              Please sign in to open a support ticket or chat with the team.
            </div>
          )}

          {tab === 'ai' && (
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-2xl border bg-white shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-700">
                  <Bot className="h-4 w-4" /> Support Bot
                </div>
                <div className="h-[320px] overflow-y-auto space-y-3 pr-2">
                  {botMessages.map((m) => (
                    <div key={m.id} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.from === 'user' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
                        {m.text}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={botInput}
                    onChange={(e) => setBotInput(e.target.value)}
                    placeholder="Ask a quick question..."
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={handleBotSend}
                    className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-sm text-white"
                  >
                    <Send className="h-4 w-4" /> Send
                  </button>
                </div>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-700 mb-2">Popular questions</div>
                <div className="space-y-2">
                  {quickTopics.map((q) => (
                    <button
                      key={q}
                      onClick={() => setBotInput(q)}
                      className="w-full text-left rounded-lg border bg-white px-3 py-2 text-xs text-slate-600 hover:bg-slate-100"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {tab === 'support' && showSupport && (
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-2xl border bg-white shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-slate-700">Your tickets</div>
                  <button
                    onClick={handleCreateTicket}
                    disabled={!newTicketMessage.trim() || loading}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                  >
                    New ticket
                  </button>
                </div>
                <div className="space-y-2 mb-3">
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject (optional)"
                    className="w-full rounded-lg border px-3 py-2 text-xs"
                  />
                  <textarea
                    value={newTicketMessage}
                    onChange={(e) => setNewTicketMessage(e.target.value)}
                    placeholder="Describe your issue..."
                    className="w-full rounded-lg border px-3 py-2 text-xs min-h-[90px]"
                  />
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {tickets.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => loadTicketMessages(t.id)}
                      className={`w-full text-left rounded-lg border px-3 py-2 text-xs ${selectedTicket?.id === t.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}
                    >
                      <div className="font-semibold">{ticketLabel(t)}</div>
                      <div className="text-[10px] opacity-70">{t.status} • {new Date(t.lastMessageAt).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2 rounded-2xl border bg-white shadow-sm p-4">
                {selectedTicket ? (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-semibold text-slate-700">{ticketLabel(selectedTicket)}</div>
                      <button
                        onClick={handleCloseTicket}
                        className="rounded-lg border px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Mark resolved
                      </button>
                    </div>
                    <div className="h-[320px] overflow-y-auto space-y-3 pr-2">
                      {messages.map((m) => {
                        const isMe = m.senderId === user?.id;
                        return (
                          <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${isMe ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
                              {m.message}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={ticketMessage}
                        onChange={(e) => setTicketMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                      <button
                        onClick={handleSendMessage}
                        className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-sm text-white"
                      >
                        <Send className="h-4 w-4" /> Send
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-slate-500">Select a ticket to view messages.</div>
                )}
              </div>
            </section>
          )}

          {tab === 'admin' && isAdmin && (
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-2xl border bg-white shadow-sm p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                  <Users className="h-4 w-4" /> Unassigned tickets
                </div>
                <div className="space-y-2 max-h-[360px] overflow-y-auto">
                  {unassignedTickets.map((t) => (
                    <div key={t.id} className="rounded-lg border px-3 py-2 text-xs">
                      <div className="font-semibold">{ticketLabel(t)}</div>
                      <div className="text-[10px] text-slate-500">{t.user?.name || t.user?.email} • {new Date(t.lastMessageAt).toLocaleString()}</div>
                      <button
                        onClick={() => handleAssignToMe(t.id)}
                        className="mt-2 rounded-lg bg-slate-900 px-3 py-1 text-xs text-white"
                      >
                        Assign to me
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border bg-white shadow-sm p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                  <User className="h-4 w-4" /> Assigned to me
                </div>
                <div className="space-y-2 max-h-[360px] overflow-y-auto">
                  {assignedTickets.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => loadTicketMessages(t.id)}
                      className={`w-full text-left rounded-lg border px-3 py-2 text-xs ${selectedTicket?.id === t.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}
                    >
                      <div className="font-semibold">{ticketLabel(t)}</div>
                      <div className="text-[10px] opacity-70">{t.user?.name || t.user?.email}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border bg-white shadow-sm p-4">
                <div className="text-sm font-semibold text-slate-700 mb-3">
                  Conversation
                </div>
                {selectedTicket ? (
                  <>
                    <div className="text-xs text-slate-500 mb-2">{ticketLabel(selectedTicket)}</div>
                    <div className="h-[300px] overflow-y-auto space-y-3 pr-2">
                      {messages.map((m) => (
                        <div key={m.id} className={`flex ${m.sender?.role === 'ADMIN' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.sender?.role === 'ADMIN' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
                            {m.message}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={ticketMessage}
                        onChange={(e) => setTicketMessage(e.target.value)}
                        placeholder="Reply to user..."
                        className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                      <button
                        onClick={handleSendMessage}
                        className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-sm text-white"
                      >
                        <Send className="h-4 w-4" /> Send
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-slate-500">Pick a ticket to respond.</div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
