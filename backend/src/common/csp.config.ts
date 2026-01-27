/**
 * Content Security Policy (CSP) configuration for Helmet.
 * Environment-aware: dev allows Swagger inline scripts/styles; prod stays strict.
 *
 * Allows: 'self', Razorpay, LiveKit (wss + https), Vercel assets, API domain.
 * WebSockets for LiveKit; blob: for video; avoids 'unsafe-inline' in production.
 */

import type { ConfigService } from '@nestjs/config';

export type CspConfigInput = {
  config: ConfigService;
  isProd: boolean;
};

function parseOrigin(url: string | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim().replace(/\/+$/, '');
  if (!u) return null;
  try {
    const parsed = new URL(u.startsWith('http') ? u : `https://${u}`);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

/** Derive LiveKit wss + https origins from LIVEKIT_HOST (e.g. wss://livekit-preprod.tunectnow.com). */
function liveKitOrigins(host: string | undefined): string[] {
  const out: string[] = [];
  if (!host || typeof host !== 'string') return out;
  const s = host.trim().replace(/^wss:\/\//i, '').replace(/^https:\/\//i, '').replace(/\/+$/, '');
  if (!s) return out;
  out.push(`wss://${s}`, `https://${s}`);
  return out;
}

/** Build CSP directives for Helmet. Do NOT disable CSP. */
export function buildCspDirectives(input: CspConfigInput): Record<string, string[]> {
  const { config, isProd } = input;
  const appUrl = parseOrigin(config.get<string>('APP_URL') ?? 'http://localhost:3000');
  const frontendUrl = parseOrigin(config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173');
  const livekitHost = config.get<string>('LIVEKIT_HOST');
  const lk = liveKitOrigins(livekitHost);

  const self = "'self'";
  const razorpay = ['https://checkout.razorpay.com', 'https://api.razorpay.com'];
  const vercel = ['https://*.vercel.app'];
  const tunectFrontends = ['https://tunectnow.com', 'https://*.preprod.tunectnow.com'];
  const apiOrigin = appUrl ? [appUrl] : [];
  const frontendOrigins = frontendUrl ? [frontendUrl] : [];
  const devOrigins = isProd ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'];

  const connectSrc = [self, ...apiOrigin, ...frontendOrigins, ...tunectFrontends, ...razorpay, ...vercel, ...lk, ...devOrigins].filter(Boolean);
  const frameSrc = [self, 'https://checkout.razorpay.com'];
  const scriptSrc = [self, 'https://checkout.razorpay.com', ...vercel, ...tunectFrontends, ...(isProd ? [] : ["'unsafe-inline'"])];
  const styleSrc = [self, ...vercel, ...tunectFrontends, ...(isProd ? [] : ["'unsafe-inline'"])];
  const imgSrc = [self, 'data:', 'blob:', ...vercel, ...tunectFrontends];
  const mediaSrc = [self, 'blob:'];
  const fontSrc = [self, ...vercel, ...tunectFrontends];
  const workerSrc = [self, 'blob:'];
  const objectSrc = ["'none'"];
  const baseUri = [self];
  const formAction = [self];
  const defaultSrc = [self];

  return {
    'default-src': defaultSrc,
    'script-src': scriptSrc,
    'style-src': styleSrc,
    'img-src': imgSrc,
    'connect-src': connectSrc,
    'frame-src': frameSrc,
    'media-src': mediaSrc,
    'font-src': fontSrc,
    'worker-src': workerSrc,
    'object-src': objectSrc,
    'base-uri': baseUri,
    'form-action': formAction,
  };
}
