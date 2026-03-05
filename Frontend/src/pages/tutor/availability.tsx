import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, Clock, X, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getAvailability, saveAvailabilityForMonth, createSlot, updateSlot, deleteSlot, getMyProfile } from '../../services/tutorService';
import type { AvailabilitySlot } from '../../services/tutorService';
import api from '../../lib/apiClient';

type SlotVM = { id?: string; start: string; end: string; title?: string; booked?: boolean; bookingStatus?: string | null; templateId?: string };
type SlotsByDay = Record<string, SlotVM[]>;
type ToastType = 'error' | 'success' | 'warning';

type RecurringTemplate = {
  id: string;
  dayOfWeek: number; // 0-6 (Sunday to Saturday)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  title?: string;
  isActive: boolean;
};

function extractTutorSubjects(profile: any): string[] {
  const direct = Array.isArray(profile?.subjects) ? profile.subjects : [];
  const nested = Array.isArray(profile?.tutor?.subjects) ? profile.tutor.subjects : [];
  const directMappings = Array.isArray(profile?.classSubjectMappings) ? profile.classSubjectMappings : [];
  const nestedMappings = Array.isArray(profile?.tutor?.classSubjectMappings) ? profile.tutor.classSubjectMappings : [];
  const fromMappings = [...directMappings, ...nestedMappings]
    .flatMap((row: any) => (Array.isArray(row?.subjects) ? row.subjects : []));

  return Array.from(
    new Set(
      [...direct, ...nested, ...fromMappings]
        .map((subject: any) => String(subject || '').trim())
        .filter(Boolean),
    ),
  );
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ymKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function firstOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function lastOfMonth(d: Date) { 
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  lastDay.setHours(23, 59, 59, 999);
  return lastDay;
}

function clampHHMM(v: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return '09:00';
  const hh = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function addMinutes(hhmm: string, mins: number) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(0, 0, 0, h || 0, m || 0, 0, 0);
  d.setMinutes(d.getMinutes() + mins);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function compareHHMM(a: string, b: string) {
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}
function isPastDay(dayKey: string, now = new Date()) {
  return new Date(dayKey) < new Date(ymd(now));
}
function isToday(dayKey: string, now = new Date()) {
  return dayKey === ymd(now);
}

function toSlotsByDay(api: AvailabilitySlot[]): SlotsByDay {
  const out: SlotsByDay = {};
  for (const s of api) {
    const day = s.date ?? s.day;
    if (!day) continue;
    if (!out[day]) out[day] = [];
    out[day].push({
      id: s.id,
      start: clampHHMM(s.startTime),
      end: clampHHMM(s.endTime),
      title: s.title,
      booked: !!s.booked,
      bookingStatus: (s as any).bookingStatus ?? null,
    });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => compareHHMM(a.start, b.start));
  return out;
}
function toRawSlots(slots: SlotsByDay) {
  const out: { id?: string; startTime: string; endTime: string; title?: string; booked?: boolean }[] = [];
  for (const day of Object.keys(slots)) {
    for (const s of slots[day]) {
      const [sh, sm] = s.start.split(':').map(Number);
      const [eh, em] = s.end.split(':').map(Number);
      const start = new Date(`${day}T00:00:00`);
      start.setHours(sh || 0, sm || 0, 0, 0);
      const end = new Date(`${day}T00:00:00`);
      end.setHours(eh || 0, em || 0, 0, 0);
      // If end time is earlier, treat it as crossing midnight
      if (end.getTime() <= start.getTime()) {
        end.setDate(end.getDate() + 1);
      }
      out.push({
        id: s.id,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        title: s.title,
        booked: s.booked,
      });
    }
  }
  return out;
}

function buildTemplateSlots(month: Date, templates: RecurringTemplate[]): SlotsByDay {
  const out: SlotsByDay = {};
  const first = firstOfMonth(month);
  const last = lastOfMonth(month);
  const active = templates.filter((t) => t.isActive);

  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    const dayKey = ymd(d);
    const matches = active.filter((t) => t.dayOfWeek === dayOfWeek);
    if (!matches.length) continue;
    out[dayKey] = matches.map((t) => ({
      id: `template:${t.id}`,
      templateId: t.id,
      start: clampHHMM(t.startTime),
      end: clampHHMM(t.endTime),
      title: t.title,
      booked: false,
    })).sort((a, b) => compareHHMM(a.start, b.start));
  }
  return out;
}

// ─── Helper functions extracted to reduce cognitive complexity ────────

function toastClassName(type: ToastType): string {
  switch (type) {
    case 'error': return 'bg-red-50 text-red-900 border border-red-200';
    case 'success': return 'bg-green-50 text-green-900 border border-green-200';
    default: return 'bg-amber-50 text-amber-900 border border-amber-200';
  }
}

function toastIcon(type: ToastType) {
  switch (type) {
    case 'error': return <AlertCircle className="h-5 w-5 text-red-600" />;
    case 'success': return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    default: return <AlertCircle className="h-5 w-5 text-amber-600" />;
  }
}

function toastNotification(
  toast: { message: string; type: ToastType },
  setToast: (v: null) => void,
) {
  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-5 duration-300">
      <div className={`flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg min-w-[300px] max-w-md ${toastClassName(toast.type)}`}>
        {toastIcon(toast.type)}
        <p className="flex-1 text-sm font-medium">{toast.message}</p>
        <button
          onClick={() => setToast(null)}
          className="rounded-lg p-1 hover:bg-black/5 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function slotRowClassName(isCompleted: boolean, booked?: boolean): string {
  if (isCompleted) return 'bg-green-50 cursor-default';
  if (booked) return 'bg-amber-50 cursor-default';
  return 'bg-slate-50 hover:bg-slate-100';
}

function slotTitle(isCompleted: boolean, booked?: boolean): string {
  if (isCompleted) return 'Session completed';
  if (booked) return 'This slot has an active booking';
  return 'Edit slot';
}

function slotCardClassName(isCompleted: boolean, booked?: boolean): string {
  if (isCompleted) return 'bg-green-50 border-green-200';
  if (booked) return 'bg-amber-50 border-amber-200';
  return 'bg-white hover:bg-slate-50';
}

function slotIconBgClassName(isCompleted: boolean, booked?: boolean): string {
  if (isCompleted) return 'bg-green-100';
  if (booked) return 'bg-amber-100';
  return 'bg-blue-100';
}

function slotIcon(isCompleted: boolean, booked?: boolean) {
  if (isCompleted) return <CheckCircle2 size={16} className="text-green-600" />;
  if (booked) return <Lock size={16} className="text-amber-600" />;
  return <Clock size={16} className="text-blue-600" />;
}

function dotClassName(isSelected: boolean, hasCompleted: boolean, hasBooked: boolean): string {
  if (isSelected) return 'bg-blue-200';
  if (hasCompleted) return 'bg-green-500';
  if (hasBooked) return 'bg-amber-500';
  return 'bg-blue-500';
}

function cellClassName(isSelected: boolean, past: boolean): string {
  if (isSelected) return 'bg-blue-600 text-white shadow-md';
  if (past) return 'bg-slate-50 text-slate-400';
  return 'bg-white hover:bg-blue-50 text-slate-800';
}

function cellTextClassName(isSelected: boolean, today: boolean): string {
  if (isSelected) return 'text-white';
  if (today) return 'text-blue-600';
  return '';
}

function slotCountLabel(total: number): string {
  if (total === 0) return 'No slots scheduled';
  return `${total} slot${total > 1 ? 's' : ''}`;
}

function saveButtonLabel(loading: boolean, editingIndex: number | null): string {
  if (loading) return 'Saving...';
  if (editingIndex === null) return 'Add slot';
  return 'Save';
}

export default function TutorAvailability() {
  const [month, setMonth] = useState<Date>(() => firstOfMonth(new Date()));
  const [slots, setSlots] = useState<SlotsByDay>({});
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // toast notification
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  // modal editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null); // null => add, number => edit
  const [draftStart, setDraftStart] = useState('09:00');
  const [draftEnd,   setDraftEnd]   = useState('10:00');
  const [draftSubjects, setDraftSubjects] = useState<string[]>([]);
  const [draftBooked, setDraftBooked] = useState<boolean>(false); // if the slot is booked
  const [tutorSubjects, setTutorSubjects] = useState<string[]>([]);

  // mobile: selected day for detail panel
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // template editor state
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RecurringTemplate | null>(null);
  const [templateStart, setTemplateStart] = useState('09:00');
  const [templateEnd, setTemplateEnd] = useState('10:00');
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateActive, setTemplateActive] = useState(true);

  // Auto-hide toast after 4 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    const loadTutorSubjects = async () => {
      try {
        const profile = await getMyProfile();
        setTutorSubjects(extractTutorSubjects(profile));
      } catch {
        setTutorSubjects([]);
      }
    };
    void loadTutorSubjects();
  }, []);

  // No auto-select: subjects are optional and multi-select

  const now = new Date();
  const monthLabel = useMemo(() => month.toLocaleString(undefined, { month: 'long', year: 'numeric' }), [month]);

  async function loadMonth(d: Date) {
    setLoading(true);
    setError(null);
    try {
      const from = firstOfMonth(d);
      const to = lastOfMonth(d);
      const [data, templateRes] = await Promise.all([
        getAvailability({ from, to }),
        api.get('/recurring-templates/active'),
      ]);
      // Debug log to verify data is being fetched
      if (data.length > 0) {
        console.log(`Loaded ${data.length} slots for ${d.toLocaleDateString()}:`, data.slice(0, 3));
      } else {
        console.log(`No slots found for ${d.toLocaleDateString()}, checking date range:`, {
          from: from.toISOString(),
          to: to.toISOString(),
        });
      }
      setSlots(toSlotsByDay(data));
      setTemplates(Array.isArray(templateRes?.data) ? templateRes.data : []);
    } catch (e) {
      console.error('Error loading availability:', e);
      setError('Failed to load availability');
      setSlots({});
      setTemplates([]);
    } finally {
      setLoading(false);
      setDirty(false);
      setEditorOpen(false);
      setActiveDay(null);
      setEditingIndex(null);
    }
  }
  useEffect(() => { loadMonth(month); }, [ymKey(month)]);

  const templateSlotsByDay = useMemo(() => buildTemplateSlots(month, templates), [month, templates]);

  // cell generation (Mon-first grid)
  const cells = useMemo(() => {
    const first = firstOfMonth(month);
    const last = lastOfMonth(month);
    const startDay = first.getDay(); // Sun=0
    const pad = (startDay + 6) % 7;
    const arr: (Date | null)[] = Array.from({ length: pad }, () => null);
    for (let d = 1; d <= last.getDate(); d++) {
      arr.push(new Date(month.getFullYear(), month.getMonth(), d));
    }
    return arr;
  }, [month]);

  /** Enforce 60 minutes always */
  function onStartChange(v: string) {
    const start = clampHHMM(v);
    const end = addMinutes(start, 60);
    setDraftStart(start);
    setDraftEnd(end);
  }
  function onEndChange(v: string) {
    const end = clampHHMM(v);
    const start = addMinutes(end, -60);
    setDraftEnd(end);
    setDraftStart(start);
  }

  function openAddEditor(date: Date) {
    const key = ymd(date);
    if (isPastDay(key, now)) return; // block past days
    setActiveDay(key);
    setEditingIndex(null);

    // default: next valid hour (today) or 11:00 for future days
    const n = new Date();
    let start: string;
    if (isToday(key, now)) {
      const nextHour = new Date(n);
      nextHour.setHours(n.getMinutes() ? n.getHours() + 1 : n.getHours(), 0, 0, 0);
      start = `${String(nextHour.getHours()).padStart(2, '0')}:00`;
    } else {
      start = '11:00';
    }
    const end = addMinutes(start, 60);
    setDraftStart(start);
    setDraftEnd(end);
    setDraftSubjects([]);
    setDraftBooked(false);
    setEditorOpen(true);
  }

  function openEditEditor(dayKey: string, idx: number) {
    const item = slots[dayKey]?.[idx];
    if (!item) return;
    if (isPastDay(dayKey, now)) return; // block past days entirely
    setActiveDay(dayKey);
    setEditingIndex(idx);
    setDraftStart(item.start);
    setDraftEnd(item.end);
    const currentSubjects = String(item.title || '').split(',').map(s => s.trim()).filter(s => s && tutorSubjects.includes(s));
    setDraftSubjects(currentSubjects);
    setDraftBooked(!!item.booked);
    setEditorOpen(true);
  }

  function openTemplateEditor(templateId?: string) {
    if (!templateId) return;
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setEditingTemplate(template);
    setTemplateStart(clampHHMM(template.startTime));
    setTemplateEnd(clampHHMM(template.endTime));
    setTemplateTitle(template.title || '');
    setTemplateActive(!!template.isActive);
    setTemplateEditorOpen(true);
  }

  async function saveTemplate() {
    if (!editingTemplate) return;
    if (templateStart >= templateEnd) {
      setToast({ message: 'End time must be after start time.', type: 'error' });
      return;
    }
    try {
      setLoading(true);
      await api.patch(`/recurring-templates/${editingTemplate.id}`, {
        startTime: templateStart,
        endTime: templateEnd,
        title: templateTitle?.trim() || undefined,
        isActive: templateActive,
      });
      setToast({ message: 'Template updated successfully!', type: 'success' });
      await loadMonth(month);
    } catch (error: any) {
      setToast({
        message: error?.response?.data?.message || error?.message || 'Failed to update template.',
        type: 'error',
      });
    } finally {
      setLoading(false);
      setTemplateEditorOpen(false);
      setEditingTemplate(null);
    }
  }

  async function saveDraft() {
    if (!activeDay) return;

    // prevent creating times in the past for today
    if (isToday(activeDay, now)) {
      const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (compareHHMM(draftStart, nowHHMM) <= 0) {
        setToast({ message: 'Start time must be in the future.', type: 'error' });
        return;
      }
    }

    try {
      setLoading(true);
      
      // Convert HH:MM to ISO timestamp
      const [sh, sm] = draftStart.split(':').map(Number);
      const [eh, em] = draftEnd.split(':').map(Number);
      const startDate = new Date(`${activeDay}T00:00:00`);
      startDate.setHours(sh || 0, sm || 0, 0, 0);
      const endDate = new Date(`${activeDay}T00:00:00`);
      endDate.setHours(eh || 0, em || 0, 0, 0);
      // If end time is earlier, treat it as crossing midnight
      if (endDate.getTime() <= startDate.getTime()) {
        endDate.setDate(endDate.getDate() + 1);
      }
      
      const startIso = startDate.toISOString();
      const endIso = endDate.toISOString();
      const selectedTitle = draftSubjects.length ? draftSubjects.join(', ') : '';

      if (editingIndex === null) {
        // Create new slot
        const newSlot = await createSlot(startIso, endIso, selectedTitle);
        setSlots((prev) => {
          const list = [...(prev[activeDay] || [])];
          list.push({
            id: newSlot.id,
            start: newSlot.startTime,
            end: newSlot.endTime,
            title: newSlot.title || selectedTitle || undefined,
            booked: false,
          });
          list.sort((a, b) => compareHHMM(a.start, b.start));
          return { ...prev, [activeDay]: list };
        });
        setToast({ message: 'Slot created successfully!', type: 'success' });
      } else {
        // Update existing slot
        const existingSlot = slots[activeDay]?.[editingIndex];
        if (existingSlot?.booked) {
          setToast({ message: 'Cannot edit a booked slot.', type: 'error' });
          return;
        }
        if (!existingSlot?.id) {
          setToast({ message: 'Cannot update slot: missing ID.', type: 'error' });
          return;
        }
        
        const updatedSlot = await updateSlot(existingSlot.id, startIso, endIso, selectedTitle);
        setSlots((prev) => {
          const list = [...(prev[activeDay] || [])];
          list[editingIndex] = {
            ...list[editingIndex],
            id: updatedSlot.id,
            start: updatedSlot.startTime,
            end: updatedSlot.endTime,
            title: updatedSlot.title || selectedTitle || undefined,
          };
          list.sort((a, b) => compareHHMM(a.start, b.start));
          return { ...prev, [activeDay]: list };
        });
        setToast({ message: 'Slot updated successfully!', type: 'success' });
      }
    } catch (error: any) {
      console.error('Failed to save slot:', error);
      setToast({ 
        message: error?.response?.data?.message || error?.message || 'Failed to save slot. Please try again.', 
        type: 'error' 
      });
    } finally {
      setLoading(false);
      setEditorOpen(false);
      setActiveDay(null);
      setEditingIndex(null);
    }
  }

  async function removeSlot(day: string, idx: number) {
    const slot = slots[day]?.[idx];
    if (!slot) return;
    
    if (slot.booked) {
      setToast({ message: 'Cannot delete a booked slot.', type: 'error' });
      return;
    }

    // If slot has an ID, delete it via API
    if (slot.id) {
      try {
        setLoading(true);
        await deleteSlot(slot.id);
        setSlots((prev) => {
          const list = [...(prev[day] || [])];
          list.splice(idx, 1);
          const next = { ...prev };
          if (list.length) next[day] = list;
          else delete next[day];
          return next;
        });
        setToast({ message: 'Slot deleted successfully!', type: 'success' });
      } catch (error: any) {
        console.error('Failed to delete slot:', error);
        setToast({ 
          message: error?.response?.data?.message || error?.message || 'Failed to delete slot. Please try again.', 
          type: 'error' 
        });
      } finally {
        setLoading(false);
      }
    } else {
      // If no ID (shouldn't happen, but handle gracefully), remove from local state
      setSlots((prev) => {
        const list = [...(prev[day] || [])];
        list.splice(idx, 1);
        const next = { ...prev };
        if (list.length) next[day] = list;
        else delete next[day];
        return next;
      });
      setDirty(true);
    }
  }

  async function persist() {
    try {
      setLoading(true);
      await saveAvailabilityForMonth(toRawSlots(slots), month);
      setDirty(false);
      setToast({ message: 'Availability saved successfully!', type: 'success' });
      // Reload slots after saving to ensure we have the latest data from the server
      await loadMonth(month);
    } catch {
      setToast({ message: 'Failed to save availability. Please try again.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="bg-slate-50/60 py-6">
      {/* Toast Notification */}
      {toast && toastNotification(toast, setToast)}

      <div className="container mx-auto px-4">
        <div className="mx-auto w-full max-w-6xl rounded-2xl border bg-white p-4 sm:p-6 shadow-sm">
          {/* Header */}
          <div className="flex flex-wrap items-center gap-3 justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Availability</h2>
              <p className="text-sm text-slate-500">Manage your slots and recurring templates</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 hover:bg-slate-50"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              >
                <ChevronLeft size={18} /> <span className="hidden sm:inline">Prev</span>
              </button>
              <div className="px-3 py-1.5 rounded-lg bg-slate-50 text-sm font-semibold min-w-[180px] text-center text-slate-700">
                {monthLabel}
              </div>
              <button
                className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 hover:bg-slate-50"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              >
                <span className="hidden sm:inline">Next</span> <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

          {/* =================== DESKTOP LAYOUT (lg+) =================== */}
          <div className="hidden lg:block">
            {/* Week header */}
            <div className="grid grid-cols-7 gap-2 mb-2">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div key={d} className="text-xs font-semibold text-slate-500 px-2">{d}</div>
              ))}
            </div>

            {/* Calendar grid — full cards */}
            {loading ? (
              <div className="p-6 text-slate-600">Loading calendar…</div>
            ) : (
              <div className="grid grid-cols-7 gap-3">
                {cells.map((dateOrNull, i) => {
                  if (!dateOrNull) return <div key={`pad-w${Math.floor(i / 7)}-d${i % 7}`} />;

                  const d = dateOrNull;
                  const key = ymd(d);
                  const daySlots = slots[key] || [];
                  const tplSlots = templateSlotsByDay[key] || [];
                  const past = isPastDay(key, now);
                  const today = isToday(key, now);

                  return (
                    <div
                      key={key}
                      className={`relative rounded-xl border bg-white p-2 hover:shadow-sm transition min-h-[128px] ${today ? 'ring-2 ring-blue-400' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm font-semibold flex items-center gap-1.5">
                          {d.getDate()}
                          {today && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">Today</span>}
                        </div>
                        <button
                          disabled={past}
                          className={`text-xs inline-flex items-center gap-1 rounded-lg px-2 py-1 ${
                            past ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                          onClick={() => openAddEditor(d)}
                          title={past ? 'Cannot add slots in the past' : 'Add a slot'}
                        >
                          <Plus size={14} /> Slot
                        </button>
                      </div>

                      {daySlots.length === 0 && tplSlots.length === 0 ? (
                        <div className="text-[11px] text-slate-500">No slots</div>
                      ) : (
                        <div className="space-y-1">
                          {tplSlots.map((s, idx) => (
                            <button
                              key={`template-${s.start}-${idx}`}
                              className="w-full text-left flex items-center justify-between text-xs bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1 hover:bg-emerald-100/70"
                              title="Edit recurring template"
                              onClick={() => openTemplateEditor(s.templateId)}
                            >
                              <span className="truncate text-emerald-700">
                                <Clock size={12} className="inline mr-1" /> {s.start}–{s.end}
                                {s.title ? <span className="ml-1 text-emerald-700">• {s.title}</span> : null}
                              </span>
                              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Template</span>
                            </button>
                          ))}
                          {daySlots.map((s, idx) => {
                            const isCompleted = s.bookingStatus === 'COMPLETED';
                            return (
                            <div
                              key={`${s.start}-${idx}`}
                              className={`w-full flex items-center justify-between text-xs rounded-lg px-2 py-1 group ${slotRowClassName(isCompleted, s.booked)}`}
                              title={slotTitle(isCompleted, s.booked)}
                            >
                              <button
                                type="button"
                                className="flex-1 min-w-0 text-left truncate bg-transparent border-0 p-0 cursor-pointer disabled:cursor-default"
                                onClick={() => !s.booked && openEditEditor(key, idx)}
                                disabled={!!s.booked || isCompleted}
                              >
                                <span className="truncate">
                                  <Clock size={12} className="inline mr-1" /> {s.start}–{s.end}
                                  {s.title ? <span className="ml-1 text-slate-600">• {s.title}</span> : null}
                                </span>
                              </button>
                              {isCompleted && (
                                <span className="inline-flex items-center gap-1 text-green-700 text-[10px] font-semibold shrink-0">
                                  <CheckCircle2 size={12} /> Done
                                </span>
                              )}
                              {!isCompleted && s.booked && (
                                <span className="inline-flex items-center gap-1 text-amber-700 shrink-0">
                                  <Lock size={12} />
                                </span>
                              )}
                              {!isCompleted && !s.booked && (
                                <button
                                  type="button"
                                  className="opacity-0 group-hover:opacity-100 transition text-red-600 hover:text-red-700 shrink-0"
                                  onClick={() => removeSlot(key, idx)}
                                  title="Delete slot"
                                  aria-label="Delete slot"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* =================== MOBILE LAYOUT (< lg) =================== */}
          <div className="lg:hidden">
            {loading ? (
              <div className="p-6 text-slate-600">Loading calendar…</div>
            ) : (
              <>
                {/* Compact month calendar */}
                <div className="grid grid-cols-7 gap-0.5 mb-1">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                    <div key={`hdr-${d}-${i}`} className="text-[10px] font-semibold text-slate-400 text-center py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {cells.map((dateOrNull, i) => {
                    if (!dateOrNull) return <div key={`mpad-w${Math.floor(i / 7)}-d${i % 7}`} />;

                    const d = dateOrNull;
                    const key = ymd(d);
                    const daySlots = slots[key] || [];
                    const tplSlots = templateSlotsByDay[key] || [];
                    const totalSlots = daySlots.length + tplSlots.length;
                    const past = isPastDay(key, now);
                    const today = isToday(key, now);
                    const isSelected = selectedDay === key;
                    const hasBooked = daySlots.some((s) => s.booked);
                    const hasCompleted = daySlots.some((s) => s.bookingStatus === 'COMPLETED');

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedDay(isSelected ? null : key)}
                        className={`relative flex flex-col items-center justify-center rounded-lg py-2 px-0.5 transition-all text-center
                          ${today ? 'ring-2 ring-blue-400 ring-inset' : ''}
                          ${cellClassName(isSelected, past)}
                        `}
                      >
                        <span className={`text-sm font-semibold leading-none ${cellTextClassName(isSelected, today)}`}>
                          {d.getDate()}
                        </span>
                        {/* Dot indicators */}
                        {totalSlots > 0 && (
                          <div className="flex items-center gap-0.5 mt-1">
                            {tplSlots.length > 0 && (
                              <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-300' : 'bg-emerald-500'}`} />
                            )}
                            {daySlots.length > 0 && (
                              <span className={`w-1.5 h-1.5 rounded-full ${dotClassName(isSelected, hasCompleted, hasBooked)}`} />
                            )}
                            {totalSlots > 2 && (
                              <span className={`text-[8px] font-bold leading-none ${isSelected ? 'text-blue-200' : 'text-slate-400'}`}>+{totalSlots - 1}</span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-3 mt-2 px-1">
                  <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-blue-500" /> Slots
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Templates
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-amber-500" /> Booked
                  </div>
                </div>

                {/* Selected day detail panel */}
                {selectedDay && (
                  <div className="mt-3 rounded-xl border bg-white shadow-sm overflow-hidden animate-in slide-in-from-top-2 duration-200">
                    {(() => {
                      const selDate = new Date(selectedDay + 'T00:00:00');
                      const daySlots = slots[selectedDay] || [];
                      const tplSlots = templateSlotsByDay[selectedDay] || [];
                      const past = isPastDay(selectedDay, now);
                      const today = isToday(selectedDay, now);
                      const dateLabel = selDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });

                      return (
                        <>
                          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b">
                            <div>
                              <h3 className="font-semibold text-slate-900 text-sm">{dateLabel}</h3>
                              <p className="text-[11px] text-slate-500">
                                {slotCountLabel(daySlots.length + tplSlots.length)}
                                {today && ' • Today'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {!past && (
                                <button
                                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
                                  onClick={() => openAddEditor(selDate)}
                                >
                                  <Plus size={14} /> Add Slot
                                </button>
                              )}
                              <button
                                className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                                onClick={() => setSelectedDay(null)}
                              >
                                <X size={16} className="text-slate-500" />
                              </button>
                            </div>
                          </div>

                          <div className="p-3 space-y-2">
                            {tplSlots.map((s, idx) => (
                              <button
                                key={`tpl-${s.start}-${idx}`}
                                className="w-full flex items-center gap-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3 hover:bg-emerald-100/70 transition-colors text-left"
                                onClick={() => openTemplateEditor(s.templateId)}
                              >
                                <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                                  <Clock size={16} className="text-emerald-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-emerald-800">{s.start} – {s.end}</div>
                                  <div className="text-[11px] text-emerald-600">{s.title || 'Recurring template'}</div>
                                </div>
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full shrink-0">Template</span>
                              </button>
                            ))}
                            {daySlots.map((s, idx) => {
                              const isCompleted = s.bookingStatus === 'COMPLETED';
                              return (
                              <div
                                key={`slot-${s.start}-${idx}`}
                                className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${slotCardClassName(isCompleted, s.booked)}`}
                              >
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${slotIconBgClassName(isCompleted, s.booked)}`}>
                                  {slotIcon(isCompleted, s.booked)}
                                </div>
                                <button
                                  className="flex-1 min-w-0 text-left"
                                  onClick={() => !past && !s.booked && openEditEditor(selectedDay, idx)}
                                  disabled={past || !!s.booked}
                                >
                                  <div className="text-sm font-medium text-slate-800">{s.start} – {s.end}</div>
                                  <div className="text-[11px] text-slate-500">
                                    {s.title || 'Slot'}
                                    {isCompleted && <span className="ml-1 text-green-600 font-medium">• Completed</span>}
                                    {s.booked && !isCompleted && <span className="ml-1 text-amber-600 font-medium">• Booked</span>}
                                  </div>
                                </button>
                                {!past && !s.booked && (
                                  <button
                                    className="p-2 rounded-lg hover:bg-red-50 text-red-500 hover:text-red-600 transition-colors shrink-0"
                                    onClick={() => removeSlot(selectedDay, idx)}
                                    title="Delete slot"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </div>
                              );
                            })}
                            {daySlots.length === 0 && tplSlots.length === 0 && (
                              <div className="text-center py-6 text-slate-400">
                                <Clock size={24} className="mx-auto mb-2 text-slate-300" />
                                <p className="text-sm">No slots for this day</p>
                                {!past && (
                                  <button
                                    className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
                                    onClick={() => openAddEditor(selDate)}
                                  >
                                    + Add your first slot
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <p className="text-xs text-slate-500">Templates are shown in green and can be edited here.</p>
            <button
              disabled={loading || !dirty}
              onClick={persist}
              className={`rounded-lg px-4 py-2 text-white ${dirty ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-400 cursor-not-allowed'}`}
            >
              Save Availability
            </button>
          </div>
        </div>
      </div>

      {/* Modal editor */}
      {editorOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-3">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-semibold">
                {editingIndex === null ? 'Add slot' : 'Edit slot'} — {activeDay}
              </div>
              <button className="p-1 rounded hover:bg-slate-100" onClick={() => setEditorOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {draftBooked && (
                <div className="text-amber-700 text-sm flex items-center gap-2">
                  <Lock size={16} /> This slot has a booking. You can only change its subject.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="block text-slate-600 mb-1">Start</span>
                  <input
                    type="time"
                    value={draftStart}
                    onChange={(e) => onStartChange(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                    disabled={draftBooked || loading}
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-slate-600 mb-1">End</span>
                  <input
                    type="time"
                    value={draftEnd}
                    onChange={(e) => onEndChange(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                    disabled={draftBooked || loading}
                  />
                </label>
              </div>

              {tutorSubjects.length > 0 && (
                <div className="text-sm">
                  <span className="block text-slate-600 mb-2">Subjects <span className="text-slate-400 font-normal">(optional — select one or more)</span></span>
                  <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg px-3 py-2">
                    {tutorSubjects.map((subject) => (
                      <label key={subject} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={draftSubjects.includes(subject)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setDraftSubjects((prev) => [...prev, subject]);
                            } else {
                              setDraftSubjects((prev) => prev.filter((s) => s !== subject));
                            }
                          }}
                          disabled={loading}
                        />
                        <span className="text-slate-700">{subject}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-[11px] text-slate-500">
                Duration is fixed to 1 hour. You can add multiple slots for the same day.
              </div>
            </div>

            <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
              <button
                className="rounded-lg border px-4 py-2 hover:bg-slate-50"
                onClick={() => setEditorOpen(false)}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-blue-600 text-white px-4 py-2 hover:bg-blue-700"
                onClick={saveDraft}
                disabled={loading}
              >
                {saveButtonLabel(loading, editingIndex)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template editor */}
      {templateEditorOpen && editingTemplate && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-3">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-semibold">
                Edit template — {DAYS_OF_WEEK[editingTemplate.dayOfWeek] ?? 'Day'}
              </div>
              <button
                className="p-1 rounded hover:bg-slate-100"
                onClick={() => setTemplateEditorOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="block text-slate-600 mb-1">Start</span>
                  <input
                    type="time"
                    value={templateStart}
                    onChange={(e) => setTemplateStart(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                    disabled={loading}
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-slate-600 mb-1">End</span>
                  <input
                    type="time"
                    value={templateEnd}
                    onChange={(e) => setTemplateEnd(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                    disabled={loading}
                  />
                </label>
              </div>

              <label className="text-sm block">
                <span className="block text-slate-600 mb-1">Title (optional)</span>
                <input
                  value={templateTitle}
                  onChange={(e) => setTemplateTitle(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="e.g., Weekly slots"
                  disabled={loading}
                />
              </label>

              <label className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={templateActive}
                  onChange={(e) => setTemplateActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                  disabled={loading}
                />
                <span className="text-slate-700">Active template</span>
              </label>
            </div>

            <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
              <button
                className="rounded-lg border px-4 py-2 hover:bg-slate-50"
                onClick={() => setTemplateEditorOpen(false)}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-emerald-600 text-white px-4 py-2 hover:bg-emerald-700"
                onClick={saveTemplate}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
