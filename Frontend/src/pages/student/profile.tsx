import { useEffect, useState, useRef } from 'react';
import { User, Mail, Phone, MapPin, Calendar, Edit2, Save, X, Upload, FileText, AlertCircle, CheckCircle, Clock, ShieldCheck, ShieldX, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/apiClient';
import { updateMyStudentProfile, type StudentProfileUpdatePayload } from '../../services/studentService';
import { uploadMyAvatar } from '../../services/avatarUploadService';
import { me as fetchMe } from '../../services/authService';
import { useToast } from '../../contexts/ToastContext';
import AvatarUploadModal from '../../components/AvatarUploadModal';
import { decryptObject } from '../../utils/decryption';
import { BOARD_OPTIONS } from '../../constants/boards';

type StudentProfile = {
  id: string;
  userId: string;
  bio?: string | null;
  timezone?: string | null;
  preferredLanguage?: string | null;
  grade?: string | null;
  board?: string | null;
  marksheetUrl?: string | null;
  profileStatus?: string | null;
  adminProfileNotes?: string | null;
  resubmissionFields?: string[];
  user: {
    id: string;
    name: string | null;
    email: string;
    phone?: string | null;
    avatarUrl?: string | null;
    createdAt?: string;
  };
  student?: { createdAt?: string; grade?: string | null; board?: string | null; marksheetUrl?: string | null };
};

function getFieldDisplayName(field: string): string {
  const names: Record<string, string> = {
    preferredLanguage: 'Language',
    marksheet: 'Marksheet',
    avatar: 'Profile Photo',
  };
  return names[field] ?? field.charAt(0).toUpperCase() + field.slice(1);
}

function StatusBanners({ profileCompletion, resubFields }: Readonly<{
  profileCompletion: { completionPercentage: number; missingFields: string[]; profileStatus?: string; adminProfileNotes?: string | null } | null;
  resubFields: string[];
}>) {
  if (!profileCompletion) return null;

  if (profileCompletion.completionPercentage < 100) {
    return (
      <div className="mb-6 bg-amber-50 border border-amber-300 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold text-amber-800">
              Complete Your Profile ({profileCompletion.completionPercentage}%)
            </h3>
            <p className="text-sm text-amber-700 mt-1">
              Complete your profile to start booking sessions with tutors.
            </p>
            {profileCompletion.missingFields.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {profileCompletion.missingFields.map((field) => (
                  <span key={field} className="inline-flex items-center px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded-full">
                    {field}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 w-full bg-amber-200 rounded-full h-2">
              <div className="bg-amber-600 h-2 rounded-full transition-all" style={{ width: `${profileCompletion.completionPercentage}%` }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  switch (profileCompletion.profileStatus) {
    case 'APPROVED':
      return (
        <div className="mb-6 bg-green-50 border border-green-300 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-green-600 flex-shrink-0" />
            <p className="font-semibold text-green-800">Profile approved! You can now book sessions and make purchases.</p>
          </div>
        </div>
      );
    case 'PENDING':
      return (
        <div className="mb-6 bg-blue-50 border border-blue-300 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-blue-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-blue-800">Profile submitted — pending admin review</p>
              <p className="text-sm text-blue-700 mt-1">Your profile is complete and under review. You&apos;ll be able to book sessions once approved.</p>
            </div>
          </div>
        </div>
      );
    case 'REJECTED':
      return (
        <div className="mb-6 bg-red-50 border border-red-300 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <ShieldX className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-red-800">Profile was rejected by admin</p>
              {profileCompletion.adminProfileNotes && (
                <p className="text-sm text-red-700 mt-1">Reason: {profileCompletion.adminProfileNotes}</p>
              )}
              <p className="text-sm text-red-700 mt-1">Please update your profile and re-submit.</p>
            </div>
          </div>
        </div>
      );
    case 'RESUBMISSION_REQUESTED':
      return (
        <div className="mb-6 bg-amber-50 border border-amber-300 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-amber-800">Admin has requested profile changes</p>
              {profileCompletion.adminProfileNotes && (
                <p className="text-sm text-amber-700 mt-1">Note: {profileCompletion.adminProfileNotes}</p>
              )}
              {resubFields.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-amber-700">Fields to update:</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {resubFields.map((f) => (
                      <span key={f} className="inline-flex items-center px-2 py-0.5 bg-amber-200 text-amber-800 text-xs rounded-full font-medium">
                        {getFieldDisplayName(f)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-sm text-amber-700 mt-1">Please update the requested fields and save your profile.</p>
            </div>
          </div>
        </div>
      );
    default:
      return null;
  }
}

interface HeaderActionsProps {
  profileStatus?: string;
  editing: boolean;
  saving: boolean;
  requestingResubmission: boolean;
  onCancel: () => void;
  onSave: () => void;
  onEdit: () => void;
  onRequestResubmission: () => void;
}

function HeaderActions({ profileStatus, editing, saving, requestingResubmission, onCancel, onSave, onEdit, onRequestResubmission }: Readonly<HeaderActionsProps>) {
  if (profileStatus === 'RESUBMISSION_REQUESTED') {
    if (editing) {
      return (
        <div className="flex flex-wrap gap-2">
          <button onClick={onCancel} data-testid="student-profile-cancel-btn" className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors" disabled={saving}>
            <X className="h-4 w-4" />Cancel
          </button>
          <button onClick={onSave} data-testid="student-profile-save-btn" className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-400" disabled={saving}>
            <Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      );
    }
    return (
      <button onClick={onEdit} data-testid="student-profile-edit-btn" className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
        <Edit2 className="h-4 w-4" />Edit Profile
      </button>
    );
  }
  if (profileStatus === 'APPROVED') {
    return (
      <button onClick={onRequestResubmission} disabled={requestingResubmission} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:bg-amber-400">
        <Lock className="h-4 w-4" />{requestingResubmission ? 'Requesting...' : 'Request Edit Permission'}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-500 rounded-lg text-sm">
      <Lock className="h-4 w-4" />Profile locked
    </div>
  );
}

interface MarksheetPreviewProps { marksheetUrl?: string | null; studentMarksheetUrl?: string | null; marksheetViewUrl: string | null; }

function MarksheetPreview({ marksheetUrl, studentMarksheetUrl, marksheetViewUrl }: Readonly<MarksheetPreviewProps>) {
  const url = marksheetUrl || studentMarksheetUrl;
  const isImage = url && /\.(jpg|jpeg|png|webp)$/i.exec(url);
  if (isImage) {
    return marksheetViewUrl
      ? <img src={marksheetViewUrl} alt="Marksheet" className="mt-2 max-h-48 rounded border border-green-300" />
      : <span className="text-xs text-slate-400 mt-1 inline-block">Loading preview...</span>;
  }
  return marksheetViewUrl
    ? <a href={marksheetViewUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline mt-1 inline-block">View uploaded marksheet</a>
    : <span className="text-xs text-slate-400 mt-1 inline-block">Loading link...</span>;
}

interface EmptyMarksheetAreaProps {
  profileStatus?: string;
  canEditMarksheet: boolean;
  uploadingMarksheet: boolean;
  marksheetInputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function EmptyMarksheetArea({ profileStatus, canEditMarksheet, uploadingMarksheet, marksheetInputRef, onUpload }: Readonly<EmptyMarksheetAreaProps>) {
  if (profileStatus === 'RESUBMISSION_REQUESTED' && canEditMarksheet) {
    return (
      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
        <Upload className="h-8 w-8 text-slate-400 mb-2" />
        <span className="text-sm text-slate-600">
          {uploadingMarksheet ? 'Uploading...' : 'Click to upload marksheet'}
        </span>
        <input ref={marksheetInputRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={onUpload} disabled={uploadingMarksheet} />
      </label>
    );
  }
  return (
    <div className="flex items-center gap-2 text-slate-500 text-sm p-4 bg-slate-50 rounded-lg">
      <Lock className="h-4 w-4" />
      <span>Profile is under review — editing is locked until admin approves or requests changes.</span>
    </div>
  );
}

function validateMarksheetFile(file: File): string | null {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowedTypes.includes(file.type)) return 'Only JPG, PNG, WEBP, and PDF files are allowed for marksheet.';
  if (file.size > 10 * 1024 * 1024) return 'Marksheet file must be 10MB or smaller.';
  return null;
}

async function uploadMarksheetFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('useCase', 'marksheets');
  const uploadRes = await api.post('/uploads/direct', fd);
  const uploadedKey = uploadRes.data?.key || uploadRes.data?.url;
  if (!uploadedKey) throw new Error('Upload did not return a file key');
  await api.patch('/students/me', { marksheetUrl: uploadedKey });
  return uploadedKey;
}

async function resolveMarksheetViewUrl(key: string): Promise<string | null> {
  if (key.startsWith('http://') || key.startsWith('https://')) return key;
  try {
    const { data } = await api.post('/uploads/presign-get', { key });
    return data.downloadUrl || null;
  } catch {
    return null;
  }
}

type ProfileCompletion = { completionPercentage: number; missingFields: string[]; profileStatus?: string; adminProfileNotes?: string | null; resubmissionFields?: string[] };

const LANG_LABELS: Record<string, string> = { en: 'English', hi: 'Hindi', es: 'Spanish', fr: 'French', de: 'German' };

interface ProfileFieldsProps {
  editing: boolean;
  formData: StudentProfileUpdatePayload;
  profile: StudentProfile;
  canEditField: (field: string) => boolean;
  onChange: (patch: Partial<StudentProfileUpdatePayload>) => void;
}

interface ProfileSelectFieldsProps {
  editing: boolean;
  formData: StudentProfileUpdatePayload;
  canEditField: (field: string) => boolean;
  onChange: (patch: Partial<StudentProfileUpdatePayload>) => void;
}

function ProfileSelectFields({ editing, formData, canEditField, onChange }: Readonly<ProfileSelectFieldsProps>) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2"><MapPin className="inline h-4 w-4 mr-2" />Timezone{editing && canEditField('timezone') && <span className="ml-2 text-xs text-amber-600 font-normal">(update requested)</span>}</label>
        {editing && canEditField('timezone') ? <select value={formData.timezone} onChange={(e) => onChange({ timezone: e.target.value })} data-testid="student-profile-timezone-select" className="w-full px-4 py-2 border border-amber-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-amber-50"><option value="">Select timezone</option><option value="Asia/Kolkata">Asia/Kolkata (IST)</option><option value="America/New_York">America/New York (EST)</option><option value="America/Los_Angeles">America/Los Angeles (PST)</option><option value="Europe/London">Europe/London (GMT)</option><option value="Asia/Dubai">Asia/Dubai (GST)</option><option value="Asia/Singapore">Asia/Singapore (SGT)</option></select> : <p className="text-slate-800 px-4 py-2 bg-slate-50 rounded-lg">{formData.timezone || 'Not set'}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2"><Calendar className="inline h-4 w-4 mr-2" />Preferred Language{editing && canEditField('preferredLanguage') && <span className="ml-2 text-xs text-amber-600 font-normal">(update requested)</span>}</label>
        {editing && canEditField('preferredLanguage') ? <select value={formData.preferredLanguage} onChange={(e) => onChange({ preferredLanguage: e.target.value })} data-testid="student-profile-language-select" className="w-full px-4 py-2 border border-amber-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-amber-50"><option value="">Select language</option><option value="en">English</option><option value="hi">Hindi</option><option value="es">Spanish</option><option value="fr">French</option><option value="de">German</option></select> : <p className="text-slate-800 px-4 py-2 bg-slate-50 rounded-lg">{formData.preferredLanguage ? LANG_LABELS[formData.preferredLanguage] ?? formData.preferredLanguage : 'Not set'}</p>}
      </div>
    </>
  );
}

function ProfileFields({ editing, formData, profile, canEditField, onChange }: Readonly<ProfileFieldsProps>) {
  return (
    <div className="p-4 sm:p-8 space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2"><User className="inline h-4 w-4 mr-2" />Full Name{editing && canEditField('name') && <span className="ml-2 text-xs text-amber-600 font-normal">(update requested)</span>}</label>
        {editing && canEditField('name') ? <input type="text" value={formData.name} onChange={(e) => onChange({ name: e.target.value })} data-testid="student-profile-name-input" className="w-full px-4 py-2 border border-amber-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-amber-50" placeholder="Enter your full name" /> : <p className="text-slate-800 px-4 py-2 bg-slate-50 rounded-lg">{formData.name || 'Not set'}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2"><Mail className="inline h-4 w-4 mr-2" />Email Address</label>
        <p className="text-slate-800 px-4 py-2 bg-slate-50 rounded-lg break-all">{profile.user?.email ?? 'No email'}</p>
        <p className="text-xs text-slate-500 mt-1">Email cannot be changed</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2"><Phone className="inline h-4 w-4 mr-2" />Phone Number{editing && canEditField('phone') && <span className="ml-2 text-xs text-amber-600 font-normal">(update requested)</span>}</label>
        {editing && canEditField('phone') ? <input type="tel" value={formData.phone} onChange={(e) => onChange({ phone: e.target.value })} data-testid="student-profile-phone-input" className="w-full px-4 py-2 border border-amber-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-amber-50" placeholder="Enter your phone number" /> : <p className="text-slate-800 px-4 py-2 bg-slate-50 rounded-lg">{formData.phone || 'Not set'}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2"><Calendar className="inline h-4 w-4 mr-2" />Grade/Class{editing && canEditField('grade') && <span className="ml-2 text-xs text-amber-600 font-normal">(update requested)</span>}</label>
        {editing && canEditField('grade') ? <input type="text" value={formData.grade} onChange={(e) => onChange({ grade: e.target.value })} data-testid="student-profile-grade-input" className="w-full px-4 py-2 border border-amber-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-amber-50" placeholder="e.g., Grade 8" /> : <p className="text-slate-800 px-4 py-2 bg-slate-50 rounded-lg">{formData.grade || 'Not set'}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2"><Calendar className="inline h-4 w-4 mr-2" />Board{editing && canEditField('board') && <span className="ml-2 text-xs text-amber-600 font-normal">(update requested)</span>}</label>
        {editing && canEditField('board') ? <select value={formData.board || ''} onChange={(e) => onChange({ board: e.target.value })} data-testid="student-profile-board-select" className="w-full px-4 py-2 border border-amber-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-amber-50"><option value="">Select board</option>{BOARD_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}</select> : <p className="text-slate-800 px-4 py-2 bg-slate-50 rounded-lg">{formData.board || 'Not set'}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2"><Edit2 className="inline h-4 w-4 mr-2" />About Me{editing && canEditField('bio') && <span className="ml-2 text-xs text-amber-600 font-normal">(update requested)</span>}</label>
        {editing && canEditField('bio') ? <textarea value={formData.bio} onChange={(e) => onChange({ bio: e.target.value })} rows={4} data-testid="student-profile-bio-input" className="w-full px-4 py-2 border border-amber-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-amber-50" placeholder="Tell us about yourself, your learning goals, interests..." /> : <p className="text-slate-800 px-4 py-2 bg-slate-50 rounded-lg whitespace-pre-wrap">{formData.bio || 'No bio added yet'}</p>}
      </div>
      <ProfileSelectFields editing={editing} formData={formData} canEditField={canEditField} onChange={onChange} />
    </div>
  );
}

interface AvatarSectionProps {
  avatarInitial: string;
  resolvedAvatarUrl: string | null;
  formData: StudentProfileUpdatePayload;
  authUserEmail: string | null | undefined;
  profileStatus: string | undefined;
  canEditAvatar: boolean;
  uploadingAvatar: boolean;
  onChangePhoto: () => void;
}

function AvatarSection({ avatarInitial, resolvedAvatarUrl, formData, authUserEmail, profileStatus, canEditAvatar, uploadingAvatar, onChangePhoto }: Readonly<AvatarSectionProps>) {
  return (
    <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 sm:px-8 py-6 sm:py-12">
      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
        {resolvedAvatarUrl ? <img src={resolvedAvatarUrl} alt="Profile" className="w-24 h-24 rounded-full object-cover shadow-lg border-2 border-white/70" /> : <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center text-blue-600 font-bold text-3xl shadow-lg">{avatarInitial}</div>}
        <div className="text-white min-w-0 overflow-hidden text-center sm:text-left">
          <h2 className="text-xl sm:text-2xl font-bold mb-1 truncate">{formData.name || 'Student'}</h2>
          <p className="text-blue-100 truncate">{authUserEmail ?? 'No email'}</p>
          {profileStatus === 'RESUBMISSION_REQUESTED' && canEditAvatar && (
            <div className="mt-3">
              <button type="button" onClick={onChangePhoto} disabled={uploadingAvatar} data-testid="student-profile-change-photo-btn" className="rounded-md bg-white/20 px-3 py-1.5 text-sm font-medium hover:bg-white/30 disabled:opacity-60">
                {uploadingAvatar ? 'Uploading...' : 'Change Photo'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface MarksheetSectionProps {
  profile: StudentProfile;
  profileStatus: string | undefined;
  canEditMarksheet: boolean;
  marksheetViewUrl: string | null;
  uploadingMarksheet: boolean;
  marksheetInputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function MarksheetSection({ profile, profileStatus, canEditMarksheet, marksheetViewUrl, uploadingMarksheet, marksheetInputRef, onUpload }: Readonly<MarksheetSectionProps>) {
  return (
    <div className="mt-6 bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="p-4 sm:p-8">
        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2"><FileText className="h-5 w-5 text-blue-600" />Latest Class Marksheet</h3>
        <p className="text-sm text-slate-600 mb-4">Upload your latest class marksheet (report card). This helps tutors understand your academic level. Accepted: JPG, PNG, WEBP, PDF (max 10MB).</p>
        {profile?.marksheetUrl ?? profile?.student?.marksheetUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-4">
              <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-800">Marksheet uploaded</p>
                <MarksheetPreview marksheetUrl={profile?.marksheetUrl} studentMarksheetUrl={profile?.student?.marksheetUrl} marksheetViewUrl={marksheetViewUrl} />
              </div>
            </div>
            <div>
              {profileStatus === 'RESUBMISSION_REQUESTED' && canEditMarksheet && (
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer text-sm">
                  <Upload className="h-4 w-4" />
                  {uploadingMarksheet ? 'Uploading...' : 'Replace Marksheet'}
                  <input ref={marksheetInputRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={onUpload} disabled={uploadingMarksheet} />
                </label>
              )}
            </div>
          </div>
        ) : (
          <EmptyMarksheetArea profileStatus={profileStatus} canEditMarksheet={canEditMarksheet} uploadingMarksheet={uploadingMarksheet} marksheetInputRef={marksheetInputRef} onUpload={onUpload} />
        )}
      </div>
    </div>
  );
}

function AccountStats({ profile }: Readonly<{ profile: StudentProfile }>) {
  const createdAt = profile.user?.createdAt ?? profile.student?.createdAt;
  const memberSince = createdAt ? new Date(createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'N/A';
  return (
    <div className="mt-6 grid sm:grid-cols-2 md:grid-cols-3 gap-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-2"><span className="text-sm text-blue-700">Member Since</span><Calendar className="h-5 w-5 text-blue-600" /></div>
        <p className="text-2xl font-bold text-blue-900">{memberSince}</p>
      </div>
      <div className="bg-green-50 border border-green-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-2"><span className="text-sm text-green-700">Account Status</span><User className="h-5 w-5 text-green-600" /></div>
        <p className="text-2xl font-bold text-green-900">Active</p>
      </div>
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-2"><span className="text-sm text-purple-700">Profile Type</span><Edit2 className="h-5 w-5 text-purple-600" /></div>
        <p className="text-2xl font-bold text-purple-900">Student</p>
      </div>
    </div>
  );
}

function useStudentProfileState() {
  const { user: authUser, setUser } = useAuth();
  const { showSuccess, showError } = useToast();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [uploadingMarksheet, setUploadingMarksheet] = useState(false);
  const [profileCompletion, setProfileCompletion] = useState<ProfileCompletion | null>(null);
  const [requestingResubmission, setRequestingResubmission] = useState(false);
  const [marksheetViewUrl, setMarksheetViewUrl] = useState<string | null>(null);
  const marksheetInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<StudentProfileUpdatePayload>({ name: '', phone: '', bio: '', timezone: '', preferredLanguage: '', grade: '', board: '' });

  async function loadProfileStatus() {
    try {
      const { data } = await api.get('/students/me/profile-status');
      setProfileCompletion(data);
    } catch { /* ignore */ }
  }

  async function loadProfile() {
    try {
      setLoading(true);
      const { data } = await api.get<StudentProfile>('/students/me');
      const decrypted = await decryptObject(data, ['user.phone', 'user.avatarUrl', 'user.avatar']);
      setProfile(decrypted);
      const marksheetKey = decrypted?.marksheetUrl || decrypted?.student?.marksheetUrl;
      if (marksheetKey) setMarksheetViewUrl(await resolveMarksheetViewUrl(marksheetKey));
      if (decrypted?.user) {
        setFormData({ name: decrypted.user.name ?? authUser?.name ?? '', phone: decrypted.user.phone ?? '', bio: decrypted.bio ?? '', timezone: decrypted.timezone ?? '', preferredLanguage: decrypted.preferredLanguage ?? '', grade: decrypted.student?.grade ?? decrypted.grade ?? '', board: decrypted.student?.board ?? decrypted.board ?? '' });
      }
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      await updateMyStudentProfile(formData);
      showSuccess('Profile updated successfully!');
      setEditing(false);
      loadProfile();
      loadProfileStatus();
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to update profile');
    } finally { setSaving(false); }
  }

  async function handleRequestResubmission() {
    try {
      setRequestingResubmission(true);
      await api.post('/students/me/request-resubmission');
      showSuccess('Resubmission request sent. You can now edit your profile.');
      loadProfile();
      loadProfileStatus();
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to request resubmission');
    } finally { setRequestingResubmission(false); }
  }

  async function handleMarksheetUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateMarksheetFile(file);
    if (validationError) { showError(validationError); return; }
    try {
      setUploadingMarksheet(true);
      await uploadMarksheetFile(file);
      showSuccess('Marksheet uploaded successfully!');
      setMarksheetViewUrl(null);
      loadProfile();
      loadProfileStatus();
    } catch (err: any) {
      showError(err?.response?.data?.message || err?.message || 'Failed to upload marksheet');
    } finally {
      setUploadingMarksheet(false);
      if (marksheetInputRef.current) marksheetInputRef.current.value = '';
    }
  }

  function handleCancel() {
    if (profile?.user) {
      setFormData({ name: profile.user.name ?? authUser?.name ?? '', phone: profile.user.phone ?? '', bio: profile.bio ?? '', timezone: profile.timezone ?? '', preferredLanguage: profile.preferredLanguage ?? '', grade: profile.student?.grade ?? profile.grade ?? '', board: profile.student?.board ?? profile.board ?? '' });
    }
    setEditing(false);
  }

  async function handleAvatarUpload(file: File) {
    try {
      setUploadingAvatar(true);
      await uploadMyAvatar(file);
      await loadProfile();
      const freshMe = await fetchMe();
      const resolved = freshMe?.user ?? freshMe ?? null;
      if (resolved) setUser(resolved);
      showSuccess('Profile image updated successfully!');
    } catch (err: any) {
      showError(err?.response?.data?.message || err?.message || 'Failed to upload profile image');
    } finally { setUploadingAvatar(false); }
  }

  return { authUser, profile, loading, editing, saving, uploadingAvatar, avatarModalOpen, uploadingMarksheet, profileCompletion, requestingResubmission, marksheetViewUrl, marksheetInputRef, formData, setFormData, setEditing, setAvatarModalOpen, loadProfile, loadProfileStatus, handleSave, handleRequestResubmission, handleMarksheetUpload, handleCancel, handleAvatarUpload };
}

export default function StudentProfile() {
  const { authUser, profile, loading, editing, saving, uploadingAvatar, avatarModalOpen, uploadingMarksheet, profileCompletion, requestingResubmission, marksheetViewUrl, marksheetInputRef, formData, setFormData, setEditing, setAvatarModalOpen, loadProfile, loadProfileStatus, handleSave, handleRequestResubmission, handleMarksheetUpload, handleCancel, handleAvatarUpload } = useStudentProfileState();

  useEffect(() => {
    loadProfile();
    loadProfileStatus();
  }, []);

  const avatarInitial = (formData.name || authUser?.name)?.charAt(0)?.toUpperCase() || authUser?.email?.charAt(0)?.toUpperCase() || 'S';
  const resolvedAvatarUrl = profile?.user?.avatarUrl ?? authUser?.avatarUrl ?? null;
  const resubFields = profileCompletion?.resubmissionFields ?? [];
  const canEditField = (field: string) => resubFields.length === 0 || resubFields.includes(field);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          <p className="mt-4 text-slate-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-slate-600">Profile not found. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-3 py-4 sm:px-6 sm:py-6" data-testid="student-profile-page">
      <StatusBanners profileCompletion={profileCompletion} resubFields={resubFields} />

      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-1">My Profile</h1>
          <p className="text-sm sm:text-base text-slate-600">Manage your student profile and preferences</p>
        </div>
        <div className="flex-shrink-0"><HeaderActions
            profileStatus={profileCompletion?.profileStatus}
            editing={editing}
            saving={saving}
            requestingResubmission={requestingResubmission}
            onCancel={handleCancel}
            onSave={handleSave}
            onEdit={() => setEditing(true)}
            onRequestResubmission={handleRequestResubmission}
          /></div>
      </div>

      {/* Profile Card */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <AvatarSection
          avatarInitial={avatarInitial}
          resolvedAvatarUrl={resolvedAvatarUrl}
          formData={formData}
          authUserEmail={profile.user?.email ?? authUser?.email}
          profileStatus={profileCompletion?.profileStatus}
          canEditAvatar={canEditField('avatar')}
          uploadingAvatar={uploadingAvatar}
          onChangePhoto={() => setAvatarModalOpen(true)}
        />
        <ProfileFields
          editing={editing}
          formData={formData}
          profile={profile}
          canEditField={canEditField}
          onChange={(patch) => setFormData({ ...formData, ...patch })}
        />
      </div>

      <MarksheetSection
        profile={profile}
        profileStatus={profileCompletion?.profileStatus}
        canEditMarksheet={canEditField('marksheet')}
        marksheetViewUrl={marksheetViewUrl}
        uploadingMarksheet={uploadingMarksheet}
        marksheetInputRef={marksheetInputRef}
        onUpload={handleMarksheetUpload}
      />

      <AccountStats profile={profile} />

      <AvatarUploadModal
        open={avatarModalOpen}
        uploading={uploadingAvatar}
        onClose={() => setAvatarModalOpen(false)}
        onUpload={handleAvatarUpload}
      />
    </div>
  );
}
