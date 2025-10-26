// =============================================
// File: src/components/TrustSection.tsx
// Description: "Why Choose Tunect" icon section
// =============================================
import React from 'react';
import { ShieldCheck, Clock, Globe2, Wallet, User, BookOpen, Lock, BadgeCheck } from 'lucide-react';

const items = [
  {
    icon: <ShieldCheck className="h-5 w-5 text-slate-700" />,
    title: 'Verified Tutors',
    body: 'KYC verification and background checks for your safety.',
  },
  {
    icon: <Clock className="h-5 w-5 text-slate-700" />,
    title: 'Flexible Scheduling',
    body: 'Book sessions that fit your time zone and routine.',
  },
  {
    icon: <Globe2 className="h-5 w-5 text-slate-700" />,
    title: 'Global Reach',
    body: 'Connect with expert tutors worldwide—no boundaries.',
  },
  {
    icon: <Wallet className="h-5 w-5 text-slate-700" />,
    title: 'Token System',
    body: (
      <span>
        Transparent &amp; simple pricing.
        <span className="block font-medium text-ink mt-1">1 session = 1 hour = 1 token. Minimum purchase: 10 tokens.</span>
        <span className="block mt-1 text-slate-700">First session can be a free demo.</span>
      </span>
    ),
  },
  {
    icon: <User className="h-5 w-5 text-slate-700" />,
    title: 'One-on-One Focus',
    body: 'Personalized attention in every session.',
  },
  {
    icon: <BookOpen className="h-5 w-5 text-slate-700" />,
    title: 'Free Demo Sessions',
    body: 'Try before you commit with one free demo per pair.',
  },
  {
    icon: <Lock className="h-5 w-5 text-slate-700" />,
    title: 'Secure Messaging',
    body: 'Chat, share resources, and schedule safely.',
  },
  {
    icon: <BadgeCheck className="h-5 w-5 text-slate-700" />,
    title: 'Quality Assurance',
    body: 'Ratings and reviews ensure high quality learning.',
  },
];

const TrustSection: React.FC = () => {
  return (
    <section className="w-full bg-white py-14">
      <div className="container-px mx-auto">
        <h2 className="text-center text-2xl sm:text-3xl font-bold text-ink">
          Why Choose <span className="text-emerald-600">Tunect</span>?
        </h2>
        <p className="mt-2 text-center text-slate-600">
          We’ve built a comprehensive, secure platform for one-on-one online tutoring.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it) => (
            <div key={it.title} className="card p-6">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                {it.icon}
              </div>
              <h3 className="text-base font-semibold text-ink">{it.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustSection;