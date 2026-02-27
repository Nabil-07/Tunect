function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function inferApiUrlFromHostname(hostname: string): string {
  const host = hostname.toLowerCase();

  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:3000';
  }

  if (host.endsWith('.preprod.tunectnow.com')) {
    return 'https://api-preprod.tunectnow.com';
  }

  if (host === 'tunectnow.com' || host === 'www.tunectnow.com' || host.endsWith('.tunectnow.com')) {
    return 'https://api.tunectnow.com';
  }

  return '';
}

export function resolveApiBaseUrl(): string {
  const configured = String(import.meta.env.VITE_API_URL || '').trim();
  if (configured) {
    return trimTrailingSlash(configured);
  }

  if (typeof window !== 'undefined') {
    const inferred = inferApiUrlFromHostname(window.location.hostname);
    if (inferred) {
      return inferred;
    }
  }

  return 'http://localhost:3000';
}

export function resolveSocketBaseUrl(): string {
  return resolveApiBaseUrl().replace(/\/api$/i, '');
}
