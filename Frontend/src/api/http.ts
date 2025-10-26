// src/api/http.ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, clearTokens } from '../lib/auth';

/** Normalize VITE_API_URL and ensure no trailing slash */
const rawBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const baseURL = rawBase.replace(/\/+$/, '');

/** Optional: change this if you want longer network waits */
const DEFAULT_TIMEOUT_MS = 15_000;

/** A small guard so we don't spam logout on bursts of 401s */
let handling401 = false;

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
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken?.();

  // Ensure headers object exists
  config.headers = config.headers ?? {};

  if (token) {
    // Set both cases defensively; don't clobber if caller explicitly set it
    (config.headers as any).Authorization =
      (config.headers as any).Authorization ?? `Bearer ${token}`;
    (config.headers as any).authorization =
      (config.headers as any).authorization ?? `Bearer ${token}`;
  } else {
    // Optional: if no token, make sure we don't send a stale header
    delete (config.headers as any).Authorization;
    delete (config.headers as any).authorization;
  }

  return config;
});

/** Response interceptor: central 401 trap + lightweight logging in dev */
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
  (error: AxiosError) => {
    const status = error.response?.status;

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

    // Treat 401 (and optionally 419/498) as unauthorized
    if ((status === 401 || status === 419 || status === 498) && !handling401) {
      handling401 = true;
      try {
        clearTokens?.();
        // Broadcast a logout event so auth-aware parts of the app can react (router, stores)
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        // If you prefer an immediate redirect, uncomment:
        // window.location.href = '/login';
      } finally {
        // Give a short buffer to avoid multiple rapid fires
        setTimeout(() => (handling401 = false), 500);
      }
    }

    return Promise.reject(error);
  }
);

// Optional default export for compatibility
export default http;
