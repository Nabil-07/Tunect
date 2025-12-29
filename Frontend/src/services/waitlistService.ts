import { http as api } from '../api/http';

export type AddToWaitlistPayload = {
  tutorId: string;
  requestedStartTime: string; // ISO 8601
  requestedEndTime?: string; // ISO 8601
  subject?: string;
  priority?: number;
  notes?: string;
};

export type WaitlistEntry = {
  id: string;
  studentId: string;
  tutorId: string;
  requestedStartTime: string;
  requestedEndTime?: string | null;
  subject?: string | null;
  priority?: number | null;
  notes?: string | null;
  status: string;
  createdAt: string;
};

/**
 * Add student to waitlist for a tutor
 */
export async function addToWaitlist(payload: AddToWaitlistPayload) {
  const { data } = await api.post("/waitlist", payload);
  return data as WaitlistEntry;
}

/**
 * Get my waitlist entries (student)
 */
export async function getMyWaitlist() {
  const { data } = await api.get("/waitlist/my");
  return data as WaitlistEntry[];
}

/**
 * Remove from waitlist
 */
export async function removeFromWaitlist(waitlistId: string) {
  const { data } = await api.delete(`/waitlist/${waitlistId}`);
  return data;
}
