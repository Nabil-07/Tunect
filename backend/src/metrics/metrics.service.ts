import { Injectable } from '@nestjs/common';

export type RouteMetric = {
  count: number;
  totalMs: number;
  errors: number;
};

export type MetricsSummary = {
  totalRequests: number;
  totalErrors: number;
  loginFailures: number;
  requestsPerRoute: Record<string, { count: number; avgMs: number; errors: number }>;
};

/** Paths to skip when recording metrics (health checks, metrics endpoint). */
const SKIP_PATHS = new Set(['/health', '/ready', '/admin/metrics']);

@Injectable()
export class MetricsService {
  private totalRequests = 0;
  private totalErrors = 0;
  private loginFailures = 0;
  private readonly routeMap = new Map<string, RouteMetric>();

  private routeKey(method: string, path: string): string {
    return `${method} ${path}`;
  }

  private shouldSkip(path: string): boolean {
    const p = path?.split('?')[0] ?? '';
    return SKIP_PATHS.has(p) || SKIP_PATHS.has(p.replace(/\/$/, ''));
  }

  /**
   * Record a request. Call from interceptor; minimal work to avoid perf impact.
   */
  record(method: string, path: string, durationMs: number, status: number): void {
    const normalized = (path ?? '').split('?')[0] || '/';
    if (this.shouldSkip(normalized)) return;

    this.totalRequests += 1;
    if (status >= 400) this.totalErrors += 1;

    const key = this.routeKey(method, normalized);
    let m = this.routeMap.get(key);
    if (!m) {
      m = { count: 0, totalMs: 0, errors: 0 };
      this.routeMap.set(key, m);
    }
    m.count += 1;
    m.totalMs += durationMs;
    if (status >= 400) m.errors += 1;
  }

  /**
   * Record a login failure. Call when POST /auth/login returns status >= 400.
   */
  recordLoginFailure(): void {
    this.loginFailures += 1;
  }

  /**
   * Return JSON summary for GET /admin/metrics.
   */
  getSummary(): MetricsSummary {
    const requestsPerRoute: Record<string, { count: number; avgMs: number; errors: number }> = {};
    for (const [key, m] of this.routeMap) {
      requestsPerRoute[key] = {
        count: m.count,
        avgMs: m.count > 0 ? Math.round((m.totalMs / m.count) * 100) / 100 : 0,
        errors: m.errors,
      };
    }
    return {
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      loginFailures: this.loginFailures,
      requestsPerRoute,
    };
  }
}
