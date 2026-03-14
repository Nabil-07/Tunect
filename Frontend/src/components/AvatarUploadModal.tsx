import { useEffect, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { getCroppedImageBlob } from '../utils/imageCrop';

type AvatarUploadModalProps = {
  open: boolean;
  uploading: boolean;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
  /** When true, only allow repositioning/cropping of the existing avatar (no camera/file-pick) */
  repositionMode?: boolean;
  /** Current avatar URL to load into cropper when in reposition mode */
  currentAvatarUrl?: string | null;
};

type Step = 'choose' | 'camera' | 'crop';

function cleanupObjectUrl(url: string | null) {
  if (!url) return;
  URL.revokeObjectURL(url);
}

export default function AvatarUploadModal({ open, uploading, onClose, onUpload, repositionMode, currentAvatarUrl }: AvatarUploadModalProps) {
  const [step, setStep] = useState<Step>('choose');
  const [error, setError] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState('avatar');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (repositionMode && currentAvatarUrl) {
      // In reposition mode, go directly to crop with the current avatar
      setImageSrc(currentAvatarUrl);
      setSourceName('avatar-reposition');
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setStep('crop');
    } else {
      setStep('choose');
    }
    return () => {
      stopCamera();
      // Don't revoke external URLs (reposition mode uses the existing avatar URL)
      if (!repositionMode && imageSrc) cleanupObjectUrl(imageSrc);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      stopCamera();
      cleanupObjectUrl(imageSrc);
    };
  }, [imageSrc]);

  const stopCamera = () => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const close = () => {
    stopCamera();
    onClose();
  };

  const setImageForCrop = (url: string, name: string) => {
    cleanupObjectUrl(imageSrc);
    setImageSrc(url);
    setSourceName(name || 'avatar');
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setError(null);
    setStep('crop');
  };

  const startCamera = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      setStep('camera');
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      }, 0);
    } catch {
      setError('Camera access was denied. Please allow camera permission and try again.');
    }
  };

  const onSelectDeviceFile: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setImageForCrop(objectUrl, file.name || 'avatar');
    event.target.value = '';
  };

  const captureFromCamera = async () => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas) {
      setError('Unable to capture image from camera.');
      return;
    }

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const context = canvas.getContext('2d');
    if (!context) {
      setError('Unable to capture image from camera.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.92);
    });

    if (!blob) {
      setError('Failed to capture camera photo.');
      return;
    }

    stopCamera();
    const capturedUrl = URL.createObjectURL(blob);
    setImageForCrop(capturedUrl, 'camera-photo.jpg');
  };

  const submitCrop = async () => {
    if (!imageSrc || !croppedAreaPixels) {
      setError('Please adjust crop area before uploading.');
      return;
    }

    try {
      setError(null);
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, 512, 'image/jpeg', 0.92);
      const file = new File([blob], `${sourceName.replace(/\.[^/.]+$/, '') || 'avatar'}.jpg`, {
        type: 'image/jpeg',
      });
      await onUpload(file);
      close();
    } catch (err: any) {
      setError(err?.message || 'Failed to crop image.');
    }
  };

  const submitLabel = (() => {
    if (uploading) return repositionMode ? 'Saving...' : 'Uploading...';
    return repositionMode ? 'Save' : 'Upload';
  })();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1200] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-xl border border-slate-200" data-testid="avatar-upload-modal">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">{repositionMode ? 'Adjust Position' : 'Change Photo'}</h3>
          <button type="button" onClick={close} className="text-slate-500 hover:text-slate-700" data-testid="avatar-upload-modal-close-btn">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {step === 'choose' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={startCamera}
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-left font-medium hover:bg-slate-50"
                data-testid="avatar-upload-modal-camera-btn"
              >
                Use Camera
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-left font-medium hover:bg-slate-50"
                data-testid="avatar-upload-modal-choose-file-btn"
              >
                Choose from Device
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onSelectDeviceFile}
                data-testid="avatar-upload-modal-file-input"
              />
            </div>
          )}

          {step === 'camera' && (
            <div className="space-y-3">
              <div className="rounded-lg overflow-hidden bg-black">
                <video ref={videoRef} className="w-full max-h-[360px] object-cover" playsInline muted />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setStep('choose');
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={captureFromCamera}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  data-testid="avatar-upload-modal-capture-btn"
                >
                  Capture
                </button>
              </div>
              <canvas ref={captureCanvasRef} className="hidden" />
            </div>
          )}

          {step === 'crop' && imageSrc && (
            <div className="space-y-3">
              <div className="relative h-80 w-full rounded-lg bg-slate-900">
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, croppedPixels) => setCroppedAreaPixels(croppedPixels)}
                  mediaProps={{ crossOrigin: 'anonymous' }}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Zoom</label>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div className="flex gap-2 justify-end">
                {!repositionMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setStep('choose');
                      setImageSrc(null);
                    }}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                    disabled={uploading}
                  >
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={submitCrop}
                  disabled={uploading}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  data-testid="avatar-upload-modal-upload-btn"
                >
                  {submitLabel}
                </button>
              </div>
            </div>
          )}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
