// src/pages/find-tutors.tsx
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import TutorCard from '../components/TutorCard';
import { searchTutors, listTutors } from '../services/tutorService';
import type { Tutor } from '../services/tutorService';
import { SUBJECT_OPTIONS } from '../constants/subjects';
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

  const hasFilters =
    q.length > 0 ||
    !!subject ||
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
          ? await searchTutors({ q, subject, minRating, priceMin, priceMax, sort, page, pageSize })
          : await listTutors({ page, pageSize, subject: subject || undefined });

        if (!mounted) return;

        let list: TutorWithDemo[] = (res.items ?? []) as TutorWithDemo[];

        // 2) client-side fallbacks
        if (priceMin != null) list = list.filter((t) => (t.hourlyRate ?? 0) >= priceMin);
        if (priceMax != null) list = list.filter((t) => (t.hourlyRate ?? 0) <= priceMax);
        if (sort === 'price_asc') list = [...list].sort((a, b) => (a.hourlyRate ?? 0) - (b.hourlyRate ?? 0));
        if (sort === 'price_desc') list = [...list].sort((a, b) => (b.hourlyRate ?? 0) - (a.hourlyRate ?? 0));
        if (sort === 'rating_desc') list = [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

        // 3) render immediately without demo flags (avoids flicker)
        setItems(list);
        setTotal(res.total ?? list.length);

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
  }, [q, qRaw, subject, minRating, priceMin, priceMax, sort, page, pageSize, hasFilters]);

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
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_200px_160px_160px]">
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
          {SUBJECT_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={String(minRating)}
          onChange={(e) => setParam('minRating', e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="0">Any rating</option>
          <option value="3">3.0+</option>
          <option value="4">4.0+</option>
          <option value="4.5">4.5+</option>
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {loading
            ? Array.from({ length: pageSize }).map((_, i) => <div key={i} className="card h-28 animate-pulse" />)
            : items.length > 0
            ? items.map((t) => (
                <div key={t.id} className="space-y-2">
                  <TutorCard tutor={t} />
                </div>
              ))
            : <div className="text-sm text-slate-600">No tutors found.</div>}
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
