import { useEffect, useState } from 'react';
import { User, Mail, Phone, MapPin, Calendar, Edit2, Save, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/apiClient';
import { useToast } from '../../contexts/ToastContext';

type StudentProfile = {
  id: string;
  userId: string;
  bio?: string;
  timezone?: string;
  preferredLanguage?: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    avatarUrl?: string;
  };
};

export default function StudentProfile() {
  const { user: authUser } = useAuth();
  const { showSuccess, showError } = useToast();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    bio: '',
    timezone: '',
    preferredLanguage: '',
  });

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      setLoading(true);
      const { data } = await api.get<StudentProfile>('/students/me');
      setProfile(data);
      
      // Defensive: ensure user object exists
      if (data?.user) {
        setFormData({
          name: data.user.name || '',
          phone: data.user.phone || '',
          bio: data.bio || '',
          timezone: data.timezone || '',
          preferredLanguage: data.preferredLanguage || '',
        });
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
      await api.patch('/students/me', formData);
      showSuccess('Profile updated successfully!');
      setEditing(false);
      loadProfile();
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (profile?.user) {
      setFormData({
        name: profile.user.name || '',
        phone: profile.user.phone || '',
        bio: profile.bio || '',
        timezone: profile.timezone || '',
        preferredLanguage: profile.preferredLanguage || '',
      });
    }
    setEditing(false);
  }

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
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">My Profile</h1>
          <p className="text-slate-600">Manage your student profile and preferences</p>
        </div>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Edit2 className="h-4 w-4" />
            Edit Profile
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              disabled={saving}
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-400"
              disabled={saving}
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {/* Profile Card */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {/* Avatar Section */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-8 py-12">
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center text-blue-600 font-bold text-3xl shadow-lg">
              {formData.name?.charAt(0)?.toUpperCase() || authUser?.email?.charAt(0)?.toUpperCase() || 'S'}
            </div>
            <div className="text-white">
              <h2 className="text-2xl font-bold mb-1">{formData.name || 'Student'}</h2>
              <p className="text-blue-100">{profile.user?.email || authUser?.email || 'No email'}</p>
            </div>
          </div>
        </div>

        {/* Profile Details */}
        <div className="p-8 space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <User className="inline h-4 w-4 mr-2" />
              Full Name
            </label>
            {editing ? (
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your full name"
              />
            ) : (
              <p className="text-slate-800 px-4 py-2 bg-slate-50 rounded-lg">
                {formData.name || 'Not set'}
              </p>
            )}
          </div>

          {/* Email (Read-only) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Mail className="inline h-4 w-4 mr-2" />
              Email Address
            </label>
            <p className="text-slate-800 px-4 py-2 bg-slate-50 rounded-lg">
              {profile.user?.email || authUser?.email || 'No email'}
            </p>
            <p className="text-xs text-slate-500 mt-1">Email cannot be changed</p>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Phone className="inline h-4 w-4 mr-2" />
              Phone Number
            </label>
            {editing ? (
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your phone number"
              />
            ) : (
              <p className="text-slate-800 px-4 py-2 bg-slate-50 rounded-lg">
                {formData.phone || 'Not set'}
              </p>
            )}
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Edit2 className="inline h-4 w-4 mr-2" />
              About Me
            </label>
            {editing ? (
              <textarea
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Tell us about yourself, your learning goals, interests..."
              />
            ) : (
              <p className="text-slate-800 px-4 py-2 bg-slate-50 rounded-lg whitespace-pre-wrap">
                {formData.bio || 'No bio added yet'}
              </p>
            )}
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <MapPin className="inline h-4 w-4 mr-2" />
              Timezone
            </label>
            {editing ? (
              <select
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select timezone</option>
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="America/New_York">America/New York (EST)</option>
                <option value="America/Los_Angeles">America/Los Angeles (PST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
              </select>
            ) : (
              <p className="text-slate-800 px-4 py-2 bg-slate-50 rounded-lg">
                {formData.timezone || 'Not set'}
              </p>
            )}
          </div>

          {/* Preferred Language */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Calendar className="inline h-4 w-4 mr-2" />
              Preferred Language
            </label>
            {editing ? (
              <select
                value={formData.preferredLanguage}
                onChange={(e) => setFormData({ ...formData, preferredLanguage: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select language</option>
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
              </select>
            ) : (
              <p className="text-slate-800 px-4 py-2 bg-slate-50 rounded-lg">
                {formData.preferredLanguage
                  ? {
                      en: 'English',
                      hi: 'Hindi',
                      es: 'Spanish',
                      fr: 'French',
                      de: 'German',
                    }[formData.preferredLanguage] || formData.preferredLanguage
                  : 'Not set'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Account Stats */}
      <div className="mt-8 grid md:grid-cols-3 gap-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-blue-700">Member Since</span>
            <Calendar className="h-5 w-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-blue-900">
            {profile.user?.id
              ? new Date(profile.user.id.slice(0, 8)).toLocaleDateString('en-IN', {
                  month: 'short',
                  year: 'numeric',
                })
              : 'N/A'}
          </p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-green-700">Account Status</span>
            <User className="h-5 w-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-900">Active</p>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-purple-700">Profile Type</span>
            <Edit2 className="h-5 w-5 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-purple-900">Student</p>
        </div>
      </div>
    </div>
  );
}
