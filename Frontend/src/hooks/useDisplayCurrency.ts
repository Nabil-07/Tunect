import { useCallback, useEffect, useMemo, useState } from 'react';
import { getUsdRates, formatCurrency } from '../utils/currency';

export function useDisplayCurrency() {
  const [currency, setCurrency] = useState<string>(() => {
    try {
      return localStorage.getItem('preferred_currency') || 'INR';
    } catch {
      return 'INR';
    }
  });
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });

  useEffect(() => {
    getUsdRates().then(setRates).catch(() => {});
    try {
      const c = localStorage.getItem('preferred_currency');
      if (c) setCurrency(c);
    } catch {}
  }, []);

  const convertFromINR = useCallback(
    (amountInInr: number | undefined | null) => {
      if (amountInInr == null) return undefined as unknown as number;
      const r = (code: string) => rates[code] ?? 1; // USD->code
      return Math.round((amountInInr * (r(currency) / Math.max(r('INR'), 1e-9)) + Number.EPSILON) * 100) / 100;
    },
    [rates, currency]
  );

  const format = useCallback((amount: number | undefined) => {
    if (amount == null) return '';
    return formatCurrency(amount, currency);
  }, [currency]);

  return useMemo(() => ({ currency, setCurrency, rates, convertFromINR, format }), [currency, rates, convertFromINR, format]);
}

