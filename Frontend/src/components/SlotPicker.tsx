import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CalendarDays, Clock, Loader2, RotateCw, X } from 'lucide-react';
import { assignSlot, getTutorAvailability, listBookings } from '../services/bookingsService';
import { http as api } from '../api/http';
import { getTutor } from '../services/tutorService';
import { addToWaitlist } from '../services/waitlistService';
import NotificationModal from './common/NotificationModal';
import { getTimezoneAbbr } from '../utils/timezone';

type AvailabilitySlot = {
  id?: string;
  startTime: string; // ISO
  endTime: string;   // ISO
  subject?: string;
  title?: string;
};

export default function SlotPicker({
  open,
  bookingId,
  tutorId,
  isDemo = false,
  tz,
  days = 30,
  onClose,
  onAssigned,
}: {
  readonly open: boolean;
  readonly bookingId: string;
  readonly tutorId: string;
  readonly isDemo?: boolean;
  readonly tz?: string;          // optional IANA timezone header passthrough
  readonly days?: number;        // how many days ahead to fetch (default 14)
  readonly onClose: () => void;
  readonly onAssigned: (payload: { startTime: string; endTime: string }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [bookedSlots, setBookedSlots] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [step, setStep] = useState<'slots' | 'details'>('slots');
  const [studySubject, setStudySubject] = useState('');
  const [studyGrade, setStudyGrade] = useState('');
  const [studyModule, setStudyModule] = useState('');
  const [tutorSubjects, setTutorSubjects] = useState<string[]>([]);
  const [tutorGrades, setTutorGrades] = useState<string[]>([]);

  const dtDate = useMemo(
    () => new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    []
  );
  const dtTime = useMemo(
    () => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }),
    []
  );

  // Detect user's timezone for display
  const userTimezone = useMemo(() => {
    const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    // Get short abbreviation like "IST", "GST", "EST"
    const abbr = getTimezoneAbbr();
    return { name: tzName, abbr };
  }, []);

  const keyForSlot = (s: AvailabilitySlot) =>
    `${s.id ?? ''}::${s.startTime}::${s.endTime}`;

  const fetchSlots = useCallback(async () => {
    if (!open || !tutorId) return;
    setLoading(true);
    setError(null);
    try {
      const from = new Date();
      const to = new Date();
      to.setDate(to.getDate() + Math.max(1, days));
      const durationMin = isDemo ? 30 : 60;

      const params = { from: from.toISOString(), to: to.toISOString(), durationMin, stepMin: 15, _t: Date.now() } as const;
      const normalizeSlices = (data: any) => {
        if (Array.isArray(data?.slices)) return data.slices;
        if (Array.isArray(data)) return data;
        return [];
      };
      
      // Fetch availability and booked slots in parallel
      const [availabilityRes, bookedRes] = await Promise.all([
        (async () => {
          try {
            const { data } = await api.get(`/availability/tutor/${tutorId}/bookable`, { params });
            return normalizeSlices(data);
          } catch {
            try {
              const { data } = await api.get(`/availability/tutors/${tutorId}/bookable`, { params });
              return normalizeSlices(data);
            } catch {
              try {
              const { data } = await api.get(`/availability/bookable/${tutorId}`, { params });
              return normalizeSlices(data);
            } catch {
              return await getTutorAvailability(tutorId, from.toISOString(), to.toISOString(), tz);
              }
            }
          }
        })(),
        listBookings({ tutorId, status: 'CONFIRMED', tz }).catch(() => [])
      ]);
      
      const filtered = (Array.isArray(availabilityRes) ? availabilityRes : []).filter((s) => {
        const start = new Date(s.startTime).getTime();
        const end = new Date(s.endTime).getTime();
        return Number.isFinite(start) && Number.isFinite(end) && end > start;
      });
      const unique = new Map<string, AvailabilitySlot>();
      filtered.forEach((slot: any) => {
        const key = `${slot.startTime}::${slot.endTime}`;
        if (!unique.has(key)) {
          unique.set(key, {
            id: slot.id,
            startTime: slot.startTime,
            endTime: slot.endTime,
            subject: slot.subject || slot.title,
            title: slot.title,
          });
        }
      });
      setSlots(Array.from(unique.values()));
      
      // Create a set of booked time ranges for quick lookup
      const booked = new Set<string>();
      if (Array.isArray(bookedRes)) {
        bookedRes.forEach(booking => {
          if (booking.startTime && booking.endTime) {
            booked.add(`${booking.startTime}::${booking.endTime}`);
          }
        });
      }
      setBookedSlots(booked);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load availability');
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [open, tutorId, isDemo, days, tz]);

  // initial + whenever reopened
  useEffect(() => {
    if (open) fetchSlots();
    // clear selection and step each open
    if (open) { setSelectedKey(null); setStep('slots'); setStudySubject(''); setStudyGrade(''); setStudyModule(''); }
  }, [open, fetchSlots]);

  // Fetch tutor's subject/grade data for dropdowns
  useEffect(() => {
    if (!open || !tutorId) return;
    getTutor(tutorId)
      .then((t: any) => {
        // Extract subjects from classSubjectMappings
        const mappings = Array.isArray(t?.classSubjectMappings) ? t.classSubjectMappings : [];
        const subjectSet = new Set<string>();
        const gradeSet = new Set<string>();
        for (const m of mappings) {
          const cr = String(m?.classRange || '').trim();
          const subjects = Array.isArray(m?.subjects) ? m.subjects : [];
          for (const s of subjects) {
            const sv = String(s || '').trim();
            if (sv) subjectSet.add(sv);
          }
          if (cr) {
            // Expand ranges like "Grade 6-8" → individual options
            const rangeMatch = /(?:Grade|Class)\s*(\d+)\s*[-–to]+\s*(\d+)/i.exec(cr);
            if (rangeMatch) {
              const lo = Number.parseInt(rangeMatch[1], 10);
              const hi = Number.parseInt(rangeMatch[2], 10);
              for (let g = lo; g <= hi; g++) gradeSet.add(`Grade ${g}`);
            } else {
              gradeSet.add(cr);
            }
          }
        }
        // Fallback to tutor.subjects array
        if (subjectSet.size === 0 && Array.isArray(t?.subjects)) {
          for (const s of t.subjects) {
            const sv = String(s || '').trim();
            if (sv) subjectSet.add(sv);
          }
        }
        // Fallback to tutor.classesTeach array
        if (gradeSet.size === 0 && Array.isArray(t?.classesTeach)) {
          for (const c of t.classesTeach) {
            const cv = String(c || '').trim();
            if (cv) gradeSet.add(cv);
          }
        }
        setTutorSubjects(Array.from(subjectSet));
        // Sort grades numerically
        const sortedGrades = Array.from(gradeSet).sort((a, b) => {
          const na = Number.parseInt(a.replaceAll(/\D/g, ''), 10);
          const nb = Number.parseInt(b.replaceAll(/\D/g, ''), 10);
          if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
          return a.localeCompare(b);
        });
        setTutorGrades(sortedGrades);
      })
      .catch(() => {
        setTutorSubjects([]);
        setTutorGrades([]);
      });
  }, [open, tutorId]);

  const grouped = useMemo(() => {
    const map = new Map<string, AvailabilitySlot[]>();
    const now = new Date();
    
    for (const s of slots) {
      const slotKey = `${s.startTime}::${s.endTime}`;
      const startTime = new Date(s.startTime);
      
      // Skip if slot is already booked or in the past
      if (bookedSlots.has(slotKey) || startTime < now) {
        continue;
      }
      
      const label = dtDate.format(startTime);
      const arr = map.get(label) || [];
      arr.push(s);
      map.set(label, arr);
    }
    return Array.from(map.entries()).map(([day, arr]) => {
      const items = [...arr].sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
      return { day, items };
    });
  }, [slots, bookedSlots, dtDate]);

  async function handleAssign() {
    if (!selectedKey) return;
    const s = slots.find((x) => keyForSlot(x) === selectedKey);
    if (!s) return;

    if (!studySubject.trim() || !studyGrade.trim()) {
      setError('Please select a subject and grade before confirming.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await assignSlot(
        bookingId,
        {
          startTime: s.startTime,
          endTime: s.endTime,
          subject: studySubject.trim() || undefined,
          grade: studyGrade.trim() || undefined,
          module: studyModule.trim() || undefined,
        },
        tz
      );
      onAssigned({ startTime: s.startTime, endTime: s.endTime });
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to assign slot');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNotifyMe() {
    setJoiningWaitlist(true);
    setError(null);
    try {
      // Add to waitlist with a flexible time range
      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7); // Next 7 days
      
      await addToWaitlist({
        tutorId,
        requestedStartTime: now.toISOString(),
        requestedEndTime: futureDate.toISOString(),
        notes: `Notified from booking ${bookingId}`,
      });
      
      setShowNotification(true);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to join waitlist');
    } finally {
      setJoiningWaitlist(false);
    }
  }

  const handleNotificationClose = () => {
    setShowNotification(false);
    onClose();
  };

  if (!open) return null;

  let content: React.ReactNode;
  if (loading) {
    content = (
      <div className="flex items-center justify-center py-12 text-slate-600">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading availability…
      </div>
    );
  } else if (error) {
    content = (
      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    );
  } else if (grouped.length === 0) {
    content = (
      <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-center">
        <p className="text-sm font-medium text-purple-900 mb-2">
          No available slots at the moment
        </p>
        <p className="text-xs text-purple-700">
          Click "Notify Me" below to get notified in the app when this tutor adds new availability
        </p>
      </div>
    );
  } else {
    content = grouped.map(({ day, items }) => (
      <div key={day} className="mb-4">
        <div className="mb-2 text-sm font-semibold text-slate-700">{day}</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((s) => {
            const st = new Date(s.startTime);
            const et = new Date(s.endTime);
            const label = `${dtTime.format(st)} – ${dtTime.format(et)}`;
            const key = keyForSlot(s);
            const active = selectedKey === key;
            return (
              <button
                key={key}
                onClick={() => setSelectedKey(key)}
                data-testid={`slot-picker-slot-btn-${s.id || key}`}
                className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-2 text-sm transition ${
                  active
                    ? 'border-ocean-600 bg-ocean-50 text-ocean-900'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-500" />
                  <span>{label}</span>
                </div>
                {(s.subject || s.title) && (
                  <span className="text-xs text-slate-600">
                    Subject: {s.subject || s.title}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    ));
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" data-testid="slot-picker">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl" data-testid="slot-picker-container">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-ocean-700" />
            <h3 className="text-lg font-semibold">Select an available slot</h3>
            <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600" title={`Times shown in ${userTimezone.name}`}>
              {userTimezone.abbr} — your local time
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={fetchSlots}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              title="Refresh availability"
              aria-label="Refresh availability"
              data-testid="slot-picker-refresh-btn"
            >
              <RotateCw size={18} />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 hover:bg-slate-100"
              aria-label="Close"
              data-testid="slot-picker-close-btn"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-auto p-4">
          {step === 'slots' ? content : (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Tell the tutor what you want to study in this session.
              </p>
              <div>
                <label htmlFor="sp-subject" className="block text-sm font-medium text-slate-700 mb-1">
                  Subject <span className="text-red-500">*</span>
                </label>
                {tutorSubjects.length > 0 ? (
                  <select
                    id="sp-subject"
                    value={studySubject}
                    onChange={e => setStudySubject(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500"
                    data-testid="slot-picker-subject-select"
                  >
                    <option value="">Select a subject…</option>
                    {tutorSubjects.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="sp-subject"
                    type="text"
                    value={studySubject}
                    onChange={e => setStudySubject(e.target.value)}
                    placeholder="e.g. Mathematics, Physics, English…"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500"
                    data-testid="slot-picker-subject-input"
                  />
                )}
              </div>
              <div>
                <label htmlFor="sp-grade" className="block text-sm font-medium text-slate-700 mb-1">
                  Grade / Level <span className="text-red-500">*</span>
                </label>
                {tutorGrades.length > 0 ? (
                  <select
                    id="sp-grade"
                    value={studyGrade}
                    onChange={e => setStudyGrade(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500"
                    data-testid="slot-picker-grade-select"
                  >
                    <option value="">Select a grade…</option>
                    {tutorGrades.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="sp-grade"
                    type="text"
                    value={studyGrade}
                    onChange={e => setStudyGrade(e.target.value)}
                    placeholder="e.g. Grade 10, A-Level, University Year 1…"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500"
                    data-testid="slot-picker-grade-input"
                  />
                )}
              </div>
              <div>
                <label htmlFor="sp-module" className="block text-sm font-medium text-slate-700 mb-1">
                  Module / Topic <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  id="sp-module"
                  type="text"
                  value={studyModule}
                  onChange={e => setStudyModule(e.target.value)}
                  placeholder="e.g. Algebra, Organic Chemistry, Essay Writing…"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500"
                  data-testid="slot-picker-module-input"
                />
              </div>
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <button
            onClick={step === 'details' ? () => setStep('slots') : onClose}
            className="rounded-xl px-4 py-2 text-slate-700 hover:bg-slate-100"
            data-testid="slot-picker-cancel-btn"
          >
            {step === 'details' ? '← Back' : 'Cancel'}
          </button>
          
          {step === 'details' ? (
            <button
              disabled={submitting || !studySubject.trim() || !studyGrade.trim()}
              onClick={handleAssign}
              className="rounded-xl bg-ocean-700 px-4 py-2 font-medium text-white disabled:opacity-60"
              data-testid="slot-picker-confirm-btn"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Confirming…
                </span>
              ) : (
                'Confirm Booking'
              )}
            </button>
          ) : grouped.length === 0 && !loading ? (
            <button
              disabled={joiningWaitlist}
              onClick={handleNotifyMe}
              className="rounded-xl bg-purple-600 px-4 py-2 font-medium text-white disabled:opacity-60 flex items-center gap-2"
              data-testid="slot-picker-notify-btn"
            >
              {joiningWaitlist ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Joining…
                </>
              ) : (
                <>
                  <Bell className="h-4 w-4" /> Notify Me
                </>
              )}
            </button>
          ) : (
            <button
              disabled={!selectedKey || submitting}
              onClick={() => setStep('details')}
              className="rounded-xl bg-ocean-700 px-4 py-2 font-medium text-white disabled:opacity-60"
              data-testid="slot-picker-next-btn"
            >
              Next →
            </button>
          )}
        </div>
      </div>

      {/* Notification Modal */}
      <NotificationModal
        open={showNotification}
        onClose={handleNotificationClose}
        title="Added to Waitlist!"
        message="You will be notified in the app when this tutor adds new availability."
        type="success"
        confirmText="Got it!"
      />
    </div>
  );
}
