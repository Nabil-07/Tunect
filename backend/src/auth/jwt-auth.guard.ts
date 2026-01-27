// src/auth/jwt-auth.guard.ts
import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: any) {
    if (err || !user) {
      const request = context?.switchToHttp()?.getRequest();
      const path = request?.url || request?.path || 'unknown';
      
      // Always log in preprod/dev for debugging
      console.error('[JwtAuthGuard] Unauthorized:', {
        path,
        err: err?.message || err,
        info: typeof info === 'string' ? info : info?.message,
        hasToken: !!request?.headers?.authorization,
        tokenPrefix: request?.headers?.authorization?.substring(0, 20) || 'none',
      });
      
      // Always throw UnauthorizedException (401) instead of letting it become 404
      throw err || new UnauthorizedException(
        (typeof info === 'string' ? info : info?.message) || 'Unauthorized',
      );
    }
    return user;
  }
}
