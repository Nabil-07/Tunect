import api, { readToken, setAuthHeader } from '../lib/apiClient';

export async function chooseRole(role: 'STUDENT' | 'TUTOR') {
  const t = readToken();
  if (!t) throw new Error('Not authenticated');
  setAuthHeader(t);
  const { data } = await api.post('/profiles/choose-role', { role });
  return data;
}
