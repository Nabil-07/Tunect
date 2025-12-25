// Component to display price with user's preferred currency
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { formatPriceFromINR } from '../utils/currency';

interface PriceDisplayProps {
  amountInINR: number;
  className?: string;
}

export function PriceDisplay({ amountInINR, className = '' }: PriceDisplayProps) {
  const { user } = useAuth() as any;
  const preferredCurrency = user?.preferredCurrency || 'INR';
  const [formattedPrice, setFormattedPrice] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    
    formatPriceFromINR(amountInINR, preferredCurrency)
      .then(price => {
        if (mounted) setFormattedPrice(price);
      })
      .catch(() => {
        if (mounted) setFormattedPrice(`${preferredCurrency} ${amountInINR}`);
      });

    return () => { mounted = false; };
  }, [amountInINR, preferredCurrency]);

  return <span className={className}>{formattedPrice || '—'}</span>;
}
