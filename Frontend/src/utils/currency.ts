// Simple currency helpers with cached FX rates (base USD)

export type FxRates = Record<string, number>; // e.g., { EUR: 0.92, INR: 83.2 }

// Country (ISO-2) to currency code mapping (common). Defaults to USD.
export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  IN: 'INR',
  AE: 'AED',
  US: 'USD',
  GB: 'GBP',
  CA: 'CAD',
  AU: 'AUD',
  NZ: 'NZD',
  SG: 'SGD',
  JP: 'JPY',
  CN: 'CNY',
  HK: 'HKD',
  EU: 'EUR',
  FR: 'EUR',
  DE: 'EUR',
  IT: 'EUR',
  ES: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
};

const STORAGE_KEY = 'fx_rates_usd_v1';
const TTL_MS = 1000 * 60 * 60; // 1 hour

/** Fetch USD base rates and cache in localStorage. */
export async function getUsdRates(): Promise<FxRates> {
  try {
    const cachedRaw = localStorage.getItem(STORAGE_KEY);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (cached?.ts && Date.now() - cached.ts < TTL_MS && cached?.rates) return cached.rates as FxRates;
    }

    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const json = await res.json();
    if (json?.result === 'success' && json?.rates) {
      const rates: FxRates = json.rates;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now(), rates }));
      return rates;
    }
  } catch (_) {
    // ignore and fall through
  }
  // Fallback snapshot for critical currencies
  return {
    USD: 1,
    INR: 83,
    EUR: 0.92,
    GBP: 0.78,
    AED: 3.67,
    AUD: 1.5,
    CAD: 1.35,
    SGD: 1.35,
    JPY: 155,
    CNY: 7.25,
    HKD: 7.8,
  };
}

export function currencyForCountry(code?: string): string {
  if (!code) return 'USD';
  return COUNTRY_TO_CURRENCY[code] || 'USD';
}

export function formatCurrency(amount: number, currency = 'USD', locale?: string) {
  try {
    return new Intl.NumberFormat(locale || undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Convert from INR (database storage) to target currency */
export async function convertFromINR(amountInINR: number, targetCurrency: string): Promise<number> {
  if (targetCurrency === 'INR') return amountInINR;
  
  const rates = await getUsdRates();
  const inrRate = rates['INR'] || 83;
  const targetRate = rates[targetCurrency] || 1;
  
  // INR -> USD -> Target
  const inUSD = amountInINR / inrRate;
  const inTarget = inUSD * targetRate;
  
  return inTarget;
}

/** Format price with currency conversion from INR */
export async function formatPriceFromINR(amountInINR: number, targetCurrency: string, locale?: string): Promise<string> {
  const converted = await convertFromINR(amountInINR, targetCurrency);
  return formatCurrency(converted, targetCurrency, locale);
}
