import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import api, {
  writeToken,
  writeRefreshToken,
  setAuthHeader,
  setAuthStorage,
} from '../lib/apiClient';

type RoleApi = 'STUDENT' | 'TUTOR' | 'ADMIN';

const targetFor = (role: RoleApi | null) =>
  role === 'ADMIN' ? '/admin/dashboard'
  : role === 'TUTOR' ? '/tutor/dashboard'
  : role === 'STUDENT' ? '/student/dashboard'
  : '/choose-role';

function isFresh(ts?: string | Date | null, ms = 2 * 60 * 1000) {
  if (!ts) return false;
  const t = typeof ts === 'string' ? Date.parse(ts) : (ts as Date).getTime?.() ?? NaN;
  return Number.isFinite(t) && (Date.now() - t) < ms;
}

function safeNext(s: string | null) {
  return s && s.startsWith('/') && !s.startsWith('//') ? s : null;
}

/**
 * Refactored auth callback.
 * - Keeps all original behavior and storage/events intact.
 * - Extracts logical sections for readability.
 */
export default function AuthCallback() {
  const { search } = useLocation();

  useEffect(() => {
    (async () => {
      try {
        // ---- parse params and flags ----
        const params = new URLSearchParams(search);
        const access   = params.get('access');
        const refresh  = params.get('refresh');
        const nextQ    = safeNext(params.get('next'));
        const remember = params.get('remember') === '1'
          || localStorage.getItem('remember_intent') === '1';

        // ---- protective pre-clean ----
        try { localStorage.removeItem('role'); } catch {}

        // ---- remember-me / storage selection ----
        try {
          setAuthStorage(remember);
          localStorage.removeItem('remember_intent');
        } catch {}

        // ---- tokens ----
        if (access) {
          writeToken(access);
          setAuthHeader(access);
        }
        if (refresh) writeRefreshToken(refresh);

        // ---- hydrate current user ----
        const me = await api.get('/users/me').then(r => r.data).catch(() => null);
        if (!me) { window.location.replace('/choose-role'); return; }

        const hasStudent = !!me?.student?.id;
        const hasTutor   = !!me?.tutor?.id;

        try {
          localStorage.setItem('has_student_profile', hasStudent ? '1' : '0');
          localStorage.setItem('has_tutor_profile',   hasTutor   ? '1' : '0');
        } catch {}

        // ---- detect brand-new / auto-provisioned cases ----
        const apiRole = String(me?.role || '').toUpperCase() as RoleApi | '';
        const freshUser    = isFresh(me?.createdAt || me?.user?.createdAt);
        const freshStudent = isFresh(me?.student?.createdAt);
        const looksAutoStu = hasStudent && !hasTutor && freshUser && freshStudent;

        const mustChoosePersona =
          // brand new user with no profiles
          ((!hasStudent && !hasTutor && freshUser)
          // looks like DB auto-provisioned a student profile only
          || looksAutoStu
          // explicit intent
          || nextQ === '/choose-role');

        if (mustChoosePersona) {
          try { localStorage.removeItem('role'); } catch {}
          try { localStorage.setItem('auth_ok', '1'); } catch {}
          window.location.replace('/choose-role');
          return;
        }

        // ---- determine effective role (only when persona exists; ADMIN always wins) ----
        let effective: RoleApi | null =
          apiRole === 'ADMIN' ? 'ADMIN'
          : (apiRole === 'TUTOR' && hasTutor) ? 'TUTOR'
          : (apiRole === 'STUDENT' && hasStudent) ? 'STUDENT'
          : hasTutor ? 'TUTOR'
          : hasStudent ? 'STUDENT'
          : null;

        if (effective) {
          try { localStorage.setItem('role', effective); } catch {}
        } else {
          try { localStorage.removeItem('role'); } catch {}
        }

        // ---- notify app and finalize routing ----
        try { localStorage.setItem('auth_ok', '1'); } catch {}
        try { window.dispatchEvent(new Event('auth:login')); } catch {}

        // only allow nextQ when it is explicitly permitted by available personas/admin
        const isAllowedNext = (() => {
          if (!nextQ) return false;
          if (nextQ === '/choose-role') return true;
          if (nextQ.startsWith('/admin')) return effective === 'ADMIN';
          if (nextQ.startsWith('/student')) return hasStudent;
          if (nextQ.startsWith('/tutor')) return hasTutor;
          return false;
        })();

        const dest = isAllowedNext ? nextQ : targetFor(effective);
        window.location.replace(dest || '/choose-role');
      } catch {
        window.location.replace('/choose-role');
      }
    })();
  }, [search]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center text-slate-600">
      Finishing sign-in…
    </div>
  );
}