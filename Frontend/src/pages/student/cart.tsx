// src/pages/student/cart.tsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShoppingCart, CreditCard, ShieldCheck, CheckCircle,
  Calendar, Clock, TrendingUp, Tag, X, Sparkles,
} from 'lucide-react';
import { getTutorById, getTutorAvailability } from '../../services/tutorService';
import { getPacksForTutor, applyCoupon, type PackPricing } from '../../services/offersService';
import { useAuth } from '../../contexts/AuthContext';
import { useDisplayCurrency } from '../../hooks/useDisplayCurrency';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/apiClient';
import { useToast } from '../../contexts/ToastContext';

type Tutor = {
  id: string;
  name: string;
  subjectPrimary?: string;
  subjects?: string[];
  hourlyRate?: number;
  pricePerHour?: number;
  avatarUrl?: string | null;
  rating?: number;
  reviewCount?: number;
  isVerified?: boolean;
  bio?: string;
};

export default function Cart() {
  const [sp] = useSearchParams();
  const tutorId = sp.get('tutorId') || sp.get('tutorid') || '';
  const tokensFromUrl = sp.get('tokens');
  const isDemo = sp.get('demo') === '1';
  const nav = useNavigate();
  const { user } = useAuth();
  const { currency: displayCurrency, convertFromINR } = useDisplayCurrency();
  const { showError } = useToast();

  const displayStudentName =
    user?.name || (user?.email?.includes('@') ? user.email.split('@')[0] : '') || 'Student';

  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<Array<{ startTime: string; endTime: string }>>([]);
  const [activityInfo, setActivityInfo] = useState<{
    lastActiveDate: string | null;
    activeDaysCount: number;
    activityFrequency: string;
  } | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(true);

  // Pack state
  const [packs, setPacks] = useState<PackPricing[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [packsLoading, setPacksLoading] = useState(false);

  // Manual token state — empty string means pack mode; non-empty means custom amount
  const [manualTokenInput, setManualTokenInput] = useState<string>(() => {
    const n = Number(tokensFromUrl);
    return Number.isFinite(n) && n >= 5 ? String(Math.floor(n)) : '';
  });
  const isManualMode = manualTokenInput !== '';

  // Coupon state
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount: number;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  useEffect(() => {
    if (!tutorId) {
      nav('/find-tutors', { replace: true });
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const t = await getTutorById(tutorId);
        setTutor({
          id: t.id,
          name: t.name,
          subjectPrimary: (t as any).subject ?? t.subjectPrimary,
          subjects: t.subjects,
          hourlyRate: t.hourlyRate ?? t.pricePerHour ?? 0,
          pricePerHour: t.pricePerHour,
          avatarUrl: t.avatarUrl ?? null,
          rating: (t as any).rating,
          reviewCount: (t as any).reviewCount,
          isVerified: (t as any).isVerified,
          bio: (t as any).bio,
        });

        const from = new Date();
        const to = new Date();
        to.setDate(to.getDate() + 14);
        const params = { from: from.toISOString(), to: to.toISOString(), durationMin: 60, stepMin: 15 } as const;

        const normalizeSlices = (data: any) => {
          if (Array.isArray(data?.slices)) return data.slices;
          if (Array.isArray(data)) return data;
          return [];
        };

        try {
          const [slots, activity] = await Promise.all([
            (async () => {
              try {
                const { data } = await api.get(`/availability/tutor/${tutorId}/bookable`, { params });
                return normalizeSlices(data);
              } catch {
                try {
                  const { data } = await api.get(`/availability/bookable/${tutorId}`, { params });
                  return normalizeSlices(data);
                } catch {
                  return await getTutorAvailability(tutorId, from.toISOString(), to.toISOString());
                }
              }
            })(),
            api.get(`/tutors/${tutorId}/activity`).then((res) => res.data).catch(() => null),
          ]);
          setAvailableSlots(Array.isArray(slots) ? slots.slice(0, 10) : []);
          setActivityInfo(activity);
        } catch (e) {
          console.error('Failed to load tutor info:', e);
        }
      } finally {
        setLoading(false);
        setLoadingSlots(false);
      }
    })();
  }, [tutorId, nav]);

  // Load packs when tutor is ready
  useEffect(() => {
    if (!tutorId || isDemo) return;
    (async () => {
      try {
        setPacksLoading(true);
        const { packs: fetchedPacks } = await getPacksForTutor(tutorId);
        setPacks(fetchedPacks);
        const fromUrl = Number(tokensFromUrl);
        if (Number.isFinite(fromUrl) && fromUrl >= 5) {
          setManualTokenInput(String(Math.floor(fromUrl)));
          setSelectedPackId(null);
        } else {
          const highlighted = fetchedPacks.find((p) => p.pack.isHighlighted);
          setSelectedPackId((highlighted ?? fetchedPacks[0])?.pack.id ?? null);
        }
      } catch (e) {
        console.error('Failed to load packs:', e);
      } finally {
        setPacksLoading(false);
      }
    })();
  }, [tutorId, isDemo, tokensFromUrl]);

  const selectedPack = useMemo(
    () => packs.find((p) => p.pack.id === selectedPackId) ?? null,
    [packs, selectedPackId],
  );

  // Selecting a pack exits manual mode
  const handleSelectPack = (packId: string) => {
    setSelectedPackId(packId);
    setManualTokenInput('');
    handleRemoveCoupon();
  };

  // Entering manual mode deselects pack and clears coupon
  const handleManualTokenChange = (raw: string) => {
    if (raw === '') {
      setManualTokenInput('');
      return;
    }
    // Only allow non-negative integers
    if (!/^\d+$/.test(raw)) return;
    const n = parseInt(raw, 10);
    if (n < 0) return;
    setManualTokenInput(String(n));
    if (selectedPackId) {
      setSelectedPackId(null);
      handleRemoveCoupon();
    }
  };

  // Parsed manual token count (validated)
  const manualTokenCount = useMemo(() => {
    if (!isManualMode) return 0;
    const n = parseInt(manualTokenInput, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [isManualMode, manualTokenInput]);

  const isManualValid = isManualMode && manualTokenCount >= 5;

  const handleApplyCoupon = useCallback(async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code || !tutorId) return;
    // In pack mode we need a pack selected; in manual mode we need ≥5 tokens
    if (!isManualMode && !selectedPackId) return;
    if (isManualMode && !isManualValid) return;

    setCouponError(null);
    setCouponLoading(true);
    try {
      const payload = isManualMode
        ? { code, tutorId, tokens: manualTokenCount }
        : { code, tutorId, packId: selectedPackId! };
      const result = await applyCoupon(payload);
      setAppliedCoupon({ code: result.couponCode, discount: result.couponDiscount });
      setCouponInput('');
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Invalid or expired coupon code';
      setCouponError(typeof msg === 'string' ? msg : 'Invalid coupon code');
      setAppliedCoupon(null);
    } finally {
      setCouponLoading(false);
    }
  }, [couponInput, selectedPackId, tutorId, isManualMode, isManualValid, manualTokenCount]);

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError(null);
    setCouponInput('');
  };

  // Revalidate coupon when pack changes
  useEffect(() => {
    if (appliedCoupon) {
      setCouponInput(appliedCoupon.code);
      setAppliedCoupon(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPackId]);

  // Pricing calculations
  const hourly = tutor?.hourlyRate ?? tutor?.pricePerHour ?? 0;
  const pricePerToken = Math.ceil(Number.isFinite(hourly) ? hourly : 0);

  const basePrice = isManualMode
    ? pricePerToken * manualTokenCount
    : (selectedPack?.basePrice ?? 0);
  const packDiscount = isManualMode ? 0 : (selectedPack?.packDiscount ?? 0);
  const couponDiscount = appliedCoupon?.discount ?? 0;
  const finalPriceINR = Math.max(0, basePrice - packDiscount - couponDiscount);
  const tokens = isManualMode ? manualTokenCount : (selectedPack?.pack.tokenCount ?? 0);

  const fmt = (inr: number) => formatCurrency(Math.round(convertFromINR(inr) ?? inr), displayCurrency);

  const canProceed = isManualMode ? isManualValid : Boolean(selectedPackId && packs.length > 0);

  const proceedToPayment = () => {
    if (!tutor?.id || !canProceed) return;
    let params: URLSearchParams;
    if (isManualMode) {
      params = new URLSearchParams({ tutorId: tutor.id, tokens: String(manualTokenCount) });
      if (appliedCoupon) params.set('couponCode', appliedCoupon.code);
    } else {
      params = new URLSearchParams({ tutorId: tutor.id, packId: selectedPackId! });
      if (appliedCoupon) params.set('couponCode', appliedCoupon.code);
    }
    nav(`/student/checkout?${params.toString()}`, { replace: true });
  };

  const confirmDemoBooking = async () => {
    try {
      setLoading(true);
      await api.post('/bookings/demo', { tutorId });
      setSuccess(true);
    } catch (e: any) {
      showError(e?.response?.data?.message || 'Failed to book demo');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !success) {
    return (
      <div className="container mx-auto px-4 py-10">
        <div className="mb-6 h-10 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-40 w-full animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  if (!tutor) {
    return (
      <div className="container mx-auto px-4 py-10">
        <p className="text-slate-700">Tutor not found. Try selecting a tutor again.</p>
      </div>
    );
  }

  // Demo Booking UI
  if (isDemo) {
    if (success) {
      return (
        <div className="container mx-auto px-4 py-16 text-center">
          <CheckCircle className="mx-auto mb-4 h-12 w-12 text-emerald-600" />
          <h2 className="text-xl font-semibold mb-2">Booking Confirmed</h2>
          <p>Your free demo with <b>{tutor.name}</b> has been booked.</p>
          <p className="mt-2 text-sm text-slate-600">We'll notify you once slots are available for this tutor.</p>
        </div>
      );
    }

    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center gap-2">
          <ShoppingCart className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Confirm Demo Booking</h1>
        </div>
        <div className="rounded-2xl border p-6 shadow-sm max-w-lg mx-auto" data-testid="student-cart-demo-section">
          <div className="flex items-center gap-4">
            <img
              src={tutor.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(tutor.name)}`}
              className="h-16 w-16 rounded-full border"
              alt={tutor.name}
            />
            <div>
              <div className="text-lg font-semibold">{tutor.name}</div>
              <div className="text-sm text-slate-600">
                {tutor.subjectPrimary || tutor.subjects?.[0] || 'Subject'}
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-700">
            You're about to book a <b>free demo session</b> with this tutor. No payment required.
          </p>
          <button
            onClick={confirmDemoBooking}
            disabled={loading}
            data-testid="student-cart-confirm-demo-btn"
            className="mt-6 w-full rounded-xl bg-emerald-600 py-3 font-medium text-white hover:bg-emerald-700 active:scale-[0.99]"
          >
            {loading ? 'Booking…' : 'Confirm Demo Booking'}
          </button>
        </div>
      </div>
    );
  }

  // Paid Booking UI
  return (
    <div className="container mx-auto px-4 py-8" data-testid="student-cart-page">
      <div className="mb-6 flex items-center gap-2">
        <ShoppingCart className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Your Cart</h1>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Panel */}
        <div className="space-y-6 lg:col-span-2">
          {/* Tutor Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="relative">
                <img
                  src={tutor.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(tutor.name)}`}
                  className="h-16 w-16 rounded-full border-2 border-white shadow"
                  alt={tutor.name}
                />
                {tutor.isVerified && (
                  <span className="absolute -bottom-1 -right-1 rounded-full bg-emerald-500 px-1 py-0.5 text-[10px] font-bold text-white leading-none">
                    ✓
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-slate-900">{tutor.name}</h2>
                </div>
                <div className="text-sm text-slate-500 mt-0.5">
                  {tutor.subjectPrimary || tutor.subjects?.[0] || 'Subject'}
                </div>
                {(tutor.rating != null) && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-amber-400 text-sm">{'★'.repeat(Math.round(tutor.rating ?? 0))}</span>
                    <span className="text-xs text-slate-500">({tutor.reviewCount ?? 0})</span>
                  </div>
                )}
                {tutor.bio && (
                  <p className="mt-2 text-xs text-slate-600 italic line-clamp-2">"{tutor.bio}"</p>
                )}
              </div>
              {activityInfo && (
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-ocean-700 bg-ocean-50 px-2.5 py-1.5 rounded-full border border-ocean-200">
                  <TrendingUp className="h-3 w-3" />
                  <span>{activityInfo.activityFrequency}</span>
                </div>
              )}
            </div>

            {/* Available Slots */}
            {!loadingSlots && availableSlots.length > 0 && (
              <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
                <h3 className="mb-2 text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> Available Slots (Next 14 days)
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {availableSlots.slice(0, 5).map((slot) => (
                    <span key={`${slot.startTime}-${slot.endTime}`} className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-2 py-0.5 text-xs text-slate-600">
                      <Clock className="h-3 w-3" />
                      {new Date(slot.startTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}{' '}
                      {new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  ))}
                  {availableSlots.length > 5 && (
                    <span className="text-xs text-slate-400 italic self-center">+{availableSlots.length - 5} more</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Token Pack Selection */}
          <div>
            <h2 className="mb-3 text-base font-semibold text-slate-800">Select a Token Pack</h2>

            {packsLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            ) : packs.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                No token packs available at the moment. Please contact support.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {packs.map((pricing) => {
                  const { pack } = pricing;
                  const isSelected = !isManualMode && selectedPackId === pack.id;
                  const displayFinal = fmt(pricing.finalPrice);
                  const displayBase = fmt(pricing.basePrice);
                  const displayPerClass = fmt(pricing.perClassPrice);
                  const hasDiscount = pricing.packDiscount > 0;

                  return (
                    <button
                      key={pack.id}
                      onClick={() => handleSelectPack(pack.id)}
                      className={`relative rounded-2xl border-2 p-4 text-left transition-all focus:outline-none ${
                        isSelected
                          ? 'border-ocean-600 bg-ocean-50 shadow-md ring-2 ring-ocean-200'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      {pack.badgeLabel && (
                        <span className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-bold shadow-sm whitespace-nowrap ${
                          pack.isHighlighted ? 'bg-ocean-600 text-white' : 'bg-slate-700 text-white'
                        }`}>
                          {pack.badgeLabel}
                        </span>
                      )}

                      <div className="flex items-center justify-between mb-1 mt-1">
                        <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center">
                          <Sparkles className="h-4 w-4 text-slate-500" />
                        </div>
                        {hasDiscount && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            Save {fmt(pricing.packDiscount)}
                          </span>
                        )}
                      </div>

                      <div className="mt-2">
                        <div className="text-base font-bold text-slate-900">{pack.displayLabel}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{displayPerClass}/class</div>
                      </div>

                      <div className="mt-2">
                        {hasDiscount && (
                          <span className="text-xs text-slate-400 line-through mr-1.5">{displayBase}</span>
                        )}
                        <span className="text-lg font-bold text-slate-900">{displayFinal}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Manual Token Input */}
          <div className={`rounded-2xl border-2 bg-white p-5 shadow-sm transition-colors ${
            isManualMode ? 'border-ocean-500 ring-2 ring-ocean-100' : 'border-slate-200'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-slate-800">Custom Token Amount</h2>
              {isManualMode && (
                <button
                  onClick={() => {
                    setManualTokenInput('');
                    const highlighted = packs.find((p) => p.pack.isHighlighted);
                    setSelectedPackId((highlighted ?? packs[0])?.pack.id ?? null);
                  }}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="h-3.5 w-3.5" /> Back to packs
                </button>
              )}
            </div>

            <p className="text-xs text-slate-500 mb-3">
              Need a different number of tokens? Enter any amount (minimum 5). Pack offers won't apply, but coupon codes can still be used.
            </p>

            <div className="flex items-center gap-3">
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="e.g. 5"
                  value={manualTokenInput}
                  onChange={(e) => handleManualTokenChange(e.target.value)}
                  onBlur={() => {
                    // On blur, if value is between 1-4, reset to 5
                    if (isManualMode && manualTokenCount > 0 && manualTokenCount < 5) {
                      setManualTokenInput('5');
                    }
                  }}
                  data-testid="student-cart-tokens-input"
                  className={`w-32 rounded-xl border px-3 py-2.5 text-sm text-center font-medium focus:outline-none focus:ring-2 transition-colors ${
                    isManualMode && manualTokenCount > 0 && manualTokenCount < 5
                      ? 'border-red-300 bg-red-50 focus:ring-red-200 text-red-600'
                      : isManualMode
                      ? 'border-ocean-400 bg-ocean-50 focus:ring-ocean-200 text-ocean-800'
                      : 'border-slate-200 bg-slate-50 focus:border-ocean-400 focus:ring-ocean-100 text-slate-700'
                  }`}
                />
              </div>

              <div className="text-sm text-slate-500">
                {isManualMode && manualTokenCount > 0 ? (
                  <div className="space-y-0.5">
                    <div>
                      <span className="font-semibold text-slate-800">{manualTokenCount}</span> token{manualTokenCount !== 1 ? 's' : ''}
                      {' '}&times;{' '}
                      <span className="font-semibold text-slate-800">{fmt(pricePerToken)}</span>/token
                    </div>
                    <div className="text-ocean-700 font-semibold">= {fmt(pricePerToken * manualTokenCount)}</div>
                  </div>
                ) : (
                  <span>tokens × {fmt(pricePerToken)}/token</span>
                )}
              </div>
            </div>

            {isManualMode && manualTokenCount > 0 && manualTokenCount < 5 && (
              <p className="mt-2 text-xs text-red-500 font-medium">Minimum 5 tokens required to proceed</p>
            )}
            {isManualMode && manualTokenCount >= 5 && (
              <p className="mt-2 text-xs text-emerald-600">
                {manualTokenCount} session{manualTokenCount !== 1 ? 's' : ''} ready — pack discounts don't apply, but coupon codes do
              </p>
            )}
          </div>

          {/* Coupon Section */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-800 flex items-center gap-2">
              <Tag className="h-4 w-4" /> Apply Coupon
            </h2>

            {appliedCoupon ? (
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <div>
                    <span className="text-sm font-semibold text-emerald-800">{appliedCoupon.code}</span>
                    <span className="text-xs text-emerald-600 ml-2">− {fmt(appliedCoupon.discount)} off</span>
                  </div>
                </div>
                <button onClick={handleRemoveCoupon} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter coupon code"
                  value={couponInput}
                  onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                  disabled={isManualMode ? !isManualValid : !selectedPackId}
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-ocean-400 focus:outline-none focus:ring-1 focus:ring-ocean-400 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  onClick={handleApplyCoupon}
                  disabled={!couponInput.trim() || couponLoading || (isManualMode ? !isManualValid : !selectedPackId)}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {couponLoading ? '…' : 'Apply'}
                </button>
              </div>
            )}

            {couponError && (
              <p className="mt-2 text-xs text-red-600">{couponError}</p>
            )}

            {!isManualMode && !selectedPackId && (
              <p className="mt-2 text-xs text-slate-400">Select a pack first to apply a coupon.</p>
            )}
            {isManualMode && !isManualValid && (
              <p className="mt-2 text-xs text-slate-400">Enter at least 5 tokens above to apply a coupon.</p>
            )}
          </div>
        </div>

        {/* Summary Panel */}
        <div className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sticky top-4">
          <h2 className="text-lg font-semibold text-slate-900">Summary</h2>
          <hr className="my-3 border-slate-100" />

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Student Name</span>
              <span className="font-medium text-slate-800">{displayStudentName}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Selected Pack</span>
              <span className="font-medium text-slate-800">
                {isManualMode
                  ? 'Custom'
                  : selectedPack ? selectedPack.pack.displayLabel : '—'}
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Total Classes</span>
              <span className="font-medium text-slate-800">
                {tokens > 0 ? `${tokens} Sessions` : '—'}
              </span>
            </div>
          </div>

          <hr className="my-3 border-slate-100" />

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Base Price</span>
              <span className={packDiscount > 0 ? 'text-slate-400 line-through' : 'font-medium text-slate-800'}>
                {basePrice > 0 ? fmt(basePrice) : '—'}
              </span>
            </div>

            {!isManualMode && packDiscount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Pack Discount</span>
                <span className="font-medium">−{fmt(packDiscount)}</span>
              </div>
            )}

            {couponDiscount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Coupon Discount</span>
                <span className="font-medium">−{fmt(couponDiscount)}</span>
              </div>
            )}

            {couponDiscount === 0 && (
              <div className="flex justify-between text-slate-400">
                <span>Coupon Discount</span>
                <span>−{fmt(0)}</span>
              </div>
            )}
          </div>

          <hr className="my-3 border-slate-100" />

          <div className="flex items-end justify-between">
            <div>
              <div className="text-sm text-slate-500">Final Amount</div>
              <div className="text-[10px] text-slate-400">Inclusive of all taxes</div>
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {finalPriceINR > 0 ? fmt(finalPriceINR) : '—'}
            </div>
          </div>

          <button
            onClick={proceedToPayment}
            disabled={!canProceed}
            data-testid="student-cart-proceed-btn"
            className={`mt-4 w-full rounded-xl py-3 font-medium text-white transition-all active:scale-[0.99] ${
              !canProceed
                ? 'bg-slate-300 cursor-not-allowed'
                : 'bg-ocean-700 hover:bg-ocean-800'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <CreditCard className="h-4 w-4" />
              Proceed to Payment
            </div>
          </button>

          <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Secure payment · Refundable as per policy</span>
          </div>
        </div>
      </div>
    </div>
  );
}
