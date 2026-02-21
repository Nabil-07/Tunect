// src/pages/student/session-notes.tsx
import { useEffect, useState } from 'react';
import { FileText, BookOpen, Clock, User, Star, Download, ExternalLink, PenTool } from 'lucide-react';
import apiClient from '../../services/apiClient';

interface SessionNote {
  id: string;
  content: string;
  summary?: string;
  topics: string[];
  homework?: string;
  studentPerformance?: number;
  aiGenerated: boolean;
  approved: boolean;
  createdAt: string;
  author: {
    id: string;
    name: string;
  };
  booking: {
    id: string;
    startTime: string;
    subject?: string;
  };
}

interface SharedMaterial {
  id: string;
  title: string;
  description?: string;
  fileUrl: string;
  fileType: string;
  subject?: string;
  tutorName?: string;
  sharedAt?: string;
}

interface WhiteboardNote {
  id: string;
  bookingId: string;
  noteName: string;
  sharedAt: string;
  s3Url?: string;
  counterpartName: string;
  classDate?: string;
}

export default function SessionNotes() {
  const [notes, setNotes] = useState<SessionNote[]>([]);
  const [sharedMaterials, setSharedMaterials] = useState<SharedMaterial[]>([]);
  const [whiteboardNotes, setWhiteboardNotes] = useState<WhiteboardNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'recent'>('all');

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      const [notesRes, materialsRes, wbRes] = await Promise.all([
        apiClient.get('/session-notes/my-notes'),
        apiClient.get('/study-materials/shared-with-me'),
        apiClient.get('/whiteboard/my-shared-notes').catch(() => ({ data: [] })),
      ]);

      setNotes(notesRes.data || []);
      setSharedMaterials(materialsRes.data || []);
      setWhiteboardNotes(wbRes.data || []);
    } catch (error) {
      console.error('Failed to load session notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenMaterial = async (material: SharedMaterial) => {
    const resolveMaterialUrl = async (rawUrl: string) => {
      const value = String(rawUrl || '').trim();
      if (!value) {
        return value;
      }

      const resolveOpenRouteHost = (urlValue: string) => {
        try {
          const parsed = new URL(urlValue, globalThis.window?.location?.origin || 'http://localhost');
          if (!parsed.pathname.startsWith('/uploads/open/')) {
            return parsed.toString();
          }

          const configuredApiBase = String(import.meta.env.VITE_API_URL || '').trim();
          const isLocalRuntime =
            typeof window !== 'undefined' &&
            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
          const fallbackApiBase = isLocalRuntime ? 'http://localhost:3000' : parsed.origin;
          const effectiveApiBase = configuredApiBase || fallbackApiBase;
          const apiBase = new URL(effectiveApiBase);

          if (parsed.origin !== apiBase.origin) {
            return `${apiBase.origin}${parsed.pathname}${parsed.search}`;
          }

          return parsed.toString();
        } catch {
          return urlValue;
        }
      };

      const normalizedUrl = resolveOpenRouteHost(value);
      if (!normalizedUrl.includes('/uploads/open/')) {
        return normalizedUrl;
      }

      const decodeKeyFromOpenUrl = (urlValue: string) => {
        try {
          const parsed = new URL(urlValue, globalThis.window?.location?.origin || 'http://localhost');
          const marker = '/uploads/open/';
          const markerIndex = parsed.pathname.indexOf(marker);
          if (markerIndex < 0) {
            return '';
          }

          const token = parsed.pathname.slice(markerIndex + marker.length);
          const payloadPart = token.split('.')[0] || '';
          if (!payloadPart) {
            return '';
          }

          const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
          const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
          const payloadText = atob(padded);
          const payload = JSON.parse(payloadText) as { key?: string };
          return String(payload?.key || '');
        } catch {
          return '';
        }
      };

      const key = decodeKeyFromOpenUrl(normalizedUrl);
      if (!key) {
        return normalizedUrl;
      }

      try {
        const presignRes = await apiClient.post('/uploads/presign-get', {
          key,
          expiresIn: 600,
        });

        const downloadUrl = String(
          presignRes?.data?.downloadUrl || presignRes?.data?.url || '',
        ).trim();

        return downloadUrl || normalizedUrl;
      } catch {
        return normalizedUrl;
      }
    };

    try {
      await apiClient.post(`/study-materials/${material.id}/download`);
    } catch (error) {
      console.error('Failed to track material download', error);
    }

    const finalUrl = await resolveMaterialUrl(material.fileUrl);
    if (!finalUrl) {
      return;
    }

    window.open(finalUrl, '_blank', 'noopener,noreferrer');
  };

  const filteredNotes = filter === 'recent'
    ? notes.slice(0, 10)
    : notes;

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 rounded-2xl bg-slate-200"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
          <FileText className="h-8 w-8 text-ocean-600" />
          Session Notes
        </h1>

        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-xl font-medium transition ${
              filter === 'all'
                ? 'bg-ocean-700 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All Notes
          </button>
          <button
            onClick={() => setFilter('recent')}
            className={`px-4 py-2 rounded-xl font-medium transition ${
              filter === 'recent'
                ? 'bg-ocean-700 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Recent
          </button>
        </div>
      </div>

      {sharedMaterials.length > 0 && (
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Shared Study Materials</h2>
          <div className="space-y-3">
            {sharedMaterials.map((material) => (
              <div
                key={material.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900">{material.title}</h3>
                  {material.description && (
                    <p className="text-sm text-slate-600 mt-1">{material.description}</p>
                  )}
                  <div className="mt-2 text-xs text-slate-500 flex flex-wrap gap-2">
                    {material.subject && (
                      <span className="rounded-full bg-white px-2 py-0.5 border border-slate-200">
                        {material.subject}
                      </span>
                    )}
                    <span className="rounded-full bg-white px-2 py-0.5 border border-slate-200">
                      {(material.fileType || 'FILE').toUpperCase()}
                    </span>
                    {material.tutorName && (
                      <span>Tutor: {material.tutorName}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleOpenMaterial(material)}
                    className="inline-flex items-center gap-1 rounded-lg bg-ocean-700 px-3 py-2 text-xs font-semibold text-white hover:bg-ocean-800"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View
                  </button>
                  <button
                    onClick={() => handleOpenMaterial(material)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Whiteboard Shared Notes */}
      {whiteboardNotes.length > 0 && (
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <PenTool className="h-5 w-5 text-ocean-600" />
            Whiteboard Notes
          </h2>
          <div className="space-y-3">
            {whiteboardNotes.map((wb) => (
              <div
                key={wb.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900">{wb.noteName}</h3>
                  <div className="mt-2 text-xs text-slate-500 flex flex-wrap gap-3">
                    <span className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      {wb.counterpartName}
                    </span>
                    {wb.classDate && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(wb.classDate).toLocaleDateString()}
                      </span>
                    )}
                    <span className="rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 font-medium">
                      Whiteboard
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {wb.s3Url && (
                    <a
                      href={wb.s3Url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-ocean-700 px-3 py-2 text-xs font-semibold text-white hover:bg-ocean-800"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </a>
                  )}
                  <a
                    href={`/class/${wb.bookingId}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View in Class
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes List */}
      {filteredNotes.length === 0 ? (
        <div className="rounded-2xl border bg-white p-12 text-center">
          <FileText className="h-16 w-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-700 mb-2">No session notes yet</h3>
          <p className="text-slate-600">Your tutors will create notes after each session to help you review key concepts.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredNotes.map(note => (
            <div key={note.id} className="rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <h3 className="text-xl font-bold text-slate-800">
                      {note.booking.subject || 'Session'}
                    </h3>
                    {note.aiGenerated && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full font-semibold">
                        AI Generated
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      {note.author.name}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {new Date(note.booking.startTime).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {note.studentPerformance && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-800 rounded-full">
                    <Star className="h-4 w-4 fill-current" />
                    <span className="text-sm font-semibold">{note.studentPerformance}/10</span>
                  </div>
                )}
              </div>

              {/* Summary */}
              {note.summary && (
                <div className="mb-4 p-4 bg-ocean-50 rounded-xl">
                  <div className="text-sm font-semibold text-ocean-900 mb-1">Summary</div>
                  <p className="text-ocean-800">{note.summary}</p>
                </div>
              )}

              {/* Topics Covered */}
              {note.topics && note.topics.length > 0 && (
                <div className="mb-4">
                  <div className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
                    <BookOpen className="h-4 w-4" />
                    Topics Covered
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {note.topics.map((topic, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Content */}
              <div className="mb-4">
                <div className="text-sm font-semibold text-slate-700 mb-2">Notes</div>
                <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">
                  {note.content}
                </div>
              </div>

              {/* Homework */}
              {note.homework && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="text-sm font-semibold text-green-900 mb-1">Homework</div>
                  <p className="text-green-800 text-sm">{note.homework}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
