import { http as api } from '../api/http';

export interface RefundRequest {
  id: string;
  studentId: string;
  tutorId: string;
  tokenAmount: number;
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  purchaseDate: string;
}

export interface TokenTransferRequest {
  id: string;
  studentId: string;
  fromTutorId: string;
  toTutorId: string;
  tokenAmount: number;
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export interface TutorTokenBalance {
  id: string;
  tutorId: string;
  balance: number;
  tutor: {
    id: string;
    user: {
      name: string | null;
      email: string;
    };
  };
}

/**
 * Get student's token balances with tutors
 */
export async function getTokenBalances(): Promise<TutorTokenBalance[]> {
  const { data } = await api.get('/students/me/token-balances');
  return Array.isArray(data) ? data : [];
}

/**
 * Create a refund request (7-day policy)
 */
export async function createRefundRequest(params: {
  tutorId: string;
  tokenAmount: number;
  purchaseDate: string;
  reason?: string;
}): Promise<RefundRequest> {
  const { data } = await api.post('/refunds/request', params);
  return data;
}

/**
 * Create a token transfer request
 */
export async function createTokenTransferRequest(params: {
  fromTutorId: string;
  toTutorId: string;
  tokenAmount: number;
  reason?: string;
}): Promise<TokenTransferRequest> {
  const { data } = await api.post('/refunds/transfer', params);
  return data;
}

/**
 * Get student's refund requests
 */
export async function getMyRefundRequests(): Promise<RefundRequest[]> {
  const { data } = await api.get('/refunds/request/my');
  return Array.isArray(data) ? data : [];
}

/**
 * Get student's transfer requests
 */
export async function getMyTransferRequests(): Promise<TokenTransferRequest[]> {
  const { data } = await api.get('/refunds/transfer/my');
  return Array.isArray(data) ? data : [];
}
