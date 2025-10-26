// Single place to read/write/clear tokens + user
export const AUTH_KEYS = {
  access: 'accessToken',
  refresh: 'refreshToken',
  user: 'user',
  role: 'role',
} as const;

export function getAccessToken() {
  try { return localStorage.getItem(AUTH_KEYS.access); } catch { return null; }
}
export function getRefreshToken() {
  try { return localStorage.getItem(AUTH_KEYS.refresh); } catch { return null; }
}

export function setTokens(access: string, refresh?: string) {
  localStorage.setItem(AUTH_KEYS.access, access);
  if (refresh) localStorage.setItem(AUTH_KEYS.refresh, refresh);
}
export function clearTokens() {
  localStorage.removeItem(AUTH_KEYS.access);
  localStorage.removeItem(AUTH_KEYS.refresh);
}

export type StoredUser = { id: string; email: string; name?: string; role?: string } | null;

export function saveUser(user: NonNullable<StoredUser>) {
  localStorage.setItem(AUTH_KEYS.user, JSON.stringify(user));
  if (user?.role) localStorage.setItem(AUTH_KEYS.role, String(user.role).toUpperCase());
}
export function loadUser(): StoredUser {
  try {
    const raw = localStorage.getItem(AUTH_KEYS.user);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function clearUser() {
  localStorage.removeItem(AUTH_KEYS.user);
  localStorage.removeItem(AUTH_KEYS.role);
}

export function anyTokenPresent() {
  return !!getAccessToken() || !!getRefreshToken();
}
