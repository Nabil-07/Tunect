import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, Clock, X, Lock } from 'lucide-react';
import { getAvailability, updateAvailability } from '../../services/tutorService';
import type { AvailabilitySlot } from '../../services/tutorService';

type DayKey = string; // "YYYY-MM-DD"
type SlotVM = { id?: string; start: string; end: string; title?: string; booked?: boolean };
type SlotsByDay = Record<DayKey, SlotVM[]>;

function ymKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function firstOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function lastOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

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
  return (a > b) ? 1 : (a < b) ? -1 : 0;
}
function isPastDay(dayKey: DayKey, now = new Date()) {
  return new Date(dayKey) < new Date(ymd(now));
}
function isToday(dayKey: DayKey, now = new Date()) {
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
    });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => compareHHMM(a.start, b.start));
  return out;
}
function toApiPayload(slots: SlotsByDay): AvailabilitySlot[] {
  const out: AvailabilitySlot[] = [];
  for (const day of Object.keys(slots)) {
    for (const s of slots[day]) {
      out.push({ id: s.id, date: day, day, startTime: s.start, endTime: s.end, title: s.title });
    }
  }
  return out;
}

export default function TutorAvailability() {
  const [month, setMonth] = useState<Date>(() => firstOfMonth(new Date()));
  const [slots, setSlots] = useState<SlotsByDay>({});
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // modal editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeDay, setActiveDay] = useState<DayKey | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null); // null => add, number => edit
  const [draftStart, setDraftStart] = useState('09:00');
  const [draftEnd,   setDraftEnd]   = useState('10:00');
  const [draftTitle, setDraftTitle] = useState<string>('');
  const [draftBooked, setDraftBooked] = useState<boolean>(false); // if the slot is booked

  const now = new Date();
  const monthLabel = useMemo(() => month.toLocaleString(undefined, { month: 'long', year: 'numeric' }), [month]);

  async function loadMonth(d: Date) {
    setLoading(true);
    setError(null);
    try {
      const from = firstOfMonth(d);
      const to = lastOfMonth(d);
      const data = await getAvailability({ from, to });
      setSlots(toSlotsByDay(data));
    } catch (e) {
      console.error(e);
      setError('Failed to load availability');
      setSlots({});
    } finally {
      setLoading(false);
      setDirty(false);
      setEditorOpen(false);
      setActiveDay(null);
      setEditingIndex(null);
    }
  }
  useEffect(() => { loadMonth(month); }, [ymKey(month)]);

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
    setDraftTitle('');
    setDraftBooked(false);
    setEditorOpen(true);
  }

  function openEditEditor(dayKey: DayKey, idx: number) {
    const item = slots[dayKey]?.[idx];
    if (!item) return;
    if (isPastDay(dayKey, now)) return; // block past days entirely
    setActiveDay(dayKey);
    setEditingIndex(idx);
    setDraftStart(item.start);
    setDraftEnd(item.end);
    setDraftTitle(item.title || '');
    setDraftBooked(!!item.booked);
    setEditorOpen(true);
  }

  function saveDraft() {
    if (!activeDay) return;

    // prevent creating times in the past for today
    if (isToday(activeDay, now)) {
      const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (compareHHMM(draftStart, nowHHMM) <= 0) {
        alert('Start time must be in the future.');
        return;
      }
    }

    setSlots((prev) => {
      const list = [...(prev[activeDay] || [])];
      if (editingIndex === null) {
        list.push({ start: draftStart, end: draftEnd, title: draftTitle?.trim() || undefined, booked: false });
      } else {
        if (list[editingIndex]?.booked) return prev; // do not edit a booked one
        list[editingIndex] = {
          ...list[editingIndex],
          start: draftStart,
          end: draftEnd,
          title: draftTitle?.trim() || undefined,
        };
      }
      list.sort((a, b) => compareHHMM(a.start, b.start));
      return { ...prev, [activeDay]: list };
    });
    setDirty(true);
    setEditorOpen(false);
    setActiveDay(null);
    setEditingIndex(null);
  }

  function removeSlot(day: DayKey, idx: number) {
    setSlots((prev) => {
      const list = [...(prev[day] || [])];
      if (list[idx]?.booked) return prev; // cannot delete booked
      list.splice(idx, 1);
      const next = { ...prev };
      if (list.length) next[day] = list;
      else delete next[day];
      return next;
    });
    setDirty(true);
  }

  async function persist() {
    try {
      setLoading(true);
      await updateAvailability(toApiPayload(slots));
      setDirty(false);
    } catch {
      alert('Failed to save availability');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 justify-between mb-4">
        <h2 className="text-2xl font-bold">Availability</h2>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 hover:bg-slate-50"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            <ChevronLeft size={18} /> <span className="hidden sm:inline">Prev</span>
          </button>
          <div className="px-3 py-1.5 rounded-lg bg-slate-50 text-sm font-medium min-w-[160px] text-center">
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

      {/* Week header */}
      <div className="grid grid-cols-7 gap-3 mb-2 max-sm:hidden">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="text-xs font-semibold text-slate-500 px-2">{d}</div>
        ))}
      </div>

      {/* Responsive grid: auto-fit cards */}
      {loading ? (
        <div className="p-6 text-slate-600">Loading calendar…</div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {cells.map((dateOrNull, i) => {
            if (!dateOrNull) return <div key={`pad-${i}`} className="hidden sm:block" />;

            const d = dateOrNull;
            const key = ymd(d);
            const daySlots = slots[key] || [];
            const past = isPastDay(key, now);
            const today = isToday(key, now);

            return (
              <div
                key={key}
                className={`relative rounded-xl border bg-white p-2 hover:shadow-sm transition min-h-[112px] ${today ? 'ring-2 ring-blue-400' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-semibold flex items-center gap-2">
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

                {daySlots.length === 0 ? (
                  <div className="text-[11px] text-slate-500">No slots</div>
                ) : (
                  <div className="space-y-1">
                    {daySlots.map((s, idx) => (
                      <button
                        key={`${s.start}-${idx}`}
                        className="w-full text-left flex items-center justify-between text-xs bg-slate-50 hover:bg-slate-100 rounded-lg px-2 py-1 group"
                        onClick={() => openEditEditor(key, idx)}
                        title={s.booked ? 'This slot has a booking' : 'Edit slot'}
                      >
                        <span className="truncate">
                          <Clock size={12} className="inline mr-1" /> {s.start}–{s.end}
                          {s.title ? <span className="ml-1 text-slate-600">• {s.title}</span> : null}
                        </span>
                        {s.booked ? (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <Lock size={12} />
                          </span>
                        ) : (
                          <span
                            className="opacity-0 group-hover:opacity-100 transition text-red-600 hover:text-red-700"
                            onClick={(e) => { e.stopPropagation(); removeSlot(key, idx); }}
                            title="Delete slot"
                          >
                            <Trash2 size={14} />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        <button
          disabled={loading || !dirty}
          onClick={persist}
          className={`rounded-lg px-4 py-2 text-white ${dirty ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-400 cursor-not-allowed'}`}
        >
          Save Availability
        </button>
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
                  <Lock size={16} /> This slot has a booking. You can only change its title.
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
                    disabled={draftBooked}
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-slate-600 mb-1">End</span>
                  <input
                    type="time"
                    value={draftEnd}
                    onChange={(e) => onEndChange(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                    disabled={draftBooked}
                  />
                </label>
              </div>

              <label className="text-sm block">
                <span className="block text-slate-600 mb-1">Title (optional)</span>
                <input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="e.g., Algebra practice"
                />
              </label>

              <div className="text-[11px] text-slate-500">
                Duration is fixed to 1 hour. You can add multiple slots for the same day.
              </div>
            </div>

            <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
              <button className="rounded-lg border px-4 py-2 hover:bg-slate-50" onClick={() => setEditorOpen(false)}>
                Cancel
              </button>
              <button
                className="rounded-lg bg-blue-600 text-white px-4 py-2 hover:bg-blue-700"
                onClick={saveDraft}
              >
                {editingIndex === null ? 'Add slot' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
