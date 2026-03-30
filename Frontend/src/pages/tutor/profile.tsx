import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/apiClient';
import { getMyProfile, updateMyProfile } from '../../services/tutorService';
import { uploadMyAvatar } from '../../services/avatarUploadService';
import { me as fetchMe } from '../../services/authService';
import { useAuth } from '../../contexts/AuthContext';
import { getCountries } from '../../utils/countryData';
import { formatCurrency, getUsdRates } from '../../utils/currency';
import { SUBJECT_OPTIONS } from '../../constants/subjects';
import { LANGUAGE_OPTIONS } from '../../constants/languages';
import { BOARD_OPTIONS } from '../../constants/boards';
import AvatarUploadModal from '../../components/AvatarUploadModal';

const normalizeSpaces = (value: string) => String(value || '').replace(/\s+/g, ' ').trim();
const toTitleCase = (value: string) =>
  normalizeSpaces(value)
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (/^[ivxlcdm]+$/i.test(word)) return word.toUpperCase();
      if (/^[A-Z0-9]{2,6}$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

const SUBJECT_SHORTFORM_MAP: Record<string, string> = {
  phy: 'Physics',
  phys: 'Physics',
  chemistry: 'Chemistry',
  chem: 'Chemistry',
  chm: 'Chemistry',
  bio: 'Biology',
  maths: 'Mathematics',
  math: 'Mathematics',
  mth: 'Mathematics',
  eng: 'English',
  cs: 'Computer Science',
  comp: 'Computer Science',
  cse: 'Computer Science',
  ip: 'Informatics Practices',
  it: 'Information Technology',
  ai: 'Artificial Intelligence',
  eco: 'Economics',
  econ: 'Economics',
  acc: 'Accountancy',
  acct: 'Accountancy',
  bst: 'Business Studies',
  pe: 'Physical Education',
  evs: 'Environmental Studies (EVS)',
  sst: 'Social Science (General)',
  gk: 'General Knowledge',
};

const normalizeAliasKey = (value: string) =>
  normalizeSpaces(value).toLowerCase().replace(/[^a-z0-9]/g, '');

const standardizeSubject = (value: string) => {
  const titled = toTitleCase(value);
  const aliasKey = normalizeAliasKey(titled);
  return SUBJECT_SHORTFORM_MAP[aliasKey] || titled;
};

const SUBJECT_AUTOCOMPLETE_OPTIONS = Array.from(
  new Set([...SUBJECT_OPTIONS, ...Object.values(SUBJECT_SHORTFORM_MAP)]),
).sort((a, b) => a.localeCompare(b));

const getSubjectSuggestion = (query: string, exclude: string[] = []) => {
  const q = normalizeSpaces(query).toLowerCase();
  if (!q) return '';
  const excluded = new Set(exclude.map((v) => v.toLowerCase()));
  const startsWith = SUBJECT_AUTOCOMPLETE_OPTIONS.find(
    (option) => option.toLowerCase().startsWith(q) && !excluded.has(option.toLowerCase()),
  );
  if (startsWith) return startsWith;
  const contains = SUBJECT_AUTOCOMPLETE_OPTIONS.find(
    (option) => option.toLowerCase().includes(q) && !excluded.has(option.toLowerCase()),
  );
  return contains || '';
};
const standardizeGrade = (value: string) => {
  const cleaned = normalizeSpaces(value);
  if (!cleaned) return '';
  const normalized = cleaned.replace(/\bclass\b/gi, 'Grade').replace(/\bstd\b/gi, 'Grade');
  const single = normalized.match(/^(?:grade|standard)\s*(\d{1,2})$/i) || normalized.match(/^(\d{1,2})$/);
  if (single) return `Grade ${single[1]}`;
  const range = normalized.match(/^(?:grade|standard)?\s*(\d{1,2})\s*(?:-|to)\s*(\d{1,2})$/i);
  if (range) return `Grade ${range[1]}-${range[2]}`;
  return toTitleCase(normalized);
};

const mergeUniqueCaseInsensitive = (base: string[], additions: string[]) => {
  const out = [...base];
  additions.forEach((item) => {
    const value = normalizeSpaces(item);
    if (!value) return;
    if (!out.some((existing) => existing.toLowerCase() === value.toLowerCase())) {
      out.push(value);
    }
  });
  return out;
};

type ProfileData = {
  name: string;
  email?: string;
  bio: string;
  summary?: string;
  subjects: string[];
  languages: string[];
  hourlyRate?: number;
  country?: string;
  avatarUrl?: string | null;
  yearsExperience?: number;
  degrees?: string[];
  qualifications?: string;
  classesTeach?: string[];
  boards?: string[];
  classSubjectMappings?: Array<{ classRange: string; subjects: string[] }>;
  kycSelfieApproved?: boolean;
};

export default function Profile() {
  const { user: authUser, setUser } = useAuth();
  const [data, setData] = useState<ProfileData>({ 
    name: '', 
    bio: '', 
    summary: '',
    subjects: [], 
    languages: [],
    yearsExperience: undefined,
    degrees: [],
    qualifications: '',
    classesTeach: [],
    boards: [],
    classSubjectMappings: [],
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });
  const [displayCurrency, setDisplayCurrency] = useState<string>(() =>
    localStorage.getItem('preferred_currency') || 'INR'
  );
  const [subjectQuery, setSubjectQuery] = useState('');
  const [languageQuery, setLanguageQuery] = useState('');
  const [showLanguageOptions, setShowLanguageOptions] = useState(false);
  const [degreeInput, setDegreeInput] = useState('');
  const [classInput, setClassInput] = useState('');
  const [mappingSubjectDrafts, setMappingSubjectDrafts] = useState<Record<number, string>>({});
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);

  const countries = useMemo(() => getCountries(), []);

  const loadProfile = async () => {
    try {
      const raw = (await getMyProfile().catch(async () => {
        const { data } = await api.get('/profiles/me');
        return {
          name: data?.user?.name ?? '',
          email: data?.user?.email ?? '',
          bio: data?.tutor?.bio ?? '',
          subjects: data?.tutor?.subjects ?? [],
          languages: data?.tutor?.languages ?? [],
          hourlyRate: data?.tutor?.hourlyRate ?? undefined,
          country: data?.tutor?.country ?? undefined,
          avatarUrl: data?.user?.avatarUrl ?? null,
        } as ProfileData;
      })) as any;

      const next: ProfileData = {
        name: raw?.name ?? raw?.user?.name ?? '',
        email: raw?.email ?? raw?.user?.email ?? undefined,
        bio: raw?.bio ?? raw?.tutor?.bio ?? '',
        summary: raw?.summary ?? raw?.tutor?.summary ?? '',
        subjects: Array.isArray(raw?.subjects) ? raw.subjects : raw?.tutor?.subjects ?? [],
        languages: Array.isArray(raw?.languages) ? raw.languages : raw?.tutor?.languages ?? [],
        hourlyRate: Number.isFinite(raw?.hourlyRate) ? Number(raw.hourlyRate) : raw?.tutor?.hourlyRate,
        country: raw?.country ?? undefined,
        avatarUrl: raw?.avatarUrl ?? raw?.user?.avatarUrl ?? null,
        yearsExperience: raw?.yearsExperience ?? raw?.tutor?.yearsExperience ?? undefined,
        degrees: Array.isArray(raw?.degrees) ? raw.degrees : raw?.tutor?.degrees ?? [],
        qualifications: raw?.qualifications ?? raw?.tutor?.qualifications ?? '',
        classesTeach: Array.isArray(raw?.classesTeach) ? raw.classesTeach : raw?.tutor?.classesTeach ?? [],
        boards: Array.isArray(raw?.boards) ? raw.boards : raw?.tutor?.boards ?? [],
        classSubjectMappings: Array.isArray(raw?.classSubjectMappings)
          ? raw.classSubjectMappings
          : raw?.tutor?.classSubjectMappings ?? [],
        kycSelfieApproved: raw?.kycSelfieApproved === true,
      };
      setData(next);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    getUsdRates().then(setRates).catch(() => {});
    void loadProfile();
  }, []);

  const selectedSubjects = data.subjects ?? [];
  const selectedLanguages = data.languages ?? [];

  const filteredLanguageOptions = useMemo(() => {
    const query = languageQuery.trim().toLowerCase();
    const taken = new Set(selectedLanguages.map((l) => l.toLowerCase()));
    return LANGUAGE_OPTIONS.filter((option) => {
      if (taken.has(option.toLowerCase())) return false;
      if (!query) return true;
      return option.toLowerCase().includes(query);
    });
  }, [selectedLanguages, languageQuery]);

  const subjectInputSuggestion = useMemo(
    () => getSubjectSuggestion(subjectQuery, selectedSubjects),
    [subjectQuery, selectedSubjects],
  );

  const addSubject = (subject: string) => {
    const normalizedSubject = standardizeSubject(subject);
    if (!normalizedSubject) return;
    setData((prev) => {
      const current = prev.subjects ?? [];
      if (current.some((s) => s.toLowerCase() === normalizedSubject.toLowerCase())) {
        return prev;
      }
      return { ...prev, subjects: [...current, normalizedSubject] };
    });
    setSubjectQuery('');
  };

  const removeSubject = (subject: string) => {
    setData((prev) => ({
      ...prev,
      subjects: (prev.subjects ?? []).filter((s) => s !== subject),
    }));
  };

  const addClassTeach = (classValue: string) => {
    const normalizedClass = standardizeGrade(classValue);
    if (!normalizedClass) return;
    setData((prev) => {
      const current = prev.classesTeach ?? [];
      if (current.some((c) => c.toLowerCase() === normalizedClass.toLowerCase())) {
        return prev;
      }
      return { ...prev, classesTeach: [...current, normalizedClass] };
    });
    setClassInput('');
  };

  const addLanguage = (language: string) => {
    setData((prev) => {
      const current = prev.languages ?? [];
      if (current.some((l) => l.toLowerCase() === language.toLowerCase())) {
        return prev;
      }
      return { ...prev, languages: [...current, language] };
    });
    setLanguageQuery('');
    setShowLanguageOptions(true);
  };

  const removeLanguage = (language: string) => {
    setData((prev) => ({
      ...prev,
      languages: (prev.languages ?? []).filter((l) => l !== language),
    }));
  };

  const toggleBoard = (board: string) => {
    setData((prev) => {
      const current = prev.boards ?? [];
      const exists = current.some((b) => b.toLowerCase() === board.toLowerCase());
      return {
        ...prev,
        boards: exists
          ? current.filter((b) => b.toLowerCase() !== board.toLowerCase())
          : [...current, board],
      };
    });
  };

  const addClassSubjectMapping = () => {
    setData((prev) => ({
      ...prev,
      classSubjectMappings: [...(prev.classSubjectMappings ?? []), { classRange: '', subjects: [] }],
    }));
  };

  const removeClassSubjectMapping = (index: number) => {
    setData((prev) => ({
      ...prev,
      classSubjectMappings: (prev.classSubjectMappings ?? []).filter((_, idx) => idx !== index),
    }));
    setMappingSubjectDrafts((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const updateClassSubjectMappingRange = (index: number, classRange: string) => {
    setData((prev) => {
      const oldMapping = (prev.classSubjectMappings ?? [])[index];
      const oldRange = standardizeGrade(oldMapping?.classRange ?? '');
      const newRange = standardizeGrade(classRange);

      const withoutOld = (prev.classesTeach ?? []).filter(
        (c) => !oldRange || c.toLowerCase() !== oldRange.toLowerCase(),
      );
      const finalClassesTeach = newRange
        ? mergeUniqueCaseInsensitive(withoutOld, [newRange])
        : withoutOld;

      return {
        ...prev,
        classSubjectMappings: (prev.classSubjectMappings ?? []).map((row, idx) =>
          idx === index ? { ...row, classRange } : row,
        ),
        classesTeach: finalClassesTeach,
      };
    });
  };

  const addSubjectToClassMapping = (index: number, subject: string) => {
    const normalizedSubject = standardizeSubject(subject);
    if (!normalizedSubject) return;
    setData((prev) => ({
      ...prev,
      classSubjectMappings: (prev.classSubjectMappings ?? []).map((row, idx) => {
        if (idx !== index) return row;
        const exists = (row.subjects ?? []).some((s) => s.toLowerCase() === normalizedSubject.toLowerCase());
        if (exists) return row;
        return { ...row, subjects: [...(row.subjects ?? []), normalizedSubject] };
      }),
      classesTeach: (() => {
        const mapping = (prev.classSubjectMappings ?? [])[index];
        const normalizedClass = standardizeGrade(mapping?.classRange ?? '');
        return normalizedClass
          ? mergeUniqueCaseInsensitive(prev.classesTeach ?? [], [normalizedClass])
          : (prev.classesTeach ?? []);
      })(),
      subjects: mergeUniqueCaseInsensitive(prev.subjects ?? [], [normalizedSubject]),
    }));
    setMappingSubjectDrafts((prev) => ({ ...prev, [index]: '' }));
  };

  const removeSubjectFromClassMapping = (index: number, subject: string) => {
    setData((prev) => ({
      ...prev,
      classSubjectMappings: (prev.classSubjectMappings ?? []).map((row, idx) => {
        if (idx !== index) return row;
        return {
          ...row,
          subjects: (row.subjects ?? []).filter((s) => s !== subject),
        };
      }),
    }));
  };

  const handleAvatarUpload = async (file: File) => {
    try {
      setUploadingAvatar(true);
      const isReposition = !!data.kycSelfieApproved;
      const uploaded = await uploadMyAvatar(file, isReposition);

      const freshMe = await fetchMe();
      const resolved = (freshMe as any)?.user ?? freshMe ?? null;

      // Determine the best avatar URL: prefer the direct upload response,
      // then the refreshed /users/me response
      const latestAvatarUrl = uploaded?.avatarUrl || resolved?.avatarUrl || null;

      if (resolved) {
        // Ensure the auth context user gets the latest avatar URL
        // (the upload response is the most reliable source)
        if (latestAvatarUrl) {
          resolved.avatarUrl = latestAvatarUrl;
        }
        setUser(resolved as any);
      }

      if (latestAvatarUrl) {
        setData((prev) => ({
          ...prev,
          avatarUrl: latestAvatarUrl,
        }));
      }

      setToast('Profile image updated successfully! ✓');
    } catch (error: any) {
      setToast(error?.response?.data?.message || error?.message || 'Failed to upload profile image');
    } finally {
      setUploadingAvatar(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleSave = async () => {
    // Validate required fields
    if (!data.summary?.trim()) {
      setToast('Summary is required');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (data.yearsExperience === undefined || data.yearsExperience < 0) {
      setToast('Years of experience is required');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (!data.degrees || data.degrees.length === 0) {
      setToast('At least one degree/education is required');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (!data.classesTeach || data.classesTeach.length === 0) {
      setToast('At least one class/grade is required');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (!data.subjects || data.subjects.length === 0) {
      setToast('At least one subject is required');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (!data.languages || data.languages.length === 0) {
      setToast('At least one language is required');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (data.hourlyRate !== undefined) {
      const hourlyRate = Number(data.hourlyRate);
      if (!Number.isFinite(hourlyRate)) {
        setToast('Hourly rate must be a valid number');
        setTimeout(() => setToast(null), 3000);
        return;
      }
      if (hourlyRate < 0) {
        setToast('Hourly rate cannot be negative');
        setTimeout(() => setToast(null), 3000);
        return;
      }
    }

    try {
      setSaving(true);
      const normalizedSubjects = Array.from(
        new Set(selectedSubjects.map((s) => standardizeSubject(s)).filter(Boolean))
      );
      const normalizedLanguages = Array.from(
        new Set(selectedLanguages.map((l) => l.trim()).filter(Boolean))
      );
      const normalizedClasses = Array.from(
        new Set((data.classesTeach ?? []).map((c) => standardizeGrade(c)).filter(Boolean))
      );
      const normalizedMappings = (data.classSubjectMappings ?? [])
        .map((row) => ({
          classRange: standardizeGrade(row.classRange ?? ''),
          subjects: Array.from(new Set((row.subjects ?? []).map((subject) => standardizeSubject(subject)).filter(Boolean))),
        }))
        .filter((row) => row.classRange && row.subjects.length > 0);

      const inferredMappings =
        normalizedMappings.length === 0 && normalizedClasses.length > 0 && normalizedSubjects.length > 0
          ? Array.from({ length: Math.min(normalizedClasses.length, normalizedSubjects.length) }, (_, index) => ({
              classRange: normalizedClasses[index],
              subjects: [normalizedSubjects[index]],
            }))
          : [];

      const effectiveMappings = normalizedMappings.length > 0 ? normalizedMappings : inferredMappings;

      const payload: any = {
        name: data.name?.trim(),
        bio: data.bio?.trim(),
        summary: data.summary?.trim(),
        subjects: normalizedSubjects,
        boards: Array.from(new Set((data.boards ?? []).map((board) => board.trim()).filter(Boolean))),
        languages: normalizedLanguages,
        yearsExperience: data.yearsExperience,
        degrees: data.degrees,
        qualifications: data.qualifications?.trim(),
        classesTeach: normalizedClasses,
        classSubjectMappings: effectiveMappings,
      };
      if (Number.isFinite(data.hourlyRate as any)) {
        payload.hourlyRate = Math.round(Number(data.hourlyRate));
      }
      if (data.country) payload.country = data.country;

      await updateMyProfile(payload);
      setToast('Profile saved successfully! ✓');
    } catch (e: any) {
      console.error(e);
      setToast(e?.response?.data?.message || 'Failed to save profile');
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const initials = (data.name || data.email || 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const avatar =
    authUser?.avatarUrl ||
    data.avatarUrl ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(initials)}`;

  const hourlyInInr = Number.isFinite(data.hourlyRate as any)
    ? Number(data.hourlyRate)
    : undefined;
  const rate = (code: string) => rates[code] ?? 1;
  const toDisplay = (amountInInr: number, target: string) =>
    Math.round((amountInInr * (rate(target) / Math.max(rate('INR'), 1e-9))) * 100) / 100;
  const preview = hourlyInInr !== undefined ? toDisplay(hourlyInInr, displayCurrency) : undefined;

  const avatarButtonLabel = (() => {
    if (uploadingAvatar) return data.kycSelfieApproved ? 'Saving...' : 'Uploading...';
    return data.kycSelfieApproved ? 'Adjust Position' : 'Change Photo';
  })();

  return (
    <div className="px-4 sm:px-6 lg:px-8" data-testid="tutor-profile-page">
      {/* Header Card */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md">
        <div className="p-6 sm:p-8 flex items-center gap-4 sm:gap-6">
          <img
            src={avatar}
            alt="avatar"
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-white/20 object-cover"
          />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold truncate">{data.name || 'Your Name'}</h1>
            <p className="text-white/90 text-sm truncate">{data.email || '--'}</p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAvatarModalOpen(true)}
                disabled={uploadingAvatar}
                className="rounded-md bg-white/20 px-3 py-1.5 text-sm font-medium hover:bg-white/30 disabled:opacity-60"
                data-testid="tutor-profile-change-photo-button"
              >
                {avatarButtonLabel}
              </button>
              {data.kycSelfieApproved && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-xs text-white/80" title="Profile photo is set from your verified KYC selfie">
                  🔒 KYC Verified
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Form Card */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Basics */}
        <section className="lg:col-span-2 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-800">Basic Information</h2>
            <p className="text-sm text-slate-500">Your public tutor profile details.</p>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Full name</label>
              <input
                value={data.name}
                onChange={(e) => setData((d) => ({ ...d, name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g., Priya Sharma"
                data-testid="tutor-profile-name-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Short bio</label>
              <textarea
                value={data.bio}
                onChange={(e) => setData((d) => ({ ...d, bio: e.target.value }))}
                className="mt-1 w-full min-h-28 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Tell students about your expertise, experience and teaching style."
                data-testid="tutor-profile-bio-input"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Summary <span className="text-red-500">*</span>
              </label>
              <textarea
                value={data.summary || ''}
                onChange={(e) => setData((d) => ({ ...d, summary: e.target.value }))}
                className="mt-1 w-full min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="A detailed summary of your teaching philosophy and approach (required)."
                required
                data-testid="tutor-profile-summary-input"
              />
              <p className="mt-1 text-xs text-slate-500">
                This summary will be prominently displayed on your public profile.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Years of Experience <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={data.yearsExperience ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const n = val === '' ? undefined : Number(val);
                    setData((d) => ({ ...d, yearsExperience: n }));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., 5"
                  required
                  data-testid="tutor-profile-years-experience-input"
                />
                <p className="mt-1 text-xs text-slate-500">Total years of teaching experience (required).</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Qualifications
                </label>
                <input
                  type="text"
                  value={data.qualifications || ''}
                  onChange={(e) => setData((d) => ({ ...d, qualifications: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., M.Ed, B.Sc Mathematics"
                  data-testid="tutor-profile-qualifications-input"
                />
                <p className="mt-1 text-xs text-slate-500">Your educational qualifications.</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Degrees/Education <span className="text-red-500">*</span>
              </label>
              <div className="mt-1">
                <div className="flex flex-wrap gap-2 mb-2">
                  {(data.degrees && data.degrees.length > 0) ? (
                    data.degrees.map((degree, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700"
                      >
                        {degree}
                        <button
                          type="button"
                          onClick={() => {
                            setData((d) => ({
                              ...d,
                              degrees: d.degrees?.filter((_, i) => i !== idx),
                            }));
                          }}
                          className="ml-1 text-purple-400 hover:text-purple-600"
                          aria-label={`Remove ${degree}`}
                        >
                          x
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">No degrees added yet (required).</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={degreeInput}
                    onChange={(e) => setDegreeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && degreeInput.trim()) {
                        e.preventDefault();
                        setData((d) => ({
                          ...d,
                          degrees: [...(d.degrees || []), degreeInput.trim()],
                        }));
                        setDegreeInput('');
                      }
                    }}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., B.Sc in Mathematics, M.Ed"
                    data-testid="tutor-profile-degree-input"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (degreeInput.trim()) {
                        setData((d) => ({
                          ...d,
                          degrees: [...(d.degrees || []), degreeInput.trim()],
                        }));
                        setDegreeInput('');
                      }
                    }}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
                    data-testid="tutor-profile-add-degree-button"
                  >
                    Add
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Add your degrees one by one. Press Enter or click Add (required).
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Boards</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {BOARD_OPTIONS.map((board) => {
                  const selected = (data.boards ?? []).some((b) => b.toLowerCase() === board.toLowerCase());
                  return (
                    <button
                      key={board}
                      type="button"
                      onClick={() => toggleBoard(board)}
                      className={`rounded-full px-3 py-1 text-xs font-medium border transition ${
                        selected
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {board}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-slate-500">Select all boards you can teach.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Classes/Grades I Teach <span className="text-red-500">*</span>
              </label>
              <div className="mt-1">
                <div className="flex flex-wrap gap-2 mb-2">
                  {(data.classesTeach && data.classesTeach.length > 0) ? (
                    data.classesTeach.map((cls, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700"
                      >
                        {cls}
                        <button
                          type="button"
                          onClick={() => {
                            setData((d) => ({
                              ...d,
                              classesTeach: d.classesTeach?.filter((_, i) => i !== idx),
                            }));
                          }}
                          className="ml-1 text-amber-400 hover:text-amber-600"
                          aria-label={`Remove ${cls}`}
                        >
                          x
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">No classes/grades added yet (required).</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={classInput}
                    onChange={(e) => setClassInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && classInput.trim()) {
                        e.preventDefault();
                        addClassTeach(classInput);
                      }
                    }}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., Grade 1-5, Grade 6-8, High School, College"
                    data-testid="tutor-profile-class-input"
                  />
                  <button
                    type="button"
                    onClick={() => addClassTeach(classInput)}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
                    data-testid="tutor-profile-add-class-button"
                  >
                    Add
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Specify which grades or classes you can teach. Press Enter or click Add (required).
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label className="block text-sm font-medium text-slate-700">Class to Subject Mapping</label>
                <button
                  type="button"
                  onClick={addClassSubjectMapping}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200"
                >
                  Add Mapping
                </button>
              </div>
              <div className="mt-2 space-y-3">
                {(data.classSubjectMappings ?? []).length > 0 ? (
                  <>
                    {(data.classSubjectMappings ?? []).map((row, idx) => {
                      const chosen = row.subjects ?? [];
                      const mappingSuggestion = getSubjectSuggestion(mappingSubjectDrafts[idx] ?? '', chosen);
                      return (
                        <div key={idx} className="rounded-lg border border-slate-200 p-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-start">
                            <input
                              value={row.classRange ?? ''}
                              onChange={(e) => updateClassSubjectMappingRange(idx, e.target.value)}
                              className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              placeholder="e.g., Grade 9-10"
                            />
                            <div className="flex gap-2">
                              <input
                                value={mappingSubjectDrafts[idx] ?? ''}
                                onChange={(e) => setMappingSubjectDrafts((prev) => ({ ...prev, [idx]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Tab' && mappingSuggestion) {
                                    e.preventDefault();
                                    setMappingSubjectDrafts((prev) => ({ ...prev, [idx]: mappingSuggestion }));
                                    return;
                                  }
                                  if (e.key === 'Enter' && (mappingSubjectDrafts[idx] ?? '').trim()) {
                                    e.preventDefault();
                                    addSubjectToClassMapping(idx, mappingSuggestion || (mappingSubjectDrafts[idx] ?? ''));
                                  }
                                }}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="Add subject"
                              />
                              <button
                                type="button"
                                onClick={() => addSubjectToClassMapping(idx, mappingSubjectDrafts[idx] ?? '')}
                                className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                          {mappingSuggestion && (
                            <p className="text-[11px] text-slate-500 mt-1">
                              Press Tab to autocomplete: {mappingSuggestion}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-2">
                            {chosen.length > 0 ? (
                              chosen.map((subject) => (
                                <span
                                  key={`${idx}-${subject}`}
                                  className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
                                >
                                  {subject}
                                  <button
                                    type="button"
                                    onClick={() => removeSubjectFromClassMapping(idx, subject)}
                                    className="ml-1 text-indigo-400 hover:text-indigo-600"
                                    aria-label={`Remove ${subject}`}
                                  >
                                    x
                                  </button>
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-500">No subjects mapped yet.</span>
                            )}
                          </div>
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => removeClassSubjectMapping(idx)}
                              className="text-xs font-medium text-rose-600 hover:text-rose-700"
                            >
                              Remove mapping
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={addClassSubjectMapping}
                        className="text-xs font-semibold text-indigo-700 hover:text-indigo-800"
                      >
                        + Add another mapping
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">No class-to-subject mapping added. Add mappings to improve student matching.</p>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Example: Grade 9-10 → Mathematics, Physics.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Subjects</label>
                <div className="mt-1">
                  <div className="flex flex-wrap gap-2">
                    {selectedSubjects.length > 0 ? (
                      selectedSubjects.map((subject) => (
                        <span
                          key={subject}
                          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
                        >
                          {subject}
                          <button
                            type="button"
                            onClick={() => removeSubject(subject)}
                            className="ml-1 text-indigo-400 hover:text-indigo-600"
                            aria-label={`Remove ${subject}`}
                          >
                            x
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">No subjects selected yet.</span>
                    )}
                  </div>
                  <div className="relative mt-2">
                    <input
                      value={subjectQuery}
                      onChange={(e) => setSubjectQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Tab' && subjectInputSuggestion) {
                          e.preventDefault();
                          setSubjectQuery(subjectInputSuggestion);
                          return;
                        }
                        if (e.key === 'Enter' && subjectQuery.trim()) {
                          e.preventDefault();
                          addSubject(subjectInputSuggestion || subjectQuery);
                        }
                        if (e.key === 'Backspace' && !subjectQuery && selectedSubjects.length > 0) {
                          e.preventDefault();
                          removeSubject(selectedSubjects[selectedSubjects.length - 1]);
                        }
                      }}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Type subject and press Enter"
                      data-testid="tutor-profile-subject-input"
                    />
                    {subjectInputSuggestion && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Press Tab to autocomplete: {subjectInputSuggestion}
                      </p>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Enter your own subject names. We normalize case and spelling while saving.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Languages</label>
                <div className="mt-1">
                  <div className="flex flex-wrap gap-2">
                    {selectedLanguages.length > 0 ? (
                      selectedLanguages.map((language) => (
                        <span
                          key={language}
                          className="inline-flex items-center gap-1 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700"
                        >
                          {language}
                          <button
                            type="button"
                            onClick={() => removeLanguage(language)}
                            className="ml-1 text-green-400 hover:text-green-600"
                            aria-label={`Remove ${language}`}
                          >
                            x
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">No languages selected yet.</span>
                    )}
                  </div>
                  <div className="relative mt-2">
                    <input
                      value={languageQuery}
                      onChange={(e) => {
                        setLanguageQuery(e.target.value);
                        setShowLanguageOptions(true);
                      }}
                      onFocus={() => setShowLanguageOptions(true)}
                      onBlur={() => setTimeout(() => setShowLanguageOptions(false), 120)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && filteredLanguageOptions.length > 0) {
                          e.preventDefault();
                          addLanguage(filteredLanguageOptions[0]);
                        }
                        if (e.key === 'Backspace' && !languageQuery && selectedLanguages.length > 0) {
                          e.preventDefault();
                          removeLanguage(selectedLanguages[selectedLanguages.length - 1]);
                        }
                      }}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Start typing to search languages"
                      data-testid="tutor-profile-language-input"
                    />
                    {showLanguageOptions && (
                      <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                        {filteredLanguageOptions.length > 0 ? (
                          filteredLanguageOptions.map((option) => (
                            <button
                              type="button"
                              key={option}
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-green-50"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => addLanguage(option)}
                            >
                              {option}
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-slate-500">No matches</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Select languages you can teach in. Students can filter tutors by language.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Hourly rate (INR)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={hourlyInInr ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const n = val === '' ? undefined : Number(val);
                    setData((d) => ({ ...d, hourlyRate: n }));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., 1000"
                  data-testid="tutor-profile-hourly-rate-input"
                />
                <p className="mt-1 text-xs text-slate-500">Stored and charged in INR. Display-only currency can be adjusted below.</p>
                {preview !== undefined && displayCurrency !== 'INR' && (
                  <p className="mt-1 text-xs text-slate-500">Preview in {displayCurrency}: {formatCurrency(preview, displayCurrency)}</p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              data-testid="tutor-profile-save-button"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </section>

        {/* Right: Extras */}
        <aside className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-sm font-semibold text-slate-800">Additional</h3>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Country</label>
              <select
                value={data.country ?? ''}
                onChange={(e) => setData((d) => ({ ...d, country: e.target.value || undefined }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                data-testid="tutor-profile-country-select"
              >
                <option value="">Select country</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">Used for discovery and time zone hints.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Display currency (UI only)</label>
              <select
                value={displayCurrency}
                onChange={(e) => {
                  const cur = e.target.value;
                  setDisplayCurrency(cur);
                  try {
                    localStorage.setItem('preferred_currency', cur);
                  } catch {}
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                data-testid="tutor-profile-currency-select"
              >
                {['INR','USD','AED','EUR','GBP','AUD','CAD','SGD','JPY'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">Controls how amounts are previewed to you. Does not change billing.</p>
            </div>
            <div className="text-xs text-slate-500">
              More profile sections (education, certifications, languages, links) can be added here later.
            </div>
          </div>
        </aside>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <AvatarUploadModal
        open={avatarModalOpen}
        uploading={uploadingAvatar}
        onClose={() => setAvatarModalOpen(false)}
        onUpload={handleAvatarUpload}
        repositionMode={!!data.kycSelfieApproved}
        currentAvatarUrl={avatar}
      />
    </div>
  );
}

