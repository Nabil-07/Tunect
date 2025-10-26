import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Clock, ArrowRight, User } from 'lucide-react';
import { getAvailability, type AvailabilitySlot, getMySessions, type TutorSession } from '../../services/tutorService';

function combineToDate(date: string | undefined, time: string): Date | null {
  const d = date || undefined;
  if (!d) return null;
  const [h, m] = String(time || '').split(':').map((x) => Number(x) || 0);
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setHours(h, m, 0, 0);
  return dt;
}

export default function TutorDashboard() {
  const [avail, setAvail] = useState<AvailabilitySlot[]>([]);
  const [sessions, setSessions] = useState<TutorSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const now = new Date();
        const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // next 7 days
        const [a, s] = await Promise.all([
          getAvailability({ from: now, to }),
          getMySessions(),
        ]);
        if (!mounted) return;
        setAvail(a);
        setSessions(s);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const upcomingAvail = useMemo(() => {
    const now = Date.now();
    const enriched = avail
      .map((s) => ({
        ...s,
        start: combineToDate(s.date || s.day, s.startTime),
        end: combineToDate(s.date || s.day, s.endTime),
      }))
      .filter((s) => s.start && (s.end?.getTime() || 0) > now)
      .sort((a, b) => (a.end!.getTime() - b.end!.getTime())); // expiring soon first (by end)
    return enriched.slice(0, 5);
  }, [avail]);

  const recentBookings = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    return sorted.slice(0, 5);
  }, [sessions]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold">Tutor Dashboard</h2>
        <p className="text-slate-700 text-sm sm:text-base">Track your availability, recent bookings, and quick links.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Upcoming availability */}
        <section className="rounded-2xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="font-semibold flex items-center gap-2"><CalendarDays className="h-4 w-4"/> Upcoming Availability</h3>
            <Link to="/tutor/availability" className="text-sm text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1">See all <ArrowRight className="h-4 w-4"/></Link>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="text-sm text-slate-500">Loading…</div>
            ) : upcomingAvail.length === 0 ? (
              <div className="text-sm text-slate-500">No upcoming slots. Add some in Availability.</div>
            ) : (
              <ul className="divide-y">
                {upcomingAvail.map((s) => (
                  <li key={`${s.date}-${s.startTime}`} className="py-2 flex items-center justify-between">
                    <div className="text-sm">
                      <div className="font-medium">{new Date(s.start!).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                      <div className="text-slate-600 flex items-center gap-1"><Clock className="h-3.5 w-3.5"/> {s.startTime} – {s.endTime}</div>
                    </div>
                    <Link to="/tutor/availability" className="text-xs text-indigo-600 hover:text-indigo-700">Edit</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Recent bookings */}
        <section className="rounded-2xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="font-semibold flex items-center gap-2"><User className="h-4 w-4"/> Recent Bookings</h3>
            <Link to="/tutor/sessions" className="text-sm text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1">See all <ArrowRight className="h-4 w-4"/></Link>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="text-sm text-slate-500">Loading…</div>
            ) : recentBookings.length === 0 ? (
              <div className="text-sm text-slate-500">No bookings yet.</div>
            ) : (
              <ul className="divide-y">
                {recentBookings.map((b) => (
                  <li key={b.id} className="py-2 flex items-center justify-between">
                    <div className="text-sm">
                      <div className="font-medium">{b.studentName}</div>
                      <div className="text-slate-600">{b.subject} · {new Date(b.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <span className={`text-xs rounded-full px-2 py-0.5 ${b.status === 'UPCOMING' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{b.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Link className="rounded-2xl border bg-white shadow-sm p-4 hover:shadow" to="/tutor/availability">
          <div className="font-semibold">Manage Availability</div>
          <div className="text-sm text-slate-600">Add or edit your open time slots.</div>
        </Link>
        <Link className="rounded-2xl border bg-white shadow-sm p-4 hover:shadow" to="/tutor/sessions">
          <div className="font-semibold">Sessions</div>
          <div className="text-sm text-slate-600">Review upcoming and past sessions.</div>
        </Link>
        <Link className="rounded-2xl border bg-white shadow-sm p-4 hover:shadow" to="/tutor/profile">
          <div className="font-semibold">Profile</div>
          <div className="text-sm text-slate-600">Update your bio, subjects, and rate.</div>
        </Link>
        <Link className="rounded-2xl border bg-white shadow-sm p-4 hover:shadow" to="/tutor/earnings">
          <div className="font-semibold">Earnings</div>
          <div className="text-sm text-slate-600">Check your total earnings.</div>
        </Link>
      </div>
    </div>
  );
}
