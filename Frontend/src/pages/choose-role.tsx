import { useEffect, useState } from 'react';
import { BookOpen, GraduationCap, ArrowRight, Loader2, Lock, Sparkles } from 'lucide-react';
import { http } from '../api/http';
import { getAccessToken, setTokens } from '../lib/auth';
import { unwrapAuthToken } from '../utils/decryption';

type RoleApi = 'STUDENT' | 'TUTOR' | 'ADMIN';

interface RoleControls {
  tutorRoleEnabled: boolean;
  studentRoleEnabled: boolean;
}

const targetFor = (role: RoleApi) =>
  role === 'ADMIN' ? '/admin/dashboard'
  : role === 'TUTOR' ? '/tutor/dashboard'
  : '/student/dashboard';

// Prevent double navigations during StrictMode/dev re-renders
let isNavigating = false;

export default function ChooseRole() {
  const [loading, setLoading] = useState<'STUDENT' | 'TUTOR' | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [hovered, setHovered] = useState<'STUDENT' | 'TUTOR' | null>(null);
  const [roleControls, setRoleControls] = useState<RoleControls>({
    tutorRoleEnabled: true,
    studentRoleEnabled: false,
  });

  useEffect(() => {
    http.get('/admin-controls/public').then(r => {
      const data = r.data;
      setRoleControls({
        tutorRoleEnabled: data?.tutorRoleEnabled ?? true,
        studentRoleEnabled: data?.studentRoleEnabled ?? false,
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) { setCheckingAuth(false); return; }

    const localRole = localStorage.getItem('role')?.toUpperCase() as RoleApi;
    const hasStudentLocal = localStorage.getItem('has_student_profile') === '1';
    const hasTutorLocal = localStorage.getItem('has_tutor_profile') === '1';

    const canFastRedirect =
      (localRole === 'ADMIN') ||
      (localRole === 'TUTOR' && hasTutorLocal) ||
      (localRole === 'STUDENT' && hasStudentLocal);

    if (canFastRedirect) {
      if (!isNavigating) { isNavigating = true; window.location.href = targetFor(localRole); }
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        const me = await http.get('/users/me').then(r => r.data);
        if (!isMounted) return;

        const role = me?.role?.toUpperCase?.() as RoleApi | undefined;
        const hasStudent = !!me?.student?.id;
        const hasTutor = !!me?.tutor?.id;

        if (role) localStorage.setItem('role', role);
        localStorage.setItem('has_student_profile', hasStudent ? '1' : '0');
        localStorage.setItem('has_tutor_profile', hasTutor ? '1' : '0');

        const canRedirect =
          (role === 'ADMIN') ||
          (role === 'TUTOR' && hasTutor) ||
          (role === 'STUDENT' && hasStudent);

        if (canRedirect) {
          if (isMounted && !isNavigating) { isNavigating = true; window.location.href = targetFor(role!); }
          return;
        }
        if (isMounted) setCheckingAuth(false);
      } catch {
        if (isMounted) setCheckingAuth(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  async function postChooseRole(role: 'STUDENT' | 'TUTOR') {
    try {
      return await http.post('/profiles/choose-role', { role });
    } catch (e: any) {
      if (e?.response?.status === 404 || e?.response?.status === 405) {
        return await http.post('/auth/choose-role', { role });
      }
      throw e;
    }
  }

  async function pick(role: 'STUDENT' | 'TUTOR') {
    setErr(null);
    setLoading(role);
    try {
      const response = await postChooseRole(role);
      if (response.data?.access_token) {
        const decrypted = await unwrapAuthToken(response.data.access_token);
        if (decrypted) setTokens({ accessToken: decrypted });
      }

      const me = await http.get('/users/me').then(r => r.data);
      const roleUpdated = me?.role?.toUpperCase?.() as RoleApi | undefined;
      const hasStudent = !!me?.student?.id;
      const hasTutor = !!me?.tutor?.id;

      if (roleUpdated) localStorage.setItem('role', roleUpdated);
      localStorage.setItem('has_student_profile', hasStudent ? '1' : '0');
      localStorage.setItem('has_tutor_profile', hasTutor ? '1' : '0');

      window.location.href = roleUpdated ? targetFor(roleUpdated) : targetFor(role);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Something went wrong.');
      setLoading(null);
    }
  }

  /* Loading state */
  if (checkingAuth) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-ocean-50">
        <div className="text-center animate-fadeInUp">
          <div className="relative inline-flex">
            <div className="h-12 w-12 rounded-full border-[3px] border-ocean-200" />
            <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-[3px] border-transparent border-t-ocean-600" />
          </div>
          <p className="mt-5 text-slate-500 font-medium tracking-wide text-sm">Preparing your experience...</p>
        </div>
      </main>
    );
  }

  const studentEnabled = roleControls.studentRoleEnabled;
  const tutorEnabled = roleControls.tutorRoleEnabled;
  const anyLoading = loading !== null;

  const features = {
    student: ['Browse qualified tutors', 'Book 1-on-1 sessions', 'Track your progress'],
    tutor: ['Set your own schedule', 'Manage your earnings', 'Connect with students'],
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-ocean-50 px-4 py-12" data-testid="choose-role-page">
      <div className="w-full max-w-3xl animate-fadeInUp">
        {/* Header */}
        <div className="text-center mb-10" data-testid="choose-role-header">
          <div className="inline-flex items-center gap-2 bg-ocean-50 text-ocean-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-4 tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            Welcome to Tunect
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            How do you want to use Tunect?
          </h1>
          <p className="mt-3 text-slate-500 text-base max-w-md mx-auto leading-relaxed">
            Choose your role to get started.
          </p>
        </div>

        {/* Error */}
        {err && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm max-w-lg mx-auto" data-testid="choose-role-error">
            <div className="shrink-0 h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
              <span className="text-red-500 text-lg font-bold">!</span>
            </div>
            <span>{err}</span>
          </div>
        )}

        {/* Role cards */}
        <div className="grid gap-5 sm:grid-cols-2">

          {/* Student card */}
          <button
            onClick={() => studentEnabled && !anyLoading ? pick('STUDENT') : undefined}
            onMouseEnter={() => studentEnabled && setHovered('STUDENT')}
            onMouseLeave={() => setHovered(null)}
            disabled={anyLoading || !studentEnabled}
            data-testid="choose-role-student-btn"
            className={`group relative rounded-2xl border-2 p-6 text-left transition-all duration-300 overflow-hidden ${
              studentEnabled
                ? 'bg-white border-slate-200 hover:border-ocean-400 hover:shadow-lg cursor-pointer'
                : 'bg-slate-50 border-slate-200 cursor-not-allowed'
            } ${loading === 'STUDENT' ? 'border-ocean-400 shadow-lg ring-2 ring-ocean-100' : ''}`}
          >
            {/* Gradient glow on hover */}
            {studentEnabled && (
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br from-ocean-50/80 to-transparent opacity-0 transition-opacity duration-300 ${
                hovered === 'STUDENT' ? 'opacity-100' : ''
              }`} />
            )}

            <div className="relative">
              {/* Icon + badge */}
              <div className="flex items-start justify-between mb-4">
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center transition-colors duration-300 ${
                  studentEnabled
                    ? 'bg-ocean-100 text-ocean-600 group-hover:bg-ocean-600 group-hover:text-white'
                    : 'bg-slate-200 text-slate-400'
                }`}>
                  <BookOpen className="w-6 h-6" />
                </div>
                {!studentEnabled && (
                  <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 text-xs font-semibold px-2.5 py-1 rounded-full border border-amber-200">
                    <Lock className="w-3 h-3" />
                    Coming Soon
                  </span>
                )}
              </div>

              {/* Title & description */}
              <h2 className={`text-xl font-bold mb-1.5 ${studentEnabled ? 'text-slate-900' : 'text-slate-400'}`}>
                I&apos;m a Student
              </h2>
              <p className={`text-sm leading-relaxed mb-4 ${studentEnabled ? 'text-slate-500' : 'text-slate-400'}`}>
                Find expert tutors and book personalized 1-on-1 learning sessions.
              </p>

              {/* Feature list */}
              <ul className="space-y-2 mb-5">
                {features.student.map((f) => (
                  <li key={f} className={`flex items-center gap-2 text-sm ${studentEnabled ? 'text-slate-600' : 'text-slate-400'}`}>
                    <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${studentEnabled ? 'bg-ocean-400' : 'bg-slate-300'}`} />
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                studentEnabled
                  ? 'bg-ocean-600 text-white group-hover:bg-ocean-700 group-hover:gap-3 shadow-sm'
                  : 'bg-slate-200 text-slate-400'
              }`}>
                {loading === 'STUDENT' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Setting up your account...
                  </>
                ) : studentEnabled ? (
                  <>
                    Continue as Student
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                ) : (
                  'Registration opening soon'
                )}
              </div>
            </div>
          </button>

          {/* Tutor card */}
          <button
            onClick={() => tutorEnabled && !anyLoading ? pick('TUTOR') : undefined}
            onMouseEnter={() => tutorEnabled && setHovered('TUTOR')}
            onMouseLeave={() => setHovered(null)}
            disabled={anyLoading || !tutorEnabled}
            data-testid="choose-role-tutor-btn"
            className={`group relative rounded-2xl border-2 p-6 text-left transition-all duration-300 overflow-hidden ${
              tutorEnabled
                ? 'bg-white border-slate-200 hover:border-emerald-400 hover:shadow-lg cursor-pointer'
                : 'bg-slate-50 border-slate-200 cursor-not-allowed'
            } ${loading === 'TUTOR' ? 'border-emerald-400 shadow-lg ring-2 ring-emerald-100' : ''}`}
          >
            {/* Gradient glow on hover */}
            {tutorEnabled && (
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-50/80 to-transparent opacity-0 transition-opacity duration-300 ${
                hovered === 'TUTOR' ? 'opacity-100' : ''
              }`} />
            )}

            <div className="relative">
              {/* Icon + badge */}
              <div className="flex items-start justify-between mb-4">
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center transition-colors duration-300 ${
                  tutorEnabled
                    ? 'bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white'
                    : 'bg-slate-200 text-slate-400'
                }`}>
                  <GraduationCap className="w-6 h-6" />
                </div>
                {!tutorEnabled && (
                  <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 text-xs font-semibold px-2.5 py-1 rounded-full border border-amber-200">
                    <Lock className="w-3 h-3" />
                    Coming Soon
                  </span>
                )}
              </div>

              {/* Title & description */}
              <h2 className={`text-xl font-bold mb-1.5 ${tutorEnabled ? 'text-slate-900' : 'text-slate-400'}`}>
                I&apos;m a Tutor
              </h2>
              <p className={`text-sm leading-relaxed mb-4 ${tutorEnabled ? 'text-slate-500' : 'text-slate-400'}`}>
                Share your knowledge, set your schedule, and earn on your terms.
              </p>

              {/* Feature list */}
              <ul className="space-y-2 mb-5">
                {features.tutor.map((f) => (
                  <li key={f} className={`flex items-center gap-2 text-sm ${tutorEnabled ? 'text-slate-600' : 'text-slate-400'}`}>
                    <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${tutorEnabled ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                tutorEnabled
                  ? 'bg-emerald-600 text-white group-hover:bg-emerald-700 group-hover:gap-3 shadow-sm'
                  : 'bg-slate-200 text-slate-400'
              }`}>
                {loading === 'TUTOR' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Setting up your account...
                  </>
                ) : tutorEnabled ? (
                  <>
                    Continue as Tutor
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                ) : (
                  'Registration opening soon'
                )}
              </div>
            </div>
          </button>

        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-400 mt-8">
          This choice sets up your initial profile. Need help?{' '}
          <a href="mailto:support@tunectnow.com" className="text-ocean-600 hover:text-ocean-700 underline underline-offset-2" data-testid="choose-role-support-link">
            Contact support
          </a>
        </p>
      </div>
    </main>
  );
}
