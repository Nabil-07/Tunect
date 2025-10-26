// src/layouts/DashboardLayout.tsx
import { Outlet, NavLink } from 'react-router-dom';
import Navbar from '../components/Navbar';

interface DashboardLayoutProps {
  role: 'student' | 'tutor' | 'admin';
}

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2 text-sm ${
    isActive ? 'bg-ocean-50 text-ocean-800' : 'text-slate-700 hover:text-primary'
  }`;

export default function DashboardLayout({ role }: DashboardLayoutProps) {
  // Hide sidebar for tutors and students; keep only for admin.
  const showSidebar = role === 'admin';

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6">
        {showSidebar && (
          <aside className="hidden w-64 shrink-0 rounded-2xl border bg-white p-4 md:block">
            <h2 className="mb-3 text-xl font-semibold text-primary">
              {role.charAt(0).toUpperCase() + role.slice(1)} Panel
            </h2>
            <ul className="space-y-1">
              {role === 'tutor' && (
                <>
                  {/* Removed "Dashboard" per Obs 2 */}
                  <li><NavLink to="/tutor/sessions" className={linkCls}>My Sessions</NavLink></li>
                  <li><NavLink to="/tutor/availability" className={linkCls}>Availability</NavLink></li>

                  {/* Renamed from KYC Upload → KYC per Obs 4.
                     Make sure your routes include /tutor/kyc (and optionally redirect /tutor/kyc-upload → /tutor/kyc). */}
                  <li><NavLink to="/tutor/kyc" className={linkCls}>KYC</NavLink></li>

                  <li><NavLink to="/tutor/skill-test" className={linkCls}>Skill Test</NavLink></li>
                  <li><NavLink to="/tutor/profile" className={linkCls}>Profile</NavLink></li>
                  <li><NavLink to="/tutor/messages" className={linkCls}>Messages</NavLink></li>
                </>
              )}

              {role === 'admin' && (
                <>
                  <li><NavLink to="/admin/dashboard" className={linkCls}>Dashboard</NavLink></li>
                  <li><NavLink to="/admin/tutors" className={linkCls}>Tutors</NavLink></li>
                  <li><NavLink to="/admin/students" className={linkCls}>Students</NavLink></li>
                  <li><NavLink to="/admin/kyc-verification" className={linkCls}>KYC Verification</NavLink></li>
                  <li><NavLink to="/admin/reports" className={linkCls}>Reports</NavLink></li>
                  <li><NavLink to="/admin/messages" className={linkCls}>Messages</NavLink></li>
                  <li><NavLink to="/admin/reviews" className={linkCls}>Reviews</NavLink></li>
                </>
              )}
            </ul>
          </aside>
        )}

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
