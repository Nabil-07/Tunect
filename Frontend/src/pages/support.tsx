import { useEffect, useMemo, useState } from 'react';
import { Bot, Send, User, Users, RefreshCw } from 'lucide-react';
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
import {
  getTokenBalances,
  createRefundRequest,
  createTokenTransferRequest,
  type TutorTokenBalance,
} from '../services/refundService';
import { searchTutors, type Tutor } from '../services/tutorService';
import { useToast } from '../contexts/ToastContext';

type BotMessage = { id: string; from: 'user' | 'bot'; text: string; createdAt: string };

type TabKey = 'ai' | 'support' | 'admin' | 'refunds';

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
  const { showSuccess, showError } = useToast();
  const role = (user?.role || '').toString().toUpperCase();
  const isAdmin = role === 'ADMIN';
  const isStudent = role === 'STUDENT';

  const [tab, setTab] = useState<TabKey>('ai');
  
  // Refund/transfer state
  const [tokenBalances, setTokenBalances] = useState<TutorTokenBalance[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [selectedTutorForRefund, setSelectedTutorForRefund] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundReason, setRefundReason] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>('');
  const [submittingRefund, setSubmittingRefund] = useState(false);
  
  // Transfer state
  const [transferFromTutor, setTransferFromTutor] = useState<string>('');
  const [transferToTutor, setTransferToTutor] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferReason, setTransferReason] = useState<string>('');
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [toTutorSearch, setToTutorSearch] = useState('');
  const [eligibleToTutors, setEligibleToTutors] = useState<Tutor[]>([]);
  const [loadingEligibleTutors, setLoadingEligibleTutors] = useState(false);

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
  const [firstContactTicketId, setFirstContactTicketId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(0);

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

  const loadTokenBalances = async () => {
    if (!isStudent) return;
    setLoadingBalances(true);
    try {
      const balances = await getTokenBalances();
      setTokenBalances(balances);
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to load token balances');
    } finally {
      setLoadingBalances(false);
    }
  };

  useEffect(() => {
    if (tab === 'refunds' && isStudent) {
      loadTokenBalances();
    }
  }, [tab, isStudent]);

  const handleRefundRequest = async () => {
    if (!selectedTutorForRefund || !refundAmount || !purchaseDate) {
      showError('Please fill in all required fields');
      return;
    }

    const purchaseDateObj = new Date(purchaseDate);
    const daysSincePurchase = (Date.now() - purchaseDateObj.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSincePurchase < 7) {
      showError('Refund is only available after 7 days from purchase');
      return;
    }

    setSubmittingRefund(true);
    try {
      await createRefundRequest({
        tutorId: selectedTutorForRefund,
        tokenAmount: Number(refundAmount),
        purchaseDate: purchaseDate,
        reason: refundReason || undefined,
      });
      showSuccess('Refund request submitted successfully. Admin will review it shortly.');
      setSelectedTutorForRefund(null);
      setRefundAmount('');
      setRefundReason('');
      setPurchaseDate('');
      loadTokenBalances();
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to submit refund request');
    } finally {
      setSubmittingRefund(false);
    }
  };

  const handleTransferRequest = async () => {
    if (!transferFromTutor || !transferToTutor || !transferAmount) {
      showError('Please fill in all required fields');
      return;
    }

    if (transferFromTutor === transferToTutor) {
      showError('Cannot transfer tokens to the same tutor');
      return;
    }

    setSubmittingTransfer(true);
    try {
      await createTokenTransferRequest({
        fromTutorId: transferFromTutor,
        toTutorId: transferToTutor,
        tokenAmount: Number(transferAmount),
        reason: transferReason || undefined,
      });
      showSuccess('Transfer request submitted successfully. Admin will review it shortly.');
      setTransferFromTutor('');
      setTransferToTutor('');
      setTransferAmount('');
      setTransferReason('');
      loadTokenBalances();
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to submit transfer request');
    } finally {
      setSubmittingTransfer(false);
    }
  };

  const loadEligibleTutors = async (fromTutorId: string, q?: string) => {
    const fromBalance = tokenBalances.find((b) => b.tutorId === fromTutorId);
    const purchasePricePerToken = Number(fromBalance?.pricePerToken || 0);
    if (!fromTutorId || purchasePricePerToken <= 0) {
      setEligibleToTutors([]);
      return;
    }

    setLoadingEligibleTutors(true);
    try {
      const result = await searchTutors({
        q: q?.trim() || undefined,
        priceMax: purchasePricePerToken,
        page: 1,
        pageSize: 50,
        sort: 'price_asc',
      });

      const filtered = (result.items || []).filter((tutor) => {
        if (!tutor?.id || tutor.id === fromTutorId) return false;
        const hourlyRate = Number(tutor.hourlyRate || 0);
        return hourlyRate > 0 && hourlyRate <= purchasePricePerToken;
      });
      setEligibleToTutors(filtered);
    } catch {
      setEligibleToTutors([]);
      showError('Failed to load eligible tutors for transfer');
    } finally {
      setLoadingEligibleTutors(false);
    }
  };

  useEffect(() => {
    if (!transferFromTutor) {
      setTransferToTutor('');
      setTransferAmount('');
      setToTutorSearch('');
      setEligibleToTutors([]);
      return;
    }

    const selectedBalance = tokenBalances.find((b) => b.tutorId === transferFromTutor);
    setTransferAmount(selectedBalance ? Number(selectedBalance.balance).toFixed(2) : '');
    setTransferToTutor('');
    setToTutorSearch('');
    loadEligibleTutors(transferFromTutor);
  }, [transferFromTutor, tokenBalances]);

  useEffect(() => {
    if (!transferFromTutor) return;
    const timer = setTimeout(() => {
      loadEligibleTutors(transferFromTutor, toTutorSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [toTutorSearch, transferFromTutor]);

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

  useEffect(() => {
    const interval = setInterval(() => setNowTick((v) => v + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!showSupport) return;
    const interval = setInterval(() => {
      if (tab === 'support') {
        loadUserTickets();
        if (selectedTicket?.id) loadTicketMessages(selectedTicket.id);
      }
      if (tab === 'admin' && isAdmin) {
        loadAdminQueues();
        if (selectedTicket?.id) loadTicketMessages(selectedTicket.id);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [showSupport, tab, selectedTicket?.id, isAdmin]);

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
      const isFirst = tickets.length === 0;
      const ticket = await createSupportTicket({
        subject: subject.trim() || undefined,
        message: newTicketMessage.trim(),
      });
      setTickets((prev) => [ticket, ...prev]);
      if (isFirst) setFirstContactTicketId(ticket.id);
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

  const supportWindow = useMemo(() => {
    const now = new Date();
    const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const istStart = new Date(istNow);
    istStart.setHours(10, 0, 0, 0);
    const istEnd = new Date(istNow);
    istEnd.setHours(20, 0, 0, 0);
    const isOpen = istNow >= istStart && istNow <= istEnd;
    const localStart = new Date(istStart);
    const localEnd = new Date(istEnd);
    const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
    return {
      isOpen,
      localStartLabel: timeFmt.format(localStart),
      localEndLabel: timeFmt.format(localEnd),
    };
  }, [nowTick]);

  const isFirstContact = useMemo(() => {
    if (!selectedTicket) return false;
    if (tickets.length !== 1) return false;
    if (firstContactTicketId === selectedTicket.id) return true;
    if (messages.length === 1 && messages[0]?.senderId === user?.id) return true;
    return false;
  }, [selectedTicket, tickets.length, firstContactTicketId, messages, user?.id]);

  let tokenBalancesSection: JSX.Element;
  if (loadingBalances) {
    tokenBalancesSection = <p className="text-slate-500">Loading...</p>;
  } else if (tokenBalances.length === 0) {
    tokenBalancesSection = <p className="text-slate-500">No token balances</p>;
  } else {
    tokenBalancesSection = (
      <div className="space-y-2">
        {tokenBalances.map((balance) => (
          <div key={balance.id} className="border rounded-lg p-3 flex justify-between items-center">
            <div>
              <p className="font-semibold">{balance.tutor.user.name || balance.tutor.user.email}</p>
              <p className="text-sm text-slate-600">Balance: {Number(balance.balance).toFixed(2)} tokens</p>
            </div>
            {Number(balance.balance) > 0 && (
              <button
                onClick={() => {
                  setSelectedTutorForRefund(balance.tutorId);
                  setRefundAmount(balance.balance.toString());
                }}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                Request Refund
              </button>
            )}
          </div>
        ))}
      </div>
    );
  }

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
              {role === 'STUDENT' && (
                <button
                  onClick={() => setTab('refunds')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === 'refunds' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  Refunds & Transfers
                </button>
              )}
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
                      {selectedTicket?.status !== 'RESOLVED' && (
                        <button
                          onClick={handleCloseTicket}
                          className="rounded-lg border px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          Mark resolved
                        </button>
                      )}
                      {selectedTicket?.status === 'RESOLVED' && (
                        <span className="text-xs font-medium text-green-600">✓ Resolved</span>
                      )}
                    </div>
                    <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      Support chat hours: 10:00 AM – 8:00 PM IST
                      {' '}
                      <span className="ml-2 text-slate-500">(Your local time: {supportWindow.localStartLabel} – {supportWindow.localEndLabel})</span>
                      {!supportWindow.isOpen && (
                        <span className="ml-2 text-amber-600">We are currently offline.</span>
                      )}
                    </div>
                    <div className="h-[320px] overflow-y-auto space-y-3 pr-2">
                      {isFirstContact && (
                        <div className="flex justify-start">
                          <div className="max-w-[80%] rounded-2xl px-3 py-2 text-sm bg-slate-100 text-slate-700">
                            Thanks for contacting support team, soon our Support representative will join the chat.
                          </div>
                        </div>
                      )}
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
                        placeholder={selectedTicket?.status === 'RESOLVED' ? 'Ticket is resolved' : 'Type a message...'}
                        disabled={selectedTicket?.status === 'RESOLVED'}
                        className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={selectedTicket?.status === 'RESOLVED'}
                        className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-sm text-white disabled:bg-slate-400"
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

          {tab === 'refunds' && isStudent && (
            <section className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h2 className="text-lg font-semibold text-blue-900 mb-2">Refund & Transfer Requests</h2>
                <p className="text-sm text-blue-700">
                  Request a refund if your tutor hasn't posted availability within 7 days of purchase, 
                  or transfer tokens to another tutor if your current tutor is unavailable.
                </p>
              </div>

              {/* Token Balances */}
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">Your Token Balances</h3>
                  <button
                    onClick={loadTokenBalances}
                    disabled={loadingBalances}
                    className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 inline ${loadingBalances ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                {tokenBalancesSection}
              </div>

              {/* Refund Request Form */}
              {selectedTutorForRefund && (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Request Refund</h3>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="refund-tutor" className="block text-sm font-medium text-slate-700 mb-1">
                        Tutor
                      </label>
                      <p id="refund-tutor" className="text-sm text-slate-600">
                        {tokenBalances.find(b => b.tutorId === selectedTutorForRefund)?.tutor.user.name || 'Unknown'}
                      </p>
                    </div>
                    <div>
                      <label htmlFor="refund-amount" className="block text-sm font-medium text-slate-700 mb-1">
                        Token Amount *
                      </label>
                      <input
                        id="refund-amount"
                        type="number"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                      />
                    </div>
                    <div>
                      <label htmlFor="refund-purchase-date" className="block text-sm font-medium text-slate-700 mb-1">
                        Purchase Date *
                      </label>
                      <input
                        id="refund-purchase-date"
                        type="date"
                        value={purchaseDate}
                        onChange={(e) => setPurchaseDate(e.target.value)}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        max={new Date().toISOString().split('T')[0]}
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Refund available only if 7+ days have passed and tutor hasn't posted slots
                      </p>
                    </div>
                    <div>
                      <label htmlFor="refund-reason" className="block text-sm font-medium text-slate-700 mb-1">
                        Reason (optional)
                      </label>
                      <textarea
                        id="refund-reason"
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                        className="w-full rounded-lg border px-3 py-2 text-sm min-h-[80px]"
                        placeholder="Why are you requesting a refund?"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleRefundRequest}
                        disabled={submittingRefund || !refundAmount || !purchaseDate}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                      >
                        {submittingRefund ? 'Submitting...' : 'Submit Refund Request'}
                      </button>
                      <button
                        onClick={() => {
                          setSelectedTutorForRefund(null);
                          setRefundAmount('');
                          setRefundReason('');
                          setPurchaseDate('');
                        }}
                        className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm hover:bg-slate-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Token Transfer Form */}
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Transfer Tokens to Another Tutor</h3>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="transfer-from-tutor" className="block text-sm font-medium text-slate-700 mb-1">
                      From Tutor *
                    </label>
                    <select
                      id="transfer-from-tutor"
                      value={transferFromTutor}
                      onChange={(e) => {
                        setTransferFromTutor(e.target.value);
                      }}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    >
                      <option value="">Select tutor...</option>
                      {tokenBalances.filter(b => Number(b.balance) > 0).map((balance) => (
                        <option key={balance.id} value={balance.tutorId}>
                          {balance.tutor.user.name || balance.tutor.user.email} ({Number(balance.balance).toFixed(2)} tokens)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="transfer-to-tutor-search" className="block text-sm font-medium text-slate-700 mb-1">
                      To Tutor *
                    </label>
                    <input
                      id="transfer-to-tutor-search"
                      type="text"
                      value={toTutorSearch}
                      onChange={(e) => setToTutorSearch(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm mb-2"
                      placeholder="Search tutor by name, subject, language..."
                      disabled={!transferFromTutor}
                    />
                    <select
                      id="transfer-to-tutor"
                      value={transferToTutor}
                      onChange={(e) => setTransferToTutor(e.target.value)}
                      disabled={!transferFromTutor || loadingEligibleTutors}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    >
                      <option value="">
                        {loadingEligibleTutors ? 'Loading tutors...' : 'Select tutor...'}
                      </option>
                      {eligibleToTutors.map((tutor) => (
                        <option key={tutor.id} value={tutor.id}>
                          {tutor.name || tutor.email} (₹{Number(tutor.hourlyRate || 0).toFixed(0)}/token)
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">
                      Only tutors at or below your original purchase rate are shown.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="transfer-amount" className="block text-sm font-medium text-slate-700 mb-1">
                      Token Amount *
                    </label>
                    <input
                      id="transfer-amount"
                      type="number"
                      value={transferAmount}
                      readOnly
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      max={tokenBalances.find(b => b.tutorId === transferFromTutor)?.balance || 0}
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Full available balance is transferred to switch tutor assignment cleanly.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="transfer-reason" className="block text-sm font-medium text-slate-700 mb-1">
                      Reason (optional)
                    </label>
                    <textarea
                      id="transfer-reason"
                      value={transferReason}
                      onChange={(e) => setTransferReason(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm min-h-[80px]"
                      placeholder="Why are you transferring tokens?"
                    />
                  </div>
                  <button
                    onClick={handleTransferRequest}
                    disabled={submittingTransfer || !transferFromTutor || !transferToTutor || !transferAmount}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    {submittingTransfer ? 'Submitting...' : 'Submit Transfer Request'}
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
