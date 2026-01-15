import { useNavigate } from 'react-router-dom';

export default function InternalOnly() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-6 py-10">
      <div className="max-w-2xl w-full bg-slate-900/70 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="h-2 w-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-amber-300" />
        <div className="p-8 sm:p-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-slate-950 font-bold shadow-lg">
              TN
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">Preprod</p>
              <h1 className="text-2xl font-semibold leading-tight">Internal access only</h1>
            </div>
          </div>

          <p className="text-slate-200/90 text-sm sm:text-base leading-relaxed">
            This preproduction environment is restricted to Tunect team members. Please sign in with
            your company email to continue.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
              <p className="text-sm font-semibold text-emerald-200">Why the lock?</p>
              <p className="mt-2 text-xs text-slate-300/90 leading-relaxed">
                Preprod mirrors production features and data contracts. Limiting access keeps experiments safe
                and prevents external exposure before launch.
              </p>
            </div>
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
              <p className="text-sm font-semibold text-amber-200">Need access?</p>
              <p className="mt-2 text-xs text-slate-300/90 leading-relaxed">
                If you&apos;re on the team and can&apos;t get in, reach out in #eng-auth for an invite or to confirm
                your email domain.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="px-4 py-2.5 rounded-lg bg-emerald-400 text-slate-950 font-semibold shadow-md shadow-emerald-500/40 hover:translate-y-[-1px] hover:shadow-lg hover:shadow-emerald-500/40 transition"
            >
              Go to login
            </button>
            <div className="text-xs text-slate-300/80">
              Access is limited to internal team accounts. Production remains public.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}