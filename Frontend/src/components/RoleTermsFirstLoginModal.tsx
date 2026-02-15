type RoleType = 'STUDENT' | 'TUTOR';

type Props = {
  open: boolean;
  role: RoleType;
  onAccept: () => void;
  onDecline: () => void;
  submitting?: boolean;
};

function StudentTerms() {
  return (
    <ul className="list-disc pl-5 space-y-2 text-sm text-slate-700">
      <li>You use Tunect to book tutoring sessions with tutors on the platform.</li>
      <li>Demo sessions are free and limited to one demo per tutor per student.</li>
      <li>Cancellation refunds to token balance: before slot assigned 100%, 48+ hours 100%, 24-48 hours 50%, under 24 hours or no-show 0%.</li>
      <li>Tutor cancellation gives a 100% token refund.</li>
      <li>Tokens are used to pay for sessions, are non-transferable between accounts, and refunds are generally returned to token balance.</li>
      <li>You can request a refund under the 7-day policy when eligible; admin reviews per policy.</li>
      <li>No off-platform payments for sessions booked on Tunect.</li>
      <li>Do not share phone/email/social handles in chat; repeated violations may lead to suspension/ban and forfeiture per policy.</li>
      <li>Your acceptance is recorded for admin future reference.</li>
    </ul>
  );
}

function TutorTerms() {
  return (
    <ul className="list-disc pl-5 space-y-2 text-sm text-slate-700">
      <li>You provide tutoring services through Tunect and must complete required verification/KYC before paid services.</li>
      <li>Keep availability updated, attend on time, deliver full session duration, and act professionally.</li>
      <li>Platform fee slabs: ₹0-₹399: 25%, ₹400-₹699: 22%, ₹700+: 18%.</li>
      <li>If you do not join a scheduled class within 10 minutes, 1 demerit point is applied.</li>
      <li>On reaching 3 demerit points, an extra +3% platform fee is charged for your next 10 bookings (for example, 25% becomes 28%), then it returns to your normal slab.</li>
      <li>If you continue missing scheduled bookings even after penalty, company-held earnings may be withheld and the account may be permanently suspended.</li>
      <li>Earnings are subject to platform fees; payouts follow platform payout schedule/threshold; taxes are your responsibility.</li>
      <li>Repeated tutor cancellations can reduce visibility or cause suspension; tutor cancellations trigger student compensation per policy.</li>
      <li>No off-platform transactions or solicitation (including moving students to WhatsApp/phone/external payments).</li>
      <li>PII enforcement applies in chat; repeated violations may lead to bans and forfeiture of wallet balance.</li>
      <li>No harassment, discrimination, sexual content, or unsafe behavior.</li>
      <li>Your acceptance is recorded for admin future reference.</li>
    </ul>
  );
}

export default function RoleTermsFirstLoginModal({
  open,
  role,
  onAccept,
  onDecline,
  submitting = false,
}: Readonly<Props>) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-xl font-bold text-slate-900">Terms & Conditions</h2>
          <p className="text-sm text-slate-600 mt-1">
            First-time login requires acceptance before you can use the dashboard.
          </p>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          <p className="text-sm font-semibold text-slate-800 mb-3">
            {role === 'STUDENT' ? 'Student Terms - Key Points' : 'Tutor Terms - Key Points'}
          </p>
          {role === 'STUDENT' ? <StudentTerms /> : <TutorTerms />}

          <p className="mt-4 text-xs text-slate-500">
            Please also review the full policies: <a href="/terms" className="text-ocean-700 hover:underline">Terms of Use</a> and <a href="/privacy" className="text-ocean-700 hover:underline">Privacy Policy</a>.
          </p>
        </div>

        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onDecline}
            disabled={submitting}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Decline & Logout
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-ocean-700 text-white hover:bg-ocean-800 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'I Agree'}
          </button>
        </div>
      </div>
    </div>
  );
}
