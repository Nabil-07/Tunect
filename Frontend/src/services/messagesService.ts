// src/services/messagesService.ts
import api, { readToken, setAuthHeader } from '../lib/apiClient';

export type UnreadCount = { count: number };

export async function getUnreadCount(): Promise<UnreadCount> {
  const t = readToken();
  if (!t) return { count: 0 };        // 🚫 no token → no request
  setAuthHeader(t);
  try {
    const { data } = await api.get('/messages/unread-count');
    if (typeof data === 'number') return { count: data };
    if (data && typeof data.count === 'number') return { count: data.count };
    return { count: 0 };
  } catch (e: any) {
    if (e?.response?.status === 401) return { count: 0 };
    throw e;
  }
}

export const unreadCount = getUnreadCount;
export default { getUnreadCount, unreadCount };
