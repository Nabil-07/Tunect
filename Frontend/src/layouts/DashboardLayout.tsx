// src/layouts/DashboardLayout.tsx
import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ChatWidget from '../components/ChatWidget';

interface DashboardLayoutProps {
  role: 'student' | 'tutor' | 'admin';
}

export default function DashboardLayout({ role }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50" data-role={role} data-testid={`dashboard-layout-${role}`}>
      <Navbar />

      <div className="mx-auto w-full max-w-7xl px-4 py-6">
        <main className="min-w-0 flex-1" data-testid="dashboard-content">
          <Outlet />
        </main>
      </div>

      <ChatWidget />
    </div>
  );
}
