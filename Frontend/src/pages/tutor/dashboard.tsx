import { useEffect, useMemo, useState } from 'react';
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
  Users,
  Award
} from 'lucide-react';
import { getAvailability, type AvailabilitySlot, getMySessions, type TutorSession } from '../../services/tutorService';
import api from '../../lib/apiClient';

function combineToDate(date: string | undefined, time: string): Date | null {
  const d = date || undefined;
  if (!d) return null;
  const [h, m] = String(time || '').split(':').map((x) => Number(x) || 0);
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setHours(h, m, 0, 0);
  return dt;
}

export default function TutorDashboard() {
  const [avail, setAvail] = useState<AvailabilitySlot[]>([]);
  const [sessions, setSessions] = useState<TutorSession[]>([]);
  const [loadingAvail, setLoadingAvail] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [stats, setStats] = useState({
    totalEarnings: 0,
    sessionsCompleted: 0,
    averageRating: 0,
    totalReviews: 0,
    monthlyEarnings: 0,
    activeStudents: 0
  });

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

    // ✅ Load tutor stats
    (async () => {
      try {
        const res = await api.get('/tutors/me');
        if (isMounted && res.data) {
          setStats({
            totalEarnings: res.data.totalEarnings || 0,
            sessionsCompleted: res.data.sessionsCompleted || 0,
            averageRating: res.data.rating || 0,
            totalReviews: res.data.reviews || 0,
            monthlyEarnings: res.data.monthlyEarnings || 0,
            activeStudents: res.data.activeStudents || 0
          });
        }
      } catch (error) {
        console.error('Failed to load stats:', error);
      } finally {
        if (isMounted) setLoadingStats(false);
      }
    })();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, []);

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
    <div className="min-h-screen bg-slate-50">
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
                value={`₹${stats.totalEarnings.toLocaleString()}`}
                icon={<DollarSign className="h-6 w-6 text-emerald-600" />}
                bgColor="bg-emerald-50"
              />
              <StatCard
                title="Monthly Earnings"
                value={`₹${stats.monthlyEarnings.toLocaleString()}`}
                icon={<TrendingUp className="h-6 w-6 text-blue-600" />}
                bgColor="bg-blue-50"
              />
              <StatCard
                title="Sessions Completed"
                value={stats.sessionsCompleted}
                icon={<BookOpen className="h-6 w-6 text-purple-600" />}
                bgColor="bg-purple-50"
              />
              <StatCard
                title="Average Rating"
                value={stats.averageRating > 0 ? stats.averageRating.toFixed(1) : 'N/A'}
                icon={<Star className="h-6 w-6 text-amber-600 fill-amber-600" />}
                bgColor="bg-amber-50"
                subtitle={`${stats.totalReviews} reviews`}
              />
              <StatCard
                title="Active Students"
                value={stats.activeStudents}
                icon={<Users className="h-6 w-6 text-indigo-600" />}
                bgColor="bg-indigo-50"
              />
              <StatCard
                title="Quick Action"
                value="Manage Availability"
                icon={<CalendarDays className="h-6 w-6 text-rose-600" />}
                bgColor="bg-rose-50"
                action={
                  <Link 
                    to="/tutor/availability" 
                    className="mt-2 text-sm text-indigo-700 hover:underline font-medium inline-block"
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
          <section className="rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-3 bg-gradient-to-r from-indigo-50 to-purple-50">
              <h3 className="font-semibold flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-indigo-600"/> Upcoming Availability
              </h3>
              <Link to="/tutor/availability" className="text-sm text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 font-medium">
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
          <section className="rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-3 bg-gradient-to-r from-emerald-50 to-green-50">
              <h3 className="font-semibold flex items-center gap-2">
                <User className="h-5 w-5 text-emerald-600"/> Recent Bookings
              </h3>
              <Link to="/tutor/sessions" className="text-sm text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1 font-medium">
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
            />
            <ToolCard
              to="/tutor/availability"
              icon={<CalendarDays className="h-7 w-7 text-purple-600" />}
              emoji="📅"
              title="Availability"
              description="Manage your time slots"
            />
            <ToolCard
              to="/tutor/sessions"
              icon={<BookOpen className="h-7 w-7 text-emerald-600" />}
              emoji="📚"
              title="Sessions"
              description="View all your classes"
            />
            <ToolCard
              to="/tutor/earnings"
              icon={<DollarSign className="h-7 w-7 text-green-600" />}
              emoji="💰"
              title="Earnings"
              description="Check your income"
            />
            <ToolCard
              to="/tutor/content-library"
              icon={<FileText className="h-7 w-7 text-blue-600" />}
              emoji="📄"
              title="Content"
              description="Share study materials"
            />
            <ToolCard
              to="/tutor/performance-tracking"
              icon={<BarChart className="h-7 w-7 text-amber-600" />}
              emoji="📊"
              title="Analytics"
              description="Track student progress"
            />
            <ToolCard
              to="/tutor/messages"
              icon={<MessageSquare className="h-7 w-7 text-rose-600" />}
              emoji="💬"
              title="Messages"
              description="Chat with students"
            />
            <ToolCard
              to="/tutor/create-group-session"
              icon={<Users className="h-7 w-7 text-cyan-600" />}
              emoji="👥"
              title="Groups"
              description="Create group sessions"
            />
          </div>
        </section>
      </div>
    </div>
  );
}

// Helper Components
function StatCard({ 
  title, 
  value, 
  icon, 
  bgColor = "bg-slate-50",
  subtitle,
  action 
}: { 
  title: string; 
  value: string | number; 
  icon: React.ReactNode;
  bgColor?: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${bgColor} hover:shadow-md transition`}>
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
  description 
}: { 
  to: string; 
  icon: React.ReactNode; 
  emoji: string; 
  title: string; 
  description: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-xl sm:rounded-2xl border bg-white p-4 sm:p-5 shadow-sm hover:shadow-md transition group active:scale-95"
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
