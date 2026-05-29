import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  CalendarDays, 
  Clock, 
  ArrowRight, 
  User, 
  DollarSign, 
  TrendingUp,
  BookOpen,
  FileText,
  BarChart,
  Star,
  MessageSquare,
  Award,
  ClipboardList
} from 'lucide-react';
import { getAvailability, type AvailabilitySlot, getMySessions, type TutorSession } from '../../services/tutorService';
import api from '../../lib/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import RoleTermsFirstLoginModal from '../../components/RoleTermsFirstLoginModal';
import MaintenanceBanner from '../../components/MaintenanceBanner';

export default function TutorDashboard() {
  const { user, setUser, logout } = useAuth() as any;
  const [avail, setAvail] = useState<AvailabilitySlot[]>([]);
  const [sessions, setSessions] = useState<TutorSession[]>([]);
  const [loadingAvail, setLoadingAvail] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [profileStatus, setProfileStatus] = useState<{
    isComplete: boolean;
    completionPercentage: number;
    missingFields: string[];
  } | null>(null);
  const [loadingProfileStatus, setLoadingProfileStatus] = useState(true);
  const profileStatusNeedsFallbackRef = useRef(false);
  const [stats, setStats] = useState({
    totalEarnings: 0,
    totalPaidOut: 0,
    penaltiesDeducted: 0,
    unpaidAmount: 0,
    sessionsCompleted: 0,
    averageRating: 0,
    totalReviews: 0,
    monthlyEarnings: 0,
    activeStudents: 0,
  });
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsSubmitting, setTermsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true; // Cleanup flag
    const now = new Date();
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const to = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // Extended to 30 days

    // ✅ Load availability independently
    (async () => {
      try {
        const a = await getAvailability({ from, to });
        if (isMounted) setAvail(a);
      } catch (error) {
        console.error('Failed to load availability:', error);
        if (isMounted) setAvail([]);
      } finally {
        if (isMounted) setLoadingAvail(false);
      }
    })();

    // ✅ Load sessions independently
    (async () => {
      try {
        const s = await getMySessions();
        if (isMounted) setSessions(s);
      } catch (error) {
        console.error('Failed to load sessions:', error);
        if (isMounted) setSessions([]);
      } finally {
        if (isMounted) setLoadingSessions(false);
      }
    })();

    // ✅ Load profile completion status (fallback to /tutors/me on 404)
    (async () => {
      try {
        const { data } = await api.get('/tutors/me/profile-status');
        if (!isMounted) return;
        setProfileStatus(data ?? null);
        setLoadingProfileStatus(false);
      } catch (error: any) {
        const status = error?.response?.status;
        if (status === 404) {
          profileStatusNeedsFallbackRef.current = true;
          return;
        }
        console.error('Failed to load profile status:', error);
        if (isMounted) {
          setProfileStatus(null);
          setLoadingProfileStatus(false);
        }
      }
    })();

    // ✅ Load tutor stats
    (async () => {
      try {
        const res = await api.get('/tutors/me');
        if (isMounted && res.data) {
          setStats({
            totalEarnings: res.data.totalEarnings ?? 0,
            totalPaidOut: res.data.totalPaidOut ?? 0,
            penaltiesDeducted: res.data.penaltiesDeducted ?? 0,
            unpaidAmount: res.data.unpaidAmount ?? res.data.walletBalance ?? 0,
            sessionsCompleted: res.data.sessionsCompleted || 0,
            averageRating: res.data.rating || 0,
            totalReviews: res.data.reviews || 0,
            monthlyEarnings: res.data.monthlyEarnings ?? 0,
            activeStudents: res.data.activeStudents || 0,
          });
          if (profileStatusNeedsFallbackRef.current) {
            setProfileStatus(computeTutorProfileStatus(res.data));
            setLoadingProfileStatus(false);
            profileStatusNeedsFallbackRef.current = false;
          }
        } else if (isMounted) {
          setLoadingProfileStatus(false);
        }
      } catch (error) {
        console.error('Failed to load stats:', error);
        if (isMounted) {
          setProfileStatus(null);
          setLoadingProfileStatus(false);
        }
      } finally {
        if (isMounted) setLoadingStats(false);
      }
    })();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const role = String(user?.role || '').toUpperCase();
    if (role !== 'TUTOR') return;
    const accepted = !!user?.terms?.tutor?.accepted;
    setShowTermsModal(!accepted);
  }, [user?.role, user?.terms?.tutor?.accepted]);

  const handleAcceptTerms = async () => {
    try {
      setTermsSubmitting(true);
      await api.post('/users/me/terms/accept', { version: 1 });
      const { data } = await api.get('/users/me');
      setUser(data ?? user);
      setShowTermsModal(false);
    } catch (error) {
      console.error('Failed to accept tutor terms:', error);
    } finally {
      setTermsSubmitting(false);
    }
  };

  const handleDeclineTerms = () => {
    logout();
  };


  const upcomingAvail = useMemo(() => {
    const now = Date.now();
    console.log('Processing availability slots:', avail); // Debug log
    console.log('Current time:', new Date(now).toISOString()); // Debug log
    console.log('Sample slot structure:', avail[0]); // Debug log - see actual structure
    
    const enriched = avail
      .map((s, index) => {
        console.log(`Processing slot ${index}:`, s); // Debug each slot
        
        // Normalized slots have date/day + startTime/endTime as HH:MM strings
        // We need to combine them to create full Date objects
        const dateStr = s.date || s.day;
        if (!dateStr || !s.startTime || !s.endTime) {
          console.warn('Missing required fields:', s);
          return null;
        }
        
        // Parse date and times
        const [startHour, startMin] = s.startTime.split(':').map(Number);
        const [endHour, endMin] = s.endTime.split(':').map(Number);
        
        const start = new Date(dateStr);
        start.setHours(startHour, startMin, 0, 0);
        
        const end = new Date(dateStr);
        end.setHours(endHour, endMin, 0, 0);
        
        // Validate dates
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          console.warn('Invalid dates after parsing:', { start, end, slot: s });
          return null;
        }
        
        console.log(`Slot ${index}: ${start.toISOString()} to ${end.toISOString()}, end > now: ${end.getTime() > now}`);
        
        return {
          ...s,
          start,
          end,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null && s.end.getTime() > now)
      // Exclude slots that overlap with any upcoming session
      .filter((slot) => {
        const overlaps = sessions.some((sess) => {
          // Only consider upcoming/incomplete sessions
          if (sess.status === 'COMPLETED') return false;
          const sStart = new Date(sess.startTime);
          const sEnd = new Date(sess.endTime);
          if (Number.isNaN(sStart.getTime()) || Number.isNaN(sEnd.getTime())) return false;
          return sStart < slot.end && sEnd > slot.start;
        });
        return !overlaps;
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime()); // earliest first
    
    console.log('Filtered upcoming slots:', enriched);
    return enriched.slice(0, 5);
  }, [avail, sessions]);

  const recentBookings = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    return sorted.slice(0, 5);
  }, [sessions]);

  return (
    <>
      <RoleTermsFirstLoginModal
        open={showTermsModal}
        role="TUTOR"
        submitting={termsSubmitting}
        onAccept={handleAcceptTerms}
        onDecline={handleDeclineTerms}
      />
    <div className="min-h-screen bg-slate-50" data-testid="tutor-dashboard-page">
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8 space-y-6 sm:space-y-8 max-w-7xl">
        {/* Hero */}
        <div className="rounded-2xl sm:rounded-3xl bg-gradient-to-r from-indigo-700 to-purple-600 p-6 sm:p-8 lg:p-10 text-white shadow-md">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">
            Welcome to Your Tutor Dashboard! 🎓
          </h1>
          <p className="mt-2 sm:mt-3 text-base sm:text-lg text-white/90">
            Track your teaching, manage sessions, and grow your impact.
          </p>
        </div>

        <MaintenanceBanner />

        {!loadingProfileStatus && profileStatus && profileStatus.completionPercentage < 100 && (
          <div className="rounded-xl sm:rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm sm:text-base font-semibold text-amber-900">
                  Your profile is only {clampPercent(profileStatus.completionPercentage)}% complete.
                </p>
                <p className="text-xs sm:text-sm text-amber-800">Complete your profile to get approved faster.</p>
              </div>
              <Link
                to="/tutor/profile"
                className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                data-testid="tutor-dashboard-complete-profile-link"
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

        {/* Stats Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {loadingStats ? (
            <>
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-36 rounded-2xl border p-4 shadow-sm animate-pulse bg-slate-100" />
              ))}
            </>
          ) : (
            <>
              <StatCard
                title="Total Earnings"
                value={`₹${formatInr(stats.totalEarnings)}`}
                icon={<DollarSign className="h-6 w-6 text-emerald-600" />}
                bgColor="bg-emerald-50"
                testId="tutor-dashboard-total-earnings-card"
              />
              <StatCard
                title="Monthly Earnings"
                value={`₹${formatInr(stats.monthlyEarnings)}`}
                icon={<TrendingUp className="h-6 w-6 text-blue-600" />}
                bgColor="bg-blue-50"
                testId="tutor-dashboard-monthly-earnings-card"
              />
              <StatCard
                title="Sessions Completed"
                value={stats.sessionsCompleted}
                icon={<BookOpen className="h-6 w-6 text-purple-600" />}
                bgColor="bg-purple-50"
                testId="tutor-dashboard-sessions-completed-card"
              />
              <StatCard
                title="Average Rating"
                value={stats.averageRating > 0 ? stats.averageRating.toFixed(1) : 'N/A'}
                icon={<Star className="h-6 w-6 text-amber-600 fill-amber-600" />}
                bgColor="bg-amber-50"
                subtitle={`${stats.totalReviews} reviews`}
                testId="tutor-dashboard-average-rating-card"
              />
              <StatCard
                title="Active Students"
                value={stats.activeStudents}
                icon={<User className="h-6 w-6 text-indigo-600" />}
                bgColor="bg-indigo-50"
                testId="tutor-dashboard-active-students-card"
              />
              <StatCard
                title="Quick Action"
                value="Manage Availability"
                icon={<CalendarDays className="h-6 w-6 text-rose-600" />}
                bgColor="bg-rose-50"
                testId="tutor-dashboard-quick-action-card"
                action={
                  <Link 
                    to="/tutor/availability" 
                    className="mt-2 text-sm text-indigo-700 hover:underline font-medium inline-block"
                    data-testid="tutor-dashboard-update-availability-link"
                  >
                    Update Now →
                  </Link>
                }
              />
            </>
          )}
        </section>

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Upcoming availability */}
          <section className="rounded-2xl border bg-white shadow-sm order-2 lg:order-2">
            <div className="flex items-center justify-between border-b px-4 py-3 bg-gradient-to-r from-indigo-50 to-purple-50">
              <h3 className="font-semibold flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-indigo-600"/> Upcoming Availability
              </h3>
              <Link to="/tutor/availability" className="text-sm text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 font-medium" data-testid="tutor-dashboard-availability-see-all-link">
                See all <ArrowRight className="h-4 w-4"/>
              </Link>
            </div>
            <div className="p-4">
              {loadingAvail ? (
                <div className="h-32 rounded-lg animate-pulse bg-slate-50" />
              ) : upcomingAvail.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarDays className="h-12 w-12 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No upcoming slots.</p>
                  <Link 
                    to="/tutor/availability" 
                    className="mt-2 inline-block text-sm text-indigo-600 hover:underline"
                    data-testid="tutor-dashboard-add-availability-link"
                  >
                    Add availability
                  </Link>
                </div>
              ) : (
                <ul className="divide-y">
                  {upcomingAvail.map((s, idx) => (
                    <li key={s.id || idx} className="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded transition">
                      <div className="text-sm">
                        <div className="font-medium text-slate-900">
                          {s.start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                        </div>
                        <div className="text-slate-600 flex items-center gap-1 mt-1">
                          <Clock className="h-3.5 w-3.5"/> 
                          {s.start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} – {s.end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <Link 
                        to="/tutor/availability" 
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                        data-testid="tutor-dashboard-edit-availability-link"
                      >
                        Edit
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Recent bookings */}
          <section className="rounded-2xl border bg-white shadow-sm order-1 lg:order-1">
            <div className="flex items-center justify-between border-b px-4 py-3 bg-gradient-to-r from-emerald-50 to-green-50">
              <h3 className="font-semibold flex items-center gap-2">
                <User className="h-5 w-5 text-emerald-600"/> Recent Bookings
              </h3>
              <Link to="/tutor/sessions" className="text-sm text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1 font-medium" data-testid="tutor-dashboard-bookings-see-all-link">
                See all <ArrowRight className="h-4 w-4"/>
              </Link>
            </div>
            <div className="p-4">
              {loadingSessions ? (
                <div className="h-32 rounded-lg animate-pulse bg-slate-50" />
              ) : recentBookings.length === 0 ? (
                <div className="text-center py-8">
                  <User className="h-12 w-12 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No bookings yet.</p>
                </div>
              ) : (
                <ul className="divide-y">
                  {recentBookings.map((b) => (
                    <li key={b.id} className="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded transition">
                      <div className="text-sm">
                        <div className="font-medium text-slate-900">{b.studentName}</div>
                        <div className="text-slate-600 mt-1">{b.subject} · {new Date(b.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <span className={`text-xs rounded-full px-2.5 py-1 font-medium ${
                        b.status === 'UPCOMING' ? 'bg-emerald-100 text-emerald-700' : 
                        b.status === 'COMPLETED' ? 'bg-slate-100 text-slate-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {b.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* Tutor Tools - Enhanced Grid */}
        <section>
          <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2">
            <Award className="h-6 w-6 text-indigo-600" /> Your Teaching Tools
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            <ToolCard
              to="/tutor/profile"
              icon={<User className="h-7 w-7 text-indigo-600" />}
              emoji="👤"
              title="Profile"
              description="Update your bio and subjects"
              testId="tutor-dashboard-tool-profile"
            />
            <ToolCard
              to="/tutor/availability"
              icon={<CalendarDays className="h-7 w-7 text-purple-600" />}
              emoji="📅"
              title="Availability"
              description="Manage your time slots"
              testId="tutor-dashboard-tool-availability"
            />
            <ToolCard
              to="/tutor/sessions"
              icon={<BookOpen className="h-7 w-7 text-emerald-600" />}
              emoji="📚"
              title="Sessions"
              description="View all your classes"
              testId="tutor-dashboard-tool-sessions"
            />
            <ToolCard
              to="/tutor/earnings"
              icon={<DollarSign className="h-7 w-7 text-green-600" />}
              emoji="💰"
              title="Earnings"
              description="Check your income"
              testId="tutor-dashboard-tool-earnings"
            />
            <ToolCard
              to="/tutor/content-library"
              icon={<FileText className="h-7 w-7 text-blue-600" />}
              emoji="📄"
              title="Content"
              description="Share study materials"
              testId="tutor-dashboard-tool-content"
            />
            <ToolCard
              to="/tutor/performance-tracking"
              icon={<BarChart className="h-7 w-7 text-amber-600" />}
              emoji="📊"
              title="Analytics"
              description="Track student progress"
              testId="tutor-dashboard-tool-analytics"
            />
            <ToolCard
              to="/tutor/messages"
              icon={<MessageSquare className="h-7 w-7 text-rose-600" />}
              emoji="💬"
              title="Messages"
              description="Chat with students"
              testId="tutor-dashboard-tool-messages"
            />
            <ToolCard
              to="/tutor/assignments"
              icon={<ClipboardList className="h-7 w-7 text-violet-600" />}
              emoji="📋"
              title="Assignments"
              description="Send and track homework"
              testId="tutor-dashboard-tool-assignments"
            />
          </div>
        </section>
      </div>
    </div>
    </>
  );
}

// Helper Components
function formatInr(value: number): string {
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCard({ 
  title, 
  value, 
  icon, 
  bgColor = "bg-slate-50",
  subtitle,
  action,
  testId 
}: { 
  title: string; 
  value: string | number; 
  icon: React.ReactNode;
  bgColor?: string;
  subtitle?: string;
  action?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${bgColor} hover:shadow-md transition`} data-testid={testId}>
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-lg bg-white shadow-sm">
          {icon}
        </div>
      </div>
      <h3 className="text-sm font-medium text-slate-600 mb-1">{title}</h3>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
      {action}
    </div>
  );
}

function ToolCard({ 
  to, 
  icon, 
  emoji, 
  title, 
  description,
  testId 
}: { 
  to: string; 
  icon: React.ReactNode; 
  emoji: string; 
  title: string; 
  description: string;
  testId?: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-xl sm:rounded-2xl border bg-white p-4 sm:p-5 shadow-sm hover:shadow-md transition group active:scale-95"
      data-testid={testId}
    >
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <div className="group-hover:scale-110 transition">
          {icon}
        </div>
        <span className="text-2xl">{emoji}</span>
      </div>
      <h4 className="text-sm sm:text-base font-bold text-slate-800 mb-1">{title}</h4>
      <p className="text-xs text-slate-600 hidden sm:block">{description}</p>
    </Link>
  );
}

function clampPercent(v: any): number {
  const n = Number.isFinite(v) ? Number(v) : 0;
  return Math.max(0, Math.min(100, n));
}

function computeTutorProfileStatus(data: any) {
  const tutor = data?.tutor ?? data;
  const user = tutor?.user ?? data?.user ?? {};
  const totalFields = 8;
  let completedFields = 0;
  const missingFields: string[] = [];

  if ((user?.name && String(user.name).trim()) || (tutor?.name && String(tutor.name).trim())) {
    completedFields++;
  } else {
    missingFields.push('Full Name');
  }

  if (tutor?.bio && String(tutor.bio).trim()) {
    completedFields++;
  } else {
    missingFields.push('Bio/Summary');
  }

  const subjects = tutor?.subjects ?? tutor?.subject;
  if (Array.isArray(subjects) ? subjects.length > 0 : Boolean(subjects)) {
    completedFields++;
  } else {
    missingFields.push('Subjects');
  }

  const languages = tutor?.languages ?? tutor?.language;
  if (Array.isArray(languages) ? languages.length > 0 : Boolean(languages)) {
    completedFields++;
  } else {
    missingFields.push('Languages');
  }

  if (tutor?.qualifications && String(tutor.qualifications).trim()) {
    completedFields++;
  } else {
    missingFields.push('Qualifications');
  }

  if (tutor?.yearsExperience && Number(tutor.yearsExperience) > 0) {
    completedFields++;
  } else {
    missingFields.push('Years of Experience');
  }

  if (tutor?.hourlyRate && Number(tutor.hourlyRate) > 0) {
    completedFields++;
  } else {
    missingFields.push('Hourly Rate');
  }

  const approved =
    tutor?.status === 'APPROVED' ||
    tutor?.kycStatus === 'APPROVED' ||
    tutor?.kyc?.status === 'APPROVED';
  if (approved) {
    completedFields++;
  } else {
    missingFields.push('KYC Verification');
  }

  return {
    isComplete: missingFields.length === 0,
    completionPercentage: Math.round((completedFields / totalFields) * 100),
    missingFields,
  };
}
