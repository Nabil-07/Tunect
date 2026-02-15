import { useEffect, useState } from 'react';
import { Download, Calendar, DollarSign, CheckCircle, X } from 'lucide-react';
import { api } from "../../lib/apiClient";
import { useToast } from '../../contexts/ToastContext';
import html2pdf from 'html2pdf.js';

interface Transaction {
  id: string;
  amountInMinor: number;
  currency: string;
  status: string;
  tokensPurchased: number;
  createdAt: string;
  updatedAt: string;
  providerOrderId?: string;
  metadata?: Record<string, any>;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const { showError } = useToast();

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const res = await api.get('/students/me/payments');
      const payments = Array.isArray(res.data) ? res.data : res.data?.items || [];
      // Filter to only SUCCEEDED payments
      setTransactions(payments.filter((p: any) => p.status === 'SUCCEEDED'));
    } catch (err: any) {
      showError('Failed to load transactions');
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amountInMinor: number, currency: string) => {
    const amount = amountInMinor / 100;
    if (currency === 'INR') return `₹${amount.toFixed(2)}`;
    if (currency === 'USD') return `$${amount.toFixed(2)}`;
    return `${amount.toFixed(2)} ${currency}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const downloadReceipt = (transaction: Transaction) => {
    // Generate receipt as PDF or HTML
    setSelectedTransaction(transaction);
    setShowReceipt(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Payment Transactions</h1>
          <p className="text-slate-600">View and download receipts for all your token purchases</p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ocean-600 mx-auto"></div>
            <p className="text-slate-600 mt-4">Loading transactions...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <DollarSign className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">No transactions yet</h3>
            <p className="text-slate-600">You haven't purchased any tokens yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition p-6"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-emerald-100 rounded-lg">
                        <CheckCircle className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900">
                          {tx.tokensPurchased} Tokens Purchased
                        </h3>
                        <p className="text-sm text-slate-600 flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatDate(tx.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6">
                    <div className="text-right">
                      <p className="text-2xl font-bold text-emerald-600">
                        {formatAmount(tx.amountInMinor, tx.currency)}
                      </p>
                      <p className="text-xs text-slate-500 text-right">
                        Order ID: {tx.providerOrderId || tx.id.slice(0, 8)}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => downloadReceipt(tx)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-700 transition text-sm font-medium"
                      >
                        <Download className="h-4 w-4" />
                        Receipt
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Receipt Modal */}
      {showReceipt && selectedTransaction && (
        <ReceiptModal
          transaction={selectedTransaction}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </div>
  );
}

interface ReceiptModalProps {
  transaction: Transaction;
  onClose: () => void;
}

function ReceiptModal({ transaction, onClose }: Readonly<ReceiptModalProps>) {
  const formatAmount = (amountInMinor: number, currency: string) => {
    const amount = amountInMinor / 100;
    if (currency === 'INR') return `₹${amount.toFixed(2)}`;
    if (currency === 'USD') return `$${amount.toFixed(2)}`;
    return `${amount.toFixed(2)} ${currency}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleDownloadPDF = () => {
    const receiptContent = document.getElementById('receipt-content');
    if (!receiptContent) return;

    const element = receiptContent.cloneNode(true) as HTMLElement;
    
    // Add inline styles for PDF
    element.style.padding = '20px';
    element.style.maxWidth = '600px';
    element.style.margin = '0 auto';
    element.style.fontFamily = 'Arial, sans-serif';

    const opt = {
      margin: 10,
      filename: `tunect-receipt-${transaction.id.slice(0, 8)}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
    };

    html2pdf().set(opt).from(element).save();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Receipt</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div id="receipt-content" className="p-8 bg-white">
          {/* Receipt Content */}
          <div className="max-w-md mx-auto bg-white">
            <div className="text-center mb-8">
              <div className="text-4xl font-bold text-blue-600 mb-2">TUNECT</div>
              <p className="text-sm text-slate-700 font-semibold">Tunect Private Limited</p>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Email: support@tunectnow.com<br/>
                Website: www.tunectnow.com
              </p>
            </div>

            <div className="border-t-4 border-b-4 border-slate-300 py-4 mb-8">
              <p className="text-center font-bold text-lg text-slate-900">PAYMENT RECEIPT</p>
              <p className="text-center text-xs text-slate-700 mt-2 font-semibold">
                Receipt #{transaction.id.slice(0, 12).toUpperCase()}
              </p>
            </div>

            <div className="space-y-5 mb-8">
              <div className="flex justify-between text-sm border-b border-slate-200 pb-3">
                <span className="text-slate-700 font-medium">Date</span>
                <span className="font-semibold text-slate-900">
                  {formatDate(transaction.createdAt)}
                </span>
              </div>

              <div className="flex justify-between text-sm border-b border-slate-200 pb-3">
                <span className="text-slate-700 font-medium">Order ID</span>
                <span className="font-semibold text-slate-900">
                  {transaction.providerOrderId || transaction.id.slice(0, 16)}
                </span>
              </div>

              <div className="flex justify-between text-sm border-b border-slate-200 pb-3">
                <span className="text-slate-700 font-medium">Payment Status</span>
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-800 rounded text-xs font-bold">
                  ✓ {transaction.status}
                </span>
              </div>
            </div>

            <div className="bg-slate-100 p-6 rounded-lg mb-8 border-2 border-slate-300">
              <div className="flex justify-between items-center mb-4 pb-4 border-b-2 border-slate-300">
                <span className="text-slate-800 font-bold text-lg">{transaction.tokensPurchased} Tokens</span>
                <span className="text-slate-800 font-bold text-lg">
                  {formatAmount(transaction.amountInMinor, transaction.currency)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-900 text-base">Total Amount Paid</span>
                <span className="text-2xl font-bold text-emerald-600">
                  {formatAmount(transaction.amountInMinor, transaction.currency)}
                </span>
              </div>
            </div>

            <div className="text-center text-xs text-slate-700 space-y-2 mb-8 bg-slate-50 p-4 rounded">
              <p>• Tokens are valid for 60 days from the date of purchase</p>
              <p>• Unused tokens will expire after 60 days</p>
              <p>• No refund after expiration</p>
            </div>

            <div className="border-t-2 border-slate-300 pt-6 text-center text-xs text-slate-700">
              <p className="font-semibold mb-2">Thank you for your purchase!</p>
              <p className="mb-4">For support, contact us at support@tunectnow.com</p>
              <p className="text-slate-500 text-xs italic">This receipt is valid without a signature</p>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 p-6 flex gap-3">
          <button
            onClick={handleDownloadPDF}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-ocean-600 text-white rounded-lg hover:bg-ocean-700 transition font-medium"
          >
            <Download className="h-5 w-5" />
            Download as PDF
          </button>
          <button
            onClick={onClose}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-slate-200 text-slate-900 rounded-lg hover:bg-slate-300 transition font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
