// src/pages/how-it-works.tsx
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import {
  Search,
  UserPlus,
  CalendarCheck,
  Video,
  Star,
  BookOpen,
  BadgeCheck,
  Coins,
  Clock,
  MessageSquare,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react';

/* ── data ─────────────────────────────────────────────────────────── */
const studentSteps = [
  {
    icon: UserPlus,
    title: 'Create your free account',
    desc: 'Sign up in under a minute with your email or Google account. No credit card required.',
  },
  {
    icon: Search,
    title: 'Find a tutor online',
    desc: 'Search by subject, class, board, language, price, or rating. Preview tutor profiles and intro videos.',
  },
  {
    icon: CalendarCheck,
    title: 'Book a free demo session',
    desc: 'Every tutor offers a free demo so you can experience their teaching style before committing.',
  },
  {
    icon: Coins,
    title: 'Purchase tokens for paid sessions',
    desc: 'Buy token packs to book regular sessions. Flexible pricing — each tutor sets their own rate.',
  },
  {
    icon: Video,
    title: 'Join your live 1-on-1 session',
    desc: 'Connect via Tunect\'s built-in video call with whiteboard, screen share, and chat.',
  },
  {
    icon: Star,
    title: 'Rate, review & keep learning',
    desc: 'After each session, rate your tutor and track your progress from your dashboard.',
  },
];

const tutorSteps = [
  {
    icon: UserPlus,
    title: 'Sign up as a tutor',
    desc: 'Create your profile — add your subjects, qualifications, experience, and an intro video.',
  },
  {
    icon: BadgeCheck,
    title: 'Get verified (KYC)',
    desc: 'Complete a quick identity verification and optional skill assessment to earn the Verified badge.',
  },
  {
    icon: Clock,
    title: 'Set your availability & pricing',
    desc: 'Define your weekly schedule and hourly rate. You\'re in full control of when and how much you charge.',
  },
  {
    icon: CalendarCheck,
    title: 'Accept bookings',
    desc: 'Students book demos or paid sessions directly from your profile. You get notified instantly.',
  },
  {
    icon: Video,
    title: 'Teach live 1-on-1',
    desc: 'Join the session on Tunect\'s built-in video platform with whiteboard and chat support.',
  },
  {
    icon: TrendingUp,
    title: 'Earn & grow',
    desc: 'Get paid to your wallet, track earnings, and grow your student base through great reviews.',
  },
];

const highlights = [
  { icon: ShieldCheck, label: 'Verified tutors with KYC' },
  { icon: Video, label: 'Built-in HD video calls' },
  { icon: BookOpen, label: 'Whiteboard & screen share' },
  { icon: MessageSquare, label: 'In-app messaging' },
  { icon: Coins, label: 'Flexible token-based pricing' },
  { icon: Star, label: 'Transparent ratings & reviews' },
];

/* ── structured data ──────────────────────────────────────────────── */
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Is the first tutoring session free?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Every student gets a free demo session with any tutor on Tunect so you can experience their teaching before committing.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do I become a tutor on Tunect?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Sign up, complete your profile with subjects and qualifications, pass KYC verification, set your availability and pricing, and start accepting bookings.',
      },
    },
    {
      '@type': 'Question',
      name: 'What subjects are available?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Tunect covers a wide range of subjects including Mathematics, Physics, Chemistry, Biology, English, Computer Science, Arabic, French, and many more.',
      },
    },
    {
      '@type': 'Question',
      name: 'How are sessions conducted?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'All sessions happen live on Tunect\'s built-in video platform with features like whiteboard, screen sharing, and real-time chat.',
      },
    },
  ],
};

/* ── component ────────────────────────────────────────────────────── */
export default function HowItWorks() {
  return (
    <main className="container-px mx-auto py-12">
      <SEO
        title="How Tunect Works | Online tutoring for students & tutors"
        description="Learn how Tunect works for students and tutors. Find a tutor online, book a free demo, join live 1-on-1 sessions, and start learning or earning today."
        url="/how-it-works"
        structuredData={[faqSchema]}
      />

      {/* Hero */}
      <section className="text-center max-w-3xl mx-auto mb-16">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
          How Tunect Works
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          Whether you're a student looking for an online tutor or a tutor ready to teach — getting started takes minutes.
        </p>
      </section>

      {/* ── For Students ──────────────────────────────────────────── */}
      <section className="mb-20">
        <h2 className="text-2xl font-bold text-ink mb-8 text-center">For Students</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {studentSteps.map((s, i) => (
            <div
              key={i}
              className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-100 text-ocean-700">
                  <s.icon className="h-5 w-5" />
                </span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                  Step {i + 1}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link to="/find-tutors" className="btn-primary inline-block">
            Find a tutor now
          </Link>
        </div>
      </section>

      {/* ── For Tutors ────────────────────────────────────────────── */}
      <section className="mb-20">
        <h2 className="text-2xl font-bold text-ink mb-8 text-center">For Tutors</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {tutorSteps.map((s, i) => (
            <div
              key={i}
              className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <s.icon className="h-5 w-5" />
                </span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                  Step {i + 1}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link to="/become-tutor" className="btn-primary inline-block">
            Become a tutor
          </Link>
        </div>
      </section>

      {/* ── Platform Highlights ───────────────────────────────────── */}
      <section className="mb-20 rounded-2xl bg-slate-50 p-8 sm:p-12">
        <h2 className="text-2xl font-bold text-ink mb-6 text-center">
          Why students and tutors choose Tunect
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
          {highlights.map((h, i) => (
            <div key={i} className="flex items-center gap-3">
              <h.icon className="h-5 w-5 text-ocean-600 shrink-0" />
              <span className="text-sm text-slate-700">{h.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto mb-16">
        <h2 className="text-2xl font-bold text-ink mb-6 text-center">
          Frequently asked questions
        </h2>
        <dl className="space-y-5">
          {faqSchema.mainEntity.map((q, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-5">
              <dt className="font-semibold text-ink">{q.name}</dt>
              <dd className="mt-2 text-sm text-slate-600 leading-relaxed">
                {q.acceptedAnswer.text}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────── */}
      <section className="text-center py-10 rounded-2xl bg-gradient-to-r from-ocean-50 to-emerald-50">
        <h2 className="text-2xl font-bold text-ink mb-3">
          Ready to get started?
        </h2>
        <p className="text-slate-600 mb-6">
          Join thousands of students and tutors on Tunect — it only takes a minute.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/signup" className="btn-primary">Sign up free</Link>
          <Link to="/find-tutors" className="btn-ghost">Browse tutors</Link>
        </div>
      </section>
    </main>
  );
}
