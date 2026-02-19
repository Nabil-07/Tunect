// src/pages/tutor/kyc-upload.tsx
import { useEffect, useMemo, useState } from 'react';
import { submitKyc, getKycStatus, getMyKycSubmission, type KycPayload, type KycFiles } from '../../services/tutorService';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { getCountries, type CountryOption, findCountry } from '../../utils/countryData';

/* ----------------- Validators ----------------- */

// IFSC: 4 letters + '0' + 6 digits
const IFSC_RE = /^[A-Z]{4}0\d{6}$/i;
// UAE IBAN: AE + 21 digits (length 23 total)
const AE_IBAN_RE = /^AE\d{21}$/i;
// SWIFT/BIC: 8 or 11 alphanum
const SWIFT_RE = /^[A-Z0-9]{8}([A-Z0-9]{3})?$/i;
const KYC_LOCAL_SNAPSHOT_KEY = 'tunect_kyc_last_submission';

const onlyDigits = (s: string) => s.replace(/\D/g, '');

type KycLocalSnapshot = {
  countryCode?: string;
  selfieName?: string;
  degreeNames?: string[];
  savedAt: number;
};

/* ----------------- Component ----------------- */

export default function TutorKYC() {
  const [status, setStatus] = useState<{
    status: 'none'|'submitted'|'under_review'|'approved'|'rejected';
    reason?: string;
    correctionRequest?: { fields: string[]; message?: string };
  }|null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [modal, setModal] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<Array<{ id: string; docType: string; url: string; status: string; createdAt: string }>>([]);
  const [submittedFileNames, setSubmittedFileNames] = useState<string[]>([]);
  const [requestedCorrectionFields, setRequestedCorrectionFields] = useState<string[]>([]);
  const [requestedCorrectionMessage, setRequestedCorrectionMessage] = useState<string>('');

  // Countries from countryData (single source of truth)
  const countries = useMemo<CountryOption[]>(() => getCountries(), []);
  const [countryCode, setCountryCode] = useState<string>('');
  const selectedCountry = useMemo(
    () => (countryCode ? findCountry(countryCode) : undefined),
    [countryCode]
  );

  // Derived flags (no hardcoded enum)
  const isIndia = useMemo(() => {
    const n = selectedCountry?.name?.toLowerCase?.() || '';
    const c = selectedCountry?.code?.toUpperCase?.() || '';
    return c === 'IN' || n === 'india';
  }, [selectedCountry]);

  const isUAE = useMemo(() => {
    const n = selectedCountry?.name?.toLowerCase?.() || '';
    const c = selectedCountry?.code?.toUpperCase?.() || '';
    return c === 'AE' || n.includes('united arab emirates') || n === 'uae';
  }, [selectedCountry]);

  // initialize default country once list is ready
  useEffect(() => {
    if (!countryCode && countries.length > 0) {
      setCountryCode(countries[0].code.toUpperCase());
    }
  }, [countries, countryCode]);

  const isEditable = !status || status.status === 'none' || status.status === 'rejected';
  const formLocked = !isEditable;
  const restrictedCorrectionMode = !!(status?.status === 'rejected' && requestedCorrectionFields.length);
  const canEditField = (field: string) => !formLocked && (!restrictedCorrectionMode || requestedCorrectionFields.includes(field));
  const showReadOnlyDocs = formLocked || (!canEditField('selfie') && !canEditField('degreeCertificates'));

  // Form state
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postal, setPostal] = useState('');

  const [holder, setHolder] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankBranch, setBankBranch] = useState('');

  // India bank fields
  const [accNumber, setAccNumber] = useState('');
  const [accNumber2, setAccNumber2] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [upi, setUpi] = useState('');

  // UAE bank fields
  const [iban, setIban] = useState('');
  const [swift, setSwift] = useState('');

  // Files (non-government ID)
  const [selfie, setSelfie] = useState<File|null>(null);
  const [degrees, setDegrees] = useState<File[]>([]);

  useEffect(() => {
    const readLocalSnapshot = (): KycLocalSnapshot | null => {
      try {
        const raw = localStorage.getItem(KYC_LOCAL_SNAPSHOT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as KycLocalSnapshot;
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        return null;
      }
    };

    const toInputDate = (value?: string | null): string => {
      if (!value) return '';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '';
      return d.toISOString().slice(0, 10);
    };

    const hydrate = async () => {
      const [statusRes, submissionRes] = await Promise.all([
        getKycStatus().catch(() => ({ status: 'none' as const })),
        getMyKycSubmission().catch(() => null),
      ]);

      setStatus(statusRes);
      const statusCorrection = 'correctionRequest' in statusRes ? statusRes.correctionRequest : undefined;
      setRequestedCorrectionFields(statusCorrection?.fields || []);
      setRequestedCorrectionMessage(statusCorrection?.message || '');

      const local = readLocalSnapshot();
      if (local?.degreeNames?.length || local?.selfieName) {
        setSubmittedFileNames([...(local.selfieName ? [local.selfieName] : []), ...(local.degreeNames || [])]);
      }

      const app = submissionRes?.application;
      const docs = (submissionRes?.documents || []).map((d) => ({
        id: d.id,
        docType: d.docType,
        url: d.url,
        status: d.status,
        createdAt: d.createdAt,
      }));
      setUploadedDocs(docs);

      if (!app) return;

      if (Array.isArray(app.correctionRequest?.fields) && app.correctionRequest.fields.length > 0) {
        setRequestedCorrectionFields(app.correctionRequest.fields);
      }
      if (app.correctionRequest?.message) {
        setRequestedCorrectionMessage(app.correctionRequest.message);
      }

      setFullName(app.fullName || '');
      setDob(toInputDate(app.dob));
      setPhone(app.phone || '');
      setAddress1(app.address1 || '');
      setAddress2(app.address2 || '');
      setCity(app.city || '');
      setState(app.state || '');
      setPostal(app.postalCode || '');
      setHolder(app.bankAccountHolder || '');
      setBankName(app.bankName || '');
      setBankBranch(app.bankBranch || '');

      setAccNumber(app.accountNumber || '');
      setAccNumber2(app.accountNumber || '');
      setIfsc(app.ifsc || '');
      setUpi(app.upiId || '');
      setIban(app.iban || '');
      setSwift(app.swift || '');

      const countryUpper = String(app.country || '').toUpperCase();
      if (countryUpper === 'IN') {
        setCountryCode('IN');
      } else if (countryUpper === 'AE') {
        setCountryCode('AE');
      } else if (local?.countryCode) {
        setCountryCode(local.countryCode);
      }
    };

    void hydrate();
  }, []);

  useEffect(() => {
    if (submitSuccess) setCollapsed(true);
  }, [submitSuccess]);

  // collapse form after successful submit
  useEffect(() => {
    if (submitSuccess) setCollapsed(true);
  }, [submitSuccess]);

  const statusBadge = useMemo(() => {
    if (!status) return null;
    const map: Record<string, string> = {
      none: 'bg-slate-100 text-slate-700',
      submitted: 'bg-amber-100 text-amber-800',
      under_review: 'bg-amber-100 text-amber-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-rose-100 text-rose-800',
    };
    return <span className={`px-2 py-1 rounded text-xs font-medium ${map[status.status]}`}>{status.status.replace('_',' ')}</span>;
  }, [status]);

  // Phone placeholder from selected country dial code
  const phonePlaceholder = useMemo(() => {
    const c: any = selectedCountry;
    if (!c || !c.dialCode) return '+1 98765 43210';
    return `${c.dialCode} 98765 43210`;
  }, [selectedCountry]);

  function validate(): boolean {
    const e: Record<string, string> = {};

    if (!fullName.trim()) e.fullName = 'Full name is required';
    if (!dob) e.dob = 'Date of birth is required';
    else if (Number.isNaN(new Date(dob).getTime())) e.dob = 'Date of birth is invalid';
    if (!phone || onlyDigits(phone).length < 7) e.phone = 'Valid phone is required';
    if (!address1.trim()) e.address1 = 'Address is required';
    if (!city.trim()) e.city = 'City is required';
    if (!bankName.trim()) e.bankName = 'Bank name is required';
    if (!holder.trim()) e.holder = 'Account holder name is required';

    if (isIndia) {
      const acc = onlyDigits(accNumber);
      const acc2 = onlyDigits(accNumber2);
      if (acc.length < 9) e.accNumber = 'Account number looks too short';
      if (acc2 !== acc) e.accNumber2 = 'Account numbers do not match';
      if (!IFSC_RE.test(ifsc)) e.ifsc = 'Invalid IFSC (e.g. HDFC0001234)';
    } else if (isUAE) {
      if (!AE_IBAN_RE.test(iban)) e.iban = 'Invalid UAE IBAN (e.g. AE07 0331 ...)';
      if (swift && !SWIFT_RE.test(swift)) e.swift = 'Invalid SWIFT/BIC';
    }
    // For other countries, no bank field is strictly required beyond the common ones

    if (canEditField('selfie') && !selfie) e.selfie = 'A clear profile photo is required';
    if (canEditField('degreeCertificates') && degrees.length === 0) e.degrees = 'Please upload at least one degree certificate';

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    if (!validate()) return;

    // Preserve backend contract: collapse to IN/AE/OTHER for payload
    const kycCountry: 'IN' | 'AE' | 'OTHER' = isIndia ? 'IN' : isUAE ? 'AE' : 'OTHER';

    const payload: KycPayload = {
      fullName, dob, phone,
      country: kycCountry,
      addressLine1: address1,
      addressLine2: address2 || undefined,
      city, state: state || undefined, postalCode: postal || undefined,

      bankAccountHolder: holder,
      bankName, bankBranch: bankBranch || undefined,

      // India
      accountNumber: isIndia ? onlyDigits(accNumber) : undefined,
      ifsc: isIndia ? ifsc.toUpperCase() : undefined,
      upiId: isIndia ? (upi || undefined) : undefined,

      // UAE
      iban: isUAE ? iban.replace(/\s+/g,'').toUpperCase() : undefined,
      swift: isUAE ? (swift ? swift.toUpperCase() : undefined) : undefined,
    };

    // No government ID files for any country; DigiLocker handles India.
    const files: KycFiles = {
      selfie,
      aadhaarFront: null,
      aadhaarBack: null,
      degreeCertificates: degrees,
    };

    setSubmitting(true);
    try {
      await submitKyc(payload, files);
      setStatus({ status: 'submitted' });
      try {
        const snapshot: KycLocalSnapshot = {
          countryCode,
          selfieName: selfie?.name,
          degreeNames: degrees.map((f) => f.name),
          savedAt: Date.now(),
        };
        localStorage.setItem(KYC_LOCAL_SNAPSHOT_KEY, JSON.stringify(snapshot));
        setSubmittedFileNames([...(snapshot.selfieName ? [snapshot.selfieName] : []), ...(snapshot.degreeNames || [])]);
      } catch {}

      const latest = await getMyKycSubmission();
      const docs = (latest?.documents || []).map((d) => ({
        id: d.id,
        docType: d.docType,
        url: d.url,
        status: d.status,
        createdAt: d.createdAt,
      }));
      setUploadedDocs(docs);

      const msg = 'KYC submitted successfully. We will review and update your status soon.';
      setSubmitSuccess(msg);
      setModal({ kind: 'success', message: msg });
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.message || err?.message || 'Failed to submit KYC. Please try again.';
      setSubmitError(msg);
      setModal({ kind: 'error', message: msg });
    } finally {
      setSubmitting(false);
    }
  }

  function blockPaste(ev: React.ClipboardEvent<HTMLInputElement>) { ev.preventDefault(); }
  function blockDrop(ev: React.DragEvent<HTMLInputElement>) { ev.preventDefault(); }
  function limitFiles(list: FileList | null, set: (f: File[]) => void) {
    if (!list) return;
    const files = Array.from(list).slice(0, 5);
    set(files);
  }

  return (
    <main className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold">Tutor KYC</h2>
          <p className="text-sm text-slate-600">Average approval time: 12–24 hours after submission.</p>
        </div>
        {statusBadge}
      </div>

      <section className="mb-4 rounded-xl border bg-white p-4 shadow-sm flex items-center justify-between">
        <div className="text-sm text-slate-700">
          <div className="font-semibold">Current status: {status?.status || 'none'}</div>
          {status?.reason && <div className="text-rose-700">Reason: {status.reason}</div>}
          {restrictedCorrectionMode && (
            <div className="text-amber-700 mt-1">
              Requested updates: {requestedCorrectionFields.join(', ')}
              {requestedCorrectionMessage ? ` — ${requestedCorrectionMessage}` : ''}
            </div>
          )}
        </div>
        <button
          type="button"
          className="text-sm px-3 py-1 rounded-lg border bg-slate-50 hover:bg-slate-100"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? 'Expand form' : 'Hide form'}
        </button>
      </section>

      <section className="mb-4 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-4 text-sm font-medium text-slate-700">
          {[
            { key: 'submitted', label: 'Submitted' },
            { key: 'under_review', label: 'Under Review' },
            { key: 'approved', label: 'Approved' },
          ].map((step, idx, arr) => {
            const active = (status?.status || 'none') === step.key;
            const done = ['approved', 'under_review', 'submitted'].includes(status?.status || '') && arr.findIndex(s => s.key === status?.status) >= idx;
            return (
              <div key={step.key} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full border ${done ? 'bg-emerald-500 border-emerald-500' : active ? 'bg-amber-400 border-amber-400' : 'bg-slate-200 border-slate-300'}`} />
                <span className={done || active ? 'text-slate-900' : 'text-slate-500'}>{step.label}</span>
                {idx < arr.length - 1 && <div className="w-10 h-px bg-slate-200" />}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-500 mt-2">Next step: {status?.status === 'submitted' ? 'Under review (ETA 12–24h)' : status?.status === 'under_review' ? 'Approval (ETA soon)' : status?.status === 'approved' ? 'Completed' : 'Submit your details to begin review.'}</p>
      </section>

      {submitError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {submitError}
        </div>
      )}
      {submitSuccess && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {submitSuccess}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className={`space-y-6 transition-all ${collapsed ? 'max-h-0 overflow-hidden opacity-0 pointer-events-none' : 'max-h-[9999px]'}`}
        aria-hidden={collapsed}
      >
        <fieldset disabled={formLocked} className={formLocked ? 'opacity-75 cursor-not-allowed' : ''}>
        {/* Personal details */}
        <section className="rounded-2xl border p-4 bg-white shadow-sm">
          <h3 className="font-semibold mb-3">Personal details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Full name *</span>
              <input className="w-full border rounded-lg px-3 py-2" value={fullName} onChange={e=>setFullName(e.target.value)} disabled={!canEditField('fullName')} />
              {errors.fullName && <p className="text-rose-600 text-xs mt-1">{errors.fullName}</p>}
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Date of birth *</span>
              <input type="date" className="w-full border rounded-lg px-3 py-2" value={dob} onChange={e=>setDob(e.target.value)} disabled={!canEditField('dob')} />
              {errors.dob && <p className="text-rose-600 text-xs mt-1">{errors.dob}</p>}
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Phone *</span>
              <input className="w-full border rounded-lg px-3 py-2"
                     value={phone}
                     onChange={e=>setPhone(e.target.value)}
                     placeholder={phonePlaceholder}
                     inputMode="tel"
                     disabled={!canEditField('phone')} />
              {errors.phone && <p className="text-rose-600 text-xs mt-1">{errors.phone}</p>}
            </label>

            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Country *</span>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={countryCode}
                disabled={!canEditField('country')}
                onChange={(e)=>{
                  const raw = String(e.target.value || '').toUpperCase();
                  const found = findCountry(raw) || countries.find(c => c.name.toUpperCase() === raw);
                  setCountryCode(found ? found.code.toUpperCase() : raw);
                }}
              >
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <label className="text-sm md:col-span-2">
              <span className="block text-slate-600 mb-1">Address line 1 *</span>
              <input className="w-full border rounded-lg px-3 py-2" value={address1} onChange={e=>setAddress1(e.target.value)} disabled={!canEditField('addressLine1')} />
              {errors.address1 && <p className="text-rose-600 text-xs mt-1">{errors.address1}</p>}
            </label>
            <label className="text-sm md:col-span-2">
              <span className="block text-slate-600 mb-1">Address line 2 (optional)</span>
              <input className="w-full border rounded-lg px-3 py-2" value={address2} onChange={e=>setAddress2(e.target.value)} disabled={!canEditField('addressLine2')} />
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">City *</span>
              <input className="w-full border rounded-lg px-3 py-2" value={city} onChange={e=>setCity(e.target.value)} disabled={!canEditField('city')} />
              {errors.city && <p className="text-rose-600 text-xs mt-1">{errors.city}</p>}
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">{isUAE ? 'Emirate' : 'State/Province'}</span>
              <input className="w-full border rounded-lg px-3 py-2" value={state} onChange={e=>setState(e.target.value)} disabled={!canEditField('state')} />
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">{isUAE ? 'PO Box' : 'Postal code'}</span>
              <input className="w-full border rounded-lg px-3 py-2" value={postal} onChange={e=>setPostal(e.target.value)} disabled={!canEditField('postalCode')} />
            </label>
          </div>
        </section>

        {/* Bank details */}
        <section className="rounded-2xl border p-4 bg-white shadow-sm">
          <h3 className="font-semibold mb-3">Bank details</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm md:col-span-2">
              <span className="block text-slate-600 mb-1">Account holder name *</span>
              <input className="w-full border rounded-lg px-3 py-2" value={holder} onChange={e=>setHolder(e.target.value)} disabled={!canEditField('bankAccountHolder')} />
              {errors.holder && <p className="text-rose-600 text-xs mt-1">{errors.holder}</p>}
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Bank name *</span>
              <input className="w-full border rounded-lg px-3 py-2" value={bankName} onChange={e=>setBankName(e.target.value)} disabled={!canEditField('bankName')} />
              {errors.bankName && <p className="text-rose-600 text-xs mt-1">{errors.bankName}</p>}
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Branch (optional)</span>
              <input className="w-full border rounded-lg px-3 py-2" value={bankBranch} onChange={e=>setBankBranch(e.target.value)} disabled={!canEditField('bankBranch')} />
            </label>
          </div>

          {/* India-specific */}
          {isIndia && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">Account number *</span>
                <input className="w-full border rounded-lg px-3 py-2" inputMode="numeric"
                       value={accNumber} onChange={e=>setAccNumber(e.target.value)} disabled={!canEditField('accountNumber')} />
                {errors.accNumber && <p className="text-rose-600 text-xs mt-1">{errors.accNumber}</p>}
              </label>
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">Re-enter account number *</span>
                <input className="w-full border rounded-lg px-3 py-2"
                       value={accNumber2}
                       onChange={e=>setAccNumber2(e.target.value)}
                       onPaste={blockPaste} onDrop={blockDrop}
                       disabled={!canEditField('accountNumber')}
                       placeholder="Typing only; paste disabled" />
                {errors.accNumber2 && <p className="text-rose-600 text-xs mt-1">{errors.accNumber2}</p>}
              </label>
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">IFSC *</span>
                <input className="w-full border rounded-lg px-3 py-2" value={ifsc} onChange={e=>setIfsc(e.target.value)} placeholder="e.g. HDFC0001234" disabled={!canEditField('ifsc')} />
                {errors.ifsc && <p className="text-rose-600 text-xs mt-1">{errors.ifsc}</p>}
              </label>
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">UPI ID (optional)</span>
                <input className="w-full border rounded-lg px-3 py-2" value={upi} onChange={e=>setUpi(e.target.value)} placeholder="name@bank" disabled={!canEditField('upiId')} />
              </label>
            </div>
          )}

          {/* UAE-specific */}
          {isUAE && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <label className="text-sm md:col-span-2">
                <span className="block text-slate-600 mb-1">IBAN *</span>
                <input className="w-full border rounded-lg px-3 py-2" value={iban} onChange={e=>setIban(e.target.value)} placeholder="AE*********************" disabled={!canEditField('iban')} />
                {errors.iban && <p className="text-rose-600 text-xs mt-1">{errors.iban}</p>}
              </label>
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">SWIFT/BIC (optional)</span>
                <input className="w-full border rounded-lg px-3 py-2" value={swift} onChange={e=>setSwift(e.target.value)} disabled={!canEditField('swift')} />
                {errors.swift && <p className="text-rose-600 text-xs mt-1">{errors.swift}</p>}
              </label>
            </div>
          )}

          {/* Generic fallback */}
          {!isIndia && !isUAE && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <label className="text-sm md:col-span-2">
                <span className="block text-slate-600 mb-1">IBAN / Account number (optional)</span>
                <input className="w-full border rounded-lg px-3 py-2" placeholder="Enter your IBAN or account number" disabled />
              </label>
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">SWIFT/BIC (optional)</span>
                <input className="w-full border rounded-lg px-3 py-2" disabled />
              </label>
            </div>
          )}
        </section>

        {/* Identity & documents */}
        <section className="rounded-2xl border p-4 bg-white shadow-sm">
          <h3 className="font-semibold mb-3">Identity & documents</h3>

          {/* India → DigiLocker block (only for India) - TEMPORARILY DISABLED */}
          {false && isIndia && (
            <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-indigo-800">
              <div className="font-medium">Verification method: DigiLocker (Aadhaar)</div>
              <p className="text-sm">For India, identity verification is completed securely via DigiLocker. No document upload is needed here.</p>
              <button
                type="button"
                onClick={() => window.open('https://digilocker.meripehchaan.gov.in/', '_blank')}
                className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-700"
              >
                Start DigiLocker verification
              </button>
            </div>
          )}

          {/* For all non-India countries, we DO NOT collect government ID */}
          {!isIndia && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <div className="font-medium">No government ID required</div>
              <p className="text-sm">For your selected country, we don’t collect passport or national ID documents on Tunect.</p>
            </div>
          )}

          {showReadOnlyDocs ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="font-medium text-slate-800 mb-2">Submitted documents</div>
              {uploadedDocs.length > 0 ? (
                <ul className="space-y-1 text-slate-700">
                  {uploadedDocs.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between gap-3">
                      <span>{doc.docType}</span>
                      <a className="text-blue-700 hover:underline" href={doc.url} target="_blank" rel="noreferrer">View</a>
                    </li>
                  ))}
                </ul>
              ) : submittedFileNames.length > 0 ? (
                <ul className="space-y-1 text-slate-700">
                  {submittedFileNames.map((name, idx) => (
                    <li key={`${name}-${idx}`}>{name}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-600">Documents already submitted.</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">Clear photo (selfie) *</span>
                <input type="file" accept="image/*" onChange={e=>setSelfie(e.target.files?.[0] ?? null)} disabled={!canEditField('selfie')} />
                {errors.selfie && <p className="text-rose-600 text-xs mt-1">{errors.selfie}</p>}
                <p className="text-[11px] text-slate-500 mt-1">Good lighting, no sunglasses; JPG/PNG up to ~5 MB.</p>
              </label>
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">Degree certificate(s) *</span>
                <input type="file" accept=".pdf,image/*" multiple onChange={e=>limitFiles(e.target.files, setDegrees)} disabled={!canEditField('degreeCertificates')} />
                {errors.degrees && <p className="text-rose-600 text-xs mt-1">{errors.degrees}</p>}
                {degrees.length > 0 && (
                  <p className="text-[11px] text-slate-500 mt-1"><CheckCircle2 className="inline" size={14}/> {degrees.length} file(s) selected</p>
                )}
              </label>
            </div>
          )}
        </section>

        {/* Submit */}
        <div className="flex items-center gap-3">
          {formLocked ? (
            <p className="text-xs text-slate-600">Submitted details are shown in read-only mode while your KYC is under review.</p>
          ) : (
            <>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-blue-600 text-white px-5 py-2.5 hover:bg-blue-700 inline-flex items-center gap-2 disabled:opacity-60"
              >
                {submitting && <Loader2 className="animate-spin" size={16} />} Submit KYC
              </button>
              <p className="text-xs text-slate-500">
                Submitting your KYC allows us to verify your identity and disburse earnings to your bank account securely.
              </p>
            </>
          )}
        </div>
        </fieldset>
      </form>

      {modal && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">{modal.kind === 'success' ? 'Submitted' : 'Submission error'}</h3>
              <button className="text-slate-500" onClick={() => setModal(null)}>✕</button>
            </div>
            <p className={`text-sm ${modal.kind === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>{modal.message}</p>
            <div className="mt-4 flex justify-end">
              <button
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => setModal(null)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
