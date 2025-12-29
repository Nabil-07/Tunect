import { useEffect, useState } from 'react';
import { http } from '../api/http';
import { getAccessToken, setTokens } from '../lib/auth';

type RoleApi = 'STUDENT' | 'TUTOR' | 'ADMIN';

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

  useEffect(() => {
    const token = getAccessToken();
    
    // If no token, just show the page
    if (!token) {
      setCheckingAuth(false);
      return;
    }
    
    // Check localStorage first for quick redirect, but only when
    // the matching profile exists to avoid redirect loops.
    const localRole = localStorage.getItem('role')?.toUpperCase() as RoleApi;
    const hasStudentLocal = localStorage.getItem('has_student_profile') === '1';
    const hasTutorLocal = localStorage.getItem('has_tutor_profile') === '1';

    const canFastRedirect =
      (localRole === 'ADMIN') ||
      (localRole === 'TUTOR' && hasTutorLocal) ||
      (localRole === 'STUDENT' && hasStudentLocal);

    if (canFastRedirect) {
      if (!isNavigating) {
        isNavigating = true;
        window.location.href = targetFor(localRole);
      }
      return;
    }

    // Fetch user data to determine role
    let isMounted = true;
    
    (async () => {
      try {
        const me = await http.get('/users/me').then(r => r.data);
        
        if (!isMounted) return;
        
        const role = me?.role?.toUpperCase?.() as RoleApi | undefined;
        const hasStudent = !!me?.student?.id;
        const hasTutor = !!me?.tutor?.id;

        // Save to localStorage
        if (role) localStorage.setItem('role', role);
        localStorage.setItem('has_student_profile', hasStudent ? '1' : '0');
        localStorage.setItem('has_tutor_profile', hasTutor ? '1' : '0');

        // If user has a role + matching profile, redirect them
        const canRedirect =
          (role === 'ADMIN') ||
          (role === 'TUTOR' && hasTutor) ||
          (role === 'STUDENT' && hasStudent);

        if (canRedirect) {
          if (isMounted && !isNavigating) {
            isNavigating = true;
            window.location.href = targetFor(role!);
          }
          return;
        }

        // If user hasn't chosen a role yet, stay on this page
        if (isMounted) {
          setCheckingAuth(false);
        }

      } catch (e) {
        console.error("Failed to fetch user info", e);
        if (isMounted) {
          setCheckingAuth(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
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
      
      // Store the new JWT token with updated role
      if (response.data?.access_token) {
        setTokens({ accessToken: response.data.access_token });
      }
      
      const me = await http.get('/users/me').then(r => r.data);
      const roleUpdated = me?.role?.toUpperCase?.() as RoleApi | undefined;
      const hasStudent = !!me?.student?.id;
      const hasTutor = !!me?.tutor?.id;

      if (roleUpdated) localStorage.setItem('role', roleUpdated);
      localStorage.setItem('has_student_profile', hasStudent ? '1' : '0');
      localStorage.setItem('has_tutor_profile', hasTutor ? '1' : '0');

      const next = roleUpdated ? targetFor(roleUpdated) : targetFor(role);

      window.location.href = next;
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Something went wrong.');
      setLoading(null);
    }
  }

  if (checkingAuth) {
    return (
      <main className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-ocean-600 border-r-transparent"></div>
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[70vh] flex items-center">
      <div className="container-px mx-auto max-w-lg w-full">
        <h1 className="text-2xl font-extrabold text-center">How do you want to use Tunect?</h1>

        {err && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <button
            onClick={() => pick('STUDENT')}
            disabled={loading !== null}
            className="rounded-2xl border p-5 text-left shadow-sm hover:shadow transition bg-white hover:bg-slate-50"
          >
            <div className="text-lg font-semibold">I’m a Student</div>
            <div className="text-sm text-slate-500 mt-1">Find tutors and book sessions</div>
            <div className="mt-3 inline-flex rounded-md bg-ocean-700 px-3 py-1.5 text-white text-sm">
              {loading === 'STUDENT' ? 'Setting up…' : 'Continue as Student'}
            </div>
          </button>

          <button
            onClick={() => pick('TUTOR')}
            disabled={loading !== null}
            className="rounded-2xl border p-5 text-left shadow-sm hover:shadow transition bg-white hover:bg-slate-50"
          >
            <div className="text-lg font-semibold">I’m a Tutor</div>
            <div className="text-sm text-slate-500 mt-1">Apply and start teaching</div>
            <div className="mt-3 inline-flex rounded-md bg-ocean-700 px-3 py-1.5 text-white text-sm">
              {loading === 'TUTOR' ? 'Setting up…' : 'Continue as Tutor'}
            </div>
          </button>
        </div>
      </div>
    </main>
  );
}
