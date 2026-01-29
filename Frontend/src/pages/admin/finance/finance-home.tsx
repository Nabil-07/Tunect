import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { BarChart3, CreditCard, ArrowRight } from 'lucide-react';

export default function FinanceHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isDirector = !!user?.isDirector;

  const options = [
    {
      icon: BarChart3,
      title: 'Balance Sheet',
      description: 'Ledger-derived financial statements and reports',
      path: '/admin/finance/balance-sheet',
      restricted: true,
      badge: isDirector ? '' : 'Director Only',
    },
    {
      icon: CreditCard,
      title: 'Payments & Receipts',
      description: 'Track student payments and tutor payouts',
      path: '/admin/finance/payments',
      restricted: false,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Finance & Payments</h1>
        <p className="text-slate-600 mt-2">Manage platform finances, payments, and balance sheets</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {options.map((option) => {
          const Icon = option.icon;
          const isDisabled = option.restricted && !isDirector;

          return (
            <button
              key={option.path}
              onClick={() => !isDisabled && navigate(option.path)}
              disabled={isDisabled}
              className={`group rounded-2xl border-2 p-6 transition-all text-left ${
                isDisabled
                  ? 'border-slate-100 bg-slate-50 cursor-not-allowed opacity-60'
                  : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-lg hover:bg-indigo-50/30'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl ${isDisabled ? 'bg-slate-200' : 'bg-indigo-100 group-hover:bg-indigo-200'}`}>
                  <Icon className={`w-6 h-6 ${isDisabled ? 'text-slate-400' : 'text-indigo-600'}`} />
                </div>
                {!isDisabled && <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-transform" />}
              </div>
              
              <h3 className="text-xl font-bold mb-2">{option.title}</h3>
              <p className="text-slate-600 text-sm mb-4">{option.description}</p>

              {option.badge && (
                <span className="inline-block px-3 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-medium">
                  {option.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!isDirector && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            <span className="font-semibold">Note:</span> Balance Sheet access is restricted to Director-level admins. You can access Payments & Receipts.
          </p>
        </div>
      )}
    </div>
  );
}
