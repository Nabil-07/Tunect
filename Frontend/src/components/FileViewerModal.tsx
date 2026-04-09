import { useEffect, useState } from 'react';
import { X, Download, Loader2 } from 'lucide-react';

interface FileViewerModalProps {
  open: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName: string;
  fileType: string;
}

const WORD_TYPES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default function FileViewerModal({ open, onClose, fileUrl, fileName, fileType }: FileViewerModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blobLoading, setBlobLoading] = useState(false);
  const [blobError, setBlobError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Fetch file as blob to avoid CSP iframe issues with backend proxy URLs
  useEffect(() => {
    if (!open || !fileUrl) return;
    let revoked = false;
    const isImage = IMAGE_TYPES.has(fileType);
    const isWord = WORD_TYPES.has(fileType);
    // Only need blob for PDF (iframe) and images; Word uses direct download link
    if (isWord) return;

    setBlobLoading(true);
    setBlobError(null);
    setBlobUrl(null);

    fetch(fileUrl, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch file');
        return r.blob();
      })
      .then((blob) => {
        if (revoked) return;
        // Use correct MIME so browser can render inline
        const typed = isImage
          ? new Blob([blob], { type: fileType })
          : new Blob([blob], { type: 'application/pdf' });
        setBlobUrl(URL.createObjectURL(typed));
      })
      .catch(() => {
        if (!revoked) setBlobError('Unable to load file preview.');
      })
      .finally(() => {
        if (!revoked) setBlobLoading(false);
      });

    return () => {
      revoked = true;
      setBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [open, fileUrl, fileType]);

  if (!open) return null;

  const isImage = IMAGE_TYPES.has(fileType);
  const isWord = WORD_TYPES.has(fileType);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      data-testid="file-viewer-modal"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-800 truncate">{fileName}</h3>
          <button
            onClick={onClose}
            data-testid="file-viewer-close"
            className="rounded-lg p-1.5 hover:bg-slate-100 transition"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {isWord ? (
            <div className="text-center py-16 space-y-4">
              <Download className="h-12 w-12 text-slate-400 mx-auto" />
              <p className="text-slate-600">Word documents cannot be previewed in the browser.</p>
              <a
                href={fileUrl}
                download={fileName}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-ocean-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ocean-800 transition"
              >
                <Download className="h-4 w-4" /> Download {fileName}
              </a>
            </div>
          ) : isImage ? (
            blobLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              </div>
            ) : blobError ? (
              <p className="text-center text-sm text-red-600 py-16">{blobError}</p>
            ) : blobUrl ? (
            <div className="flex items-center justify-center">
              <img
                src={blobUrl}
                alt={fileName}
                className="max-h-[80vh] object-contain rounded-lg"
              />
            </div>
            ) : null
          ) : (
            /* PDF or other — render blob in iframe to avoid CSP issues */
            blobLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              </div>
            ) : blobError ? (
              <p className="text-center text-sm text-red-600 py-16">{blobError}</p>
            ) : blobUrl ? (
            <iframe
              src={blobUrl}
              title={fileName}
              className="w-full rounded-lg border"
              style={{ height: '80vh' }}
            />
            ) : null
          )}
        </div>
      </div>
    </div>
  );
}
