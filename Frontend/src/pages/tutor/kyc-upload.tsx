// src/pages/tutor/kyc-upload.tsx
import { useEffect, useMemo, useState } from 'react';
import { submitKyc, getKycStatus, type KycPayload, type KycFiles } from '../../services/tutorService';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { getCountries, type CountryOption, findCountry } from '../../utils/countryData';

/* ----------------- Validators ----------------- */

// IFSC: 4 letters + '0' + 6 digits
const IFSC_RE = /^[A-Z]{4}0\d{6}$/i;
// UAE IBAN: AE + 21 digits (length 23 total)
const AE_IBAN_RE = /^AE\d{21}$/i;
// SWIFT/BIC: 8 or 11 alphanum
const SWIFT_RE = /^[A-Z0-9]{8}([A-Z0-9]{3})?$/i;

const onlyDigits = (s: string) => s.replace(/\D/g, '');

/* ----------------- Component ----------------- */

export default function TutorKYC() {
  const [status, setStatus] = useState<{ status: 'none'|'submitted'|'under_review'|'approved'|'rejected'; reason?: string }|null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    getKycStatus().then(setStatus).catch(() => setStatus({ status: 'none' }));
  }, []);

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

    if (!selfie) e.selfie = 'A clear profile photo is required';
    if (degrees.length === 0) e.degrees = 'Please upload at least one degree certificate';

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
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
      alert('KYC submitted successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to submit KYC. Please try again.');
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
        <h2 className="text-2xl font-bold">Tutor KYC</h2>
        {statusBadge}
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Personal details */}
        <section className="rounded-2xl border p-4 bg-white shadow-sm">
          <h3 className="font-semibold mb-3">Personal details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Full name *</span>
              <input className="w-full border rounded-lg px-3 py-2" value={fullName} onChange={e=>setFullName(e.target.value)} />
              {errors.fullName && <p className="text-rose-600 text-xs mt-1">{errors.fullName}</p>}
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Date of birth *</span>
              <input type="date" className="w-full border rounded-lg px-3 py-2" value={dob} onChange={e=>setDob(e.target.value)} />
              {errors.dob && <p className="text-rose-600 text-xs mt-1">{errors.dob}</p>}
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Phone *</span>
              <input className="w-full border rounded-lg px-3 py-2"
                     value={phone}
                     onChange={e=>setPhone(e.target.value)}
                     placeholder={phonePlaceholder}
                     inputMode="tel" />
              {errors.phone && <p className="text-rose-600 text-xs mt-1">{errors.phone}</p>}
            </label>

            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Country *</span>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={countryCode}
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
              <input className="w-full border rounded-lg px-3 py-2" value={address1} onChange={e=>setAddress1(e.target.value)} />
              {errors.address1 && <p className="text-rose-600 text-xs mt-1">{errors.address1}</p>}
            </label>
            <label className="text-sm md:col-span-2">
              <span className="block text-slate-600 mb-1">Address line 2 (optional)</span>
              <input className="w-full border rounded-lg px-3 py-2" value={address2} onChange={e=>setAddress2(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">City *</span>
              <input className="w-full border rounded-lg px-3 py-2" value={city} onChange={e=>setCity(e.target.value)} />
              {errors.city && <p className="text-rose-600 text-xs mt-1">{errors.city}</p>}
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">{isUAE ? 'Emirate' : 'State/Province'}</span>
              <input className="w-full border rounded-lg px-3 py-2" value={state} onChange={e=>setState(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">{isUAE ? 'PO Box' : 'Postal code'}</span>
              <input className="w-full border rounded-lg px-3 py-2" value={postal} onChange={e=>setPostal(e.target.value)} />
            </label>
          </div>
        </section>

        {/* Bank details */}
        <section className="rounded-2xl border p-4 bg-white shadow-sm">
          <h3 className="font-semibold mb-3">Bank details</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm md:col-span-2">
              <span className="block text-slate-600 mb-1">Account holder name *</span>
              <input className="w-full border rounded-lg px-3 py-2" value={holder} onChange={e=>setHolder(e.target.value)} />
              {errors.holder && <p className="text-rose-600 text-xs mt-1">{errors.holder}</p>}
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Bank name *</span>
              <input className="w-full border rounded-lg px-3 py-2" value={bankName} onChange={e=>setBankName(e.target.value)} />
              {errors.bankName && <p className="text-rose-600 text-xs mt-1">{errors.bankName}</p>}
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Branch (optional)</span>
              <input className="w-full border rounded-lg px-3 py-2" value={bankBranch} onChange={e=>setBankBranch(e.target.value)} />
            </label>
          </div>

          {/* India-specific */}
          {isIndia && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">Account number *</span>
                <input className="w-full border rounded-lg px-3 py-2" inputMode="numeric"
                       value={accNumber} onChange={e=>setAccNumber(e.target.value)} />
                {errors.accNumber && <p className="text-rose-600 text-xs mt-1">{errors.accNumber}</p>}
              </label>
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">Re-enter account number *</span>
                <input className="w-full border rounded-lg px-3 py-2"
                       value={accNumber2}
                       onChange={e=>setAccNumber2(e.target.value)}
                       onPaste={blockPaste} onDrop={blockDrop}
                       placeholder="Typing only; paste disabled" />
                {errors.accNumber2 && <p className="text-rose-600 text-xs mt-1">{errors.accNumber2}</p>}
              </label>
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">IFSC *</span>
                <input className="w-full border rounded-lg px-3 py-2" value={ifsc} onChange={e=>setIfsc(e.target.value)} placeholder="e.g. HDFC0001234" />
                {errors.ifsc && <p className="text-rose-600 text-xs mt-1">{errors.ifsc}</p>}
              </label>
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">UPI ID (optional)</span>
                <input className="w-full border rounded-lg px-3 py-2" value={upi} onChange={e=>setUpi(e.target.value)} placeholder="name@bank" />
              </label>
            </div>
          )}

          {/* UAE-specific */}
          {isUAE && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <label className="text-sm md:col-span-2">
                <span className="block text-slate-600 mb-1">IBAN *</span>
                <input className="w-full border rounded-lg px-3 py-2" value={iban} onChange={e=>setIban(e.target.value)} placeholder="AE*********************" />
                {errors.iban && <p className="text-rose-600 text-xs mt-1">{errors.iban}</p>}
              </label>
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">SWIFT/BIC (optional)</span>
                <input className="w-full border rounded-lg px-3 py-2" value={swift} onChange={e=>setSwift(e.target.value)} />
                {errors.swift && <p className="text-rose-600 text-xs mt-1">{errors.swift}</p>}
              </label>
            </div>
          )}

          {/* Generic fallback */}
          {!isIndia && !isUAE && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <label className="text-sm md:col-span-2">
                <span className="block text-slate-600 mb-1">IBAN / Account number (optional)</span>
                <input className="w-full border rounded-lg px-3 py-2" placeholder="Enter your IBAN or account number" />
              </label>
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">SWIFT/BIC (optional)</span>
                <input className="w-full border rounded-lg px-3 py-2" />
              </label>
            </div>
          )}
        </section>

        {/* Identity & documents */}
        <section className="rounded-2xl border p-4 bg-white shadow-sm">
          <h3 className="font-semibold mb-3">Identity & documents</h3>

          {/* India → DigiLocker block (only for India) */}
          {isIndia && (
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

          {/* Common non-ID files */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Clear photo (selfie) *</span>
              <input type="file" accept="image/*" onChange={e=>setSelfie(e.target.files?.[0] ?? null)} />
              {errors.selfie && <p className="text-rose-600 text-xs mt-1">{errors.selfie}</p>}
              <p className="text-[11px] text-slate-500 mt-1">Good lighting, no sunglasses; JPG/PNG up to ~5 MB.</p>
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Degree certificate(s) *</span>
              <input type="file" accept=".pdf,image/*" multiple onChange={e=>limitFiles(e.target.files, setDegrees)} />
              {errors.degrees && <p className="text-rose-600 text-xs mt-1">{errors.degrees}</p>}
              {degrees.length > 0 && (
                <p className="text-[11px] text-slate-500 mt-1"><CheckCircle2 className="inline" size={14}/> {degrees.length} file(s) selected</p>
              )}
            </label>
          </div>
        </section>

        {/* Submit */}
        <div className="flex items-center gap-3">
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
        </div>
      </form>
    </main>
  );
}
