// src/components/MaintenanceModal.tsx
import { useEffect, useState } from 'react';
import { X, AlertTriangle, Clock } from 'lucide-react';
import { http } from '../api/http';

interface MaintenanceBreak {
  enabled: boolean;
  message: string;
  startTime: string;
  endTime: string;
}

interface AdminControls {
  tutorRoleEnabled: boolean;
  studentRoleEnabled: boolean;
  maintenanceBreak: MaintenanceBreak | null;
}

const DISMISSED_KEY = 'tunect_maintenance_dismissed';

export default function MaintenanceModal() {
  const [maintenanceBreak, setMaintenanceBreak] = useState<MaintenanceBreak | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already dismissed for this session
    const dismissedUntil = sessionStorage.getItem(DISMISSED_KEY);
    if (dismissedUntil) {
      const until = new Date(dismissedUntil);
      if (until > new Date()) {
        setDismissed(true);
        return;
      }
    }

    // Fetch admin controls
    http.get<AdminControls>('/admin-controls/public')
      .then(({ data }) => {
        if (data?.maintenanceBreak?.enabled) {
          setMaintenanceBreak(data.maintenanceBreak);
        }
      })
      .catch(() => {
        // Silently fail – don't block the app
      });
  }, []);

  function handleDismiss() {
    setDismissed(true);
    // Dismiss for 1 hour in this session
    const until = new Date(Date.now() + 3600000).toISOString();
    sessionStorage.setItem(DISMISSED_KEY, until);
  }

  if (dismissed || !maintenanceBreak?.enabled) {
    return null;
  }

  const startDate = maintenanceBreak.startTime ? new Date(maintenanceBreak.startTime) : null;
  const endDate = maintenanceBreak.endTime ? new Date(maintenanceBreak.endTime) : null;
  const now = new Date();
  const isActive = startDate && endDate ? now >= startDate && now <= endDate : true;
  const isUpcoming = startDate ? now < startDate : false;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in slide-in-from-bottom-4">
        {/* Header */}
        <div className="bg-amber-500 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-white" />
            <h2 className="text-lg font-bold text-white">
              {isUpcoming ? 'Upcoming Maintenance' : 'Maintenance in Progress'}
            </h2>
          </div>
          <button
            onClick={handleDismiss}
            className="text-white/80 hover:text-white transition p-1 rounded-lg hover:bg-white/20"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-slate-700 text-sm leading-relaxed">
            {maintenanceBreak.message || 'We are performing scheduled maintenance. Please avoid adding availability or making bookings during this time.'}
          </p>

          {/* Time info */}
          {(startDate || endDate) && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-2">
              {startDate && (
                <div className="flex items-center gap-2 text-sm text-amber-800">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span className="font-medium">Starts:</span>
                  <span>{startDate.toLocaleString()}</span>
                </div>
              )}
              {endDate && (
                <div className="flex items-center gap-2 text-sm text-amber-800">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span className="font-medium">Ends:</span>
                  <span>{endDate.toLocaleString()}</span>
                </div>
              )}
              {isActive && (
                <div className="text-xs text-amber-600 font-medium mt-1">
                  Maintenance is currently active
                </div>
              )}
              {isUpcoming && (
                <div className="text-xs text-blue-600 font-medium mt-1">
                  Maintenance has not started yet
                </div>
              )}
            </div>
          )}

          <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500">
            <strong>Note:</strong> Please do not add availability or make any bookings during this maintenance window. 
            If you still wish to use the platform, you may do so at your own discretion.
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={handleDismiss}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 transition"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
