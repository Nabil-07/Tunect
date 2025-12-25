import { useCallback, useEffect, useMemo, useState } from 'react';
import { getUsdRates, formatCurrency } from '../utils/currency';
import { useAuth } from '../contexts/AuthContext';

export function useDisplayCurrency() {
  const { user } = useAuth() as any;
  const currency = user?.preferredCurrency || 'INR';
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });

  useEffect(() => {
    getUsdRates().then(setRates).catch(() => {});
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

  return useMemo(() => ({ currency, rates, convertFromINR, format }), [currency, rates, convertFromINR, format]);
}
