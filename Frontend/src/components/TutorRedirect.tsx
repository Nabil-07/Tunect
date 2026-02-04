import { useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

/**
 * Redirect component for backward compatibility:
 * - /tutor/:id -> /tutors/:id (only for UUID/numeric IDs)
 * - /tutor?id=123 -> /tutors/123 (profile loader will redirect to slug when possible)
 * 
 * Returns 404 for dashboard route names like 'kyc', 'dashboard', etc.
 */
export default function TutorRedirect() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { search } = useLocation();

  // List of tutor dashboard routes that should not be treated as tutor IDs
  const dashboardRoutes = new Set([
    'dashboard',
    'profile',
    'kyc',
    'availability',
    'skill-test',
    'sessions',
    'messages',
    'chat',
    'notifications',
    'earnings',
    'content-library',
    'recurring-templates',
    'performance-tracking',
    'manage-account',
    'kyc-submission', // Old route
  ]);

  // Check if ID looks like a UUID (36 chars with hyphens) or numeric
  const isValidTutorId = (str: string) => {
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // Numeric ID
    const numericPattern = /^\d+$/;
    return uuidPattern.test(str) || numericPattern.test(str);
  };

  useEffect(() => {
    const qs = new URLSearchParams(search);
    const qid = qs.get('id');
    const target = id || qid;
    
    if (target) {
      // If target is a known dashboard route, it shouldn't be here
      if (dashboardRoutes.has(target.toLowerCase())) {
        return; // Don't redirect, let 404 handle it
      }
      
      // Only redirect if it looks like a valid tutor ID
      if (isValidTutorId(target)) {
        navigate(`/tutors/${target}`, { replace: true });
      }
      // Otherwise, don't redirect (will fall through to 404)
    }
  }, [id, search, navigate]);

  // Return 404 for invalid IDs (including dashboard route names)
  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">404 — Page not found</h1>
      <p className="mt-2 text-slate-600">The page you're looking for doesn't exist.</p>
    </div>
  );
}
