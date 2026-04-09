import { useState, useEffect, useRef } from 'react';
import {
  ClipboardList, Plus, Eye, Upload, Clock, CheckCircle2, AlertCircle,
  Loader2, MessageSquare, X, Send, ChevronDown, ChevronUp,
} from 'lucide-react';
import api from '../../lib/apiClient';
import FileViewerModal from '../../components/FileViewerModal';

interface TutorStudent {
  id: string;
  name: string | null;
  email: string | null;
  grade: string | null;
  tokenBalance: number;
}

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
  aiScanStatus?: string;
  isVisibleToStudent?: boolean;
  createdAt: string;
  student: {
    id: string;
    user: { name: string | null; email: string };
  };
  assignmentSubmissions: Submission[];
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-amber-100 text-amber-700',
  GRADED: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
};

const ALLOWED_MIMES = new Set([
  'application/pdf', 'image/jpeg', 'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function TutorAssignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [students, setStudents] = useState<TutorStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [createForm, setCreateForm] = useState({ studentId: '', title: '', description: '', dueDate: '' });
  const [createFile, setCreateFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const createFileRef = useRef<HTMLInputElement>(null);

  // Expand / review state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [gradeInput, setGradeInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');
  const [gradingLoading, setGradingLoading] = useState(false);

  // File viewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerName, setViewerName] = useState('');
  const [viewerType, setViewerType] = useState('');
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);

  useEffect(() => { loadAssignments(); }, []);

  async function loadAssignments() {
    try {
      setLoading(true);
      const { data } = await api.get('/assignments/tutor');
      setAssignments(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }

  async function loadStudents() {
    setStudentsLoading(true);
    try {
      const { data } = await api.get('/students/tutor/my-students');
      const all: TutorStudent[] = Array.isArray(data) ? data : [];
      // Only show students with active tokens
      setStudents(all.filter((s) => s.tokenBalance > 0));
    } catch {
      setError('Failed to load students');
    } finally {
      setStudentsLoading(false);
    }
  }

  function openCreatePanel() {
    setShowCreate(true);
    setCreateForm({ studentId: '', title: '', description: '', dueDate: '' });
    setCreateFile(null);
    setError(null);
    loadStudents();
  }

  function handleCreateFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_MIMES.has(file.type)) {
      setError('Only PDF, JPEG, PNG, DOC, and DOCX files are allowed.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('File must be 10 MB or smaller.');
      return;
    }
    setError(null);
    setCreateFile(file);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.studentId || !createForm.title) return;
    setCreating(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('studentId', createForm.studentId);
      fd.append('title', createForm.title);
      if (createForm.description) fd.append('description', createForm.description);
      if (createForm.dueDate) fd.append('dueDate', createForm.dueDate);
      if (createFile) fd.append('file', createFile);
      const { data } = await api.post('/assignments', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setShowCreate(false);
      if (data?.aiScanStatus === 'FLAGGED') {
        setError('Assignment is under review — contact support if not resolved in 24 hours.');
      } else {
        setSuccess('Assignment sent!');
        setTimeout(() => setSuccess(null), 3000);
      }
      await loadAssignments();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create assignment');
    } finally {
      setCreating(false);
    }
  }

  async function openFile(fileUrl: string, fileType: string, label: string) {
    setOpeningFileId(fileUrl);
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

  async function handleGrade(submissionId: string) {
    if (!gradeInput.trim()) return;
    setGradingLoading(true);
    try {
      await api.post(`/assignments/submissions/${submissionId}/grade`, {
        grade: gradeInput,
        feedback: feedbackInput,
      });
      setGradingId(null);
      setGradeInput('');
      setFeedbackInput('');
      setSuccess('Feedback saved!');
      setTimeout(() => setSuccess(null), 3000);
      await loadAssignments();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save feedback');
    } finally {
      setGradingLoading(false);
    }
  }

  const today = new Date().toISOString().split('T')[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="tutor-assignments-page">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6" data-testid="tutor-assignments-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-3">
            <ClipboardList className="h-7 w-7 text-indigo-600" /> Assignments
          </h1>
          <p className="text-slate-600 mt-1">Create, track, and review student assignments.</p>
        </div>
        <button
          onClick={openCreatePanel}
          data-testid="tutor-assignments-new-btn"
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition"
        >
          <Plus className="h-4 w-4" /> New Assignment
        </button>
      </div>

      {/* Banners */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {success}
        </div>
      )}

      {/* Create Assignment Panel */}
      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">New Assignment</h2>
            <button type="button" onClick={() => setShowCreate(false)} className="p-1 hover:bg-slate-100 rounded">
              <X className="h-5 w-5 text-slate-500" />
            </button>
          </div>

          {/* Student selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Student *</label>
            {studentsLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading students…</div>
            ) : students.length === 0 ? (
              <p className="text-sm text-amber-600">No students with active tokens found.</p>
            ) : (
              <select
                value={createForm.studentId}
                onChange={(e) => setCreateForm((p) => ({ ...p, studentId: e.target.value }))}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                data-testid="tutor-assignments-student-select"
              >
                <option value="">Select student…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.email} — {s.tokenBalance} tokens
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
            <input
              type="text"
              value={createForm.title}
              onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="e.g. Chapter 5 Practice Problems"
              data-testid="tutor-assignments-title-input"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={createForm.description}
              onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="Instructions for the student…"
            />
          </div>

          {/* File upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Attachment</label>
            <div
              onClick={() => createFileRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-400 transition"
            >
              <Upload className="h-6 w-6 text-slate-400 mx-auto mb-1" />
              <p className="text-sm text-slate-600">{createFile ? createFile.name : 'Click to browse'}</p>
              <p className="text-xs text-slate-400">PDF, JPEG, PNG, DOC, DOCX (max 10 MB)</p>
              <input
                ref={createFileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={handleCreateFileChange}
                className="hidden"
                data-testid="tutor-assignments-file-input"
              />
            </div>
            {createFile && (
              <button type="button" onClick={() => setCreateFile(null)} className="text-xs text-red-600 hover:underline mt-1">Remove file</button>
            )}
          </div>

          {/* Due date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Deadline</label>
            <input
              type="date"
              value={createForm.dueDate}
              onChange={(e) => setCreateForm((p) => ({ ...p, dueDate: e.target.value }))}
              min={today}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              data-testid="tutor-assignments-duedate-input"
            />
          </div>

          <button
            type="submit"
            disabled={creating || !createForm.studentId || !createForm.title}
            data-testid="tutor-assignments-send-btn"
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {creating ? 'Sending…' : 'Send Assignment'}
          </button>
        </form>
      )}

      {/* Assignment List */}
      {assignments.length === 0 && !showCreate ? (
        <div className="text-center py-16 bg-white border rounded-2xl">
          <ClipboardList className="h-14 w-14 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-1">No assignments yet</h3>
          <p className="text-sm text-slate-500">Click "New Assignment" to send work to a student.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((a) => {
            const isExpanded = expandedId === a.id;
            const latestSub = a.assignmentSubmissions?.[0];
            const deadline = a.dueDate
              ? new Date(a.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
              : null;

            return (
              <div key={a.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden" data-testid={`tutor-assignment-card-${a.id}`}>
                {/* Row */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : a.id)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900 truncate">{a.title}</h3>
                      <span className={`text-xs font-medium rounded-full px-2 py-0.5 whitespace-nowrap ${STATUS_STYLES[a.status] || ''}`}>
                        {a.status}
                      </span>
                      {a.aiScanStatus === 'FLAGGED' && (
                        <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-red-100 text-red-700">Under Review</span>
                      )}
                    </div>
                    <div className="text-sm text-slate-500 mt-0.5 flex items-center gap-3">
                      <span>{a.student.user.name || a.student.user.email}</span>
                      {deadline && (
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {deadline}</span>
                      )}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="h-5 w-5 text-slate-400 shrink-0" /> : <ChevronDown className="h-5 w-5 text-slate-400 shrink-0" />}
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-5 py-4 space-y-4">
                    {a.description && <p className="text-sm text-slate-700">{a.description}</p>}

                    {a.fileUrl && (
                      <button
                        onClick={() => openFile(a.fileUrl!, a.fileType || 'application/pdf', a.title)}
                        disabled={openingFileId === a.fileUrl}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {openingFileId === a.fileUrl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                        View Assignment File
                      </button>
                    )}

                    {/* Submission review */}
                    {latestSub ? (
                      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                        <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Student Submission — {new Date(latestSub.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </h4>
                        {latestSub.notes && (
                          <p className="text-sm text-slate-600">Notes: {latestSub.notes}</p>
                        )}
                        <button
                          onClick={() => openFile(latestSub.fileUrl, a.fileType || 'application/pdf', 'Student Submission')}
                          disabled={openingFileId === latestSub.fileUrl}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <Eye className="h-3.5 w-3.5" /> View Submission
                        </button>

                        {latestSub.grade ? (
                          <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                            <p className="text-sm font-semibold text-green-800">Grade: {latestSub.grade}</p>
                            {latestSub.feedback && (
                              <p className="text-sm text-slate-700 mt-1">{latestSub.feedback}</p>
                            )}
                          </div>
                        ) : gradingId === latestSub.id ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={gradeInput}
                              onChange={(e) => setGradeInput(e.target.value)}
                              placeholder="Grade (e.g. A, 8/10, Pass)"
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                              data-testid="tutor-assignments-grade-input"
                            />
                            <textarea
                              value={feedbackInput}
                              onChange={(e) => setFeedbackInput(e.target.value)}
                              placeholder="Feedback / comments…"
                              rows={3}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                              data-testid="tutor-assignments-feedback-input"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleGrade(latestSub.id)}
                                disabled={gradingLoading || !gradeInput.trim()}
                                className="rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                                data-testid="tutor-assignments-save-feedback-btn"
                              >
                                {gradingLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                Save Feedback
                              </button>
                              <button
                                onClick={() => setGradingId(null)}
                                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setGradingId(latestSub.id); setGradeInput(''); setFeedbackInput(''); }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                            data-testid="tutor-assignments-review-btn"
                          >
                            <MessageSquare className="h-3.5 w-3.5" /> Review & Grade
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 italic">No submission yet.</p>
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
