// src/services/sessionService.ts
import api from '../lib/apiClient';

/** Get sessions for the currently logged-in tutor */
export const getMySessions = async () => {
  const res = await api.get('/tutors/me/sessions');
  return res.data;
};
