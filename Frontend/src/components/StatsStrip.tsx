import React from "react";
import api from "../lib/apiClient";

const Stat: React.FC<{ value: string; label: string; icon?: React.ReactNode }> = ({ value, label, icon }) => (
  <div className="flex items-center gap-4">
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
      {icon}
    </div>
    <div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-white/80">{label}</div>
    </div>
  </div>
);

const StatsStrip: React.FC = () => {
  const [loading, setLoading] = React.useState(true);
  const [stats, setStats] = React.useState<{
    students: number;
    tutors: number;
    countries: number;
    sessionsCompleted: number;
  } | null>(null);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get("/stats/public");
        if (!mounted) return;
        setStats({
          students: Number(data?.students ?? 0),
          tutors: Number(data?.tutors ?? 0),
          countries: Number(data?.countries ?? 0),
          sessionsCompleted: Number(data?.sessionsCompleted ?? 0),
        });
      } catch {
        if (!mounted) return;
        setStats(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const formatStat = (value: number, threshold: number, fallback: string) => {
    if (value >= threshold) return `${value.toLocaleString()}+`;
    return fallback;
  };

  return (
    <section className="w-full bg-slate-900 py-14">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-center text-2xl sm:text-3xl font-bold text-white">
          Trusted by Learners Worldwide
        </h2>
        <p className="mt-2 text-center text-white/80">
          Join our growing community of learners and tutors
        </p>

        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8 text-blue-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 19.5a7.5 7.5 0 1115 0v.75A2.25 2.25 0 0117.25 22.5h-10.5A2.25 2.25 0 014.5 20.25v-.75z" />
              </svg>
            }
            value={
              loading || !stats
                ? "—"
                : formatStat(stats.students, 50, "Growing community")
            }
            label="Active Students"
          />
          <Stat
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8 text-green-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 19.5a7.5 7.5 0 1115 0v.75A2.25 2.25 0 0117.25 22.5h-10.5A2.25 2.25 0 014.5 20.25v-.75z" />
                <circle cx="18" cy="6" r="2.5" fill="#34d399" stroke="#34d399" strokeWidth="1.5" />
                <path d="M17.5 6.5l1 1 2-2" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            value={
              loading || !stats
                ? "—"
                : formatStat(stats.tutors, 10, "Curated tutors")
            }
            label="Verified Tutors"
          />
          <Stat
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8 text-yellow-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364-6.364l-1.414 1.414M6.05 17.95l-1.414 1.414m12.728 0l-1.414-1.414M6.05 6.05L4.636 4.636" />
                <circle cx="12" cy="12" r="7.5" stroke="#fbbf24" strokeWidth="1.5" />
              </svg>
            }
            value={
              loading || !stats
                ? "—"
                : formatStat(stats.countries, 5, "Expanding reach")
            }
            label="Countries Served"
          />
          <Stat
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8 text-purple-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 17.25l6.16 3.24-1.18-6.88 5-4.87-6.91-1-3.09-6.26-3.09 6.26-6.91 1 5 4.87-1.18 6.88L12 17.25z" />
              </svg>
            }
            value={
              loading || !stats
                ? "—"
                : formatStat(stats.sessionsCompleted, 100, "Success stories")
            }
            label="Sessions Completed"
          />
        </div>
      </div>
    </section>
  );
};

export default StatsStrip;
