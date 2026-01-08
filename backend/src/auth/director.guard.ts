import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class DirectorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (user?.role === 'ADMIN' && user?.isDirector) {
      return true;
    }
    throw new ForbiddenException('Director access required');
  }
}
