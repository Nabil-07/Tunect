import api from '../lib/apiClient';

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type AvatarUploadResponse = {
  id?: string;
  avatarUrl?: string | null;
  updatedAt?: string;
};

function shouldUseDirectMultipartUpload() {
  if (globalThis.window === undefined) return false;
  const host = globalThis.window.location.hostname;
  const env = (import.meta.env.VITE_ENV || '').toString().toLowerCase();
  const isPreprodHost = host.endsWith('.preprod.tunectnow.com');
  const ua = globalThis.window.navigator?.userAgent || '';
  const isSafari = /safari/i.test(ua) && !/chrome|chromium|android|crios|fxios|edg/i.test(ua);
  return host === 'localhost' || host === '127.0.0.1' || env === 'preprod' || isPreprodHost || isSafari;
}

function validateAvatarFile(file: File) {
  if (!AVATAR_ALLOWED_MIMES.has(file.type)) {
    throw new Error('Only JPG, PNG, and WEBP images are allowed.');
  }

  if (file.size > AVATAR_MAX_BYTES) {
    throw new Error('Avatar image must be 5MB or smaller.');
  }
}

async function uploadWithPresign(file: File, reposition = false): Promise<AvatarUploadResponse> {
  const presign = await api.post<{ key: string; uploadUrl: string; expiresAt: string }>(
    '/uploads/presign',
    {
      useCase: 'avatars',
      mimeType: file.type,
      size: file.size,
    },
  );

  const { key, uploadUrl } = presign.data;
  if (!key || !uploadUrl) {
    throw new Error('Invalid presign response from server.');
  }

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!putRes.ok) {
    throw new Error(`Failed to upload image to storage (HTTP ${putRes.status}).`);
  }

  const finalize = await api.post<AvatarUploadResponse>('/users/me/avatar/finalize', {
    avatarKey: key,
    avatarUrl: key,
    ...(reposition ? { reposition: true } : {}),
  });
  return finalize.data;
}

async function uploadWithMultipart(file: File, reposition = false): Promise<AvatarUploadResponse> {
  const fd = new FormData();
  fd.append('file', file);
  if (reposition) fd.append('reposition', 'true');

  const res = await api.post<AvatarUploadResponse>('/users/me/avatar', fd, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return res.data;
}

export async function uploadMyAvatar(file: File, reposition = false): Promise<AvatarUploadResponse> {
  validateAvatarFile(file);

  if (shouldUseDirectMultipartUpload()) {
    return uploadWithMultipart(file, reposition);
  }

  try {
    return await uploadWithPresign(file, reposition);
  } catch (error: any) {
    const requestUrl = String(error?.config?.url || '');
    const responseStatus = Number(error?.response?.status || 0);
    const message = String(error?.message || '').toLowerCase();

    const isPresignEndpointFailure = requestUrl.includes('/uploads/presign') && (responseStatus === 404 || responseStatus >= 500);
    const isS3PutTransportFailure =
      message.includes('failed to fetch') ||
      message.includes('network') ||
      message.includes('load failed');

    if (!isPresignEndpointFailure && !isS3PutTransportFailure) {
      throw error;
    }

    return uploadWithMultipart(file, reposition);
  }
}
