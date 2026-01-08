// src/api/http.ts
import axios, { AxiosError } from 'axios';
import { clearTokens } from '../lib/auth';
import { refreshAccessToken, readToken } from '../lib/apiClient';

/** Normalize VITE_API_URL and ensure no trailing slash */
const rawBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const baseURL = rawBase.replace(/\/+$/, '');

/** Optional: change this if you want longer network waits */
const DEFAULT_TIMEOUT_MS = 15_000;

/** A small guard so we don't spam logout on bursts of 401s */
let handling401 = false;
let isRefreshing = false;
let refreshWaiters: Array<(token: string | null) => void> = [];

function notifyWaiters(token: string | null) {
  refreshWaiters.forEach((fn) => fn(token));
  refreshWaiters = [];
}

/** Create a single axios instance used across the app */
export const http = axios.create({
  baseURL,
  timeout: DEFAULT_TIMEOUT_MS,
  // Using Bearer tokens, not cookies:
  withCredentials: false,
  headers: {
    // Set a consistent Accept header; Content-Type is set per request body
    Accept: 'application/json',
  },
});

/** Request interceptor: attach Authorization if we have a token */
http.interceptors.request.use((config: any) => {
  const token = readToken();

  if (token) {
    // Initialize headers if not present
    if (!config.headers) {
      config.headers = {};
    }
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  return config;
});

/** Response interceptor: handle 401 with token refresh retry */
http.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug(
        '[HTTP]',
        response.status,
        response.config.method?.toUpperCase(),
        response.config.url
      );
    }
    return response;
  },
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as any;

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(
        '[HTTP ERROR]',
        status,
        error.config?.method?.toUpperCase(),
        error.config?.url,
        error.response?.data
      );
    }

    // On 401, attempt to refresh token and retry the request
    if ((status === 401 || status === 419 || status === 498) && !original?._retry) {
      original._retry = true;

      // Only one refresh attempt at a time
      if (!isRefreshing) {
        isRefreshing = true;
        
        try {
          const newToken = await refreshAccessToken();
          isRefreshing = false;
          notifyWaiters(newToken);

          if (newToken) {
            // Retry the original request with new token
            original.headers = original.headers ?? {};
            original.headers['Authorization'] = `Bearer ${newToken}`;
            return http.request(original);
          } else {
            // Refresh failed - clear tokens and notify
            if (!handling401) {
              handling401 = true;
              clearTokens?.();
              window.dispatchEvent(new CustomEvent('auth:unauthorized'));
              setTimeout(() => (handling401 = false), 500);
            }
          }
        } catch (refreshError) {
          isRefreshing = false;
          notifyWaiters(null);
          
          // Refresh errored - clear tokens
          if (!handling401) {
            handling401 = true;
            clearTokens?.();
            window.dispatchEvent(new CustomEvent('auth:unauthorized'));
            setTimeout(() => (handling401 = false), 500);
          }
        }
      } else {
        // Wait for the ongoing refresh
        const token = await new Promise<string | null>((resolve) => 
          refreshWaiters.push(resolve)
        );
        
        if (token) {
          original.headers = original.headers ?? {};
          original.headers['Authorization'] = `Bearer ${token}`;
          return http.request(original);
        }
      }
    }

    return Promise.reject(error);
  }
);

// Optional default export for compatibility
export default http;
