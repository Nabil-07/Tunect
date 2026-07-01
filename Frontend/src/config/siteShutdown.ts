import type { Tutor } from '../services/tutorService';
import type { TrendingTutor } from '../components/HeroTrending';

/** Site is in reference-only mode — no onboarding or live operations. */
export const SITE_SHUTDOWN = true;

export const SHUTDOWN_OPERATOR_URL = 'https://tunectlabs.com';
export const SHUTDOWN_OPERATOR_NAME = 'Tunect Labs';

export const SHUTDOWN_HOME_ALERT =
  'This business has been shut down. This website is for reference purposes only — no new customer onboarding or platform operations will be processed.';

export const SHUTDOWN_OPERATOR_LINE = `Originally built and operated by ${SHUTDOWN_OPERATOR_NAME} (${SHUTDOWN_OPERATOR_URL.replace(/^https?:\/\//, '')}).`;

export const LOGIN_DISABLED_MESSAGE =
  'Login is disabled as the business has shut down. This site is kept online for reference only.';

export const SIGNUP_DISABLED_MESSAGE =
  'Sign up is disabled as the business has shut down. New accounts cannot be created.';

export const OPERATIONS_DISABLED_MESSAGE =
  'Platform operations are disabled. This page is shown for reference only.';

export const DUMMY_DATA_NOTICE =
  'Sample tutor profiles are shown for reference. Live tutor data is unavailable.';

export const DUMMY_TRENDING_TUTORS: TrendingTutor[] = [
  {
    id: 'ref-priya-sharma',
    name: 'Priya Sharma',
    subject: 'Mathematics',
    country: 'India',
    rating: 4.92,
    hourly: 850,
    badges: ['Verified', 'Trending'],
  },
  {
    id: 'ref-arjun-mehta',
    name: 'Arjun Mehta',
    subject: 'Physics',
    country: 'India',
    rating: 4.88,
    hourly: 900,
    badges: ['Verified'],
  },
  {
    id: 'ref-sara-khan',
    name: 'Sara Khan',
    subject: 'Chemistry',
    country: 'UAE',
    rating: 4.95,
    hourly: 750,
    badges: ['Trending'],
  },
  {
    id: 'ref-james-wilson',
    name: 'James Wilson',
    subject: 'English',
    country: 'United Kingdom',
    rating: 4.85,
    hourly: 1200,
    badges: ['Verified'],
  },
  {
    id: 'ref-ananya-rao',
    name: 'Ananya Rao',
    subject: 'Biology',
    country: 'India',
    rating: 4.9,
    hourly: 800,
    badges: ['Trending'],
  },
];

export const DUMMY_FIND_TUTORS: Tutor[] = DUMMY_TRENDING_TUTORS.map((t) => ({
  id: t.id,
  name: t.name,
  subject: t.subject,
  subjects: t.subject ? [t.subject] : [],
  classesTeach: ['Grade 9–12'],
  boards: ['CBSE', 'ICSE'],
  languages: ['English', 'Hindi'],
  rating: t.rating ?? 4.8,
  reviews: 24,
  hourlyRate: t.hourly,
  pricePerHour: t.hourly,
  verified: true,
  bio: 'Sample profile for reference. This tutor listing is not active.',
  summary: 'Reference-only tutor profile displayed while live data is unavailable.',
}));

export function shouldUseDummyTutors(apiFailed: boolean, count: number): boolean {
  return apiFailed || count === 0;
}
