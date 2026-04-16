// src/auth/auth.service.ts
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Role, Prisma, OtpPurpose, OtpChannel } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadsService } from '../uploads/uploads.service';
import { isPreprodAllowedEmail } from './preprod-allowlist';
import { AdminControlsService } from '../admin-controls/admin-controls.service';

/** Brute-force protection: lock duration in minutes after max failed attempts. */
const LOGIN_LOCK_MINUTES = 15;
/** Max failed login attempts per user before temporary lock. */
const MAX_FAILED_LOGIN_ATTEMPTS = 10;

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
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    private readonly notify: NotificationsService,
    private readonly uploadsService: UploadsService,
    private readonly adminControls: AdminControlsService,
  ) {}

  private ensureInternal(email?: string) {
    const env = (this.cfg.get<string>('APP_ENV') || '').toLowerCase();
    if (env !== 'preprod') return;
    if (!isPreprodAllowedEmail(this.cfg, email)) {
      throw new UnauthorizedException('Preprod access restricted');
    }
  }

  // ======== Email/password ========
  async register(email: string, password: string, role: Role) {
    this.ensureInternal(email);

    // Check admin controls for role availability
    const controls = await this.adminControls.getPublicControls();
    if (role === Role.STUDENT && !controls.studentRoleEnabled) {
      throw new ForbiddenException('Student registration is currently disabled');
    }
    if (role === Role.TUTOR && !controls.tutorRoleEnabled) {
      throw new ForbiddenException('Tutor registration is currently disabled');
    }

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

      // Send welcome + verification email (fire-and-forget)
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationToken: verificationToken,
          emailVerificationTokenExpiry: tokenExpiry,
        },
      });
      this.notify.sendWelcomeVerificationEmail({
        to: user.email,
        name: user.email.split('@')[0], // name not yet set at registration
        verificationToken,
        role: role as 'STUDENT' | 'TUTOR',
      }).then((sent) => {
        if (sent === false) this.logger.error(`Welcome email NOT sent to ${user.email} — check Graph/SMTP config in notifications.service`);
        else this.logger.log(`Welcome email sent → ${user.email}`);
      }).catch((e) => this.logger.error(`Welcome email threw for ${user.email}: ${e?.message}`));

      return { id: user.id, email: user.email, role: user.role };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email is already registered');
      }
      throw err;
    }
  }

  async verifyEmail(token: string) {
    if (!token) throw new BadRequestException('Verification token is required');

    const user = await this.prisma.user.findUnique({
      where: { emailVerificationToken: token },
      select: { id: true, email: true, name: true, role: true, emailVerificationTokenExpiry: true, emailVerifiedAt: true },
    });

    if (!user) throw new BadRequestException('Invalid or already used verification token');
    if (user.emailVerifiedAt) return { message: 'Email already verified' };
    if (user.emailVerificationTokenExpiry && user.emailVerificationTokenExpiry < new Date()) {
      throw new BadRequestException('Verification token has expired. Please request a new one.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        emailVerificationTokenExpiry: null,
      },
    });

    this.notify.sendEmailVerifiedConfirmation({ to: user.email, name: user.name ?? user.email.split('@')[0], role: user.role as 'STUDENT' | 'TUTOR' })
      .catch((e) => this.logger.warn(`Email verified confirmation failed: ${e?.message}`));

    return { message: 'Email verified successfully' };
  }

  async resendVerificationEmail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, emailVerifiedAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.emailVerifiedAt) throw new BadRequestException('Email is already verified');

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerificationToken: verificationToken, emailVerificationTokenExpiry: tokenExpiry },
    });

    await this.notify.sendWelcomeVerificationEmail({
      to: user.email,
      name: user.name ?? user.email.split('@')[0],
      verificationToken,
      role: user.role as 'STUDENT' | 'TUTOR',
    });

    return { message: 'Verification email sent' };
  }

  private async validateUser(email: string, plain: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return null;
    const ok = await bcrypt.compare(plain, user.password);
    return ok ? user : null;
  }

  /**
   * Login with brute-force protection:
   * - 403 if account locked (≥10 failed attempts, 15‑min lock).
   * - Reset failed attempts and lock on success.
   * - Increment failed attempts on failure; lock when ≥10.
   * IP rate limit (5/min) is enforced by ThrottlerGuard on POST /auth/login.
   */
  async login(email: string, password: string) {
    this.ensureInternal(email);
    const emailNorm = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: emailNorm },
      select: {
        id: true,
        email: true,
        role: true,
        isDirector: true,
        password: true,
        failedLoginAttempts: true,
        lockUntil: true,
        deletedAt: true,
      },
    });

    const now = new Date();

    // Block deleted accounts
    if (user?.deletedAt) {
      throw new UnauthorizedException('This account has been deleted');
    }

    if (user?.lockUntil && user.lockUntil > now) {
      const retryAt = user.lockUntil.toISOString();
      this.logger.warn(`Login blocked: account locked (email=${emailNorm}, retryAfter=${retryAt})`);
      throw new ForbiddenException(
        'Account temporarily locked due to too many failed login attempts. Try again in 15 minutes.',
      );
    }

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(password, user.password);
    if (ok) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockUntil: null },
      });
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
        user: { id: user.id, email: user.email, role: user.role, isDirector: user.isDirector },
      };
    }

    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    const lockUntil = attempts >= MAX_FAILED_LOGIN_ATTEMPTS
      ? new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60 * 1000)
      : null;
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: attempts, lockUntil },
    });
    if (lockUntil) {
      this.logger.warn(
        `Account locked after ${attempts} failed logins (email=${emailNorm}, lockUntil=${lockUntil.toISOString()})`,
      );
    }
    throw new UnauthorizedException('Invalid credentials');
  }

  async logout(_userId: string) {
    return { ok: true };
  }

  // ======== Token refresh (OAuth / web) ========
  async refresh(refreshToken: string) {
    try {
      if (!refreshToken) throw new UnauthorizedException('Missing refresh token');

      let payload: any;
      try {
        payload = await this.jwt.verifyAsync(refreshToken, {
          secret: this.cfg.get<string>('JWT_SECRET') || 'changeme',
          issuer:   this.cfg.get<string>('JWT_ISS') || undefined,
          audience: this.cfg.get<string>('JWT_AUD') || undefined,
        });
      } catch (error) {
        this.logger.warn('Token verification failed', { error: error instanceof Error ? error.message : String(error) });
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isRefresh = payload?.type === 'refresh' || payload?.typ === 'refresh';
      if (!isRefresh || !payload?.sub) {
        throw new UnauthorizedException('Malformed refresh token');
      }

      const user = await this.prisma.user.findUnique({ 
        where: { id: payload.sub as string },
        include: {
          student: true,
          tutor: true,
        }
      });
      
      if (!user) {
        this.logger.warn('User not found during refresh', { userId: payload.sub });
        throw new UnauthorizedException('User not found');
      }

      if (user.deletedAt) {
        throw new UnauthorizedException('This account has been deleted');
      }

      // Only check internal access if email exists
      if (user.email) {
        try {
          this.ensureInternal(user.email);
        } catch (error) {
          // If ensureInternal throws, it's already an UnauthorizedException, just rethrow
          throw error;
        }
      }

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

      const readableAvatarUrl = user.avatarUrl
        ? await this.uploadsService.toReadableReference(user.avatarUrl, user.id, user.role ?? undefined)
        : user.avatarUrl;

      // Include user profile data in the response
      return { 
        access_token, 
        refresh_token: new_refresh,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: readableAvatarUrl,
          avatar: readableAvatarUrl,
          role: user.role,
          isDirector: user.isDirector,
          hasChosenRole: user.hasChosenRole,
          student: user.student,
          tutor: user.tutor,
        }
      };
    } catch (error) {
      // If it's already an HttpException, rethrow it
      if (error instanceof HttpException) {
        throw error;
      }
      // Log unexpected errors
      this.logger.error('Unexpected error in refresh', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new UnauthorizedException('Token refresh failed');
    }
  }

  // ======== Google OAuth (unified user, no persona auto-create) ========
  async findOrCreateGoogleUser(p: GoogleOAuthPayload) {
    if (!p.email) throw new BadRequestException('Google account has no email');

    this.ensureInternal(p.email);

    // 1) Check by provider ID
    const existingOauth = await this.prisma.oAuthAccount.findUnique({
      where: { providerUserId: p.providerUserId },
      include: { user: true },
    });
    if (existingOauth?.user) {
      if (existingOauth.user.deletedAt) {
        // Unlink the OAuth record from the deleted user so they can re-register
        await this.prisma.oAuthAccount.delete({
          where: { id: existingOauth.id },
        });
        // Fall through to create a new user below
      } else {
        return { user: existingOauth.user, isNew: false };
      }
    }

    // 2) Check by email → unify into same User row
    let user = await this.prisma.user.findUnique({
      where: { email: p.email.toLowerCase() },
    });

    // Block deleted accounts from re-registering via OAuth
    if (user?.deletedAt) {
      throw new UnauthorizedException('This account has been deleted');
    }

    const isNew = !user;
    if (!user) {
      // Create only the User row with hasChosenRole: false
      // Mark email as verified immediately — Google has already verified it
      user = await this.prisma.user.create({
        data: {
          email: p.email.toLowerCase(),
          name: p.name || p.email.split('@')[0],
          avatarUrl: null, // Profile pic comes from KYC selfie, not Google
          password: '',       // OAuth user (no password)
          role: null,         // No default role assigned
          hasChosenRole: false, // New users must choose a role
          emailVerifiedAt: p.emailVerified ? new Date() : null,
        },
      });
    } else {
      // Update existing user with name if not already set (don't overwrite avatar — it comes from KYC)
      if (!user.name && p.name) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { name: p.name },
        });
        user.name = p.name;
      }
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
    this.ensureInternal(user.email);
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
    // Check admin controls for role availability
    const controls = await this.adminControls.getPublicControls();
    if (role === 'STUDENT' && !controls.studentRoleEnabled) {
      throw new ForbiddenException('Student registration is currently disabled');
    }
    if (role === 'TUTOR' && !controls.tutorRoleEnabled) {
      throw new ForbiddenException('Tutor registration is currently disabled');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Ensure the corresponding profile exists using upsert
      if (role === 'STUDENT') {
        await tx.student.upsert({
          where: { userId },
          create: { userId, tokens: 0 },
          update: {},
        });
      } else if (role === 'TUTOR') {
        await tx.tutor.upsert({
          where: { userId },
          create: {
            userId,
            subjects: [],
            languages: [],
            hourlyRate: 0,
            status: 'PENDING',
            isTrending: false,
          },
          update: {},
        });
      }

      // Update user role
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          role,
          hasChosenRole: true,
        },
      });

      const next = role === 'TUTOR' ? '/tutor/dashboard' : '/student/dashboard';
      return { user, next };
    });

    // Send welcome email now that we know the chosen role (Google OAuth path only)
    this.notify.sendEmailVerifiedConfirmation({
      to: result.user.email,
      name: result.user.name ?? result.user.email.split('@')[0],
      role,
    }).catch((e) => this.logger.warn(`Welcome email failed (OAuth choose-role) for ${result.user.email}: ${e?.message}`));

    return result;
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
