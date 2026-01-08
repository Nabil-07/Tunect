import { http as api } from '../api/http';

/* ---------- Types ---------- */

export type Tutor = {
  id: string;
  name: string;
  email?: string;
  subject?: string;
  subjectPrimary?: string;
  subjects?: string[];
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
  language?: string;
}) {
  const clean: any = {};
  if (params?.page && Number.isFinite(params.page)) clean.page = Number(params.page);
  if (params?.pageSize && Number.isFinite(params.pageSize))
    clean.pageSize = Number(params.pageSize);
  if (params?.subject && params.subject.trim())
    clean.subject = params.subject.trim();
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

export async function getRecommendedTutors(limit = 6) {
  const { data } = await api.get<ListResponse<any> | any[]>('/tutors', {
    params: { sortBy: 'updatedAt', sortOrder: 'desc', page: 1, pageSize: limit },
  });
  const list = normalizeList(data);
  return list.items;
}

export async function getFilterOptions(): Promise<{
  subjects: string[];
  languages: string[];
  ratingOptions: Array<{ value: number; label: string }>;
}> {
  try {
    const { data } = await api.get('/tutors/filters/options');
    return {
      subjects: data.subjects || [],
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
    const { data } = await api.get<T>(path, params ? { params } : undefined);
    return data;
  } catch {
    return undefined;
  }
}
async function tryPut(path: string, body: any) {
  try {
    await api.put(path, body);
    return true;
  } catch {
    return false;
  }
}
async function tryPatch(path: string, body: any) {
  try {
    await api.patch(path, body);
    return true;
  } catch {
    return false;
  }
}
async function tryPost(path: string, body: any) {
  try {
    await api.post(path, body);
    return true;
  } catch {
    return false;
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

export async function updateAvailability(slots: AvailabilitySlot[]): Promise<void> {
  const body = toBackendSlots(slots);
  if (await tryPatch('/availability/me/slots', body)) return;
  if (await tryPut('/availability/me/slots', body)) return;
  if (await tryPatch('/availability/me', body)) return;
  if (await tryPut('/availability/me', body)) return;
  await tryPost('/availability/slots', body);
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
  if (await tryPatch('/availability/me', { from, to, slots })) return;
  if (await tryPut('/availability/me', { from, to, slots })) return;

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
  fd.append('data', new Blob([JSON.stringify(payload)], { type: 'application/json' }));

  if (files.selfie) fd.append('selfie', files.selfie);
  if (files.aadhaarFront) fd.append('aadhaarFront', files.aadhaarFront);
  if (files.aadhaarBack) fd.append('aadhaarBack', files.aadhaarBack);
  (files.degreeCertificates || []).forEach((f, i) =>
    fd.append('degreeCertificates', f, f.name || `degree_${i}.pdf`),
  );

  try {
    await api.post('/kyc/submit', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  } catch {
    // legacy fallback
    await api.post('/tutors/me/kyc', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }
}

export async function getKycStatus(): Promise<{
  status: 'none' | 'submitted' | 'under_review' | 'approved' | 'rejected';
  reason?: string;
}> {
  try {
    const { data } = await api.get('/kyc/status');
    return data;
  } catch {
    // legacy fallback shape
    const { data } = await api.get('/tutors/me/kyc/status');
    return data;
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
