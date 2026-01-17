// src/components/TutorCard.tsx
import React, { useMemo, useState, useEffect } from "react";
import { BadgeCheck, MessageSquare, Star, AlertCircle, Heart, Coins } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "../utils/currency";
import { useDisplayCurrency } from "../hooks/useDisplayCurrency";
import { useAuth } from "../contexts/AuthContext";
import api from "../lib/apiClient";
import TutorVideoHover from "./TutorVideoHover";

export type TutorCardProps = {
  tutor: {
    id: string;
    name?: string;
    subjects?: string[];
    classesTeach?: string[];
    languages?: string[];
    tags?: string[];
    rating?: number | null;
    reviews?: number;
    country?: string;
    timezone?: string;
    yearsExperience?: number;
    hourlyRate?: number;     // INR/hour (canonical)
    pricePerHour?: number;   // alt name
    summary?: string;
    avatarUrl?: string | null;
    verified?: boolean;
    demoUsed?: boolean; // if student already took demo with this tutor
    user?: { name?: string; email?: string } | null;
    video?: {
      id: string;
      videoUrl: string;
      thumbnail?: string;
      duration?: number;
    } | null;
  };
  tokenBalance?: number; // token balance for this specific tutor
  onBookDemo?: (tutorId: string) => void;
  onMessage?: (tutorId: string) => void;
};

const Stars: React.FC<{ value?: number }> = ({ value = 0 }) => {
  const full = Math.round(value);
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < full ? "fill-yellow-400 text-yellow-400" : "text-slate-300"}`}
        />
      ))}
    </div>
  );
};

const TutorCard: React.FC<TutorCardProps> = ({ tutor, tokenBalance: propTokenBalance, onBookDemo, onMessage }) => {
  const displayName = tutor.name || tutor.user?.name || 'Tutor';
  const nav = useNavigate();
  const { user } = useAuth();
  const [toast, setToast] = useState<{ type: 'error' | 'success' | 'warning'; message: string } | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number | null>(propTokenBalance ?? null);
  const [tokenBalanceLoading, setTokenBalanceLoading] = useState<boolean>(user?.role === 'STUDENT' && propTokenBalance === undefined);

  useEffect(() => {
    // If tokenBalance was passed as prop, use it
    if (propTokenBalance !== undefined) {
      setTokenBalance(propTokenBalance);
      setTokenBalanceLoading(false);
    }
    
    // Check if tutor is favorited (only for students)
    if (user?.role === 'STUDENT') {
      api.get(`/favorites/check/${tutor.id}`)
        .then(res => setIsFavorite(res.data?.isFavorite || false))
        .catch(() => setIsFavorite(false));
      
      // Fetch token balance for this tutor only if not passed as prop
      if (propTokenBalance === undefined) {
        setTokenBalanceLoading(true);
        api.get('/students/me/token-balances')
          .then(res => {
            const balances = res.data || [];
            const balance = balances.find((b: any) => b.tutorId === tutor.id);
            setTokenBalance(balance ? Number(balance.balance) : null);
          })
          .catch(() => setTokenBalance(null))
          .finally(() => setTokenBalanceLoading(false));
      }
    }
  }, [tutor.id, user, propTokenBalance]);

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (user?.role !== 'STUDENT') {
      setToast({ type: 'warning', message: 'Only students can favorite tutors' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setFavoriteLoading(true);
    try {
      if (isFavorite) {
        await api.delete(`/favorites/${tutor.id}`);
        setIsFavorite(false);
        setToast({ type: 'success', message: 'Removed from favorites' });
      } else {
        await api.post(`/favorites/${tutor.id}`);
        setIsFavorite(true);
        setToast({ type: 'success', message: 'Added to favorites!' });
      }
      setTimeout(() => setToast(null), 2000);
    } catch (err: any) {
      setToast({ 
        type: 'error', 
        message: err.response?.data?.message || 'Failed to update favorites' 
      });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setFavoriteLoading(false);
    }
  };

  const priceInInr =
    typeof tutor.hourlyRate === "number"
      ? tutor.hourlyRate
      : typeof tutor.pricePerHour === "number"
      ? tutor.pricePerHour
      : undefined;

  const { currency: displayCurrency, convertFromINR } = useDisplayCurrency();
  const convertedPrice = useMemo(
    () => (priceInInr != null ? convertFromINR(priceInInr) : undefined),
    [priceInInr, convertFromINR]
  );

  const goBook = () => {
    if (user?.role === 'TUTOR') {
      setToast({ type: 'warning', message: 'Tutor accounts cannot book demos or slots with other tutors' });
      setTimeout(() => setToast(null), 4000);
      return;
    }
    // 🚨 If demo not used → redirect with ?demo=1
    if (!tutor.demoUsed) {
      if (onBookDemo) return onBookDemo(tutor.id);
      return nav(`/student/demo-checkout?tutorId=${tutor.id}`);
    }
    // If student has tokens for this tutor → go to bookings to schedule
    if (!tokenBalanceLoading && tokenBalance !== null && tokenBalance > 0) {
      return nav('/student/bookings');
    }
    // else → go paid booking flow to buy tokens
    return nav(`/student/cart?tutorId=${tutor.id}`);
  };

  const goMsg = () => {
    if (user?.role === 'TUTOR') {
      setToast({ type: 'warning', message: 'Tutor accounts cannot send messages to other tutors' });
      setTimeout(() => setToast(null), 4000);
      return;
    }
    return onMessage ? onMessage(tutor.id) : nav(`/student/messages?to=${tutor.id}`);
  };

  const viewProfile = () => {
    nav(`/tutor/${tutor.id}`);
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md relative cursor-pointer" onClick={viewProfile}>
      {toast && (
        <div className="absolute top-4 left-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-300 px-4 py-3 text-sm text-yellow-800 shadow-lg">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="flex-1">{toast.message}</span>
        </div>
      )}
      <div className="relative h-36 w-full overflow-hidden rounded-t-2xl bg-gradient-to-br from-ocean-500 to-emerald-500">
        {tutor.video ? (
            <TutorVideoHover
              videoUrl={tutor.video.videoUrl}
              thumbnail={tutor.video.thumbnail || tutor.avatarUrl || undefined}
              duration={tutor.video.duration}
            />
        ) : tutor.avatarUrl ? (
          <img
            src={tutor.avatarUrl}
            alt={displayName}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : null}
        <div className="absolute right-3 top-3 flex gap-2 z-10">{user?.role === 'STUDENT' && (
            <button
              onClick={toggleFavorite}
              disabled={favoriteLoading}
              className={`p-2 rounded-full backdrop-blur transition ${
                isFavorite 
                  ? 'bg-red-500 hover:bg-red-600' 
                  : 'bg-white/90 hover:bg-white'
              } ${favoriteLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart 
                className={`h-4 w-4 ${
                  isFavorite ? 'text-white fill-white' : 'text-red-500'
                }`} 
              />
            </button>
          )}
          {tutor.verified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">
              <BadgeCheck className="h-3.5 w-3.5" /> Verified
            </span>
          )}
        </div>
      </div>

      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-900">{displayName}</h3>
            <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
              <Stars value={tutor.rating ?? 0} />
              <span className="text-slate-500">({tutor.reviews ?? 0} reviews)</span>
            </div>
          </div>
          {priceInInr !== undefined && (
            <div className="ml-auto flex items-baseline gap-1 text-right sm:whitespace-nowrap">
              <span className="text-2xl font-semibold leading-none">
                {formatCurrency((convertedPrice ?? priceInInr) as number, displayCurrency)}
              </span>
              <span className="text-sm text-slate-500 leading-none">/ hour</span>
            </div>
          )}
        </div>

        {(tutor.country || tutor.timezone) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            {tutor.country ? <span>{tutor.country}</span> : null}
            {tutor.timezone ? (
              <>
                <span className="text-slate-300">·</span>
                <span>{tutor.timezone}</span>
              </>
            ) : null}
          </div>
        )}

        {/* Subjects */}
        {(tutor.tags ?? tutor.subjects ?? []).length > 0 && (
          <div className="mt-3">
            <div className="flex flex-wrap gap-2">
              {(tutor.tags ?? tutor.subjects ?? []).slice(0, 3).map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Classes/Grades */}
        {(tutor.classesTeach ?? []).length > 0 && (
          <div className="mt-2">
            <div className="flex flex-wrap gap-2">
              {(tutor.classesTeach ?? []).slice(0, 3).map((cls) => (
                <span
                  key={cls}
                  className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700"
                >
                  {cls}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Languages */}
        {(tutor.languages ?? []).length > 0 && (
          <div className="mt-2">
            <div className="flex flex-wrap gap-2">
              {(tutor.languages ?? []).slice(0, 3).map((lang) => (
                <span
                  key={lang}
                  className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 flex items-center gap-1"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                  {lang}
                </span>
              ))}
            </div>
          </div>
        )}

        {tutor.summary && (
          <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-700">{tutor.summary}</p>
        )}

        {/* Token Balance Display for Students with Demo Used */}
        {user?.role === 'STUDENT' && tutor.demoUsed && !tokenBalanceLoading && tokenBalance !== null && tokenBalance > 0 && (
          <div className="mt-3 p-2 rounded-lg bg-emerald-50 border border-emerald-200">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-emerald-700">
                <Coins className="h-4 w-4" />
                <span className="font-medium">{tokenBalance.toFixed(1)} tokens available</span>
              </div>
              {tokenBalance <= 1 && (
                <span className="text-xs text-amber-600 font-medium">Low balance!</span>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={(e) => {
              e.stopPropagation();
              goMsg();
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <MessageSquare className="h-4 w-4" />
            Message
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              goBook();
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700"
              disabled={tokenBalanceLoading}
          >
              {tutor.demoUsed 
                ? (tokenBalanceLoading
                    ? "Checking tokens..."
                    : (tokenBalance !== null && tokenBalance > 0 ? "Use Tokens" : "Buy Tokens"))
                : "Book Demo"}
          </button>
        </div>

        {typeof tutor.yearsExperience === "number" && (
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>Experience: {tutor.yearsExperience} years</span>
          </div>
        )}
      </div>
    </article>
  );
};

export default TutorCard;

