import React from 'react';

type Props = { className?: string };

const GoogleButton: React.FC<Props> = ({ className }) => {
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  return (
    <a
      href={`${apiBase}/auth/google`}
      className={`w-full inline-flex items-center justify-center gap-3 rounded-xl border px-4 py-2 text-sm font-medium hover:bg-slate-50 ${className ?? ''}`}
    >
      <img
        src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
        alt="Google"
        className="h-5 w-5"
      />
      Continue with Google
    </a>
  );
};

export default GoogleButton;
