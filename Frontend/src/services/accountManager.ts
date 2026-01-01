/**
 * AccountManager - Manages multiple user accounts in localStorage
 * Allows users to switch between accounts without re-logging in (like Gmail/YouTube)
 * 
 * ⚠️ NOTE: Multi-account switching feature is currently DISABLED
 * This file is ready for next release but not currently in use.
 * See AuthContext.tsx for restoration instructions.
 */

export interface StoredAccount {
  id: string;
  email: string;
  role: 'STUDENT' | 'TUTOR' | 'ADMIN';
  name?: string;
  avatar?: string;
  accessToken: string;
  refreshToken: string;
  lastUsed: number;
  student?: { id: string } | null;
  tutor?: { id: string } | null;
}

interface AccountStorage {
  accounts: StoredAccount[];
  activeAccountId: string | null;
}

const STORAGE_KEY = 'tunect_accounts';

class AccountManager {
  /**
   * Get all stored accounts
   */
  getAllAccounts(): StoredAccount[] {
    const data = this.getStorage();
    return data.accounts.sort((a, b) => b.lastUsed - a.lastUsed);
  }

  /**
   * Get currently active account
   */
  getActiveAccount(): StoredAccount | null {
    const data = this.getStorage();
    if (!data.activeAccountId) return null;
    
    return data.accounts.find(acc => acc.id === data.activeAccountId) || null;
  }

  /**
   * Add or update an account
   */
  addAccount(user: any, accessToken: string, refreshToken: string): StoredAccount {
    const data = this.getStorage();
    
    const account: StoredAccount = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      avatar: user.avatar,
      accessToken,
      refreshToken,
      lastUsed: Date.now(),
      student: user.student,
      tutor: user.tutor,
    };

    // Remove existing account with same ID if exists
    const filtered = data.accounts.filter(acc => acc.id !== account.id);
    
    // Add new account
    filtered.push(account);

    // Set as active
    data.accounts = filtered;
    data.activeAccountId = account.id;

    this.saveStorage(data);
    return account;
  }

  /**
   * Switch to a different account
   */
  switchAccount(accountId: string): StoredAccount | null {
    const data = this.getStorage();
    const account = data.accounts.find(acc => acc.id === accountId);
    
    if (!account) return null;

    // Update last used timestamp
    account.lastUsed = Date.now();
    
    // Set as active
    data.activeAccountId = accountId;
    
    this.saveStorage(data);
    return account;
  }

  /**
   * Remove an account (logout specific account)
   */
  removeAccount(accountId: string): void {
    const data = this.getStorage();
    
    // Remove the account
    data.accounts = data.accounts.filter(acc => acc.id !== accountId);
    
    // If it was the active account, clear active or switch to most recent
    if (data.activeAccountId === accountId) {
      if (data.accounts.length > 0) {
        // Switch to most recently used account
        const sorted = data.accounts.sort((a, b) => b.lastUsed - a.lastUsed);
        data.activeAccountId = sorted[0].id;
      } else {
        data.activeAccountId = null;
      }
    }

    this.saveStorage(data);
  }

  /**
   * Remove all accounts (logout all) - for security
   */
  clearAll(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Remove all accounts (logout all)
   */
  removeAllAccounts(): void {
    this.clearAll();
  }

  /**
   * Update account tokens (for refresh)
   */
  updateTokens(accountId: string, accessToken: string, refreshToken?: string): void {
    const data = this.getStorage();
    const account = data.accounts.find(acc => acc.id === accountId);
    
    if (!account) return;

    account.accessToken = accessToken;
    if (refreshToken) {
      account.refreshToken = refreshToken;
    }
    account.lastUsed = Date.now();

    this.saveStorage(data);
  }

  /**
   * Update account user info
   */
  updateAccountInfo(accountId: string, updates: Partial<Pick<StoredAccount, 'name' | 'avatar' | 'email'>>): void {
    const data = this.getStorage();
    const account = data.accounts.find(acc => acc.id === accountId);
    
    if (!account) return;

    Object.assign(account, updates);
    this.saveStorage(data);
  }

  /**
   * Check if user already has an account
   */
  hasAccount(userId: string): boolean {
    const data = this.getStorage();
    return data.accounts.some(acc => acc.id === userId);
  }

  /**
   * Get account count
   */
  getAccountCount(): number {
    return this.getAllAccounts().length;
  }

  // Private methods

  private getStorage(): AccountStorage {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { accounts: [], activeAccountId: null };
      }
      return JSON.parse(raw);
    } catch {
      return { accounts: [], activeAccountId: null };
    }
  }

  private saveStorage(data: AccountStorage): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('Failed to save accounts:', err);
    }
  }
}

// Export singleton instance
export const accountManager = new AccountManager();
