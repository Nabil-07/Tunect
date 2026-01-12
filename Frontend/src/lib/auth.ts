// src/lib/auth.ts
export type AuthTokens = { accessToken: string; refreshToken?: string };

const ACCESS_KEY = 'tunect_access_token';
const REFRESH_KEY = 'tunect_refresh_token';

function readFromBoth(key: string): string | null {
  try {
    return sessionStorage.getItem(key) || localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setTokens(tokens: Partial<AuthTokens>) {
  if (tokens.accessToken) {
    // primary key used by http.ts
    localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    // compatibility keys (old code/UI)
    localStorage.setItem('accessToken', tokens.accessToken);
    localStorage.setItem('token', tokens.accessToken);
  }
  if (tokens.refreshToken) {
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  }
  
  // Dispatch event to notify AuthContext of token change
  // (storage events only fire cross-tab, not same-tab)
  try {
    window.dispatchEvent(new Event('auth:token_updated'));
  } catch {}
}

export function getAccessToken(): string | null {
  return (
    readFromBoth(ACCESS_KEY) ||
    readFromBoth('accessToken') ||
    readFromBoth('token')
  );
}

export function clearTokens() {
  try {
    localStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    // clear compat keys too
    localStorage.removeItem('accessToken');
    sessionStorage.removeItem('accessToken');
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
  } catch {
    // ignore
  }
}
