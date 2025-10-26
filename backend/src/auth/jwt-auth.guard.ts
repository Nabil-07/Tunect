// src/auth/jwt-auth.guard.ts
import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('[JwtAuthGuard] Unauthorized:', {
          err: err?.message || err,
          info: typeof info === 'string' ? info : info?.message,
        });
      }
      throw err || new UnauthorizedException(
        (typeof info === 'string' ? info : info?.message) || 'Unauthorized',
      );
    }
    return user;
  }
}
