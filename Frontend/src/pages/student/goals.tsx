// src/pages/student/goals.tsx
import { useEffect, useState } from 'react';
import { Target, Plus, Edit2, Trash2, CheckCircle2, Circle, Calendar, Book } from 'lucide-react';
import apiClient from '../../services/apiClient';
import { useConfirm } from '../../hooks/useConfirm';
import { useToast } from '../../contexts/ToastContext';

interface Milestone {
  id: string;
  title: string;
  completed: boolean;
  order: number;
}

interface Goal {
  id: string;
  title: string;
  description?: string;
  subject: string;
  targetDate?: string;
  targetHours?: number;
  currentHours: number;
  completed: boolean;
  milestones: Milestone[];
  createdAt: string;
}

export default function StudentGoals() {
  const { confirm, ConfirmDialogComponent } = useConfirm();
  const { showSuccess, showError } = useToast();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [togglingGoalId, setTogglingGoalId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    subject: '',
    targetDate: '',
    targetHours: 10,
  });

  useEffect(() => {
    loadGoals();
  }, []);

  const loadGoals = async () => {
    try {
      const res = await apiClient.get('/learning-goals/my');
      const mapped = (res.data || []).map((g: any) => ({
        ...g,
        completed: g.status === 'COMPLETED',
      }));
      setGoals(mapped);
    } catch (error) {
      console.error('Failed to load goals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate targetDate is not in the past
    if (formData.targetDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(formData.targetDate);
      if (target < today) {
        showError('Target date cannot be in the past');
        return;
      }
    } else {
      showError('Target date is required');
      return;
    }
    setSubmitting(true);
    try {
      // Convert date to ISO 8601 format for the API
      const payload = {
        ...formData,
        targetDate: formData.targetDate ? new Date(formData.targetDate).toISOString() : undefined,
      };
      if (editingGoal) {
        await apiClient.put(`/learning-goals/${editingGoal.id}`, payload);
        showSuccess('Goal updated successfully');
      } else {
        await apiClient.post('/learning-goals', payload);
        showSuccess('Goal created successfully');
      }
      setShowForm(false);
      setEditingGoal(null);
      setFormData({ title: '', description: '', subject: '', targetDate: '', targetHours: 10 });
      loadGoals();
    } catch (error) {
      console.error('Failed to save goal:', error);
      showError('Failed to save goal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setFormData({
      title: goal.title,
      description: goal.description || '',
      subject: goal.subject,
      targetDate: goal.targetDate ? goal.targetDate.split('T')[0] : '',
      targetHours: goal.targetHours || 10,
    });
    setShowForm(true);
  };

  const handleDelete = async (goalId: string) => {
    const confirmed = await confirm({
      title: 'Delete Goal',
      message: 'Are you sure you want to delete this goal?',
      confirmText: 'Yes, Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    
    if (!confirmed) return;

    try {
      await apiClient.delete(`/learning-goals/${goalId}`);
      showSuccess('Goal deleted successfully');
      loadGoals();
    } catch (error) {
      console.error('Failed to delete goal:', error);
      showError('Failed to delete goal');
    }
  };

  const toggleMilestone = async (milestoneId: string, completed: boolean) => {
    try {
      await apiClient.put(`/learning-goals/milestones/${milestoneId}`, { completed: !completed });
      loadGoals();
    } catch (error) {
      console.error('Failed to toggle milestone:', error);
    }
  };

  const markGoalComplete = async (goalId: string, completed: boolean) => {
    setTogglingGoalId(goalId);
    try {
      const newStatus = completed ? 'IN_PROGRESS' : 'COMPLETED';
      await apiClient.put(`/learning-goals/${goalId}`, { status: newStatus });
      showSuccess(completed ? 'Goal marked as in progress' : 'Goal marked as complete');
      loadGoals();
    } catch (error) {
      console.error('Failed to mark goal:', error);
      showError('Failed to update goal status');
    } finally {
      setTogglingGoalId(null);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 rounded-2xl bg-slate-200"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
          <Target className="h-8 w-8 text-ocean-600" />
          Learning Goals
        </h1>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingGoal(null);
            setFormData({ title: '', description: '', subject: '', targetDate: '', targetHours: 10 });
          }}
          className="flex items-center gap-2 px-4 py-2 bg-ocean-700 text-white rounded-xl font-semibold hover:bg-ocean-800 transition"
        >
          <Plus className="h-5 w-5" />
          New Goal
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-6">{editingGoal ? 'Edit Goal' : 'Create New Goal'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-ocean-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Subject *</label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={e => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-ocean-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-ocean-500 outline-none"
                  rows={3}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Target Date *</label>
                  <input
                    type="date"
                    value={formData.targetDate}
                    onChange={e => setFormData({ ...formData, targetDate: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-ocean-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Target Hours</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.targetHours}
                    onChange={e => setFormData({ ...formData, targetHours: Number(e.target.value) })}
                    className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-ocean-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-ocean-700 text-white rounded-xl font-semibold hover:bg-ocean-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Saving...' : editingGoal ? 'Update Goal' : 'Create Goal'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border rounded-xl hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Goals List */}
      {goals.length === 0 ? (
        <div className="rounded-2xl border bg-white p-12 text-center">
          <Target className="h-16 w-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-700 mb-2">No goals yet</h3>
          <p className="text-slate-600 mb-6">Set learning goals to stay motivated and track your progress!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {goals.map(goal => {
            const progress = goal.targetHours
              ? Math.min((goal.currentHours / goal.targetHours) * 100, 100)
              : 0;
            const completedMilestones = goal.milestones.filter(m => m.completed).length;
            const totalMilestones = goal.milestones.length;

            return (
              <div
                key={goal.id}
                className={`rounded-2xl border-2 ${goal.completed ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white'} p-6 shadow-sm hover:shadow-md transition`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-2xl font-bold text-slate-800">{goal.title}</h3>
                      {goal.completed && (
                        <span className="px-3 py-1 bg-green-600 text-white text-xs rounded-full font-semibold">
                          Completed
                        </span>
                      )}
                    </div>
                    {goal.description && (
                      <p className="text-slate-600 mb-3">{goal.description}</p>
                    )}
                    <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                      <div className="flex items-center gap-1">
                        <Book className="h-4 w-4" />
                        {goal.subject}
                      </div>
                      {goal.targetDate && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {new Date(goal.targetDate).toLocaleDateString()}
                        </div>
                      )}
                      {goal.targetHours && (
                        <div className="font-semibold">
                          {goal.currentHours} / {goal.targetHours} hours
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => markGoalComplete(goal.id, goal.completed)}
                      disabled={togglingGoalId === goal.id}
                      className="p-2 hover:bg-slate-100 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                      title={goal.completed ? 'Mark incomplete' : 'Mark complete'}
                    >
                      {goal.completed ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <Circle className="h-5 w-5 text-slate-400" />
                      )}
                    </button>
                    <button
                      onClick={() => handleEdit(goal)}
                      className="p-2 hover:bg-slate-100 rounded-lg transition"
                    >
                      <Edit2 className="h-5 w-5 text-ocean-600" />
                    </button>
                    <button
                      onClick={() => handleDelete(goal.id)}
                      className="p-2 hover:bg-slate-100 rounded-lg transition"
                    >
                      <Trash2 className="h-5 w-5 text-rose-600" />
                    </button>
                  </div>
                </div>

                {goal.targetHours && goal.targetHours > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-slate-600">Progress</span>
                      <span className="font-semibold text-slate-800">{Math.round(progress)}%</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full bg-ocean-600 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {goal.milestones.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold text-slate-700 mb-3">
                      Milestones ({completedMilestones}/{totalMilestones})
                    </div>
                    <div className="space-y-2">
                      {goal.milestones.map(milestone => (
                        <button
                          key={milestone.id}
                          onClick={() => toggleMilestone(milestone.id, milestone.completed)}
                          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition text-left"
                        >
                          {milestone.completed ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                          ) : (
                            <Circle className="h-5 w-5 text-slate-400 flex-shrink-0" />
                          )}
                          <span className={milestone.completed ? 'line-through text-slate-500' : 'text-slate-700'}>
                            {milestone.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialogComponent />
    </div>
  );
}
