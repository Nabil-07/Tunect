// src/utils/timezone.ts
// Shared utility to get a user-friendly timezone abbreviation.
// Browsers inconsistently return "IST" vs "GMT+5:30" depending on locale/engine.
// This normalises common GMT offsets to their well-known abbreviations.

const GMT_TO_ABBR: Record<string, string> = {
  'GMT+5:30':  'IST',
  'GMT+05:30': 'IST',
  'GMT+5.5':   'IST',
  'GMT+9':     'JST',
  'GMT+09':    'JST',
  'GMT+8':     'CST',  // China Standard Time
  'GMT+08':    'CST',
  'GMT+9:30':  'ACST',
  'GMT+09:30': 'ACST',
  'GMT+10':    'AEST',
  'GMT+11':    'AEDT',
  'GMT+4':     'GST',
  'GMT+04':    'GST',
  'GMT+3':     'MSK',
  'GMT+03':    'MSK',
  'GMT+1':     'CET',
  'GMT+01':    'CET',
  'GMT+2':     'EET',
  'GMT+02':    'EET',
  'GMT-5':     'EST',
  'GMT-05':    'EST',
  'GMT-6':     'CST',
  'GMT-06':    'CST',
  'GMT-7':     'MST',
  'GMT-07':    'MST',
  'GMT-8':     'PST',
  'GMT-08':    'PST',
  'GMT-4':     'AST',
  'GMT-04':    'AST',
  'GMT-3':     'BRT',
  'GMT-03':    'BRT',
};

/**
 * Returns the user's timezone abbreviation in a friendly form.
 * Falls back to the raw Intl value if no mapping exists.
 */
export function getTimezoneAbbr(): string {
  try {
    const raw = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value;

    if (!raw) {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    }

    // If the browser already gives a nice abbreviation (e.g. "IST", "EST"), keep it
    if (!raw.startsWith('GMT')) return raw;

    // Normalise: strip whitespace
    const key = raw.replaceAll(' ', '');
    return GMT_TO_ABBR[key] || raw;
  } catch {
    return 'UTC';
  }
}
