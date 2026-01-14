import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PreprodInternalGuard implements CanActivate {
  constructor(private readonly cfg: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const env = (this.cfg.get<string>('APP_ENV') || '').toLowerCase();
    if (env !== 'preprod') return true;

    const request = context.switchToHttp().getRequest();
    const user = request?.user;

    // If the request is unauthenticated, let existing guards handle it; this guard only enforces domain.
    const email = (user?.email || '').toLowerCase();
    if (!email) return true;

    if (!email.endsWith('@tunectnow.com')) {
      throw new UnauthorizedException('Preprod is restricted to @tunectnow.com accounts');
    }

    return true;
  }
}