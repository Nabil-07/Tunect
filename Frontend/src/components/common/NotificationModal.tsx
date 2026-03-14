import { CheckCircle, X } from 'lucide-react';
import { useEffect } from 'react';

interface NotificationModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  type?: 'success' | 'info' | 'warning' | 'error';
  confirmText?: string;
}

export default function NotificationModal({
  open,
  onClose,
  title,
  message,
  type = 'success',
  confirmText = 'OK',
}: NotificationModalProps) {
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000); // Auto-close after 5 seconds
      return () => clearTimeout(timer);
    }
  }, [open, onClose]);

  if (!open) return null;

  const typeStyles = {
    success: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      icon: 'text-green-600',
      title: 'text-green-900',
      message: 'text-green-700',
      button: 'bg-green-600 hover:bg-green-700',
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      icon: 'text-blue-600',
      title: 'text-blue-900',
      message: 'text-blue-700',
      button: 'bg-blue-600 hover:bg-blue-700',
    },
    warning: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      icon: 'text-amber-600',
      title: 'text-amber-900',
      message: 'text-amber-700',
      button: 'bg-amber-600 hover:bg-amber-700',
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      icon: 'text-red-600',
      title: 'text-red-900',
      message: 'text-red-700',
      button: 'bg-red-600 hover:bg-red-700',
    },
  };

  const styles = typeStyles[type];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4" data-testid="notification-modal">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in duration-200">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close"
          data-testid="notification-modal-close-btn"
        >
          <X size={20} />
        </button>

        {/* Content */}
        <div className={`rounded-t-2xl border-b ${styles.border} ${styles.bg} px-6 py-8`}>
          <div className="flex flex-col items-center text-center">
            <div className={`mb-4 rounded-full bg-white p-3 shadow-md ${styles.icon}`}>
              <CheckCircle size={32} />
            </div>
            {title && (
              <h3 className={`mb-2 text-xl font-semibold ${styles.title}`}>
                {title}
              </h3>
            )}
            <p className={`text-sm ${styles.message}`}>{message}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4">
          <button
            onClick={onClose}
            className={`w-full rounded-xl px-6 py-3 font-medium text-white transition ${styles.button}`}
            data-testid="notification-modal-ok-btn"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
