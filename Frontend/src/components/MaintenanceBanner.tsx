import { useEffect, useState } from 'react';
import { X, AlertTriangle, Clock } from 'lucide-react';
import { http } from '../api/http';

interface MaintenanceBreak {
  enabled: boolean;
  message: string;
  startTime: string;
  endTime: string;
}

const BANNER_DISMISSED_KEY = 'tunect_maintenance_banner_dismissed';

export default function MaintenanceBanner() {
  const [maintenance, setMaintenance] = useState<MaintenanceBreak | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if user already dismissed this session
    const dismissedUntil = sessionStorage.getItem(BANNER_DISMISSED_KEY);
    if (dismissedUntil) {
      const until = new Date(dismissedUntil);
      if (until > new Date()) {
        setDismissed(true);
        return;
      }
    }

    http.get('/admin-controls/public')
      .then(({ data }) => {
        if (data?.maintenanceBreak?.enabled) {
          setMaintenance(data.maintenanceBreak);
        }
      })
      .catch(() => {});
  }, []);

  function handleDismiss() {
    setDismissed(true);
    // Stay dismissed for 1 hour
    const until = new Date(Date.now() + 3600000).toISOString();
    sessionStorage.setItem(BANNER_DISMISSED_KEY, until);
  }

  if (dismissed || !maintenance?.enabled) return null;

  const startDate = maintenance.startTime ? new Date(maintenance.startTime) : null;
  const endDate = maintenance.endTime ? new Date(maintenance.endTime) : null;
  const now = new Date();
  const isUpcoming = startDate ? now < startDate : false;

  const formatDate = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3 sm:px-5 sm:py-3.5">
        {/* Icon */}
        <div className="shrink-0 mt-0.5">
          <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="w-4.5 h-4.5 text-amber-600" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-amber-900">
              {isUpcoming ? 'Upcoming Maintenance' : 'Scheduled Maintenance'}
            </span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
              isUpcoming
                ? 'bg-blue-100 text-blue-700'
                : 'bg-amber-200 text-amber-800'
            }`}>
              {isUpcoming ? 'Upcoming' : 'Active'}
            </span>
          </div>

          <p className="text-sm text-amber-800 leading-relaxed">
            {maintenance.message || 'We are performing scheduled maintenance. Please avoid adding availability or making bookings during this time.'}
          </p>

          {/* Time range */}
          {(startDate || endDate) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-amber-700">
              {startDate && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  From: <span className="font-medium">{formatDate(startDate)}</span>
                </span>
              )}
              {endDate && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Until: <span className="font-medium">{formatDate(endDate)}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="shrink-0 mt-0.5 p-1 rounded-lg text-amber-400 hover:text-amber-700 hover:bg-amber-100 transition"
          aria-label="Dismiss maintenance banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
