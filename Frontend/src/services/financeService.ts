import { http as api } from '../api/http';

/* ========== Types ========== */
export type TutorWalletLedgerEntry = {
  id: string;
  tutorId: string;
  bookingId?: string | null;
  delta: number | string;
  reason: string;
  note?: string | null;
  createdAt: string;
  tutor?: {
    id: string;
    name?: string;
    email?: string;
  };
  booking?: {
    id: string;
    subject?: string;
    startTime?: string;
    isGroupSession?: boolean;
  };
};

export type PayoutBatch = {
  batchKey: string;
  weekStart: string;
  weekEnd: string;
  status: 'DRAFT' | 'CONFIRMED' | 'EXECUTED';
  totalAmount: number;
  tutorCount: number;
  createdAt?: string;
  executedAt?: string;
};

export type PayoutBatchDetail = {
  batch: PayoutBatch;
  payouts: Array<{
    tutorId: string;
    tutorName?: string;
    tutorEmail?: string;
    totalAmount: number;
    entries: TutorWalletLedgerEntry[];
  }>;
};

export type BalanceSheetLine = {
  label: string;
  amount: number;
  note?: string;
};

export type BalanceSheetResponse = {
  period: 'month' | 'quarter' | 'half' | 'year';
  asOf: string;
  periodStart: string;
  fiscalYearLabel: string;
  fiscalYearEnd: string;
  totals: { assets: number; liabilities: number; equity: number };
  assets: { current: BalanceSheetLine[]; nonCurrent: BalanceSheetLine[] };
  liabilities: { current: BalanceSheetLine[]; nonCurrent: BalanceSheetLine[] };
  equity: BalanceSheetLine[];
  notes: string[];
  noteDetails: Record<string, { formula: string; sources: string[]; rowCount: number }>;
  validation: { isBalanced: boolean; difference: number };
};

/* ========== API Functions ========== */

/** Get tutor wallet ledger entries with optional filters */
export async function getTutorWalletLedger(params?: {
  tutorId?: string;
  startDate?: string;
  endDate?: string;
  reason?: string;
}) {
  const { data } = await api.get<TutorWalletLedgerEntry[]>('/admin/finance/token-ledger', {
    params,
  });
  return Array.isArray(data) ? data : [];
}

/** Get payout batches (weekly summaries) */
export async function getPayoutBatches(params?: {
  status?: 'DRAFT' | 'CONFIRMED' | 'EXECUTED';
  limit?: number;
}) {
  const { data } = await api.get<PayoutBatch[]>('/admin/finance/payouts/batches', {
    params,
  });
  return Array.isArray(data) ? data : [];
}

/** Get detailed payout batch with individual tutor breakdowns */
export async function getPayoutBatchDetail(batchKey: string) {
  const { data } = await api.get<PayoutBatchDetail>(
    `/admin/finance/payouts/batches/${batchKey}`
  );
  return data;
}

/** Preview payout batch before confirming */
export async function previewPayoutBatch(weekStart: string, weekEnd: string) {
  const { data } = await api.post<PayoutBatchDetail>('/admin/finance/payouts/batches/preview', {
    weekStart,
    weekEnd,
  });
  return data;
}

/** Confirm a payout batch */
export async function confirmPayoutBatch(batchKey: string) {
  const { data } = await api.post(`/admin/finance/payouts/batches/confirm`, { batchKey });
  return data;
}

/** Execute confirmed payout batch */
export async function executePayoutBatch(batchKey: string) {
  const { data } = await api.post(`/admin/finance/payouts/batches/execute`, { batchKey });
  return data;
}

export async function getBalanceSheet(params?: {
  period?: 'month' | 'quarter' | 'half' | 'year';
  asOf?: string;
}) {
  const { data } = await api.get<BalanceSheetResponse>('/admin/finance/dashboard', { params });
  return data;
}

export async function exportBalanceSheetCsv(params?: {
  period?: 'month' | 'quarter' | 'half' | 'year';
  asOf?: string;
}) {
  const response = await api.get('/admin/finance/dashboard/export', {
    params,
    responseType: 'blob',
  });
  return response.data as Blob;
}

/* ========== Student Payments ========== */
export type StudentPayment = {
  id: string;
  bookingId: string;
  orderId: string;
  studentId: string;
  studentName?: string;
  studentEmail: string;
  tutorId: string;
  tutorName: string;
  amount: number; // in paise
  amountAtBooking: number; // original amount at time of booking
  paidAt: string;
  receiptUrl?: string;
  isBanned: boolean;
  tokensPurchased?: number;
  provider?: string;
};

export async function getStudentPayments(params?: {
  page?: number;
  pageSize?: number;
  studentId?: string;
  tutorId?: string;
  isBanned?: boolean;
}) {
  const { data } = await api.get<{ payments: StudentPayment[]; total: number }>(
    '/admin/finance/payments/student',
    { params }
  );
  return data;
}

/* ========== Tutor Payouts Due ========== */
export type TutorPaymentSchedule = {
  dueDate: string;
  bookingsCount: number;
  amountDue: number;
  amountPaid: number;
  status: 'pending' | 'paid' | 'blocked';
  blockedReason?: string;
  bookingId?: string;
  bookingStatus?: string;
  studentName?: string;
  sessionDate?: string;
  sessionEndDate?: string | null;
};

export type TutorPaymentDue = {
  tutorId: string;
  tutorName: string;
  tutorEmail: string;
  totalDue: number;
  totalPaid: number;
  remaining?: number;
  paymentSchedule: TutorPaymentSchedule[];
  commissionRate: number;
  isBanned: boolean;
  bannedDate?: string;
  bankInfo?: TutorBankInfo | null;
};

export async function getTutorPaymentsDue(params?: {
  page?: number;
  pageSize?: number;
  tutorId?: string;
  isBanned?: boolean;
}) {
  const { data } = await api.get<{ tutors: TutorPaymentDue[]; total: number }>(
    '/admin/finance/payments/tutor-due',
    { params }
  );
  return data;
}

/* ========== Manual Payouts ========== */
export type TutorBankInfo = {
  bankAccountHolder: string;
  bankName: string;
  accountNumber?: string | null;
  ifsc?: string | null;
  upiId?: string | null;
};
export type PayoutRecord = {
  id: string;
  tutorId: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'CANCELED';
  reference?: string;
  transactionId?: string;
  details?: string;
  paymentMethod?: string;
  slipUrl?: string;
  createdAt: string;
  paidAt?: string;
  tutor?: {
    id: string;
    userId: string;
    user?: { name: string; email: string };
    kycApplications?: TutorBankInfo[];
  };
};

export async function listPayouts() {
  const { data } = await api.get<PayoutRecord[]>('/admin/payouts');
  return Array.isArray(data) ? data : [];
}

export async function createPayout(dto: {
  tutorId: string;
  amount: number;
  reference?: string;
  transactionId?: string;
  details?: string;
  paymentMethod?: string;
}) {
  const { data } = await api.post<PayoutRecord>('/admin/payouts', dto);
  return data;
}

export async function markPayoutPaid(payoutId: string, dto: {
  transactionId?: string;
  paidDate?: string;
  details?: string;
  paymentMethod?: string;
}) {
  const { data } = await api.patch<PayoutRecord>(`/admin/payouts/${payoutId}`, {
    status: 'PAID',
    ...dto,
  });
  return data;
}

export async function cancelPayout(payoutId: string) {
  const { data } = await api.patch<PayoutRecord>(`/admin/payouts/${payoutId}`, {
    status: 'CANCELED',
  });
  return data;
}

export async function uploadPayoutSlip(payoutId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post(`/admin/payouts/${payoutId}/slip`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export type PayoutReceipt = {
  receiptId: string;
  payoutId: string;
  tutorName: string;
  tutorEmail: string;
  amount: number;
  status: string;
  transactionId?: string | null;
  paymentMethod?: string | null;
  reference?: string | null;
  details?: string | null;
  slipUrl?: string | null;
  bankInfo?: TutorBankInfo | null;
  createdAt: string;
  paidAt?: string | null;
  companyName: string;
  generatedAt: string;
};

export async function getPayoutReceipt(payoutId: string) {
  const { data } = await api.get<PayoutReceipt>(`/admin/payouts/${payoutId}/receipt`);
  return data;
}
