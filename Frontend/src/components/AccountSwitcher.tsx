import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

function initialsFrom(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return '??';
}

function roleBadge(role?: string | null) {
  switch (role?.toUpperCase()) {
    case 'ADMIN':
      return 'bg-purple-100 text-purple-700';
    case 'TUTOR':
      return 'bg-blue-100 text-blue-700';
    case 'STUDENT':
    default:
      return 'bg-green-100 text-green-700';
  }
}

function extractAvatar(candidate: unknown): string | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const withAvatar = candidate as { avatar?: string | null; avatarUrl?: string | null };
  const first = withAvatar.avatarUrl?.trim();
  if (first) return first;
  const fallback = withAvatar.avatar?.trim();
  return fallback || null;
}

export function AccountSwitcher() {
  const { user, loading, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (!user) {
    return null;
  }

  const avatarUrl = extractAvatar(user);
  const displayName = user.name?.trim() || user.email || 'Account';
  const displayEmail = user.email || 'No email available';
  const badge = roleBadge(user.role);

  const handleLogout = () => {
    setIsOpen(false);
    logout();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Account menu"
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="h-8 w-8 rounded-full object-cover ring-2 ring-white"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold text-xs ring-2 ring-white">
            {initialsFrom(user.name, user.email)}
          </div>
        )}
        <svg
          className={`h-4 w-4 text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50">
          <div className="flex items-center gap-3 px-3 py-3 border-b border-gray-200">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                {initialsFrom(user.name, user.email)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
              <p className="text-xs text-gray-500 truncate">{displayEmail}</p>
              <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${badge}`}>
                {user.role?.toUpperCase() || 'STUDENT'}
              </span>
            </div>
          </div>

          <div className="py-1">
            <button
              onClick={() => {
                setIsOpen(false);
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
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}

      {loading && (
        <span className="sr-only" aria-live="polite">Updating account information…</span>
      )}
    </div>
  );
}
