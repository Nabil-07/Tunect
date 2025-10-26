import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { readToken, setAuthHeader } from '../lib/apiClient';

type RoleApi = 'STUDENT' | 'TUTOR' | 'ADMIN';

const targetFor = (role: RoleApi) =>
  role === 'ADMIN' ? '/admin/dashboard'
  : role === 'TUTOR' ? '/tutor/dashboard'
  : '/student/dashboard';

export default function ChooseRole() {
  const [loading, setLoading] = useState<'STUDENT' | 'TUTOR' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();
  const hasNavigated = useRef(false);

  const token = readToken();

  useEffect(() => {
    if (!token || hasNavigated.current) return;

    setAuthHeader(token);
    const localRole = localStorage.getItem('role')?.toUpperCase() as RoleApi;

    if (['ADMIN', 'TUTOR', 'STUDENT'].includes(localRole)) {
      hasNavigated.current = true;
      navigate(targetFor(localRole), { replace: true });
      return;
    }

    (async () => {
      try {
        const me = await api.get('/users/me').then(r => r.data);
        const role = me?.role?.toUpperCase?.() as RoleApi | undefined;
        const hasStudent = !!me?.student?.id;
        const hasTutor = !!me?.tutor?.id;

        if (role) localStorage.setItem('role', role);
        localStorage.setItem('has_student_profile', hasStudent ? '1' : '0');
        localStorage.setItem('has_tutor_profile', hasTutor ? '1' : '0');

        if (me?.hasChosenRole === false) {
          return; // stay on chooser
        }

        const next = role ? targetFor(role)
          : hasStudent ? '/student/dashboard'
          : hasTutor ? '/tutor/dashboard'
          : null;

        if (next && !hasNavigated.current) {
          hasNavigated.current = true;
          navigate(next, { replace: true });
        }

      } catch (e) {
        console.error("Failed to fetch user info", e);
      }
    })();
  }, [navigate, token]);

  async function postChooseRole(role: 'STUDENT' | 'TUTOR') {
    try {
      return await api.post('/profiles/choose-role', { role });
    } catch (e: any) {
      if (e?.response?.status === 404 || e?.response?.status === 405) {
        return await api.post('/auth/choose-role', { role });
      }
      throw e;
    }
  }

  async function pick(role: 'STUDENT' | 'TUTOR') {
    setErr(null);
    setLoading(role);

    try {
      await postChooseRole(role);
      const me = await api.get('/users/me').then(r => r.data);
      const roleUpdated = me?.role?.toUpperCase?.() as RoleApi | undefined;
      const hasStudent = !!me?.student?.id;
      const hasTutor = !!me?.tutor?.id;

      if (roleUpdated) localStorage.setItem('role', roleUpdated);
      localStorage.setItem('has_student_profile', hasStudent ? '1' : '0');
      localStorage.setItem('has_tutor_profile', hasTutor ? '1' : '0');

      const next = roleUpdated ? targetFor(roleUpdated) : targetFor(role);

      if (!hasNavigated.current) {
        hasNavigated.current = true;
        navigate(next, { replace: true });
      }
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Something went wrong.');
      setLoading(null);
    }
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
