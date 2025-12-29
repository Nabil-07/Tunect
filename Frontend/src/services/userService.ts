// src/services/userService.ts
import { http as api } from '../api/http';

export type MeResponse = {
  id: string;
  email: string;
  role: 'STUDENT' | 'TUTOR' | 'ADMIN';
} & Record<string, any>;

export async function me(): Promise<MeResponse> {
  try {
    // ✅ primary (matches UsersController)
    const { data } = await api.get('/users/me');
    return data;
  } catch (e: any) {
    // Legacy fallback if some env still exposes /me
    if (e?.response?.status === 404) {
      const { data } = await api.get('/me');
      return data;
    }
    throw e;
  }
}

export async function updateMe(payload: Partial<{ name: string; avatarUrl: string }>) {
  const { data } = await api.patch('/users/me', payload);
  return data;
}
