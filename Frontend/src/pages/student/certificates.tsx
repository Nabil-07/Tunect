// src/pages/student/certificates.tsx
import { useEffect, useState } from 'react';
import { Award, Download, Share2, Calendar, BookOpen } from 'lucide-react';
import apiClient from '../../services/apiClient';

interface Certificate {
  id: string;
  type: string;
  subject: string;
  title: string;
  description: string;
  issuedDate: string;
  tutor?: {
    user: {
      name: string;
    };
  };
}

export default function Certificates() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCertificates();
  }, []);

  const loadCertificates = async () => {
    try {
      const res = await apiClient.get('/certificates/my');
      setCertificates(res.data || []);
    } catch (error) {
      console.error('Failed to load certificates:', error);
    } finally {
      setLoading(false);
    }
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

  const handleDownload = () => {
    // TODO: Generate PDF certificate
    alert('PDF download coming soon!');
  };

  const handleShare = (cert: Certificate) => {
    const text = `I just earned a ${cert.type} certificate in ${cert.subject} on Tunect! 🎓`;
    if (navigator.share) {
      navigator.share({
        title: cert.title,
        text,
      });
    } else {
      navigator.clipboard.writeText(text);
      alert('Certificate details copied to clipboard!');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="animate-pulse grid md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 rounded-2xl bg-slate-200"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-8">
      {/* Header */}
      <div className="rounded-3xl bg-gradient-to-r from-ocean-700 to-green-500 p-8 text-white shadow-lg">
        <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
          <Award className="h-10 w-10" />
          Your Certificates
        </h1>
        <p className="text-lg text-white/90">Celebrate your learning achievements</p>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-4 gap-6">
        <StatCard label="Total Certificates" value={certificates.length} icon="🏆" />
        <StatCard
          label="Bronze"
          value={certificates.filter(c => c.type === 'BRONZE').length}
          icon="🥉"
        />
        <StatCard
          label="Silver"
          value={certificates.filter(c => c.type === 'SILVER').length}
          icon="🥈"
        />
        <StatCard
          label="Gold & Platinum"
          value={certificates.filter(c => c.type === 'GOLD' || c.type === 'PLATINUM').length}
          icon="🥇"
        />
      </div>

      {/* Certificates Grid */}
      {certificates.length === 0 ? (
        <div className="rounded-2xl border bg-white p-12 text-center">
          <Award className="h-16 w-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-700 mb-2">No certificates yet</h3>
          <p className="text-slate-600 mb-4">
            Complete learning hours to earn certificates:
          </p>
          <div className="grid md:grid-cols-4 gap-4 max-w-2xl mx-auto text-sm">
            <div className="p-3 bg-amber-50 rounded-xl">
              <div className="text-2xl mb-1">🥉</div>
              <div className="font-semibold">Bronze</div>
              <div className="text-slate-600">15 hours</div>
            </div>
            <div className="p-3 bg-slate-100 rounded-xl">
              <div className="text-2xl mb-1">🥈</div>
              <div className="font-semibold">Silver</div>
              <div className="text-slate-600">30 hours</div>
            </div>
            <div className="p-3 bg-yellow-50 rounded-xl">
              <div className="text-2xl mb-1">🥇</div>
              <div className="font-semibold">Gold</div>
              <div className="text-slate-600">50 hours</div>
            </div>
            <div className="p-3 bg-purple-50 rounded-xl">
              <div className="text-2xl mb-1">💎</div>
              <div className="font-semibold">Platinum</div>
              <div className="text-slate-600">100 hours</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          {certificates.map(cert => (
            <div
              key={cert.id}
              className={`rounded-2xl bg-gradient-to-br ${getCertificateColor(cert.type)} p-8 text-white shadow-lg hover:shadow-xl transition relative overflow-hidden`}
            >
              {/* Decorative pattern */}
              <div className="absolute top-0 right-0 w-32 h-32 opacity-10">
                <Award className="h-full w-full" />
              </div>

              <div className="relative">
                {/* Icon */}
                <div className="text-6xl mb-4">{getCertificateIcon(cert.type)}</div>

                {/* Title */}
                <h3 className="text-2xl font-bold mb-2">{cert.title}</h3>
                <p className="text-sm text-white/90 mb-4">{cert.description}</p>

                {/* Details */}
                <div className="space-y-2 text-sm text-white/80 mb-6">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    <span className="font-medium">{cert.subject}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>Issued {new Date(cert.issuedDate).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={handleDownload}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl transition text-sm font-medium"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                  <button
                    onClick={() => handleShare(cert)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl transition text-sm font-medium"
                  >
                    <Share2 className="h-4 w-4" />
                    Share
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Next Milestone Info */}
      {certificates.length > 0 && (
        <div className="rounded-2xl border-2 border-ocean-200 bg-ocean-50 p-6 text-center">
          <Award className="h-12 w-12 text-ocean-600 mx-auto mb-3" />
          <h3 className="text-xl font-bold text-slate-800 mb-2">Keep Learning!</h3>
          <p className="text-slate-600">
            Continue your sessions to unlock more certificates and showcase your expertise.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition text-center">
      <div className="text-4xl mb-2">{icon}</div>
      <div className="text-3xl font-bold text-slate-800 mb-1">{value}</div>
      <div className="text-sm text-slate-600">{label}</div>
    </div>
  );
}
