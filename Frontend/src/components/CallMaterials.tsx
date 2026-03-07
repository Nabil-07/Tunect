import { useState, useEffect, useCallback } from 'react';
import { FileText, Share2, ExternalLink, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../lib/apiClient';

interface Material {
  id: string;
  title: string;
  description?: string;
  fileUrl: string;
  fileType: string;
  subject?: string;
}

interface CallMaterialsProps {
  readonly studentId: string;
  readonly onOpenInClass?: (pdfUrl: string, title: string) => void;
}

export default function CallMaterials({ studentId, onOpenInClass }: CallMaterialsProps) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set());
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMaterials();
  }, []);

  const loadMaterials = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/study-materials/my');
      const data = res.data;
      const items: Material[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.materials)
          ? data.materials
          : Array.isArray(data?.items)
            ? data.items
            : [];
      setMaterials(items);
    } catch {
      setError('Failed to load materials');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = useCallback(async (materialId: string) => {
    if (!studentId) {
      setError('No student in this session to share with');
      return;
    }
    setSharingId(materialId);
    setError(null);
    try {
      await api.post(`/study-materials/${materialId}/share`, {
        studentIds: [studentId],
      });
      setSharedIds(prev => new Set(prev).add(materialId));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to share material');
    } finally {
      setSharingId(null);
    }
  }, [studentId]);

  const handleOpenInClass = useCallback(async (material: Material) => {
    if (!onOpenInClass) return;
    setOpeningId(material.id);
    setError(null);
    try {
      // Fetch material detail to get an access-ready file URL
      const res = await api.get(`/study-materials/${material.id}`);
      const fileUrl = res.data?.fileUrl || material.fileUrl;
      if (!fileUrl) {
        setError('No file URL available for this material');
        return;
      }
      onOpenInClass(fileUrl, material.title || 'Material');
    } catch (err: any) {
      console.error('Failed to open material in class:', err);
      setError('Failed to open PDF. Please try again.');
    } finally {
      setOpeningId(null);
    }
  }, [onOpenInClass]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (materials.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-slate-500">
        <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
        <p>No materials in your library.</p>
        <p className="text-xs mt-1">Upload materials from Content Library.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {materials.map(m => (
        <div key={m.id} className="rounded-lg border p-3 space-y-2">
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 truncate">{m.title}</p>
              {m.subject && (
                <p className="text-xs text-slate-500">{m.subject}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={sharingId === m.id || sharedIds.has(m.id)}
              onClick={() => handleShare(m.id)}
              className="flex-1 flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium border transition disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              {sharedIds.has(m.id) ? (
                <><CheckCircle2 className="h-3 w-3 text-green-600" /> Shared</>
              ) : sharingId === m.id ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> Sharing…</>
              ) : (
                <><Share2 className="h-3 w-3" /> Share</>
              )}
            </button>
            {onOpenInClass && (
              <button
                type="button"
                disabled={openingId === m.id}
                onClick={() => handleOpenInClass(m)}
                className="flex-1 flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium bg-slate-900 text-white transition hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {openingId === m.id ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Loading…</>
                ) : (
                  <><ExternalLink className="h-3 w-3" /> Open in Class</>
                )}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
