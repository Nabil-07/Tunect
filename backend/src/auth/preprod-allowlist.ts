import { ConfigService } from '@nestjs/config';

const FALLBACK_ALLOWED_EMAILS = [
  'fauzia.tabassum@tunectnow.com',
  'shifa.abida@tunectnow.com',
  'nazmeen.rahman@tunectnow.com',
  'nabil.irshad@tunectnow.com',
].map((email) => email.toLowerCase());

function normalizeList(list: string): string[] {
  return list
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function getPreprodAllowedEmails(cfg: ConfigService): string[] {
  const raw = cfg.get<string>('PREPROD_ALLOWED_EMAILS');
  if (raw && raw.trim().length > 0) {
    return normalizeList(raw);
  }

  return FALLBACK_ALLOWED_EMAILS;
}

export function isPreprodAllowedEmail(cfg: ConfigService, email?: string): boolean {
  if (!email) return false;
  const allowed = getPreprodAllowedEmails(cfg);
  return allowed.includes(email.toLowerCase());
}