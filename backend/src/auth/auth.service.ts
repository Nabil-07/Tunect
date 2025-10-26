// src/auth/auth.service.ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { Role, Prisma, OtpPurpose, OtpChannel } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';

export type GoogleOAuthPayload = {
  provider: 'google';
  providerUserId: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  emailVerified?: boolean;
};

type ForgotStartInput = {
  channel: 'EMAIL' | 'SMS';
  email?: string;
  phone?: string;
};
type ForgotVerifyInput = {
  channel: 'EMAIL' | 'SMS';
  target: string;
  code: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    private readonly notify: NotificationsService,
  ) {}

  // ======== Email/password ========
  async register(email: string, password: string, role: Role) {
    const hash = await bcrypt.hash(password, 10);

    try {
      const user = await this.prisma.user.create({
        data: { email: email.toLowerCase(), password: hash, role },
      });

      if (role === Role.STUDENT) {
        await this.prisma.student.upsert({
          where: { userId: user.id },
          update: {},
          create: { user: { connect: { id: user.id } }, tokens: 0 },
        });
      }

      if (role === Role.TUTOR) {
        await this.prisma.tutor.upsert({
          where: { userId: user.id },
          update: {},
          create: { user: { connect: { id: user.id } }, status: 'PENDING', hourlyRate: 0 },
        });
      }

      return { id: user.id, email: user.email, role: user.role };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email is already registered');
      }
      throw err;
    }
  }

  private async validateUser(email: string, plain: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return null;
    const ok = await bcrypt.compare(plain, user.password);
    return ok ? user : null;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: user.id, email: user.email, role: user.role };
    const access_token = await this.jwt.signAsync(payload, {
      secret: this.cfg.get<string>('JWT_SECRET') || 'changeme',
      expiresIn: this.cfg.get<string>('JWT_ACCESS_TTL') ?? '900s',
      issuer:   this.cfg.get<string>('JWT_ISS') || undefined,
      audience: this.cfg.get<string>('JWT_AUD') || undefined,
    });
    const refresh_token = await this.jwt.signAsync({ sub: user.id, type: 'refresh' }, {
      secret: this.cfg.get<string>('JWT_SECRET') || 'changeme',
      expiresIn: this.cfg.get<string>('JWT_REFRESH_TTL') ?? '7d',
      issuer:   this.cfg.get<string>('JWT_ISS') || undefined,
      audience: this.cfg.get<string>('JWT_AUD') || undefined,
    });

    return {
      access_token,
      refresh_token,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  async logout(_userId: string) {
    return { ok: true };
  }

  // ======== Token refresh (OAuth / web) ========
  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');

    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.cfg.get<string>('JWT_SECRET') || 'changeme',
        issuer:   this.cfg.get<string>('JWT_ISS') || undefined,
        audience: this.cfg.get<string>('JWT_AUD') || undefined,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const isRefresh = payload?.type === 'refresh' || payload?.typ === 'refresh';
    if (!isRefresh || !payload?.sub) {
      throw new UnauthorizedException('Malformed refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub as string } });
    if (!user) throw new UnauthorizedException('User not found');

    const access_token = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.cfg.get<string>('JWT_SECRET') || 'changeme',
        expiresIn: this.cfg.get<string>('JWT_ACCESS_TTL') ?? '900s',
        issuer:   this.cfg.get<string>('JWT_ISS') || undefined,
        audience: this.cfg.get<string>('JWT_AUD') || undefined,
      },
    );

    const new_refresh = await this.jwt.signAsync(
      { sub: user.id, type: 'refresh' },
      {
        secret: this.cfg.get<string>('JWT_SECRET') || 'changeme',
        expiresIn: this.cfg.get<string>('JWT_REFRESH_TTL') ?? '7d',
        issuer:   this.cfg.get<string>('JWT_ISS') || undefined,
        audience: this.cfg.get<string>('JWT_AUD') || undefined,
      },
    );

    return { access_token, refresh_token: new_refresh };
  }

  // ======== Google OAuth (unified user, no persona auto-create) ========
  async findOrCreateGoogleUser(p: GoogleOAuthPayload) {
    if (!p.email) throw new BadRequestException('Google account has no email');

    // 1) Check by provider ID
    const existingOauth = await this.prisma.oAuthAccount.findUnique({
      where: { providerUserId: p.providerUserId },
      include: { user: true },
    });
    if (existingOauth?.user) return { user: existingOauth.user, isNew: false };

    // 2) Check by email → unify into same User row
    let user = await this.prisma.user.findUnique({
      where: { email: p.email.toLowerCase() },
    });

    const isNew = !user;
    if (!user) {
      // Create only the User row with hasChosenRole: false
      user = await this.prisma.user.create({
        data: {
          email: p.email.toLowerCase(),
          password: '',       // OAuth user (no password)
          role: null,         // No default role assigned
          hasChosenRole: false, // New users must choose a role
        },
      });
    }

    // 3) Link OAuth account
    await this.prisma.oAuthAccount.upsert({
      where: { providerUserId: p.providerUserId },
      update: { email: p.email.toLowerCase(), userId: user.id, provider: 'google' },
      create: {
        userId: user.id,
        provider: 'google',
        providerUserId: p.providerUserId,
        email: p.email.toLowerCase(),
      },
    });

    return { user, isNew };
  }

  async issueTokensForOAuth(user: { id: string; email: string; role: Role }) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.cfg.get<string>('JWT_SECRET') || 'changeme',
        expiresIn: this.cfg.get<string>('JWT_ACCESS_TTL') ?? '900s',
        issuer:   this.cfg.get<string>('JWT_ISS') || undefined,
        audience: this.cfg.get<string>('JWT_AUD') || undefined,
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, type: 'refresh' },
      {
        secret: this.cfg.get<string>('JWT_SECRET') || 'changeme',
        expiresIn: this.cfg.get<string>('JWT_REFRESH_TTL') ?? '7d',
        issuer:   this.cfg.get<string>('JWT_ISS') || undefined,
        audience: this.cfg.get<string>('JWT_AUD') || undefined,
      },
    );

    return { accessToken, refreshToken };
  }

  // Persona helpers
  async getPersona(userId: string) {
    const [student, tutor] = await Promise.all([
      this.prisma.student.findUnique({ where: { userId } }),
      this.prisma.tutor.findUnique({ where: { userId } }),
    ]);
    return { hasStudent: !!student, hasTutor: !!tutor, student, tutor };
  }

  async chooseRole(userId: string, role: 'STUDENT' | 'TUTOR') {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        role,
        hasChosenRole: true, // Update hasChosenRole to true
      },
    });

    const next = role === 'TUTOR' ? '/tutor/dashboard' : '/student/dashboard';
    return { user, next };
  }

  // ======== Forgot/Reset OTP ========
  private randomOtp(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  async forgotStart(input: ForgotStartInput) {
    const channel = input.channel === 'SMS' ? OtpChannel.SMS : OtpChannel.EMAIL;

    const user =
      channel === OtpChannel.EMAIL
        ? await this.prisma.user.findUnique({
            where: { email: (input.email || '').toLowerCase() },
          })
        : await this.prisma.user.findUnique({
            where: { phone: (input.phone || '').trim() },
          });

    if (!user) {
      throw new NotFoundException(
        channel === OtpChannel.EMAIL
          ? 'Email does not exist. Please create a new account.'
          : 'Phone number does not exist. Please create a new account.',
      );
    }

    const code = this.randomOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const target = channel === OtpChannel.EMAIL ? user.email : (user.phone as string);

    await this.prisma.otpCode.create({
      data: {
        userId: user.id,
        purpose: OtpPurpose.PASSWORD_RESET,
        channel,
        target,
        code,
        expiresAt,
      },
    });

    if (channel === OtpChannel.EMAIL) {
      await this.notify.sendOtpEmail(user.email, code);
    } else {
      await this.notify.sendSms(target, `Your Tunect OTP is ${code}`);
    }

    return { ok: true, message: 'OTP sent if account exists' };
  }

  async forgotVerify(input: ForgotVerifyInput) {
    const channel = input.channel === 'SMS' ? OtpChannel.SMS : OtpChannel.EMAIL;
    const now = new Date();

    const otp = await this.prisma.otpCode.findFirst({
      where: {
        target: input.target.trim().toLowerCase(),
        purpose: OtpPurpose.PASSWORD_RESET,
        channel,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp || otp.code !== input.code) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const resetToken = await this.jwt.signAsync(
      { sub: otp.userId, otpId: otp.id, typ: 'pwd_reset' },
      { secret: this.cfg.get<string>('JWT_SECRET') || 'changeme', expiresIn: '10m' },
    );

    return { resetToken };
  }

  async forgotComplete(resetToken: string, newPassword: string) {
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(resetToken, {
        secret: this.cfg.get<string>('JWT_SECRET') || 'changeme',
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    if (payload?.typ !== 'pwd_reset' || !payload?.otpId || !payload?.sub) {
      throw new BadRequestException('Malformed reset token');
    }

    const otp = await this.prisma.otpCode.findUnique({ where: { id: payload.otpId as string } });
    if (!otp || otp.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid reset token (otp not found)');
    }
    if (otp.consumedAt) {
      throw new BadRequestException('Reset token already used');
    }
    if (otp.expiresAt <= new Date()) {
      throw new BadRequestException('OTP expired');
    }

    const hash = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: payload.sub as string }, data: { password: hash } }),
      this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } }),
      this.prisma.otpCode.deleteMany({
        where: {
          userId: payload.sub as string,
          purpose: OtpPurpose.PASSWORD_RESET,
          consumedAt: null,
          expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return { ok: true, message: 'Password reset successfully' };
  }
}
