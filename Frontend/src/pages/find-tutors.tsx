// src/pages/find-tutors.tsx
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SEO from '../components/SEO';
import TutorCard from '../components/TutorCard';
import { TutorCardSkeleton } from '../components/skeletons';
import { searchTutors, listTutors, getFilterOptions } from '../services/tutorService';
import type { Tutor, TutorSearchHistoryEntry } from '../services/tutorService';
import { useDisplayCurrency } from '../hooks/useDisplayCurrency';
import { getDemoStatusesForTutors, getDemoStatusForTutor } from '../services/bookingsService';
import { useAuth } from '../contexts/AuthContext';

// simple debounce hook
function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// extend Tutor with our UI-only flag
type TutorWithDemo = Tutor & { demoUsed?: boolean };

const SEARCH_HISTORY_KEY = 'tn_find_tutors_recent_searches';
const SEARCH_HISTORY_LIMIT = 10;

function readSearchHistory(): TutorSearchHistoryEntry[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSearchHistory(entry: TutorSearchHistoryEntry) {
  try {
    const existing = readSearchHistory();
    const normalized = {
      term: entry.term?.trim() || undefined,
      subject: entry.subject?.trim() || undefined,
      classTeach: entry.classTeach?.trim() || undefined,
      board: entry.board?.trim() || undefined,
      language: entry.language?.trim() || undefined,
      ts: entry.ts ?? Date.now(),
    };

    const isEmpty = !normalized.term && !normalized.subject && !normalized.classTeach && !normalized.board && !normalized.language;
    if (isEmpty) return;

    const last = existing[0];
    const isDuplicate =
      last &&
      last.term === normalized.term &&
      last.subject === normalized.subject &&
      last.classTeach === normalized.classTeach &&
      last.board === normalized.board &&
      last.language === normalized.language;

    const next = isDuplicate ? existing : [normalized, ...existing];
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next.slice(0, SEARCH_HISTORY_LIMIT)));
  } catch {
    // ignore storage errors
  }
}

export default function FindTutors() {
  const [sp, setSp] = useSearchParams();
  const { currency: displayCurrency, rates } = useDisplayCurrency();
  const { user } = useAuth();
  const isLoggedIn = !!user;

  const page = Number(sp.get('page') || 1);
  const pageSize = Number(sp.get('pageSize') || 12);
  const qRaw = sp.get('q') || '';
  const subject = sp.get('subject') || '';
  const classTeach = sp.get('class') || '';
  const board = sp.get('board') || '';
  const language = sp.get('language') || '';
  const sort = (sp.get('sort') || 'rating_desc') as 'rating_desc' | 'price_asc' | 'price_desc';
  const minRating = Number(sp.get('minRating') || 0);

  // controlled price inputs (in display currency)
  const [priceMinStr, setPriceMinStr] = useState(sp.get('priceMin') ?? '');
  const [priceMaxStr, setPriceMaxStr] = useState(sp.get('priceMax') ?? '');
  const priceMinDisplay = priceMinStr !== '' ? Number(priceMinStr) : undefined;
  const priceMaxDisplay = priceMaxStr !== '' ? Number(priceMaxStr) : undefined;

  const r = (code: string) => rates[code] ?? 1; // USD->code
  const toInr = (amt?: number) =>
    amt == null
      ? undefined
      : Math.round((amt * (Math.max(r('INR'), 1e-9) / Math.max(r(displayCurrency), 1e-9))) * 100) /
        100;
  const priceMin = toInr(priceMinDisplay);
  const priceMax = toInr(priceMaxDisplay);

  // debounce only the text query
  const q = useDebounced(qRaw.trim(), 350);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<TutorWithDemo[]>([]);
  const [total, setTotal] = useState(0);
  
  // Dynamic filter options
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);
  const [availableClassesTeach, setAvailableClassesTeach] = useState<string[]>([]);
  const [availableBoards, setAvailableBoards] = useState<string[]>([]);
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [availableRatingOptions, setAvailableRatingOptions] = useState<Array<{ value: number; label: string }>>([
    { value: 0, label: 'Any rating' },
    { value: 3, label: '3.0+' },
    { value: 4, label: '4.0+' },
    { value: 4.5, label: '4.5+' },
  ]);

  // Load filter options on mount
  useEffect(() => {
    getFilterOptions().then((options) => {
      setAvailableSubjects(options.subjects);
      setAvailableClassesTeach(options.classesTeach);
      setAvailableBoards(options.boards || []);
      setAvailableLanguages(options.languages);
      setAvailableRatingOptions(options.ratingOptions);
    });
  }, []);

  // Check if we should use search API (use debounced q for this check)
  const shouldUseSearch = useMemo(() => 
    q.length > 0 ||
    !!subject ||
    !!classTeach ||
    !!board ||
    !!language ||
    !!minRating ||
    priceMin !== undefined ||
    priceMax !== undefined ||
    sort !== 'rating_desc',
    [q, subject, classTeach, board, language, minRating, priceMin, priceMax, sort]
  );

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // 1) fetch tutors - use search API if there are any filters, otherwise use list API
        const res = shouldUseSearch
          ? await searchTutors({ q, subject, classTeach, board, language, minRating, priceMin, priceMax, sort, page, pageSize })
          : await listTutors({ page, pageSize, subject: subject || undefined, classTeach: classTeach || undefined, board: board || undefined, language: language || undefined });

        if (!mounted) return;

        // Use backend results directly - backend handles all filtering and pagination
        // Store backend total for pagination BEFORE any client-side modifications
        const backendTotal = res.total ?? 0;
        let list: TutorWithDemo[] = (res.items ?? []) as TutorWithDemo[];

        // Note: Backend already handles filtering (subject, language, classTeach, price, etc.)
        // Client-side filtering after pagination breaks pagination, so we trust the backend
        
        // Only apply client-side sorting if backend doesn't handle it
        // (Backend should handle sorting, but keeping this as fallback)
        if (sort === 'price_asc') list = [...list].sort((a, b) => (a.hourlyRate ?? 0) - (b.hourlyRate ?? 0));
        if (sort === 'price_desc') list = [...list].sort((a, b) => (b.hourlyRate ?? 0) - (a.hourlyRate ?? 0));
        if (sort === 'rating_desc') list = [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

        // 3) render immediately without demo flags (avoids flicker)
        setItems(list);
        // Use backend total for pagination (not filtered count)
        setTotal(backendTotal);

        // 4) fetch demo-used statuses in parallel and merge into items
        // Only fetch demo statuses if user is logged in (requires auth)
        const ids = list.map((t) => t.id).filter(Boolean);
        if (ids.length && isLoggedIn) {
          const map = await getDemoStatusesForTutors(ids);
          if (!mounted) return;

          setItems((prev) => prev.map((t) => ({ ...t, demoUsed: !!map[t.id] })));
        }
      } catch {
        if (mounted) setErr('Could not load tutors.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
    // Depend on debounced q and shouldUseSearch (which includes q in its calculation)
  }, [q, subject, classTeach, board, language, minRating, priceMin, priceMax, sort, page, pageSize, shouldUseSearch, isLoggedIn]);

  // Track recent searches and filters for recommendations
  useEffect(() => {
    writeSearchHistory({
      term: q || undefined,
      subject: subject || undefined,
      classTeach: classTeach || undefined,
      board: board || undefined,
      language: language || undefined,
      ts: Date.now(),
    });
  }, [q, subject, classTeach, board, language]);

  // Listen for demo status changes and refresh (only when logged in)
  useEffect(() => {
    if (!isLoggedIn) return;

    const handleDemoStatusChange = async (event: CustomEvent) => {
      const tutorId = event.detail?.tutorId;
      if (!tutorId) return;
      
      // Refresh demo status for the specific tutor
      try {
        const used = await getDemoStatusForTutor(tutorId);
        setItems((prev) => prev.map((t) => 
          t.id === tutorId ? { ...t, demoUsed: used } : t
        ));
      } catch (e) {
        console.error('Failed to refresh demo status:', e);
      }
    };

    window.addEventListener('demo-status-changed', handleDemoStatusChange as unknown as EventListener);
    return () => {
      window.removeEventListener('demo-status-changed', handleDemoStatusChange as unknown as EventListener);
    };
  }, [isLoggedIn]);

  const setParam = (k: string, v?: string) => {
    const nxt = new URLSearchParams(sp);
    if (v && v.length) nxt.set(k, v);
    else nxt.delete(k);
    if (k !== 'page') nxt.set('page', '1');
    setSp(nxt);
  };

  const clearFilters = () => {
    setPriceMinStr('');
    setPriceMaxStr('');
    setSp(new URLSearchParams());
  };

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  // Dynamic SEO based on search params
  const seoTitle = useMemo(() => {
    if (subject) {
      return `Best ${subject} Tutors Online in India | Free Demo | Tunect`;
    }
    if (q) {
      return `Find ${q} Tutors Online in India | Free Demo | Tunect`;
    }
    return 'Find Online Tutors in India | 1-on-1 Tutoring | Free Demo | Tunect';
  }, [subject, q]);

  const seoDescription = useMemo(() => {
    if (subject) {
      return `Find expert ${subject} tutors for 1-on-1 online tutoring in India. Book your first session free! Verified tutors, personalized learning, flexible scheduling.`;
    }
    if (q) {
      return `Search for ${q} tutors online. Book 1-on-1 sessions with verified tutors in India. First session free!`;
    }
    return 'Search and find verified online tutors in India. Book 1-on-1 personalized tutoring sessions. First session is free! Learn Mathematics, Physics, Chemistry, English, and more.';
  }, [subject, q]);

  return (
    <main className="container-px mx-auto py-8">
      <SEO
        title={seoTitle}
        description={seoDescription}
        url={`/find-tutors${sp.toString() ? `?${sp.toString()}` : ''}`}
      />
      <h1 className="text-2xl font-bold">Find Tutors</h1>

      {/* Filters */}
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_180px_180px_180px_160px_160px]">
        <input
          value={qRaw}
          onChange={(e) => setParam('q', e.target.value)}
          placeholder="Search subject, topic, or tutor name"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-300"
        />

        <select
          value={subject}
          onChange={(e) => setParam('subject', e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All subjects</option>
          {availableSubjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={classTeach}
          onChange={(e) => setParam('class', e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All classes</option>
          {availableClassesTeach.map((cls) => (
            <option key={cls} value={cls}>
              {cls}
            </option>
          ))}
        </select>

        <select
          value={board}
          onChange={(e) => setParam('board', e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All boards</option>
          {availableBoards.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        <select
          value={language}
          onChange={(e) => setParam('language', e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All languages</option>
          {availableLanguages.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>

        <select
          value={String(minRating)}
          onChange={(e) => setParam('minRating', e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          {availableRatingOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* sort: rating + price */}
        <select
          value={sort}
          onChange={(e) => setParam('sort', e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="rating_desc">Top rated</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
        </select>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-slate-500">
          Tip: pick a subject from the dropdown or type one above.
        </div>
        <button
          onClick={clearFilters}
          className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear filters
        </button>
      </div>

      {/* Price range in your display currency (converted to INR internally) */}
      <div className="mt-3 flex flex-wrap gap-3">
        <input
          type="number"
          placeholder={`Min ${displayCurrency} / hr`}
          value={priceMinStr}
          onChange={(e) => setPriceMinStr(e.target.value)}
          onBlur={(e) => setParam('priceMin', e.currentTarget.value)}
          className="w-40 rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="number"
          placeholder={`Max ${displayCurrency} / hr`}
          value={priceMaxStr}
          onChange={(e) => setPriceMaxStr(e.target.value)}
          onBlur={(e) => setParam('priceMax', e.currentTarget.value)}
          className="w-40 rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {/* Results */}
      <div className="mt-6">
        {err && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}

        {/* Search Results Header */}
        {!loading && (
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold text-slate-700">
              {total > 0 ? (
                <>Found {total} {total === 1 ? 'tutor' : 'tutors'}</>
              ) : (
                <>No tutors found</>
              )}
            </span>
            {(q || subject || classTeach || board || language) && (
              <div className="flex flex-wrap gap-2">
                {q && (
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700">
                    Search: "{q}"
                  </span>
                )}
                {subject && (
                  <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">
                    Subject: {subject}
                  </span>
                )}
                {classTeach && (
                  <span className="rounded-full bg-purple-100 px-3 py-1 text-purple-700">
                    Class: {classTeach}
                  </span>
                )}
                {board && (
                  <span className="rounded-full bg-cyan-100 px-3 py-1 text-cyan-700">
                    Board: {board}
                  </span>
                )}
                {language && (
                  <span className="rounded-full bg-orange-100 px-3 py-1 text-orange-700">
                    Language: {language}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {loading
            ? Array.from({ length: Math.min(pageSize, 12) }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <TutorCardSkeleton />
                </div>
              ))
            : items.length > 0
            ? items.map((t) => (
                <div key={t.id}>
                  <TutorCard tutor={t} searchSubject={subject || undefined} />
                </div>
              ))
            : (
              <div className="col-span-full text-center py-8">
                <div className="text-sm text-slate-600 mb-2">No tutors found.</div>
                {(q || subject || classTeach || language) && (
                  <div className="text-xs text-slate-500">
                    Try adjusting your search filters or clearing them to see more results.
                  </div>
                )}
              </div>
            )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setParam('page', String(page - 1))}
            >
              Prev
            </button>
            <span className="text-sm text-slate-600">
              Page {page} of {totalPages}
            </span>
            <button
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm disabled:opacity-50"
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
