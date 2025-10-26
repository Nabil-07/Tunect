// src/services/studentService.ts
import api, { readToken, setAuthHeader } from '../lib/apiClient';
import { getRole } from './authService';

const hasStudentProfileFlag = () => localStorage.getItem('has_student_profile') === '1';

export type StudentMe =
  | {
      id: string;
      email: string;
      role?: 'STUDENT' | 'TUTOR' | 'ADMIN' | string;
      student?: {
        id: string;
        grade?: string | null;
        tokens?: number;
        createdAt?: string;
        updatedAt?: string;
      } | null;
      tokens?: number;
      tokenBalance?: number;
      balance?: number;
      // if your backend also returns tutor, keep it here optionally
      tutor?: { id: string } | null;
    }
  | null;

/** Prefer /users/me; also cache profile flags for guards. */
export async function getMe(): Promise<StudentMe> {
  const t = readToken();
  if (!t) return null;
  setAuthHeader(t);

  try {
    const { data } = await api.get('/users/me'); // primary
    // Cache flags so UI can gate Student-only calls
    try {
      const hasStudent = !!data?.student?.id;
      const hasTutor   = !!data?.tutor?.id;
      localStorage.setItem('has_student_profile', hasStudent ? '1' : '0');
      localStorage.setItem('has_tutor_profile',   hasTutor   ? '1' : '0');
    } catch {}
    return data ?? null;
  } catch (e: any) {
    const s = e?.response?.status;
    if (s === 401) return null;
    // Fallback if you keep the legacy endpoint around
    try {
      const { data } = await api.get('/students/me');
      try {
        const hasStudent = !!data?.student?.id || !!data?.id;
        localStorage.setItem('has_student_profile', hasStudent ? '1' : '0');
      } catch {}
      return data ?? null;
    } catch (ee: any) {
      if (ee?.response?.status === 401) return null;
      throw ee;
    }
  }
}

/** Next booking widget: only if authenticated AND role is STUDENT AND a Student profile exists. */
export async function getNextBooking(): Promise<any | null> {
  const t = readToken();
  const role = getRole(); // typically from localStorage 'role'
  if (!t || role !== 'STUDENT' || !hasStudentProfileFlag()) return null; // hard guard
  setAuthHeader(t);

  try {
    const { data } = await api.get('/bookings/next');
    return data ?? null;
  } catch (e: any) {
    const s = e?.response?.status;
    if (s === 401 || s === 404) return null; // 404 = "student profile not found"
    throw e;
  }
}

/* Back-compat so old imports don't crash */
export const getStudentMe = getMe;
export const getNext = getNextBooking;

export default { getMe, getNextBooking, getStudentMe, getNext };
