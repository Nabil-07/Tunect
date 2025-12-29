// src/pages/student/progress.tsx
import { useEffect, useState } from 'react';
import { Trophy, TrendingUp, Target, Award, BookOpen, Clock, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import apiClient from '../../services/apiClient';

interface Progress {
  id: string;
  subject: string;
  hoursSpent: number;
  xp: number;
  level: number;
}

interface Certificate {
  id: string;
  type: string;
  subject: string;
  title: string;
  issuedDate: string;
}

export default function StudentProgress() {
  const [progress, setProgress] = useState<Progress[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [totalHours, setTotalHours] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(true);
  const [loadingCerts, setLoadingCerts] = useState(true);
  const [loadingHours, setLoadingHours] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // ✅ Load progress independently
    apiClient.get('/student-progress/me')
      .then(res => setProgress(res.data || []))
      .catch(err => console.error('Failed to load progress:', err))
      .finally(() => setLoadingProgress(false));
    
    // ✅ Load certificates independently
    apiClient.get('/certificates/my')
      .then(res => setCertificates(res.data || []))
      .catch(err => console.error('Failed to load certificates:', err))
      .finally(() => setLoadingCerts(false));
    
    // ✅ Load hours independently
    apiClient.get('/student-progress/me/total-hours')
      .then(res => setTotalHours(res.data?.totalHours || 0))
      .catch(err => console.error('Failed to load hours:', err))
      .finally(() => setLoadingHours(false));
  };

  const getCertificateColor = (type: string) => {
    switch (type) {
      case 'BRONZE': return 'from-amber-700 to-amber-500';
      case 'SILVER': return 'from-slate-400 to-slate-300';
      case 'GOLD': return 'from-yellow-500 to-yellow-300';
      case 'PLATINUM': return 'from-purple-600 to-purple-400';
      default: return 'from-ocean-600 to-ocean-400';
    }
  };

  const getCertificateIcon = (type: string) => {
    switch (type) {
      case 'BRONZE': return '🥉';
      case 'SILVER': return '🥈';
      case 'GOLD': return '🥇';
      case 'PLATINUM': return '💎';
      default: return '🏆';
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-8">
      {/* Header */}
      <div className="rounded-3xl bg-gradient-to-r from-ocean-700 to-green-500 p-8 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
              <TrendingUp className="h-10 w-10" />
              Your Learning Progress
            </h1>
            <p className="text-lg text-white/90">Track your journey to mastery</p>
          </div>
          <div className="text-center">
            {loadingHours ? (
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent"></div>
            ) : (
              <>
                <div className="text-5xl font-bold">{totalHours}h</div>
                <div className="text-sm text-white/80 mt-1">Total Hours</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid md:grid-cols-4 gap-6">
        {loadingProgress ? (
          <>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-xl p-6 shadow-md animate-pulse">
                <div className="h-6 w-6 bg-slate-200 rounded mb-3"></div>
                <div className="h-4 w-20 bg-slate-200 rounded mb-2"></div>
                <div className="h-8 w-12 bg-slate-200 rounded"></div>
              </div>
            ))}
          </>
        ) : (
          <>
            <StatCard
              icon={<BookOpen className="h-6 w-6 text-ocean-600" />}
              label="Subjects Studied"
              value={progress.length}
            />
            <StatCard
              icon={<Trophy className="h-6 w-6 text-amber-600" />}
              label="Certificates Earned"
              value={certificates.length}
            />
            <StatCard
              icon={<Zap className="h-6 w-6 text-purple-600" />}
              label="Average Level"
              value={progress.length ? Math.round(progress.reduce((sum, p) => sum + p.level, 0) / progress.length) : 0}
            />
            <StatCard
              icon={<Target className="h-6 w-6 text-green-600" />}
              label="Next Milestone"
              value={`${Math.ceil(totalHours / 15) * 15}h`}
            />
          </>
        )}
      </div>

      {/* Certificates */}
      {loadingCerts ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          <p className="mt-4 text-slate-600">Loading certificates...</p>
        </div>
      ) : certificates.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Award className="h-6 w-6 text-amber-600" />
              Your Certificates
            </h2>
            <Link to="/student/certificates" className="text-ocean-700 hover:underline text-sm font-medium">
              View All
            </Link>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {certificates.slice(0, 3).map(cert => (
              <div
                key={cert.id}
                className={`rounded-2xl bg-gradient-to-br ${getCertificateColor(cert.type)} p-6 text-white shadow-lg hover:shadow-xl transition`}
              >
                <div className="text-5xl mb-3">{getCertificateIcon(cert.type)}</div>
                <h3 className="text-xl font-bold mb-1">{cert.title}</h3>
                <p className="text-sm text-white/90 mb-2">{cert.subject}</p>
                <p className="text-xs text-white/70">
                  Earned {new Date(cert.issuedDate).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Subject Progress */}
      <section>
        <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-ocean-600" />
          Progress by Subject
        </h2>

        {loadingProgress ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-4 text-slate-600">Loading progress...</p>
          </div>
        ) : progress.length === 0 ? (
          <div className="rounded-2xl border bg-white p-12 text-center">
            <Clock className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No progress yet</h3>
            <p className="text-slate-600 mb-6">Start booking sessions to track your learning journey!</p>
            <Link
              to="/find-tutors"
              className="inline-block px-6 py-3 bg-ocean-700 text-white rounded-xl font-semibold hover:bg-ocean-800 transition"
            >
              Find a Tutor
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {progress.map(p => (
              <SubjectCard key={p.id} progress={p} />
            ))}
          </div>
        )}
      </section>

      {/* Learning Goals CTA */}
      <div className="rounded-2xl border-2 border-ocean-200 bg-ocean-50 p-8 text-center">
        <Target className="h-12 w-12 text-ocean-600 mx-auto mb-4" />
        <h3 className="text-2xl font-bold text-slate-800 mb-2">Set Learning Goals</h3>
        <p className="text-slate-600 mb-6">Define your objectives and track milestones</p>
        <Link
          to="/student/goals"
          className="inline-block px-6 py-3 bg-ocean-700 text-white rounded-xl font-semibold hover:bg-ocean-800 transition"
        >
          Manage Goals
        </Link>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition">
      <div className="flex items-center justify-between mb-3">
        {icon}
        <span className="text-3xl font-bold text-slate-800">{value}</span>
      </div>
      <div className="text-sm text-slate-600">{label}</div>
    </div>
  );
}

function SubjectCard({ progress }: { progress: Progress }) {
  const progressToNextLevel = (progress.xp % 1000) / 10; // 0-100%
  const nextMilestone = Math.ceil(progress.hoursSpent / 15) * 15;
  const progressToMilestone = ((progress.hoursSpent % 15) / 15) * 100;

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-slate-800">{progress.subject}</h3>
        <div className="flex items-center gap-2 px-3 py-1 bg-ocean-100 text-ocean-700 rounded-full text-sm font-semibold">
          <Zap className="h-4 w-4" />
          Level {progress.level}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-slate-600">Hours Studied</span>
            <span className="font-semibold text-slate-800">{progress.hoursSpent}h</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-ocean-600 rounded-full transition-all"
              style={{ width: `${Math.min(progressToMilestone, 100)}%` }}
            />
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {(15 - (progress.hoursSpent % 15)).toFixed(1)}h until {nextMilestone}h milestone
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-slate-600">XP Progress</span>
            <span className="font-semibold text-slate-800">{progress.xp} XP</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-purple-600 rounded-full transition-all"
              style={{ width: `${progressToNextLevel}%` }}
            />
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {1000 - (progress.xp % 1000)} XP until Level {progress.level + 1}
          </div>
        </div>
      </div>
    </div>
  );
}
