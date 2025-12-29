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

  // ✅ Separate loading states for each section
  const [tokens, setTokens] = useState<number | null>(null);
  const [loadingTokens, setLoadingTokens] = useState(true);
  
  const [next, setNext] = useState<any | null>(null);
  const [loadingNext, setLoadingNext] = useState(true);
  
  const [unread, setUnread] = useState<number>(0);
  const [loadingUnread, setLoadingUnread] = useState(true);
  
  const [reco, setReco] = useState<any[]>([]);
  const [loadingReco, setLoadingReco] = useState(true);
  
  const [tokenBalances, setTokenBalances] = useState<Map<string, number>>(new Map());

  // Snapshot stats (no streak)
  const [hoursStudied, setHoursStudied] = useState<number | null>(null);
  const [sessionsCompleted, setSessionsCompleted] = useState<number | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  
  const [subjectStats, setSubjectStats] = useState<SubjectStat[]>([]);
  const [showSubjects, setShowSubjects] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const dtf = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    []
  );

  useEffect(() => {
    if (authLoading || isAuthenticated === false) return;

    // Ensure only students can access this dashboard
    const userRole = user?.role?.toUpperCase();
    if (userRole && userRole !== 'STUDENT') {
      console.log('Non-student accessing student dashboard, skipping student API calls');
      setLoadingTokens(false);
      setLoadingNext(false);
      setLoadingUnread(false);
      setLoadingReco(false);
      setLoadingStats(false);
      return;
    }

    // ✅ Load each API independently - UI renders as data arrives!
    
    // Load token balances
    (async () => {
      try {
        const balancesRes = await api.get('/students/me/token-balances');
        const balances = Array.isArray(balancesRes.data) ? balancesRes.data : [];
        const totalTokens = balances.reduce((sum: number, b: any) => sum + Number(b.balance || 0), 0);
        
        const balanceMap = new Map<string, number>();
        balances.forEach((b: any) => {
          if (b.tutorId) {
            balanceMap.set(b.tutorId, Number(b.balance || 0));
          }
        });
        setTokenBalances(balanceMap);
        setTokens(totalTokens);
      } catch (e) {
        console.error('Failed to load token balances:', e);
        setTokens(0);
      } finally {
        setLoadingTokens(false);
      }
    })();

    // Load next booking
    (async () => {
      try {
        const nextRes = await getNextBooking();
        setNext(nextRes ?? null);
      } catch (e) {
        console.error('Failed to load next booking:', e);
        setNext(null);
      } finally {
        setLoadingNext(false);
      }
    })();

    // Load unread messages
    (async () => {
      try {
        const unreadRes = await getUnreadCount();
        setUnread(typeof unreadRes === 'number' ? unreadRes : unreadRes?.count ?? 0);
      } catch (e) {
        console.error('Failed to load unread count:', e);
        setUnread(0);
      } finally {
        setLoadingUnread(false);
      }
    })();

    // Load recommended tutors
    (async () => {
      try {
        const recoRes = await getRecommendedTutors(6);
        const baseReco = Array.isArray(recoRes) ? recoRes : [];
        setReco(baseReco);

        // Fetch demo statuses in background
        try {
          const ids = baseReco.map((t: any) => t.id).filter(Boolean);
          if (ids.length) {
            const map = await getDemoStatusesForTutors(ids);
            setReco(baseReco.map((t: any) => ({ ...t, demoUsed: !!map[t.id] })));
          }
        } catch {
          /* ignore */
        }
      } catch (e) {
        console.error('Failed to load recommended tutors:', e);
        setReco([]);
      } finally {
        setLoadingReco(false);
      }
    })();

    // Load student stats
    (async () => {
      try {
        const meRes = await getMe();
        
        setHoursStudied(
          typeof meRes?.student?.hoursStudied === 'number' ? meRes.student.hoursStudied : null
        );
        setSessionsCompleted(
          typeof meRes?.student?.sessionsCompleted === 'number'
            ? meRes.student.sessionsCompleted
            : null
        );

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
      } catch (e) {
        console.error('Failed to load student stats:', e);
      } finally {
        setLoadingStats(false);
      }
    })();

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

  // ✅ No global loading check - each section handles its own loading
  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-extrabold">Loading...</h1>
        </header>
      </div>
    );
  }

  if (isAuthenticated === false) return null;

  const hours = hoursStudied ?? 0;
  const sessions = sessionsCompleted ?? 0;
  const hasSubjects = subjectStats.length > 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8 space-y-6 sm:space-y-8 lg:space-y-10 max-w-7xl">
        {/* Hero - Responsive */}
        <div className="rounded-2xl sm:rounded-3xl bg-gradient-to-r from-ocean-700 to-green-500 p-6 sm:p-8 lg:p-10 text-white shadow-md">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">
            Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}! 👋
          </h1>
          <p className="mt-2 sm:mt-3 text-base sm:text-lg text-white/90">Let&apos;s continue your learning journey today.</p>
        </div>

        {/* Learning snapshot - Responsive */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <SnapshotCard
            title="Hours Studied"
            value={`${hours}h`}
            icon={<Clock className="h-5 w-5 sm:h-6 sm:w-6 text-sky-600" />}
            sub="This month"
            ringPercent={toBoundedPercent((hours / 20) * 100)}
          />
          <SnapshotCard
            title="Sessions Completed"
            value={sessions}
            icon={<CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600" />}
            sub="All time"
          />
        </section>

        {/* Optional subject progress - Responsive */}
        {(loadingStats || hasSubjects) && (
          <section className="rounded-xl sm:rounded-2xl border bg-white p-4 sm:p-5 lg:p-6 shadow-sm">
            {loadingStats ? (
              <div className="h-32 animate-pulse bg-slate-50 rounded" />
            ) : (
              <>
                <button
                  onClick={() => setShowSubjects((v) => !v)}
                  className="w-full flex items-center justify-between"
                >
                  <span className="text-base sm:text-lg font-semibold text-slate-800">Subject progress</span>
                  {showSubjects ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </button>

                {showSubjects && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {subjectStats.map((s) => (
                      <div key={s.name} className="rounded-lg sm:rounded-xl border p-3 sm:p-4 bg-slate-50">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-700 truncate pr-2">{s.name}</span>
                          <span className="text-xs text-slate-500 flex-shrink-0">{s.progress}%</span>
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
              </>
            )}
          </section>
        )}

        {/* Quick stats - Responsive grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
          {/* Token Balance Card */}
          {loadingTokens ? (
            <div className="h-36 sm:h-40 rounded-xl sm:rounded-2xl border p-4 shadow-sm animate-pulse bg-slate-50" />
          ) : (
            <StatCard
              title="Token Balance"
              value={tokens ?? '—'}
              icon={<BadgeIndianRupee className="h-5 w-5 sm:h-6 sm:w-6 text-ocean-600" />}
              action={
                <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <Link
                    to="/student/token-balance"
                    className="text-xs sm:text-sm font-medium text-ocean-700 hover:underline text-center sm:text-left"
                  >
                    View Details
                  </Link>
                  <button
                    className="text-xs sm:text-sm font-medium text-ocean-700 hover:underline inline-flex items-center justify-center sm:justify-start gap-1"
                    onClick={() => nav('/student/cart')}
                  >
                    <Plus className="h-3 w-3 sm:h-4 sm:w-4" /> Buy Tokens
                  </button>
                </div>
              }
            />
          )}
          
          {/* Next Session Card */}
          {loadingNext ? (
            <div className="h-36 sm:h-40 rounded-xl sm:rounded-2xl border p-4 shadow-sm animate-pulse bg-slate-50" />
          ) : (
            <StatCard
              title="Next Session"
              value={nextStartText ?? 'No upcoming sessions'}
              icon={<CalendarClock className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />}
              action={
                nextStartText && (
                  <Link to="/student/bookings" className="mt-2 text-xs sm:text-sm text-ocean-700 hover:underline block">
                    View all bookings
                  </Link>
                )
              }
            />
          )}
          
          {/* Messages Card */}
          {loadingUnread ? (
            <div className="h-36 sm:h-40 rounded-xl sm:rounded-2xl border p-4 shadow-sm animate-pulse bg-slate-50" />
          ) : (
            <StatCard
              title="Messages"
              value={`${unread} unread`}
              icon={<MessageSquareMore className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600" />}
              action={
                <Link to="/student/chat" className="mt-2 text-xs sm:text-sm text-ocean-700 hover:underline block">
                  Go to chat
                </Link>
              }
            />
          )}
          
          {/* Favorites Card */}
          <StatCard
            title="My Favorites"
            value="View all"
            icon={<Heart className="h-5 w-5 sm:h-6 sm:w-6 text-rose-600" />}
            action={
              <Link to="/student/favorites" className="mt-2 text-xs sm:text-sm text-ocean-700 hover:underline block">
                Manage favorites
              </Link>
            }
          />
        </section>

        {/* Learning Tools - Responsive */}
        <section>
          <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-ocean-700" /> Your Learning Tools
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 lg:gap-6">
            <Link
              to="/student/progress"
              className="rounded-xl sm:rounded-2xl border bg-white p-4 sm:p-6 shadow-sm hover:shadow-md transition group active:scale-95"
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-ocean-600 group-hover:scale-110 transition" />
                <span className="text-xl sm:text-2xl">📊</span>
              </div>
              <h3 className="text-sm sm:text-lg font-bold text-slate-800 mb-1">Progress</h3>
              <p className="text-xs sm:text-sm text-slate-600 hidden sm:block">View hours, levels, and achievements</p>
            </Link>

            <Link
              to="/student/goals"
              className="rounded-xl sm:rounded-2xl border bg-white p-4 sm:p-6 shadow-sm hover:shadow-md transition group active:scale-95"
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <Target className="h-6 w-6 sm:h-8 sm:w-8 text-purple-600 group-hover:scale-110 transition" />
                <span className="text-xl sm:text-2xl">🎯</span>
              </div>
              <h3 className="text-sm sm:text-lg font-bold text-slate-800 mb-1">Goals</h3>
              <p className="text-xs sm:text-sm text-slate-600 hidden sm:block">Set and track your objectives</p>
            </Link>

            <Link
              to="/student/session-notes"
              className="rounded-xl sm:rounded-2xl border bg-white p-4 sm:p-6 shadow-sm hover:shadow-md transition group active:scale-95"
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-green-600 group-hover:scale-110 transition" />
                <span className="text-xl sm:text-2xl">📝</span>
              </div>
              <h3 className="text-sm sm:text-lg font-bold text-slate-800 mb-1">Notes</h3>
              <p className="text-xs sm:text-sm text-slate-600 hidden sm:block">Review tutor notes and homework</p>
            </Link>

            <Link
              to="/student/certificates"
              className="rounded-xl sm:rounded-2xl border bg-white p-4 sm:p-6 shadow-sm hover:shadow-md transition group active:scale-95"
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <Award className="h-6 w-6 sm:h-8 sm:w-8 text-amber-600 group-hover:scale-110 transition" />
                <span className="text-xl sm:text-2xl">🏆</span>
              </div>
              <h3 className="text-sm sm:text-lg font-bold text-slate-800 mb-1">Awards</h3>
              <p className="text-xs sm:text-sm text-slate-600 hidden sm:block">View earned achievements</p>
            </Link>

            <Link
              to="/student/group-sessions"
              className="rounded-xl sm:rounded-2xl border bg-white p-4 sm:p-6 shadow-sm hover:shadow-md transition group active:scale-95"
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <BookOpen className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 group-hover:scale-110 transition" />
                <span className="text-xl sm:text-2xl">👥</span>
              </div>
              <h3 className="text-sm sm:text-lg font-bold text-slate-800 mb-1">Groups</h3>
              <p className="text-xs sm:text-sm text-slate-600 hidden sm:block">Join group learning sessions</p>
            </Link>

            <Link
              to="/student/waitlist"
              className="rounded-xl sm:rounded-2xl border bg-white p-4 sm:p-6 shadow-sm hover:shadow-md transition group active:scale-95"
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-600 group-hover:scale-110 transition" />
                <span className="text-xl sm:text-2xl">⏰</span>
              </div>
              <h3 className="text-sm sm:text-lg font-bold text-slate-800 mb-1">Waitlist</h3>
              <p className="text-xs sm:text-sm text-slate-600 hidden sm:block">Track your tutor waitlist</p>
            </Link>
          </div>
        </section>

        {/* Recommended tutors - Responsive */}
        <section>
          <div className="mb-4 sm:mb-6 flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-ocean-700" /> Recommended for you
            </h2>
            <Link to="/find-tutors" className="text-xs sm:text-sm text-ocean-700 hover:underline font-medium">
              See all
            </Link>
          </div>

          {loadingReco ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-44 sm:h-48 rounded-xl sm:rounded-2xl border p-4 sm:p-5 shadow-sm animate-pulse bg-slate-50" />
              ))}
            </div>
          ) : reco.length === 0 ? (
            <div className="text-slate-600 text-sm sm:text-base p-6 bg-white rounded-xl border text-center">
              No recommendations yet. Browse tutors to get started.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
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
                    className="rounded-xl sm:rounded-2xl border bg-white p-4 sm:p-5 shadow-sm hover:shadow-md transition active:scale-98"
                  >
                    <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                      <img
                        src={
                          t.avatarUrl ||
                          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                            t.name || 'T'
                          )}`
                        }
                        className="h-12 w-12 sm:h-14 sm:w-14 rounded-full border flex-shrink-0"
                        alt={t.name || 'Tutor'}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm sm:text-base truncate">{t.name || 'Tutor'}</div>
                        <div className="text-xs text-slate-500 truncate">{t.subject || 'Subject'}</div>
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
                    
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="text-xs sm:text-sm font-medium truncate">
                        <PriceDisplay amountInINR={t.hourlyRate ?? 0} />/hr
                      </div>
                      <button
                        onClick={() => nav(href)}
                        className="rounded-lg sm:rounded-xl bg-ocean-700 px-3 sm:px-4 py-2 text-xs font-medium text-white hover:bg-ocean-800 active:scale-95 transition whitespace-nowrap"
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
    <div className="rounded-xl sm:rounded-2xl border bg-white p-4 sm:p-5 shadow-sm hover:shadow-md transition">
      <div className="flex items-center justify-between">
        <span className="text-xs sm:text-sm font-medium text-slate-500">{title}</span>
        {icon}
      </div>
      <div className="mt-2 sm:mt-3 text-xl sm:text-2xl font-bold text-slate-800 truncate">{value}</div>
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
    <div className="rounded-xl sm:rounded-2xl border bg-white p-4 sm:p-5 shadow-sm hover:shadow-md transition">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs sm:text-sm font-medium text-slate-600">{title}</span>
        </div>
        {typeof ringPercent === 'number' && (
          <ProgressRing percent={toBoundedPercent(ringPercent)} size={38} stroke={5} />
        )}
      </div>
      <div className="mt-2 sm:mt-3 text-xl sm:text-2xl font-bold text-slate-800">{value}</div>
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
