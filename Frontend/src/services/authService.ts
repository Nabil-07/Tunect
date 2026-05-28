// src/services/authService.ts
import { http as api } from '../api/http';
import { getAccessToken, clearTokens } from '../lib/auth';
import { writeToken, writeRefreshToken } from '../lib/apiClient';
import { decryptObject, looksLikeJwt, unwrapAuthToken } from '../utils/decryption';

export type RoleApi = "STUDENT" | "TUTOR" | "ADMIN";
export type SignupRoleUi = "student" | "tutor";

type LoginResponse = {
  access_token?: string;
  accessToken?: string;
  token?: string;
  jwt?: string;
  refresh_token?: string;
  refreshToken?: string;
  user?: { id: string; email: string; role?: RoleApi | string; name?: string };
};

const pickAccess = (d?: LoginResponse | null) =>
  d?.access_token || d?.accessToken || d?.token || d?.jwt || "";

const pickRefresh = (d?: LoginResponse | null) =>
  d?.refresh_token || d?.refreshToken || "";

const normRole = (r?: string | null): RoleApi | null => {
  if (!r) return null;
  const up = String(r).toUpperCase();
  return (["STUDENT", "TUTOR", "ADMIN"] as RoleApi[]).includes(up as RoleApi)
    ? (up as RoleApi)
    : null;
};

export function getRole(): RoleApi | null {
  try {
    const raw = localStorage.getItem("role");
    return normRole(raw);
  } catch {
    return null;
  }
}

export function setRole(role: RoleApi | null) {
  try {
    if (role) localStorage.setItem("role", role);
    else localStorage.removeItem("role");
  } catch {}
}

async function persistAuth(data: LoginResponse) {
  // Decrypt tokens if they were encrypted by the backend interceptor
  const rawAccess = pickAccess(data);
  const rawRefresh = pickRefresh(data);

  const access = await unwrapAuthToken(rawAccess);
  if (!access) {
    const looksEncrypted =
      !!rawAccess && rawAccess.length >= 64 && !looksLikeJwt(rawAccess);
    throw new Error(
      looksEncrypted
        ? 'Login succeeded but the access token could not be decrypted. Set VITE_ENCRYPTION_KEY on Vercel to match backend ENCRYPTION_KEY, or redeploy the latest backend.'
        : 'Login succeeded but no access token returned.',
    );
  }

  const refresh = await unwrapAuthToken(rawRefresh);

  // Save tokens using the proper auth utility that respects storage preference
  writeToken(access);
  if (refresh) writeRefreshToken(refresh);

  // Persist user + role (default to STUDENT to keep UI predictable)
  const role =
    normRole(data?.user?.role) ??
    normRole(localStorage.getItem("role")) ??
    ("STUDENT" as RoleApi);
  setRole(role);

  if (data?.user) {
    try {
      const prev = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({ ...prev, ...data.user }));
    } catch {}
  }

  try {
    window.dispatchEvent(new CustomEvent("auth:login"));
  } catch {}
}

function saveUserProfileToLS(profile: any) {
  if (!profile) return;
  try {
    const prev = JSON.parse(localStorage.getItem("user") || "{}");
    const avatarUrl = profile?.avatarUrl ?? profile?.avatar ?? null;
    const merged = {
      ...prev,
      ...(profile?.name ? { name: profile.name } : {}),
      ...(profile?.email ? { email: profile.email } : {}),
      ...(profile?.role ? { role: profile.role } : {}),
      ...(profile?.id ? { id: profile.id } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
    };
    localStorage.setItem("user", JSON.stringify(merged));
  } catch {}
}

/** Try canonical /users/me first; then /me; then role-scoped fallbacks. */
export async function me(): Promise<any | null> {
  const t = getAccessToken();
  if (!t) {
    return null;
  }

  const candidates = ["/users/me", "/me", "/students/me", "/tutors/me"] as const;

  for (const url of candidates) {
    try {
      const { data } = await api.get(url);
      const decrypted = await decryptObject(data, ['avatarUrl', 'avatar', 'user.avatarUrl', 'user.avatar']);
      if (url.startsWith("/students")) setRole("STUDENT");
      if (url.startsWith("/tutors")) setRole("TUTOR");

      saveUserProfileToLS(decrypted);
      return decrypted ?? null;
    } catch (e: any) {
      const s = e?.response?.status;
      if (s === 401) return null;
      if (s === 404) continue;
    }
  }
  return null;
}

export async function login(email: string, password: string) {
  const { data } = await api.post<LoginResponse>("/auth/login", {
    email: email.trim().toLowerCase(),
    password,
  });
  await persistAuth(data);
  try {
    await me();
  } catch {}
  return data;
}

/**
 * Sign up does NOT persist auth anymore
 * The UI should call signup() then login().
 */
export async function signup(payload: {
  email: string;
  password: string;
  role: SignupRoleUi;
}) {
  try {
    const { data } = await api.post("/auth/register", {
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      role: payload.role.toUpperCase(), // STUDENT/TUTOR
    });
    return data ?? { ok: true };
  } catch (e: any) {
    const status = e?.response?.status;
    const msg = e?.response?.data?.message || e?.message;
    if (status === 409 || /already registered|unique|p2002/i.test(String(msg))) {
      throw new Error("Email already registered");
    }
    throw new Error(Array.isArray(msg) ? msg.join(", ") : String(msg || "Signup failed"));
  }
}

export function logout() {
  try {
    writeToken(null);
    writeRefreshToken(null);
    localStorage.removeItem("role");
    localStorage.removeItem("user");
  } finally {
    clearTokens();
    try {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    } catch {}
  }
}

/** Update current user profile (name, preferredCurrency, etc.) */
export async function updateMe(data: { name?: string; preferredCurrency?: string; avatarUrl?: string | null }): Promise<any> {
  const { data: updated } = await api.patch('/users/me', data);
  saveUserProfileToLS(updated);
  return updated;
}

export async function changePassword(payload: { currentPassword?: string; newPassword: string }): Promise<{ ok: boolean; hasPassword?: boolean }> {
  try {
    const { data } = await api.patch('/users/me/password', payload);
    return data;
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || 'Unable to update password';
    throw new Error(Array.isArray(msg) ? msg.join(', ') : String(msg));
  }
}

/* ---------------- Forgot Password (email or phone + OTP) ---------------- */

type StartPayload = { method: "email" | "phone"; value: string };
type StartResponse = { resetId: string; maskedDestination?: string; ttl?: number; exists?: boolean };

type VerifyPayload = { resetId: string; otp: string };
type VerifyResponse = { token: string };

type ResendPayload = { resetId: string };

type FinalizePayload = { token: string; password: string };

async function postFirstAvailable<T>(paths: string[], body: any): Promise<T> {
  let lastErr: any;
  for (const p of paths) {
    try {
      const { data } = await api.post<T>(p, body);
      return data;
    } catch (e: any) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function requestPasswordResetStart(payload: StartPayload): Promise<StartResponse> {
  try {
    const data = await postFirstAvailable<StartResponse>(
      ["/auth/password/forgot/start", "/auth/forgot-password/start", "/auth/forgot/start"],
      payload
    );
    if (data?.exists === false) {
      throw new Error(
        `${payload.method === "email" ? "Email" : "Phone number"} does not exist`
      );
    }
    return data;
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || "Could not start password reset";
    throw new Error(Array.isArray(msg) ? msg.join(", ") : String(msg));
  }
}

export async function requestPasswordResetVerify(payload: VerifyPayload): Promise<VerifyResponse> {
  try {
    const data = await postFirstAvailable<VerifyResponse>(
      ["/auth/password/forgot/verify", "/auth/forgot-password/verify", "/auth/forgot/verify"],
      payload
    );
    return data;
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || "Invalid or expired OTP";
    throw new Error(Array.isArray(msg) ? msg.join(", ") : String(msg));
  }
}

export async function requestPasswordResetResend(payload: ResendPayload): Promise<{ ok: boolean }> {
  try {
    const data = await postFirstAvailable<{ ok: boolean }>(
      ["/auth/password/forgot/resend", "/auth/forgot-password/resend", "/auth/forgot/resend"],
      payload
    );
    return data;
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || "Could not resend OTP";
    throw new Error(Array.isArray(msg) ? msg.join(", ") : String(msg));
  }
}

export async function verifyEmail(token: string): Promise<{ message: string }> {
  try {
    const { data } = await api.get<{ message: string }>(`/auth/verify-email?token=${encodeURIComponent(token)}`);
    return data;
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || "Email verification failed";
    throw new Error(Array.isArray(msg) ? msg.join(", ") : String(msg));
  }
}

export async function resendVerificationEmail(): Promise<{ message: string }> {
  try {
    const { data } = await api.post<{ message: string }>("/auth/resend-verification");
    return data;
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || "Could not resend verification email";
    throw new Error(Array.isArray(msg) ? msg.join(", ") : String(msg));
  }
}

export async function requestPasswordResetFinalize(payload: FinalizePayload): Promise<{ ok: boolean }> {
  try {
    const data = await postFirstAvailable<{ ok: boolean }>(
      [
        "/auth/password/forgot/finalize",
        "/auth/forgot-password/finalize",
        "/auth/forgot/finalize",
        "/auth/reset-password",
      ],
      payload
    );
    return data;
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || "Unable to update password";
    throw new Error(Array.isArray(msg) ? msg.join(", ") : String(msg));
  }
}

export default {
  login,
  signup,
  me,
  logout,
  getRole,
  setRole,
  changePassword,
  requestPasswordResetStart,
  requestPasswordResetVerify,
  requestPasswordResetResend,
  requestPasswordResetFinalize,
};
