// src/pages/tutor/public-profile.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { getTutor } from '../../services/tutorService';            // ⬅️ no named `Tutor` import
import { api } from '../../lib/apiClient';
import { useDisplayCurrency } from '../../hooks/useDisplayCurrency';
import { formatCurrency } from '../../utils/currency';
import BuyTokensButton from '../../components/BuyTokensButton';
import { createDemoBooking } from '../../services/bookingsService';
import { useAuth } from '../../contexts/AuthContext';

type BookableSlot = { startTime: string; endTime: string };

// keep it local so we don't rely on a type export from the service
type TutorPublic = {
  id: string;
  name?: string;
  subject?: string;
  subjects?: string[];
  avatarUrl?: string;
  hourlyRate?: number;
  bio?: string;
  summary?: string;
  languages?: string[];
  yearsExperience?: number;
  degrees?: string[];
  qualifications?: string;
  classesTeach?: string[];
  teachingClasses?: string[];
  rating?: number;
  reviews?: number;
  verified?: boolean;
};

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }
function sameDay(a: Date, b: Date) { return a.toDateString() === b.toDateString(); }

export default function TutorPublicProfile() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { user } = useAuth();
  const isDemoIntent = useMemo(
    () => new URLSearchParams(location.search).get('demo') === '1',
    [location.search],
  );
  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );

  const { currency, rates } = useDisplayCurrency();
  const r = (code: string) => rates[code] ?? 1; // USD->code

  const [tutor, setTutor] = useState<TutorPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [bookable, setBookable] = useState<BookableSlot[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const days = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const res: Date[] = [];

    // Monday-first grid
    const padStart = (start.getDay() + 6) % 7;
    for (let i = 0; i < padStart; i++) {
      res.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() - (padStart - i)));
    }

    // month days
    for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      res.push(new Date(d));
    }

    // pad tail
    const padEnd = (7 - (res.length % 7)) % 7;
    for (let i = 1; i <= padEnd; i++) {
      res.push(new Date(end.getFullYear(), end.getMonth(), end.getDate() + i));
    }
    return res;
  }, [month]);

  const fetchSlots = useCallback(async (targetMonth: Date) => {
    if (!id) return [] as BookableSlot[];
    const from = startOfMonth(targetMonth).toISOString();
    const to = endOfMonth(targetMonth).toISOString();

    const params = { from, to, durationMin: 60, stepMin: 15 } as const;

    try {
      const { data } = await api.get(`/availability/tutors/${id}/bookable`, { params });
      const slots = Array.isArray(data?.slices) ? data.slices : [];
      return (slots as BookableSlot[]).filter((s) => s?.startTime && s?.endTime);
    } catch {
      try {
        const { data } = await api.get(`/availability/tutor/${id}/bookable`, { params });
        const slots = Array.isArray(data?.slices) ? data.slices : Array.isArray(data) ? data : [];
        return (slots as BookableSlot[]).filter((s) => s?.startTime && s?.endTime);
      } catch {
        try {
          const { data } = await api.get(`/availability/bookable/${id}`, { params });
          const slots = Array.isArray(data?.slices) ? data.slices : Array.isArray(data) ? data : [];
          return (slots as BookableSlot[]).filter((s) => s?.startTime && s?.endTime);
        } catch {
          return [] as BookableSlot[];
        }
      }
    }
  }, [id]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const t = await getTutor(id!);
        if (!mounted) return;
        setTutor(t as TutorPublic);

        const slots = await fetchSlots(month);
        if (!mounted) return;
        setBookable(slots);
      } catch (e) {
        if (mounted) {
          setErr('Unable to load tutor.');
          setTutor(null);
          setBookable([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id, month, fetchSlots]);

  useEffect(() => {
    if (location.hash === '#slots') {
      const anchor = document.getElementById('slots-anchor');
      anchor?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.hash, bookable.length]);

  async function bookSlot(slot: BookableSlot) {
    if (!id) return;
    
    if (user?.role === 'TUTOR') {
      setToast('Tutor accounts cannot book demos or slots with other tutors');
      setTimeout(() => setToast(null), 4000);
      return;
    }

    try {
      setBusy(true);

      if (isDemoIntent) {
        // schedule demo immediately in the chosen slice
        await createDemoBooking(
          {
            tutorId: id,
            startTime: slot.startTime,
            endTime: slot.endTime,
            notes: 'Demo from public profile',
          },
          timezone,
        );
      } else {
        // paid booking flow (requires tokens)
        await api.post(
          '/bookings',
          { tutorId: id, startTime: slot.startTime, endTime: slot.endTime, notes: 'Booked from public profile' },
          { params: { tz: timezone } },
        );
      }

      // refresh slots so the taken one disappears for everyone
      const slots = await fetchSlots(month);
      setBookable(slots);
      setToast(isDemoIntent ? 'Demo slot confirmed!' : 'Booking created!');
    } catch (e: any) {
      console.error(e);
      const status = e?.response?.status;
      if (status === 409 || status === 400) {
        setToast('That slot was just taken. Please pick another.');
        const slots = await fetchSlots(month);
        setBookable(slots);
      } else {
        setToast('Could not book. Please try again.');
      }
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  if (loading) {
    return (
      <main className="container mx-auto py-10 px-4">
        <div className="card h-32 animate-pulse bg-gray-100 rounded-md" />
      </main>
    );
  }

  if (err || !tutor) {
    return (
      <main className="container mx-auto py-10 px-4">
        <div className="text-sm text-red-700">{err || 'Tutor not found.'}</div>
      </main>
    );
  }

  const priceInDisplay = typeof tutor.hourlyRate === 'number'
    ? Math.round((tutor.hourlyRate * (r(currency) / Math.max(r('INR'), 1e-9)) + Number.EPSILON) * 100) / 100
    : undefined;

  return (
    <main className="container mx-auto py-10 px-4 max-w-7xl">
      {toast && <div className="mb-4 p-3 rounded bg-black text-white inline-block">{toast}</div>}

      <div className="grid gap-6 lg:grid-cols-[350px_1fr]">
        <div className="space-y-4">
          {/* Main Profile Card */}
          <div className="card p-6 rounded-xl border bg-white shadow-sm sticky top-4">
            <div className="relative">
              <img
                src={
                  tutor.avatarUrl ||
                  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(tutor.name || 'Tutor')}`
                }
                alt={tutor.name || 'Tutor'}
                className="w-full rounded-2xl object-cover aspect-square"
              />
              {tutor.verified && (
                <div className="absolute top-3 right-3 bg-emerald-600 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Verified
                </div>
              )}
            </div>
            
            <h1 className="mt-4 text-2xl font-bold text-slate-900">{tutor.name}</h1>
            
            {/* Rating */}
            {tutor.rating !== undefined && tutor.rating > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center">
                  {[...Array(5)].map((_, i) => (
                    <svg
                      key={i}
                      className={`h-4 w-4 ${i < Math.round(tutor.rating!) ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <span className="text-sm text-slate-600">
                  {tutor.rating.toFixed(1)} ({tutor.reviews || 0} reviews)
                </span>
              </div>
            )}

            {/* Primary Subject */}
            <div className="text-sm text-slate-600 mt-2">
              {tutor.subject || tutor.subjects?.[0] || 'Subject not specified'}
            </div>
            
            {/* Price */}
            <div className="mt-4 p-4 bg-indigo-50 rounded-lg">
              {priceInDisplay != null ? (
                <div>
                  <div className="text-xs text-slate-600 mb-1">Hourly Rate</div>
                  <div className="text-2xl font-bold text-indigo-700">{formatCurrency(priceInDisplay, currency)}</div>
                  <div className="text-xs text-slate-500">per hour</div>
                </div>
              ) : (
                <span className="text-slate-500">Price not set</span>
              )}
            </div>

            {/* Purchase Tokens */}
            <div className="mt-5 border-t pt-4">
              <h3 className="text-sm font-semibold mb-2">Purchase Tokens</h3>
              <p className="text-xs text-slate-600 mb-3">
                Each token costs ₹{tutor.hourlyRate ?? '--'} (paid via Razorpay).
              </p>
              <BuyTokensButton
                tutorId={id!}
                defaultTokens={10}
                onSuccess={() => setToast('Payment successful! Tokens credited.')}
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Summary/Bio Section */}
          <div className="card p-6 rounded-xl border bg-white shadow-sm">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              About {tutor.name?.split(' ')[0] || 'Tutor'}
            </h2>
            <p className="text-slate-700 leading-relaxed">
              {tutor.summary || tutor.bio || 'This tutor has not added a bio yet.'}
            </p>
          </div>

          {/* Experience & Qualifications */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Experience */}
            {tutor.yearsExperience !== undefined && tutor.yearsExperience > 0 && (
              <div className="card p-6 rounded-xl border bg-white shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Experience</h3>
                    <p className="text-2xl font-bold text-purple-600">{tutor.yearsExperience}+ years</p>
                  </div>
                </div>
              </div>
            )}

            {/* Qualifications */}
            {(tutor.degrees?.length || tutor.qualifications) && (
              <div className="card p-6 rounded-xl border bg-white shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-emerald-100 rounded-lg flex-shrink-0">
                    <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path d="M12 14l9-5-9-5-9 5 9 5z" />
                      <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-2">Education</h3>
                    {tutor.degrees && tutor.degrees.length > 0 ? (
                      <ul className="space-y-1">
                        {tutor.degrees.map((degree, idx) => (
                          <li key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                            <span className="text-emerald-600 mt-1">•</span>
                            <span>{degree}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-700">{tutor.qualifications}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Subjects */}
          {tutor.subjects && tutor.subjects.length > 0 && (
            <div className="card p-6 rounded-xl border bg-white shadow-sm">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Subjects I Teach
              </h2>
              <div className="flex flex-wrap gap-2">
                {tutor.subjects.map((subject, idx) => (
                  <span
                    key={idx}
                    className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
                  >
                    {subject}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Classes/Grades Taught */}
          {(tutor.classesTeach?.length || tutor.teachingClasses?.length) && (
            <div className="card p-6 rounded-xl border bg-white shadow-sm">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                Classes/Grades I Teach
              </h2>
              <div className="flex flex-wrap gap-2">
                {(tutor.classesTeach || tutor.teachingClasses || []).map((cls, idx) => (
                  <span
                    key={idx}
                    className="px-4 py-2 bg-amber-100 text-amber-700 rounded-full text-sm font-medium"
                  >
                    {cls}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Languages */}
          {tutor.languages && tutor.languages.length > 0 && (
            <div className="card p-6 rounded-xl border bg-white shadow-sm">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                </svg>
                Languages
              </h2>
              <div className="flex flex-wrap gap-2">
                {tutor.languages.map((lang, idx) => (
                  <span
                    key={idx}
                    className="px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-medium flex items-center gap-2"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                    </svg>
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Available Slots */}
          <div id="slots-anchor" className="card p-6 rounded-xl border bg-white shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Available Slots
                </h2>
                {isDemoIntent && (
                  <p className="text-sm text-emerald-600 mt-1">Pick a slot to confirm your free demo.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1 border rounded hover:bg-slate-50"
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <div className="font-medium text-sm">
                  {month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                </div>
                <button
                  className="px-3 py-1 border rounded hover:bg-slate-50"
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2 text-xs text-slate-500 mb-2 font-medium">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                <div key={d} className="text-center">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {days.map((d, i) => {
                const slotsForDay = bookable.filter(s => sameDay(new Date(s.startTime), d));
                const inMonth = d.getMonth() === month.getMonth();
                const isToday = sameDay(d, new Date());
                return (
                  <div 
                    key={i} 
                    className={`border rounded-lg p-2 min-h-[80px] ${
                      inMonth ? 'bg-white' : 'bg-slate-50'
                    } ${isToday ? 'ring-2 ring-indigo-500' : ''}`}
                  >
                    <div className={`text-xs mb-1 font-medium ${isToday ? 'text-indigo-600' : 'text-slate-700'}`}>
                      {d.getDate()}
                    </div>
                    <div className="space-y-1">
                      {slotsForDay.length === 0 ? (
                        <div className="text-[10px] text-slate-400">No slots</div>
                      ) : (
                        slotsForDay.slice(0, 3).map((s, idx) => (
                          <div key={`${s.startTime}-${idx}`} className="flex flex-col gap-1">
                            <div className="text-[10px] text-slate-600">
                              {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <button
                              disabled={busy}
                              onClick={() => bookSlot(s)}
                              className="text-[10px] px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition"
                            >
                              {busy ? '...' : 'Book'}
                            </button>
                          </div>
                        ))
                      )}
                      {slotsForDay.length > 3 && (
                        <div className="text-[10px] text-indigo-600 font-medium">
                          +{slotsForDay.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {bookable.length === 0 && (
              <div className="mt-4 text-sm text-center text-slate-500 bg-slate-50 p-4 rounded-lg">
                No slots are currently open. We'll notify you once the tutor adds availability.
              </div>
            )}
          </div>

          {/* Reviews Section */}
          <div className="card p-6 rounded-xl border bg-white shadow-sm">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <svg className="h-6 w-6 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              Reviews
            </h2>
            <p className="text-sm text-slate-600">This section will be wired soon with live reviews.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
