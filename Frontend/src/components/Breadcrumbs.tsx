import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

const routeNames: Record<string, string> = {
  '': 'Home',
  'student': 'Student',
  'tutor': 'Tutor',
  'admin': 'Admin',
  'dashboard': 'Dashboard',
  'bookings': 'Bookings',
  'messages': 'Messages',
  'sessions': 'Sessions',
  'availability': 'Availability',
  'profile': 'Profile',
  'token-balance': 'Token Balance',
  'waitlist': 'My Waitlist',
  'find-tutors': 'Find Tutor',
  'cart': 'Cart',
  'checkout': 'Checkout',
  'payment': 'Payment',
  'success': 'Success',
  'failure': 'Failure',
  'support': 'Support',
  'recurring-templates': 'Recurring Templates',
  'earnings': 'Earnings',
  'tutors': 'Tutors',
  'students': 'Students',
  'payments': 'Payments',
  'finance': 'Finance',
  'payouts': 'Payouts',
  'payout-dashboard': 'Payout Dashboard',
  'security': 'Security',
};

export default function Breadcrumbs() {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x);

  // Don't show breadcrumbs on home page or login pages
  if (pathnames.length === 0 || pathnames[0] === 'login' || pathnames[0] === 'signup') {
    return null;
  }

  return (
    <nav className="container mx-auto px-4 py-3 flex items-center gap-2 text-sm text-slate-600" data-testid="breadcrumbs">
      <Link
        to="/"
        className="flex items-center gap-1 hover:text-ocean-700 transition-colors"
        data-testid="breadcrumbs-home-link"
      >
        <Home className="h-4 w-4" />
        <span className="hidden sm:inline">Home</span>
      </Link>
      
      {pathnames.map((name, index) => {
        if (!routeNames[name]) return null;
        const routeTo = `/${pathnames.slice(0, index + 1).join('/')}`;
        const isLast = index === pathnames.length - 1;
        const displayName = routeNames[name] || name.charAt(0).toUpperCase() + name.slice(1);

        return (
          <div key={routeTo} className="flex items-center gap-2">
            <ChevronRight className="h-4 w-4 text-slate-400" />
            {isLast ? (
              <span className="font-medium text-ocean-700">{displayName}</span>
            ) : (
              <Link
                to={routeTo}
                className="hover:text-ocean-700 transition-colors"
                data-testid={`breadcrumbs-${name}-link`}
              >
                {displayName}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
