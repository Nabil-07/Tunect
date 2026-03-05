// =============================================
// File: src/components/TrustSection.tsx
// Description: "Why Choose Tunect" icon section
// =============================================
import React from 'react';
import { ShieldCheck, Clock, Globe2, Wallet, User, BookOpen, Lock, BadgeCheck } from 'lucide-react';

const items = [
  {
    icon: <ShieldCheck className="h-5 w-5 text-slate-700" />,
    title: 'Verified and Professional Tutors',
    body: 'Every tutor undergoes KYC verification and background checks to ensure student safety and professional quality.',
  },
  {
    icon: <Clock className="h-5 w-5 text-slate-700" />,
    title: 'Flexible Scheduling for Your Convenience',
    body: 'Book sessions that seamlessly integrate with your personal schedule and time zone.',
  },
  {
    icon: <Globe2 className="h-5 w-5 text-slate-700" />,
    title: 'Global Reach',
    body: 'Connect with expert online tutors India and from around the world without geographical limitations.',
  },
  {
    icon: <Wallet className="h-5 w-5 text-slate-700" />,
    title: 'Transparent and Simple Pricing Structure',
    body: (
      <span>
        Our simple token system means one hour of instruction equals one session token.
        <span className="block font-medium text-ink mt-1">A minimum purchase of five tokens is required.</span>
        <span className="block mt-1 text-slate-700">First session can be a free demo.</span>
      </span>
    ),
  },
  {
    icon: <User className="h-5 w-5 text-slate-700" />,
    title: 'Personalized One-on-One Instruction',
    body: 'Benefit from dedicated, one-on-one sessions tailored specifically to your learning requirements.',
  },
  {
    icon: <BookOpen className="h-5 w-5 text-slate-700" />,
    title: 'Free Demo Sessions',
    body: 'Test our platform by scheduling a complimentary demo session with a tutor before making a commitment.',
  },
  {
    icon: <Lock className="h-5 w-5 text-slate-700" />,
    title: 'Secure Messaging',
    body: 'Utilize our integrated messaging system to chat with tutors, share educational resources, and schedule sessions safely.',
  },
  {
    icon: <BadgeCheck className="h-5 w-5 text-slate-700" />,
    title: 'Quality Assurance',
    body: 'We maintain high standards through a system of ratings and reviews, ensuring a superior learning experience.',
  },
];

const TrustSection: React.FC = () => {
  return (
    <section className="w-full bg-white py-14">
      <div className="container-px mx-auto">
        <h2 className="text-center text-2xl sm:text-3xl font-bold text-ink">
          Why Choose <span className="text-emerald-600">Tunect</span> for Online Tutoring?
        </h2>
        <p className="mt-3 text-center text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Our mission is to make quality education accessible to everyone, everywhere. We have developed a comprehensive and secure platform dedicated to one-on-one online tutoring sessions.
        </p>
        <p className="mt-2 text-center text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
          This approach ensures that every student receives the focused, individual attention needed to succeed. If you are looking to find a tutor online, our extensive network provides access to the best educators in numerous fields.
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