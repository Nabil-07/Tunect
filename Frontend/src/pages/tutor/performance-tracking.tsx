// src/pages/tutor/performance-tracking.tsx
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TrendingUp, Users, Clock, BookOpen, Plus, Search, FileText, Pencil, Trash2 } from 'lucide-react';
import api from '../../lib/apiClient';

type Student = {
  id: string;
  name?: string;
  email?: string;
  user?: {
    name?: string;
    email?: string;
  };
};

type PerformanceReport = {
  id: string;
  studentId: string;
  period: string;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  student?: Student;
};

type PerformanceData = {
  totalSessions: number;
  totalHours: number;
  averageRating?: number;
  completionRate?: number;
  strengths?: string[];
  areasForImprovement?: string[];
  notes?: string;
};

export default function PerformanceTracking() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [reports, setReports] = useState<PerformanceReport[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoFilled, setAutoFilled] = useState(false);
  
  const [formData, setFormData] = useState({
    studentId: '',
    period: new Date().toISOString().slice(0, 7), // YYYY-MM
    totalSessions: 0,
    totalHours: 0,
    averageRating: 0,
    completionRate: 100,
    strengths: '',
    areasForImprovement: '',
    notes: '',
  });

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadReports();
    loadStudents();
  }, []);

  // Auto-fill from URL params (linked from post-class screen)
  useEffect(() => {
    if (autoFilled) return;
    const bookingId = searchParams.get('bookingId');
    const studentId = searchParams.get('studentId');
    if (!bookingId && !studentId) return;

    const autoFillFromBooking = async () => {
      try {
        let bkStudentId = studentId || '';
        let bkPeriod = new Date().toISOString().slice(0, 7);
        let bkStudentName = '';

        // Fetch booking details to get student info and date
        if (bookingId) {
          const res = await api.get(`/bookings/${bookingId}/details`);
          const booking = res.data;
          bkStudentId = booking.studentId || studentId || '';
          if (booking.startTime) {
            bkPeriod = new Date(booking.startTime).toISOString().slice(0, 7);
          }
          bkStudentName = booking.student?.name || '';
        }

        // Fetch stats for this student
        let totalSessions = 0;
        let totalHours = 0;
        if (bkStudentId) {
          try {
            const statsRes = await api.get(`/performance-reports/student/${bkStudentId}`);
            totalSessions = statsRes.data?.totalSessions || 0;
            totalHours = Math.round((statsRes.data?.totalHours || 0) * 10) / 10;
          } catch {
            // stats endpoint might fail — that's fine
          }
        }

        setFormData((prev) => ({
          ...prev,
          studentId: bkStudentId,
          period: bkPeriod,
          totalSessions,
          totalHours,
          notes: bkStudentName ? `Class with ${bkStudentName} on ${new Date(bkPeriod + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` : prev.notes,
        }));
        setShowForm(true);
        setAutoFilled(true);

        // Clear URL params to avoid re-triggering
        setSearchParams({}, { replace: true });
      } catch (err) {
        console.error('Failed to auto-fill from booking:', err);
      }
    };

    autoFillFromBooking();
  }, [searchParams, autoFilled, setSearchParams]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const res = await api.get('/performance-reports/my-reports');
      setReports(res.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = async () => {
    try {
      // Fetch tutor's students (you may need to create an endpoint for this)
      const res = await api.get('/students/tutor/my-students');
      setStudents(res.data || []);
    } catch (err: any) {
      console.error('Failed to load students:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const reportData: PerformanceData = {
        totalSessions: Number(formData.totalSessions),
        totalHours: Number(formData.totalHours),
        averageRating: formData.averageRating ? Number(formData.averageRating) : undefined,
        completionRate: formData.completionRate ? Number(formData.completionRate) : undefined,
        strengths: formData.strengths ? formData.strengths.split(',').map(s => s.trim()) : undefined,
        areasForImprovement: formData.areasForImprovement 
          ? formData.areasForImprovement.split(',').map(s => s.trim()) 
          : undefined,
        notes: formData.notes || undefined,
      };

      if (editingReportId) {
        await api.patch(`/performance-reports/${editingReportId}`, {
          period: formData.period,
          data: reportData,
        });
        setSuccess('Performance report updated successfully!');
      } else {
        await api.post('/performance-reports', {
          studentId: formData.studentId,
          period: formData.period,
          data: reportData,
        });
        setSuccess('Performance report created successfully!');
      }

      resetForm();
      loadReports();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save report');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (report: PerformanceReport) => {
    const data = (report.data || {}) as PerformanceData;
    setError(null);
    setSuccess(null);
    setEditingReportId(report.id);
    setFormData({
      studentId: report.studentId,
      period: report.period,
      totalSessions: Number(data.totalSessions || 0),
      totalHours: Number(data.totalHours || 0),
      averageRating: Number(data.averageRating || 0),
      completionRate: Number(data.completionRate || 0),
      strengths: Array.isArray(data.strengths) ? data.strengths.join(', ') : '',
      areasForImprovement: Array.isArray(data.areasForImprovement)
        ? data.areasForImprovement.join(', ')
        : '',
      notes: data.notes || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (reportId: string) => {
    const confirmed = globalThis.confirm('Delete this performance report? This action cannot be undone.');
    if (!confirmed) return;

    setDeletingId(reportId);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/performance-reports/${reportId}`);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      setSuccess('Performance report deleted successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete report');
    } finally {
      setDeletingId(null);
    }
  };

  const resetForm = () => {
    setEditingReportId(null);
    setFormData({
      studentId: '',
      period: new Date().toISOString().slice(0, 7),
      totalSessions: 0,
      totalHours: 0,
      averageRating: 0,
      completionRate: 100,
      strengths: '',
      areasForImprovement: '',
      notes: '',
    });
    setShowForm(false);
  };

  const filteredReports = reports.filter((report) => {
    if (selectedStudent && report.studentId !== selectedStudent) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const studentName = report.student?.name || report.student?.user?.name || '';
      const studentEmail = report.student?.email || report.student?.user?.email || '';
      return (
        studentName.toLowerCase().includes(query) ||
        studentEmail.toLowerCase().includes(query) ||
        report.period.includes(query)
      );
    }
    return true;
  });

  const formatPeriod = (period: string) => {
    const [year, month] = period.split('-');
    if (month) {
      const date = new Date(Number(year), Number(month) - 1);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    }
    return period;
  };

  const getStudentName = (student?: Student) => {
    return student?.name || student?.user?.name || student?.email || 'Unknown Student';
  };

  let submitButtonLabel = 'Create Report';
  if (saving) {
    submitButtonLabel = 'Saving...';
  } else if (editingReportId) {
    submitButtonLabel = 'Update Report';
  }

  const emptyStateText = reports.length === 0
    ? 'No reports yet. Create your first performance report!'
    : 'No reports match your filters.';

  let reportsListContent: React.ReactNode;
  if (loading) {
    reportsListContent = (
      <div className="px-6 py-12 text-center text-sm text-slate-600">
        Loading reports...
      </div>
    );
  } else if (filteredReports.length === 0) {
    reportsListContent = (
      <div className="px-6 py-12 text-center text-sm text-slate-600">
        {emptyStateText}
      </div>
    );
  } else {
    reportsListContent = (
      <div className="divide-y divide-slate-200">
        {filteredReports.map((report) => {
          const data = report.data as PerformanceData;

          return (
            <div key={report.id} className="px-6 py-4 hover:bg-slate-50 transition">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start gap-3 mb-3">
                    <FileText className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900">
                        {getStudentName(report.student)}
                      </h3>
                      <p className="text-sm text-slate-600 mt-0.5">
                        {formatPeriod(report.period)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                    <div className="flex items-center gap-2 text-sm">
                      <BookOpen className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-600">{data.totalSessions} sessions</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-600">{data.totalHours} hours</span>
                    </div>
                    {data.averageRating !== undefined && (
                      <div className="flex items-center gap-2 text-sm">
                        <TrendingUp className="h-4 w-4 text-slate-400" />
                        <span className="text-slate-600">{data.averageRating.toFixed(1)}/5 rating</span>
                      </div>
                    )}
                    {data.completionRate !== undefined && (
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-slate-400" />
                        <span className="text-slate-600">{data.completionRate}% completion</span>
                      </div>
                    )}
                  </div>

                  {data.strengths && data.strengths.length > 0 && (
                    <div className="mb-2">
                      <span className="text-xs font-medium text-emerald-700">Strengths: </span>
                      <span className="text-xs text-slate-600">
                        {data.strengths.join(', ')}
                      </span>
                    </div>
                  )}

                  {data.areasForImprovement && data.areasForImprovement.length > 0 && (
                    <div className="mb-2">
                      <span className="text-xs font-medium text-amber-700">Areas for Improvement: </span>
                      <span className="text-xs text-slate-600">
                        {data.areasForImprovement.join(', ')}
                      </span>
                    </div>
                  )}

                  {data.notes && (
                    <p className="text-sm text-slate-600 mt-2 italic">"{data.notes}"</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(report)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    data-testid="tutor-performance-tracking-edit-button"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(report.id)}
                    disabled={deletingId === report.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                    data-testid="tutor-performance-tracking-delete-button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deletingId === report.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <main className="container-px mx-auto py-8" data-testid="tutor-performance-tracking-page">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Performance Tracking</h1>
          <p className="text-sm text-slate-600 mt-1">
            Track and analyze student progress over time
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          data-testid="tutor-performance-tracking-create-report-button"
        >
          <Plus className="h-4 w-4" />
          Create Report
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="tutor-performance-tracking-error-alert">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" data-testid="tutor-performance-tracking-success-alert">
          {success}
        </div>
      )}

      {/* Report Form */}
      {showForm && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">
            {editingReportId ? 'Edit Performance Report' : 'Create Performance Report'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4" data-testid="tutor-performance-tracking-form">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="block text-sm font-medium text-slate-700 mb-1">
                  Student *
                </p>
                <select
                  id="report-student"
                  required
                  value={formData.studentId}
                  onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                  disabled={!!editingReportId}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  data-testid="tutor-performance-tracking-student-select"
                >
                  <option value="">Select a student</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {getStudentName(student)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="block text-sm font-medium text-slate-700 mb-1">
                  Period *
                </p>
                <input
                  id="report-period"
                  type="month"
                  required
                  value={formData.period}
                  onChange={(e) => setFormData({ ...formData, period: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  data-testid="tutor-performance-tracking-period-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="block text-sm font-medium text-slate-700 mb-1">
                  Total Sessions *
                </p>
                <input
                  id="report-total-sessions"
                  type="number"
                  required
                  min="0"
                  value={formData.totalSessions}
                  onChange={(e) => setFormData({ ...formData, totalSessions: Number(e.target.value) })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  data-testid="tutor-performance-tracking-total-sessions-input"
                />
              </div>

              <div>
                <p className="block text-sm font-medium text-slate-700 mb-1">
                  Total Hours *
                </p>
                <input
                  id="report-total-hours"
                  type="number"
                  required
                  min="0"
                  step="0.5"
                  value={formData.totalHours}
                  onChange={(e) => setFormData({ ...formData, totalHours: Number(e.target.value) })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  data-testid="tutor-performance-tracking-total-hours-input"
                />
              </div>

              <div>
                <p className="block text-sm font-medium text-slate-700 mb-1">
                  Average Rating
                </p>
                <input
                  id="report-average-rating"
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={formData.averageRating}
                  onChange={(e) => setFormData({ ...formData, averageRating: Number(e.target.value) })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  data-testid="tutor-performance-tracking-average-rating-input"
                />
              </div>

              <div>
                <p className="block text-sm font-medium text-slate-700 mb-1">
                  Completion Rate (%)
                </p>
                <input
                  id="report-completion-rate"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.completionRate}
                  onChange={(e) => setFormData({ ...formData, completionRate: Number(e.target.value) })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  data-testid="tutor-performance-tracking-completion-rate-input"
                />
              </div>
            </div>

            <div>
              <p className="block text-sm font-medium text-slate-700 mb-1">
                Strengths (comma-separated)
              </p>
              <input
                id="report-strengths"
                type="text"
                value={formData.strengths}
                onChange={(e) => setFormData({ ...formData, strengths: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                placeholder="e.g., Problem solving, Quick learner, Consistent practice"
                data-testid="tutor-performance-tracking-strengths-input"
              />
            </div>

            <div>
              <p className="block text-sm font-medium text-slate-700 mb-1">
                Areas for Improvement (comma-separated)
              </p>
              <input
                id="report-areas"
                type="text"
                value={formData.areasForImprovement}
                onChange={(e) => setFormData({ ...formData, areasForImprovement: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                placeholder="e.g., Time management, Advanced concepts, Test preparation"
                data-testid="tutor-performance-tracking-areas-input"
              />
            </div>

            <div>
              <p className="block text-sm font-medium text-slate-700 mb-1">
                Additional Notes
              </p>
              <textarea
                id="report-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                placeholder="General observations and recommendations"
                rows={3}
                data-testid="tutor-performance-tracking-notes-input"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                data-testid="tutor-performance-tracking-submit-button"
              >
                {submitButtonLabel}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-300 px-6 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                data-testid="tutor-performance-tracking-cancel-button"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by student or period..."
              className="w-full rounded-xl border border-slate-300 pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              data-testid="tutor-performance-tracking-search-input"
            />
          </div>
        </div>

        <select
          value={selectedStudent}
          onChange={(e) => setSelectedStudent(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm min-w-[200px]"
          data-testid="tutor-performance-tracking-student-filter-select"
        >
          <option value="">All students</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {getStudentName(student)}
            </option>
          ))}
        </select>
      </div>

      {/* Reports List */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold">Performance Reports</h2>
        </div>

        {reportsListContent}
      </div>
    </main>
  );
}
