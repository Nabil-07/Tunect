import React from "react";

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
  return (
    <section className="w-full bg-slate-900 py-14">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-center text-2xl sm:text-3xl font-bold text-white">
          Trusted by Learners Worldwide
        </h2>
        <p className="mt-2 text-center text-white/80">
          Join thousands of students and tutors who’ve made learning their passion
        </p>

        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <Stat value="10,000+" label="Active Students" />
          <Stat value="2,500+" label="Verified Tutors" />
          <Stat value="50+" label="Countries Served" />
          <Stat value="100,000+" label="Sessions Completed" />
        </div>
      </div>
    </section>
  );
};

export default StatsStrip;
