import React from "react";

type Props = {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
};

const FeatureCard: React.FC<Props> = ({ icon, title, children }) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-slate-600 leading-relaxed">{children}</p>
    </div>
  );
};

export default FeatureCard;
