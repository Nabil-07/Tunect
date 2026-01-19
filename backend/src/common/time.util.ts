import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz';

const OFFSET_RE = /[zZ]|[+\-]\d{2}:\d{2}$/;
const TZ_ALIASES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
};

function normalizeTz(tz?: string) {
  if (!tz) return 'UTC';
  return TZ_ALIASES[tz] || tz;
}

export function toUtc(dateLike: string, tz?: string): Date {
  // If string includes an offset (e.g., 2025-08-10T18:00:00+05:30 or Z), parse directly.
  if (OFFSET_RE.test(dateLike)) return new Date(dateLike);
  // Otherwise treat it as local in the provided IANA tz and convert to UTC.
  return fromZonedTime(dateLike, normalizeTz(tz));
}

export function fromUtc(utcDate: Date, tz: string) {
  const safeTz = normalizeTz(tz);
  const localDate = toZonedTime(utcDate, safeTz);
  const iso = formatInTimeZone(utcDate, safeTz, "yyyy-MM-dd'T'HH:mm:ssXXX");
  return { date: localDate, iso };
}
