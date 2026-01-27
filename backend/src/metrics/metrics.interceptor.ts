import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request } from 'express';
import { MetricsService } from './metrics.service';

const LOGIN_ROUTE = '/auth/login';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const method = (req.method ?? 'GET').toUpperCase();
    const path = this.getPath(req);
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - start;
        this.metrics.record(method, path, durationMs, 200);
      }),
      catchError((err: unknown) => {
        const durationMs = Date.now() - start;
        const status =
          typeof (err as any)?.status === 'number'
            ? (err as any).status
            : typeof (err as any)?.statusCode === 'number'
              ? (err as any).statusCode
              : 500;
        this.metrics.record(method, path, durationMs, status);
        if (this.isLoginFailure(method, path, status)) {
          this.metrics.recordLoginFailure();
        }
        return throwError(() => err);
      }),
    );
  }

  private getPath(req: Request): string {
    const p = (req.route?.path ?? req.path ?? req.url ?? '/').toString();
    return p.split('?')[0] || '/';
  }

  private isLoginFailure(method: string, path: string, status: number): boolean {
    const normalized = path.split('?')[0];
    return (
      method === 'POST' &&
      (normalized === LOGIN_ROUTE || normalized === LOGIN_ROUTE + '/') &&
      status >= 400
    );
  }
}
