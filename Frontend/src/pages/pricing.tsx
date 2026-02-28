// src/pages/pricing.tsx
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import {
  Gift,
  Coins,
  ShieldCheck,
  Clock,
  CreditCard,
  Users,
  Star,
  Zap,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';

/* ── highlights ─────────────────────────────────────────────────── */
const highlights = [
  {
    icon: Gift,
    title: 'Free demo session',
    desc: 'Your first session with every tutor is completely free. Try before you commit.',
    accent: 'bg-emerald-100 text-emerald-600',
  },
  {
    icon: Coins,
    title: 'Token-based pricing',
    desc: 'Buy tokens tied to your chosen tutor. 1 token = 1 hour of tutoring at the tutor\'s hourly rate.',
    accent: 'bg-amber-100 text-amber-600',
  },
  {
    icon: ShieldCheck,
    title: 'Secure payments',
    desc: 'All transactions are processed securely through Razorpay with bank-grade encryption.',
    accent: 'bg-blue-100 text-blue-600',
  },
  {
    icon: Clock,
    title: '60-day validity',
    desc: 'Tokens are valid for 60 days from the date of purchase — plenty of time to schedule sessions.',
    accent: 'bg-purple-100 text-purple-600',
  },
];

/* ── how tokens work steps ──────────────────────────────────────── */
const tokenSteps = [
  {
    step: 1,
    title: 'Find a tutor',
    desc: 'Browse tutors by subject, class, language, or rating. Each tutor sets their own hourly rate.',
    icon: Users,
  },
  {
    step: 2,
    title: 'Try a free demo',
    desc: 'Book a free demo session with any tutor to see if they\'re the right fit. No payment needed.',
    icon: Gift,
  },
  {
    step: 3,
    title: 'Purchase tokens',
    desc: 'Buy a minimum of 5 tokens to start booking sessions. Token price equals the tutor\'s hourly rate in INR.',
    icon: CreditCard,
  },
  {
    step: 4,
    title: 'Book & learn',
    desc: 'Use your tokens to book 1-on-1 sessions at times that suit you. Sessions happen via live video.',
    icon: BookOpen,
  },
];

/* ── comparison data ────────────────────────────────────────────── */
const comparisonRows = [
  { feature: 'First session free', tunect: true, traditional: false },
  { feature: 'Choose your own tutor', tunect: true, traditional: false },
  { feature: 'Flexible scheduling', tunect: true, traditional: false },
  { feature: 'Verified tutor profiles', tunect: true, traditional: false },
  { feature: 'Learn from anywhere', tunect: true, traditional: false },
  { feature: 'Pay per hour — no subscriptions', tunect: true, traditional: false },
  { feature: 'Ratings & reviews', tunect: true, traditional: false },
  { feature: 'Secure online payments', tunect: true, traditional: true },
];

/* ── FAQ ────────────────────────────────────────────────────────── */
const faqs = [
  {
    q: 'How much does tutoring cost on Tunect?',
    a: 'Each tutor sets their own hourly rate, so pricing varies. You can filter tutors by price range to find one that fits your budget. Your very first session with any tutor is always free as a demo.',
  },
  {
    q: 'Is the first session really free?',
    a: 'Yes! Every student gets their first session with any tutor completely free as a demo. This lets you experience the teaching style and decide if the tutor is a good fit — no payment required.',
  },
  {
    q: 'What are tokens and how do they work?',
    a: 'Tokens are our simple booking currency. 1 token = 1 hour of tutoring. When you buy tokens for a tutor, the price per token equals that tutor\'s hourly rate in INR. You spend tokens to book sessions.',
  },
  {
    q: 'What is the minimum token purchase?',
    a: 'You need a minimum of 5 tokens to book a session with a tutor. This ensures you have enough credit for multiple sessions.',
  },
  {
    q: 'How long are tokens valid?',
    a: 'Tokens are valid for 60 days from the date of purchase. We recommend booking sessions promptly to make the most of your tokens.',
  },
  {
    q: 'What payment methods are accepted?',
    a: 'We accept all major payment methods through Razorpay — including UPI, debit/credit cards (Visa, Mastercard, RuPay), net banking, and popular wallets.',
  },
  {
    q: 'Can I get a refund?',
    a: 'If a session is cancelled by the tutor or due to a platform issue, your tokens are refunded to your balance. For payment-related refund requests, please contact our support team.',
  },
  {
    q: 'Are there any hidden fees?',
    a: 'No hidden fees! The price you see per token is what you pay. Taxes (GST) may apply as per government regulations and will be shown at checkout.',
  },
];

/* ── structured data ────────────────────────────────────────────── */
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

/* ── component ──────────────────────────────────────────────────── */
export default function Pricing() {
  return (
    <main className="bg-white">
      <SEO
        title="Pricing & Tokens | Affordable Online Tutoring | Tunect"
        description="Affordable online tutoring pricing. First session free! Buy tokens to book 1-on-1 sessions with verified tutors. No subscriptions, no hidden fees. Pay per hour."
        url="/pricing"
        structuredData={faqSchema}
      />

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-ocean-50 via-white to-emerald-50 py-16 lg:py-24">
        <div className="container-px mx-auto text-center max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-semibold text-emerald-700 mb-6">
            <Gift className="h-4 w-4" /> First session always free
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto">
            No subscriptions. No hidden fees. Try any tutor free, then buy tokens to continue — each tutor sets their own rate, so you only pay for what you need.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/find-tutors"
              className="btn-primary inline-flex items-center gap-2 px-6 py-3 text-base font-semibold"
            >
              Find a tutor <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/how-it-works"
              className="btn-ghost inline-flex items-center gap-2 px-6 py-3 text-base font-semibold"
            >
              How it works
            </Link>
          </div>
        </div>
      </section>

      {/* ── Highlights ────────────────────────────────────────── */}
      <section className="container-px mx-auto py-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {highlights.map((h) => (
            <div
              key={h.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition"
            >
              <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${h.accent}`}>
                <h.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{h.title}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{h.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How Tokens Work ───────────────────────────────────── */}
      <section className="bg-slate-50 py-16">
        <div className="container-px mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-slate-900">How tokens work</h2>
            <p className="mt-3 text-slate-600">Four simple steps from signup to learning</p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2">
            {tokenSteps.map((s) => (
              <div key={s.step} className="relative flex gap-4 rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-ocean-600 text-white font-bold text-sm">
                  {s.step}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{s.title}</h3>
                  <p className="mt-1 text-sm text-slate-600 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing Example ───────────────────────────────────── */}
      <section className="container-px mx-auto py-16 max-w-4xl">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-slate-900">What you pay</h2>
          <p className="mt-3 text-slate-600">Token price = the tutor's hourly rate. Here's an example:</p>
        </div>

        <div className="rounded-2xl border-2 border-ocean-200 bg-gradient-to-br from-ocean-50 to-white p-8 shadow-sm">
          <div className="grid gap-8 md:grid-cols-3 text-center">
            <div>
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-ocean-100 text-ocean-600 mb-3">
                <Users className="h-7 w-7" />
              </div>
              <p className="text-sm text-slate-500 font-medium">Tutor's rate</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">₹500/hr</p>
            </div>
            <div>
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-3">
                <Coins className="h-7 w-7" />
              </div>
              <p className="text-sm text-slate-500 font-medium">You buy 5 tokens</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">₹2,500</p>
            </div>
            <div>
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-3">
                <BookOpen className="h-7 w-7" />
              </div>
              <p className="text-sm text-slate-500 font-medium">You get</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">5 hours</p>
              <p className="text-xs text-slate-500 mt-0.5">of 1-on-1 tutoring</p>
            </div>
          </div>
          <p className="mt-6 text-center text-sm text-slate-500">
            + your first session is always <strong className="text-emerald-600">free</strong> as a demo
          </p>
        </div>
      </section>

      {/* ── Comparison Table ──────────────────────────────────── */}
      <section className="bg-slate-50 py-16">
        <div className="container-px mx-auto max-w-3xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-extrabold text-slate-900">Tunect vs traditional tutoring</h2>
            <p className="mt-3 text-slate-600">See why students prefer online tutoring on Tunect</p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100">
                  <th className="px-6 py-3 text-left font-semibold text-slate-700">Feature</th>
                  <th className="px-6 py-3 text-center font-semibold text-ocean-700">Tunect</th>
                  <th className="px-6 py-3 text-center font-semibold text-slate-500">Traditional</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, i) => (
                  <tr key={row.feature} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-6 py-3 text-slate-700">{row.feature}</td>
                    <td className="px-6 py-3 text-center">
                      {row.tunect ? (
                        <CheckCircle2 className="inline h-5 w-5 text-emerald-500" />
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {row.traditional ? (
                        <CheckCircle2 className="inline h-5 w-5 text-emerald-500" />
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Why students trust us ─────────────────────────────── */}
      <section className="container-px mx-auto py-16 max-w-4xl">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-slate-900">Why students trust Tunect</h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { icon: Star, title: 'Top-rated tutors', desc: 'All tutors are verified. Browse ratings, reviews, and intro videos before you book.' },
            { icon: Zap, title: 'No lock-in', desc: 'No monthly subscriptions. Buy tokens when you need them. Switch tutors any time.' },
            { icon: ShieldCheck, title: 'Money-back guarantee', desc: 'If a session is cancelled by the tutor, your tokens are fully refunded.' },
          ].map((item) => (
            <div key={item.title} className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-ocean-100 text-ocean-600">
                <item.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-bold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────── */}
      <section className="bg-slate-50 py-16">
        <div className="container-px mx-auto max-w-3xl">
          <div className="text-center mb-10">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-ocean-100 text-ocean-600 mx-auto">
              <HelpCircle className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-3xl font-extrabold text-slate-900">Frequently asked questions</h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq) => (
              <details key={faq.q} className="group rounded-xl border border-slate-200 bg-white shadow-sm">
                <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-left font-semibold text-slate-900 hover:text-ocean-700 transition-colors">
                  {faq.q}
                  <span className="ml-4 text-slate-400 group-open:rotate-45 transition-transform text-xl">+</span>
                </summary>
                <p className="px-6 pb-4 text-sm text-slate-600 leading-relaxed">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className="bg-gradient-to-r from-ocean-600 to-emerald-600 py-16">
        <div className="container-px mx-auto text-center max-w-2xl">
          <h2 className="text-3xl font-extrabold text-white">Ready to start learning?</h2>
          <p className="mt-3 text-ocean-100">
            Your first session is free — no credit card required. Find your perfect tutor today.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              to="/find-tutors"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-base font-semibold text-ocean-700 shadow hover:bg-ocean-50 transition"
            >
              Find a tutor <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-xl border-2 border-white/30 px-6 py-3 text-base font-semibold text-white hover:bg-white/10 transition"
            >
              Sign up free
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}