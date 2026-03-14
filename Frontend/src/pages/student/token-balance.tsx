import { useEffect, useState } from 'react';
import { Coins, TrendingDown, TrendingUp, IndianRupee, Clock } from 'lucide-react';
import api from '../../lib/apiClient';
import { useToast } from '../../contexts/ToastContext';

type TutorTokenBalance = {
  id: string;
  tutorId: string;
  balance: number;
  pricePerToken: number;
  tutor: {
    id: string;
    user: {
      name: string;
      email: string;
      avatarUrl?: string;
    };
    hourlyRate: number;
  };
};

type TokenLedger = {
  id: string;
  studentId: string;
  tutorId: string;
  delta: number;
  reason: string;
  createdAt: string;
  tutor?: {
    user: {
      name: string;
    };
  };
};

export default function StudentTokenBalance() {
  const { showError } = useToast();
  const [balances, setBalances] = useState<TutorTokenBalance[]>([]);
  const [ledger, setLedger] = useState<TokenLedger[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [loadingLedger, setLoadingLedger] = useState(true);
  const [activeTab, setActiveTab] = useState<'balances' | 'history'>('balances');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    // ✅ Load balances independently
    api.get<TutorTokenBalance[]>('/students/me/token-balances')
      .then(res => setBalances(Array.isArray(res.data) ? res.data : []))
      .catch(err => showError(err?.response?.data?.message || 'Failed to load balances'))
      .finally(() => setLoadingBalances(false));
    
    // ✅ Load ledger independently
    api.get<TokenLedger[]>('/students/me/token-ledger')
      .then(res => setLedger(Array.isArray(res.data) ? res.data : []))
      .catch(err => showError(err?.response?.data?.message || 'Failed to load history'))
      .finally(() => setLoadingLedger(false));
  }

  const totalTokens = balances.reduce((sum, b) => sum + Number(b.balance), 0);

  function renderBalancesTab() {
    if (loadingBalances) {
      return (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          <p className="mt-4 text-slate-600">Loading balances...</p>
        </div>
      );
    }
    if (balances.length === 0) {
      return (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <Coins className="mx-auto h-16 w-16 text-slate-400 mb-4" />
          <p className="text-slate-600">No token balances yet</p>
          <p className="text-sm text-slate-500 mt-2">
            Purchase tokens to start learning with your favorite tutors
          </p>
        </div>
      );
    }
    return (
      <div className="grid md:grid-cols-2 gap-6">
        {balances.map((balance) => (
          <div
            key={balance.id}
            className="bg-white border border-slate-200 rounded-lg p-6 hover:shadow-lg transition-shadow"
          >
            {/* Tutor Info */}
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-lg">
                {balance.tutor.user.name?.charAt(0) || 'T'}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-800">{balance.tutor.user.name}</h3>
              </div>
            </div>

            {/* Balance Details */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <span className="text-sm text-slate-700">Available Tokens</span>
                <span className="text-lg font-bold text-green-600 flex items-center gap-1">
                  <Coins className="h-5 w-5" />
                  {Number(balance.balance).toFixed(1)}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <span className="text-sm text-slate-700">Price per Token</span>
                <span className="text-lg font-bold text-blue-600 flex items-center gap-1">
                  <IndianRupee className="h-5 w-5" />
                  {Number(balance.pricePerToken).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                <span className="text-sm text-slate-700">Current Value</span>
                <span className="text-lg font-bold text-purple-600 flex items-center gap-1">
                  <IndianRupee className="h-5 w-5" />
                  {(Number(balance.balance) * Number(balance.pricePerToken)).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Action */}
            <button
              onClick={() => { globalThis.location.href = `/student/cart?tutorId=${balance.tutorId}`; }}
              data-testid="student-token-balance-buy-tokens-btn"
              className="mt-4 w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Buy More Tokens
            </button>
          </div>
        ))}
      </div>
    );
  }

  function renderHistoryTab() {
    if (loadingLedger) {
      return (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          <p className="mt-4 text-slate-600">Loading history...</p>
        </div>
      );
    }
    if (ledger.length === 0) {
      return (
        <div className="text-center py-12">
          <Clock className="mx-auto h-16 w-16 text-slate-400 mb-4" />
          <p className="text-slate-600">No transaction history yet</p>
        </div>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">Tutor</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-700 uppercase tracking-wider">Tokens</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {ledger.map((entry) => {
              const isCredit = Number(entry.delta) > 0;
              return (
                <tr key={entry.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {new Date(entry.createdAt).toLocaleDateString('en-IN', {
                      year: 'numeric', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-800">{entry.tutor?.user.name || 'Unknown'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      isCredit ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {isCredit ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {entry.reason.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold">
                    <span className={isCredit ? 'text-green-600' : 'text-red-600'}>
                      {isCredit ? '+' : ''}{Number(entry.delta).toFixed(1)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6" data-testid="student-token-balance-page">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">My Token Balance</h1>
        <p className="text-slate-600">
          Manage your token balances across different tutors
        </p>
      </div>

      {/* Summary Card */}
      <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg p-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm opacity-90 mb-1">Total Token Balance</p>
            <div className="flex items-center gap-2">
              <Coins className="h-8 w-8" />
              <span className="text-4xl font-bold">{totalTokens.toFixed(1)}</span>
            </div>
            <p className="text-sm opacity-75 mt-2">
              Across {balances.length} tutor{balances.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm opacity-90">Worth approximately</p>
            <div className="flex items-center justify-end gap-1 mt-1">
              <IndianRupee className="h-6 w-6" />
              <span className="text-2xl font-bold">
                {balances
                  .reduce((sum, b) => sum + Number(b.balance) * Number(b.pricePerToken), 0)
                  .toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-slate-200">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('balances')}
            data-testid="student-token-balance-balances-tab"
            className={`pb-3 px-1 border-b-2 font-medium transition-colors ${
              activeTab === 'balances'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-800'
            }`}
          >
            Tutor Balances
          </button>
          <button
            onClick={() => setActiveTab('history')}
            data-testid="student-token-balance-history-tab"
            className={`pb-3 px-1 border-b-2 font-medium transition-colors ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-800'
            }`}
          >
            Transaction History
          </button>
        </div>
      </div>

      {/* Balances Tab */}
      {activeTab === 'balances' && (
        <div>{renderBalancesTab()}</div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {renderHistoryTab()}
        </div>
      )}
    </div>
  );
}
