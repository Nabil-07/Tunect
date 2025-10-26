// src/components/ProtectedRoute.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { readToken } from '../lib/apiClient'; // if not exported, expose it

export default function ProtectedRoute() {
  const token = readToken();
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}
