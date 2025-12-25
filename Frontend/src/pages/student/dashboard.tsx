// src/pages/student/dashboard.tsx
import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  BadgeIndianRupee,
  MessageSquareMore,
  Plus,
  Star,
  BookOpen,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Heart,
  TrendingUp,
  Target,
  FileText,
  Award,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getRecommendedTutors } from '../../services/tutorService';
import { getMe, getNextBooking } from '../../services/studentService';
import { getUnreadCount } from '../../services/messagesService';
import { getDemoStatusesForTutors } from '../../services/bookingsService';
import { formatPriceFromINR } from '../../utils/currency';
import { PriceDisplay } from '../../components/PriceDisplay';
import api from '../../lib/apiClient';

type SubjectStat = { name: string; progress: number }; // 0..100

export default function StudentDashboard() {
  const { user, loading: authLoading, isAuthenticated } = useAuth() as any;
  const nav = useNavigate();

  const [tokens, setTokens] = useState<number | null>(null);
  const [next, setNext] = useState<any | null>(null);
  const [unread, setUnread] = useState<number>(0);
  const [reco, setReco] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenBalances, setTokenBalances] = useState<Map<string, number>>(new Map());

  // Snapshot stats (no streak)
  const [hoursStudied, setHoursStudied] = useState<number | null>(null);
  const [sessionsCompleted, setSessionsCompleted] = useState<number | null>(null);
  const [subjectStats, setSubjectStats] = useState<SubjectStat[]>([]);
  const [showSubjects, setShowSubjects] = useState(false);

  const dtf = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    []
  );

  useEffect(() => {
    if (authLoading || isAuthenticated === false) {
      setFetching(authLoading);
      return;
    }

    let alive = true;
    (async () => {
      setFetching(true);
      setError(null);
      try {
        const [meRes, nextRes, unreadRes, recoRes, balancesRes] = await Promise.all([
          getMe().catch(() => null),
          getNextBooking().catch(() => null),
          getUnreadCount().catch(() => ({ count: 0 })),
          getRecommendedTutors(6).catch(() => []),
          api.get('/students/me/token-balances').catch(() => ({ data: [] })),
        ]);
        if (!alive) return;

        // Calculate total tokens from all tutor balances
        const balances = Array.isArray(balancesRes.data) ? balancesRes.data : [];
        const totalTokens = balances.reduce((sum: number, b: any) => sum + Number(b.balance || 0), 0);
        
        // Build token balance map for tutor cards
        const balanceMap = new Map<string, number>();
        balances.forEach((b: any) => {
          if (b.tutorId) {
            balanceMap.set(b.tutorId, Number(b.balance || 0));
          }
        });
        setTokenBalances(balanceMap);

        setTokens(totalTokens);
        setNext(nextRes ?? null);
        setUnread(typeof unreadRes === 'number' ? unreadRes : unreadRes?.count ?? 0);

        // First show the list quickly…
        const baseReco = Array.isArray(recoRes) ? recoRes : [];
        setReco(baseReco);

        // …then fetch demo-used flags and merge them in
        try {
          const ids = baseReco.map((t: any) => t.id).filter(Boolean);
          if (ids.length) {
            const map = await getDemoStatusesForTutors(ids);
            if (!alive) return;
            setReco(baseReco.map((t: any) => ({ ...t, demoUsed: !!map[t.id] })));
          }
        } catch {
          /* ignore — keep baseReco */
        }

        // snapshot (optional)
        setHoursStudied(
          typeof meRes?.student?.hoursStudied === 'number' ? meRes.student.hoursStudied : null
        );
        setSessionsCompleted(
          typeof meRes?.student?.sessionsCompleted === 'number'
            ? meRes.student.sessionsCompleted
            : null
        );

        // subject progress (collapsed if empty)
        const subjects: SubjectStat[] =
          Array.isArray(meRes?.student?.subjectProgress)
            ? meRes.student.subjectProgress
                .map((s: any) => ({
                  name: String(s?.name ?? 'Subject'),
                  progress: clampPercent(s?.progress),
                }))
                .slice(0, 6)
            : [];
        setSubjectStats(subjects);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.response?.data?.message || e?.message || 'Failed to load dashboard');
      } finally {
        if (alive) setFetching(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [authLoading, isAuthenticated]);

  // next session helpers
  const nextStartISO =
    next?.startLocal?.iso ||
    next?.startLocal ||
    next?.startTime ||
    next?.startAt ||
    next?.start;

  const nextStartText = nextStartISO ? dtf.format(new Date(nextStartISO)) : null;
  const tutorName = next?.tutor?.user?.name || next?.tutor?.name || next?.tutorName || 'Tutor';
  const tutorSubject =
    next?.tutor?.subjects?.[0]?.name || next?.tutor?.subject || next?.subject || '—';

  if (authLoading || fetching) {
    return (
      <div className="container mx-auto px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-extrabold">Loading your dashboard…</h1>
          <p className="text-slate-600">Fetching profile, bookings, and messages.</p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl border p-4 shadow-sm animate-pulse bg-slate-50" />
          ))}
        </div>
      </div>
    );
  }

  if (isAuthenticated === false) return null;

  if (error) {
    return (
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-2xl font-extrabold">Student Dashboard</h1>
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  const hours = hoursStudied ?? 0;
  const sessions = sessionsCompleted ?? 0;
  const hasSubjects = subjectStats.length > 0;

  return (
    <div className="container mx-auto px-4 py-6 space-y-10">
      {/* Hero */}
      <div className="rounded-3xl bg-gradient-to-r from-ocean-700 to-green-500 p-8 text-white shadow-md">
        <h1 className="text-3xl font-bold">
          Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}! 👋
        </h1>
        <p className="mt-2 text-lg text-white/90">Let’s continue your learning journey today.</p>
      </div>

      {/* Learning snapshot */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SnapshotCard
          title="Hours Studied"
          value={`${hours}h`}
          icon={<Clock className="h-6 w-6 text-sky-600" />}
          sub="This month"
          ringPercent={toBoundedPercent((hours / 20) * 100)}
        />
        <SnapshotCard
          title="Sessions Completed"
          value={sessions}
          icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />}
          sub="All time"
        />
      </section>

      {/* Optional subject progress */}
      {hasSubjects && (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <button
            onClick={() => setShowSubjects((v) => !v)}
            className="w-full flex items-center justify-between"
          >
            <span className="text-base font-semibold text-slate-800">Subject progress</span>
            {showSubjects ? <ChevronUp /> : <ChevronDown />}
          </button>

          {showSubjects && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {subjectStats.map((s) => (
                <div key={s.name} className="rounded-xl border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">{s.name}</span>
                    <span className="text-xs text-slate-500">{s.progress}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-ocean-600 rounded-full transition-all"
                      style={{ width: `${clampPercent(s.progress)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Quick stats */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Token Balance"
          value={tokens ?? '—'}
          icon={<BadgeIndianRupee className="h-6 w-6 text-ocean-600" />}
          action={
            <div className="mt-2 flex gap-3">
              <Link
                to="/student/token-balance"
                className="text-sm font-medium text-ocean-700 hover:underline"
              >
                View Details
              </Link>
              <button
                className="text-sm font-medium text-ocean-700 hover:underline inline-flex items-center gap-1"
                onClick={() => nav('/student/cart')}
              >
                <Plus className="h-4 w-4" /> Buy Tokens
              </button>
            </div>
          }
        />
        <StatCard
          title="Next Session"
          value={nextStartText ?? 'No upcoming sessions'}
          icon={<CalendarClock className="h-6 w-6 text-green-600" />}
          action={
            nextStartText && (
              <Link to="/student/bookings" className="mt-2 text-sm text-ocean-700 hover:underline">
                View all bookings
              </Link>
            )
          }
        />
        <StatCard
          title="Messages"
          value={`${unread} unread`}
          icon={<MessageSquareMore className="h-6 w-6 text-amber-600" />}
          action={
            <Link to="/student/chat" className="mt-2 text-sm text-ocean-700 hover:underline">
              Go to chat
            </Link>
          }
        />
        <StatCard
          title="My Favorites"
          value="View all"
          icon={<Heart className="h-6 w-6 text-rose-600" />}
          action={
            <Link to="/student/favorites" className="mt-2 text-sm text-ocean-700 hover:underline">
              Manage favorites
            </Link>
          }
        />
      </section>

      {/* Phase 2 Features - Learning Tools */}
      <section>
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-ocean-700" /> Your Learning Tools
        </h2>
        <div className="grid md:grid-cols-4 gap-6">
          <Link
            to="/student/progress"
            className="rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition group"
          >
            <div className="flex items-center justify-between mb-3">
              <TrendingUp className="h-8 w-8 text-ocean-600 group-hover:scale-110 transition" />
              <span className="text-2xl">📊</span>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Progress Tracking</h3>
            <p className="text-sm text-slate-600">View hours, levels, and achievements</p>
          </Link>

          <Link
            to="/student/goals"
            className="rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition group"
          >
            <div className="flex items-center justify-between mb-3">
              <Target className="h-8 w-8 text-purple-600 group-hover:scale-110 transition" />
              <span className="text-2xl">🎯</span>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Learning Goals</h3>
            <p className="text-sm text-slate-600">Set and track your objectives</p>
          </Link>

          <Link
            to="/student/session-notes"
            className="rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition group"
          >
            <div className="flex items-center justify-between mb-3">
              <FileText className="h-8 w-8 text-green-600 group-hover:scale-110 transition" />
              <span className="text-2xl">📝</span>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Session Notes</h3>
            <p className="text-sm text-slate-600">Review tutor notes and homework</p>
          </Link>

          <Link
            to="/student/certificates"
            className="rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition group"
          >
            <div className="flex items-center justify-between mb-3">
              <Award className="h-8 w-8 text-amber-600 group-hover:scale-110 transition" />
              <span className="text-2xl">🏆</span>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Certificates</h3>
            <p className="text-sm text-slate-600">View earned achievements</p>
          </Link>

          <Link
            to="/student/group-sessions"
            className="rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition group"
          >
            <div className="flex items-center justify-between mb-3">
              <BookOpen className="h-8 w-8 text-blue-600 group-hover:scale-110 transition" />
              <span className="text-2xl">👥</span>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Group Sessions</h3>
            <p className="text-sm text-slate-600">Join group learning sessions</p>
          </Link>

          <Link
            to="/student/waitlist"
            className="rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition group"
          >
            <div className="flex items-center justify-between mb-3">
              <Clock className="h-8 w-8 text-indigo-600 group-hover:scale-110 transition" />
              <span className="text-2xl">⏰</span>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">My Waitlist</h3>
            <p className="text-sm text-slate-600">Track your tutor waitlist</p>
          </Link>
        </div>
      </section>

      {/* Recommended tutors */}
      <section>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-ocean-700" /> Recommended for you
          </h2>
          <Link to="/find-tutors" className="text-sm text-ocean-700 hover:underline">
            See all
          </Link>
        </div>

        {reco.length === 0 ? (
          <div className="text-slate-600">No recommendations yet. Browse tutors to get started.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {reco.map((t) => {
              const alreadyUsed = !!t.demoUsed;
              const tutorTokenBalance = tokenBalances.get(t.id);
              const hasTokens = tutorTokenBalance !== undefined && tutorTokenBalance > 0;
              const btnLabel = alreadyUsed 
                ? (hasTokens ? 'Use Tokens' : 'Buy Tokens')
                : 'Book Demo';
              const href = alreadyUsed
                ? (hasTokens ? '/student/bookings' : `/student/cart?tutorId=${t.id}`)
                : `/student/demo-checkout?tutorId=${t.id}`;
              return (
                <div
                  key={t.id}
                  className="rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition"
                >
                  <div className="flex items-center gap-4">
                    <img
                      src={
                        t.avatarUrl ||
                        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                          t.name || 'T'
                        )}`
                      }
                      className="h-14 w-14 rounded-full border"
                      alt={t.name || 'Tutor'}
                    />
                    <div>
                      <div className="font-semibold text-slate-800">{t.name || 'Tutor'}</div>
                      <div className="text-xs text-slate-500">{t.subject || 'Subject'}</div>
                      <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                        <Star className="h-3 w-3" /> {t.rating ?? '—'}
                      </div>
                    </div>
                  </div>
                  
                  {/* Token Balance Display */}
                  {alreadyUsed && hasTokens && (
                    <div className="mt-3 p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                      <div className="flex items-center gap-1 text-xs text-emerald-700">
                        <BadgeIndianRupee className="h-3 w-3" />
                        <span className="font-medium">{tutorTokenBalance.toFixed(1)} tokens</span>
                        {tutorTokenBalance <= 1 && (
                          <span className="ml-1 text-amber-600">Low!</span>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-sm font-medium">
                      <PriceDisplay amountInINR={t.hourlyRate ?? 0} />/hr
                    </div>
                    <button
                      onClick={() => nav(href)}
                      className="rounded-xl bg-ocean-700 px-4 py-2 text-xs font-medium text-white hover:bg-ocean-800"
                    >
                      {btnLabel}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------- reusable cards ---------- */
function StatCard({
  title,
  value,
  icon,
  action,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{title}</span>
        {icon}
      </div>
      <div className="mt-3 text-2xl font-bold text-slate-800">{value}</div>
      {action}
    </div>
  );
}

function SnapshotCard({
  title,
  value,
  icon,
  sub,
  ringPercent,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  sub?: string;
  ringPercent?: number; // 0..100
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-slate-600">{title}</span>
        </div>
        {typeof ringPercent === 'number' && (
          <ProgressRing percent={toBoundedPercent(ringPercent)} size={42} stroke={6} />
        )}
      </div>
      <div className="mt-3 text-2xl font-bold text-slate-800">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

/* ---------- tiny SVG ring ---------- */
function ProgressRing({
  percent,
  size = 40,
  stroke = 4,
}: {
  percent: number; // 0..100
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (percent / 100) * c;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#e5e7eb" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="currentColor"
        className="text-ocean-600"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        fill="none"
      />
    </svg>
  );
}

/* ---------- utils ---------- */
function clampPercent(v: any): number {
  const n = Number.isFinite(v) ? Number(v) : 0;
  return Math.max(0, Math.min(100, n));
}
function toBoundedPercent(v: any): number {
  if (!Number.isFinite(v)) return 0;
  return clampPercent(v);
}
