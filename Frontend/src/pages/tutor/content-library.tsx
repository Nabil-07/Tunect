// src/pages/tutor/content-library.tsx
import { useState, useEffect } from 'react';
import { Upload, FileText, Trash2, Edit, Eye, EyeOff, Download } from 'lucide-react';
import api from '../../lib/apiClient';
import { SUBJECT_OPTIONS } from '../../constants/subjects';

type StudyMaterial = {
  id: string;
  title: string;
  description?: string;
  fileUrl: string;
  fileType: string;
  subject?: string;
  isPublic: boolean;
  downloads: number;
  createdAt: string;
  updatedAt: string;
};

export default function ContentLibrary() {
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    fileUrl: '',
    fileType: 'pdf',
    subject: '',
    isPublic: true,
  });

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadMaterials();
  }, []);

  const loadMaterials = async () => {
    try {
      setLoading(true);
      const res = await api.get('/study-materials/my');
      setMaterials(res.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load materials');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      if (editingId) {
        await api.patch(`/study-materials/${editingId}`, formData);
        setSuccess('Material updated successfully!');
      } else {
        await api.post('/study-materials', formData);
        setSuccess('Material uploaded successfully!');
      }
      
      resetForm();
      loadMaterials();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save material');
    }
  };

  const handleEdit = (material: StudyMaterial) => {
    setEditingId(material.id);
    setFormData({
      title: material.title,
      description: material.description || '',
      fileUrl: material.fileUrl,
      fileType: material.fileType,
      subject: material.subject || '',
      isPublic: material.isPublic,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this material?')) return;

    try {
      await api.delete(`/study-materials/${id}`);
      setSuccess('Material deleted successfully!');
      loadMaterials();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete material');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      fileUrl: '',
      fileType: 'pdf',
      subject: '',
      isPublic: true,
    });
    setEditingId(null);
    setShowForm(false);
  };

  return (
    <main className="container-px mx-auto py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Content Library</h1>
          <p className="text-sm text-slate-600 mt-1">
            Upload and share study materials with your students
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <Upload className="h-4 w-4" />
          Upload Material
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {/* Upload Form */}
      {showForm && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">
            {editingId ? 'Edit Material' : 'Upload New Material'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Title *
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                placeholder="e.g., Algebra Practice Worksheet"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                placeholder="Brief description of the material"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  File URL *
                </label>
                <input
                  type="url"
                  required
                  value={formData.fileUrl}
                  onChange={(e) => setFormData({ ...formData, fileUrl: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  placeholder="https://example.com/file.pdf"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  File Type *
                </label>
                <select
                  required
                  value={formData.fileType}
                  onChange={(e) => setFormData({ ...formData, fileType: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="pdf">PDF</option>
                  <option value="doc">Word Document</option>
                  <option value="ppt">PowerPoint</option>
                  <option value="video">Video</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Subject
                </label>
                <select
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">No specific subject</option>
                  {SUBJECT_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isPublic}
                    onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm font-medium text-slate-700">
                    Share publicly with all students
                  </span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="rounded-xl bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                {editingId ? 'Update' : 'Upload'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-300 px-6 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Materials List */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold">Your Materials</h2>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-600">
            Loading materials...
          </div>
        ) : materials.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-600">
            No materials yet. Upload your first study material to get started!
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {materials.map((material) => (
              <div
                key={material.id}
                className="px-6 py-4 hover:bg-slate-50 transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <FileText className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-slate-900">
                        {material.title}
                      </h3>
                      {material.description && (
                        <p className="text-sm text-slate-600 mt-1">
                          {material.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500">
                        {material.subject && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5">
                            {material.subject}
                          </span>
                        )}
                        <span className="rounded-full bg-slate-100 px-2 py-0.5">
                          {material.fileType.toUpperCase()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Download className="h-3 w-3" />
                          {material.downloads} downloads
                        </span>
                        <span className="flex items-center gap-1">
                          {material.isPublic ? (
                            <>
                              <Eye className="h-3 w-3" />
                              Public
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-3 w-3" />
                              Private
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleEdit(material)}
                      className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                      title="Edit"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(material.id)}
                      className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
