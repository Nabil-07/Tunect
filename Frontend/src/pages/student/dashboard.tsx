// src/pages/student/dashboard.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
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
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getRecommendedTutors } from '../../services/tutorService';
import type { TutorSearchHistoryEntry } from '../../services/tutorService';
import { getMe } from '../../services/studentService';
import { getUnreadCount } from '../../services/messagesService';
import { getDemoStatusesForTutors, getDemoStatusForTutor } from '../../services/bookingsService';
import { PriceDisplay } from '../../components/PriceDisplay';
import {
  DashboardStatSkeleton,
  TutorCardSkeleton,
  Skeleton,
} from '../../components/skeletons';
import api from '../../lib/apiClient';
import RoleTermsFirstLoginModal from '../../components/RoleTermsFirstLoginModal';
import MaintenanceBanner from '../../components/MaintenanceBanner';

type SubjectStat = { name: string; progress: number }; // 0..100

export default function StudentDashboard() {
  const { user, setUser, logout, loading: authLoading, isAuthenticated } = useAuth() as any;
  const nav = useNavigate();
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsSubmitting, setTermsSubmitting] = useState(false);

  // ✅ Global page loader (shows on initial mount)
  const [initialLoading, setInitialLoading] = useState(true);
  
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
  const [profileStatus, setProfileStatus] = useState<{
    isComplete: boolean;
    completionPercentage: number;
    missingFields: string[];
  } | null>(null);
  const [loadingProfileStatus, setLoadingProfileStatus] = useState(true);
  const profileStatusNeedsFallbackRef = useRef(false);

  const readSearchHistory = (): TutorSearchHistoryEntry[] => {
    try {
      const raw = localStorage.getItem('tn_find_tutors_recent_searches');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };


  const dtf = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    []
  );

  useEffect(() => {
    if (authLoading || isAuthenticated === false) return;

    let isMounted = true; // Cleanup flag

    // Ensure only students can access this dashboard
    const userRole = user?.role?.toUpperCase();
    if (userRole && userRole !== 'STUDENT') {
      console.log('Non-student accessing student dashboard, skipping student API calls');
      setLoadingTokens(false);
      setLoadingNext(false);
      setLoadingUnread(false);
      setLoadingReco(false);
      setLoadingStats(false);
      setLoadingProfileStatus(false);
      setProfileStatus(null);
      return;
    }

    // ✅ Load each API independently - UI renders as data arrives!

    // Load profile completion status (fallback to /students/me on 404)
    (async () => {
      try {
        const { data } = await api.get('/students/me/profile-status');
        if (!isMounted) return;
        setProfileStatus(data ?? null);
        setLoadingProfileStatus(false);
      } catch (e: any) {
        const status = e?.response?.status;
        if (status === 404) {
          profileStatusNeedsFallbackRef.current = true;
          return;
        }
        console.error('Failed to load profile status:', e);
        if (isMounted) {
          setProfileStatus(null);
          setLoadingProfileStatus(false);
        }
      }
    })();

    // Load token balances
    (async () => {
      try {
        const balancesRes = await api.get('/students/me/token-balances');
        if (!isMounted) return;
        const balances = Array.isArray(balancesRes.data) ? balancesRes.data : [];
        const totalTokens = balances.reduce((sum: number, b: any) => sum + Number(b.balance || 0), 0);
        
        const balanceMap = new Map<string, number>();
        balances.forEach((b: any) => {
          if (b.tutorId) {
            balanceMap.set(b.tutorId, Number(b.balance || 0));
          }
        });
        if (isMounted) {
          setTokenBalances(balanceMap);
          setTokens(totalTokens);
        }
      } catch (e) {
        console.error('Failed to load token balances:', e);
        if (isMounted) setTokens(0);
      } finally {
        if (isMounted) setLoadingTokens(false);
      }
    })();

    // Load next booking - call API directly to bypass getNextBooking() guards
    (async () => {
      try {
        // Call API directly instead of using getNextBooking() which has guards that might prevent the call
        const { data } = await api.get('/bookings/next');
        if (isMounted) setNext(data ?? null);
      } catch (e: any) {
        const status = e?.response?.status;
        // 404 means no upcoming session found, which is valid
        if (status === 404) {
          if (isMounted) setNext(null);
        } else if (status === 401) {
          // Unauthorized - user not authenticated
          if (isMounted) setNext(null);
        } else {
          console.error('Failed to load next booking:', e);
          if (isMounted) setNext(null);
        }
      } finally {
        if (isMounted) setLoadingNext(false);
      }
    })();

    // Load unread messages
    (async () => {
      try {
        const unreadRes = await getUnreadCount();
        if (isMounted) setUnread(typeof unreadRes === 'number' ? unreadRes : unreadRes?.count ?? 0);
      } catch (e) {
        console.error('Failed to load unread count:', e);
        if (isMounted) setUnread(0);
      } finally {
        if (isMounted) setLoadingUnread(false);
      }
    })();

    // Load recommended tutors
    (async () => {
      try {
        const searches = readSearchHistory();
        const recoRes = await getRecommendedTutors({ limit: 6, searches });
        const baseReco = Array.isArray(recoRes) ? recoRes : [];
        if (isMounted) setReco(baseReco);

        // Fetch demo statuses in background
        try {
          const ids = baseReco.map((t: any) => t.id).filter(Boolean);
          if (ids.length) {
            const map = await getDemoStatusesForTutors(ids);
            if (isMounted) setReco(baseReco.map((t: any) => ({ ...t, demoUsed: !!map[t.id] })));
          }
        } catch {
          /* ignore */
        }
      } catch (e) {
        console.error('Failed to load recommended tutors:', e);
        if (isMounted) setReco([]);
      } finally {
        if (isMounted) setLoadingReco(false);
      }
    })();

    // Load student stats - call /students/me directly for stats
    (async () => {
      try {
        // Call /students/me directly to get hoursStudied and sessionsCompleted
        const meRes = await api.get('/students/me');
        const studentData = meRes?.data?.student;
        
        if (isMounted && studentData) {
          setHoursStudied(
            typeof studentData?.hoursStudied === 'number' ? studentData.hoursStudied : null
          );
          setSessionsCompleted(
            typeof studentData?.sessionsCompleted === 'number'
              ? studentData.sessionsCompleted
              : null
          );

          const subjects: SubjectStat[] =
            Array.isArray(studentData?.subjectProgress)
              ? studentData.subjectProgress
                  .map((s: any) => ({
                    name: String(s?.name ?? 'Subject'),
                    progress: clampPercent(s?.progress),
                  }))
                  .slice(0, 6)
              : [];
          setSubjectStats(subjects);

          const userData = meRes?.data?.user ?? studentData?.user;
          if (profileStatusNeedsFallbackRef.current) {
            setProfileStatus(computeStudentProfileStatus({ ...studentData, user: userData }));
            setLoadingProfileStatus(false);
            profileStatusNeedsFallbackRef.current = false;
          }
        } else if (isMounted) {
          setLoadingProfileStatus(false);
        }
      } catch (e) {
        console.error('Failed to load student stats:', e);
        // Fallback: try getMe() as backup
        try {
          const meRes = await getMe();
          if (isMounted && meRes?.student) {
            setHoursStudied(meRes.student.hoursStudied ?? null);
            setSessionsCompleted(meRes.student.sessionsCompleted ?? null);
            const userData = (meRes as any)?.user ?? (meRes as any)?.student?.user;
            if (profileStatusNeedsFallbackRef.current) {
              setProfileStatus(computeStudentProfileStatus({ ...meRes.student, user: userData }));
              setLoadingProfileStatus(false);
              profileStatusNeedsFallbackRef.current = false;
            }
          }
        } catch (e2) {
          console.error('Fallback getMe() also failed:', e2);
          if (isMounted) setLoadingProfileStatus(false);
        }
      } finally {
        if (isMounted) setLoadingStats(false);
      }
    })();

    // Hide initial loader after short delay
    setTimeout(() => {
      if (isMounted) setInitialLoading(false);
    }, 600);

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [authLoading, isAuthenticated, user?.role]);

  useEffect(() => {
    if (authLoading || isAuthenticated === false) return;
    const role = String(user?.role || '').toUpperCase();
    if (role !== 'STUDENT') return;
    const accepted = !!user?.terms?.student?.accepted;
    setShowTermsModal(!accepted);
  }, [authLoading, isAuthenticated, user?.role, user?.terms?.student?.accepted]);

  const handleAcceptTerms = async () => {
    try {
      setTermsSubmitting(true);
      await api.post('/users/me/terms/accept', { version: 1 });
      const { data } = await api.get('/users/me');
      setUser(data ?? user);
      setShowTermsModal(false);
    } catch (error) {
      console.error('Failed to accept student terms:', error);
    } finally {
      setTermsSubmitting(false);
    }
  };

  const handleDeclineTerms = () => {
    logout();
  };


  // Listen for demo status and token balance changes
  useEffect(() => {
    const handleDemoStatusChange = async (event: CustomEvent) => {
      const tutorId = event.detail?.tutorId;
      if (!tutorId) return;
      
      try {
        const used = await getDemoStatusForTutor(tutorId);
        setReco((prev) => prev.map((t: any) => 
          t.id === tutorId ? { ...t, demoUsed: used } : t
        ));
      } catch (e) {
        console.error('Failed to refresh demo status:', e);
      }
    };

    const handleTokenBalanceChange = async () => {
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
        console.error('Failed to refresh token balances:', e);
      }
    };

    window.addEventListener('demo-status-changed', handleDemoStatusChange as unknown as EventListener);
    window.addEventListener('token-balance-changed', handleTokenBalanceChange);
    
    return () => {
      window.removeEventListener('demo-status-changed', handleDemoStatusChange as unknown as EventListener);
      window.removeEventListener('token-balance-changed', handleTokenBalanceChange);
    };
  }, []);

  // next session helpers
  const nextStartISO =
    next?.startLocal?.iso ||
    next?.startLocal ||
    next?.startTime ||
    next?.startAt ||
    next?.start;

  const nextStartText = nextStartISO ? dtf.format(new Date(nextStartISO)) : null;
  // ✅ Show full-page loader on initial mount
  if (authLoading || initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-ocean-600 border-t-transparent"></div>
          <p className="mt-4 text-lg text-slate-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated === false) return null;

  const hours = hoursStudied ?? 0;
  const sessions = sessionsCompleted ?? 0;
  const hasSubjects = subjectStats.length > 0;

  return (
    <>
    <RoleTermsFirstLoginModal
      open={showTermsModal}
      role="STUDENT"
      submitting={termsSubmitting}
      onAccept={handleAcceptTerms}
      onDecline={handleDeclineTerms}
    />
    <div className="min-h-screen bg-slate-50" data-testid="student-dashboard-page">
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8 space-y-6 sm:space-y-8 lg:space-y-10 max-w-7xl">
        {/* Hero - Responsive */}
        <div className="rounded-2xl sm:rounded-3xl bg-gradient-to-r from-ocean-700 to-green-500 p-6 sm:p-8 lg:p-10 text-white shadow-md">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">
            Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}! 👋
          </h1>
          <p className="mt-2 sm:mt-3 text-base sm:text-lg text-white/90">Let&apos;s continue your learning journey today.</p>
        </div>

        <MaintenanceBanner />

        {!loadingProfileStatus && profileStatus && profileStatus.completionPercentage < 100 && (
          <div className="rounded-xl sm:rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm sm:text-base font-semibold text-amber-900">
                  Your profile is only {clampPercent(profileStatus.completionPercentage)}% complete.
                </p>
                <p className="text-xs sm:text-sm text-amber-800">Complete your profile to unlock the best experience.</p>
              </div>
              <Link
                to="/student/profile"
                data-testid="student-dashboard-complete-profile-link"
                className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                Complete profile
              </Link>
            </div>
            <div className="mt-3 h-2 w-full rounded-full bg-amber-100">
              <div
                className="h-2 rounded-full bg-amber-600"
                style={{ width: `${clampPercent(profileStatus.completionPercentage)}%` }}
              />
            </div>
          </div>
        )}

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
              <div className="h-32 rounded-xl overflow-hidden">
                <Skeleton className="h-full w-full rounded-xl" />
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowSubjects((v) => !v)}
                  data-testid="student-dashboard-subject-toggle-btn"
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
            <DashboardStatSkeleton />
          ) : (
            <StatCard
              title="Token Balance"
              value={tokens ?? '—'}
              icon={<BadgeIndianRupee className="h-5 w-5 sm:h-6 sm:w-6 text-ocean-600" />}
              action={
                <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <Link
                    to="/student/token-balance"
                    data-testid="student-dashboard-token-details-link"
                    className="text-xs sm:text-sm font-medium text-ocean-700 hover:underline text-center sm:text-left"
                  >
                    View Details
                  </Link>
                  <button
                    className="text-xs sm:text-sm font-medium text-ocean-700 hover:underline inline-flex items-center justify-center sm:justify-start gap-1"
                    data-testid="student-dashboard-buy-tokens-btn"
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
            <DashboardStatSkeleton />
          ) : (
            <StatCard
              title="Next Session"
              value={nextStartText ?? 'No upcoming sessions'}
              icon={<CalendarClock className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />}
              action={
                nextStartText && (
                  <Link to="/student/bookings" data-testid="student-dashboard-bookings-link" className="mt-2 text-xs sm:text-sm text-ocean-700 hover:underline block">
                    View all bookings
                  </Link>
                )
              }
            />
          )}
          
          {/* Messages Card */}
          {loadingUnread ? (
            <DashboardStatSkeleton />
          ) : (
            <StatCard
              title="Messages"
              value={`${unread} unread`}
              icon={<MessageSquareMore className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600" />}
              action={
                <Link to="/student/chat" data-testid="student-dashboard-chat-link" className="mt-2 text-xs sm:text-sm text-ocean-700 hover:underline block">
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
              <Link to="/student/favorites" data-testid="student-dashboard-favorites-link" className="mt-2 text-xs sm:text-sm text-ocean-700 hover:underline block">
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
              to="/student/bookings"
              data-testid="student-dashboard-classes-link"
              className="rounded-xl sm:rounded-2xl border bg-white p-4 sm:p-6 shadow-sm hover:shadow-md transition group active:scale-95"
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <CalendarClock className="h-6 w-6 sm:h-8 sm:w-8 text-ocean-700 group-hover:scale-110 transition" />
                <span className="text-xl sm:text-2xl">🎓</span>
              </div>
              <h3 className="text-sm sm:text-lg font-bold text-slate-800 mb-1">My Classes</h3>
              <p className="text-xs sm:text-sm text-slate-600 hidden sm:block">View upcoming and past sessions</p>
            </Link>

            <Link
              to="/student/progress"
              data-testid="student-dashboard-progress-link"
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
              data-testid="student-dashboard-goals-link"
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
              data-testid="student-dashboard-notes-link"
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
              to="/student/waitlist"
              data-testid="student-dashboard-waitlist-link"
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
            <Link to="/find-tutors" data-testid="student-dashboard-see-all-tutors-link" className="text-xs sm:text-sm text-ocean-700 hover:underline font-medium">
              See all
            </Link>
          </div>

          {loadingReco ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
              {[...Array(4)].map((_, i) => (
                <TutorCardSkeleton key={i} />
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
                        data-testid="student-dashboard-tutor-action-btn"
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
    </>
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

function computeStudentProfileStatus(student: any) {
  const totalFields = 5;
  let completedFields = 0;
  const missingFields: string[] = [];

  if (student?.user?.name && String(student.user.name).trim()) {
    completedFields++;
  } else {
    missingFields.push('Full Name');
  }

  if (student?.user?.email && String(student.user.email).trim()) {
    completedFields++;
  } else {
    missingFields.push('Email');
  }

  if (student?.grade && String(student.grade).trim()) {
    completedFields++;
  } else {
    missingFields.push('Grade/Class');
  }

  if (student?.timezone && String(student.timezone).trim()) {
    completedFields++;
  } else {
    missingFields.push('Timezone');
  }

  if (student?.preferredLanguage && String(student.preferredLanguage).trim()) {
    completedFields++;
  } else {
    missingFields.push('Preferred Language');
  }

  return {
    isComplete: missingFields.length === 0,
    completionPercentage: Math.round((completedFields / totalFields) * 100),
    missingFields,
  };
}
