// Frontend/src/components/chat/ChatWindow.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send,
  Users,
  Lock,
  AlertTriangle,
  Trash2,
  Paperclip,
  X,
  FileText,
  FileSpreadsheet,
  File,
  Download,
  MessageSquare,
  MessageCircleOff,
} from 'lucide-react';
import {
  getConversation,
  sendMessage,
  sendFileMessage,
  deleteMessage,
  markThreadRead,
} from '../../services/chatService';
import type { ConversationDetail, Message, MessageAttachment } from '../../services/chatService';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../hooks/useSocket';
import Modal from '../Modal';

// ─── constants ────────────────────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx', '.xls', '.xlsx'];
const MAX_FILE_SIZE_MB = 20;

// ─── helpers ───────────────────────────────────────────────────────────────────
function isImageMime(mime: string) {
  return mime.startsWith('image/');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildStrikesLine(strikes: number, maxStrikes: number, remaining: number | undefined): string {
  const remainingNote =
    remaining === undefined ? '' : `${remaining} attempt(s) left before messaging is blocked.`;
  return `Strikes: ${strikes}/${maxStrikes}. ${remainingNote}`.trimEnd();
}

function mergeNewMessage(
  prev: ConversationDetail | null,
  message: Message,
  convId: string,
): ConversationDetail | null {
  if (!prev || message.conversationId !== convId) return prev;
  if (prev.messages.some((m) => m.id === message.id)) return prev;
  return { ...prev, messages: [...prev.messages, message] };
}

function formatDateLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function getInitials(name: string): string {
  return (name || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ─── avatar ───────────────────────────────────────────────────────────────────
const AVATAR_PALETTE = [
  'bg-blue-500',
  'bg-violet-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-pink-500',
  'bg-indigo-500',
];

function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const color = AVATAR_PALETTE[(name.charCodeAt(0) || 0) % AVATAR_PALETTE.length];
  const sz = size === 'md' ? 'h-9 w-9 text-sm' : 'h-7 w-7 text-xs';
  return (
    <div
      className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 shadow-sm`}
    >
      {getInitials(name)}
    </div>
  );
}

// ─── file-type icon ────────────────────────────────────────────────────────────
function FileIcon({ mime, className }: { mime: string; className?: string }) {
  if (mime.includes('spreadsheet') || mime.includes('excel'))
    return <FileSpreadsheet className={className} />;
  if (mime.includes('pdf') || mime.includes('word') || mime.includes('document'))
    return <FileText className={className} />;
  return <File className={className} />;
}

// ─── date separator ────────────────────────────────────────────────────────────
function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px bg-gray-100" />
      <span className="text-[11px] font-semibold text-gray-400 bg-white px-3 py-0.5 rounded-full border border-gray-100 flex-shrink-0 tracking-wide uppercase">
        {label}
      </span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

// ─── pending attachment strip ──────────────────────────────────────────────────
interface PendingFile {
  file: File;
  previewUrl: string | null;
}

function PendingAttachmentStrip({
  pending,
  onRemove,
  uploadPct,
}: {
  pending: PendingFile;
  onRemove: () => void;
  uploadPct: number | null;
}) {
  const isImg = isImageMime(pending.file.type);
  return (
    <div className="flex items-center gap-3 px-3 py-2 mb-2 bg-indigo-50 border border-indigo-200 rounded-2xl">
      <div className="w-10 h-10 flex-shrink-0 rounded-xl overflow-hidden bg-white border border-indigo-100 flex items-center justify-center">
        {isImg && pending.previewUrl ? (
          <img src={pending.previewUrl} alt="preview" className="w-full h-full object-cover" />
        ) : (
          <FileIcon mime={pending.file.type} className="h-5 w-5 text-indigo-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-indigo-900 truncate">{pending.file.name}</p>
        <p className="text-xs text-indigo-500">{formatBytes(pending.file.size)}</p>
        {uploadPct !== null && (
          <div className="mt-1.5 h-1.5 bg-indigo-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-200"
              style={{ width: `${uploadPct}%` }}
            />
          </div>
        )}
      </div>
      {uploadPct === null && (
        <button
          onClick={onRemove}
          className="flex-shrink-0 p-1.5 rounded-full hover:bg-indigo-200 text-indigo-300 hover:text-indigo-700 transition-colors"
          aria-label="Remove attachment"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ─── attachment bubble inside a message ───────────────────────────────────────
function AttachmentBubble({ att, isMine }: { att: MessageAttachment; isMine: boolean }) {
  const isImg = isImageMime(att.fileType);

  if (isImg) {
    return (
      <a
        href={att.fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block mt-2 rounded-2xl overflow-hidden max-w-[14rem] sm:max-w-xs hover:opacity-90 transition-opacity shadow-sm"
      >
        <img
          src={att.fileUrl}
          alt={att.fileName}
          className="w-full object-cover rounded-2xl"
          loading="lazy"
        />
        <p className={`text-[10px] mt-0.5 truncate px-0.5 ${isMine ? 'text-indigo-200' : 'text-gray-400'}`}>
          {att.fileName}
        </p>
      </a>
    );
  }

  return (
    <a
      href={att.fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 mt-2 px-3 py-2.5 rounded-xl border hover:opacity-80 transition-opacity max-w-[14rem] sm:max-w-xs ${
        isMine ? 'bg-white/10 border-white/20' : 'bg-white border-gray-200 shadow-sm'
      }`}
    >
      <FileIcon
        mime={att.fileType}
        className={`h-5 w-5 flex-shrink-0 ${isMine ? 'text-indigo-200' : 'text-indigo-400'}`}
      />
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${isMine ? 'text-white' : 'text-gray-800'}`}>
          {att.fileName}
        </p>
        <p className={`text-[10px] ${isMine ? 'text-indigo-200' : 'text-gray-500'}`}>
          {formatBytes(att.fileSize)}
        </p>
      </div>
      <Download
        className={`h-3.5 w-3.5 flex-shrink-0 ${isMine ? 'text-indigo-200' : 'text-gray-400'}`}
      />
    </a>
  );
}

// ─── main component ────────────────────────────────────────────────────────────
interface ChatWindowProps {
  conversationId: string;
}

export function ChatWindow({ conversationId }: Readonly<ChatWindowProps>) {
  const { user } = useAuth();
  const { isConnected, on, off, emit } = useSocket({ namespace: '/chat' });

  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [hardBlocked, setHardBlocked] = useState(false);
  const [guardModal, setGuardModal] = useState<{ open: boolean; title: string; body: string }>({
    open: false,
    title: '',
    body: '',
  });
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [otherUserOnline, setOtherUserOnline] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    loadConversation();
  }, [conversationId]);

  useEffect(() => {
    if (!user?.id) return;
    if (localStorage.getItem(`piiBlock:${user.id}`) === '1') setHardBlocked(true);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const strikes = user.piiStrikes ?? 0;
    const max = user.piiMaxStrikes ?? 3;
    if (!user.messagingBlocked && strikes < max) {
      setHardBlocked(false);
      localStorage.removeItem(`piiBlock:${user.id}`);
    }
  }, [user]);

  useEffect(() => {
    scrollToBottom();
  }, [conversation?.messages]);

  // WebSocket: join / leave room
  useEffect(() => {
    if (isConnected && conversationId) {
      emit('joinConversation', { conversationId });
      return () => {
        emit('leaveConversation', { conversationId });
      };
    }
  }, [isConnected, conversationId, emit]);

  // WebSocket: receive new messages
  useEffect(() => {
    const handleNewMessage = (message: Message) => {
      setConversation((prev) => mergeNewMessage(prev, message, conversationId));
    };
    on('newMessage', handleNewMessage);
    return () => {
      off('newMessage', handleNewMessage);
    };
  }, [conversationId, on, off]);

  // WebSocket: track the other user's presence
  useEffect(() => {
    const handlePresence = (data: { userId: string; conversationId: string; online: boolean }) => {
      if (data.conversationId !== conversationId) return;
      if (data.userId === user?.id) return; // ignore own presence
      setOtherUserOnline(data.online);
    };
    on('userPresence', handlePresence);
    return () => {
      off('userPresence', handlePresence);
    };
  }, [conversationId, user?.id, on, off]);

  // Reset other-user presence when switching conversations
  useEffect(() => {
    setOtherUserOnline(false);
  }, [conversationId]);

  // Clipboard paste: grab image from Ctrl+V / ⌘+V
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const f = item.getAsFile();
          if (f) attachFile(f);
          break;
        }
      }
    };
    el.addEventListener('paste', handlePaste);
    return () => el.removeEventListener('paste', handlePaste);
  }, []);

  // ─── data loading ──────────────────────────────────────────────────────────
  const loadConversation = async () => {
    try {
      setLoading(true);
      const data = await getConversation(conversationId);
      setConversation(data);
      setError('');
      markThreadRead(conversationId)
        .then(() => globalThis.dispatchEvent(new Event('messages:updated')))
        .catch(() => {});
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load conversation');
    } finally {
      setLoading(false);
    }
  };

  // ─── file attachment ───────────────────────────────────────────────────────
  const attachFile = useCallback(
    (file: File) => {
      setFileError(null);
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        setFileError(`Unsupported file. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
        return;
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setFileError(`File too large. Max ${MAX_FILE_SIZE_MB} MB.`);
        return;
      }
      if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
      const previewUrl = isImageMime(file.type) ? URL.createObjectURL(file) : null;
      setPendingFile({ file, previewUrl });
      textareaRef.current?.focus();
    },
    [pendingFile],
  );

  const clearPendingFile = () => {
    if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
    setPendingFile(null);
    setUploadPct(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── send ──────────────────────────────────────────────────────────────────
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const hasText = messageText.trim().length > 0;
    const hasFile = pendingFile !== null;
    if ((!hasText && !hasFile) || sending) return;

    setSending(true);
    try {
      let newMessage: Message;

      if (hasFile) {
        setUploadPct(0);
        newMessage = await sendFileMessage(
          conversationId,
          pendingFile!.file,
          messageText.trim() || undefined,
          (pct) => setUploadPct(pct),
        );
        clearPendingFile();
        // Always merge attachment messages since socket may not carry attachment data
        setConversation((prev) => mergeNewMessage(prev, newMessage, conversationId));
      } else {
        newMessage = await sendMessage(conversationId, messageText.trim());
        if (!isConnected) {
          setConversation((prev) => mergeNewMessage(prev, newMessage, conversationId));
        }
      }

      setMessageText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      globalThis.dispatchEvent(new Event('messages:updated'));
    } catch (err: any) {
      handleSendError(err?.response?.data || {});
    } finally {
      setSending(false);
      setUploadPct(null);
    }
  };

  const handleSendError = (data: any) => {
    const apiMessage = (data?.message as string) || 'Message blocked.';
    const strikes = data?.strikes as number | undefined;
    const maxStrikes = data?.maxStrikes as number | undefined;
    const remaining = data?.remaining as number | undefined;
    const isPiiBlock =
      apiMessage?.toLowerCase().includes('personal contact') ||
      data?.code?.toString().includes('PII');

    if (isPiiBlock) {
      const roleTone =
        user?.role === 'TUTOR'
          ? 'Please keep chats on-platform to protect students.'
          : 'For your safety, keep your contact details private until the platform allows sharing.';
      const strikesInfo =
        strikes !== undefined && maxStrikes !== undefined
          ? buildStrikesLine(strikes, maxStrikes, remaining)
          : '';
      setGuardModal({
        open: true,
        title:
          strikes && maxStrikes && strikes >= maxStrikes
            ? 'Account blocked'
            : 'Message blocked for safety',
        body: `${apiMessage}\n${strikesInfo}\n\n${roleTone}`.trim(),
      });
      if (strikes && maxStrikes && strikes >= maxStrikes && user?.id) {
        setHardBlocked(true);
        localStorage.setItem(`piiBlock:${user.id}`, '1');
      }
    } else {
      setGuardModal({
        open: true,
        title: 'Unable to send',
        body: apiMessage || 'Something went wrong. Please try again.',
      });
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Delete this message? It will show as "Message removed by admin".')) return;
    try {
      await deleteMessage(messageId);
      await loadConversation();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete message');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // ─── derived values ────────────────────────────────────────────────────────
  const headerName = (() => {
    if (!conversation) return 'Chat';
    if (conversation.type === 'ADMIN_BROADCAST') return 'Announcement';
    if (conversation.type === 'GROUP_SESSION') return 'Group Session';
    return conversation.name || 'Chat';
  })();

  const headerSubtitle = (() => {
    if (conversation?.type === 'GROUP_SESSION')
      return `${conversation.members.length} member${conversation.members.length !== 1 ? 's' : ''}`;
    if (conversation?.type === 'ADMIN_BROADCAST') return 'Read-only broadcast';
    return null;
  })();

  const getTokenWarning = () => {
    if (user?.role !== 'STUDENT' || !conversation?.tokenBalance) return null;
    if (!conversation.tokenBalance.hasTokens) {
      // No tokens but chat is allowed because of future bookings
      if (conversation.canPost && conversation.lastBookingEndTime) {
        const endDate = new Date(conversation.lastBookingEndTime);
        const formatted = endDate.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        return {
          type: 'exhausted' as const,
          message: `You have no tokens remaining. Your last booked class ends on ${formatted}. Please purchase tokens to continue your learning and chat beyond that.`,
        };
      }
      return {
        type: 'exhausted' as const,
        message: 'Token balance exhausted. Purchase more tokens to continue messaging.',
      };
    }
    if (conversation.tokenBalance.balance <= 2)
      return {
        type: 'low' as const,
        message: `Low balance: ${conversation.tokenBalance.balance} token${conversation.tokenBalance.balance !== 1 ? 's' : ''} remaining.`,
      };
    return null;
  };

  // Build flat list with date separator entries interspersed
  const buildMessageList = () => {
    const msgs = conversation?.messages ?? [];
    const items: Array<
      { kind: 'sep'; label: string } | { kind: 'msg'; msg: Message }
    > = [];
    let lastDate = '';
    for (const msg of msgs) {
      const dateStr = new Date(msg.createdAt).toDateString();
      if (dateStr !== lastDate) {
        items.push({ kind: 'sep', label: formatDateLabel(new Date(msg.createdAt)) });
        lastDate = dateStr;
      }
      items.push({ kind: 'msg', msg });
    }
    return items;
  };

  // ─── render guards ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 rounded-2xl">
        <div className="text-center space-y-3">
          <div className="relative mx-auto w-12 h-12">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-100" />
            <div className="absolute inset-0 rounded-full border-4 border-t-indigo-500 animate-spin" />
          </div>
          <p className="text-sm text-gray-500 font-medium">Loading conversation…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 rounded-2xl">
        <div className="text-center space-y-3 p-8 max-w-sm">
          <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <p className="text-base font-semibold text-gray-800">Failed to load</p>
          <p className="text-sm text-gray-500">{error}</p>
          <button
            onClick={loadConversation}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 rounded-2xl">
        <p className="text-gray-400 text-sm">Conversation not found</p>
      </div>
    );
  }

  const tokenWarning = getTokenWarning();
  const canSend =
    conversation.canPost && conversation.type !== 'ADMIN_BROADCAST' && !hardBlocked;
  const disabledReason =
    conversation.type === 'ADMIN_BROADCAST'
      ? 'This is a read-only announcement'
      : hardBlocked
      ? 'Messaging disabled'
      : 'Insufficient tokens';

  const messageList = buildMessageList();

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full bg-gray-50 rounded-2xl overflow-hidden shadow-sm border border-gray-200/80"
      data-testid="chat-window"
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3.5 flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Avatar / icon blob */}
          <div
            className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              conversation.type === 'ADMIN_BROADCAST'
                ? 'bg-purple-400/30'
                : conversation.type === 'GROUP_SESSION'
                ? 'bg-blue-400/30'
                : 'bg-white/20'
            }`}
          >
            {conversation.type === 'GROUP_SESSION' ? (
              <Users className="h-5 w-5 text-white" />
            ) : conversation.type === 'ADMIN_BROADCAST' ? (
              <Lock className="h-5 w-5 text-white" />
            ) : (
              <span className="text-sm font-bold text-white">{getInitials(headerName)}</span>
            )}
          </div>

          {/* Name + subtitle */}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-white truncate leading-tight">{headerName}</h2>
            {headerSubtitle && (
              <p className="text-xs text-indigo-200 leading-tight mt-0.5">{headerSubtitle}</p>
            )}
          </div>

          {/* Other-user online pill — only for direct chats */}
          {conversation?.type === 'DIRECT' && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${
                otherUserOnline ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/10 text-white/50'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  otherUserOnline ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400'
                }`}
              />
              {otherUserOnline ? 'Online' : 'Offline'}
            </div>
          )}
        </div>
      </div>

      {/* ── Token warning ───────────────────────────────────────────────────── */}
      {tokenWarning && (
        <div
          className={`mx-3 mt-3 px-4 py-2.5 rounded-xl border flex items-center gap-2.5 flex-shrink-0 text-sm font-medium ${
            tokenWarning.type === 'exhausted'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{tokenWarning.message}</span>
        </div>
      )}

      {/* ── Messages ────────────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto px-3 sm:px-5 py-4"
        style={{ scrollBehavior: 'smooth' }}
        data-testid="chat-window-messages"
      >
        {conversation.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16 gap-3">
            <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-indigo-400" />
            </div>
            <p className="text-base font-semibold text-gray-600">No messages yet</p>
            <p className="text-sm text-gray-400">Be the first to say hello!</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {messageList.map((item, idx) => {
              if (item.kind === 'sep') {
                return <DateSeparator key={`sep-${idx}`} label={item.label} />;
              }

              const { msg } = item;
              const isOwn = msg.senderId === user?.id;
              const hasAttachments = msg.attachments && msg.attachments.length > 0;
              const hasText = !msg.isDeleted && msg.content?.trim();

              return (
                <div
                  key={msg.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group items-end gap-2 py-0.5`}
                >
                  {/* Other person avatar */}
                  {!isOwn && (
                    <div className="flex-shrink-0 mb-1">
                      <Avatar name={msg.sender.name || msg.sender.email || '?'} size="sm" />
                    </div>
                  )}

                  <div
                    className={`flex flex-col max-w-[75%] sm:max-w-[65%] ${
                      isOwn ? 'items-end' : 'items-start'
                    }`}
                  >
                    {/* Sender name for group / non-own */}
                    {!isOwn && (
                      <span className="text-[11px] text-gray-500 font-medium mb-1 ml-1">
                        {msg.sender.name || msg.sender.email}
                      </span>
                    )}

                    {/* Bubble */}
                    <div
                      className={`relative rounded-2xl px-4 py-2.5 shadow-sm transition-shadow hover:shadow-md ${
                        msg.isDeleted
                          ? 'bg-gray-200 text-gray-400 italic rounded-bl-sm'
                          : isOwn
                          ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-br-sm'
                          : 'bg-white border border-gray-100 text-gray-900 rounded-bl-sm'
                      }`}
                      style={{ wordBreak: 'break-word' }}
                    >
                      {msg.isDeleted ? (
                        <span className="flex items-center gap-1.5 text-sm">
                          <MessageCircleOff className="h-3.5 w-3.5 flex-shrink-0" />
                          Message removed by admin
                        </span>
                      ) : (
                        <>
                          {hasText && (
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">
                              {msg.content}
                            </p>
                          )}
                          {hasAttachments &&
                            msg.attachments!.map((att) => (
                              <AttachmentBubble key={att.id} att={att} isMine={isOwn} />
                            ))}
                        </>
                      )}
                    </div>

                    {/* Timestamp row (+ admin delete) */}
                    <div
                      className={`flex items-center gap-1.5 mt-0.5 mx-1 ${
                        isOwn ? 'flex-row-reverse' : 'flex-row'
                      }`}
                    >
                      <span className="text-[10px] text-gray-400">
                        {new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {!msg.isDeleted && user?.role === 'ADMIN' && (
                        <button
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-red-500 transition-all duration-150"
                          title="Delete message (admin)"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input area ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-t border-gray-100 px-3 sm:px-4 py-3 flex-shrink-0">
        {canSend ? (
          <form onSubmit={handleSendMessage} noValidate>
            {/* File error banner */}
            {fileError && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="flex-1 leading-tight">{fileError}</span>
                <button type="button" onClick={() => setFileError(null)} aria-label="Dismiss">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Pending attachment preview */}
            {pendingFile && (
              <PendingAttachmentStrip
                pending={pendingFile}
                onRemove={clearPendingFile}
                uploadPct={uploadPct}
              />
            )}

            {/* Input row */}
            <div className="flex items-end gap-2">
              {/* Attach button */}
              <button
                type="button"
                disabled={sending}
                onClick={() => fileInputRef.current?.click()}
                title={`Attach file (${ALLOWED_EXTENSIONS.join(', ')}, max ${MAX_FILE_SIZE_MB} MB)\nPaste images with Ctrl+V / ⌘+V`}
                className="flex-shrink-0 mb-0.5 p-2 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Attach file"
              >
                <Paperclip className="h-5 w-5" />
              </button>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_EXTENSIONS.join(',')}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) attachFile(f);
                  e.target.value = '';
                }}
              />

              {/* Auto-grow textarea */}
              <textarea
                ref={textareaRef}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
                }}
                placeholder={pendingFile ? 'Add a caption (optional)…' : 'Type a message…'}
                disabled={sending}
                rows={1}
                maxLength={2000}
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent focus:bg-white disabled:bg-gray-100 text-sm placeholder-gray-400 resize-none overflow-y-auto transition-all"
                style={{ minHeight: '2.75rem', maxHeight: '8rem' }}
                data-testid="chat-window-message-input"
              />

              {/* Send button */}
              <button
                type="submit"
                disabled={(!messageText.trim() && !pendingFile) || sending}
                className="flex-shrink-0 mb-0.5 h-10 w-10 bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-xl hover:from-indigo-600 hover:to-violet-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg flex items-center justify-center"
                data-testid="chat-window-send-btn"
                aria-label="Send"
              >
                <Send className={`w-4 h-4 ${sending ? 'animate-pulse' : ''}`} />
              </button>
            </div>

            {/* Keyboard hint */}
            <p className="hidden sm:block text-[10px] text-gray-400 mt-1.5 ml-11">
              Enter to send · Shift+Enter for new line · Ctrl+V / ⌘+V to paste image
            </p>
          </form>
        ) : (
          <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-400">
            <Lock className="h-4 w-4 flex-shrink-0" />
            <span>{disabledReason}</span>
          </div>
        )}
      </div>

      {/* ── PII guard modal ─────────────────────────────────────────────────── */}
      <Modal
        isOpen={guardModal.open}
        onClose={() => setGuardModal({ open: false, title: '', body: '' })}
        title={guardModal.title || 'Message blocked'}
        size="md"
      >
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                {guardModal.body || 'Please remove contact details and try again.'}
              </p>
              <ul className="text-sm text-slate-500 list-disc ml-4 space-y-0.5">
                <li>Do not share phone numbers, emails, or social links.</li>
                <li>Keep conversations on the platform for safety.</li>
                <li>Contact support if you need help.</li>
              </ul>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={() => setGuardModal({ open: false, title: '', body: '' })}
              className="px-5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-sm font-semibold"
            >
              Got it
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Hard block overlay ──────────────────────────────────────────────── */}
      {hardBlocked && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 border border-red-100">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Account blocked</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              Your account is blocked due to repeated personal-info violations. This block is
              permanent until an admin reviews your account.
            </p>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              {user?.role === 'TUTOR'
                ? 'As per policy, any pending earnings not yet disbursed will not be returned.'
                : 'All purchased tokens are canceled and you will not be able to attend classes.'}
            </p>
            <ul className="text-sm text-slate-500 list-disc ml-4 space-y-1 mb-5">
              <li>Do not share phone numbers, emails, or social links.</li>
              <li>Keep conversations on the platform for safety.</li>
              <li>
                Contact us at{' '}
                <a
                  className="text-indigo-600 hover:underline"
                  href="mailto:support@tunectnow.com"
                >
                  support@tunectnow.com
                </a>
              </li>
            </ul>
            <div className="px-4 py-3 bg-red-50 rounded-xl border border-red-200">
              <p className="text-sm text-red-700 font-semibold text-center">
                Messaging is disabled until an admin unblocks your account.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
