import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { StoredAccount } from '../services/accountManager';

export function AccountSwitcher() {
  const { user, accounts, switchAccount, removeAccount, loading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debug logs
  console.log('AccountSwitcher render:', { user, accounts: accounts?.length, userRole: user?.role });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const currentAccount = accounts?.find(acc => acc.id === user?.id);
  // Filter out accounts that don't have valid tokens
  const otherAccounts = accounts?.filter(acc => 
    acc.id !== user?.id && acc.accessToken && acc.accessToken.length > 0
  ) || [];

  console.log('AccountSwitcher state:', { currentAccount, otherAccountsCount: otherAccounts.length });

  if (!currentAccount && !user) {
    console.log('AccountSwitcher: No current account or user, not rendering');
    return null;
  }

  // If we have a user but no account in the accounts array, create a temporary one for display
  const displayAccount = currentAccount || {
    id: user?.id || '',
    email: user?.email || '',
    name: user?.name || '',
    role: user?.role || 'STUDENT',
    avatar: user?.avatar || '',
    accessToken: '',
    refreshToken: '',
    lastUsed: Date.now(),
  };

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      const parts = name.split(' ');
      return parts.length > 1
        ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
        : parts[0].substring(0, 2).toUpperCase();
    }
    if (email) {
      return email.substring(0, 2).toUpperCase();
    }
    return '??';
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-100 text-purple-700';
      case 'TUTOR':
        return 'bg-blue-100 text-blue-700';
      case 'STUDENT':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const AccountItem = ({ 
    account, 
    isCurrent = false, 
    onClick 
  }: { 
    account: StoredAccount; 
    isCurrent?: boolean; 
    onClick?: () => void;
  }) => (
    <div
      className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
        isCurrent ? 'bg-indigo-50' : 'hover:bg-gray-50'
      }`}
      onClick={onClick}
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        {account.avatar ? (
          <img
            src={account.avatar}
            alt={account.name || account.email}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
            {getInitials(account.name, account.email)}
          </div>
        )}
      </div>

      {/* Account Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">
            {account.name || account.email}
          </p>
          {isCurrent && (
            <svg className="h-4 w-4 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate">{account.email}</p>
        <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${getRoleBadgeColor(account.role)}`}>
          {account.role}
        </span>
      </div>

      {/* Remove button (only for non-current accounts) */}
      {!isCurrent && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Remove ${account.email} from this browser?`)) {
              removeAccount(account.id);
            }
          }}
          className="flex-shrink-0 p-1 rounded-full hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
          title="Remove account"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Account switcher"
      >
        {displayAccount.avatar ? (
          <img
            src={displayAccount.avatar}
            alt={displayAccount.name || displayAccount.email}
            className="h-8 w-8 rounded-full object-cover ring-2 ring-white"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold text-xs ring-2 ring-white">
            {getInitials(displayAccount.name, displayAccount.email)}
          </div>
        )}

        
        {/* Down arrow */}
        <svg
          className={`h-4 w-4 text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50">
          {/* Current Account */}
          <div className="border-b border-gray-200">
            <AccountItem account={displayAccount} isCurrent />
          </div>

          {/* Other Accounts */}
          {otherAccounts.length > 0 && (
            <div className="border-b border-gray-200">
              <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Switch Account
              </div>
              {otherAccounts.map(account => (
                <AccountItem
                  key={account.id}
                  account={account}
                  onClick={async () => {
                    setSwitchingTo(account.id);
                    setIsOpen(false);
                    await switchAccount(account.id);
                    setSwitchingTo(null);
                  }}
                />
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="py-1">
            <button
              onClick={() => {
                window.location.href = '/login?add_account=true';
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add another account</span>
            </button>

            <button
              onClick={() => {
                if (confirm('Remove this account from this browser?')) {
                  removeAccount(displayAccount.id);
                  setIsOpen(false);
                }
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>

          {/* Account Count */}
          <div className="px-3 py-2 border-t border-gray-200 text-xs text-gray-500">
            {accounts?.length || 0} {(accounts?.length || 0) === 1 ? 'account' : 'accounts'}
          </div>
        </div>
      )}

      {/* Loading overlay when switching accounts */}
      {(loading || switchingTo) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 shadow-xl max-w-sm mx-4">
            <div className="flex items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <div>
                <p className="text-lg font-semibold text-gray-900">Switching Account...</p>
                <p className="text-sm text-gray-600">Please wait</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
