import { useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

/**
 * Redirect component for backward compatibility:
 * - /tutor/:id -> /tutors/:id
 * - /tutor?id=123 -> /tutors/123 (profile loader will redirect to slug when possible)
 */
export default function TutorRedirect() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { search } = useLocation();

  useEffect(() => {
    const qs = new URLSearchParams(search);
    const qid = qs.get('id');
    const target = id || qid;
    if (target) {
      navigate(`/tutors/${target}`, { replace: true });
    }
  }, [id, search, navigate]);

  return null;
}
