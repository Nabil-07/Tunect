import { useState, useEffect, useRef } from 'react';
import { ClipboardList, Eye, Upload, Clock, CheckCircle2, AlertCircle, Loader2, MessageSquare, X } from 'lucide-react';
import api from '../../lib/apiClient';
import FileViewerModal from '../../components/FileViewerModal';

interface Submission {
  id: string;
  fileUrl: string;
  notes?: string;
  grade?: string;
  feedback?: string;
  submittedAt: string;
}

interface Assignment {
  id: string;
  title: string;
  description?: string;
  fileUrl?: string;
  fileType?: string;
  dueDate?: string;
  status: 'PENDING' | 'SUBMITTED' | 'GRADED' | 'OVERDUE';
  createdAt: string;
  tutor: {
    id: string;
    user: { name: string | null; email: string };
  };
  assignmentSubmissions: Submission[];
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  GRADED: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
};

function deadlineInfo(dueDate?: string) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const formatted = due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (diffDays < 0) return { text: `Overdue (${formatted})`, color: 'text-red-600' };
  if (diffDays <= 3) return { text: `Due ${formatted}`, color: 'text-amber-600' };
  return { text: `Due ${formatted}`, color: 'text-slate-600' };
}

const ALLOWED_MIMES = new Set([
  'application/pdf', 'image/jpeg', 'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function StudentAssignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Submit state
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submitFile, setSubmitFile] = useState<File | null>(null);
  const [submitNotes, setSubmitNotes] = useState('');
  const [submitUploading, setSubmitUploading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerName, setViewerName] = useState('');
  const [viewerType, setViewerType] = useState('');
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);

  useEffect(() => { loadAssignments(); }, []);

  async function loadAssignments() {
    try {
      setLoading(true);
      const { data } = await api.get('/assignments/student');
      setAssignments(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }

  async function openFile(fileUrl: string, fileType: string, label: string) {
    const identifier = fileUrl;
    setOpeningFileId(identifier);
    try {
      const { data } = await api.post('/uploads/presign-get', { key: fileUrl });
      setViewerUrl(data.downloadUrl);
      setViewerName(label);
      setViewerType(fileType || 'application/pdf');
      setViewerOpen(true);
    } catch {
      setError('Failed to open file');
    } finally {
      setOpeningFileId(null);
    }
  }

  function openSubmitPanel(assignmentId: string) {
    setSubmittingId(assignmentId);
    setSubmitFile(null);
    setSubmitNotes('');
    setSubmitError(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_MIMES.has(file.type)) {
      setSubmitError('Only PDF, JPEG, PNG, DOC, and DOCX files are allowed.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setSubmitError('File must be 10 MB or smaller.');
      return;
    }
    setSubmitError(null);
    setSubmitFile(file);
  }

  async function handleSubmit() {
    if (!submittingId || !submitFile) return;
    setSubmitUploading(true);
    setSubmitError(null);
    try {
      const fd = new FormData();
      fd.append('file', submitFile);
      fd.append('notes', submitNotes);
      await api.post(`/assignments/${submittingId}/submit`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSubmittingId(null);
      await loadAssignments();
    } catch (err: any) {
      setSubmitError(err?.response?.data?.message || 'Failed to submit assignment');
    } finally {
      setSubmitUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="student-assignments-page">
        <Loader2 className="h-8 w-8 animate-spin text-ocean-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6" data-testid="student-assignments-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-3">
          <ClipboardList className="h-7 w-7 text-ocean-700" /> My Assignments
        </h1>
        <p className="text-slate-600 mt-1">View assignments from your tutors and submit your work.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {assignments.length === 0 ? (
        <div className="text-center py-16 bg-white border rounded-2xl">
          <ClipboardList className="h-14 w-14 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-1">No assignments yet</h3>
          <p className="text-sm text-slate-500">Your tutors haven't assigned any work yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((a) => {
            const deadline = deadlineInfo(a.dueDate);
            const latestSubmission = a.assignmentSubmissions?.[0];
            const canSubmit = a.status === 'PENDING' || a.status === 'OVERDUE';

            return (
              <div
                key={a.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"
                data-testid={`assignment-card-${a.id}`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-slate-900">{a.title}</h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {a.tutor.user.name || a.tutor.user.email}
                    </p>
                  </div>
                  <span className={`text-xs font-medium rounded-full px-2.5 py-1 whitespace-nowrap ${STATUS_STYLES[a.status] || 'bg-slate-100 text-slate-700'}`}>
                    {a.status}
                  </span>
                </div>

                {a.description && (
                  <p className="text-sm text-slate-700">{a.description}</p>
                )}

                {/* Deadline */}
                {deadline && (
                  <div className={`flex items-center gap-1.5 text-sm font-medium ${deadline.color}`}>
                    <Clock className="h-4 w-4" /> {deadline.text}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {a.fileUrl && (
                    <button
                      onClick={() => openFile(a.fileUrl!, a.fileType || 'application/pdf', a.title)}
                      disabled={openingFileId === a.fileUrl}
                      data-testid="assignment-view-btn"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {openingFileId === a.fileUrl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                      View Assignment
                    </button>
                  )}
                  {canSubmit && (
                    <button
                      onClick={() => openSubmitPanel(a.id)}
                      data-testid="assignment-submit-btn"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-ocean-700 px-3 py-2 text-xs font-semibold text-white hover:bg-ocean-800"
                    >
                      <Upload className="h-3.5 w-3.5" /> Submit Assignment
                    </button>
                  )}
                </div>

                {/* Submit Panel */}
                {submittingId === a.id && (
                  <div className="mt-3 border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-800">Submit Your Work</h4>
                      <button onClick={() => setSubmittingId(null)} className="p-1 hover:bg-slate-200 rounded">
                        <X className="h-4 w-4 text-slate-500" />
                      </button>
                    </div>

                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-ocean-500 transition"
                    >
                      <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                      <p className="text-sm text-slate-600">
                        {submitFile ? submitFile.name : 'Click to browse or drag and drop'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">PDF, JPEG, PNG, DOC, DOCX (max 10 MB)</p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                        onChange={handleFileChange}
                        className="hidden"
                        data-testid="assignment-submit-file-input"
                      />
                    </div>

                    <textarea
                      value={submitNotes}
                      onChange={(e) => setSubmitNotes(e.target.value)}
                      placeholder="Add notes (optional)"
                      rows={2}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500"
                      data-testid="assignment-submit-notes"
                    />

                    {submitError && (
                      <p className="text-xs text-red-600">{submitError}</p>
                    )}

                    <button
                      onClick={handleSubmit}
                      disabled={!submitFile || submitUploading}
                      data-testid="assignment-submit-confirm-btn"
                      className="w-full rounded-lg bg-ocean-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ocean-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitUploading ? 'Submitting…' : 'Submit'}
                    </button>
                  </div>
                )}

                {/* Submission Info / Feedback */}
                {latestSubmission && (
                  <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span>Submitted {new Date(latestSubmission.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      <button
                        onClick={() => openFile(latestSubmission.fileUrl, a.fileType || 'application/pdf', 'My Submission')}
                        disabled={openingFileId === latestSubmission.fileUrl}
                        className="text-ocean-700 hover:underline text-xs font-medium ml-auto"
                      >
                        View Submission
                      </button>
                    </div>

                    {latestSubmission.grade && (
                      <div className="rounded-lg bg-green-50 border border-green-200 p-3 space-y-1">
                        <div className="text-sm font-semibold text-green-800">
                          Grade: {latestSubmission.grade}
                        </div>
                        {latestSubmission.feedback && (
                          <div className="text-sm text-slate-700 flex items-start gap-2">
                            <MessageSquare className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                            {latestSubmission.feedback}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <FileViewerModal
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        fileUrl={viewerUrl}
        fileName={viewerName}
        fileType={viewerType}
      />
    </div>
  );
}
