// src/services/reconService.ts
import api from '../lib/apiClient';

export type ReconRow = {
  id: string;
  date: string;           // ISO
  ref: string;            // reference / txn id
  description?: string;
  bankAmount: number;     // +credit / -debit
  gatewayAmount: number;  // +credit / -debit
  diff: number;           // bankAmount - gatewayAmount
  status: 'MATCHED' | 'MISMATCH' | 'MISSING_BANK' | 'MISSING_GATEWAY' | 'ADJUSTED';
};

export type DailyReconResponse = {
  date: string;           // queried date
  totals: {
    bank: number;
    gateway: number;
    diff: number;
    matchedCount: number;
    mismatchedCount: number;
  };
  rows: ReconRow[];
};

export type ReconAdjustmentDto = {
  date: string; // ISO
  ref?: string;
  reason: string;
  amount: number; // positive or negative
  side: 'BANK' | 'GATEWAY'; // where to place adjustment
};

export async function getDaily(date?: string) {
  const q = date ? `?date=${encodeURIComponent(date)}` : '';
  const { data } = await api.get<DailyReconResponse>(`/admin/finance/recon/daily${q}`);
  return data;
}

export async function uploadBank(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post(`/admin/finance/recon/bank/upload`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function uploadGateway(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post(`/admin/finance/recon/gateway/upload`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function createAdjustment(dto: ReconAdjustmentDto) {
  const { data } = await api.post(`/admin/finance/recon/adjustment`, dto);
  return data;
}
