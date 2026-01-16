import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isPreprodAllowedEmail } from './preprod-allowlist';

@Injectable()
export class PreprodInternalGuard implements CanActivate {
  constructor(private readonly cfg: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const env = (this.cfg.get<string>('APP_ENV') || '').toLowerCase();
    if (env !== 'preprod') return true;

    const request = context.switchToHttp().getRequest();
    if (request?.method === 'OPTIONS') return true;
    const user = request?.user;

    // If the request is unauthenticated, let existing guards handle it; this guard only enforces domain.
    const email = (user?.email || '').toLowerCase();
    if (!email) return true;

    if (!isPreprodAllowedEmail(this.cfg, email)) {
      throw new UnauthorizedException('Preprod access restricted');
    }

    return true;
  }
}