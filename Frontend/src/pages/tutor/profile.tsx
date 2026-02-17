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
import AvatarUploadModal from '../../components/AvatarUploadModal';

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
    classesTeach: []
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });
  const [displayCurrency, setDisplayCurrency] = useState<string>(() =>
    localStorage.getItem('preferred_currency') || 'INR'
  );
  const [subjectQuery, setSubjectQuery] = useState('');
  const [languageQuery, setLanguageQuery] = useState('');
  const [showSubjectOptions, setShowSubjectOptions] = useState(false);
  const [showLanguageOptions, setShowLanguageOptions] = useState(false);
  const [degreeInput, setDegreeInput] = useState('');
  const [classInput, setClassInput] = useState('');
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

  const filteredSubjectOptions = useMemo(() => {
    const query = subjectQuery.trim().toLowerCase();
    const taken = new Set(selectedSubjects.map((s) => s.toLowerCase()));
    return SUBJECT_OPTIONS.filter((option) => {
      if (taken.has(option.toLowerCase())) return false;
      if (!query) return true;
      return option.toLowerCase().includes(query);
    });
  }, [selectedSubjects, subjectQuery]);

  const filteredLanguageOptions = useMemo(() => {
    const query = languageQuery.trim().toLowerCase();
    const taken = new Set(selectedLanguages.map((l) => l.toLowerCase()));
    return LANGUAGE_OPTIONS.filter((option) => {
      if (taken.has(option.toLowerCase())) return false;
      if (!query) return true;
      return option.toLowerCase().includes(query);
    });
  }, [selectedLanguages, languageQuery]);

  const visibleSubjectOptions = filteredSubjectOptions;
  const addSubject = (subject: string) => {
    setData((prev) => {
      const current = prev.subjects ?? [];
      if (current.some((s) => s.toLowerCase() === subject.toLowerCase())) {
        return prev;
      }
      return { ...prev, subjects: [...current, subject] };
    });
    setSubjectQuery('');
    setShowSubjectOptions(false);
  };

  const removeSubject = (subject: string) => {
    setData((prev) => ({
      ...prev,
      subjects: (prev.subjects ?? []).filter((s) => s !== subject),
    }));
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
    setShowLanguageOptions(false);
  };

  const removeLanguage = (language: string) => {
    setData((prev) => ({
      ...prev,
      languages: (prev.languages ?? []).filter((l) => l !== language),
    }));
  };

  const handleAvatarUpload = async (file: File) => {
    try {
      setUploadingAvatar(true);
      await uploadMyAvatar(file);
      await loadProfile();

      const freshMe = await fetchMe();
      const resolved = (freshMe as any)?.user ?? freshMe ?? null;
      if (resolved) {
        setUser(resolved as any);
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
        new Set(selectedSubjects.map((s) => s.trim()).filter(Boolean))
      );
      const normalizedLanguages = Array.from(
        new Set(selectedLanguages.map((l) => l.trim()).filter(Boolean))
      );
      const payload: any = {
        name: data.name?.trim(),
        bio: data.bio?.trim(),
        summary: data.summary?.trim(),
        subjects: normalizedSubjects,
        languages: normalizedLanguages,
        yearsExperience: data.yearsExperience,
        degrees: data.degrees,
        qualifications: data.qualifications?.trim(),
        classesTeach: data.classesTeach,
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

  return (
    <div className="px-4 sm:px-6 lg:px-8">
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
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setAvatarModalOpen(true)}
                disabled={uploadingAvatar}
                className="rounded-md bg-white/20 px-3 py-1.5 text-sm font-medium hover:bg-white/30 disabled:opacity-60"
              >
                {uploadingAvatar ? 'Uploading...' : 'Change Photo'}
              </button>
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
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Short bio</label>
              <textarea
                value={data.bio}
                onChange={(e) => setData((d) => ({ ...d, bio: e.target.value }))}
                className="mt-1 w-full min-h-28 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Tell students about your expertise, experience and teaching style."
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
                        setData((d) => ({
                          ...d,
                          classesTeach: [...(d.classesTeach || []), classInput.trim()],
                        }));
                        setClassInput('');
                      }
                    }}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., Grade 1-5, Grade 6-8, High School, College"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (classInput.trim()) {
                        setData((d) => ({
                          ...d,
                          classesTeach: [...(d.classesTeach || []), classInput.trim()],
                        }));
                        setClassInput('');
                      }
                    }}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
                  >
                    Add
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Specify which grades or classes you can teach. Press Enter or click Add (required).
                </p>
              </div>
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
                      onChange={(e) => {
                        setSubjectQuery(e.target.value);
                        setShowSubjectOptions(true);
                      }}
                      onFocus={() => setShowSubjectOptions(true)}
                      onBlur={() => setTimeout(() => setShowSubjectOptions(false), 120)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && visibleSubjectOptions.length > 0) {
                          e.preventDefault();
                          addSubject(visibleSubjectOptions[0]);
                        }
                        if (e.key === 'Backspace' && !subjectQuery && selectedSubjects.length > 0) {
                          e.preventDefault();
                          removeSubject(selectedSubjects[selectedSubjects.length - 1]);
                        }
                      }}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Start typing to search subjects"
                    />
                    {showSubjectOptions && (
                      <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                        {visibleSubjectOptions.length > 0 ? (
                          visibleSubjectOptions.map((option) => (
                            <button
                              type="button"
                              key={option}
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-indigo-50"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => addSubject(option)}
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
                  Pick from the supported subjects list. Students use the same options when filtering tutors.
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
      />
    </div>
  );
}

