// src/pages/SubjectLanding.tsx
// Reusable SEO landing page for each subject keyword.
// Renders keyword-optimised title/H1/paragraph + real tutor results for
// that subject – zero new design, reuses TutorCard/SubjectsGrid etc.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SEO from '../components/SEO';
import TutorCard from '../components/TutorCard';
import { TutorCardSkeleton } from '../components/skeletons';
import { searchTutors } from '../services/tutorService';
import type { Tutor } from '../services/tutorService';
import { useDisplayCurrency } from '../hooks/useDisplayCurrency';
import { getDemoStatusesForTutors } from '../services/bookingsService';
import { useAuth } from '../contexts/AuthContext';

// ── subject config ─────────────────────────────────────────────────
export interface SubjectConfig {
  /** URL slug, e.g. "online-maths-tutor" */
  slug: string;
  /** Prisma/DB subject name used in the search API */
  apiSubject: string;
  /** Display label */
  label: string;
  /** Primary SEO keyword (goes into title + H1) */
  primaryKeyword: string;
  /** Secondary keyword for title */
  secondaryKeyword: string;
  /** Short intro paragraph (natural language, keyword once) */
  intro: string;
  /** FAQ entries for structured data */
  faqs: { question: string; answer: string }[];
}

export const SUBJECT_PAGES: SubjectConfig[] = [
  {
    slug: 'online-maths-tutor',
    apiSubject: 'Mathematics',
    label: 'Mathematics',
    primaryKeyword: 'Online maths tutor',
    secondaryKeyword: 'Private maths tutoring online',
    intro:
      'Looking for an online maths tutor? Tunect connects you with verified Mathematics tutors for personalised 1-on-1 sessions. Whether it\'s algebra, calculus, or statistics — book a free demo and start learning today.',
    faqs: [
      {
        question: 'How do I find an online maths tutor on Tunect?',
        answer:
          'Simply search for "Mathematics" on our Find Tutors page, filter by class, board, and language, then book a free demo with your chosen tutor.',
      },
      {
        question: 'Is the first maths tutoring session free?',
        answer:
          'Yes — every student gets a free demo session with any tutor on Tunect so you can decide if it\'s the right fit before committing.',
      },
    ],
  },
  {
    slug: 'online-physics-tutor',
    apiSubject: 'Physics',
    label: 'Physics',
    primaryKeyword: 'Online physics tutor',
    secondaryKeyword: 'Private physics tutoring online',
    intro:
      'Need an online physics tutor? Tunect\'s verified Physics tutors offer 1-on-1 live sessions covering mechanics, thermodynamics, optics, and more. Get a free demo to see how personalised physics tutoring works.',
    faqs: [
      {
        question: 'Can I find an online physics tutor for competitive exams?',
        answer:
          'Absolutely. Many Tunect tutors specialise in competitive exam preparation including JEE, NEET, and Olympiad-level Physics.',
      },
      {
        question: 'How are physics tutors verified?',
        answer:
          'All tutors on Tunect go through KYC verification and skill assessments to ensure quality teaching.',
      },
    ],
  },
  {
    slug: 'online-chemistry-tutor',
    apiSubject: 'Chemistry',
    label: 'Chemistry',
    primaryKeyword: 'Online chemistry tutor',
    secondaryKeyword: 'Private chemistry tutoring online',
    intro:
      'Find an online chemistry tutor for organic, inorganic, or physical chemistry. Tunect\'s verified Chemistry tutors provide personalised 1-on-1 sessions. Book your free demo and master chemistry concepts at your own pace.',
    faqs: [
      {
        question: 'What chemistry topics do Tunect tutors cover?',
        answer:
          'Tutors on Tunect cover the full chemistry curriculum — organic, inorganic, physical chemistry, as well as exam-specific preparation for CBSE, ICSE, JEE, and NEET.',
      },
      {
        question: 'How much does online chemistry tutoring cost?',
        answer:
          'Each tutor sets their own hourly rate. Your first session is always free. After that, you purchase tokens to book further sessions.',
      },
    ],
  },
  {
    slug: 'online-biology-tutor',
    apiSubject: 'Biology',
    label: 'Biology',
    primaryKeyword: 'Online biology tutor',
    secondaryKeyword: 'Private biology tutoring online',
    intro:
      'Need an online biology tutor? From cell biology to genetics and ecology, Tunect\'s verified Biology tutors deliver personalised live sessions. Book a free demo and get expert help with every biology topic.',
    faqs: [
      {
        question: 'Is there an online biology tutor for NEET preparation?',
        answer:
          'Yes. Several Tunect Biology tutors specialise in NEET preparation, covering Botany and Zoology with structured lesson plans.',
      },
      {
        question: 'Can I switch biology tutors if I\'m not satisfied?',
        answer:
          'Of course. You can book demo sessions with multiple tutors until you find the perfect fit — no commitment required.',
      },
    ],
  },
  {
    slug: 'online-english-tutor',
    apiSubject: 'English',
    label: 'English',
    primaryKeyword: 'Online english tutor',
    secondaryKeyword: 'Private english tutoring online',
    intro:
      'Find an online english tutor for grammar, creative writing, literature, or spoken English. Tunect\'s verified English tutors offer 1-on-1 sessions tailored to your level. Start with a free demo today.',
    faqs: [
      {
        question: 'Can I improve spoken English with a Tunect tutor?',
        answer:
          'Yes — many English tutors on Tunect offer conversational practice and pronunciation coaching alongside academic tutoring.',
      },
      {
        question: 'Do English tutors help with competitive exam English sections?',
        answer:
          'Absolutely. Tutors cover comprehension, vocabulary, and essay writing for exams like IELTS, TOEFL, CAT, and board exams.',
      },
    ],
  },
];

// ── helper to find config by slug ──────────────────────────────────
export function getSubjectBySlug(slug: string): SubjectConfig | undefined {
  return SUBJECT_PAGES.find((s) => s.slug === slug);
}

// ── component ──────────────────────────────────────────────────────
type TutorWithDemo = Tutor & { demoUsed?: boolean };

export default function SubjectLanding({ config }: { config: SubjectConfig }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const isLoggedIn = !!user;
  useDisplayCurrency(); // ensure currency context is available for TutorCard

  const [loading, setLoading] = useState(true);
  const [tutors, setTutors] = useState<TutorWithDemo[]>([]);

  // Fetch tutors for this subject
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await searchTutors({
          subject: config.apiSubject,
          page: 1,
          pageSize: 8,
          sort: 'rating_desc',
        });
        let items: TutorWithDemo[] = res.items ?? [];

        // Enrich with demo status
        if (isLoggedIn && items.length > 0) {
          try {
            const statuses = await getDemoStatusesForTutors(items.map((t) => t.id));
            items = items.map((t) => ({ ...t, demoUsed: statuses[t.id] ?? false }));
          } catch {
            /* non-critical */
          }
        }
        if (!cancelled) setTutors(items);
      } catch {
        /* fail silently – empty state will show */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [config.apiSubject, isLoggedIn]);

  // Structured data – FAQ
  const faqSchema = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: config.faqs.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    }),
    [config],
  );

  // Structured data – BreadcrumbList
  const breadcrumbSchema = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://tunectnow.com/' },
        { '@type': 'ListItem', position: 2, name: 'Find Tutors', item: 'https://tunectnow.com/find-tutors' },
        {
          '@type': 'ListItem',
          position: 3,
          name: config.label,
          item: `https://tunectnow.com/${config.slug}`,
        },
      ],
    }),
    [config],
  );

  // Other subject pages for internal linking
  const otherSubjects = SUBJECT_PAGES.filter((s) => s.slug !== config.slug);

  return (
    <main className="container-px mx-auto py-10" data-testid="subject-landing-page">
      <SEO
        title={`${config.primaryKeyword} | ${config.secondaryKeyword} | Tunect`}
        description={config.intro}
        url={`/${config.slug}`}
        structuredData={[faqSchema, breadcrumbSchema]}
      />

      {/* Breadcrumb */}
      <nav className="text-sm text-slate-500 mb-6" aria-label="Breadcrumb" data-testid="subject-landing-breadcrumb">
        <Link to="/" className="hover:text-ocean-600" data-testid="subject-landing-breadcrumb-home">Home</Link>
        <span className="mx-1">/</span>
        <Link to="/find-tutors" className="hover:text-ocean-600" data-testid="subject-landing-breadcrumb-find-tutors">Find Tutors</Link>
        <span className="mx-1">/</span>
        <span className="text-slate-800 font-medium">{config.label}</span>
      </nav>

      {/* H1 – primary keyword */}
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
        {config.primaryKeyword}
      </h1>

      {/* Intro paragraph – mentions keyword naturally */}
      <p className="mt-4 max-w-3xl text-lg text-slate-600 leading-relaxed">
        {config.intro}
      </p>

      {/* CTA */}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={() => nav(`/find-tutors?subject=${encodeURIComponent(config.apiSubject)}`)}
          className="btn-primary"
          data-testid="subject-landing-browse-tutors-button"
        >
          Browse all {config.label} tutors
        </button>
        <Link to="/become-tutor" className="btn-ghost" data-testid="subject-landing-become-tutor-link">
          Become a tutor
        </Link>
      </div>

      {/* Tutor cards */}
      <section className="mt-10">
        <h2 className="text-xl font-bold mb-4">Top {config.label} tutors on Tunect</h2>
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <TutorCardSkeleton key={i} />
            ))}
          </div>
        ) : tutors.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {tutors.map((t) => (
              <TutorCard key={t.id} tutor={t} searchSubject={config.apiSubject} />
            ))}
          </div>
        ) : (
          <p className="text-slate-500">No tutors found yet — check back soon!</p>
        )}
      </section>

      {/* FAQ */}
      <section className="mt-14">
        <h2 className="text-xl font-bold mb-4">Frequently asked questions</h2>
        <dl className="space-y-4 max-w-3xl">
          {config.faqs.map((f, i) => (
            <div key={i}>
              <dt className="font-semibold text-ink">{f.question}</dt>
              <dd className="mt-1 text-slate-600">{f.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Cross-linking to other subject pages */}
      <section className="mt-14">
        <h2 className="text-lg font-bold mb-3">Explore other subjects</h2>
        <div className="flex flex-wrap gap-2">
          {otherSubjects.map((s) => (
            <Link
              key={s.slug}
              to={`/${s.slug}`}
              className="px-3 py-1.5 rounded-xl text-sm bg-ocean-50 text-ocean-800 hover:bg-ocean-100 transition"
              data-testid={`subject-landing-other-${s.slug}`}
            >
              {s.primaryKeyword}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
