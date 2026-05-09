// src/App.tsx
import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import MainLayout from './layouts/MainLayout';
import DashboardLayout from './layouts/DashboardLayout';
import { setAuthHeader, readToken } from './lib/apiClient';
import { ToastProvider } from './contexts/ToastContext';
import { useAuth } from './contexts/AuthContext';
import InternalOnly from './pages/InternalOnly';
import MaintenanceModal from './components/MaintenanceModal';

function Spinner() {
  return (
    <div className="w-full h-[50vh] flex items-center justify-center text-slate-600">
      Loading…
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

type RoleApi = 'STUDENT' | 'TUTOR' | 'ADMIN';

const getStoredRoleUpper = (): RoleApi | null => {
  const r = localStorage.getItem('role');
  return r ? (r.toUpperCase() as RoleApi) : null;
};

function ProtectedRoute({ children }: Readonly<{ children: React.ReactNode }>) {
  const { user, loading } = useAuth();
  const token = readToken();
  
  // Wait for auth to finish loading before making decisions
  if (loading) {
    return <div className="w-full h-[50vh] flex items-center justify-center text-slate-600">Loading...</div>;
  }
  
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Token exists but user is not yet resolved: wait for AuthContext revalidation
  if (!user) {
    return <div className="w-full h-[50vh] flex items-center justify-center text-slate-600">Restoring session...</div>;
  }
  
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: Readonly<{ children: React.ReactNode }>) {
  const { user, loading } = useAuth();
  const token = readToken();
  
  // Wait for auth to finish loading before making decisions
  if (loading) {
    return <div className="w-full h-[50vh] flex items-center justify-center text-slate-600">Loading...</div>;
  }
  
  // If not authenticated, show the public page
  if (!token) {
    return <>{children}</>;
  }

  if (!user) {
    return <div className="w-full h-[50vh] flex items-center justify-center text-slate-600">Restoring session...</div>;
  }
  
  // If authenticated, redirect to dashboard based on role
  const role = user?.role?.toUpperCase() || getStoredRoleUpper();
  if (!role) {
    return <Navigate to="/choose-role" replace />;
  }
  
  let target = '/student/dashboard';
  if (role === 'ADMIN') target = '/admin/dashboard';
  else if (role === 'TUTOR') target = '/tutor/dashboard';
  
  return <Navigate to={target} replace />;
}

// ✅ RoleRoute
function RoleRoute({
  role: requiredLower,
  children,
}: Readonly<{
  role: 'student' | 'tutor' | 'admin';
  children: React.ReactNode;
}>) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const token = readToken();

  // Get role from JWT token (most authoritative source) and fall back to stored role
  const role = (user?.role?.toUpperCase() as RoleApi | undefined) ?? getStoredRoleUpper();

  // While auth is hydrating, avoid redirect loops
  if (loading) {
    return (
      <div className="w-full h-[50vh] flex items-center justify-center text-slate-600">
        Loading…
      </div>
    );
  }

  if (token && !user) {
    return (
      <div className="w-full h-[50vh] flex items-center justify-center text-slate-600">
        Restoring session...
      </div>
    );
  }

  if (!role) {
    if (location.pathname !== '/choose-role') {
      return <Navigate to="/choose-role" replace />;
    }
    return <>{children}</>;
  }

  const requiredUpper = requiredLower.toUpperCase() as RoleApi;
  if (role !== requiredUpper) {
    if (role === 'ADMIN') return <Navigate to="/admin/dashboard" replace />;
    if (role === 'TUTOR') return <Navigate to="/tutor/dashboard" replace />;
    return <Navigate to="/student/dashboard" replace />;
  }

  return <>{children}</>;
}

/** Public Pages */
import Login from './pages/login';
import Signup from './pages/signup';

const HomePage = lazy(() => import('./pages/index'));
const Pricing = lazy(() => import('./pages/pricing'));
const HowItWorks = lazy(() => import('./pages/how-it-works'));
const FindTutors = lazy(() => import('./pages/find-tutors'));
const TrendingTutors = lazy(() => import('./pages/trending-tutors'));
const BecomeTutor = lazy(() => import('./pages/become-tutor'));
const TutorPublicProfile = lazy(() => import('./pages/tutor/public-profile'));
const TutorRedirect = lazy(() => import('./components/TutorRedirect'));

const About = lazy(() => import('./pages/about'));
const Privacy = lazy(() => import('./pages/privacy'));
const Terms = lazy(() => import('./pages/terms'));
const Blogs = lazy(() => import('./pages/blogs'));
const BlogPost = lazy(() => import('./pages/blog-post'));

/** SEO Subject Landing Pages */
const SubjectLandingPage = lazy(() => import('./pages/SubjectLandingRouter'));

const ForgotPassword = lazy(() => import('./pages/forgot-password'));
const ResetPassword = ForgotPassword;

const AuthCallback = lazy(() => import('./pages/auth-callback'));
const VerifyEmail = lazy(() => import('./pages/verify-email'));
const AccountSecurity = lazy(() => import('./pages/account/security'));

/** Student */
const StudentDashboard = lazy(() => import('./pages/student/dashboard'));
const StudentProfile = lazy(() => import('./pages/student/profile'));
const StudentBookings = lazy(() => import('./pages/student/bookings'));
const StudentSessions = lazy(() => import('./pages/student/sessions'));
const StudentChat = lazy(() => import('./pages/student/chat'));
const StudentNotifications = lazy(() => import('./pages/student/notifications'));
const StudentFavorites = lazy(() => import('./pages/student/favorites'));
const StudentProgress = lazy(() => import('./pages/student/progress'));
const StudentGoals = lazy(() => import('./pages/student/goals'));
const SessionNotes = lazy(() => import('./pages/student/session-notes'));
const StudentCertificates = lazy(() => import('./pages/student/certificates'));
const ReviewSession = lazy(() => import('./pages/student/review-session'));
const StudentReviews = lazy(() => import('./pages/student/reviews'));
const Cart = lazy(() => import('./pages/student/cart'));
const StudentWaitlist = lazy(() => import('./pages/student/waitlist'));
const DemoCheckout = lazy(() => import('./pages/student/checkout')); // FREE demo checkout (existing)
const StudentCheckoutPaid = lazy(() => import('./pages/student/checkout-paid')); // NEW paid checkout
const PaymentSuccess = lazy(() => import('./pages/student/payment-success'));    // NEW
const PaymentFailure = lazy(() => import('./pages/student/payment-failure'));    // NEW
const TokenBalance = lazy(() => import('./pages/student/token-balance'));        // NEW
const StudentTransactions = lazy(() => import('./pages/student/transactions'));  // NEW
const StudentAssignments = lazy(() => import('./pages/student/assignments'));
/** Phase 4: Student Features */
const StudentManageAccount = lazy(() => import('./pages/student/manage-account'));
const ClassPage = lazy(() => import('./pages/class'));
const CallPage = lazy(() => import('./pages/call'));
const WhiteboardPage = lazy(() => import('./pages/whiteboard'));
const SupportPage = lazy(() => import('./pages/support'));

/** Tutor */
const TutorDashboard = lazy(() => import('./pages/tutor/dashboard'));
const TutorProfile = lazy(() => import('./pages/tutor/profile'));
const Kyc = lazy(() => import('./pages/tutor/kyc'));
const Availability = lazy(() => import('./pages/tutor/availability'));
const SkillTest = lazy(() => import('./pages/tutor/skill-test'));
const TutorSessions = lazy(() => import('./pages/tutor/sessions'));
const TutorChat = lazy(() => import('./pages/tutor/chat'));
const TutorEarnings = lazy(() => import('./pages/tutor/earnings'));
const ContentLibrary = lazy(() => import('./pages/tutor/content-library'));
const RecurringTemplates = lazy(() => import('./pages/tutor/recurring-templates'));
const PerformanceTracking = lazy(() => import('./pages/tutor/performance-tracking'));
const TutorNotifications = lazy(() => import('./pages/tutor/notifications'));
const TutorAssignments = lazy(() => import('./pages/tutor/assignments'));
/** Phase 4: Tutor Features */
const TutorManageAccount = lazy(() => import('./pages/tutor/manage-account'));

/** Admin */
const AdminDashboard = lazy(() => import('./pages/admin/dashboard'));
const TutorList = lazy(() => import('./pages/admin/tutors'));
const TutorDetail = lazy(() => import('./pages/admin/tutor-detail'));
const StudentList = lazy(() => import('./pages/admin/students'));
const StudentDetail = lazy(() => import('./pages/admin/student-detail'));
const KycVerification = lazy(() => import('./pages/admin/kyc-verification'));
const AdminReports = lazy(() => import('./pages/admin/reports'));
const AdminMessages = lazy(() => import('./pages/admin/messages'));
const AdminReviews = lazy(() => import('./pages/admin/reviews'));
const AdminFinanceRecon = lazy(() => import('./pages/admin/finance/Recon'));
const AdminAnalytics = lazy(() => import('./pages/admin/analytics'));
const AdminFinance = lazy(() => import('./pages/admin/finance'));
const AdminFinancePayments = lazy(() => import('./pages/admin/finance/payments'));
const AdminPayoutDashboard = lazy(() => import('./pages/admin/finance/PayoutDashboard'));
const AdminExpenseTracker = lazy(() => import('./pages/admin/finance/expenses'));
const AdminBalanceSheet = lazy(() => import('./pages/admin/finance/balance-sheet'));
const AdminRevenue = lazy(() => import('./pages/admin/revenue'));
const AdminBlogs = lazy(() => import('./pages/admin/blogs'));
const AdminRefundRequests = lazy(() => import('./pages/admin/refund-requests'));
const AdminAudit = lazy(() => import('./pages/admin/audit'));
const AdminPolicyConfig = lazy(() => import('./pages/admin/policy-config'));
const AdminControlsPage = lazy(() => import('./pages/admin/admin-controls'));
const AdminManagement = lazy(() => import('./pages/admin/admins'));
const AdminBookings = lazy(() => import('./pages/admin/bookings'));
const AdminNotifications = lazy(() => import('./pages/admin/notifications'));
const AdminOffersPacksPage = lazy(() => import('./pages/admin/offers-packs'));

/** Role chooser */
const ChooseRole = lazy(() => import('./pages/choose-role'));

const NotFound = () => (
  <div className="container mx-auto px-4 py-16 text-center">
    <h1 className="text-2xl font-semibold">404 — Page not found</h1>
    <p className="mt-2 text-slate-600">The page you’re looking for doesn’t exist.</p>
  </div>
);

function App() {
  const navigate = useNavigate();
  const hasNavigatedRef = useRef(false);
  const { user, loading } = useAuth();
  const location = useLocation();

  const env = (import.meta.env.VITE_ENV || '').toString().toLowerCase();
  const internalOnlyFlag = (import.meta.env.VITE_INTERNAL_ONLY || 'false').toString().toLowerCase() === 'true';
  const isPreprod = env === 'preprod' && internalOnlyFlag;

  const authPaths = new Set(['/login', '/forgot-password', '/reset-password', '/auth/callback']);

  useEffect(() => {
    setAuthHeader(readToken() || null);
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      hasNavigatedRef.current = false;
      navigate('/login', { replace: true });
    };

    const onLogin = () => {
      if (hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;

      const role = getStoredRoleUpper();
      if (!role) {
        navigate('/choose-role', { replace: true });
        return;
      }

      let target = '/student/dashboard';
      if (role === 'ADMIN') target = '/admin/dashboard';
      else if (role === 'TUTOR') target = '/tutor/dashboard';

      if (globalThis.location?.pathname !== target) {
        navigate(target, { replace: true });
      }
    };

    globalThis.addEventListener('auth:unauthorized', onUnauthorized);
    globalThis.addEventListener('auth:login', onLogin);
    return () => {
      globalThis.removeEventListener('auth:unauthorized', onUnauthorized);
      globalThis.removeEventListener('auth:login', onLogin);
    };
  }, [navigate]);

  // Hard gate preprod to internal users only
  if (isPreprod) {
    if (loading) {
      return <div className="w-full h-[50vh] flex items-center justify-center text-slate-600">Loading…</div>;
    }

    const path = location?.pathname || '/';
    const isAuthPath = authPaths.has(path);

    if (!user && !isAuthPath) {
      return <InternalOnly />;
    }

    // Check if user email is internal
    // Note: Email might be encrypted in API response (for PII protection)
    // Backend PreprodInternalGuard already validates email access before allowing authentication
    // So if user exists and is authenticated, they passed backend validation - trust it
    if (user?.email) {
      const emailLower = (user.email || '').toLowerCase();
      const isInternalEmail = emailLower.endsWith('@tunectnow.com');
      // If email looks encrypted (long base64 string without @), backend already validated - allow access
      const looksEncrypted = user.email.length > 50 && !emailLower.includes('@');
      
      // Only block if email is plain text and not internal domain
      // If encrypted, trust backend validation (PreprodInternalGuard already checked)
      if (!isInternalEmail && !looksEncrypted) {
        return <InternalOnly />;
      }
    }
  }

  return (
    <Suspense fallback={<Spinner />}>
      <ScrollToTop />
      <MaintenanceModal />
      <Routes>
        {/* Public Pages */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
          <Route path="/signup" element={<PublicOnlyRoute><Signup /></PublicOnlyRoute>} />
          <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPassword /></PublicOnlyRoute>} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/auth/verify-email" element={<VerifyEmail />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/find-tutors" element={<FindTutors />} />
          <Route path="/trending-tutors" element={<TrendingTutors />} />
          <Route path="/become-tutor" element={<BecomeTutor />} />
          <Route path="/tutors/kyc-submission" element={<Navigate to="/tutor/kyc" replace />} />
          <Route path="/tutor/kyc-submission" element={<Navigate to="/tutor/kyc" replace />} />
          <Route path="/tutors/:slug" element={<TutorPublicProfile />} />
          {/* Backward compatibility: redirect old /tutor/:id and /tutor?id=123 to /tutors/:slug */}
          {/* Only match numeric or UUID-like patterns, not dashboard routes */}
          <Route path="/tutor/:id" element={<TutorRedirect />} />
          <Route path="/tutor" element={<TutorRedirect />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/about" element={<About />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/blogs" element={<Blogs />} />
          <Route path="/blogs/:slug" element={<BlogPost />} />
          {/* SEO Subject Landing Pages */}
          <Route path="/online-maths-tutor" element={<SubjectLandingPage />} />
          <Route path="/online-physics-tutor" element={<SubjectLandingPage />} />
          <Route path="/online-chemistry-tutor" element={<SubjectLandingPage />} />
          <Route path="/online-biology-tutor" element={<SubjectLandingPage />} />
          <Route path="/online-english-tutor" element={<SubjectLandingPage />} />
          <Route path="/tutors" element={<Navigate to="/find-tutors" replace />} />
          <Route path="/become-a-tutor" element={<Navigate to="/become-tutor" replace />} />
        </Route>

        {/* Role Chooser */}
        <Route path="/choose-role" element={<ProtectedRoute><ChooseRole /></ProtectedRoute>} />

        {/* Call page - full screen, no layout chrome */}
        <Route path="/call/:bookingId" element={<ProtectedRoute><CallPage /></ProtectedRoute>} />

        {/* Shared class join routes */}
        <Route
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/class/:bookingId" element={<ClassPage />} />
          <Route path="/whiteboard/:bookingId" element={<WhiteboardPage />} />
          <Route path="/account/security" element={<AccountSecurity />} />
        </Route>

        {/* Student Dashboard */}
        <Route
          element={
            <ProtectedRoute>
              <RoleRoute role="student">
                <DashboardLayout role="student" />
              </RoleRoute>
            </ProtectedRoute>
          }
        >
          <Route path="/student/dashboard" element={<StudentDashboard />} />
          <Route path="/student/profile" element={<StudentProfile />} />
          <Route path="/student/bookings" element={<StudentBookings />} />
          <Route path="/student/sessions" element={<StudentSessions />} />
          <Route path="/student/token-balance" element={<TokenBalance />} />
          <Route path="/student/transactions" element={<StudentTransactions />} />
          <Route path="/student/messages" element={<StudentChat />} />
          <Route path="/student/chat" element={<StudentChat />} />
          <Route path="/student/chat/:conversationId" element={<StudentChat />} />
          <Route path="/student/notifications" element={<StudentNotifications />} />
          <Route path="/student/favorites" element={<StudentFavorites />} />
          <Route path="/student/progress" element={<StudentProgress />} />
          <Route path="/student/goals" element={<StudentGoals />} />
          <Route path="/student/session-notes" element={<SessionNotes />} />
          <Route path="/student/certificates" element={<StudentCertificates />} />
          <Route path="/student/review-session" element={<ReviewSession />} />
          <Route path="/student/reviews" element={<StudentReviews />} />
          <Route path="/student/cart" element={<Cart />} />
          <Route path="/student/waitlist" element={<StudentWaitlist />} />
          <Route path="/student/assignments" element={<StudentAssignments />} />

          {/* Free DEMO checkout (existing) */}
          <Route path="/student/demo-checkout" element={<DemoCheckout />} />
          
          {/* Phase 4: Student Routes */}
          <Route path="/student/manage-account" element={<StudentManageAccount />} />

          {/* NEW paid checkout flow + result pages */}
          <Route path="/student/checkout" element={<StudentCheckoutPaid />} />
          <Route path="/student/payment/success" element={<PaymentSuccess />} />
          <Route path="/student/payment/failure" element={<PaymentFailure />} />
        </Route>

        {/* Tutor Dashboard */}
        <Route
          element={
            <ProtectedRoute>
              <RoleRoute role="tutor">
                <DashboardLayout role="tutor" />
              </RoleRoute>
            </ProtectedRoute>
          }
        >
          <Route path="/tutor/dashboard" element={<TutorDashboard />} />
          <Route path="/tutor/profile" element={<TutorProfile />} />
          <Route path="/tutor/kyc" element={<Kyc />} />
          <Route path="/tutor/availability" element={<Availability />} />
          <Route path="/tutor/skill-test" element={<SkillTest />} />
          <Route path="/tutor/sessions" element={<TutorSessions />} />
          <Route path="/tutor/messages" element={<TutorChat />} />
          <Route path="/tutor/chat" element={<TutorChat />} />
          <Route path="/tutor/chat/:conversationId" element={<TutorChat />} />
          <Route path="/tutor/notifications" element={<TutorNotifications />} />
          <Route path="/tutor/earnings" element={<TutorEarnings />} />
          <Route path="/tutor/content-library" element={<ContentLibrary />} />
          <Route path="/tutor/recurring-templates" element={<RecurringTemplates />} />
          <Route path="/tutor/performance-tracking" element={<PerformanceTracking />} />
          
          <Route path="/tutor/assignments" element={<TutorAssignments />} />

          {/* Phase 4: Tutor Routes */}
          <Route path="/tutor/manage-account" element={<TutorManageAccount />} />
        </Route>

        {/* Admin Dashboard */}
        <Route
          element={
            <ProtectedRoute>
              <RoleRoute role="admin">
                <DashboardLayout role="admin" />
              </RoleRoute>
            </ProtectedRoute>
          }
        >
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/tutors" element={<TutorList />} />
          <Route path="/admin/tutors/:id" element={<TutorDetail />} />
          <Route path="/admin/students" element={<StudentList />} />
          <Route path="/admin/students/:id" element={<StudentDetail />} />
          <Route path="/admin/analytics" element={<AdminAnalytics />} />
          <Route path="/admin/kyc-verification" element={<KycVerification />} />
          <Route path="/admin/reports" element={<AdminReports />} />
          <Route path="/admin/messages" element={<AdminMessages />} />
          <Route path="/admin/chat" element={<AdminMessages />} />
          <Route path="/admin/chat/:conversationId" element={<AdminMessages />} />
          <Route path="/admin/reviews" element={<AdminReviews />} />
          <Route path="/admin/blogs" element={<AdminBlogs />} />
          <Route path="/admin/revenue" element={<AdminRevenue />} />
          <Route path="/admin/finance" element={<AdminFinance />} />
          <Route path="/admin/finance/payments" element={<AdminFinancePayments />} />
          <Route path="/admin/finance/payouts" element={<AdminPayoutDashboard />} />
          <Route path="/admin/finance/recon" element={<AdminFinanceRecon />} />
          <Route path="/admin/finance/expenses" element={<AdminExpenseTracker />} />
          <Route path="/admin/finance/balance-sheet" element={<AdminBalanceSheet />} />
          <Route path="/admin/refund-requests" element={<AdminRefundRequests />} />
          <Route path="/admin/audit" element={<AdminAudit />} />
          <Route path="/admin/policy-config" element={<AdminPolicyConfig />} />
          <Route path="/admin/controls" element={<AdminControlsPage />} />
          <Route path="/admin/admins" element={<AdminManagement />} />
          <Route path="/admin/bookings" element={<AdminBookings />} />
          <Route path="/admin/notifications" element={<AdminNotifications />} />
          <Route path="/admin/offers-packs" element={<AdminOffersPacksPage />} />
        </Route>

        {/* 404 Fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export default function AppWithProviders() {
  return (
    <HelmetProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </HelmetProvider>
  );
}