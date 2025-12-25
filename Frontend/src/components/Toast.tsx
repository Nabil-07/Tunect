// src/components/Toast.tsx
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { useEffect } from "react";

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastProps {
  type: ToastType;
  message: string;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ type, message, onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const configs = {
    success: {
      icon: <CheckCircle className="h-5 w-5" />,
      bgClass: "bg-green-50 border-green-200",
      textClass: "text-green-800",
      iconClass: "text-green-500",
    },
    error: {
      icon: <AlertCircle className="h-5 w-5" />,
      bgClass: "bg-red-50 border-red-200",
      textClass: "text-red-800",
      iconClass: "text-red-500",
    },
    warning: {
      icon: <AlertTriangle className="h-5 w-5" />,
      bgClass: "bg-amber-50 border-amber-200",
      textClass: "text-amber-800",
      iconClass: "text-amber-500",
    },
    info: {
      icon: <Info className="h-5 w-5" />,
      bgClass: "bg-blue-50 border-blue-200",
      textClass: "text-blue-800",
      iconClass: "text-blue-500",
    },
  };

  const config = configs[type];

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-xl border shadow-lg ${config.bgClass} animate-slideInRight max-w-md`}
    >
      <div className={config.iconClass}>{config.icon}</div>
      <p className={`flex-1 text-sm font-medium ${config.textClass}`}>{message}</p>
      <button
        onClick={onClose}
        className={`p-1 rounded-lg hover:bg-white/50 transition-colors ${config.textClass}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
