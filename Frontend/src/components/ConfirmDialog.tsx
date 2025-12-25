// src/components/ConfirmDialog.tsx
import { AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";
import Modal from "./Modal";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "info" | "warning" | "danger" | "success";
  isLoading?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "info",
  isLoading = false,
}: ConfirmDialogProps) {
  const variants = {
    info: {
      icon: <Info className="h-12 w-12 text-blue-500" />,
      confirmClass: "bg-blue-600 hover:bg-blue-700 text-white",
      bgClass: "bg-blue-50",
    },
    warning: {
      icon: <AlertTriangle className="h-12 w-12 text-amber-500" />,
      confirmClass: "bg-amber-600 hover:bg-amber-700 text-white",
      bgClass: "bg-amber-50",
    },
    danger: {
      icon: <AlertCircle className="h-12 w-12 text-red-500" />,
      confirmClass: "bg-red-600 hover:bg-red-700 text-white",
      bgClass: "bg-red-50",
    },
    success: {
      icon: <CheckCircle className="h-12 w-12 text-green-500" />,
      confirmClass: "bg-green-600 hover:bg-green-700 text-white",
      bgClass: "bg-green-50",
    },
  };

  const config = variants[variant];

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" showCloseButton={false}>
      <div className="p-6">
        {/* Icon */}
        <div className={`flex justify-center mb-4 p-4 rounded-full ${config.bgClass} w-fit mx-auto`}>
          {config.icon}
        </div>

        {/* Title */}
        {title && <h3 className="text-xl font-semibold text-center text-slate-900 mb-2">{title}</h3>}

        {/* Message */}
        <p className="text-slate-600 text-center mb-6 whitespace-pre-line">{message}</p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${config.confirmClass}`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Loading...
              </span>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
