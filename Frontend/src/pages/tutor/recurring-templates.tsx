// src/pages/tutor/recurring-templates.tsx
import { useState, useEffect } from 'react';
import { Calendar, Clock, Plus, Edit, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import api from '../../lib/apiClient';
import { useConfirm } from '../../hooks/useConfirm';

type RecurringTemplate = {
  id: string;
  dayOfWeek: number; // 0-6 (Sunday to Saturday)
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  title?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function RecurringTemplates() {
  const { confirm, ConfirmDialogComponent } = useConfirm();
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    dayOfWeek: 1, // Monday by default
    startTime: '09:00',
    endTime: '10:00',
    title: '',
    isActive: true,
  });

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async (forceRefresh = false) => {
    try {
      setLoading(true);
      // Add cache-busting timestamp to force fresh data after updates
      const res = await api.get('/recurring-templates/my', {
        // Use timestamp param to bypass browser cache (avoids CORS preflight issues with Cache-Control header)
        params: forceRefresh ? { _t: Date.now() } : {},
      });
      setTemplates(res.data || []);
      // Clear any error state on successful load
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validate time
    if (formData.startTime >= formData.endTime) {
      setError('End time must be after start time');
      return;
    }

    try {
      if (editingId) {
        await api.patch(`/recurring-templates/${editingId}`, formData);
        setSuccess('Template updated successfully!');
      } else {
        await api.post('/recurring-templates', formData);
        setSuccess('Template created successfully!');
      }
      
      resetForm();
      // Force refresh to bypass cache after update
      await loadTemplates(true);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save template');
    }
  };

  const handleEdit = (template: RecurringTemplate) => {
    setEditingId(template.id);
    setFormData({
      dayOfWeek: template.dayOfWeek,
      startTime: template.startTime,
      endTime: template.endTime,
      title: template.title || '',
      isActive: template.isActive,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Delete template',
      message: 'Are you sure you want to delete this template?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await api.delete(`/recurring-templates/${id}`);
      setSuccess('Template deleted successfully!');
      // Force refresh to bypass cache after delete
      await loadTemplates(true);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete template');
    }
  };

  const handleToggleActive = async (id: string, currentState: boolean) => {
    try {
      await api.patch(`/recurring-templates/${id}/toggle`);
      setSuccess(`Template ${currentState ? 'deactivated' : 'activated'}!`);
      // Force refresh to bypass cache after toggle
      await loadTemplates(true);
      setTimeout(() => setSuccess(null), 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to toggle template');
    }
  };

  const resetForm = () => {
    setFormData({
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '10:00',
      title: '',
      isActive: true,
    });
    setEditingId(null);
    setShowForm(false);
  };

  // Group templates by day
  const templatesByDay = templates.reduce((acc, template) => {
    if (!acc[template.dayOfWeek]) {
      acc[template.dayOfWeek] = [];
    }
    acc[template.dayOfWeek].push(template);
    return acc;
  }, {} as Record<number, RecurringTemplate[]>);

  return (
    <main className="container-px mx-auto py-8" data-testid="tutor-recurring-templates-page">
      <ConfirmDialogComponent />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recurring Templates</h1>
          <p className="text-sm text-slate-600 mt-1">
            Set up your weekly availability patterns
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          data-testid="tutor-recurring-templates-add-button"
        >
          <Plus className="h-4 w-4" />
          Add Template
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="tutor-recurring-templates-error-alert">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" data-testid="tutor-recurring-templates-success-alert">
          {success}
        </div>
      )}

      {/* Template Form */}
      {showForm && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">
            {editingId ? 'Edit Template' : 'Create New Template'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4" data-testid="tutor-recurring-templates-form">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Title (optional)
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                placeholder="e.g., Morning Sessions"
                data-testid="tutor-recurring-templates-title-input"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Day of Week *
                </label>
                <select
                  required
                  value={formData.dayOfWeek}
                  onChange={(e) => setFormData({ ...formData, dayOfWeek: Number(e.target.value) })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  data-testid="tutor-recurring-templates-day-select"
                >
                  {DAYS_OF_WEEK.map((day, index) => (
                    <option key={index} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Start Time *
                </label>
                <input
                  type="time"
                  required
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  data-testid="tutor-recurring-templates-start-time-input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  End Time *
                </label>
                <input
                  type="time"
                  required
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  data-testid="tutor-recurring-templates-end-time-input"
                />
              </div>
            </div>

            <div className="flex items-center pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  data-testid="tutor-recurring-templates-active-checkbox"
                />
                <span className="text-sm font-medium text-slate-700">
                  Active template
                </span>
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="rounded-xl bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                data-testid="tutor-recurring-templates-submit-button"
              >
                {editingId ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-300 px-6 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                data-testid="tutor-recurring-templates-cancel-button"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Weekly Calendar View */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold">Weekly Schedule</h2>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-600">
            Loading templates...
          </div>
        ) : templates.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-600">
            No recurring templates yet. Create your first template to set up weekly availability!
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {DAYS_OF_WEEK.map((day, dayIndex) => {
              const dayTemplates = templatesByDay[dayIndex] || [];
              
              return (
                <div key={dayIndex} className="px-6 py-4">
                  <div className="flex items-start gap-4">
                    <div className="w-32 flex-shrink-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        {day}
                      </div>
                    </div>
                    
                    <div className="flex-1">
                      {dayTemplates.length === 0 ? (
                        <div className="text-sm text-slate-400 italic">No templates for this day</div>
                      ) : (
                        <div className="space-y-2">
                          {dayTemplates.map((template) => (
                            <div
                              key={template.id}
                              className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 ${
                                template.isActive
                                  ? 'border-emerald-200 bg-emerald-50'
                                  : 'border-slate-200 bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <Clock className={`h-4 w-4 flex-shrink-0 ${
                                  template.isActive ? 'text-emerald-600' : 'text-slate-400'
                                }`} />
                                <div className="min-w-0">
                                  {template.title && (
                                    <div className="font-medium text-sm text-slate-900">
                                      {template.title}
                                    </div>
                                  )}
                                  <div className="text-sm text-slate-600">
                                    {template.startTime} - {template.endTime}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                  onClick={() => handleToggleActive(template.id, template.isActive)}
                                  className="rounded-lg p-2 hover:bg-white/50"
                                  title={template.isActive ? 'Deactivate' : 'Activate'}
                                  data-testid="tutor-recurring-templates-toggle-button"
                                >
                                  {template.isActive ? (
                                    <ToggleRight className="h-5 w-5 text-emerald-600" />
                                  ) : (
                                    <ToggleLeft className="h-5 w-5 text-slate-400" />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleEdit(template)}
                                  className="rounded-lg p-2 text-slate-600 hover:bg-white"
                                  title="Edit"
                                  data-testid="tutor-recurring-templates-edit-button"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(template.id)}
                                  className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                                  title="Delete"
                                  data-testid="tutor-recurring-templates-delete-button"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
