import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import { unwrapAuthToken } from '../utils/decryption';
import { resolveApiBaseUrl } from './runtimeApi';

/* ------------------------------------------------------------------
   Debug logging
-------------------------------------------------------------------*/
const LOG_HTTP = true;

/* ------------------------------------------------------------------
   Token keys (compat with legacy)
-------------------------------------------------------------------*/
const ACCESS_KEYS = ["tunect_access_token", "accessToken", "token"] as const;
const REFRESH_KEYS = ["tunect_refresh_token", "refreshToken", "refresh_token"] as const;

/* ------------------------------------------------------------------
   Proactive refresh settings
-------------------------------------------------------------------*/
const EXPIRY_REFRESH_THRESHOLD_SEC = 60;
const AUTH_STORAGE_KEY = "auth_storage";

/* ------------------------------------------------------------------
   Storage selector
-------------------------------------------------------------------*/
function getPreferredStore(): Storage {
  try {
    const pref = localStorage.getItem(AUTH_STORAGE_KEY);
    return pref === "session" ? sessionStorage : localStorage;
  } catch {
    return localStorage;
  }
}

export function setAuthStorage(persist: boolean) {
  try {
    const target = persist ? "local" : "session";
    localStorage.setItem(AUTH_STORAGE_KEY, target);

    const curAccess = readToken();
    const curRefresh = readRefreshToken();
    const dst = target === "local" ? localStorage : sessionStorage;
    const src = target === "local" ? sessionStorage : localStorage;

    if (curAccess) dst.setItem("token", curAccess);
    if (curRefresh) dst.setItem("refresh_token", curRefresh || "");

    src.removeItem("token");
    src.removeItem("refresh_token");
  } catch {}
}

/* ------------------------------------------------------------------
   Token helpers
-------------------------------------------------------------------*/
export function readToken(): string | null {
  try {
    for (const k of ["token", ...ACCESS_KEYS]) {
      const v = sessionStorage.getItem(k) || localStorage.getItem(k);
      if (v) {
        return v;
      }
    }
  } catch (err) {
    console.error('[readToken] Error reading token:', err);
  }
  return null;
}

export function readRefreshToken(): string | null {
  try {
    for (const k of ["refresh_token", ...REFRESH_KEYS]) {
      const v = sessionStorage.getItem(k) || localStorage.getItem(k);
      if (v) return v;
    }
  } catch {}
  return null;
}

export function writeToken(token: string | null) {
  const store = getPreferredStore();
  const other = store === localStorage ? sessionStorage : localStorage;

  if (!token) {
    for (const k of ["token", ...ACCESS_KEYS]) {
      try {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      } catch (err) {
        console.warn('[writeToken] Failed to remove token:', err);
      }
    }
    setAuthHeader(null);
    return;
  }

  try {
    store.setItem("token", token);
    for (const k of ACCESS_KEYS) store.setItem(k, token);
    other.removeItem("token");
    for (const k of ACCESS_KEYS) other.removeItem(k);
  } catch (err) {
    console.error('[writeToken] Failed to write token:', err);
  }
  setAuthHeader(token);
}

export function writeRefreshToken(token: string | null) {
  const store = getPreferredStore();
  const other = store === localStorage ? sessionStorage : localStorage;

  if (!token) {
    for (const k of ["refresh_token", ...REFRESH_KEYS]) {
      try {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      } catch {}
    }
    return;
  }

  try {
    store.setItem("refresh_token", token);
    for (const k of REFRESH_KEYS) store.setItem(k, token);
    other.removeItem("refresh_token");
    for (const k of REFRESH_KEYS) other.removeItem(k);
  } catch {}
}

export function setAuthHeader(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

/* ------------------------------------------------------------------
   JWT helpers
-------------------------------------------------------------------*/
export type JwtPayload = Record<string, any> & {
  exp?: number;
  iat?: number;
  nbf?: number;
};

export function getTokenPayload(token?: string | null): JwtPayload | null {
  try {
    const t = token ?? readToken();
    if (!t) return null;
    const [, payload] = t.split(".");
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function getTokenExpiry(token?: string | null): number | null {
  const p = getTokenPayload(token);
  return p?.exp ? p.exp * 1000 : null;
}

export function getTimeLeftSec(token?: string | null): number | null {
  const expMs = getTokenExpiry(token);
  if (!expMs) return null;
  return Math.floor((expMs - Date.now()) / 1000);
}

export function isTokenExpiringSoon(token?: string | null, thresholdSec = EXPIRY_REFRESH_THRESHOLD_SEC): boolean {
  const left = getTimeLeftSec(token);
  return left !== null && left <= thresholdSec;
}

/* ------------------------------------------------------------------
   Axios instance
-------------------------------------------------------------------*/
const normalizedBase = resolveApiBaseUrl();
const useDevProxy = import.meta.env.DEV;
export const baseURL = useDevProxy ? "/api" : normalizedBase;

const api: AxiosInstance = axios.create({
  baseURL,
  timeout: 15000,
  withCredentials: false,
  headers: { Accept: "application/json" },
});

setAuthHeader(readToken());

/* ------------------------------------------------------------------
   Refresh handling
-------------------------------------------------------------------*/
let isRefreshing = false;
let refreshWaiters: Array<(t: string | null) => void> = [];

function notifyWaiters(token: string | null) {
  refreshWaiters.forEach((fn) => fn(token));
  refreshWaiters = [];
}

async function doRefreshToken(): Promise<string | null> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) {
    if (LOG_HTTP) console.log('[REFRESH] No refresh token available');
    return null;
  }

  try {
    if (LOG_HTTP) console.log('[REFRESH] Attempting token refresh...');
    const res = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });

    const rawAccess: string | undefined =
      res.data?.access_token || res.data?.accessToken || res.data?.token;
    const rawRefresh: string | undefined =
      res.data?.refresh_token || res.data?.refreshToken;
    const userData = res.data?.user;

    const access = await unwrapAuthToken(rawAccess);
    const newRefresh = await unwrapAuthToken(rawRefresh);

    if (access) writeToken(access);
    if (newRefresh) writeRefreshToken(newRefresh);

    // Dispatch user data along with the refresh event
    if (access) {
      if (LOG_HTTP) console.log('[REFRESH] ✅ Token refreshed successfully');
      window.dispatchEvent(new CustomEvent("auth:refreshed", { 
        detail: { user: userData } 
      }));
      return access;
    }
    if (LOG_HTTP) console.log('[REFRESH] ❌ No access token in response');
    return null;
  } catch (err) {
    if (LOG_HTTP) console.error('[REFRESH] ❌ Refresh failed:', err);
    return null;
  }
}

/* ------------------------------------------------------------------
   Interceptors
-------------------------------------------------------------------*/
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  let token = readToken();

  if (token && isTokenExpiringSoon(token)) {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await doRefreshToken();
      isRefreshing = false;
      notifyWaiters(newToken);
      token = newToken ?? token;
    } else {
      token = (await new Promise<string | null>((resolve) => refreshWaiters.push(resolve))) ?? token;
    }
  }

  config.headers = config.headers ?? {};
  if (token) {
    (config.headers as any).Authorization = `Bearer ${token}`;
  } else {
    delete (config.headers as any).Authorization;
  }

  return config;
});

api.interceptors.response.use(
  async (res) => {
    const responseType = (res.config as any)?.responseType;
    const isBinaryResponse =
      responseType === 'blob' ||
      responseType === 'arraybuffer' ||
      res.data instanceof Blob ||
      res.data instanceof ArrayBuffer;

    if (isBinaryResponse) {
      return res;
    }

    // Auto-decrypt encrypted fields if decryption is enabled
    if (res.data && import.meta.env.VITE_ENCRYPTION_KEY) {
      try {
        const { decryptObject } = await import('../utils/decryption');
        // Note: Names are NOT decrypted - only email and phone are decrypted
        const fieldsToDecrypt = [
          'access_token',
          'refresh_token',
          'accessToken',
          'refreshToken',
          'email',
          'phone',
          'avatarUrl',
          'avatar',
          'user.email',
          'user.phone',
          'user.avatarUrl',
          'tutor.user.email',
          'tutor.user.phone',
          'tutor.user.avatarUrl',
          'tutor.email', // Flattened structure (e.g., booking details)
          'tutor.avatarUrl',
          'student.user.email',
          'student.user.phone',
          'student.user.avatarUrl',
          'student.email', // Flattened structure (e.g., booking details)
          'student.avatarUrl',
        ];
        
        if (Array.isArray(res.data)) {
          res.data = await Promise.all(res.data.map((item: any) => decryptObject(item, fieldsToDecrypt)));
        } else if (res.data.items && Array.isArray(res.data.items)) {
          // Paginated response
          res.data.items = await Promise.all(res.data.items.map((item: any) => decryptObject(item, fieldsToDecrypt)));
        } else if (typeof res.data === 'object') {
          res.data = await decryptObject(res.data, fieldsToDecrypt);
        }
      } catch (error) {
        console.warn('[API Client] Failed to decrypt response:', error);
      }
    }
    return res;
  },
  async (err: AxiosError) => {
    const status = err.response?.status ?? 0;
    const original = err.config as any;

    if (status === 401 && !original?._retry) {
      original._retry = true;
      
      // Check if we even have refresh token before trying
      const hasRefreshToken = !!readRefreshToken();
      
      if (!isRefreshing) {
        isRefreshing = true;
        const newToken = await doRefreshToken();
        isRefreshing = false;
        notifyWaiters(newToken);
        if (newToken) {
          original.headers = original.headers ?? {};
          (original.headers as any).Authorization = `Bearer ${newToken}`;
          return api.request(original);
        } else if (hasRefreshToken) {
          // Only clear and notify if we HAD a refresh token that failed
          // (Don't trigger on missing token scenarios)
          writeToken(null);
          writeRefreshToken(null);
          window.dispatchEvent(new Event("auth:unauthorized"));
        }
      } else {
        const token = await new Promise<string | null>((resolve) =>
          refreshWaiters.push(resolve)
        );
        if (token) {
          original.headers = original.headers ?? {};
          (original.headers as any).Authorization = `Bearer ${token}`;
          return api.request(original);
        }
        // Don't dispatch unauthorized here - the main refresh handler already did
      }
    }

    return Promise.reject(err);
  }
);

/* ------------------------------------------------------------------
   Exports
-------------------------------------------------------------------*/
export default api;
export { api, ACCESS_KEYS as TOKEN_KEYS };
export async function refreshAccessToken(): Promise<string | null> {
  return await doRefreshToken();
}
