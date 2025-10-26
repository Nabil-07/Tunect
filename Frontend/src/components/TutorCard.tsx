// src/components/TutorCard.tsx
import React, { useMemo } from "react";
import { BadgeCheck, MessageSquare, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "../utils/currency";
import { useDisplayCurrency } from "../hooks/useDisplayCurrency";

export type TutorCardProps = {
  tutor: {
    id: string;
    name: string;
    subjects?: string[];
    tags?: string[];
    rating?: number;
    reviews?: number;
    country?: string;
    timezone?: string;
    yearsExperience?: number;
    hourlyRate?: number;     // INR/hour (canonical)
    pricePerHour?: number;   // alt name
    summary?: string;
    avatarUrl?: string;
    verified?: boolean;
    demoUsed?: boolean; // if student already took demo with this tutor
  };
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

const TutorCard: React.FC<TutorCardProps> = ({ tutor, onBookDemo, onMessage }) => {
  const nav = useNavigate();

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
    // 🚨 If demo not used → redirect with ?demo=1
    if (!tutor.demoUsed) {
      if (onBookDemo) return onBookDemo(tutor.id);
      return nav(`/student/demo-checkout?tutorId=${tutor.id}`);
    }
    // else → go paid booking flow
    return nav(`/student/cart?tutorId=${tutor.id}`);
  };

  const goMsg = () => (onMessage ? onMessage(tutor.id) : nav(`/student/messages?to=${tutor.id}`));

  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative h-36 w-full overflow-hidden rounded-t-2xl bg-gradient-to-br from-ocean-500 to-emerald-500">
        {tutor.avatarUrl ? (
          <img
            src={tutor.avatarUrl}
            alt={tutor.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : null}
        {tutor.verified && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">
            <BadgeCheck className="h-3.5 w-3.5" /> Verified
          </span>
        )}
      </div>

      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-900">{tutor.name}</h3>
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

        <div className="mt-3 flex flex-wrap gap-2">
          {(tutor.tags ?? tutor.subjects ?? []).slice(0, 3).map((s) => (
            <span
              key={s}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              {s}
            </span>
          ))}
        </div>

        {tutor.summary && (
          <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-700">{tutor.summary}</p>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={goMsg}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <MessageSquare className="h-4 w-4" />
            Message
          </button>

          <button
            onClick={goBook}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700"
          >
            {tutor.demoUsed ? "Book Slot" : "Book Demo"}
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

