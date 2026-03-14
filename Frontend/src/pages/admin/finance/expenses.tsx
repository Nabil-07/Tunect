import { useEffect, useState, useRef } from 'react';
import { Plus, Download, Trash2, Loader2, Upload, X, Receipt } from 'lucide-react';
import { http as api } from '../../../api/http';

type Expense = {
  id: string;
  title: string;
  description?: string;
  amount: number;
  category: string;
  receiptUrl?: string;
  expenseDate: string;
  createdAt: string;
};

type ExpenseListResponse = {
  expenses: Expense[];
  total: number;
  totalAmount: number;
  page: number;
  pageSize: number;
};

const CATEGORIES = ['general', 'salary', 'software', 'marketing', 'office', 'travel', 'utilities', 'legal', 'other'];

export default function ExpenseTracker() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedCategory, setSelectedCategory] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    title: '',
    description: '',
    amount: '',
    category: 'general',
    expenseDate: new Date().toISOString().split('T')[0],
  });
  const [addReceipt, setAddReceipt] = useState<File | null>(null);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const formatINR = (amount: number) => `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  async function loadExpenses() {
    setLoading(true);
    setError(null);
    try {
      const params: any = { pageSize: 200 };
      if (selectedMonth) params.month = selectedMonth;
      if (selectedCategory) params.category = selectedCategory;
      const { data } = await api.get<ExpenseListResponse>('/admin/expenses', { params });
      setExpenses(data.expenses || []);
      setTotalAmount(data.totalAmount || 0);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadExpenses();
  }, [selectedMonth, selectedCategory]);

  async function handleAddExpense() {
    const amount = parseFloat(addForm.amount);
    if (!addForm.title.trim()) {
      setAddError('Title is required');
      return;
    }
    if (!amount || amount <= 0) {
      setAddError('Enter a valid amount');
      return;
    }
    try {
      setAddSubmitting(true);
      setAddError(null);

      const formData = new FormData();
      formData.append('title', addForm.title);
      formData.append('amount', String(amount));
      formData.append('category', addForm.category);
      formData.append('expenseDate', addForm.expenseDate);
      if (addForm.description) formData.append('description', addForm.description);
      if (addReceipt) formData.append('receipt', addReceipt);

      await api.post('/admin/expenses', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setShowAddModal(false);
      setAddForm({ title: '', description: '', amount: '', category: 'general', expenseDate: new Date().toISOString().split('T')[0] });
      setAddReceipt(null);
      loadExpenses();
    } catch (err: any) {
      setAddError(err?.response?.data?.message || 'Failed to add expense');
    } finally {
      setAddSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this expense?')) return;
    try {
      await api.delete(`/admin/expenses/${id}`);
      loadExpenses();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to delete');
    }
  }

  async function handleExport() {
    try {
      const params: any = {};
      if (selectedMonth) params.month = selectedMonth;
      if (selectedCategory) params.category = selectedCategory;
      const response = await api.get('/admin/expenses/export', { params, responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expenses${selectedMonth ? `-${selectedMonth}` : ''}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Failed to export expenses');
    }
  }

  const monthLabel = selectedMonth
    ? new Date(selectedMonth + '-01').toLocaleString(undefined, { month: 'long', year: 'numeric' })
    : 'All Time';

  return (
    <div className="space-y-6" data-testid="expenses-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Expense Tracker</h1>
          <p className="text-slate-600 mt-1">Log and track company expenses</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            data-testid="expenses-add-button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition"
          >
            <Plus className="w-4 h-4" />
            Add Expense
          </button>
          <button
            onClick={handleExport}
            data-testid="expenses-export-button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Month</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            data-testid="expenses-month-input"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            data-testid="expenses-category-select"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Total Expenses ({monthLabel})</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{formatINR(totalAmount)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Number of Entries</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Average per Entry</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {total > 0 ? formatINR(totalAmount / total) : '—'}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" data-testid="expenses-error-alert">{error}</div>
      )}

      {/* Expenses Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
      ) : expenses.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-12 text-center">
          <Receipt className="w-8 h-8 mx-auto text-slate-400 mb-2" />
          <p className="text-slate-600">No expenses recorded for this period</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm" data-testid="expenses-table">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Title</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Category</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">Amount</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Description</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Receipt</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((exp) => (
                <tr key={exp.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(exp.expenseDate).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{exp.title}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 capitalize">
                      {exp.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{formatINR(exp.amount)}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs max-w-[200px] truncate">{exp.description || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {exp.receiptUrl ? (
                      <a href={exp.receiptUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">
                        View
                      </a>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleDelete(exp.id)}
                      data-testid={`expenses-delete-${exp.id}`}
                      className="p-1 rounded hover:bg-red-50 text-red-500 hover:text-red-700 transition"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t border-slate-200">
              <tr>
                <td colSpan={3} className="px-4 py-3 font-semibold text-slate-700">Total</td>
                <td className="px-4 py-3 text-right font-bold text-slate-900">{formatINR(totalAmount)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Add Expense Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" data-testid="expenses-add-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Add Expense</h3>
              <button onClick={() => setShowAddModal(false)} data-testid="expenses-modal-close-button" className="p-1 rounded hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {addError && (
              <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{addError}</div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={addForm.title}
                  onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
                  placeholder="e.g., AWS hosting, Office rent"
                  data-testid="expenses-modal-title-input"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={addForm.amount}
                    onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
                    placeholder="0.00"
                    data-testid="expenses-modal-amount-input"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={addForm.category}
                    onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                    data-testid="expenses-modal-category-select"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={addForm.expenseDate}
                  onChange={(e) => setAddForm({ ...addForm, expenseDate: e.target.value })}
                  data-testid="expenses-modal-date-input"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={addForm.description}
                  onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                  placeholder="Optional details"
                  rows={2}
                  data-testid="expenses-modal-description-input"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Receipt (optional)</label>
                <input
                  ref={receiptInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setAddReceipt(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => receiptInputRef.current?.click()}
                  data-testid="expenses-modal-receipt-button"
                  className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:border-indigo-400 hover:text-indigo-700 transition flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {addReceipt ? addReceipt.name : 'Upload receipt'}
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowAddModal(false)}
                data-testid="expenses-modal-cancel-button"
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddExpense}
                disabled={addSubmitting}
                data-testid="expenses-modal-add-button"
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {addSubmitting ? 'Adding...' : 'Add Expense'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
