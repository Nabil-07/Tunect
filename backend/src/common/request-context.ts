// src/common/request-context.ts
import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';

@Injectable({ scope: Scope.REQUEST })
export class RequestContext {
  constructor(
    @Inject(REQUEST) private readonly req: Request & { user?: any },
  ) {}

  get user() {
    return this.req.user;
  }

  get userId(): string | undefined {
    return this.req.user?.id;
  }

  get role(): string | undefined {
    return this.req.user?.role;
  }
}
