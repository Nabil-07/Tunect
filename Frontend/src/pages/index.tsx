// =============================================
// File: src/pages/index.tsx (UPDATED)
// Description: Home page wired to new components
// =============================================
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/SEO';
import HeroTrending from '../components/HeroTrending';
import SubjectsGrid from '../components/SubjectsGrid';
import TrustSection from '../components/TrustSection';
import Testimonials from '../components/Testimonials';
import StatsStrip from '../components/StatsStrip';


// Optional animations: load framer-motion only if present
let Motion: any = null;
(async () => {
  try {
    const fm = await import('framer-motion');
    Motion = fm.motion;
  } catch {
    Motion = null;
  }
})();

const subjects = [
  'Science',
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Computer Applications',
  'Python',
  'English',
];

export default function Home() {
  const nav = useNavigate();
  const [q, setQ] = useState('');

  const HeroTitle = useMemo(() => {
    const children = 'Online tutoring: find verified tutors you’ll love.';
    if (!Motion) {
      return (
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-ink">{children}</h1>
      );
    }
    return (
      <Motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-4xl sm:text-5xl font-extrabold tracking-tight text-ink"
      >
        {children}
      </Motion.h1>
    );
  }, []);

  const onSearch = () => {
    const trimmed = q.trim();
    const url = trimmed ? `/find-tutors?q=${encodeURIComponent(trimmed)}` : '/find-tutors'; // ✅ fixed backticks
    nav(url);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') onSearch();
  };

  // Structured data for Organization
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Tunect',
    url: 'https://tunectnow.com',
    logo: 'https://tunectnow.com/tunect_logo_hd_main.png',
    description: 'Global 1-on-1 online tutoring platform connecting students with verified tutors worldwide. Book free demo sessions and learn from expert tutors.',
    sameAs: [
      'https://www.linkedin.com/company/tunect',
      'https://twitter.com/tunect',
      'https://www.instagram.com/tunect',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Service',
      availableLanguage: ['English', 'Hindi'],
    },
  };

  // WebSite + SearchAction schema (sitelinks search box eligibility)
  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Tunect',
    url: 'https://tunectnow.com',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://tunectnow.com/find-tutors?q={search_term_string}',
      },
      'query-input': 'required name=search_term_string',
    },
  };

  // FAQ Schema
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is Tunect?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Tunect is a global 1-on-1 online tutoring platform that connects students with verified tutors across the globe. Students can book personalized sessions and get their first session free as a demo.',
        },
      },
      {
        '@type': 'Question',
        name: 'How much does tutoring cost on Tunect?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Each tutor sets their own hourly rate. The first session is always free as a demo. After that, pricing varies by tutor and subject. You purchase tokens to book sessions.',
        },
      },
      {
        '@type': 'Question',
        name: 'Are tutors verified on Tunect?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, all tutors on Tunect go through a verification process including KYC checks and skill assessments to ensure quality teaching.',
        },
      },
      {
        '@type': 'Question',
        name: 'What subjects can I learn on Tunect?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Tunect offers tutoring in a wide range of subjects including Mathematics, Physics, Chemistry, Biology, Computer Science, English, Arabic, French, and many more. You can search by subject to find the right tutor.',
        },
      },
    ],
  };

  return (
    <main>
      <SEO
        title="Online tutoring | Find a tutor online | Online tutors India | Tunect"
        description="Online tutoring with verified tutors for 1-on-1 learning. Find a tutor online for Mathematics, Physics, Chemistry, English, and more. Online tutors India and worldwide — book a free demo on Tunect."
        url="/"
        structuredData={[organizationSchema, websiteSchema, faqSchema]}
        preloadImages={["/tunect_logo_hd.png"]}
      />
      {/* Hero – premium subtle background */}
      <section
        className={[
          'relative overflow-hidden',
          'bg-[conic-gradient(at_20%_10%,#f7fbff_0%,#eef6ff_25%,#f9fdfb_55%,#ffffff_80%)]',
          'before:absolute before:inset-0 before:pointer-events-none',
          'before:bg-[radial-gradient(800px_400px_at_95%_20%,rgba(16,185,129,0.08),transparent_60%),radial-gradient(700px_380px_at_10%_-10%,rgba(59,130,246,0.07),transparent_60%)]',
        ].join(' ')}
      >
        <div className="container-px mx-auto grid lg:grid-cols-2 items-center gap-8 py-16">
          <div>
            {HeroTitle}
            <p className="mt-4 text-lg text-slate-600">
              Book 1-on-1 sessions with top tutors worldwide. First session can be a <b>free demo</b>.
            </p>

            {/* Search bar */}
            <div className="mt-6 card p-2 flex items-center gap-2">
              <Search className="text-slate-500" size={20} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                className="flex-1 outline-none bg-transparent px-2 py-2 text-sm"
                placeholder="Search subject, topic, or tutor name"
                aria-label="Search tutors"
              />
              <button onClick={onSearch} className="btn-primary">Search</button>
            </div>

            {/* Subjects quick chips */}
            <SubjectsGrid subjects={subjects} />
          </div>

          {/* 🔥 Auto-cycling Trending Tutors card */}
          <HeroTrending />
        </div>
      </section>

      {/* Why Choose / Trust */}
      <TrustSection />

      {/* Stats Strip */}
      <StatsStrip />

      {/* Testimonials */}
      <Testimonials />
      {/* ✅ CTA removed as requested */}
    </main>
  );
}
