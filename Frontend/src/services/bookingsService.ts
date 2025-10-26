import api from "../lib/apiClient";

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
  status: "PENDING" | "PENDING_SLOT" | "CONFIRMED" | "COMPLETED" | "CANCELED";
  startTime?: string | null;
  endTime?: string | null;
  createdAt?: string;
  tokensCharged: number | string;
  notes?: string | null;
  tutor: { id: string; name?: string; email?: string; hourlyRate?: number };
  payment?: {
    id: string;
    amountInMinor: number;
    currency: string;
    status: string;
    createdAt: string;
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

/** Fetch tutor availability for the picker */
export async function getTutorAvailability(
  tutorId: string,
  fromIso?: string,
  toIso?: string,
  tz?: string
): Promise<Array<{ id?: string; startTime: string; endTime: string }>> {
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
