// src/pages/student/session-notes.tsx
import { useEffect, useState } from 'react';
import { FileText, BookOpen, Clock, User, Star } from 'lucide-react';
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

export default function SessionNotes() {
  const [notes, setNotes] = useState<SessionNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'recent'>('all');

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      const res = await apiClient.get('/session-notes/my-notes');
      setNotes(res.data || []);
    } catch (error) {
      console.error('Failed to load session notes:', error);
    } finally {
      setLoading(false);
    }
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
