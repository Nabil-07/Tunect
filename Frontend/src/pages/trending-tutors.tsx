// src/pages/trending-tutors.tsx
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Star, AlertCircle, MessageSquare, TrendingUp, Filter } from 'lucide-react';
import SEO from '../components/SEO';
import api from '../lib/apiClient';
import { useDisplayCurrency } from '../hooks/useDisplayCurrency';
import { formatCurrency } from '../utils/currency';
import { useAuth } from '../contexts/AuthContext';
import { getFilterOptions } from '../services/tutorService';
import { getDemoStatusesForTutors } from '../services/bookingsService';
import { generateTutorSlug } from '../utils/seo';

type TrendingTutor = {
  id: string;
  name: string;
  subject?: string;
  subjects?: string[];
  classesTeach?: string[];
  country?: string;
  rating?: number;
  hourly?: number;
  img?: string;
  badges?: string[];
  demoUsed?: boolean;
};

const normItem = (raw: any): TrendingTutor | null => {
  if (!raw) return null;
  const id = String(raw.id ?? raw.tutorId ?? '').trim();
  const name = String(raw.name ?? raw.fullName ?? raw.displayName ?? '').trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    subject: raw.subject ?? raw.primarySubject ?? '',
    subjects: Array.isArray(raw.subjects) ? raw.subjects : [],
    classesTeach: Array.isArray(raw.classesTeach) ? raw.classesTeach : [],
    country: raw.country ?? '',
    rating: typeof raw.rating === 'number' ? raw.rating : Number(raw.rating ?? 0),
    hourly:
      typeof raw.hourly === 'number' ? raw.hourly :
      typeof raw.hourlyRate === 'number' ? raw.hourlyRate : 0,
    img: raw.img ?? raw.avatarUrl ?? '',
    badges: Array.isArray(raw.badges) ? raw.badges : [],
  };
};

function TrendingTutorCard({ tutor }: { tutor: TrendingTutor }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [toast, setToast] = useState<string | null>(null);
  const { currency, rates } = useDisplayCurrency();
  const r = (code: string) => rates[code] ?? 1;
  const priceInDisplay = typeof tutor.hourly === 'number' && tutor.hourly > 0
    ? Math.round((tutor.hourly * (r(currency) / Math.max(r('INR'), 1e-9)) + Number.EPSILON) * 100) / 100
    : undefined;
  const stars = Math.max(0, Math.min(5, Math.round(tutor.rating ?? 0)));

  const handleBookDemo = () => {
    if (!user) {
      navigate('/login', { state: { from: '/trending-tutors', message: 'Sign in to book a demo session' } });
      return;
    }
    if (user.role === 'TUTOR') {
      setToast('Tutor accounts cannot book demos with other tutors');
      setTimeout(() => setToast(null), 4000);
      return;
    }
    if (tutor.demoUsed) {
      navigate(`/student/cart?tutorId=${tutor.id}`);
    } else {
      navigate(`/student/demo-checkout?tutorId=${tutor.id}`);
    }
  };

  const handleMessage = () => {
    if (!user) {
      navigate('/login', { state: { from: '/trending-tutors', message: 'Sign in to message tutors' } });
      return;
    }
    if (user.role === 'TUTOR') {
      setToast('Tutor accounts cannot message other tutors');
      setTimeout(() => setToast(null), 4000);
      return;
    }
    navigate(`/student/messages?to=${tutor.id}`);
  };

  const viewProfile = () => {
    const slug = generateTutorSlug({ id: tutor.id, name: tutor.name, subjects: tutor.subjects });
    navigate(`/tutors/${slug}`);
  };

  return (
    <article
      className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md cursor-pointer h-full"
      onClick={viewProfile}
    >
      {toast && (
        <div className="absolute top-4 left-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-300 px-4 py-3 text-sm text-yellow-800 shadow-lg">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="flex-1">{toast}</span>
        </div>
      )}

      {/* Hero Image */}
      <div className="relative h-44 w-full overflow-hidden rounded-t-2xl bg-gradient-to-br from-ocean-500 to-emerald-500 flex-shrink-0">
        {tutor.img ? (
          <img
            src={tutor.img}
            alt={`${tutor.name} - ${tutor.subject || 'Tutor'}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <span className="text-4xl font-bold text-white/60">
              {tutor.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {/* Trending badge */}
        <div className="absolute left-3 top-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white shadow">
            <TrendingUp className="h-3 w-3" /> Trending
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div className="flex flex-1 flex-col p-4">
        {/* Name & Price */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-900 truncate">{tutor.name}</h3>
            {tutor.subject && (
              <p className="mt-0.5 text-sm text-slate-600">{tutor.subject}</p>
            )}
            {tutor.country && (
              <p className="mt-0.5 text-xs text-slate-500">{tutor.country}</p>
            )}
          </div>
          {typeof priceInDisplay === 'number' && priceInDisplay > 0 && (
            <div className="shrink-0 text-right">
              <span className="text-xl font-semibold text-slate-900">
                {formatCurrency(priceInDisplay, currency)}
              </span>
              <span className="text-xs text-slate-500 block">/ hour</span>
            </div>
          )}
        </div>

        {/* Rating */}
        <div className="mt-2 flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={`star-${i}`} className={`h-4 w-4 ${i < stars ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300'}`} />
          ))}
          <span className="ml-2 text-xs text-slate-600">{(tutor.rating ?? 0).toFixed(1)}</span>
        </div>

        {/* Subjects */}
        {(tutor.subjects ?? []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(tutor.subjects ?? []).slice(0, 3).map((s) => (
              <span key={s} className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Classes */}
        {(tutor.classesTeach ?? []).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(tutor.classesTeach ?? []).slice(0, 3).map((cls) => (
              <span key={cls} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                {cls}
              </span>
            ))}
          </div>
        )}

        {/* Badges */}
        {(tutor.badges ?? []).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tutor.badges!.map((b) => (
              <span key={b} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{b}</span>
            ))}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Action buttons */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleMessage(); }}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <MessageSquare className="h-4 w-4" /> Message
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleBookDemo(); }}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700"
          >
            {tutor.demoUsed ? 'Buy Tokens' : 'Book Demo'}
          </button>
        </div>
      </div>
    </article>
  );
}

function TrendingTutorCardSkeleton() {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm h-full animate-pulse">
      <div className="h-44 w-full rounded-t-2xl bg-slate-200" />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex justify-between gap-2">
          <div className="space-y-2 flex-1">
            <div className="h-5 w-32 rounded bg-slate-200" />
            <div className="h-3 w-20 rounded bg-slate-200" />
          </div>
          <div className="h-6 w-16 rounded bg-slate-200" />
        </div>
        <div className="mt-3 flex gap-1">
          <div className="h-4 w-4 rounded bg-slate-200" />
          <div className="h-4 w-4 rounded bg-slate-200" />
          <div className="h-4 w-4 rounded bg-slate-200" />
          <div className="h-4 w-4 rounded bg-slate-200" />
          <div className="h-4 w-4 rounded bg-slate-200" />
        </div>
        <div className="mt-3 flex gap-2">
          <div className="h-5 w-16 rounded-full bg-slate-200" />
          <div className="h-5 w-20 rounded-full bg-slate-200" />
        </div>
        <div className="flex-1" />
        <div className="mt-4 flex gap-2">
          <div className="h-10 flex-1 rounded-xl bg-slate-200" />
          <div className="h-10 flex-1 rounded-xl bg-slate-200" />
        </div>
      </div>
    </div>
  );
}

export default function TrendingTutors() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page') || 1);
  const pageSize = 12;
  const subject = sp.get('subject') || '';
  const classTeach = sp.get('class') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TrendingTutor[]>([]);
  const [total, setTotal] = useState(0);

  // Filter options
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);

  // Load filter options
  useEffect(() => {
    getFilterOptions().then((opts) => {
      setAvailableSubjects(opts.subjects);
      setAvailableClasses(opts.classesTeach);
    });
  }, []);

  // Fetch trending tutors
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await api.get('/tutors/trending/all', {
          params: {
            page,
            pageSize,
            ...(subject ? { subject } : {}),
            ...(classTeach ? { class: classTeach } : {}),
          },
        });

        if (!mounted) return;

        const responseData = res.data;
        let list: TrendingTutor[] = [];
        let totalCount = 0;

        if (responseData && 'items' in responseData) {
          list = (responseData.items ?? []).map(normItem).filter(Boolean) as TrendingTutor[];
          totalCount = responseData.total ?? list.length;
        } else {
          const raw = Array.isArray(responseData) ? responseData : [];
          list = raw.map(normItem).filter(Boolean) as TrendingTutor[];
          totalCount = list.length;
        }

        setItems(list);
        setTotal(totalCount);

        // Enrich with demo status (only when logged in — endpoint requires auth)
        if (user) {
          const ids = list.map((t) => t.id).filter(Boolean);
          if (ids.length) {
            const map = await getDemoStatusesForTutors(ids);
            if (mounted) {
              setItems((prev) => prev.map((t) => ({ ...t, demoUsed: !!map[t.id] })));
            }
          }
        }
      } catch {
        if (mounted) setError('Could not load trending tutors.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [page, subject, classTeach, user]);

  const setParam = (k: string, v?: string) => {
    const nxt = new URLSearchParams(sp);
    if (v && v.length) nxt.set(k, v);
    else nxt.delete(k);
    if (k !== 'page') nxt.set('page', '1');
    setSp(nxt);
  };

  const clearFilters = () => {
    setSp(new URLSearchParams());
  };

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  return (
    <main className="container-px mx-auto py-8">
      <SEO
        title="Trending Tutors | Top-Rated Online Tutors | Tunect"
        description="Discover trending tutors with 4.5+ ratings on Tunect. Filter by subject and grade to find the perfect tutor for your needs."
        url="/trending-tutors"
      />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
              <TrendingUp className="h-5 w-5 text-amber-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Trending Tutors</h1>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Top-rated tutors with 4.5+ ratings, loved by students
          </p>
        </div>
        {(subject || classTeach) && (
          <button
            onClick={clearFilters}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Filter className="h-4 w-4" />
          <span className="font-medium">Filter by:</span>
        </div>

        <select
          value={subject}
          onChange={(e) => setParam('subject', e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-300"
        >
          <option value="">All subjects</option>
          {availableSubjects.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={classTeach}
          onChange={(e) => setParam('class', e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-300"
        >
          <option value="">All grades / classes</option>
          {availableClasses.map((cls) => (
            <option key={cls} value={cls}>{cls}</option>
          ))}
        </select>
      </div>

      {/* Active filters */}
      {(subject || classTeach) && (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {subject && (
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-indigo-700">
              Subject: {subject}
            </span>
          )}
          {classTeach && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
              Grade: {classTeach}
            </span>
          )}
        </div>
      )}

      {/* Results */}
      <div className="mt-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && (
          <p className="mb-4 text-sm font-semibold text-slate-700">
            {total > 0 ? `${total} trending ${total === 1 ? 'tutor' : 'tutors'}` : 'No trending tutors found'}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {loading
            ? Array.from({ length: pageSize }).map((_, i) => (
                <TrendingTutorCardSkeleton key={`skel-${i}`} />
              ))
            : items.map((t) => (
                <TrendingTutorCard key={t.id} tutor={t} />
              ))}
        </div>

        {!loading && items.length === 0 && !error && (
          <div className="text-center py-16">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
              <TrendingUp className="h-8 w-8 text-amber-400" />
            </div>
            {(subject || classTeach) ? (
              <>
                <h3 className="text-lg font-bold text-slate-800">No trending tutors match your filters</h3>
                <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
                  Try broadening your search or clearing filters to see all trending tutors.
                </p>
                <button
                  onClick={clearFilters}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-slate-800">Trending tutors are coming soon</h3>
                <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
                  Our trending section highlights tutors with outstanding ratings, loved by students. Meanwhile, explore all verified tutors available right now.
                </p>
                <Link
                  to="/find-tutors"
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-ocean-700 transition"
                >
                  Browse all tutors
                </Link>
              </>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setParam('page', String(page - 1))}
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {page} of {totalPages}
            </span>
            <button
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium disabled:opacity-50"
              disabled={page >= totalPages}
              onClick={() => setParam('page', String(page + 1))}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
