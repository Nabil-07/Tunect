// src/pages/tutor/content-library.tsx
import { useState, useEffect } from 'react';
import { Upload, FileText, Trash2, Edit, EyeOff, Download, Share2, PenTool, User, Clock } from 'lucide-react';
import api from '../../lib/apiClient';

type StudyMaterial = {
  id: string;
  title: string;
  description?: string;
  fileUrl: string;
  fileType: string;
  subject?: string;
  downloads: number;
  sharedWithCount?: number;
  createdAt: string;
  updatedAt: string;
};

type ShareableStudent = {
  id: string;
  name: string;
  email?: string | null;
  grade?: string | null;
  tokenBalance: number;
};

type WhiteboardNote = {
  id: string;
  bookingId: string;
  noteName: string;
  sharedAt: string;
  s3Url?: string;
  counterpartName: string;
  classDate?: string;
};

type TutorProfile = {
  subjects?: string[];
  classesTeach?: string[];
};

const SUBJECT_CLASS_SEPARATOR = ' | ';
const MAX_STUDY_MATERIAL_BYTES = 5 * 1024 * 1024;
const MAX_STUDY_MATERIAL_MB = 5;

const splitSubjectAndClass = (raw?: string) => {
  const value = (raw || '').trim();
  if (!value) {
    return { subject: '', classLevel: '' };
  }

  const [subject, classLevel] = value.split(SUBJECT_CLASS_SEPARATOR).map((part) => part.trim());
  return {
    subject: subject || value,
    classLevel: classLevel || '',
  };
};

const combineSubjectAndClass = (subject?: string, classLevel?: string) => {
  const trimmedSubject = (subject || '').trim();
  const trimmedClass = (classLevel || '').trim();

  if (!trimmedSubject) {
    return '';
  }

  return trimmedClass
    ? `${trimmedSubject}${SUBJECT_CLASS_SEPARATOR}${trimmedClass}`
    : trimmedSubject;
};

const isLocalhostRuntime = (() => {
  if (typeof window === 'undefined') {
    return false;
  }

  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
})();

const shouldUseMultipartUpload = (() => {
  if (globalThis.window === undefined) {
    return false;
  }

  const host = globalThis.window.location.hostname;
  const env = (import.meta.env.VITE_ENV || '').toString().toLowerCase();
  const isPreprodHost = host.endsWith('.preprod.tunectnow.com');
  const ua = globalThis.window.navigator?.userAgent || '';
  const isSafari = /safari/i.test(ua) && !/chrome|chromium|android|crios|fxios|edg/i.test(ua);
  return isLocalhostRuntime || env === 'preprod' || isPreprodHost || isSafari;
})();

const expandClassOptions = (rawOptions: string[]): string[] => {
  const expanded: string[] = [];

  rawOptions.forEach((option) => {
    const value = String(option || '').trim();
    if (!value) {
      return;
    }

    const rangeMatch = value.match(/(\d{1,2})\s*(?:-|to)\s*(\d{1,2})/i);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);

      if (Number.isFinite(start) && Number.isFinite(end) && start <= end && end - start <= 12) {
        for (let current = start; current <= end; current += 1) {
          expanded.push(`Grade ${current}`);
        }
        return;
      }
    }

    const singleGradeMatch = value.match(/(?:grade|class)\s*(\d{1,2})/i);
    if (singleGradeMatch) {
      expanded.push(`Grade ${Number(singleGradeMatch[1])}`);
      return;
    }

    expanded.push(value);
  });

  return Array.from(new Set(expanded));
};

const getArrayFromPayload = <T,>(payload: any, keys: string[]): T[] => {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value as T[];
    }
  }

  const nestedData = payload.data;
  if (Array.isArray(nestedData)) {
    return nestedData as T[];
  }

  if (nestedData && typeof nestedData === 'object') {
    for (const key of keys) {
      const value = nestedData[key];
      if (Array.isArray(value)) {
        return value as T[];
      }
    }
  }

  return [];
};

export default function ContentLibrary() {
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    subject: '',
    classLevel: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [classOptions, setClassOptions] = useState<string[]>([]);
  const [sharingMaterialId, setSharingMaterialId] = useState<string | null>(null);
  const [shareableStudents, setShareableStudents] = useState<ShareableStudent[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [sharingLoading, setSharingLoading] = useState(false);
  const [sharingSearch, setSharingSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingMaterialFileUrl, setEditingMaterialFileUrl] = useState<string | null>(null);
  const [editingMaterialFileName, setEditingMaterialFileName] = useState<string>('');
  const [whiteboardNotes, setWhiteboardNotes] = useState<WhiteboardNote[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFileSelection = (file: File | null) => {
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (file.type !== 'application/pdf') {
      setError('Only PDF files are allowed');
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_STUDY_MATERIAL_BYTES) {
      setError(`File size exceeds ${MAX_STUDY_MATERIAL_MB}MB limit. Please upload a smaller PDF.`);
      setSelectedFile(null);
      return;
    }

    setError(null);
    setSelectedFile(file);
  };

  const shouldFallbackToMultipart = (uploadErr: any) => {
    const responseStatus = Number(uploadErr?.response?.status || 0);
    const requestUrl = String(uploadErr?.config?.url || '').toLowerCase();
    const message = String(uploadErr?.message || '').toLowerCase();

    const isPresignEndpointFailure =
      requestUrl.includes('/uploads/presign') &&
      (responseStatus === 404 || responseStatus >= 500);

    const isS3PutFailure =
      message.includes('upload failed with status') ||
      message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      message.includes('network error') ||
      message.includes('load failed');

    return isPresignEndpointFailure || isS3PutFailure;
  };

  useEffect(() => {
    loadTutorProfile();
    loadMaterials();
    loadWhiteboardNotes();
  }, []);

  const loadWhiteboardNotes = async () => {
    try {
      const res = await api.get('/whiteboard/my-shared-notes');
      setWhiteboardNotes(res.data || []);
    } catch {
      // Whiteboard notes are optional
    }
  };

  const extractFileName = (fileUrl?: string) => {
    const value = String(fileUrl || '').trim();
    if (!value) {
      return '';
    }

    const decodeKeyFromSignedUrl = (urlValue: string) => {
      try {
        const parsed = new URL(urlValue, globalThis.window?.location?.origin || 'http://localhost');
        const marker = '/uploads/open/';
        const index = parsed.pathname.indexOf(marker);
        if (index < 0) {
          return '';
        }

        const token = parsed.pathname.slice(index + marker.length);
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

    const keyFromSignedUrl = decodeKeyFromSignedUrl(value);
    if (keyFromSignedUrl) {
      return decodeURIComponent(keyFromSignedUrl.split('/').filter(Boolean).pop() || '');
    }

    try {
      const url = new URL(value);
      const pathname = decodeURIComponent(url.pathname || '');
      const lastSegment = pathname.split('/').filter(Boolean).pop() || '';
      return lastSegment;
    } catch {
      const normalized = decodeURIComponent(value.split('?')[0] || value);
      return normalized.split('/').filter(Boolean).pop() || normalized;
    }
  };

  const loadTutorProfile = async () => {
    try {
      const res = await api.get('/tutors/me');
      const profile: TutorProfile = res.data?.tutor || res.data || {};
      setSubjectOptions(Array.isArray(profile.subjects) ? profile.subjects : []);
      setClassOptions(expandClassOptions(Array.isArray(profile.classesTeach) ? profile.classesTeach : []));
    } catch {
      setSubjectOptions([]);
      setClassOptions([]);
    }
  };

  const loadMaterials = async () => {
    try {
      setLoading(true);
      const res = await api.get('/study-materials/my');
      setMaterials(getArrayFromPayload<StudyMaterial>(res.data, ['materials', 'items']));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load materials');
    } finally {
      setLoading(false);
    }
  };

  const uploadWithMultipart = async (params: {
    file: File;
    title: string;
    description: string;
    subject?: string;
  }) => {
    const form = new FormData();
    form.append('file', params.file);
    form.append('title', params.title);
    if (params.description) {
      form.append('description', params.description);
    }
    if (params.subject) {
      form.append('subject', params.subject);
    }
    form.append('fileType', 'application/pdf');

    const res = await api.post('/study-materials', form);

    return res.data;
  };

  const uploadWithPresign = async (params: {
    file: File;
    title: string;
    description: string;
    subject?: string;
  }) => {
    const mimeType = params.file.type || 'application/pdf';
    const presignRes = await api.post('/uploads/presign', {
      useCase: 'study-materials',
      mimeType,
      size: params.file.size,
    });

    const uploadResponse = await fetch(presignRes.data.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
      },
      body: params.file,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed with status ${uploadResponse.status}`);
    }

    const createdMaterial = await api.post('/study-materials/finalize', {
      key: presignRes.data.key,
      title: params.title,
      description: params.description,
      fileType: mimeType,
      subject: params.subject || undefined,
    });

    return createdMaterial.data;
  };

  const updateWithMultipart = async (params: {
    id: string;
    title: string;
    description: string;
    subject?: string;
    file?: File;
  }) => {
    const form = new FormData();
    form.append('title', params.title);
    if (params.description) {
      form.append('description', params.description);
    }
    if (params.subject) {
      form.append('subject', params.subject);
    }
    if (params.file) {
      form.append('file', params.file);
      form.append('fileType', 'application/pdf');
    }

    const res = await api.put(`/study-materials/${params.id}`, form);

    return res.data;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setUploading(true);

    try {
      const materialSubject = combineSubjectAndClass(formData.subject, formData.classLevel);

      if (editingId) {
        let nextFileKey: string | undefined;
        let nextFileType: string | undefined;

        if (selectedFile) {
          const mimeType = selectedFile.type || 'application/pdf';
          if (mimeType !== 'application/pdf') {
            throw new Error('Only PDF files are allowed');
          }
          if (selectedFile.size > MAX_STUDY_MATERIAL_BYTES) {
            throw new Error(`File size exceeds ${MAX_STUDY_MATERIAL_MB}MB limit. Please upload a smaller PDF.`);
          }

          if (shouldUseMultipartUpload) {
            await updateWithMultipart({
              id: editingId,
              title: formData.title,
              description: formData.description,
              subject: materialSubject || undefined,
              file: selectedFile,
            });

            setSuccess('Material updated successfully!');
            resetForm();
            await loadMaterials();
            setTimeout(() => setSuccess(null), 3000);
            return;
          }

          try {
            const presignRes = await api.post('/uploads/presign', {
              useCase: 'study-materials',
              mimeType,
              size: selectedFile.size,
            });

            const uploadResponse = await fetch(presignRes.data.uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': mimeType,
              },
              body: selectedFile,
            });

            if (!uploadResponse.ok) {
              throw new Error(`Upload failed with status ${uploadResponse.status}`);
            }

            nextFileKey = presignRes.data.key;
            nextFileType = mimeType;
          } catch (uploadErr: any) {
            if (isLocalhostRuntime || shouldFallbackToMultipart(uploadErr)) {
              await updateWithMultipart({
                id: editingId,
                title: formData.title,
                description: formData.description,
                subject: materialSubject || undefined,
                file: selectedFile,
              });

              setSuccess('Material updated successfully!');
              resetForm();
              await loadMaterials();
              setTimeout(() => setSuccess(null), 3000);
              return;
            }

            throw uploadErr;
          }
        }

        await api.put(`/study-materials/${editingId}`, {
          title: formData.title,
          description: formData.description,
          subject: materialSubject || undefined,
          key: nextFileKey,
          fileType: nextFileType,
        });
        setSuccess('Material updated successfully!');
      } else {
        if (!selectedFile) {
          throw new Error('Please select a PDF file to upload');
        }

        const mimeType = selectedFile.type || 'application/pdf';
        if (mimeType !== 'application/pdf') {
          throw new Error('Only PDF files are allowed');
        }
        if (selectedFile.size > MAX_STUDY_MATERIAL_BYTES) {
          throw new Error(`File size exceeds ${MAX_STUDY_MATERIAL_MB}MB limit. Please upload a smaller PDF.`);
        }

        let createdMaterial: any;

        if (shouldUseMultipartUpload) {
          createdMaterial = await uploadWithMultipart({
            file: selectedFile,
            title: formData.title,
            description: formData.description,
            subject: materialSubject || undefined,
          });
        } else {
          try {
            createdMaterial = await uploadWithPresign({
              file: selectedFile,
              title: formData.title,
              description: formData.description,
              subject: materialSubject || undefined,
            });
          } catch (uploadErr: any) {
            if (shouldFallbackToMultipart(uploadErr)) {
              createdMaterial = await uploadWithMultipart({
                file: selectedFile,
                title: formData.title,
                description: formData.description,
                subject: materialSubject || undefined,
              });
            } else {
              throw uploadErr;
            }
          }
        }

        setSuccess('Material uploaded successfully!');

        if (createdMaterial?.id) {
          setSharingMaterialId(createdMaterial.id);
        }
      }
      
      resetForm();
      await loadMaterials();

      if (!editingId) {
        const latest = await api.get('/study-materials/my');
        const latestMaterials = getArrayFromPayload<StudyMaterial>(latest?.data, ['materials', 'items']);
        const newestId = latestMaterials[0]?.id;
        if (newestId) {
          await handleOpenShare(newestId);
        }
      }

      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save material');
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (material: StudyMaterial) => {
    setEditingId(material.id);
    const parsed = splitSubjectAndClass(material.subject);
    setFormData({
      title: material.title,
      description: material.description || '',
      subject: parsed.subject,
      classLevel: parsed.classLevel,
    });
    setSelectedFile(null);
    setEditingMaterialFileUrl(material.fileUrl || null);
    setEditingMaterialFileName(extractFileName(material.fileUrl));
    setShowForm(true);
  };

  const openDeleteModal = (material: StudyMaterial) => {
    setDeleteTarget({ id: material.id, title: material.title });
  };

  const handleViewCurrentFile = () => {
    const openUrl = async () => {
      if (!editingMaterialFileUrl) {
        return;
      }

      const resolveViewUrl = (rawUrl: string) => {
        try {
          const parsed = new URL(rawUrl, globalThis.window?.location?.origin || 'http://localhost');
          if (!parsed.pathname.startsWith('/uploads/open/')) {
            return parsed.toString();
          }

          const configuredApiBase = String(import.meta.env.VITE_API_URL || '').trim();
          const fallbackApiBase = isLocalhostRuntime ? 'http://localhost:3000' : parsed.origin;
          const effectiveApiBase = configuredApiBase || fallbackApiBase;

          const apiBase = new URL(effectiveApiBase);
          if (parsed.origin !== apiBase.origin) {
            return `${apiBase.origin}${parsed.pathname}${parsed.search}`;
          }

          return parsed.toString();
        } catch {
          return rawUrl;
        }
      };

      const finalViewUrl = resolveViewUrl(editingMaterialFileUrl);

      if (finalViewUrl.includes('/uploads/open/')) {
        try {
          const response = await fetch(finalViewUrl, { method: 'GET' });
          if (!response.ok) {
            throw new Error(`Failed to open file (${response.status})`);
          }

          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          window.open(blobUrl, '_blank', 'noopener,noreferrer');
          setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
          return;
        } catch {
          setError('Unable to open file right now. Upload proxy route is unavailable.');
          return;
        }
      }

      window.open(finalViewUrl, '_blank', 'noopener,noreferrer');
    };

    void openUrl();
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id) return;

    try {
      setDeleting(true);
      await api.delete(`/study-materials/${deleteTarget.id}`);
      setSuccess('Material deleted successfully!');
      await loadMaterials();
      setDeleteTarget(null);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete material');
    } finally {
      setDeleting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      subject: '',
      classLevel: '',
    });
    setSelectedFile(null);
    setEditingId(null);
    setEditingMaterialFileUrl(null);
    setEditingMaterialFileName('');
    setShowForm(false);
  };

  const handleOpenShare = async (materialId: string) => {
    try {
      setSharingLoading(true);
      setSharingMaterialId(materialId);
      setSharingSearch('');
      const res = await api.get(`/study-materials/${materialId}/share-targets`);
      setShareableStudents(getArrayFromPayload<ShareableStudent>(res.data, ['eligibleStudents', 'students', 'items']));
      setSelectedStudentIds(getArrayFromPayload<string>(res.data, ['sharedStudentIds', 'selectedStudentIds', 'studentIds']));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load students for sharing');
      setSharingMaterialId(null);
    } finally {
      setSharingLoading(false);
    }
  };

  const handleSelectAllStudents = () => {
    setSelectedStudentIds(shareableStudents.map((student) => student.id));
  };

  const handleClearStudents = () => {
    setSelectedStudentIds([]);
  };

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId],
    );
  };

  const handleSaveShare = async () => {
    if (!sharingMaterialId) return;

    try {
      setSharingLoading(true);
      await api.post(`/study-materials/${sharingMaterialId}/share`, {
        studentIds: selectedStudentIds,
      });
      setSuccess('Sharing updated successfully!');
      setSharingMaterialId(null);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update sharing');
    } finally {
      setSharingLoading(false);
    }
  };

  const filteredStudents = shareableStudents.filter((student) => {
    const q = sharingSearch.trim().toLowerCase();
    if (!q) {
      return true;
    }

    return [student.name, student.email || '', student.grade || '']
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

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
                  PDF File {!editingId && '*'}
                </label>
                <input
                  type="file"
                  accept="application/pdf"
                  required={!editingId}
                  onChange={(e) => handleFileSelection(e.target.files?.[0] || null)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-slate-500">Max file size: 5MB (PDF only)</p>
                {editingId && (
                  <div className="mt-1 space-y-1">
                    {editingMaterialFileUrl && (
                      <p className="text-xs text-slate-600">
                        Current file: <span className="font-medium">{editingMaterialFileName || 'PDF file'}</span>
                        {' '}
                        <button
                          type="button"
                          onClick={handleViewCurrentFile}
                          className="font-semibold text-emerald-700 hover:underline"
                        >
                          View
                        </button>
                      </p>
                    )}
                    {selectedFile ? (
                      <p className="text-xs text-emerald-700">New file selected: {selectedFile.name}</p>
                    ) : (
                      <p className="text-xs text-slate-500">Leave empty to keep the existing file.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  {subjectOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Class / Grade
                </label>
                <select
                  value={formData.classLevel}
                  onChange={(e) => setFormData({ ...formData, classLevel: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">No specific class</option>
                  {classOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center pt-6">
                {editingId ? (
                  <button
                    type="button"
                    onClick={() => handleOpenShare(editingId)}
                    disabled={sharingLoading}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <Share2 className="h-4 w-4" />
                    Share with students
                  </button>
                ) : (
                  <span className="text-sm text-slate-600">
                    Sharing is managed per material from the list below.
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={uploading}
                className="rounded-xl bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                {uploading ? 'Saving...' : editingId ? 'Update' : 'Upload'}
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

      {/* Whiteboard Shared Notes */}
      {whiteboardNotes.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <PenTool className="h-5 w-5 text-ocean-600" />
              Whiteboard Shared Notes
            </h2>
          </div>
          <div className="divide-y divide-slate-200">
            {whiteboardNotes.map((wb) => (
              <div key={wb.id} className="px-6 py-4 hover:bg-slate-50 transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <PenTool className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-slate-900">{wb.noteName}</h3>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
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
                  </div>
                </div>
              </div>
            ))}
          </div>
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
                      {(() => {
                        const parsed = splitSubjectAndClass(material.subject);
                        return (
                          <>
                      <h3 className="font-semibold text-slate-900">
                        {material.title}
                      </h3>
                      {material.description && (
                        <p className="text-sm text-slate-600 mt-1">
                          {material.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500">
                        {parsed.subject && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5">
                            {parsed.subject}
                          </span>
                        )}
                        {parsed.classLevel && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5">
                            {parsed.classLevel}
                          </span>
                        )}
                        <span className="rounded-full bg-slate-100 px-2 py-0.5">
                          {material.fileType.toUpperCase()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Download className="h-3 w-3" />
                          {material.downloads} downloads
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5">
                          Shared with {material.sharedWithCount || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <EyeOff className="h-3 w-3" />
                          Private share
                        </span>
                      </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleOpenShare(material.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      title="Share"
                    >
                      <Share2 className="h-4 w-4" />
                      Share
                    </button>
                    <button
                      onClick={() => handleEdit(material)}
                      className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                      title="Edit"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => openDeleteModal(material)}
                      className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {sharingMaterialId === material.id && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h4 className="text-sm font-semibold text-slate-800 mb-3">
                      Share with enrolled students who have active tutor tokens
                    </h4>

                    {sharingLoading ? (
                      <p className="text-sm text-slate-600">Loading students...</p>
                    ) : shareableStudents.length === 0 ? (
                      <p className="text-sm text-slate-600">
                        No eligible students available.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleSelectAllStudents}
                            type="button"
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Select all
                          </button>
                          <button
                            onClick={handleClearStudents}
                            type="button"
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Clear
                          </button>
                          <span className="text-xs text-slate-500">
                            {selectedStudentIds.length} selected
                          </span>
                        </div>

                        <input
                          type="text"
                          value={sharingSearch}
                          onChange={(e) => setSharingSearch(e.target.value)}
                          placeholder="Search student by name, email, or grade"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        />

                        <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-300 bg-white p-2">
                          {filteredStudents.length === 0 ? (
                            <p className="px-2 py-3 text-xs text-slate-500">No students match your search.</p>
                          ) : (
                            <div className="space-y-1">
                              {filteredStudents.map((student) => (
                                <label
                                  key={student.id}
                                  className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 hover:bg-slate-50"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedStudentIds.includes(student.id)}
                                    onChange={() => toggleStudentSelection(student.id)}
                                    className="mt-0.5 h-4 w-4"
                                  />
                                  <span className="text-sm text-slate-700">
                                    <span className="block font-medium text-slate-900">{student.name}</span>
                                    <span className="block text-xs text-slate-500">
                                      {student.email || 'No email'}
                                      {student.grade ? ` • ${student.grade}` : ''}
                                      {` • ${student.tokenBalance} tokens`}
                                    </span>
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={handleSaveShare}
                        disabled={sharingLoading}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        Save Sharing
                      </button>
                      <button
                        onClick={() => setSharingMaterialId(null)}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">Delete material?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete{' '}
              <span className="font-semibold text-slate-800">{deleteTarget.title}</span>?
              {' '}This action cannot be undone.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleting}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
