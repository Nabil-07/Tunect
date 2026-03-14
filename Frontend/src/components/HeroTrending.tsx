// src/components/HeroTrending.tsx
import type { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Star, AlertCircle, Search, Sparkles } from 'lucide-react';
import api from '../lib/apiClient';
import { useDisplayCurrency } from '../hooks/useDisplayCurrency';
import { formatCurrency } from '../utils/currency';
import { useAuth } from '../contexts/AuthContext';

let Motion: any = null;
void (async () => {
  try {
    const fm = await import('framer-motion');
    Motion = fm.motion;
  } catch {
    Motion = null;
  }
})();

export type TrendingTutor = {
  id: string;
  name: string;
  subject?: string;
  country?: string;
  rating?: number;
  hourly?: number;    // INR/hour
  img?: string;
  badges?: string[];
};

const normItem = (raw: any): TrendingTutor | null => {
  if (!raw) return null;
  const id = String(raw.id ?? raw.tutorId ?? raw._id ?? '').trim();
  const name = String(raw.name ?? raw.fullName ?? raw.displayName ?? '').trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    subject: raw.subject ?? raw.primarySubject ?? raw.topic ?? '',
    country: raw.country ?? raw.countryCode ?? raw.location ?? '',
    rating: typeof raw.rating === 'number' ? raw.rating : Number(raw.rating ?? 0),
    hourly:
      typeof raw.hourly === 'number' ? raw.hourly :
      typeof raw.pricePerHour === 'number' ? raw.pricePerHour :
      typeof raw.hourlyRate === 'number' ? raw.hourlyRate : Number(raw.rate ?? 0),
    img: raw.img ?? raw.avatarUrl ?? raw.photoUrl ?? '',
    badges: Array.isArray(raw.badges) ? raw.badges : [],
  };
};

const Card: FC<{ tutor: TrendingTutor; onBookDemo: (tutor: TrendingTutor) => void }> = ({ tutor, onBookDemo }) => {
  const { user } = useAuth();
  const [toast, setToast] = useState<string | null>(null);
  const { currency, rates } = useDisplayCurrency();
  const r = (code: string) => rates[code] ?? 1;
  const priceInDisplay = typeof tutor.hourly === 'number' && tutor.hourly > 0
    ? Math.round((tutor.hourly * (r(currency) / Math.max(r('INR'), 1e-9)) + Number.EPSILON) * 100) / 100
    : undefined;
  const stars = Math.max(0, Math.min(5, Math.round(tutor.rating ?? 0)));
  const ImgWrap = useMemo(() => (Motion ? Motion.div : 'div'), []);

  const handleBookDemo = () => {
    if (user?.role === 'TUTOR') {
      setToast('Tutor accounts cannot book demos with other tutors');
      setTimeout(() => setToast(null), 4000);
      return;
    }
    onBookDemo(tutor);
  };

  return (
    <div className="relative flex w-full flex-col overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-black/5">
      {toast && (
        <div className="absolute top-4 left-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-300 px-4 py-3 text-sm text-yellow-800 shadow-lg">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="flex-1">{toast}</span>
        </div>
      )}
      <ImgWrap initial={{ opacity: 0.6 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="h-48 w-full bg-slate-200">
        {tutor.img ? (
          <img src={tutor.img} alt={`${tutor.name}${tutor.subject ? ` · ${tutor.subject}` : ''}`} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-slate-100 to-slate-200" />
        )}
      </ImgWrap>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-ink">{tutor.name}</h3>
            {tutor.subject ? <p className="mt-0.5 text-sm text-slate-600">{tutor.subject}</p> : null}
            {tutor.country ? <p className="mt-1 text-xs text-slate-500">{tutor.country}</p> : null}
          </div>

          {typeof priceInDisplay === 'number' && priceInDisplay > 0 ? (
            <div className="shrink-0 rounded-xl bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
              {formatCurrency(priceInDisplay, currency)} /hr
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={`h-4 w-4 ${i < stars ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300'}`} />
          ))}
          <span className="ml-2 text-xs text-slate-600">{(tutor.rating ?? 0).toFixed(2)}</span>
        </div>

        {tutor.badges?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {tutor.badges.map((b) => (
              <span key={b} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-700">{b}</span>
            ))}
          </div>
        ) : null}

        <button className="btn-primary mt-4 w-full" onClick={handleBookDemo} data-testid="hero-trending-book-demo-btn">
          Book a demo
        </button>
      </div>
    </div>
  );
};

const Dots: FC<{ count: number; active: number }> = ({ count, active }) => (
  <div className="mt-3 flex items-center justify-center gap-2">
    {Array.from({ length: count }).map((_, i) => (
      <span key={i} className={`h-2 w-2 rounded-full ${i === active ? 'bg-slate-900' : 'bg-slate-300'}`} />
    ))}
  </div>
);

const HeroTrending: FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<TrendingTutor[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        // Fetch paginated endpoint to get total count
        const res = await api.get('/tutors/trending/all', { params: { page: 1, pageSize: 5 } });
        const responseData = res.data;

        let list: TrendingTutor[] = [];
        let total = 0;

        if (responseData && typeof responseData === 'object' && 'items' in responseData) {
          // Paginated response
          const raw = Array.isArray(responseData.items) ? responseData.items : [];
          list = raw.map(normItem).filter(Boolean) as TrendingTutor[];
          total = responseData.total ?? list.length;
        } else {
          // Legacy flat array response
          const raw = Array.isArray(responseData?.data) ? responseData.data : responseData;
          list = (Array.isArray(raw) ? raw : []).map(normItem).filter(Boolean) as TrendingTutor[];
          total = list.length;
        }

        if (!mounted) return;
        setData(list.slice(0, 5)); // Show max 5 in carousel
        setTotalCount(total);
        setIndex(0);
      } catch {
        if (!mounted) return;
        setError('Failed to load tutors');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (paused || data.length < 2) return;
    intervalRef.current = window.setInterval(() => setIndex((i) => (i + 1) % data.length), 3500);
    return () => { if (intervalRef.current) window.clearInterval(intervalRef.current); };
  }, [data.length, paused]);

  const goPrev = () => { if (data.length > 0) setIndex((i) => (i - 1 + data.length) % data.length); };
  const goNext = () => { if (data.length > 0) setIndex((i) => (i + 1) % data.length); };
  const Wrap = useMemo(() => (Motion ? Motion.div : 'div'), []);

  if (loading) return <div className="card p-6 text-center">Loading tutors...</div>;
  if (error) return <div className="card p-6 text-center text-red-600">{error}</div>;

  if (data.length === 0)
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-ocean-100">
          <Sparkles className="h-7 w-7 text-ocean-600" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Discover amazing tutors</h3>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">
          Our trending section highlights top-rated tutors loved by students.
          Browse all tutors to find your perfect match today.
        </p>
        <button
          onClick={() => navigate('/find-tutors')}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-ocean-700 transition"
          data-testid="hero-trending-browse-tutors-btn"
        >
          <Search className="h-4 w-4" /> Browse all tutors
        </button>
      </div>
    );

  const activeItem = data[index]!;
  const canSlide = data.length > 1;

  return (
    <div className="relative" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <Wrap key={activeItem.id || `idx-${index}`} initial={Motion ? { opacity: 0, y: 10 } : undefined} animate={Motion ? { opacity: 1, y: 0 } : undefined} transition={Motion ? { duration: 0.4 } : undefined} className="mx-auto max-w-lg">
        <Card tutor={activeItem} onBookDemo={(t) => navigate(`/student/demo-checkout?tutorId=${t.id}`)} />
      </Wrap>

      <button aria-label="Previous" onClick={goPrev} disabled={!canSlide} className={`absolute -left-3 top-1/2 -translate-y-[50%] rounded-full border bg-white p-2 shadow disabled:opacity-40`} data-testid="hero-trending-prev-btn">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button aria-label="Next" onClick={goNext} disabled={!canSlide} className={`absolute -right-3 top-1/2 -translate-y-[50%] rounded-full border bg-white p-2 shadow disabled:opacity-40`} data-testid="hero-trending-next-btn">
        <ChevronRight className="h-5 w-5" />
      </button>

      <Dots count={data.length} active={index} />

      {/* View All Trending Tutors link - shown when more than 5 trending tutors exist */}
      {totalCount > 5 && (
        <div className="mt-4 text-center">
          <button
            onClick={() => navigate('/trending-tutors')}
            className="inline-flex items-center gap-2 text-sm font-semibold text-ocean-600 hover:text-ocean-700 transition"
            data-testid="hero-trending-view-all-btn"
          >
            View all {totalCount} trending tutors
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default HeroTrending;
