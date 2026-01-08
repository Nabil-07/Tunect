// src/layouts/DashboardLayout.tsx
import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar';

interface DashboardLayoutProps {
  role: 'student' | 'tutor' | 'admin';
}

export default function DashboardLayout({ role }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50" data-role={role}>
      <Navbar />

      <div className="mx-auto w-full max-w-7xl px-4 py-6">
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
