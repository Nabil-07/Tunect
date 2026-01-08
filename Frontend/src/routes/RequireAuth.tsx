import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function roleDashboard(role: 'student' | 'tutor' | 'admin') {
  if (role === 'tutor') return '/tutor/dashboard';
  if (role === 'admin') return '/admin/dashboard';
  return '/student/dashboard';
}

export default function RequireAuth({
  children,
  role, // optional: 'student' | 'tutor' | 'admin'
}: {
  children: React.ReactNode;
  role?: 'student' | 'tutor' | 'admin';
}) {
  const { user, loading } = useAuth();
  const token =
    localStorage.getItem('accessToken') || localStorage.getItem('token');

  const normalizedRole = (user?.role ?? '').toLowerCase();
  const isKnownRole = normalizedRole === 'student' || normalizedRole === 'tutor' || normalizedRole === 'admin';
  const safeRole: 'student' | 'tutor' | 'admin' = isKnownRole ? (normalizedRole as 'student' | 'tutor' | 'admin') : 'student';

  if (loading) return null; // or a spinner
  if (!token) return <Navigate to="/login" replace />;

  if (role && user && safeRole !== role) {
    return <Navigate to={roleDashboard(safeRole)} replace />;
  }
  return <>{children}</>;
}
