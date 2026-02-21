// src/pages/tutor/public-profile.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import SEO from '../../components/SEO';
import { getTutor } from '../../services/tutorService';            // ⬅️ no named `Tutor` import
import { api } from '../../lib/apiClient';
import { useDisplayCurrency } from '../../hooks/useDisplayCurrency';
import { formatCurrency } from '../../utils/currency';
import BuyTokensButton from '../../components/BuyTokensButton';
import { createDemoBooking, assignSlot, getDemoDetailForTutor } from '../../services/bookingsService';
import { useAuth } from '../../contexts/AuthContext';
import NotificationModal from '../../components/common/NotificationModal';
import { generateTutorSlug, parseTutorIdFromSlug } from '../../utils/seo';

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
  classSubjectMappings?: { classRange: string; subjects: string[] }[];
  rating?: number;
  reviews?: number;
  verified?: boolean;
};

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }
function sameDay(a: Date, b: Date) { return a.toDateString() === b.toDateString(); }

export default function TutorPublicProfile() { // NOSONAR
  const { slug: idOrSlug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Parse ID from slug if needed (backward compatibility)
  const id = useMemo(() => {
    if (!idOrSlug) return null;
    
    // If it's already a full CUID (25 chars, starts with 'c'), use it directly
    if (idOrSlug.length === 25 && /^c[a-z0-9]{24}$/.test(idOrSlug)) {
      return idOrSlug;
    }
    
    // If it looks like a slug (has dashes), try to parse ID
    if (idOrSlug.includes('-')) {
      const parsed = parseTutorIdFromSlug(idOrSlug);
      if (parsed) return parsed;
      // If parsing fails, try extracting the last part (might be partial ID)
      const parts = idOrSlug.split('-');
      const lastPart = parts.at(-1);
      if (lastPart && lastPart.length >= 8) {
        return lastPart; // Backend will handle lookup with endsWith
      }
    }
    
    // Already an ID (might be partial)
    return idOrSlug;
  }, [idOrSlug]);
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
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [tokenBalanceLoading, setTokenBalanceLoading] = useState(false);
  const [daysUntilExpiry, setDaysUntilExpiry] = useState<number | null>(null);
  
  // Reviews state
  const [reviews, setReviews] = useState<Array<{
    id: string;
    rating: number;
    comment: string | null;
    createdAt: string;
    student?: { id: string; user?: { email?: string } };
  }>>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsStats, setReviewsStats] = useState<{ avgRating?: number } | null>(null);
  
  // Availability info state
  const [availabilityInfo, setAvailabilityInfo] = useState<{
    lastActive: string | null;
    consistencyPercentage: number;
    weeklyHours: number;
    isFeatured: boolean;
    isVerified: boolean;
  } | null>(null);

  const deriveAvailabilityInfo = (slots: Array<{ startTime?: string; endTime?: string }>, verified?: boolean) => {
    const now = new Date();
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const activeDays = new Set<string>();
    let weeklyMinutes = 0;

    const validSlots = slots
      .filter((s) => s?.startTime && s?.endTime)
      .map((s) => ({ start: new Date(s.startTime as string), end: new Date(s.endTime as string) }))
      .filter((s) => !Number.isNaN(s.start.getTime()) && !Number.isNaN(s.end.getTime()));

    validSlots.forEach((slot) => {
      if (slot.start >= now && slot.start <= weekEnd) {
        activeDays.add(slot.start.toISOString().split('T')[0]);
        const mins = Math.max(0, (slot.end.getTime() - slot.start.getTime()) / (1000 * 60));
        weeklyMinutes += mins;
      }
    });

    const lastActive = validSlots.length
      ? validSlots.reduce((latest, cur) => (cur.start > latest ? cur.start : latest), validSlots[0].start)
      : null;

    const consistencyPercentage = Math.round((activeDays.size / 7) * 100);
    const weeklyHours = Math.round((weeklyMinutes / 60) * 10) / 10;

    return {
      lastActive: lastActive ? lastActive.toISOString() : null,
      consistencyPercentage,
      weeklyHours,
      isFeatured: false,
      isVerified: !!verified,
    };
  };

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

  const mappingRows = useMemo(() => {
    const rows = Array.isArray(tutor?.classSubjectMappings) ? tutor.classSubjectMappings : [];
    const normalizedRows = rows
      .map((row) => ({
        classRange: String(row?.classRange || '').trim(),
        subjects: Array.isArray(row?.subjects)
          ? row.subjects.map((s) => String(s || '').trim()).filter(Boolean)
          : [],
      }))
      .filter((row) => row.classRange && row.subjects.length);

    if (normalizedRows.length > 0) return normalizedRows;

    const classFallback = (tutor?.classesTeach ?? tutor?.teachingClasses ?? [])
      .map((cls) => String(cls || '').trim())
      .filter(Boolean);
    const subjectFallback = (tutor?.subjects ?? [])
      .map((s) => String(s || '').trim())
      .filter(Boolean);

    if (!classFallback.length && !subjectFallback.length) return [];

    if (!classFallback.length) {
      return subjectFallback.map((s) => ({ classRange: '', subjects: [s] }));
    }
    if (!subjectFallback.length) {
      return classFallback.map((c) => ({ classRange: c, subjects: [] }));
    }

    const pairCount = Math.min(classFallback.length, subjectFallback.length);
    return Array.from({ length: pairCount }, (_, i) => ({
      classRange: classFallback[i],
      subjects: [subjectFallback[i]],
    }));
  }, [tutor]);

  const normalizeSlots = (data: any): BookableSlot[] => {
    if (Array.isArray(data?.slices)) return data.slices as BookableSlot[];
    if (Array.isArray(data)) return data as BookableSlot[];
    return [] as BookableSlot[];
  };

  const fetchSlots = useCallback(async (targetMonth: Date) => { // NOSONAR
    if (!id) return [] as BookableSlot[];
    const from = startOfMonth(targetMonth).toISOString();
    const to = endOfMonth(targetMonth).toISOString();

    const params = { from, to, durationMin: 60, stepMin: 15 } as const;

    try {
      const { data } = await api.get(`/availability/tutors/${id}/bookable`, { params });
      const slots = normalizeSlots(data);
      return slots.filter((s) => s?.startTime && s?.endTime);
    } catch {
      try {
        const { data } = await api.get(`/availability/tutor/${id}/bookable`, { params });
        const slots = normalizeSlots(data);
        return slots.filter((s) => s?.startTime && s?.endTime);
      } catch {
        try {
          const { data } = await api.get(`/availability/bookable/${id}`, { params });
          const slots = normalizeSlots(data);
          return slots.filter((s) => s?.startTime && s?.endTime);
        } catch {
          return [] as BookableSlot[];
        }
      }
    }
  }, [id]);

  const fetchAvailabilityInfo = async (tutorId: string, verified?: boolean) => {
    try {
      const res = await api.get(`/tutors/${tutorId}/availability-info`);
      const info = res?.data;
      if (info && typeof info === 'object') {
        setAvailabilityInfo({
          lastActive: info.lastActive ?? null,
          consistencyPercentage: Number(info.consistencyPercentage ?? 0),
          weeklyHours: Number(info.weeklyHours ?? 0),
          isFeatured: Boolean(info.isFeatured),
          isVerified: Boolean(info.isVerified),
        });
        return;
      }
      throw new Error('Invalid availability info response');
    } catch {
      try {
        const res = await api.get(`/availability/tutors/${tutorId}`);
        const slots = Array.isArray(res.data) ? res.data : [];
        setAvailabilityInfo(deriveAvailabilityInfo(slots, verified));
      } catch {
        setAvailabilityInfo(deriveAvailabilityInfo([], verified));
      }
    }
  };

  // Fetch reviews for tutor
  const fetchReviews = useCallback(async (tutorId: string) => {
    if (!tutorId) return;
    try {
      setReviewsLoading(true);
      const { data } = await api.get(`/reviews/tutor/${tutorId}`, {
        params: { page: 1, pageSize: 10 },
      });
      if (data?.items) {
        setReviews(data.items);
      }
      if (data?.stats) {
        setReviewsStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
      // Don't show error to user - just leave reviews empty
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  // Fetch token balance for this tutor (for students only)
  const fetchTokenBalance = useCallback(async (tutorId: string) => {
    if (!tutorId || user?.role !== 'STUDENT') {
      setTokenBalance(null);
      setDaysUntilExpiry(null);
      return;
    }
    try {
      setTokenBalanceLoading(true);
      const { data } = await api.get('/students/me/token-balances');
      const balances = Array.isArray(data) ? data : [];
      const balance = balances.find((b: any) => b.tutorId === tutorId);
      setTokenBalance(balance ? Number(balance.balance || 0) : 0);
      setDaysUntilExpiry(balance?.daysUntilExpiry ?? null);
    } catch (error) {
      console.error('Failed to fetch token balance:', error);
      setTokenBalance(null);
      setDaysUntilExpiry(null);
    } finally {
      setTokenBalanceLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    if (tutor?.id) {
      fetchTokenBalance(tutor.id);
    }
  }, [tutor?.id, fetchTokenBalance]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const t = await getTutor(id!);
        if (!mounted) return;
        setTutor(t as TutorPublic);
        
        // Fetch reviews and availability info after tutor is loaded
        if (t?.id) {
          fetchReviews(t.id);
          void fetchAvailabilityInfo(t.id, t?.verified);
        }

        // Redirect to slug-based URL if not already using slug
        if (idOrSlug && !idOrSlug.includes('-')) {
          const slug = generateTutorSlug(t as TutorPublic);
          const newPath = `/tutors/${slug}`;
          if (location.pathname !== newPath) {
            navigate(newPath, { replace: true });
          }
        }

        const slots = await fetchSlots(month);
        if (!mounted) return;
        setBookable(slots);
      } catch (e) {
        console.error('Failed to load tutor profile:', e);
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
  }, [id, idOrSlug, month, fetchSlots, navigate, location.pathname]);

  useEffect(() => {
    if (location.hash === '#slots') {
      const anchor = document.getElementById('slots-anchor');
      anchor?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.hash, bookable.length]);

  async function bookSlot(slot: BookableSlot) {
    if (!id || !tutor?.id) return;
    
    if (user?.role === 'TUTOR') {
      setToast('Tutor accounts cannot book demos or slots with other tutors');
      setTimeout(() => setToast(null), 4000);
      return;
    }

    // For paid bookings, check token balance before proceeding
    if (!isDemoIntent && user?.role === 'STUDENT') {
      if (tokenBalanceLoading) {
        setErrorModal('Please wait while we check your token balance...');
        return;
      }
      
      // Check if booking is in the past
      const start = new Date(slot.startTime);
      const now = new Date();
      if (start < now) {
        setErrorModal(
          'This date has already passed. Please select a future date and time to book a session.'
        );
        return;
      }
      
      // Calculate required tokens: 1 token per hour (TOKENS_PER_HOUR = 1)
      const end = new Date(slot.endTime);
      const hours = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
      const requiredTokens = Math.ceil(hours * 1); // 1 token per hour
      
      if (tokenBalance === null || tokenBalance < requiredTokens) {
        setErrorModal(
          'You don\'t have enough tokens to book this session. Please purchase more tokens before booking.'
        );
        return;
      }
    }

    try {
      setBusy(true);

      if (isDemoIntent) {
        // Check if a PENDING demo already exists (e.g., created from checkout page)
        const demoDetail = await getDemoDetailForTutor(tutor.id);
        
        if (demoDetail.used && demoDetail.bookingId && 
            (demoDetail.bookingStatus === 'PENDING' || demoDetail.bookingStatus === 'PENDING_SLOT')) {
          // Assign the slot to the existing PENDING demo booking
          await assignSlot(
            demoDetail.bookingId,
            { startTime: slot.startTime, endTime: slot.endTime, notes: 'Demo from public profile' },
            timezone,
          );
        } else if (demoDetail.used) {
          // Demo already CONFIRMED or COMPLETED
          setErrorModal('You already have a demo session with this tutor.');
          return;
        } else {
          // No existing demo — create a new one with times (CONFIRMED)
          await createDemoBooking(
            {
              tutorId: tutor.id,
              startTime: slot.startTime,
              endTime: slot.endTime,
              notes: 'Demo from public profile',
            },
            timezone,
          );
        }
        
        // Refresh demo status after successful booking
        window.dispatchEvent(new CustomEvent('demo-status-changed', { 
          detail: { tutorId: tutor.id } 
        }));
      } else {
        // paid booking flow (requires tokens)
        await api.post(
          '/bookings',
          { tutorId: tutor.id, startTime: slot.startTime, endTime: slot.endTime, notes: 'Booked from public profile' },
          { params: { tz: timezone } },
        );
        
        // Refresh token balances after paid booking
        window.dispatchEvent(new CustomEvent('token-balance-changed'));
        // Refresh token balance for this tutor
        if (tutor?.id) {
          fetchTokenBalance(tutor.id);
        }
      }

      // refresh slots so the taken one disappears for everyone
      const slots = await fetchSlots(month);
      setBookable(slots);
      setToast(isDemoIntent ? 'Demo slot confirmed!' : 'Booking created!');
    } catch (e: any) {
      console.error('Booking error response:', e?.response?.data);
      const status = e?.response?.status;
      const apiError = e?.response?.data?.error;
      const message = e?.response?.data?.message || '';
      
      // Check for past date errors (various message formats)
      if (
        message.toLowerCase().includes('past') ||
        message.toLowerCase().includes('already passed') ||
        message.toLowerCase().includes('future date')
      ) {
        setErrorModal(
          'This date has already passed. Please select a future date and time to book a session.'
        );
        return;
      }
      
      if (apiError === 'INSUFFICIENT_TOKENS') {
        setErrorModal(e?.response?.data?.message || 'You need more tokens to book this slot.');
        return;
      }
      
      if (status === 409 || status === 400) {
        if (message.includes('already have')) {
          setErrorModal(message);
        } else {
          setErrorModal('That slot was just taken. Please pick another.');
          const slots = await fetchSlots(month);
          setBookable(slots);
        }
      } else {
        setErrorModal(e?.response?.data?.message || 'Could not book. Please try again.');
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

  // SEO and Structured Data
  const seoTitle = tutor
    ? `${tutor.name} - ${tutor.subject || tutor.subjects?.[0] || 'Online Tutor'} | Tunect`
    : 'Tutor Profile | Tunect';
  const seoDescription = tutor
    ? `Book 1-on-1 online tutoring sessions with ${tutor.name}, expert ${tutor.subject || tutor.subjects?.[0] || 'tutor'}. ${tutor.bio ? tutor.bio.substring(0, 120) : 'Verified tutor on Tunect.'} First session free!`
    : 'View tutor profile and book 1-on-1 online tutoring sessions. First session free!';

  // Person + Review Schema for tutor
  const tutorSchema = tutor
    ? {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: tutor.name,
        jobTitle: 'Online Tutor',
        description: tutor.bio || tutor.summary,
        image: tutor.avatarUrl || undefined,
        ...(tutor.rating && tutor.reviews
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: tutor.rating,
                reviewCount: tutor.reviews,
                bestRating: 5,
                worstRating: 1,
              },
            }
          : {}),
        ...(tutor.subjects && tutor.subjects.length > 0
          ? {
              knowsAbout: tutor.subjects,
            }
          : {}),
      }
    : null;

  return (
    <main className="container mx-auto py-10 px-4 max-w-7xl">
      {tutor && (
        <SEO
          title={seoTitle}
          description={seoDescription}
          url={`/tutors/${generateTutorSlug(tutor)}`}
          image={tutor.avatarUrl || undefined}
          type="profile"
          structuredData={tutorSchema || undefined}
        />
      )}
      {toast && <div className="mb-4 p-3 rounded bg-black text-white inline-block">{toast}</div>}
      <NotificationModal
        open={!!errorModal}
        onClose={() => setErrorModal(null)}
        title="Booking Error"
        message={errorModal || 'Could not book. Please try again.'}
        type="error"
        confirmText="Close"
      />

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
                alt={`${tutor.name || 'Tutor'} - ${tutor.subject || tutor.subjects?.[0] || 'Online Tutor'} on Tunect`}
                className="w-full rounded-2xl object-cover aspect-square"
                loading="lazy"
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

            {/* Availability Info */}
            {availabilityInfo && (
              <div className="mt-4 space-y-2 text-sm">
                {availabilityInfo.lastActive && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Last Active: {new Date(availabilityInfo.lastActive).toLocaleDateString()}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-slate-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span>
                    Availability Consistency:{' '}
                    {Number.isFinite(Number(availabilityInfo.consistencyPercentage))
                      ? Number(availabilityInfo.consistencyPercentage).toFixed(0)
                      : '0'}%
                  </span>
                </div>
                {(availabilityInfo.isFeatured || availabilityInfo.isVerified) && (
                  <div className="flex gap-2 mt-2">
                    {availabilityInfo.isFeatured && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                        ⭐ Featured
                      </span>
                    )}
                    {availabilityInfo.isVerified && (
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">
                        ✓ Verified
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
            
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
              <h3 className="text-sm font-semibold mb-2">Your Tokens</h3>
              
              {/* Token Balance Display */}
              {user?.role === 'STUDENT' && (
                <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                  {tokenBalanceLoading ? (
                    <div className="text-sm text-slate-600">Loading token info...</div>
                  ) : tokenBalance !== null && tokenBalance > 0 ? (
                    <div>
                      <div className="text-sm font-semibold text-slate-900 mb-1">
                        ₹{tutor.hourlyRate ?? '--'} × {Math.floor(tokenBalance)} tokens = ₹{Math.floor(tokenBalance) * (tutor.hourlyRate || 0)} available
                      </div>
                      {daysUntilExpiry !== null && daysUntilExpiry >= 0 ? (
                        <div className={`text-xs font-medium ${
                          daysUntilExpiry < 7 ? 'text-red-600' : 
                          daysUntilExpiry < 30 ? 'text-amber-600' : 
                          'text-emerald-600'
                        }`}>
                          ⏰ Use token or expires in {daysUntilExpiry} days
                        </div>
                      ) : daysUntilExpiry !== null ? (
                        <div className="text-xs font-medium text-red-600">
                          ⚠️ Tokens have expired
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-600">No tokens yet. Purchase to book a session.</div>
                  )}
                </div>
              )}

              <p className="text-xs text-slate-600 mb-3">
                Each token costs ₹{tutor.hourlyRate ?? '--'} (paid via Razorpay).
              </p>
              <BuyTokensButton
                tutorId={id!}
                defaultTokens={5}
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

          {/* What I Teach */}
          {mappingRows.length > 0 && (
            <div className="card p-6 rounded-xl border bg-white shadow-sm">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                What I Teach
              </h2>
              <div className="space-y-3">
                {mappingRows.map((row, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2">
                    {row.classRange && (
                      <span className="rounded-full bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-700">
                        {row.classRange}
                      </span>
                    )}
                    {row.classRange && row.subjects.length > 0 && (
                      <span className="text-sm font-semibold text-slate-400">→</span>
                    )}
                    {row.subjects.map((subject) => (
                      <span
                        key={subject}
                        className="rounded-full bg-indigo-100 px-3 py-1.5 text-sm font-medium text-indigo-700"
                      >
                        {subject}
                      </span>
                    ))}
                  </div>
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
                Languages I Speak
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
          <div id="slots-anchor" className="card p-3 sm:p-6 rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
                  <svg className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

            {/* Day headers - hidden on small screens */}
            <div className="hidden sm:grid grid-cols-7 gap-1 sm:gap-2 text-xs text-slate-500 mb-2 font-medium">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                <div key={d} className="text-center">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-7 gap-1 sm:gap-2">
              {days.map((d, i) => {
                const slotsForDay = bookable.filter(s => sameDay(new Date(s.startTime), d));
                const inMonth = d.getMonth() === month.getMonth();
                const isToday = sameDay(d, new Date());
                const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short' });
                return (
                  <div 
                    key={i} 
                    className={`border rounded-lg p-1.5 sm:p-2 min-h-[70px] sm:min-h-[80px] ${
                      inMonth ? 'bg-white' : 'bg-slate-50'
                    } ${isToday ? 'ring-2 ring-indigo-500' : ''}`}
                  >
                    <div className={`text-xs mb-1 font-medium ${isToday ? 'text-indigo-600' : 'text-slate-700'}`}>
                      <span className="sm:hidden text-[9px] text-slate-400 mr-0.5">{dayLabel}</span>
                      {d.getDate()}
                    </div>
                    <div className="space-y-1">
                      {slotsForDay.length === 0 ? (
                        <div className="text-[9px] sm:text-[10px] text-slate-400">No slots</div>
                      ) : (
                        slotsForDay.slice(0, 2).map((s, idx) => (
                          <div key={`${s.startTime}-${idx}`} className="flex flex-col gap-0.5">
                            <div className="text-[9px] sm:text-[10px] text-slate-600 truncate">
                              {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                            </div>
                            <button
                              disabled={busy}
                              onClick={() => bookSlot(s)}
                              className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition"
                            >
                              {busy ? '...' : 'Book'}
                            </button>
                          </div>
                        ))
                      )}
                      {slotsForDay.length > 2 && (
                        <div className="text-[9px] sm:text-[10px] text-indigo-600 font-medium">
                          +{slotsForDay.length - 2} more
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <svg className="h-6 w-6 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                Reviews
                {reviewsStats?.avgRating && (
                  <span className="text-sm font-normal text-slate-600">
                    ({reviewsStats.avgRating.toFixed(1)} avg)
                  </span>
                )}
              </h2>
              {reviews.length > 0 && (
                <span className="text-sm text-slate-600">
                  {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
                </span>
              )}
            </div>
            
            {reviewsLoading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
                <p className="text-sm text-slate-600 mt-2">Loading reviews...</p>
              </div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-sm text-slate-600 mt-2">No reviews yet. Be the first to review this tutor!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {reviews.map((review) => {
                  const reviewDate = new Date(review.createdAt);
                  const studentEmail = review.student?.user?.email || 'Anonymous';
                  const studentInitials = studentEmail.split('@')[0].substring(0, 2).toUpperCase();
                  
                  return (
                    <div key={review.id} className="border-t pt-4 first:border-t-0 first:pt-0">
                      <div className="flex items-start gap-4">
                        {/* Student Avatar */}
                        <div className="flex-shrink-0">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                            {studentInitials}
                          </div>
                        </div>
                        
                        {/* Review Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="flex items-center">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <svg
                                  key={star}
                                  className={`h-4 w-4 ${
                                    star <= review.rating
                                      ? 'text-amber-400 fill-current'
                                      : 'text-slate-300'
                                  }`}
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                              ))}
                            </div>
                            <span className="text-sm font-medium text-slate-900">
                              {studentEmail.split('@')[0]}
                            </span>
                            <span className="text-xs text-slate-500">
                              {reviewDate.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                          {review.comment && (
                            <p className="text-sm text-slate-700 leading-relaxed mt-2">
                              {review.comment}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
