// Hook to get user's preferred currency from auth context
import { useAuth } from '../contexts/AuthContext';

export function useCurrency(): string {
  const { user } = useAuth() as any;
  return user?.preferredCurrency || 'INR';
}

export function useUserCurrency() {
  return useCurrency();
}
