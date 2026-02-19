import { http as api } from '../api/http';

/* ========== Types ========== */
export type CreateDemoPayload = {
  tutorId: string;
  startTime?: string; // ISO
  endTime?: string;   // ISO
  notes?: string;
};

export type CreatePaidPayload = {
  tutorId: string;
  /** Optional: allow creating a paid booking without selecting a slot yet (PENDING_SLOT) */
  startTime?: string; // ISO
  endTime?: string;   // ISO
  notes?: string;
};

export type AssignSlotPayload = {
  startTime: string; // ISO
  endTime: string;   // ISO
  notes?: string;
};

export type BookingDto = {
  id: string;
  tutorId: string;
  studentId: string;
  isDemo: boolean;
  status:
    | "PENDING"
    | "PENDING_SLOT"
    | "CONFIRMED"
    | "WAITING_ROOM"
    | "LIVE"
    | "COMPLETED"
    | "CANCELED"
    | "AUTO_CANCELLED_TUTOR_NO_SHOW"
    | "AUTO_CANCELLED_STUDENT_NO_SHOW";
  startTime?: string | null;
  endTime?: string | null;
  createdAt?: string;
  tokensCharged: number | string;
  notes?: string | null;
  tutor: { id: string; name?: string; email?: string; hourlyRate?: number };
  /** Present in /bookings/:id/details response; optional for list endpoints. */
  student?: { id: string; name?: string; email?: string } | null;
  payment?: {
    id: string;
    amountInMinor: number;
    currency: string;
    status: string;
    createdAt: string;
  } | null;
};

export type BookingDetailsDto = GroupBookingDto & {
  meetingUrl?: string;
  meetingProvider?: string;
  attendance?: {
    studentJoinedAt?: string;
    tutorJoinedAt?: string;
    startedAt?: string;
  } | null;
};

/* ========== Helpers ========== */
function tzOpts(tz?: string) {
  return tz ? { headers: { "x-timezone": tz } } : {};
}

/* ========== Queries ========== */
export async function getMyBookings() {
  const res = await api.get("/students/my-bookings");
  // Backend may (or may not) include unscheduled/all — keep it generic.
  return res.data as {
    unscheduled?: BookingDto[];
    upcoming?: BookingDto[];
    completed?: BookingDto[];
    all?: BookingDto[];
  };
}

/** Generic list endpoint so we can force-fetch PENDING_SLOT if needed */
export async function listBookings(params: {
  studentId?: string;
  tutorId?: string;
  status?: "PENDING" | "PENDING_SLOT" | "CONFIRMED" | "COMPLETED" | "CANCELED";
  tz?: string;
}) {
  const { tz, ...query } = params || {};
  const { data } = await api.get<BookingDto[]>("/bookings", {
    params: query,
    ...tzOpts(tz),
  });
  return Array.isArray(data) ? data : [];
}

export async function getBookingDetails(bookingId: string, tz?: string) {
  const { data } = await api.get<BookingDetailsDto>(`/bookings/${bookingId}/details`, tzOpts(tz));
  return data;
}

/** Fetch tutor availability for the picker */
export async function getTutorAvailability(
  tutorId: string,
  fromIso?: string,
  toIso?: string,
  tz?: string
): Promise<Array<{ id?: string; startTime: string; endTime: string; title?: string }>> {
  const params: Record<string, string> = {};
  if (fromIso) params.from = fromIso;
  if (toIso) params.to = toIso;
  const { data } = await api.get(`/tutors/${tutorId}/availability`, {
    params,
    ...tzOpts(tz),
  });
  return Array.isArray(data) ? data : [];
}

/* ========== Actions ========== */
export async function createDemoBooking(payload: CreateDemoPayload, tz?: string) {
  const { data } = await api.post("/bookings/demo", payload, tzOpts(tz));
  return data as BookingDto;
}

export async function createPaidBooking(payload: CreatePaidPayload, tz?: string) {
  // Backend supports “no slot yet” → status=PENDING_SLOT
  const { data } = await api.post("/bookings", payload, tzOpts(tz));
  return data as BookingDto;
}

/** Unified assign-slot for demo or paid PENDING_SLOT bookings */
export async function assignSlot(bookingId: string, payload: AssignSlotPayload, tz?: string) {
  const { data } = await api.patch(`/bookings/${bookingId}/assign-slot`, payload, tzOpts(tz));
  return data as BookingDto;
}

/** Back-compat alias if some code still calls /assign-demo */
export async function assignDemoSlot(bookingId: string, payload: AssignSlotPayload, tz?: string) {
  const { data } = await api.patch(`/bookings/${bookingId}/assign-slot`, payload, tzOpts(tz));
  return data as BookingDto;
}

/** Cancel a booking */
export async function cancelBooking(bookingId: string) {
  const { data } = await api.delete(`/bookings/${bookingId}`);
  return data;
}

/** Demo status helpers (bulk first, fallback fan-out) */
export async function getDemoStatusForTutor(tutorId: string): Promise<boolean> {
  try {
    const { data } = await api.get<{ used: boolean }>(`/bookings/demo-status/${tutorId}`);
    return !!data?.used;
  } catch {
    return false;
  }
}

export async function getDemoStatusesForTutors(
  tutorIds: string[]
): Promise<Record<string, boolean>> {
  try {
    const { data } = await api.post<Record<string, boolean>>(`/bookings/demo-status/bulk`, { tutorIds });
    if (data && typeof data === "object") return data;
  } catch {
    /* fall through */
  }

  const result: Record<string, boolean> = {};
  await Promise.all(
    tutorIds.map(async (id) => {
      result[id] = await getDemoStatusForTutor(id).catch(() => false);
    })
  );
  return result;
}

/* ========== Phase 4: Group Sessions ========== */
export type CreateGroupSessionPayload = {
  tutorId: string;
  startTime: string; // ISO
  endTime: string;   // ISO
  subject: string;
  maxStudents: number; // 2-10
  pricePerStudent: number;
  isDemo?: boolean;
  notes?: string;
};

export type GroupBookingDto = BookingDto & {
  isGroupSession: boolean;
  maxStudents: number;
  currentEnrollment: number;
  pricePerStudent: number;
  meetingUrl?: string;
  meetingProvider?: string;
  participants?: Array<{
    id: string;
    studentId: string;
    tokensPaid: number;
    status: string;
    joinedAt: string;
    student: {
      id: string;
      name?: string;
      avatar?: string;
    };
  }>;
};

export async function createGroupSession(payload: CreateGroupSessionPayload) {
  const { data } = await api.post<GroupBookingDto>("/bookings/group", payload);
  return data;
}

export async function getAvailableGroupSessions(params?: { subject?: string; tutorId?: string }) {
  const { data } = await api.get<GroupBookingDto[]>("/bookings/group/available", { params });
  return Array.isArray(data) ? data : [];
}

export async function joinGroupSession(bookingId: string) {
  const { data } = await api.post<GroupBookingDto>(`/bookings/${bookingId}/join`, { bookingId });
  return data;
}

export async function leaveGroupSession(bookingId: string) {
  const { data } = await api.delete(`/bookings/${bookingId}/leave`);
  return data;
}

export async function getGroupSessionParticipants(bookingId: string) {
  const { data } = await api.get(`/bookings/${bookingId}/participants`);
  return data;
}

export type ConvertToGroupSessionPayload = {
  maxStudents: number; // 2-10
  pricePerStudent: number;
};

export async function convertToGroupSession(bookingId: string, payload: ConvertToGroupSessionPayload) {
  const { data } = await api.patch<GroupBookingDto>(`/bookings/${bookingId}/convert-to-group`, payload);
  return data;
}

/* ========== Phase 4: Waitlist ========== */
export type AddToWaitlistPayload = {
  tutorId: string;
  requestedStartTime: string;
  requestedEndTime?: string;
  subject?: string;
  priority?: number;
  notes?: string;
};

export type WaitlistEntryDto = {
  id: string;
  studentId: string;
  tutorId: string;
  requestedStartTime: string;
  requestedEndTime?: string;
  subject?: string;
  priority: number;
  status: "WAITING" | "NOTIFIED" | "EXPIRED" | "BOOKED";
  notifiedAt?: string;
  expiresAt?: string;
  createdAt: string;
  tutor?: {
    id: string;
    name?: string;
    email?: string;
  };
  student?: {
    id: string;
    name?: string;
    email?: string;
  };
};

export async function addToWaitlist(payload: AddToWaitlistPayload) {
  const { data } = await api.post<WaitlistEntryDto>("/waitlist", payload);
  return data;
}

export async function getMyWaitlist() {
  const { data } = await api.get<WaitlistEntryDto[]>("/waitlist/my");
  return Array.isArray(data) ? data : [];
}

export async function getTutorWaitlist() {
  const { data } = await api.get<WaitlistEntryDto[]>("/waitlist/tutor");
  return Array.isArray(data) ? data : [];
}

export async function notifyWaitlistStudent(waitlistId: string) {
  const { data } = await api.post(`/waitlist/${waitlistId}/notify`);
  return data;
}

export async function bookFromWaitlist(waitlistId: string) {
  const { data } = await api.post<BookingDto>(`/waitlist/${waitlistId}/book`);
  return data;
}

export async function removeFromWaitlist(waitlistId: string) {
  await api.delete(`/waitlist/${waitlistId}`);
}
