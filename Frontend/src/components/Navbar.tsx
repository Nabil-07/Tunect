// src/components/Navbar.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Menu, X, LogIn, UserPlus, ChevronDown, LogOut, User, Settings, KeyRound,
  MessageSquare, Bell,
} from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import NotificationBell from './NotificationBell';

/* ---------------- helpers ---------------- */
type RoleLower = 'student' | 'tutor' | 'admin';

function normalizeRole(r?: string): RoleLower {
  const up = String(r || '').toUpperCase();
  if (up === 'ADMIN') return 'admin';
  if (up === 'TUTOR') return 'tutor';
  return 'student';
}
function roleDashboard(role?: RoleLower) {
  if (role === 'tutor') return '/tutor/dashboard';
  if (role === 'admin') return '/admin/dashboard';
  return '/student/dashboard';
}

function roleMessages(role?: RoleLower) {
  if (role === 'tutor') return '/tutor/messages';
  if (role === 'admin') return '/admin/messages';
  return '/student/messages';
}

const roleNotifications = (role?: RoleLower) => {
  if (role === 'tutor') return '/tutor/notifications';
  if (role === 'admin') return '/admin/notifications';
  return '/student/notifications';
};

type NavItem = { label: string; to: string };

const PUBLIC_MAIN: NavItem[] = [
  { label: 'Home', to: '/' },
  { label: 'Find Tutor', to: '/find-tutors' },
  { label: 'Become a Tutor', to: '/become-tutor' },
];

const PUBLIC_EXTRA: NavItem[] = [
  { label: 'About', to: '/about' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Support', to: '/support' },
];

const STUDENT_CENTER: NavItem[] = [
  { label: 'Home', to: '/' },
  { label: 'Dashboard', to: '/student/dashboard' },
  { label: 'Find Tutor', to: '/find-tutors' },
  { label: 'Sessions', to: '/student/sessions' },
  { label: 'Bookings', to: '/student/bookings' },
];

const TUTOR_CENTER: NavItem[] = [
  { label: 'Home', to: '/' },
  { label: 'Dashboard', to: '/tutor/dashboard' },
  { label: 'Sessions', to: '/tutor/sessions' },
  { label: 'Availability', to: '/tutor/availability' },
  { label: 'Earnings', to: '/tutor/earnings' },
];

const ADMIN_SIMPLE: NavItem[] = [
  { label: 'Home', to: '/' },
  { label: 'Dashboard', to: '/admin/dashboard' },
  { label: 'Tutors', to: '/admin/tutors' },
  { label: 'Students', to: '/admin/students' },
  { label: 'Reports', to: '/admin/reports' },
];

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  const role = useMemo(() => normalizeRole(user?.role), [user?.role]);
  const isAuthed = Boolean(isAuthenticated);

  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const extraRef = useRef<HTMLDivElement | null>(null);

  const storedTutorStatus = useMemo(() => {
    try {
      return globalThis.localStorage?.getItem('tutorStatus');
    } catch {
      return null;
    }
  }, []);

  const tutorStatus = (user as any)?.tutorStatus || (user as any)?.tutor?.status || storedTutorStatus;
  const showBecomeTutorForTutor = String(tutorStatus || '').toLowerCase() === 'approved';

  const manageAccountPath = useMemo(() => {
    if (role === 'tutor') return '/tutor/manage-account';
    if (role === 'student') return '/student/manage-account';
    return '/admin/dashboard';
  }, [role]);

  const centerNav = useMemo(() => {
    if (isAuthed) {
      if (role === 'student') return STUDENT_CENTER;
      if (role === 'tutor') return TUTOR_CENTER;
      return ADMIN_SIMPLE;
    }
    return PUBLIC_MAIN;
  }, [isAuthed, role]);

  // housekeeping
  useEffect(() => { setOpen(false); setMenuOpen(false); setExtraOpen(false); }, [location.pathname]);
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (extraOpen && extraRef.current && !extraRef.current.contains(e.target as Node)) setExtraOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen, extraOpen]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setExtraOpen(false);
        setShowLogoutModal(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /* DISPLAY NAME */
  // Helper to check if email looks encrypted (long base64 string without @)
  const isEmailEncrypted = (email: string | null | undefined): boolean => {
    if (!email) return false;
    return email.length > 50 && !email.toLowerCase().includes('@');
  };

  // Get display name: prefer name, then email (if not encrypted), then fallback
  const getDisplayName = (): string => {
    if (user?.name) return user.name;
    if (user?.email && !isEmailEncrypted(user.email)) {
      return user.email.split('@')[0];
    }
    return 'User';
  };

  const displayName = getDisplayName();
  const avatarSeed = displayName || 'U';
  const avatarUrl =
    user?.avatarUrl ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(avatarSeed)}`;

  const handleLogout = useCallback(() => {
    try {
      logout?.();
    } finally {
      setMenuOpen(false);
      setExtraOpen(false);
      setShowLogoutModal(false);
      nav('/login');
    }
  }, [logout, nav]);

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b border-slate-100">
      <nav className="container mx-auto max-w-7xl px-3 sm:px-4 md:px-6 flex h-16 items-center gap-4">
        {/* Brand with real logo */}
        <button
          type="button"
          onClick={() => nav(isAuthed ? roleDashboard(role) : '/')}
          className="flex items-center gap-2"
          aria-label="Go to home"
        >
          <img
            src="/tunect_logo_hd.png"
            alt="Tunect Logo"
            className="h-10 w-auto object-contain"
          />
        </button>

        {/* CENTER menus */}
        <div className="flex-1 flex justify-center overflow-visible">
          <div className="hidden md:flex items-center gap-1 flex-wrap">
            {centerNav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-xl text-sm font-medium transition ${
                    isActive ? 'text-ocean-800 bg-ocean-50' : 'text-slate-600 hover:text-ink'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}

            {/* Public "More" dropdown (About, Pricing, Support) */}
            {isAuthed ? null : (
              <div className="relative" ref={extraRef}>
                <button
                  type="button"
                  onClick={() => setExtraOpen((v) => !v)}
                  className="ml-1 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:text-ink hover:bg-slate-50 inline-flex items-center gap-1"
                >
                  More <ChevronDown size={16} className="text-slate-500" />
                </button>
                {extraOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-none border border-slate-200 bg-white shadow-md p-0 z-50 overflow-hidden">
                    {PUBLIC_EXTRA.map((n) => (
                      <Link
                        key={n.to}
                        to={n.to}
                        className="block px-4 py-2 text-sm hover:bg-slate-100 transition-colors"
                        onClick={() => setExtraOpen(false)}
                      >
                        {n.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Student More dropdown */}
            {isAuthed && role === 'student' && (
              <div className="relative" ref={extraRef}>
                <button
                  type="button"
                  onClick={() => setExtraOpen((v) => !v)}
                  className="ml-1 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:text-ink hover:bg-slate-50 inline-flex items-center gap-1"
                >
                  More <ChevronDown size={16} className="text-slate-500" />
                </button>
                {extraOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg p-2 z-50">
                    <Link to="/support" className="block px-3 py-2 text-sm rounded-lg hover:bg-slate-100 transition-colors" onClick={() => setExtraOpen(false)}>Support</Link>
                    <Link to="/about" className="block px-3 py-2 text-sm rounded-lg hover:bg-slate-100 transition-colors" onClick={() => setExtraOpen(false)}>About</Link>
                    <Link to="/student/favorites" className="block px-3 py-2 text-sm rounded-lg hover:bg-slate-100 transition-colors" onClick={() => setExtraOpen(false)}>Favorites</Link>
                    <Link to="/student/reviews" className="block px-3 py-2 text-sm rounded-lg hover:bg-slate-100 transition-colors" onClick={() => setExtraOpen(false)}>Reviews</Link>
                    <Link to="/student/transactions" className="block px-3 py-2 text-sm rounded-lg hover:bg-slate-100 transition-colors" onClick={() => setExtraOpen(false)}>Transactions</Link>
                  </div>
                )}
              </div>
            )}

            {/* Tutor More dropdown */}
            {isAuthed && role === 'tutor' && (
              <div className="relative" ref={extraRef}>
                <button
                  type="button"
                  onClick={() => setExtraOpen((v) => !v)}
                  className="ml-1 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:text-ink hover:bg-slate-50 inline-flex items-center gap-1"
                >
                  More <ChevronDown size={16} className="text-slate-500" />
                </button>
                {extraOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg p-2 z-50">
                    <Link to="/tutor/kyc" className="block px-3 py-2 text-sm rounded-lg hover:bg-slate-100 transition-colors" onClick={() => setExtraOpen(false)}>KYC Status</Link>
                    <Link to="/tutor/recurring-templates" className="block px-3 py-2 text-sm rounded-lg hover:bg-slate-100 transition-colors" onClick={() => setExtraOpen(false)}>Recurring Templates</Link>
                    <Link to="/find-tutors" className="block px-3 py-2 text-sm rounded-lg hover:bg-slate-100 transition-colors" onClick={() => setExtraOpen(false)}>Find Tutor</Link>
                    <Link to="/become-tutor" className="block px-3 py-2 text-sm rounded-lg hover:bg-slate-100 transition-colors" onClick={() => setExtraOpen(false)}>Become a Tutor</Link>
                    <Link to="/support" className="block px-3 py-2 text-sm rounded-lg hover:bg-slate-100 transition-colors" onClick={() => setExtraOpen(false)}>Support</Link>
                  </div>
                )}
              </div>
            )}

            {/* Admin More dropdown */}
            {isAuthed && role === 'admin' && (
              <div className="relative" ref={extraRef}>
                <button
                  type="button"
                  onClick={() => setExtraOpen((v) => !v)}
                  className="ml-1 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:text-ink hover:bg-slate-50 inline-flex items-center gap-1"
                >
                  More <ChevronDown size={16} className="text-slate-500" />
                </button>
                {extraOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg p-2 z-50">
                    <Link to="/admin/kyc-verification" className="block px-3 py-2 text-sm rounded-lg hover:bg-slate-100 transition-colors" onClick={() => setExtraOpen(false)}>KYC Verification</Link>
                    <Link to="/admin/reports" className="block px-3 py-2 text-sm rounded-lg hover:bg-slate-100 transition-colors" onClick={() => setExtraOpen(false)}>Reports</Link>
                    <Link to="/admin/reviews" className="block px-3 py-2 text-sm rounded-lg hover:bg-slate-100 transition-colors" onClick={() => setExtraOpen(false)}>Reviews</Link>
                    <Link to="/admin/blogs" className="block px-3 py-2 text-sm rounded-lg hover:bg-slate-100 transition-colors" onClick={() => setExtraOpen(false)}>Blogs</Link>
                    <Link to="/admin/finance" className="block px-3 py-2 text-sm rounded-lg hover:bg-slate-100 transition-colors" onClick={() => setExtraOpen(false)}>Finance</Link>
                    <Link to="/admin/analytics" className="block px-3 py-2 text-sm rounded-lg hover:bg-slate-100 transition-colors" onClick={() => setExtraOpen(false)}>Analytics</Link>
                    <Link to="/admin/policy-config" className="block px-3 py-2 text-sm rounded-lg hover:bg-slate-100 transition-colors" onClick={() => setExtraOpen(false)}>Policy Config</Link>
                    <div className="my-1 border-t border-slate-100" />
                    <Link to="/admin/controls" className="block px-3 py-2 text-sm rounded-lg hover:bg-indigo-50 text-indigo-700 font-medium transition-colors" onClick={() => setExtraOpen(false)}>⚙ Admin Controls</Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT actions */}
        <div className="hidden md:flex items-center gap-4">
          {isAuthed && (
            <>
              <Link
                to={roleMessages(role)}
                className="inline-flex items-center justify-center rounded-xl p-2 hover:bg-slate-100"
                aria-label="Open messages"
                title="Messages"
              >
                <MessageSquare className="h-5 w-5 text-slate-700" />
              </Link>

              <div className="inline-flex items-center justify-center rounded-xl hover:bg-slate-100">
                <NotificationBell />
              </div>
            </>
          )}
          {isAuthed ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen((v) => !v); }}
                className="inline-flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Open user menu"
              >
                <img src={avatarUrl} alt="avatar" className="w-8 h-8 rounded-xl object-cover" />
                <span className="text-sm font-medium hidden lg:inline max-w-[12rem] truncate">{displayName}</span>
                <ChevronDown size={16} className="text-slate-500" />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-100 bg-white shadow-soft p-2 z-50"
                >
                  <Link
                    to={roleDashboard(role)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-slate-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span className="inline-block w-4" />
                    <span>Dashboard</span>
                  </Link>
                  <Link
                    to={role === 'tutor' ? '/tutor/profile' : '/student/profile'}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-slate-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    <User size={16} />
                    <span>Edit details</span>
                  </Link>
                  <Link
                    to={manageAccountPath}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-slate-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Settings size={16} />
                    <span>Manage account</span>
                  </Link>
                  <Link
                    to="/account/security"
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-slate-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    <KeyRound size={16} />
                    <span>Password &amp; security</span>
                  </Link>
                  
                  <hr className="my-2 border-slate-100" />
                  <button
                    type="button"
                    onClick={() => {
                      setShowLogoutModal(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut size={16} />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-ink">
                Login
              </Link>
              <Link to="/signup" className="text-sm font-medium text-ocean-600 hover:text-ocean-800">
                Sign Up
              </Link>
            </>
          )}
        </div>

        {/* Mobile trigger */}
        <button
          className="md:hidden ml-auto p-2 rounded-xl hover:bg-slate-100"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X /> : <Menu />}
        </button>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden border-t border-slate-100 bg-white">
          <div className="container mx-auto max-w-7xl px-3 sm:px-4 md:px-6 py-2 flex flex-col gap-1">
            {isAuthed && (
              <div className="flex items-center gap-2 px-3 py-2">
                <NavLink
                  to={roleMessages(role)}
                  className="btn-ghost inline-flex items-center gap-2"
                  onClick={() => setOpen(false)}
                  aria-label="Open messages"
                >
                  <MessageSquare className="h-5 w-5" />
                  <span>Messages</span>
                </NavLink>

                <NavLink
                  to={roleNotifications(role)}
                  className="btn-ghost inline-flex items-center gap-2"
                  onClick={() => setOpen(false)}
                  aria-label="Open notifications"
                >
                  <Bell className="h-5 w-5" />
                  <span>Notifications</span>
                </NavLink>
              </div>
            )}

            {centerNav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `block px-3 py-2 rounded-xl text-sm font-medium ${
                    isActive ? 'text-ocean-800 bg-ocean-50' : 'text-slate-700 hover:bg-slate-50'
                  }`
                }
                onClick={() => setOpen(false)}
              >
                {n.label}
              </NavLink>
            ))}

            {/* Public Extra on mobile */}
            {isAuthed ? null : (
              <>
                <hr className="my-2" />
                <div className="text-xs font-semibold text-slate-500 px-3 mb-1">Extra</div>
                {PUBLIC_EXTRA.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    className="btn-ghost"
                    onClick={() => setOpen(false)}
                  >
                    {n.label}
                  </NavLink>
                ))}
              </>
            )}

            {/* Tutor Extra on mobile */}
            {isAuthed && role === 'tutor' && (
              <>
                <hr className="my-2" />
                <div className="text-xs font-semibold text-slate-500 px-3 mb-1">Extra</div>
                <NavLink to="/tutor/profile" className="btn-ghost" onClick={() => setOpen(false)}>Profile</NavLink>
                <NavLink to="/find-tutors" className="btn-ghost" onClick={() => setOpen(false)}>Find Tutor</NavLink>
                <NavLink to="/become-tutor" className="btn-ghost" onClick={() => setOpen(false)}>
                  Become a Tutor {showBecomeTutorForTutor ? '' : '(KYC)'}
                </NavLink>
                <NavLink to="/support" className="btn-ghost" onClick={() => setOpen(false)}>Support</NavLink>
                <NavLink to="/tutor/earnings" className="btn-ghost" onClick={() => setOpen(false)}>Total earnings</NavLink>
              </>
            )}

            {/* Student Extra on mobile */}
            {isAuthed && role === 'student' && (
              <>
                <hr className="my-2" />
                <div className="text-xs font-semibold text-slate-500 px-3 mb-1">Extra</div>
                <NavLink to="/support" className="btn-ghost" onClick={() => setOpen(false)}>Support</NavLink>
                <NavLink to="/about" className="btn-ghost" onClick={() => setOpen(false)}>About</NavLink>
                <NavLink to="/student/favorites" className="btn-ghost" onClick={() => setOpen(false)}>Favorites</NavLink>
                <NavLink to="/student/reviews" className="btn-ghost" onClick={() => setOpen(false)}>Reviews</NavLink>
                <NavLink to="/student/transactions" className="btn-ghost" onClick={() => setOpen(false)}>Transactions</NavLink>
              </>
            )}

            {/* Admin Extra on mobile */}
            {isAuthed && role === 'admin' && (
              <>
                <hr className="my-2" />
                <div className="text-xs font-semibold text-slate-500 px-3 mb-1">Admin Tools</div>
                <NavLink to="/admin/kyc-verification" className="btn-ghost" onClick={() => setOpen(false)}>KYC Verification</NavLink>
                <NavLink to="/admin/reviews" className="btn-ghost" onClick={() => setOpen(false)}>Reviews</NavLink>
                <NavLink to="/admin/blogs" className="btn-ghost" onClick={() => setOpen(false)}>Blogs</NavLink>
                <NavLink to="/admin/finance" className="btn-ghost" onClick={() => setOpen(false)}>Finance</NavLink>
                <NavLink to="/admin/analytics" className="btn-ghost" onClick={() => setOpen(false)}>Analytics</NavLink>
                <NavLink to="/admin/policy-config" className="btn-ghost" onClick={() => setOpen(false)}>Policy Config</NavLink>
                <NavLink to="/admin/controls" className="btn-ghost font-semibold text-indigo-700" onClick={() => setOpen(false)}>⚙ Admin Controls</NavLink>
              </>
            )}

            <hr className="my-2" />

            {isAuthed ? (
              <button
                type="button"
                onClick={() => { 
                  setShowLogoutModal(true); 
                  setOpen(false); 
                }}
                className="mt-2 inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-red-600 hover:bg-red-50"
              >
                <LogOut size={18} /> Logout
              </button>
            ) : (
              <div className="flex gap-2">
                <Link to="/login" className="btn-ghost flex-1" onClick={() => setOpen(false)}>
                  <LogIn size={18} /> Login
                </Link>
                <Link to="/signup" className="btn-accent flex-1" onClick={() => setOpen(false)}>
                  <UserPlus size={18} /> Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm min-h-screen"
        >
          <button
            type="button"
            aria-label="Close logout dialog"
            className="absolute inset-0 cursor-default"
            onClick={() => setShowLogoutModal(false)}
          />
          <dialog
            open
            className="relative z-[101] bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 animate-in fade-in zoom-in duration-200"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <LogOut className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">
                Sign out of your account?
              </h3>
            </div>
            <p className="text-sm text-gray-600 mb-6 ml-15">
              You will be redirected to the login page. You can sign back in anytime.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors shadow-sm"
              >
                Sign out
              </button>
            </div>
          </dialog>
        </div>
      )}
    </header>
  );
}
