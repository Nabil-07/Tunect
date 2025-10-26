// Shared list of supported tutor subjects for grades 1-12.
const CORE_SUBJECTS = [
  'English',
  'Mathematics',
  'Applied Mathematics',
  'Environmental Studies (EVS)',
  'Science (General)',
  'Physics',
  'Chemistry',
  'Biology',
  'Social Science (General)',
  'History',
  'Geography',
  'Political Science / Civics',
  'Economics',
  'Accountancy',
  'Business Studies',
  'Entrepreneurship',
  'Computer Science',
  'Informatics Practices',
  'Information Technology',
  'Computer Applications',
  'Artificial Intelligence',
  'Psychology',
  'Sociology',
  'Philosophy',
  'Legal Studies',
  'Home Science',
  'Fine Arts',
  'Visual Arts',
  'Music',
  'Dance',
  'Biotechnology',
  'Statistics'
] as const;

const LANGUAGE_SUBJECTS = [
  'Hindi',
  'Sanskrit',
  'French',
  'German',
  'Spanish',
  'Arabic',
  'Urdu',
  'Punjabi',
  'Tamil',
  'Telugu',
  'Kannada',
  'Malayalam',
  'Marathi',
  'Bengali',
  'Gujarati'
] as const;

// Legacy/extra subjects we still want to keep available.
const ADDITIONAL_SUBJECTS = [
  'Commerce',
  'Environmental Science',
  'General Knowledge',
  'Physical Education'
] as const;

type CoreSubject = (typeof CORE_SUBJECTS)[number];
type LanguageSubject = (typeof LANGUAGE_SUBJECTS)[number];
type AdditionalSubject = (typeof ADDITIONAL_SUBJECTS)[number];

type SubjectLiteral = CoreSubject | LanguageSubject | AdditionalSubject;

const subjectSet = new Set<SubjectLiteral>([
  ...CORE_SUBJECTS,
  ...LANGUAGE_SUBJECTS,
  ...ADDITIONAL_SUBJECTS,
]);

export const SUBJECT_OPTIONS = Array.from(subjectSet)
  .sort((a, b) => a.localeCompare(b)) as SubjectLiteral[];

export type SubjectOption = SubjectLiteral;
