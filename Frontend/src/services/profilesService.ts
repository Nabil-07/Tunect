import { http as api } from '../api/http';
import { getAccessToken } from '../lib/auth';

export async function chooseRole(role: 'STUDENT' | 'TUTOR') {
  const t = getAccessToken();
  if (!t) throw new Error('Not authenticated');
  const { data } = await api.post('/profiles/choose-role', { role });
  return data;
}
