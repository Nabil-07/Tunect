// src/auth/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

type JwtPayload = {
  sub: string;
  email: string;
  role: 'ADMIN' | 'TUTOR' | 'STUDENT';
  iss?: string;
  aud?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly cfg: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = cfg.get<string>('JWT_SECRET') || 'changeme';
    // const issuer = cfg.get<string>('JWT_ISS') || undefined;     // STRICT: enable after it works
    // const audience = cfg.get<string>('JWT_AUD') || undefined;    // STRICT: enable after it works

    const verifyOpts: any = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      // issuer,       // STRICT
      // audience,     // STRICT
    };

    super(verifyOpts);
  }

  async validate(payload: JwtPayload) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[jwt.validate] sub:', payload.sub, 'role:', payload.role);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true },
    });

    if (!user) throw new UnauthorizedException('User not found');

    return { id: user.id, sub: user.id, email: user.email, role: user.role };
  }
}
