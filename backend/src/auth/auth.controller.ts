import {
  Body, Controller, HttpCode, HttpStatus, Post, UseGuards, Req, Get, Res,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Role } from '@prisma/client';
import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';

class ForgotStartDto {
  @IsIn(['EMAIL', 'SMS']) channel!: 'EMAIL' | 'SMS';
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
}
class ForgotVerifyDto {
  @IsIn(['EMAIL', 'SMS']) channel!: 'EMAIL' | 'SMS';
  @IsString() target!: string;
  @IsString() @Length(4, 8) code!: string;
}
class ForgotCompleteDto {
  @IsString() resetToken!: string;
  @IsString() @Length(6, 200) newPassword!: string;
}
class ChooseRoleDto {
  @IsIn(['STUDENT', 'TUTOR']) role!: 'STUDENT' | 'TUTOR';
}
class RefreshDto {
  @IsString() refreshToken!: string;
}

@ApiTags('auth')
@Throttle({ default: { ttl: 60, limit: 20 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cfg: ConfigService,
  ) {}

  @ApiOperation({ summary: 'Register a new user' })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const email = dto.email?.toLowerCase().trim();
    const role: Role = dto.role ?? Role.STUDENT;
    return this.auth.register(email, dto.password, role);
  }

  @ApiOperation({ summary: 'Login and receive JWT' })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const email = dto.email?.toLowerCase().trim();
    return this.auth.login(email, dto.password);
  }

  @ApiOperation({ summary: 'Exchange refresh token for new access token' })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiOperation({ summary: 'Logout (invalidate current session)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Req() req: any) {
    await this.auth.logout(req.user.id);
    return { ok: true };
  }

  // ===== Forgot/Reset =====
  @Post('forgot/start')
  async forgotStart(@Body() dto: ForgotStartDto) {
    if (dto.channel === 'EMAIL' && !dto.email) {
      throw new BadRequestException('Email is required for EMAIL channel');
    }
    if (dto.channel === 'SMS' && !dto.phone) {
      throw new BadRequestException('Phone is required for SMS channel');
    }
    return this.auth.forgotStart(dto);
  }

  @Post('forgot/verify')
  async forgotVerify(@Body() dto: ForgotVerifyDto) {
    return this.auth.forgotVerify(dto);
  }

  @Post('forgot/complete')
  async forgotComplete(@Body() dto: ForgotCompleteDto) {
    return this.auth.forgotComplete(dto.resetToken, dto.newPassword);
  }

  // ===== Google OAuth (stateless) =====
  @Get('google/start')
  async googleStart(@Req() req: Request, @Res() res: Response) {
    const remember = req.query?.remember === '1' ? '1' : '0';
    const appUrl = this.cfg.get('APP_URL') || 'http://localhost:3000';
    res.cookie('remember_oauth', remember, {
      httpOnly: true, sameSite: 'lax', secure: false, maxAge: 5 * 60 * 1000, path: '/',
    });
    return res.redirect(`${appUrl}/auth/google`);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const payload = req.user as any;

    const { user } = await this.auth.findOrCreateGoogleUser({
      provider: 'google',
      providerUserId: payload.providerUserId,
      email: payload.email,
      name: payload.name,
      avatarUrl: payload.avatarUrl,
      emailVerified: payload.emailVerified,
    });

    const frontendBase = this.cfg.get('FRONTEND_URL') || 'http://localhost:5173';
    const successPath = this.cfg.get('AUTH_SUCCESS_REDIRECT') || '/auth-callback';

    const next = !user.hasChosenRole ? '/choose-role' :
      user.role === 'TUTOR' ? '/tutor/dashboard' :
      user.role === 'STUDENT' ? '/student/dashboard' : '/choose-role';

    const { accessToken, refreshToken } = await this.auth.issueTokensForOAuth({
      id: user.id,
      email: user.email,
      role: user.role ?? 'STUDENT',
    });

    const url = new URL(successPath, frontendBase);
    url.searchParams.set('access', accessToken);
    url.searchParams.set('refresh', refreshToken);
    url.searchParams.set('next', next);

    res.redirect(url.toString());
  }

  @ApiOperation({ summary: 'Choose persona after OAuth: STUDENT or TUTOR' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('choose-role')
  async chooseRole(@Req() req: any, @Body() dto: ChooseRoleDto) {
    const { next } = await this.auth.chooseRole(req.user.id, dto.role);
    return { ok: true, next };
  }
}
