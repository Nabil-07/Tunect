import { Request } from 'express';

/**
 * Extract endpoint and IP address from Express request
 */
export function extractAuditInfo(req: Request): { endpoint: string; ipAddress: string } {
  const endpoint = req.url || req.path || 'unknown';
  
  // Extract IP address (handle proxies)
  const ipAddress = 
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown';

  return { endpoint, ipAddress };
}
