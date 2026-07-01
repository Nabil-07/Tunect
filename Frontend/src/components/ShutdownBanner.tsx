import { AlertTriangle } from 'lucide-react';
import {
  SITE_SHUTDOWN,
  SHUTDOWN_HOME_ALERT,
  SHUTDOWN_OPERATOR_URL,
  SHUTDOWN_OPERATOR_NAME,
} from '../config/siteShutdown';

type Props = {
  /** Larger alert for the home hero area */
  prominent?: boolean;
};

export default function ShutdownBanner({ prominent = false }: Props) {
  if (!SITE_SHUTDOWN) return null;

  if (prominent) {
    return (
      <div
        className="border-b border-amber-300 bg-amber-50"
        role="alert"
        data-testid="shutdown-banner-prominent"
      >
        <div className="container-px mx-auto py-4">
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-white/80 px-4 py-4 shadow-sm">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" aria-hidden />
            <div className="text-sm text-amber-950 leading-relaxed">
              <p className="font-semibold text-amber-900">Business closed — reference site only</p>
              <p className="mt-1">{SHUTDOWN_HOME_ALERT}</p>
              <p className="mt-2 text-amber-800">
                Originally built and operated by{' '}
                <a
                  href={SHUTDOWN_OPERATOR_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-amber-900 underline hover:text-amber-950"
                >
                  {SHUTDOWN_OPERATOR_NAME}
                </a>{' '}
                (tunectlabs.com).
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-900"
      role="alert"
      data-testid="shutdown-banner"
    >
      <span className="font-medium">Reference only:</span> {SHUTDOWN_HOME_ALERT}{' '}
      <a
        href={SHUTDOWN_OPERATOR_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline hover:text-amber-950"
      >
        {SHUTDOWN_OPERATOR_NAME}
      </a>
    </div>
  );
}
