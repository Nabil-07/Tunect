// src/pages/SubjectLandingRouter.tsx
// Thin wrapper that reads location.pathname to resolve the correct
// SubjectConfig and renders SubjectLanding. Falls back to 404-style message.
import { useLocation, Navigate } from 'react-router-dom';
import SubjectLanding, { getSubjectBySlug } from './SubjectLanding';

export default function SubjectLandingRouter() {
  const { pathname } = useLocation();
  // pathname is e.g. "/online-maths-tutor"
  const slug = pathname.replace(/^\//, '').replace(/\/$/, '');
  const config = getSubjectBySlug(slug);

  if (!config) {
    return <Navigate to="/find-tutors" replace />;
  }

  return <SubjectLanding config={config} />;
}
