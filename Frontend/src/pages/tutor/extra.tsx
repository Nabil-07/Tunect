// src/pages/tutor/extra.tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { BadgeCheck, FileText, UserCircle, Wallet, Users, LifeBuoy } from 'lucide-react';

function Card(props: { to: string; title: string; desc: string; icon: ReactNode; testId?: string }) {
  return (
    <Link
      to={props.to}
      className="flex gap-3 p-4 rounded-2xl border bg-white hover:shadow-sm transition"
      data-testid={props.testId}
    >
      <div className="shrink-0 p-2 rounded-xl bg-slate-100">{props.icon}</div>
      <div>
        <div className="font-semibold">{props.title}</div>
        <div className="text-sm text-slate-600">{props.desc}</div>
      </div>
    </Link>
  );
}

export default function TutorExtra() {
  const { user } = useAuth();
  const kycStatus =
    (user as any)?.tutorStatus ||
    localStorage.getItem('tutorStatus') ||
    'Not submitted';

  return (
    <main className="container mx-auto px-4 py-6" data-testid="tutor-extra-page">
      <h2 className="text-2xl font-bold mb-4">Extra</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card
          to="/tutor/profile"
          title="Profile"
          desc="Update your public info and bio."
          icon={<UserCircle size={22} />}
          testId="tutor-extra-profile-card"
        />
        <Card
          to="/find-tutors"
          title="Find Tutor"
          desc="Explore peers and subjects across Tunect."
          icon={<Users size={22} />}
          testId="tutor-extra-find-tutor-card"
        />
        <Link
          to="/become-tutor"
          className="flex flex-col gap-3 p-4 rounded-2xl border bg-white hover:shadow-sm transition"
          data-testid="tutor-extra-become-tutor-card"
        >
          <div className="flex items-center gap-3">
            <div className="shrink-0 p-2 rounded-xl bg-slate-100"><FileText size={22} /></div>
            <div>
              <div className="font-semibold">Become a Tutor / KYC</div>
              <div className="text-sm text-slate-600">KYC status: <b>{String(kycStatus)}</b></div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/tutor/kyc-upload" className="rounded-lg bg-blue-600 text-white px-3 py-1 text-sm hover:bg-blue-700" data-testid="tutor-extra-upload-kyc-button">
              Upload KYC
            </Link>
            <Link to="/become-tutor" className="rounded-lg border px-3 py-1 text-sm hover:bg-slate-50" data-testid="tutor-extra-view-application-button">
              View application
            </Link>
          </div>
        </Link>
        <Card
          to="/support"
          title="Support"
          desc="Get help from our team."
          icon={<LifeBuoy size={22} />}
          testId="tutor-extra-support-card"
        />
        <Card
          to="/tutor/earnings"
          title="Total Earnings"
          desc="See wallet balance and payouts."
          icon={<Wallet size={22} />}
          testId="tutor-extra-earnings-card"
        />
        <div className="p-4 rounded-2xl border bg-emerald-50 text-emerald-700 flex items-center gap-2">
          <BadgeCheck size={18} />
          Keep your availability updated so students can book your slots.
        </div>
      </div>
    </main>
  );
}
