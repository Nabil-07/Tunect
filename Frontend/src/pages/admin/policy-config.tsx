import { useEffect, useMemo, useState } from 'react';
import { fetchAdminPolicyConfig, updateAdminPolicyConfig, type PolicyConfig } from '../../services/adminService';

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function AdminPolicyConfig() {
  const [config, setConfig] = useState<PolicyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [lastUpdatedBy, setLastUpdatedBy] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchAdminPolicyConfig();
        setConfig(res.config);
        setLastUpdatedAt(res.lastUpdatedAt);
        setLastUpdatedBy(res.lastUpdatedBy);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load policy config');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const canSave = useMemo(() => !!config && !saving, [config, saving]);

  const updateField = (path: string, value: string | number) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const keys = path.split('.');
      const leafKey = keys.at(-1);
      if (!leafKey) return prev;
      let cursor: any = next;
      for (let i = 0; i < keys.length - 1; i += 1) {
        cursor = cursor[keys[i]];
      }
      cursor[leafKey] = value;
      return next;
    });
    setSuccess(null);
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await updateAdminPolicyConfig(config);
      setConfig(res.config);
      setSuccess('Policy configuration updated successfully.');
      const refreshed = await fetchAdminPolicyConfig();
      setLastUpdatedAt(refreshed.lastUpdatedAt);
      setLastUpdatedBy(refreshed.lastUpdatedBy);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update policy config');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-slate-600 py-12 text-center">Loading policy configuration...</div>;
  if (error && !config) return <div className="text-rose-600 py-12 text-center">{error}</div>;
  if (!config) return <div className="text-slate-600 py-12 text-center">Policy configuration is unavailable.</div>;

  return (
    <div className="space-y-6" data-testid="policy-config-page">
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Policy Configuration</h1>
        <p className="text-slate-600 mt-2">Update legal and platform policy rules from admin without backend code edits.</p>
        <p className="text-xs text-slate-500 mt-2">
          Last updated: {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString() : '—'}
          {lastUpdatedBy ? ` by ${lastUpdatedBy}` : ''}
        </p>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Legal Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-sm text-slate-700">Business Name</span>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="policy-config-business-name-input" value={config.legal.businessName} onChange={(e) => updateField('legal.businessName', e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-700">CIN</span>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="policy-config-cin-input" value={config.legal.cin} onChange={(e) => updateField('legal.cin', e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-700">Official Email</span>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="policy-config-official-email-input" value={config.legal.officialEmail} onChange={(e) => updateField('legal.officialEmail', e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-700">Support Email</span>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="policy-config-support-email-input" value={config.legal.supportEmail} onChange={(e) => updateField('legal.supportEmail', e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-700">Support Phone</span>
            <input type="tel" className="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="policy-config-support-phone-input" placeholder="+91 XXXXXXXXXX" value={config.legal.supportPhone ?? ''} onChange={(e) => updateField('legal.supportPhone', e.target.value)} />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-700">Jurisdiction City</span>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="policy-config-jurisdiction-input" value={config.legal.jurisdictionCity} onChange={(e) => updateField('legal.jurisdictionCity', e.target.value)} />
          </label>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Student Policy</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-sm text-slate-700">Token Validity (days)</span>
            <input type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="policy-config-token-validity-input" value={config.student.tokenValidityDays} onChange={(e) => updateField('student.tokenValidityDays', toNumber(e.target.value, 60))} />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-700">Tutor Cancellation Bonus (%)</span>
            <input type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="policy-config-cancellation-bonus-input" value={config.student.tutorCancellationBonusPercent} onChange={(e) => updateField('student.tutorCancellationBonusPercent', toNumber(e.target.value, 0))} />
          </label>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Tutor Fee Slabs</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="space-y-1">
            <span className="text-sm text-slate-700">Low Slab Fee %</span>
            <input type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="policy-config-low-fee-input" value={config.tutor.feeSlabs.low.feePercent} onChange={(e) => updateField('tutor.feeSlabs.low.feePercent', toNumber(e.target.value, 25))} />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-700">Mid Slab Fee %</span>
            <input type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="policy-config-mid-fee-input" value={config.tutor.feeSlabs.mid.feePercent} onChange={(e) => updateField('tutor.feeSlabs.mid.feePercent', toNumber(e.target.value, 22))} />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-700">High Slab Fee %</span>
            <input type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="policy-config-high-fee-input" value={config.tutor.feeSlabs.high.feePercent} onChange={(e) => updateField('tutor.feeSlabs.high.feePercent', toNumber(e.target.value, 18))} />
          </label>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Tutor Demerit Rules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <label className="space-y-1">
            <span className="text-sm text-slate-700">Late Join Threshold (minutes)</span>
            <input type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="policy-config-late-join-input" value={config.tutor.demerit.lateJoinMinutes} onChange={(e) => updateField('tutor.demerit.lateJoinMinutes', toNumber(e.target.value, 10))} />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-700">Demerit Threshold (points)</span>
            <input type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="policy-config-demerit-threshold-input" value={config.tutor.demerit.thresholdPoints} onChange={(e) => updateField('tutor.demerit.thresholdPoints', toNumber(e.target.value, 3))} />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-700">Extra Fee on Threshold (%)</span>
            <input type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="policy-config-extra-fee-percent-input" value={config.tutor.demerit.extraFeePercent} onChange={(e) => updateField('tutor.demerit.extraFeePercent', toNumber(e.target.value, 3))} />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-700">Extra Fee Duration (bookings)</span>
            <input type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="policy-config-extra-fee-bookings-input" value={config.tutor.demerit.extraFeeBookings} onChange={(e) => updateField('tutor.demerit.extraFeeBookings', toNumber(e.target.value, 10))} />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-700">Cancellation Penalty (₹)</span>
            <input type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="policy-config-cancel-penalty-input" value={config.tutor.demerit.cancelPenaltyInr} onChange={(e) => updateField('tutor.demerit.cancelPenaltyInr', toNumber(e.target.value, 200))} />
          </label>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Platform Rules</h2>
        <label className="space-y-1 block">
          <span className="text-sm text-slate-700">Class Infrastructure</span>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="policy-config-class-infra-input" value={config.platform.classInfra} onChange={(e) => updateField('platform.classInfra', e.target.value)} />
        </label>
      </section>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" data-testid="policy-config-error-alert">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" data-testid="policy-config-success-alert">{success}</div>}

      <div>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          data-testid="policy-config-save-button"
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-white font-semibold hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Policy Configuration'}
        </button>
      </div>
    </div>
  );
}
