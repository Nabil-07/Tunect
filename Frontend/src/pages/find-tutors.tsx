// src/pages/find-tutors.tsx
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import TutorCard from '../components/TutorCard';
import { searchTutors, listTutors, getFilterOptions } from '../services/tutorService';
import type { Tutor } from '../services/tutorService';
import { useDisplayCurrency } from '../hooks/useDisplayCurrency';
import { getDemoStatusesForTutors } from '../services/bookingsService';

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

export default function FindTutors() {
  const [sp, setSp] = useSearchParams();
  const { currency: displayCurrency, rates } = useDisplayCurrency();

  const page = Number(sp.get('page') || 1);
  const pageSize = Number(sp.get('pageSize') || 12);
  const qRaw = sp.get('q') || '';
  const subject = sp.get('subject') || '';
  const classTeach = sp.get('class') || '';
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
      setAvailableLanguages(options.languages);
      setAvailableRatingOptions(options.ratingOptions);
    });
  }, []);

  const hasFilters =
    q.length > 0 ||
    !!subject ||
    !!classTeach ||
    !!language ||
    !!minRating ||
    priceMin !== undefined ||
    priceMax !== undefined ||
    sort !== 'rating_desc';

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // 1) fetch tutors
        const res = hasFilters
          ? await searchTutors({ q, subject, classTeach, language, minRating, priceMin, priceMax, page, pageSize })
          : await listTutors({ page, pageSize, subject: subject || undefined, classTeach: classTeach || undefined, language: language || undefined });

        if (!mounted) return;

        let list: TutorWithDemo[] = (res.items ?? []) as TutorWithDemo[];

        // 2) Client-side filtering for additional safety (ensures proper segregation)
        // This is CRITICAL - filters out any tutors that don't match the selected criteria
        
        // Subject filter - STRICT: ensure tutor actually teaches the selected subject
        if (subject && subject.trim()) {
          const subjectLower = subject.trim().toLowerCase();
          const beforeFilter = list.length;
          list = list.filter((t) => {
            const tutorSubjects = (t.subjects || []).map((s: string) => s.toLowerCase());
            const matches = tutorSubjects.includes(subjectLower);
            if (!matches && tutorSubjects.length > 0) {
              console.warn(
                `[find-tutors] Filtered out tutor ${t.id} (${t.name}) - ` +
                `selected subject: "${subject}", tutor subjects: [${tutorSubjects.join(', ')}]`
              );
            }
            return matches;
          });
          console.log(
            `[find-tutors] Subject filter "${subject}": ${beforeFilter} → ${list.length} tutors ` +
            `(${beforeFilter - list.length} filtered out)`
          );
        }

        // Language filter - ensure tutor teaches the selected language
        if (language && language.trim()) {
          const langLower = language.trim().toLowerCase();
          list = list.filter((t) => {
            const tutorLanguages = (t.languages || []).map((l: string) => l.toLowerCase());
            return tutorLanguages.includes(langLower);
          });
        }

        // Class filter - ensure tutor teaches the selected class
        if (classTeach && classTeach.trim()) {
          const classLower = classTeach.trim().toLowerCase();
          list = list.filter((t) => {
            const tutorClasses = (t.classesTeach || []).map((c: string) => c.toLowerCase());
            return tutorClasses.includes(classLower);
          });
        }

        // Price filters
        if (priceMin != null) list = list.filter((t) => (t.hourlyRate ?? 0) >= priceMin);
        if (priceMax != null) list = list.filter((t) => (t.hourlyRate ?? 0) <= priceMax);
        
        // Sorting
        if (sort === 'price_asc') list = [...list].sort((a, b) => (a.hourlyRate ?? 0) - (b.hourlyRate ?? 0));
        if (sort === 'price_desc') list = [...list].sort((a, b) => (b.hourlyRate ?? 0) - (a.hourlyRate ?? 0));
        if (sort === 'rating_desc') list = [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

        // 3) render immediately without demo flags (avoids flicker)
        // Update total to reflect filtered count
        setItems(list);
        setTotal(list.length); // Use filtered count, not backend total

        // 4) fetch demo-used statuses in parallel and merge into items
        const ids = list.map((t) => t.id).filter(Boolean);
        if (ids.length) {
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
    // include qRaw so the debounce updates
  }, [q, qRaw, subject, classTeach, language, minRating, priceMin, priceMax, sort, page, pageSize, hasFilters]);

  const setParam = (k: string, v?: string) => {
    const nxt = new URLSearchParams(sp);
    if (v && v.length) nxt.set(k, v);
    else nxt.delete(k);
    if (k !== 'page') nxt.set('page', '1');
    setSp(nxt);
  };

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  return (
    <main className="container-px mx-auto py-8">
      <h1 className="text-2xl font-bold">Find Tutors</h1>

      {/* Filters */}
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_200px_200px_200px_160px_160px]">
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

        {/* Search Results Header with Segregation Info */}
        {!loading && items.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold text-slate-700">
              Found {total} {total === 1 ? 'tutor' : 'tutors'}
            </span>
            {(q || subject || classTeach || language) && (
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
            ? Array.from({ length: pageSize }).map((_, i) => <div key={i} className="card h-28 animate-pulse" />)
            : items.length > 0
            ? items.map((t) => (
                <div key={t.id} className="space-y-2">
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
