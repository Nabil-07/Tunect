// src/services/sessionService.ts
import { http as api } from '../api/http';

/** Get sessions for the currently logged-in tutor */
export const getMySessions = async () => {
  console.log('[sessionService] Calling GET /tutors/me/sessions');
  const res = await api.get('/tutors/me/sessions');
  console.log('[sessionService] Response status:', res.status);
  console.log('[sessionService] Response data:', res.data);
  return res.data;
};
