import { http as api } from '../api/http';
import { getTutorAvailability } from './bookingsService';

/* ---------- Types ---------- */

export type Tutor = {
  id: string;
  name: string;
  email?: string;
  subject?: string;
  subjectPrimary?: string;
  subjects?: string[];
  classesTeach?: string[];
  languages?: string[];
  rating?: number | null;
  reviews?: number;
  hourlyRate?: number;
  pricePerHour?: number;
  avatarUrl?: string | null;
  user?: { name?: string; email?: string } | null;
  video?: {
    id: string;
    videoUrl: string;
    thumbnail?: string;
    duration?: number;
  } | null;
};

/** Normalized slot for UI. Prefer `date` (YYYY-MM-DD). `day` kept for BC. */
export type AvailabilitySlot = {
  id?: string;
  date?: string;
  day?: string;
  startTime: string;
  endTime: string;
  title?: string;
  booked?: boolean;
};

export type RawSlot = {
  id?: string;
  tutorId?: string;
  startTime: string; // ISO
  endTime: string;   // ISO
  title?: string;
  booked?: boolean;
};

type ListResponse<T> = {
  items: T[];
  total?: number;
  page?: number;
  pageSize?: number;
  meta?: { total: number; page: number; pageSize: number; totalPages?: number };
};

/* ---------- Utils ---------- */

const toNum = (v: any, d = 0) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? Number(n) : d;
};

function normalizeTutor(raw: any): Tutor {
  const subjectsArr: string[] = Array.isArray(raw?.subjects) ? raw.subjects : [];
  const classesTeachArr: string[] = Array.isArray(raw?.classesTeach) ? raw.classesTeach : [];
  const languagesArr: string[] = Array.isArray(raw?.languages) ? raw.languages : [];
  const subject = raw?.subject ?? (subjectsArr.length ? subjectsArr.join(', ') : undefined);

  const derivedNameFromEmail = () => {
    const base = (raw?.email ?? raw?.user?.email ?? '')
      .split('@')[0]
      .replace(/\./g, ' ')
      .replace(/^\w/, (c: string) => c.toUpperCase());
    return base || 'Tutor';
  };

  const name = raw?.name ?? raw?.user?.name ?? derivedNameFromEmail();
  const hourlyRate = toNum(raw?.hourlyRate ?? raw?.pricePerSessionTokens, 0);
  const pricePerHour = raw?.pricePerHour != null ? toNum(raw.pricePerHour) : undefined;
  const rating =
    raw?.rating === null ? null : toNum(raw?.rating ?? raw?.avgRating, null as any);
  const reviews = toNum(raw?.reviews ?? raw?.reviewCount ?? raw?.reviewsCount, 0);

  return {
    id: raw?.id,
    name,
    email: raw?.email ?? raw?.user?.email,
    subject,
    subjectPrimary: raw?.subjectPrimary ?? subject,
    subjects: subjectsArr,
    classesTeach: classesTeachArr,
    languages: languagesArr,
    hourlyRate,
    pricePerHour,
    rating: rating as number | null,
    reviews,
    avatarUrl: raw?.avatarUrl ?? raw?.user?.avatarUrl ?? null,
    user: raw?.user ?? null,
  };
}

function normalizeList(data: ListResponse<any> | any[]) {
  if (Array.isArray(data)) {
    return {
      items: data.map(normalizeTutor),
      total: data.length,
      page: 1,
      pageSize: data.length,
    };
  }
  const meta = data.meta ?? ({} as NonNullable<ListResponse<any>['meta']>);
  return {
    items: (data.items ?? []).map(normalizeTutor),
    total: data.total ?? meta.total ?? 0,
    page: data.page ?? meta.page ?? 1,
    pageSize:
      data.pageSize ?? meta.pageSize ?? (data.items?.length ?? 0),
  };
}

/* ========== Tutor listing/search/detail ========== */

export async function listTutors(params?: {
  page?: number;
  pageSize?: number;
  subject?: string;
  classTeach?: string;
  language?: string;
}) {
  const clean: any = {};
  if (params?.page && Number.isFinite(params.page)) clean.page = Number(params.page);
  if (params?.pageSize && Number.isFinite(params.pageSize))
    clean.pageSize = Number(params.pageSize);
  if (params?.subject && params.subject.trim())
    clean.subject = params.subject.trim();
  if (params?.classTeach && params.classTeach.trim())
    clean.class = params.classTeach.trim();
  if (params?.language && params.language.trim())
    clean.language = params.language.trim();

  const { data } = await api.get<ListResponse<any> | any[]>('/tutors', {
    params: clean,
  });
  return normalizeList(data);
}

export async function searchTutors(params: {
  q?: string;
  subject?: string;
  classTeach?: string;
  language?: string;
  minRating?: number;
  priceMin?: number;
  priceMax?: number;
  from?: string | Date;
  to?: string | Date;
  page?: number;
  pageSize?: number;
}) {
  const qp: Record<string, any> = {};
  if (params.q && params.q.trim()) qp.q = params.q.trim();
  if (params.subject && params.subject.trim()) qp.subject = params.subject.trim();
  if (params.classTeach && params.classTeach.trim()) qp.class = params.classTeach.trim();
  if (params.language && params.language.trim()) qp.language = params.language.trim();
  if (Number.isFinite(params.priceMin as any)) qp.minRate = Number(params.priceMin);
  if (Number.isFinite(params.priceMax as any)) qp.maxRate = Number(params.priceMax);

  const toIso = (v?: string | Date) =>
    v instanceof Date ? v.toISOString() : (v && String(v)) || undefined;
  const fromISO = toIso(params.from);
  const toISO = toIso(params.to);
  if (fromISO) qp.from = fromISO;
  if (toISO) qp.to = toISO;

  if (Number.isFinite(params.page as any)) qp.page = Number(params.page);
  if (Number.isFinite(params.pageSize as any)) qp.pageSize = Number(params.pageSize);

  const { data } = await api.get<ListResponse<any> | any[]>('/tutors/search', {
    params: qp,
  });
  return normalizeList(data);
}

export async function getTutor(id: string) {
  const { data } = await api.get<any>(`/tutors/${id}`);
  return normalizeTutor(data);
}
export const getTutorById = getTutor;

// Re-export getTutorAvailability from bookingsService for convenience
export { getTutorAvailability };

export async function getRecommendedTutors(limit = 6) {
  const { data } = await api.get<ListResponse<any> | any[]>('/tutors', {
    params: { sortBy: 'updatedAt', sortOrder: 'desc', page: 1, pageSize: limit },
  });
  const list = normalizeList(data);
  return list.items;
}

export async function getFilterOptions(): Promise<{
  subjects: string[];
  classesTeach: string[];
  languages: string[];
  ratingOptions: Array<{ value: number; label: string }>;
}> {
  try {
    const { data } = await api.get('/tutors/filters/options');
    return {
      subjects: data.subjects || [],
      classesTeach: data.classesTeach || [],
      languages: data.languages || [],
      ratingOptions: data.ratingOptions || [
        { value: 0, label: 'Any rating' },
        { value: 3, label: '3.0+' },
        { value: 4, label: '4.0+' },
        { value: 4.5, label: '4.5+' },
      ],
    };
  } catch (error) {
    console.error('Failed to fetch filter options:', error);
    // Return defaults on error
    return {
      subjects: [],
      classesTeach: [],
      languages: [],
      ratingOptions: [
        { value: 0, label: 'Any rating' },
        { value: 3, label: '3.0+' },
        { value: 4, label: '4.0+' },
        { value: 4.5, label: '4.5+' },
      ],
    };
  }
}

/* ========== Availability ========== */

function monthRange(dateInMonth: Date) {
  const start = new Date(dateInMonth.getFullYear(), dateInMonth.getMonth(), 1);
  const end = new Date(
    dateInMonth.getFullYear(),
    dateInMonth.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  return { from: start.toISOString(), to: end.toISOString() };
}

async function tryGet<T>(path: string, params?: Record<string, any>) {
  try {
    // Add cache-busting timestamp to prevent stale 304 responses
    const cacheParams = { ...params, _t: Date.now() };
    const { data } = await api.get<T>(path, { params: cacheParams });
    return data;
  } catch {
    return undefined;
  }
}

/** Normalize *any* backend slot shape to UI AvailabilitySlot[]. */
function normalizeAnyToAvailability(arr: any[]): AvailabilitySlot[] {
  if (!Array.isArray(arr)) return [];
  const out: AvailabilitySlot[] = [];
  for (const s of arr) {
    if (s?.startTime && /^\d{4}-\d{2}-\d{2}T/.test(s.startTime)) {
      const start = new Date(s.startTime);
      const end = new Date(s.endTime);
      const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(
        start.getDate(),
      ).padStart(2, '0')}`;
      const hhmm = (d: Date) =>
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      out.push({
        id: s.id,
        date,
        day: date,
        startTime: hhmm(start),
        endTime: hhmm(end),
        title: s.title,
        booked: !!s.booked,
      });
    } else {
      const date = s.date || s.day;
      const startTime = s.startTime ?? s.start;
      const endTime = s.endTime ?? s.end;
      if (date && startTime && endTime) {
        out.push({
          id: s.id,
          date,
          day: date,
          startTime,
          endTime,
          title: s.title,
          booked: !!s.booked,
        });
      }
    }
  }
  return out;
}

function toBackendSlots(slots: AvailabilitySlot[]) {
  return {
    slots: slots.map((s) => ({
      id: s.id,
      date: s.date || s.day,
      startTime: s.startTime,
      endTime: s.endTime,
      title: s.title,
    })),
  };
}

export async function getAvailability(range?: {
  from?: Date;
  to?: Date;
}): Promise<AvailabilitySlot[]> {
  const params: any = {};
  if (range?.from) params.from = range.from.toISOString();
  if (range?.to) params.to = range.to.toISOString();

  const data =
    (await tryGet<any[]>('/availability/me/slots', params)) ??
    (await tryGet<any[]>('/availability/me', params)) ??
    (await tryGet<any[]>('/availability/slots', params)) ??
    [];

  return normalizeAnyToAvailability(data);
}

/**
 * Create a single availability slot
 */
export async function createSlot(startTime: string, endTime: string): Promise<AvailabilitySlot> {
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  const { data } = await api.post<{ id: string; tutorId: string; startTime: string; endTime: string; createdAt: string }>(
    '/availability/me',
    { startTime, endTime, tzOffsetMinutes }
  );
  
  // Convert ISO timestamps to date/startTime/endTime format
  const start = new Date(data.startTime);
  const end = new Date(data.endTime);
  const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  
  return {
    id: data.id,
    date,
    day: date,
    startTime: hhmm(start),
    endTime: hhmm(end),
  };
}

/**
 * Update a single availability slot by ID
 */
export async function updateSlot(slotId: string, startTime?: string, endTime?: string): Promise<AvailabilitySlot> {
  const body: any = {};
  if (startTime) body.startTime = startTime;
  if (endTime) body.endTime = endTime;
  body.tzOffsetMinutes = new Date().getTimezoneOffset();
  
  const { data } = await api.patch<{ id: string; tutorId: string; startTime: string; endTime: string; createdAt: string }>(
    `/availability/me/${slotId}`,
    body
  );
  
  // Convert ISO timestamps to date/startTime/endTime format
  const start = new Date(data.startTime);
  const end = new Date(data.endTime);
  const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  
  return {
    id: data.id,
    date,
    day: date,
    startTime: hhmm(start),
    endTime: hhmm(end),
  };
}

/**
 * Delete a single availability slot by ID
 */
export async function deleteSlot(slotId: string): Promise<void> {
  await api.delete(`/availability/me/${slotId}`);
}

export async function updateAvailability(slots: AvailabilitySlot[]): Promise<void> {
  const body = { ...toBackendSlots(slots), tzOffsetMinutes: new Date().getTimezoneOffset() };

  try {
    await api.patch('/availability/me/slots', body);
    return;
  } catch (error: any) {
    console.error('Failed to update availability via PATCH /availability/me/slots:', error);
  }

  try {
    await api.put('/availability/me/slots', body);
    return;
  } catch (error: any) {
    console.error('Failed to update availability via PUT /availability/me/slots:', error);
  }

  try {
    await api.patch('/availability/me', body);
    return;
  } catch (error: any) {
    console.error('Failed to update availability via PATCH /availability/me:', error);
  }

  try {
    await api.put('/availability/me', body);
    return;
  } catch (error: any) {
    console.error('Failed to update availability via PUT /availability/me:', error);
  }

  try {
    await api.post('/availability/slots', body);
  } catch (error: any) {
    console.error('Failed to update availability via POST /availability/slots:', error);
    throw new Error(`Failed to save availability: ${error.message || 'Unknown error'}`);
  }
}

export async function getAvailabilityForMonth(
  visibleMonth: Date,
): Promise<RawSlot[]> {
  const { from, to } = monthRange(visibleMonth);
  const data =
    (await tryGet<any[]>('/availability/me', { from, to })) ??
    (await tryGet<any[]>('/availability/me/slots', { from, to })) ??
    (await tryGet<any[]>('/availability/slots', { from, to })) ??
    [];

  const out: RawSlot[] = [];
  for (const s of data) {
    if (s?.startTime && /^\d{4}-\d{2}-\d{2}T/.test(s.startTime)) {
      out.push({
        id: s.id,
        tutorId: s.tutorId,
        startTime: s.startTime,
        endTime: s.endTime,
        title: s.title,
        booked: !!s.booked,
      });
    } else if (s?.date && s?.startTime && s?.endTime) {
      const toIso = (dateStr: string, hhmm: string) => {
        const [h, m] = String(hhmm).split(':').map(Number);
        const d = new Date(`${dateStr}T00:00:00`);
        d.setHours(h || 0, m || 0, 0, 0);
        return d.toISOString();
      };
      out.push({
        startTime: toIso(s.date, s.startTime),
        endTime: toIso(s.date, s.endTime),
        title: s.title,
        booked: !!s.booked,
      });
    }
  }
  return out;
}

export async function saveAvailabilityForMonth(
  slots: RawSlot[],
  visibleMonth: Date,
): Promise<void> {
  const { from, to } = monthRange(visibleMonth);
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  const body = { from, to, slots, tzOffsetMinutes };

  try {
    await api.patch('/availability/me', body);
    return;
  } catch (error: any) {
    console.error('Failed to save availability via PATCH /availability/me:', error);
  }

  try {
    await api.put('/availability/me', body);
    return;
  } catch (error: any) {
    console.error('Failed to save availability via PUT /availability/me:', error);
  }

  // Fallback to old method
  const toYmd = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  };
  const toHHMM = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(
      2,
      '0',
    )}`;
  };
  const normalized: AvailabilitySlot[] = slots.map((s) => ({
    date: toYmd(s.startTime),
    day: toYmd(s.startTime),
    startTime: toHHMM(s.startTime),
    endTime: toHHMM(s.endTime),
    title: s.title,
    booked: !!s.booked,
  }));
  await updateAvailability(normalized);
}

/* ========== Tutor profile & KYC ========== */

export async function getMyProfile(): Promise<any> {
  const { data } = await api.get('/tutors/me');
  return data;
}

/* ========== Tutor sessions (bookings) ========== */
export type TutorSession = {
  id: string;
  studentName: string;
  subject: string;
  startTime: string; // ISO
  endTime: string;   // ISO
  status: 'UPCOMING' | 'COMPLETED';
};

export async function getMySessions(): Promise<TutorSession[]> {
  try {
    const { data } = await api.get('/tutors/me/sessions');
    if (Array.isArray(data)) return data as TutorSession[];
    if (Array.isArray(data?.items)) return data.items as TutorSession[];
    return [];
  } catch {
    return [];
  }
}

export async function updateMyProfile(
  body: Partial<{ name: string; bio: string; subjects: string[]; languages: string[]; hourlyRate: number; country: string }>,
) {
  await api.put('/tutors/me', body);
}

/** Unified KYC submit (details + files in one request). Falls back to legacy paths. */
export type KycPayload = {
  fullName: string;
  dob: string; // YYYY-MM-DD
  phone: string;
  country: 'IN' | 'AE' | 'OTHER';
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode?: string;

  // Bank (common)
  bankAccountHolder: string;
  bankName: string;
  bankBranch?: string;

  // India
  accountNumber?: string;
  ifsc?: string;
  upiId?: string;
  aadhaarNumber?: string;

  // UAE
  iban?: string;
  swift?: string;
};

export type KycFiles = {
  selfie?: File | null;
  aadhaarFront?: File | null;
  aadhaarBack?: File | null;
  degreeCertificates?: File[]; // can be multiple
};

export async function submitKyc(payload: KycPayload, files: KycFiles) {
  const fd = new FormData();
  // Send JSON as a plain string so Nest's Body('data') reads it correctly in multipart
  fd.append('data', JSON.stringify(payload));

  if (files.selfie) fd.append('selfie', files.selfie);
  if (files.aadhaarFront) fd.append('aadhaarFront', files.aadhaarFront);
  if (files.aadhaarBack) fd.append('aadhaarBack', files.aadhaarBack);
  (files.degreeCertificates || []).forEach((f, i) =>
    fd.append('degreeCertificates', f, f.name || `degree_${i}.pdf`),
  );

  try {
    await api.post('/kyc/submit', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  } catch (err: any) {
    // Only fallback if the primary route truly does not exist
    const status = err?.response?.status;
    if (status === 404) {
      await api.post('/tutors/me/kyc', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    } else {
      throw err;
    }
  }
}

export async function getKycStatus(): Promise<{
  status: 'none' | 'submitted' | 'under_review' | 'approved' | 'rejected';
  reason?: string;
}> {
  try {
    const { data } = await api.get('/kyc/status');
    const raw = String(data?.status || 'none').toLowerCase();
    const normalized: Record<string, 'none' | 'submitted' | 'under_review' | 'approved' | 'rejected'> = {
      none: 'none',
      submitted: 'submitted',
      'under review': 'under_review',
      under_review: 'under_review',
      'underreview': 'under_review',
      approved: 'approved',
      rejected: 'rejected',
      pending: 'under_review',
    };
    const status = normalized[raw] || normalized[raw.replace(/\s+/g, '_')] || 'none';
    return { status, reason: data?.reason };
  } catch {
    // legacy fallback shape
    const { data } = await api.get('/tutors/me/kyc/status');
    const raw = String(data?.status || 'none').toLowerCase();
    const status = raw === 'approved' ? 'approved' : raw === 'rejected' ? 'rejected' : raw === 'submitted' ? 'submitted' : raw.includes('under') ? 'under_review' : 'none';
    return { status, reason: data?.reason };
  }
}

export async function uploadKycDoc(file: File): Promise<any> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post('/kyc/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/* ---------- default export ---------- */
export default {
  listTutors,
  searchTutors,
  getTutor,
  getTutorById,
  getRecommendedTutors,

  getAvailability,
  updateAvailability,
  getAvailabilityForMonth,
  saveAvailabilityForMonth,

  getMyProfile,
  updateMyProfile,

  submitKyc,
  getKycStatus,
  uploadKycDoc,
  getMySessions,
};
