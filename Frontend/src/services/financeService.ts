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
