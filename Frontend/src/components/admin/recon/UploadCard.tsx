// src/components/admin/recon/UploadCard.tsx
import { useState } from 'react';

export default function UploadCard({
  title,
  subtitle,
  icon,
  onUpload,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onUpload: (file: File) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      await onUpload(file);
      setMsg('Uploaded successfully.');
      (e.target as any).value = ''; // reset
    } catch (err: any) {
      setMsg(err?.response?.data?.message || err?.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold">{title}</div>
          {subtitle && <div className="text-sm text-slate-600">{subtitle}</div>}
        </div>
        {icon}
      </div>
      <div className="mt-4">
        <label className={`inline-flex items-center gap-2 px-3 h-10 rounded-lg border cursor-pointer ${busy ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-50'}`}>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            disabled={busy}
            onChange={handleChange}
          />
          {busy ? 'Uploading…' : 'Choose File'}
        </label>
        {msg && <div className="text-sm mt-2">{msg}</div>}
      </div>
    </div>
  );
}
