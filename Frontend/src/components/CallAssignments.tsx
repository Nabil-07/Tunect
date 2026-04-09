import { useState, useEffect } from 'react';
import { ClipboardList, Eye, Loader2, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import api from '../lib/apiClient';

interface Assignment {
  id: string;
  title: string;
  description?: string;
  fileUrl?: string;
  fileType?: string;
  dueDate?: string;
  status: 'PENDING' | 'SUBMITTED' | 'GRADED' | 'OVERDUE';
  student?: { id: string; user: { name: string | null; email: string } };
  tutor?: { id: string; user: { name: string | null; email: string } };
  assignmentSubmissions?: { id: string; grade?: string }[];
}

interface CallAssignmentsProps {
  readonly isTutor: boolean;
  readonly onOpenInClass?: (pdfUrl: string, title: string) => void;
}

const STATUS_CHIP: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-600',
  SUBMITTED: 'bg-amber-100 text-amber-700',
  GRADED: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
};

export default function CallAssignments({ isTutor, onOpenInClass }: CallAssignmentsProps) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    loadAssignments();
  }, []);

  async function loadAssignments() {
    try {
      setLoading(true);
      setError(null);
      const endpoint = isTutor ? '/assignments/tutor' : '/assignments/student';
      const { data } = await api.get(endpoint);
      setAssignments(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }

  async function handleOpen(a: Assignment) {
    if (!a.fileUrl) return;
    setOpeningId(a.id);
    setError(null);
    try {
      const { data } = await api.post('/uploads/presign-get', { key: a.fileUrl });
      if (onOpenInClass) {
        onOpenInClass(data.downloadUrl, a.title);
      } else {
        window.open(data.downloadUrl, '_blank', 'noopener');
      }
    } catch {
      setError('Failed to open assignment file');
    } finally {
      setOpeningId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-slate-500">
        <ClipboardList className="h-8 w-8 mx-auto mb-2 text-slate-300" />
        <p>No assignments yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="call-assignments">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {assignments.map((a) => {
        const deadline = a.dueDate
          ? new Date(a.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : null;
        const sub = a.assignmentSubmissions?.[0];

        return (
          <div key={a.id} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-start gap-2">
              <ClipboardList className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{a.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[10px] font-medium rounded-full px-1.5 py-0.5 ${STATUS_CHIP[a.status] || ''}`}>
                    {a.status}
                  </span>
                  {deadline && (
                    <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" /> {deadline}
                    </span>
                  )}
                  {sub?.grade && (
                    <span className="text-[10px] text-green-700 flex items-center gap-0.5">
                      <CheckCircle2 className="h-2.5 w-2.5" /> {sub.grade}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {a.fileUrl && (
              <button
                onClick={() => handleOpen(a)}
                disabled={openingId === a.id}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition"
              >
                {openingId === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                Open in Class
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
